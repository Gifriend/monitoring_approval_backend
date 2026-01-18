import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  Get,
  BadRequestException,
  Res,
  StreamableFile,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard';
import { ApprovalType, Division } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname, resolve } from 'path';
import type { Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';

// Helper untuk memastikan folder 'uploads' ada di root proyek
const ensureUploadsDir = () => {
  // path.resolve(process.cwd(), 'uploads') akan membuat path absolut
  // seperti /home/user/proyek-nestjs/uploads
  const uploadPath = resolve(process.cwd(), 'uploads');
  if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, { recursive: true });
  }
  return uploadPath;
};

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  // === UPLOAD & SUBMIT DOKUMEN ===
  @Post('submit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          const uploadPath = ensureUploadsDir();
          callback(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Request() req,
    @Body()
    body: {
      name: string;
      contractNumber?: string;
      contractDate?: string; // <--- Tambahkan ini (terima sebagai string dari FormData)
      documentType: string;
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!['protection', 'civil'].includes(body.documentType)) {
      throw new BadRequestException(
        'documentType must be either "protection" or "civil"',
      );
    }

    const filePath = `uploads/${file.filename}`;

    return this.documentService.submit(req.user.id, {
      name: body.name,
      filePath,
      contractNumber: body.contractNumber,
      // Konversi string tanggal dari FormData ke object Date
      // Jika kosong, gunakan null atau undefined
      contractDate: body.contractDate ? new Date(body.contractDate) : undefined,
      documentType: body.documentType as ApprovalType,
    });
  }

  // === RESUBMIT (upload ulang file revisi) ===
  @Patch(':id/resubmit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        //   PERBAIKAN: Simpan ke folder 'uploads' di root proyek
        destination: (req, file, callback) => {
          const uploadPath = ensureUploadsDir();
          callback(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  async resubmit(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required for resubmission');
    }
    const filePath = `uploads/${file.filename}`;
    return this.documentService.resubmitSimple(req.user.id, +id, filePath);
  }

  // === REVIEW HANDLERS ===
  @Patch(':id/dalkon-review')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: () => ensureUploadsDir(),
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `annotated-${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async dalkonReview(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    //   Debug logging untuk troubleshooting
    console.log(' [Dalkon] req.body =', req.body);
    console.log(' [Dalkon] file =', file?.originalname);

    // Take from req.body because using
    //
    FormData;
    const action = req.body?.action;
    const notes = req.body?.notes;

    // Parse annotations using try/catch
    let annotations: any[] | undefined;
    if (req.body?.annotations) {
      try {
        annotations = JSON.parse(req.body.annotations);
      } catch (error) {
        throw new BadRequestException('Invalid annotations JSON format');
      }
    }

    // Validate field
    if (!action) {
      throw new BadRequestException('Action is required');
    }

    return this.documentService.dalkonReview(
      req.user,
      +id,
      action,
      notes,
      annotations,
      file ? `uploads/${file.filename}` : undefined,
    );
  }

  // ENGINEERING REVIEW
  @Patch(':id/engineering-review')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: () => ensureUploadsDir(),
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `annotated-${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async engineeringReview(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    console.log('  [Engineering] req.body =', req.body);
    console.log('  [Engineering] file =', file?.originalname);

    // Take from req.body because using formdata
    const action = req.body?.action;
    const notes = req.body?.notes;

    // Parse annotations dengan try/catch
    let annotations: any[] | undefined;
    if (req.body?.annotations) {
      try {
        annotations = JSON.parse(req.body.annotations);
      } catch (error) {
        throw new BadRequestException('Invalid annotations JSON format');
      }
    }

    // Validasi field wajib
    if (!action) {
      throw new BadRequestException('Action is required');
    }

    return this.documentService.engineeringReview(
      req.user,
      +id,
      action,
      notes,
      annotations,
      file ? `uploads/${file.filename}` : undefined,
    );
  }

  // MANAGER REVIEW
  @Patch(':id/manager-review')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: () => ensureUploadsDir(),
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `annotated-${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async managerReview(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    //   Debug logging untuk troubleshooting
    console.log('  [Manager] req.body =', req.body);
    console.log('  [Manager] file =', file?.originalname);

    //   Ambil dari req.body langsung karena FormData
    const action = req.body?.action;
    const notes = req.body?.notes;

    //   Parse annotations dengan try/catch
    let annotations: any[] | undefined;
    if (req.body?.annotations) {
      try {
        annotations = JSON.parse(req.body.annotations);
      } catch (error) {
        throw new BadRequestException('Invalid annotations JSON format');
      }
    }

    //   Validasi field wajib
    if (!action) {
      throw new BadRequestException('Action is required');
    }

    return this.documentService.managerReview(
      req.user,
      +id,
      action,
      notes,
      annotations,
      file ? `uploads/${file.filename}` : undefined,
    );
  }

  @Patch(':id/resubmit-annotated')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: () => ensureUploadsDir(),
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `annotated-${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async resubmitAnnotated(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File required');
    const filePath = `uploads/${file.filename}`;
    // Pakai logic resubmit yang sudah ada
    return this.documentService.resubmitSimple(req.user.id, +id);
  }

  // === VENDOR REVIEW (SUBMIT REVISION) ===
  @Patch(':id/vendor-review')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: () => ensureUploadsDir(),
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `vendor-revision-${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async vendorReview(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    console.log('📤 [Vendor] req.body =', req.body);
    console.log('📄 [Vendor] file =', file?.originalname);

    // Validasi user adalah vendor
    if (req.user.division !== Division.Vendor) {
      throw new ForbiddenException('Only vendors can submit revisions');
    }

    // Validasi file wajib ada
    if (!file) {
      throw new BadRequestException('File is required for vendor revision');
    }

    const action = req.body?.action;

    // Parse annotations jika ada
    let annotations: any[] | undefined;
    if (req.body?.annotations) {
      try {
        annotations = JSON.parse(req.body.annotations);
      } catch (error) {
        throw new BadRequestException('Invalid annotations JSON format');
      }
    }

    // Untuk vendor, action harus 'submit_revision'
    if (action !== 'submit_revision') {
      throw new BadRequestException('Invalid action for vendor review');
    }

    const filePath = `uploads/${file.filename}`;

    // Call service method untuk resubmit
    return this.documentService.resubmitSimple(req.user.id, +id);
  }

  @Get('vendor/pending-correction')
  @UseGuards(JwtAuthGuard)
  async getVendorPendingCorrection(@Request() req) {
    return this.documentService.getVendorPendingCorrection(req.user);
  }

  // ✅ TAMBAHKAN endpoint baru khusus untuk file upload
  @Patch(':id/dalkon-review-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          const uploadPath = ensureUploadsDir();
          callback(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `dalkon-annotated-${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async dalkonReviewWithUpload(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log('📤 [Dalkon Review Upload] req.body =', req.body);
    console.log('📤 [Dalkon Review Upload] file =', file?.originalname);

    if (!file) {
      throw new BadRequestException('File is required for this endpoint');
    }

    const action = req.body?.action;
    const notes = req.body?.notes;

    if (!action) {
      throw new BadRequestException('Action is required');
    }

    return this.documentService.dalkonReview(
      req.user,
      +id,
      action,
      notes,
      undefined, // No annotations from JSON
      `uploads/${file.filename}`,
    );
  }

  @Patch(':id/engineering-review-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          const uploadPath = ensureUploadsDir();
          callback(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `engineer-annotated-${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async engineeringReviewWithUpload(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log('📤 [Engineering Review Upload] req.body =', req.body);
    console.log('📤 [Engineering Review Upload] file =', file?.originalname);

    if (!file) {
      throw new BadRequestException('File is required for this endpoint');
    }

    const action = req.body?.action;
    const notes = req.body?.notes;

    if (!action) {
      throw new BadRequestException('Action is required');
    }

    return this.documentService.engineeringReview(
      req.user,
      +id,
      action,
      notes,
      undefined,
      `uploads/${file.filename}`,
    );
  }

  @Patch(':id/manager-review-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          const uploadPath = ensureUploadsDir();
          callback(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `manager-annotated-${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async managerReviewWithUpload(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log('📤 [Manager Review Upload] req.body =', req.body);
    console.log('📤 [Manager Review Upload] file =', file?.originalname);

    if (!file) {
      throw new BadRequestException('File is required for this endpoint');
    }

    const action = req.body?.action;
    const notes = req.body?.notes;

    if (!action) {
      throw new BadRequestException('Action is required');
    }

    return this.documentService.managerReview(
      req.user,
      +id,
      action,
      notes,
      undefined,
      `uploads/${file.filename}`,
    );
  }

  // === GET HISTORY (DOKUMEN SELESAI) ===s
  @Get('history')
  async getHistory(@Request() req) {
    return this.documentService.getHistory(req.user);
  }

  // === GET ALL ACTIVE DOCUMENTS (DASHBOARD/INBOX) ===
  @Get()
  async getActiveDocuments(@Request() req) {
    return this.documentService.getActiveDocuments(req.user);
  }

  @Patch(':id/save-annotations')
  async saveAnnotations(
    @Param('id') id: string,
    @Body() body: { annotations: any[]; documentName: string },
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.documentService.saveAnnotations(
      userId,
      parseInt(id),
      body.annotations,
      body.documentName,
    );
  }

  // === GET DETAIL DOKUMEN (BESERTA SEMUA VERSI) ===
  @Get(':id')
  async getById(@Param('id') id: number, @Request() req) {
    return this.documentService.getById(+id, req.user);
  }

  // === GET FILE (ENDPOINT PREVIEW/DOWNLOAD) ===
  @UseGuards(JwtAuthGuard)
  @Get(':id/file')
  async getDocumentFile(
    @Param('id') id: string,
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Service akan memanggil path.resolve(process.cwd(), 'uploads/filename.pdf')
    // Ini sekarang sudah BENAR karena file ada di sana.
    const { filePath, fileName } = await this.documentService.getDocumentFile(
      +id,
      user,
    );

    const fileStream = createReadStream(filePath);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}.pdf"`,
    });

    return new StreamableFile(fileStream);
  }
}
