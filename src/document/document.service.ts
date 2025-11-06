import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// ✅ PENTING: Import Enums dari Prisma Client
import { ApprovalType, Division, Status } from '@prisma/client';

@Injectable()
export class DocumentService {
  constructor(private prisma: PrismaService) {}

  // === SUBMIT (v1) ===
  async submit(
    userId: number,
    data: {
      name: string;
      filePath: string;
      contractNumber?: string;
      documentType: ApprovalType;
    },
  ) {
    if (!userId) {
      throw new BadRequestException('Invalid user ID');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // ✅ FIX: Gunakan Enum
    if (user.division !== Division.Vendor)
      throw new ForbiddenException('Only vendors can submit documents');

    let contractId: string | undefined;
    if (data.contractNumber) {
      let contract = await this.prisma.contract.findUnique({
        where: { contractNumber: data.contractNumber },
      });

      if (!contract) {
        contract = await this.prisma.contract.create({
          data: {
            contractNumber: data.contractNumber,
            contractDate: new Date(),
          },
        });
      }
      contractId = contract.id;
    }

    return this.prisma.document.create({
      data: {
        name: data.name,
        filePath: data.filePath,
        documentType: data.documentType,
        contractId: contractId,
        submittedById: userId,
        status: Status.submitted, // ✅ FIX: Gunakan Enum
        progress: ['Submitted by vendor'],
        latestVersion: 1,
        versions: {
          create: {
            filePath: data.filePath,
            version: 1,
            uploadedById: userId,
          },
        },
      },
    });
  }

  // === DALKON REVIEW ===
  async dalkonReview(user: any, docId: number, action: string) {
    // ✅ FIX: Gunakan Enum
    if (user.division !== Division.Dalkon)
      throw new ForbiddenException('Only Dalkon can review');
    if (!user.id) {
      throw new BadRequestException('Invalid user ID in token');
    }
    const doc = await this.getDocument(docId);

    if (action === 'approve') {
      // ✅ FIX: Gunakan Enum
      if (doc.status === Status.submitted) {
        return this.updateStatus(
          docId,
          Status.inReviewEngineering, // ✅ FIX: Enum
          user.id,
          'Forwarded to Engineering',
        );
        // ✅ FIX: Gunakan Enum
      } else if (doc.status === Status.approvedWithNotes) {
        return this.updateStatus(
          docId,
          Status.inReviewManager, // ✅ FIX: Enum
          user.id,
          'Forwarded to Manager',
        );
      }
      throw new BadRequestException(
        'Document not in a state to be approved by Dalkon',
      );
    } else if (action === 'returnForCorrection') {
      return this.updateStatus(
        docId,
        Status.returnForCorrection, // ✅ FIX: Enum
        user.id,
        'Returned to Vendor',
      );
    } else if (action === 'reject') {
      return this.updateStatus(
        docId,
        Status.rejected, // ✅ FIX: Enum
        user.id,
        'Rejected by Dalkon',
      );
    }
    throw new BadRequestException('Invalid action');
  }

  // === ENGINEERING REVIEW ===
  async engineeringReview(
    user: any,
    docId: number,
    action: string,
    notes?: string,
  ) {
    // ✅ FIX: Gunakan Enum
    if (user.division !== Division.Engineer)
      throw new ForbiddenException('Only Engineer can review');
    if (!user.id) {
      throw new BadRequestException('Invalid user ID in token');
    }
    const doc = await this.getDocument(docId);
    // ✅ FIX: Gunakan Enum
    if (doc.status !== Status.inReviewEngineering) {
      throw new BadRequestException('Document is not ready for Engineering review');
    }

    if (action === 'approve') {
      return this.updateStatus(
        docId,
        Status.approved, // ✅ FIX: Enum
        user.id,
        'Approved by Engineer',
      );
    } else if (action === 'approveWithNotes') {
      return this.updateStatus(
        docId,
        Status.approvedWithNotes, // ✅ FIX: Enum
        user.id,
        notes || 'Approved with notes',
      );
    } else if (action === 'returnForCorrection') {
      return this.updateStatus(
        docId,
        Status.returnForCorrection, // ✅ FIX: Enum
        user.id,
        notes || 'Returned for correction',
      );
    }
    throw new BadRequestException('Invalid action');
  }

  // === MANAGER REVIEW ===
  async managerReview(user: any, docId: number, action: string) {
    // ✅ FIX: Gunakan Enum
    if (user.division !== Division.Manager)
      throw new ForbiddenException('Only Manager can review');
    if (!user.id) {
      throw new BadRequestException('Invalid user ID in token');
    }
    const doc = await this.getDocument(docId);
    // ✅ FIX: Gunakan Enum
    if (doc.status !== Status.inReviewManager) {
      throw new BadRequestException('Document is not ready for Manager review');
    }

    if (action === 'approve') {
      return this.updateStatus(
        docId,
        Status.approved, // ✅ FIX: Enum
        user.id,
        'Approved by Manager',
      );
    } else if (action === 'returnForCorrection') {
      return this.updateStatus(
        docId,
        Status.returnForCorrection, // ✅ FIX: Enum
        user.id,
        'Returned by Manager',
      );
    }
    throw new BadRequestException('Invalid action');
  }

  // === RESUBMIT VENDOR ===
  async resubmit(userId: number, docId: number, filePath: string) {
    if (!userId) {
      throw new BadRequestException('Invalid user ID');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // ✅ FIX: Gunakan Enum
    if (user.division !== Division.Vendor)
      throw new ForbiddenException('Only vendors can resubmit documents');

    const doc = await this.getDocument(docId);
    if (doc.submittedById !== userId) {
      throw new ForbiddenException('You did not submit this document');
    }
    // ✅ FIX: Gunakan Enum
    if (doc.status !== Status.returnForCorrection) {
      throw new BadRequestException(
        'Document cannot be resubmitted unless status is "returnForCorrection"',
      );
    }

    // ✅ FIX: Gunakan `latestVersion`
    const newVersion = doc.latestVersion + 1;

    return this.prisma.document.update({
      where: { id: docId },
      data: {
        filePath,
        latestVersion: newVersion,
        status: Status.submitted, // ✅ FIX: Enum
        reviewedById: null,
        progress: {
          push: 'Resubmitted by vendor',
        },
        versions: {
          create: {
            filePath: filePath,
            version: newVersion,
            uploadedById: userId,
          },
        },
      },
    });
  }

  // === GET ACTIVE DOCUMENTS (INBOX/DASHBOARD) ===
  async getActiveDocuments(user: any) {
    const userDivision = user.division;
    const userId = user.id;

    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    // ✅ FIX: Gunakan Enum
    const finishedStatuses = [
      Status.approved,
      Status.approvedWithNotes,
      Status.rejected,
    ];

    const baseWhere: any = {
      status: { notIn: finishedStatuses },
    };

    const includePayload = {
      submittedBy: { select: { id: true, name: true } },
      contract: { select: { contractNumber: true } },
      approvals: {
        orderBy: { createdAt: 'desc' as const }, // ✅ FIX: `as const`
        take: 1,
        include: { approvedBy: { select: { id: true, name: true } } },
      },
    };

    // ✅ FIX: Gunakan Enum
    if (userDivision === Division.Vendor) {
      baseWhere.submittedById = userId;
      return this.prisma.document.findMany({
        where: baseWhere,
        include: includePayload,
        orderBy: { updatedAt: 'desc' },
      });
    }

    // ✅ FIX: Gunakan Enum
    if (userDivision === Division.Dalkon) {
      return this.prisma.document.findMany({
        where: baseWhere,
        include: includePayload,
        orderBy: { updatedAt: 'desc' },
      });
    }

    // ✅ FIX: Gunakan Enum
    if (userDivision === Division.Engineer) {
      baseWhere.status = Status.inReviewEngineering;
      return this.prisma.document.findMany({
        where: baseWhere,
        include: includePayload,
        orderBy: { updatedAt: 'desc' },
      });
    }

    // ✅ FIX: Gunakan Enum
    if (userDivision === Division.Manager) {
      baseWhere.status = Status.inReviewManager;
      return this.prisma.document.findMany({
        where: baseWhere,
        include: includePayload,
        orderBy: { updatedAt: 'desc' },
      });
    }

    throw new ForbiddenException('Division not permitted to view this list');
  }

  // === GET HISTORY (HANYA DOKUMEN SELESAI) ===
  async getHistory(user: any) {
    const userDivision = user.division;
    const userId = user.id;

    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    // ✅ FIX: Gunakan Enum
    const finishedStatuses = [
      Status.approved,
      Status.approvedWithNotes,
      Status.rejected,
    ];

    // ✅ FIX: Gunakan Enum
    if (userDivision === Division.Vendor) {
      return this.prisma.document.findMany({
        where: {
          submittedById: user.id,
          status: { in: finishedStatuses },
        },
        include: {
          approvals: {
            orderBy: { createdAt: 'desc' }, // ✅ FIX: Hapus `as const`
            include: {
              approvedBy: {
                select: { id: true, name: true },
              },
            },
          },
          contract: {
            select: { contractNumber: true },
          },
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // ✅ FIX: Gunakan Enum
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
            orderBy: { createdAt: 'desc' }, // ✅ FIX: Hapus `as const`
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
            select: { contractNumber: true },
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
          orderBy: { createdAt: 'asc' }, // ✅ FIX
          include: { approvedBy: { select: { id: true, name: true } } },
        },
        versions: {
          orderBy: { version: 'asc' }, // ✅ FIX
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
        submittedBy: { select: { id: true, name: true, email: true } },
        contract: { select: { contractNumber: true } },
      },
    });

    if (!doc) throw new NotFoundException('Document not found');

    // Otorisasi
    // ✅ FIX: Gunakan Enum
    if (user.division === Division.Vendor && doc.submittedById !== user.id) {
      throw new ForbiddenException('You are not authorized to view this document');
    }

    // ✅ FIX: Gunakan Enum
    if (
      ![
        Division.Vendor,
        Division.Dalkon,
        Division.Engineer,
        Division.Manager,
      ].includes(user.division)
    ) {
      throw new ForbiddenException('You are not authorized to view this document');
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
    status: Status, // ✅ FIX: Gunakan Enum
    reviewerId: number,
    notes?: string,
  ) {
    if (!reviewerId) {
      throw new BadRequestException('Reviewer ID is invalid');
    }

    const doc = await this.getDocument(docId);
    const newProgress = notes || `Status updated to ${status}`;

    return this.prisma.document.update({
      where: { id: docId },
      data: {
        status,
        reviewedById: reviewerId,
        progress: {
          push: newProgress,
        },
        approvals: {
          create: {
            status,
            approvedById: reviewerId,
            type: doc.documentType || ApprovalType.civil, // ✅ FIX: Enum
            notes,
            deadline: new Date(new Date().setDate(new Date().getDate() + 7)),
          },
        },
      },
      include: { approvals: true },
    });
  }
}