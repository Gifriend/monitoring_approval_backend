import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { ApprovalType, Division, Status } from '@prisma/client';
import { PDFDocument, rgb } from 'pdf-lib';

@Injectable()
export class DocumentService {
  constructor(private prisma: PrismaService) {}

  // Helper method to merge annotations to PDF
  private async mergeAnnotationsToPdf(
    documentId: number,
    annotations: any[],
  ): Promise<string> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const filePath = path.join(
      process.cwd(),
      'uploads',
      path.basename(document.filePath),
    );

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found on server');
    }

    const existingPdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();

    // Process annotations
    for (const ann of annotations) {
      const page = pages[ann.page - 1];
      if (!page) continue;

      const { width, height } = page.getSize();

      if (ann.type === 'draw' && ann.path) {
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        ctx.lineWidth = ann.thickness || 4;
        ctx.strokeStyle = ann.color || '#ff0000';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        ann.path.forEach((p: any, i: number) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        const pngImage = await pdfDoc.embedPng(canvas.toDataURL());
        page.drawImage(pngImage, { x: 0, y: 0, width, height });
      } else if (ann.type === 'text' && ann.text && ann.position) {
        const rgbColor = this.hexToRgb(ann.color || '#000000');
        page.drawText(ann.text, {
          x: ann.position.x,
          y: height - ann.position.y,
          size: ann.fontSize || 20,
          color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
        });
      } else if (ann.type === 'stamp' && ann.stampImage && ann.position) {
        const base64Data = ann.stampImage.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');

        let stampImg;
        if (ann.stampImage.includes('image/png')) {
          stampImg = await pdfDoc.embedPng(imageBuffer);
        } else {
          stampImg = await pdfDoc.embedJpg(imageBuffer);
        }

        page.drawImage(stampImg, {
          x: ann.position.x,
          y: height - ann.position.y - (ann.height || 100),
          width: ann.width || 100,
          height: ann.height || 100,
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    const newFilename = `annotated-${Date.now()}-${path.basename(
      document.filePath,
    )}`;
    const newFilePath = path.join(process.cwd(), 'uploads', newFilename);

    fs.writeFileSync(newFilePath, pdfBytes);

    return `uploads/${newFilename}`;
  }

  // === SUBMIT (v1) ===
  async submit(
    userId: number,
    data: {
      name: string;
      filePath: string;
      contractNumber?: string; 
      contractDate?: Date;
      documentType: ApprovalType;
    },
  ) {
    if (!userId) {
      throw new BadRequestException('Invalid user ID');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.division !== Division.Vendor)
      throw new ForbiddenException('Only vendors can submit documents');

    let contractId: string | undefined;
    if (data.contractNumber) {
      let contract = await this.prisma.contract.findUnique({
        where: { contractNumber: data.contractNumber },
      });

      // Jika kontrak belum ada, buat baru
      if (!contract) {
        contract = await this.prisma.contract.create({
          data: {
            contractNumber: data.contractNumber,
            // Gunakan tanggal dari input user, jika tidak ada pakai tanggal sekarang
            contractDate: data.contractDate || new Date(), 
          },
        });
      } 
      // OPSI TAMBAHAN: Jika ingin update tanggal kontrak jika kontrak sudah ada:
      // else if (data.contractDate) {
      //    await this.prisma.contract.update({
      //       where: { id: contract.id },
      //       data: { contractDate: data.contractDate }
      //    });
      // }
      contractId = contract.id;
    }

    return this.prisma.document.create({
      data: {
        name: data.name,
        filePath: data.filePath,
        documentType: data.documentType,
        contractId: contractId,
        submittedById: userId,
        status: Status.submitted,
        progress: ['Submitted by vendor'],
        latestVersion: 100,
        versions: {
          create: {
            filePath: data.filePath,
            version: 100,
            uploadedById: userId,
          },
        },
      },
    });
  }

  private async saveReviewerAnnotation(
    docId: number,
    filePath: string,
    uploadedById: number,
    reviewerDivision: 'Dalkon' | 'Engineer' | 'Manager',
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      select: { latestVersion: true },
    });

    if (!doc) throw new NotFoundException('Document not found');

    const annotationVersion = doc.latestVersion + 100; // 3 → 103, 4 → 104, dst

    await this.prisma.documentVersion.create({
      data: {
        documentId: docId,
        filePath,
        version: annotationVersion,
        uploadedById,
      },
    });
  }

  private async createAnnotationVersion(
    docId: number,
    filePath: string,
    uploadedById: number,
    notes?: string,
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      select: { latestVersion: true },
    });

    const annotationVersion = doc!.latestVersion + 100; // Just for tracking

    return this.prisma.documentVersion.create({
      data: {
        documentId: docId,
        filePath,
        version: annotationVersion,
        uploadedById,
      },
    });
  }

  // === DALKON REVIEW ===
  async dalkonReview(
    user: any,
    docId: number,
    action: string,
    notes?: string,
    annotations?: any[],
    uploadedFilePath?: string, // <--- File dari endpoint upload masuk sini
  ) {
    if (user.division !== Division.Dalkon)
      throw new ForbiddenException('Only Dalkon');

    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException();

    // 1. Tentukan File Path Final
    // Jika ada file upload, pakai itu. Jika tidak, cek anotasi.
    let finalFilePath: string | undefined = uploadedFilePath;

    if (!finalFilePath && annotations && annotations.length > 0) {
      finalFilePath = await this.mergeAnnotationsToPdf(docId, annotations);
    }

    let newStatus: Status;
    let logMessage = '';

    // 2. Logika Status (Sama seperti sebelumnya)
    if (action === 'approve') {
      if (doc.status === Status.submitted && !doc.returnRequestedBy) {
        newStatus = Status.inReviewEngineering;
        logMessage = notes || 'Dalkon forwarded to Engineering';
      } else if (
        doc.status === Status.submitted &&
        doc.returnRequestedBy === Division.Engineer
      ) {
        newStatus = Status.returnForCorrection;
        logMessage = notes || 'Dalkon confirmed Engineer return';
      } else if (
        doc.status === Status.submitted &&
        doc.returnRequestedBy === Division.Manager
      ) {
        newStatus = Status.returnForCorrection;
        logMessage = notes || 'Dalkon confirmed Manager return';
      } else if (doc.status === Status.approved) {
        newStatus = Status.inReviewManager;
        logMessage = notes || 'Dalkon forwarded to Manager';
      } else if (doc.status === Status.inReviewConsultant) {
        newStatus = Status.approved;
        logMessage = notes || 'Final approval by Dalkon';
      } else if (doc.status === Status.approvedWithNotes) {
        newStatus = Status.inReviewManager;
        logMessage = notes || 'Dalkon forwarded to Manager (with notes)';
      } else {
        throw new BadRequestException(
          `Invalid status for Dalkon approve: ${doc.status}`,
        );
      }
    } else if (action === 'returnForCorrection') {
      newStatus = Status.returnForCorrection;
      logMessage = notes || 'Returned by Dalkon for correction';
    } else if (action === 'reject') {
      if (doc.status !== Status.submitted) {
        throw new BadRequestException(
          'Dalkon can only reject at submitted stage',
        );
      }
      newStatus = Status.rejected;
      logMessage = notes || 'Rejected by Dalkon';
    } else {
      throw new BadRequestException('Invalid action');
    }

    // 3. Siapkan Data Update
    const updateData: any = {
      status: newStatus,
      reviewedById: user.id,
      returnRequestedBy:
        action === 'returnForCorrection' ? Division.Dalkon : null,
      progress: { push: logMessage },
    };

    // 🔥 PENTING: Jika ada file baru (dari upload/anotasi), update kolom filePath utama
    if (finalFilePath) {
      updateData.filePath = finalFilePath;
    }

    // 4. Eksekusi Update ke Database
    const updated = await this.prisma.document.update({
      where: { id: docId },
      data: updateData,
    });

    // 5. Simpan History Version (Agar file revisi tercatat di history)
    if (finalFilePath) {
      await this.saveReviewerAnnotation(
        docId,
        finalFilePath,
        user.id,
        Division.Dalkon,
      );
    }

    return updated;
  }

  // === ENGINEERING REVIEW ===
  async engineeringReview(
    user: any,
    docId: number,
    action: string,
    notes?: string,
    annotations?: any[],
    uploadedFilePath?: string, // <--- File dari endpoint upload masuk sini
  ) {
    if (user.division !== Division.Engineer)
      throw new ForbiddenException('Only Engineer');

    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException();

    if (
      doc.status !== Status.inReviewEngineering &&
      doc.status !== Status.submitted
    ) {
      throw new BadRequestException(
        `Document cannot be reviewed by Engineer at status: ${doc.status}`,
      );
    }

    // 1. Tentukan File Path Final
    let finalFilePath: string | undefined = uploadedFilePath;

    if (!finalFilePath && annotations && annotations.length > 0) {
      finalFilePath = await this.mergeAnnotationsToPdf(docId, annotations);
    }

    let newStatus: Status;
    let logMessage = '';

    // 2. Logika Status
    switch (action) {
      case 'approve':
        newStatus = Status.approved;
        logMessage = notes || 'Approved by Engineer';
        break;
      case 'approveWithNotes':
        newStatus = Status.approvedWithNotes;
        logMessage = notes || 'Approved with notes by Engineer';
        break;
      case 'returnForCorrection':
        newStatus = Status.submitted;
        logMessage = notes || 'Returned by Engineer';
        break;
      default:
        throw new BadRequestException('Invalid action');
    }

    // 3. Siapkan Data Update
    const updateData: any = {
      status: newStatus,
      reviewedById: user.id,
      returnRequestedBy:
        action === 'returnForCorrection' ? Division.Engineer : undefined,
      progress: { push: logMessage },
    };

    // 🔥 PENTING: Update filePath utama jika ada file baru
    if (finalFilePath) {
      updateData.filePath = finalFilePath;
    }

    // 4. Update Database
    const updated = await this.prisma.document.update({
      where: { id: docId },
      data: updateData,
    });

    // 5. Simpan History
    if (finalFilePath) {
      await this.saveReviewerAnnotation(
        docId,
        finalFilePath,
        user.id,
        Division.Engineer,
      );
    }

    return updated;
  }

  // === MANAGER REVIEW ===
  async managerReview(
    user: any,
    docId: number,
    action: string,
    notes?: string,
    annotations?: any[],
    uploadedFilePath?: string, // <--- File dari endpoint upload masuk sini
  ) {
    if (user.division !== Division.Manager)
      throw new ForbiddenException('Only Manager');

    const doc = await this.prisma.document.findUnique({ where: { id: docId } });

    if (!doc || doc.status !== Status.inReviewManager)
      throw new BadRequestException('Document not in manager review stage');

    // 1. Tentukan File Path Final
    let finalFilePath: string | undefined = uploadedFilePath;

    if (!finalFilePath && annotations && annotations.length > 0) {
      finalFilePath = await this.mergeAnnotationsToPdf(docId, annotations);
    }

    let newStatus: Status;
    let logMessage = '';

    // 2. Logika Status
    if (action === 'approve') {
      newStatus = Status.inReviewConsultant;
      logMessage = notes || 'Approved by Manager';
    } else if (action === 'returnForCorrection') {
      newStatus = Status.submitted;
      logMessage = notes || 'Returned by Manager';
    } else {
      throw new BadRequestException('Invalid action');
    }

    // 3. Siapkan Data Update
    const updateData: any = {
      status: newStatus,
      reviewedById: user.id,
      returnRequestedBy:
        action === 'returnForCorrection' ? Division.Manager : undefined,
      progress: { push: logMessage },
    };

    // 🔥 PENTING: Update filePath utama
    if (finalFilePath) {
      updateData.filePath = finalFilePath;
    }

    // 4. Update Database
    const updated = await this.prisma.document.update({
      where: { id: docId },
      data: updateData,
    });

    // 5. Simpan History
    if (finalFilePath) {
      await this.saveReviewerAnnotation(
        docId,
        finalFilePath,
        user.id,
        Division.Manager,
      );
    }

    return updated;
  }

  // === RESUBMIT VENDOR ===
  async resubmitSimple(userId: number, docId: number, filePath?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.division !== Division.Vendor) {
      throw new ForbiddenException('Only vendors can resubmit documents');
    }

    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      select: {
        id: true,
        submittedById: true,
        status: true,
        latestVersion: true,
        filePath: true,
      },
    });

    if (!doc) throw new NotFoundException('Document not found');

    if (doc.submittedById !== userId) {
      throw new ForbiddenException('You did not submit this document');
    }

    if (doc.status !== Status.returnForCorrection) {
      throw new BadRequestException(
        'Document cannot be resubmitted unless status is "returnForCorrection"',
      );
    }

    // ✅ Gunakan file yang sudah di-update dari saveAnnotations
    // Tidak perlu create version baru karena file sudah ter-merge
    return this.prisma.document.update({
      where: { id: docId },
      data: {
        status: Status.submitted,
        filePath: filePath || doc.filePath, // Use new file if provided
        latestVersion: doc.latestVersion + 1,
        progress: {
          push: `Vendor: Resubmitted with annotations (v${doc.latestVersion})`,
        },
      },
    });
  }

  // === GET ACTIVE DOCUMENTS (INBOX/DASHBOARD) ===
  async getActiveDocuments(user: any) {
    const finished = [
      Status.approved,
      Status.approvedWithNotes,
      Status.rejected,
    ];

    //   VENDOR - Lihat dokumen yang masih dalam proses
    if (user.division === Division.Vendor) {
      return this.prisma.document.findMany({
        where: {
          submittedById: user.id,
          OR: [
            { status: { notIn: finished } },
            {
              status: Status.returnForCorrection,
              returnRequestedBy: Division.Dalkon,
            },
          ],
        },
        include: {
          submittedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true, division: true } },
          contract: { select: { contractNumber: true, contractDate: true } },
          approvals: { take: 1, orderBy: { createdAt: 'desc' } },
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    //   DALKON - Lihat dokumen yang perlu action (exclude final approved)
    if (user.division === Division.Dalkon) {
      const dalkonUsers = await this.prisma.user.findMany({
        where: { division: Division.Dalkon },
        select: { id: true },
      });
      const dalkonUserIds = dalkonUsers.map((u) => u.id);

      return this.prisma.document.findMany({
        where: {
          status: {
            notIn: [Status.rejected],
          },
          OR: [
            {
              //   Semua dokumen submitted (dari Vendor atau dikembalikan dari Engineer/Manager)
              status: Status.submitted,
            },
            {
              // Approved dari Engineer (bukan final approval Dalkon)
              AND: [
                { status: Status.approved },
                { reviewedById: { notIn: dalkonUserIds } },
              ],
            },
            {
              // ApprovedWithNotes dari Engineer
              AND: [
                { status: Status.approvedWithNotes },
                { reviewedById: { notIn: dalkonUserIds } },
              ],
            },
            { status: Status.inReviewConsultant }, // Dari Manager, perlu final approval
            { status: Status.inReviewEngineering }, // Monitoring Engineer
            { status: Status.inReviewManager }, // Monitoring Manager
          ],
        },
        include: {
          submittedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true, division: true } },
          contract: { select: { contractNumber: true, contractDate: true } },
          approvals: { take: 1, orderBy: { createdAt: 'desc' } },
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    //   ENGINEER - Just see dokumen that in-review Engineering
    if (user.division === Division.Engineer) {
      return this.prisma.document.findMany({
        where: {
          status: Status.inReviewEngineering,
        },
        include: {
          submittedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true, division: true } },
          contract: { select: { contractNumber: true, contractDate: true } },
          approvals: { take: 1, orderBy: { createdAt: 'desc' } },
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    //   MANAGER - Hanya lihat dokumen yang sedang di-review Manager
    if (user.division === Division.Manager) {
      return this.prisma.document.findMany({
        where: {
          status: Status.inReviewManager,
        },
        include: {
          submittedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true, division: true } },
          contract: { select: { contractNumber: true, contractDate: true } },
          approvals: { take: 1, orderBy: { createdAt: 'desc' } },
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    throw new ForbiddenException('Division not permitted to view documents');
  }

  async getVendorPendingCorrection(user: any) {
    if (user.division !== Division.Vendor) {
      throw new ForbiddenException('Only vendors can access this');
    }

    return this.prisma.document.findMany({
      where: {
        submittedById: user.id,
        status: Status.returnForCorrection,
      },
      include: {
        submittedBy: { select: { id: true, name: true } },
        contract: { select: { contractNumber: true, contractDate: true } },
        approvals: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { approvedBy: { select: { name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateDocumentFile(userId: number, docId: number, filePath: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      select: {
        id: true,
        latestVersion: true,
        submittedById: true,
        status: true,
      },
    });

    if (!doc) throw new NotFoundException('Document not found');

    // Cek otorisasi
    const isReviewer = (
      [Division.Dalkon, Division.Engineer, Division.Manager] as Division[]
    ).includes(user.division);
    const isOwner =
      user.division === Division.Vendor && doc.submittedById === userId;

    if (!isReviewer && !isOwner) {
      throw new ForbiddenException('Not authorized to update this document');
    }

    // Buat versi baru dengan nomor yang sama (overwrite preview)
    const newVersion = doc.latestVersion;

    // Update document dengan file baru
    return this.prisma.document.update({
      where: { id: docId },
      data: {
        filePath,
        progress: {
          push: `File updated by ${user.division}`,
        },
        versions: {
          create: {
            filePath: filePath,
            version: newVersion + 1, // 1.1, 2.1, dst untuk preview
            uploadedById: userId,
          },
        },
      },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 5 },
        submittedBy: { select: { id: true, name: true } },
      },
    });
  }

  async saveAnnotations(
    userId: number,
    docId: number,
    annotations: any[],
    documentName: string,
  ) {
    // 1. Find user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Find document
    const document = await this.prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // 3. ✅ VALIDASI OTORISASI
    const isReviewer =
      user.division === Division.Dalkon ||
      user.division === Division.Engineer ||
      user.division === Division.Manager;
    const isOwner =
      user.division === Division.Vendor && document.submittedById === userId;

    if (!isReviewer && !isOwner) {
      throw new ForbiddenException(
        'You are not authorized to edit this document',
      );
    }

    // 4. ✅ VALIDASI STATUS UNTUK VENDOR
    if (
      user.division === Division.Vendor &&
      document.status !== Status.returnForCorrection
    ) {
      throw new BadRequestException(
        'Vendor can only save annotations on documents with status "returnForCorrection"',
      );
    }

    // 5. Read existing PDF file
    // Handle both absolute and relative paths
    let filePath: string;
    if (path.isAbsolute(document.filePath)) {
      // Path sudah absolute (e.g., D:\...\uploads\file.pdf)
      filePath = document.filePath;
    } else {
      // Path relative (e.g., uploads/file.pdf)
      const normalizedPath = document.filePath.startsWith('/')
        ? document.filePath.slice(1)
        : document.filePath;
      filePath = path.resolve(process.cwd(), normalizedPath);
    }

    console.log('🔍 [saveAnnotations] Looking for file at:', filePath);

    if (!fs.existsSync(filePath)) {
      console.error('❌ File not found:', filePath);
      console.error('   document.filePath from DB:', document.filePath);
      console.error('   process.cwd():', process.cwd());
      throw new NotFoundException('File not found on server');
    }

    const existingPdfBytes = fs.readFileSync(filePath);

    // 6. Load PDF with pdf-lib
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();

    // 7. Process annotations
    for (const ann of annotations) {
      const page = pages[ann.page - 1];
      if (!page) continue;

      const { width, height } = page.getSize();

      if (ann.type === 'draw' && ann.path) {
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        ctx.lineWidth = ann.thickness || 4;
        ctx.strokeStyle = ann.color || '#ff0000';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        ann.path.forEach((p: any, i: number) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        const pngImage = await pdfDoc.embedPng(canvas.toDataURL());
        page.drawImage(pngImage, { x: 0, y: 0, width, height });
      } else if (ann.type === 'text' && ann.text && ann.position) {
        const rgbColor = this.hexToRgb(ann.color || '#000000');
        page.drawText(ann.text, {
          x: ann.position.x,
          y: height - ann.position.y,
          size: ann.fontSize || 20,
          color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
        });
      } else if (ann.type === 'stamp' && ann.stampImage && ann.position) {
        const base64Data = ann.stampImage.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');

        let stampImg;
        if (ann.stampImage.includes('image/png')) {
          stampImg = await pdfDoc.embedPng(imageBuffer);
        } else {
          stampImg = await pdfDoc.embedJpg(imageBuffer);
        }

        page.drawImage(stampImg, {
          x: ann.position.x,
          y: height - ann.position.y - (ann.height || 100),
          width: ann.width || 100,
          height: ann.height || 100,
        });
      }
    }

    // 8. Save modified PDF
    const pdfBytes = await pdfDoc.save();
    const newFilename = `annotated-${Date.now()}-${path.basename(
      document.filePath,
    )}`;
    const newFilePath = path.join(process.cwd(), 'uploads', newFilename);

    fs.writeFileSync(newFilePath, pdfBytes);

    // 9. ✅ PERBAIKAN: Update dengan RELATIVE PATH
    const relativeFilePath = `uploads/${newFilename}`;

    await this.prisma.document.update({
      where: { id: docId },
      data: {
        filePath: relativeFilePath, // ✅ Simpan relative path (FIXED!)
        updatedAt: new Date(),
        progress: {
          push: `Annotations saved by ${user.division}`,
        },
      },
    });

    console.log('✅ Annotations saved successfully:', {
      docId,
      userId,
      division: user.division,
      relativePath: relativeFilePath,
      absolutePath: newFilePath,
    });

    return {
      message: 'Annotations saved successfully',
      filePath: relativeFilePath,
    };
  }

  // Helper function to convert hex color to RGB
  private hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255,
        }
      : { r: 0, g: 0, b: 0 };
  }

  // === GET HISTORY (HANYA DOKUMEN SELESAI) ===
  async getHistory(user: any) {
    const userDivision = user.division;
    const userId = user.id;

    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    const finishedStatuses = [
      Status.approved,
      Status.approvedWithNotes,
      Status.rejected,
    ];

    if (userDivision === Division.Vendor) {
      return this.prisma.document.findMany({
        where: {
          submittedById: user.id,
          status: { in: finishedStatuses },
        },
        include: {
          submittedBy: { select: { id: true, name: true } },
          approvals: {
            orderBy: { createdAt: 'desc' },
            include: {
              approvedBy: {
                select: { id: true, name: true },
              },
            },
          },
          contract: {
            select: { contractNumber: true, contractDate: true },
          },
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (
      [Division.Dalkon, Division.Engineer, Division.Manager].includes(
        userDivision,
      )
    ) {
      return this.prisma.document.findMany({
        where: {
          status: { in: finishedStatuses },
          OR: [
            { reviewedById: user.id },
            { approvals: { some: { approvedById: user.id } } },
          ],
        },
        include: {
          approvals: {
            orderBy: { createdAt: 'desc' },
            include: {
              approvedBy: {
                select: { id: true, name: true },
              },
            },
          },
          submittedBy: {
            select: { id: true, name: true, email: true },
          },
          contract: {
            select: { contractNumber: true, contractDate: true },
          },
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
    throw new ForbiddenException('Division not permitted to view history');
  }

  // === GET BY ID ===
  async getById(docId: number, user: any) {
    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        approvals: {
          orderBy: { createdAt: 'asc' },
          include: { approvedBy: { select: { id: true, name: true } } },
        },
        versions: {
          orderBy: { version: 'asc' },
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
        submittedBy: { select: { id: true, name: true, email: true } },
        contract: { select: { contractNumber: true, contractDate: true } },
      },
    });

    if (!doc) throw new NotFoundException('Document not found');

    // Otorisasi
    if (user.division === Division.Vendor && doc.submittedById !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to view this document',
      );
    }

    if (
      !(
        [
          Division.Vendor,
          Division.Dalkon,
          Division.Engineer,
          Division.Manager,
        ] as Division[]
      ).includes(user.division)
    ) {
      throw new ForbiddenException(
        'You are not authorized to view this document',
      );
    }

    return doc;
  }

  // === Helpers ===
  private async getDocument(docId: number) {
    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  private async updateStatus(
    docId: number,
    status: Status,
    reviewerId: number,
    notes?: string,
    returnRequestedBy?: Division,
  ) {
    const updateData: any = {
      status,
      reviewedById: reviewerId,
      progress: { push: notes || `Status: ${status}` },
    };

    if (status === Status.returnForCorrection) {
      updateData.returnRequestedBy = returnRequestedBy || null;
    }

    return this.prisma.document.update({
      where: { id: docId },
      data: updateData,
      include: { approvals: true, versions: true },
    });
  }

  // === GET FILE (BARU) ===
  async getDocumentFile(docId: number, user: any) {
    // 1. Ambil data dokumen (termasuk otorisasi)
    const doc = await this.getById(docId, user);

    if (!doc.filePath) {
      throw new NotFoundException('Document does not have a file path');
    }

    let filePath: string;

    let normalizedPath = doc.filePath;

    if (normalizedPath.startsWith('/') || normalizedPath.startsWith('\\')) {
      normalizedPath = normalizedPath.slice(1);
    }

    // Check if it's a Windows absolute path (has drive letter like D:\)
    if (path.isAbsolute(normalizedPath) && /^[a-zA-Z]:/.test(normalizedPath)) {
      // Already absolute Windows path
      filePath = normalizedPath;
    } else {
      // Relative path - resolve from project root
      filePath = path.resolve(process.cwd(), normalizedPath);
    }

    console.log('🔍 [getDocumentFile] Looking for file at:', filePath);

    // 3. Cek apakah file ada
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found at path: ${filePath}`);
      console.error(`   process.cwd() is: ${process.cwd()}`);
      console.error(`   doc.filePath from DB is: ${doc.filePath}`);
      throw new NotFoundException('File not found on server. Check logs.');
    }

    // 4. Kembalikan path dan nama file
    return {
      filePath,
      fileName: doc.name,
    };
  }

  async getDocumentFileForUser(docId: number, user: any) {
    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      select: { filePath: true, name: true, submittedById: true },
    });

    if (!doc || !doc.filePath) {
      throw new NotFoundException('Dokumen atau file tidak ditemukan');
    }

    // if (user.division === Division.Vendor && doc.submittedById !== user.id) {
    //   throw new ForbiddenException('Akses ditolak');
    // }

    return {
      filePath: doc.filePath,
      fileName: doc.name || `document-${docId}`,
    };
  }
}
