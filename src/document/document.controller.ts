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
import { ApprovalType } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname, resolve } from 'path';
import { Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs'; // <-- Import 'fs' helpers

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
        // ✅ PERBAIKAN: Simpan ke folder 'uploads' di root proyek
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

    // Path ini (relatif) sudah benar untuk disimpan di DB
    // Service akan menggabungkannya dengan process.cwd()
    const filePath = `uploads/${file.filename}`;
    return this.documentService.submit(req.user.id, {
      name: body.name,
      filePath,
      contractNumber: body.contractNumber,
      documentType: body.documentType as ApprovalType,
    });
  }

  // === RESUBMIT (upload ulang file revisi) ===
  @Patch(':id/resubmit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        // ✅ PERBAIKAN: Simpan ke folder 'uploads' di root proyek
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
    return this.documentService.resubmit(req.user.id, +id, filePath);
  }

  // === REVIEW HANDLERS ===
  @Patch(':id/dalkon-review')
  async dalkonReview(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { 
      action: string; 
      notes?: string;
      annotations?: any[];
    },
  ) {
    return this.documentService.dalkonReview(
      req.user,
      +id,
      body.action,
      body.notes,
      body.annotations,
    );
  }

  // ENGINEERING REVIEW
  @Patch(':id/engineering-review')
  async engineeringReview(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { 
      action: string; 
      notes?: string;
      annotations?: any[];
    },
  ) {
    return this.documentService.engineeringReview(
      req.user,
      +id,
      body.action,
      body.notes,
      body.annotations,
    );
  }

  // MANAGER REVIEW
  @Patch(':id/manager-review')
  async managerReview(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { 
      action: string; 
      notes?: string;
      annotations?: any[];
    },
  ) {
    return this.documentService.managerReview(
      req.user,
      +id,
      body.action,
      body.notes,
      body.annotations,
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
    return this.documentService.resubmit(req.user.id, +id, filePath);
  }

  @Get('vendor/pending-correction')
  @UseGuards(JwtAuthGuard)
  async getVendorPendingCorrection(@Request() req) {
    return this.documentService.getVendorPendingCorrection(req.user);
  }

  // === GET HISTORY (DOKUMEN SELESAI) ===
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

