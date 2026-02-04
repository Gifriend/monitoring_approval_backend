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
import { SupabaseService } from '../supabase/supabase.service';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard';
import { ApprovalType, Division } from '@prisma/client';
import { extname } from 'path';
import type { Response } from 'express';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly supabaseService: SupabaseService,
  ) {}

  // === UPLOAD & SUBMIT DOKUMEN ===
  @Post('submit')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Request() req,
    @Body()
    body: {
      name: string;
      contractNumber?: string;
      contractDate?: string;
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

    // Upload ke Supabase
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const fileName = `${file.fieldname}-${uniqueSuffix}${ext}`;

    const uploadResult = await this.supabaseService.uploadFile(
      file.buffer,
      fileName,
      'documents',
    );

    return this.documentService.submit(req.user.id, {
      name: body.name,
      filePath: uploadResult.path,
      contractNumber: body.contractNumber,
      contractDate: body.contractDate ? new Date(body.contractDate) : undefined,
      documentType: body.documentType as ApprovalType,
    });
  }

  // === RESUBMIT (upload ulang file revisi) ===
  @Patch(':id/resubmit')
  @UseInterceptors(FileInterceptor('file'))
  async resubmit(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required for resubmission');
    }

    // Upload ke Supabase
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const fileName = `resubmit-${uniqueSuffix}${ext}`;

    const uploadResult = await this.supabaseService.uploadFile(
      file.buffer,
      fileName,
      'documents',
    );

    return this.documentService.resubmitSimple(
      req.user.id,
      +id,
      uploadResult.path,
    );
  }

  @Patch(':id/vendor-resubmit')
  @UseGuards(JwtAuthGuard)
  async vendorResubmit(@Request() req, @Param('id') id: number) {
    if (req.user.division !== Division.Vendor) {
      throw new ForbiddenException('Only vendors can resubmit');
    }

    return this.documentService.vendorResubmitStatus(req.user.id, +id);
  }

  // === REVIEW HANDLERS ===
  @Patch(':id/dalkon-review')
  @UseInterceptors(FileInterceptor('file'))
  async dalkonReview(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    console.log(' [Dalkon] req.body =', req.body);
    console.log(' [Dalkon] file =', file?.originalname);

    const action = req.body?.action;
    const notes = req.body?.notes;

    let annotations: any[] | undefined;
    if (req.body?.annotations) {
      try {
        annotations = JSON.parse(req.body.annotations);
      } catch (error) {
        throw new BadRequestException('Invalid annotations JSON format');
      }
    }

    if (!action) {
      throw new BadRequestException('Action is required');
    }

    let uploadedFilePath: string | undefined;
    if (file) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      const fileName = `annotated-dalkon-${uniqueSuffix}${ext}`;

      const uploadResult = await this.supabaseService.uploadFile(
        file.buffer,
        fileName,
        'documents',
      );
      uploadedFilePath = uploadResult.path;
    }

    return this.documentService.dalkonReview(
      req.user,
      +id,
      action,
      notes,
      annotations,
      uploadedFilePath,
    );
  }

  // ENGINEERING REVIEW
  @Patch(':id/engineering-review')
  @UseInterceptors(FileInterceptor('file'))
  async engineeringReview(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    console.log('  [Engineering] req.body =', req.body);
    console.log('  [Engineering] file =', file?.originalname);

    const action = req.body?.action;
    const notes = req.body?.notes;

    let annotations: any[] | undefined;
    if (req.body?.annotations) {
      try {
        annotations = JSON.parse(req.body.annotations);
      } catch (error) {
        throw new BadRequestException('Invalid annotations JSON format');
      }
    }

    if (!action) {
      throw new BadRequestException('Action is required');
    }

    let uploadedFilePath: string | undefined;
    if (file) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      const fileName = `annotated-engineer-${uniqueSuffix}${ext}`;

      const uploadResult = await this.supabaseService.uploadFile(
        file.buffer,
        fileName,
        'documents',
      );
      uploadedFilePath = uploadResult.path;
    }

    return this.documentService.engineeringReview(
      req.user,
      +id,
      action,
      notes,
      annotations,
      uploadedFilePath,
    );
  }

  // MANAGER REVIEW
  @Patch(':id/manager-review')
  @UseInterceptors(FileInterceptor('file'))
  async managerReview(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    console.log('  [Manager] req.body =', req.body);
    console.log('  [Manager] file =', file?.originalname);

    const action = req.body?.action;
    const notes = req.body?.notes;

    let annotations: any[] | undefined;
    if (req.body?.annotations) {
      try {
        annotations = JSON.parse(req.body.annotations);
      } catch (error) {
        throw new BadRequestException('Invalid annotations JSON format');
      }
    }

    if (!action) {
      throw new BadRequestException('Action is required');
    }

    let uploadedFilePath: string | undefined;
    if (file) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      const fileName = `annotated-manager-${uniqueSuffix}${ext}`;

      const uploadResult = await this.supabaseService.uploadFile(
        file.buffer,
        fileName,
        'documents',
      );
      uploadedFilePath = uploadResult.path;
    }

    return this.documentService.managerReview(
      req.user,
      +id,
      action,
      notes,
      annotations,
      uploadedFilePath,
    );
  }

  @Patch(':id/resubmit-annotated')
  @UseInterceptors(FileInterceptor('file'))
  async resubmitAnnotated(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File required');
    
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const fileName = `annotated-resubmit-${uniqueSuffix}${ext}`;

    const uploadResult = await this.supabaseService.uploadFile(
      file.buffer,
      fileName,
      'documents',
    );

    return this.documentService.resubmitSimple(
      req.user.id,
      +id,
      uploadResult.path,
    );
  }

  // === VENDOR REVIEW (SUBMIT REVISION) ===
  @Patch(':id/vendor-review')
  @UseInterceptors(FileInterceptor('file'))
  async vendorReview(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    console.log('📤 [Vendor] req.body =', req.body);
    console.log('📄 [Vendor] file =', file?.originalname);

    if (req.user.division !== Division.Vendor) {
      throw new ForbiddenException('Only vendors can submit revisions');
    }

    if (!file) {
      throw new BadRequestException('File is required for vendor revision');
    }

    const action = req.body?.action;

    let annotations: any[] | undefined;
    if (req.body?.annotations) {
      try {
        annotations = JSON.parse(req.body.annotations);
      } catch (error) {
        throw new BadRequestException('Invalid annotations JSON format');
      }
    }

    if (action !== 'submit_revision') {
      throw new BadRequestException('Invalid action for vendor review');
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const fileName = `vendor-revision-${uniqueSuffix}${ext}`;

    const uploadResult = await this.supabaseService.uploadFile(
      file.buffer,
      fileName,
      'documents',
    );

    return this.documentService.resubmitSimple(
      req.user.id,
      +id,
      uploadResult.path,
    );
  }

  @Get('vendor/pending-correction')
  @UseGuards(JwtAuthGuard)
  async getVendorPendingCorrection(@Request() req) {
    return this.documentService.getVendorPendingCorrection(req.user);
  }

  // ✅ TAMBAHKAN endpoint baru khusus untuk file upload
  @Patch(':id/dalkon-review-upload')
  @UseInterceptors(FileInterceptor('file'))
  async dalkonReviewWithUpload(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
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

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const fileName = `dalkon-annotated-${uniqueSuffix}${ext}`;

    const uploadResult = await this.supabaseService.uploadFile(
      file.buffer,
      fileName,
      'documents',
    );

    return this.documentService.dalkonReview(
      req.user,
      +id,
      action,
      notes,
      undefined,
      uploadResult.path,
    );
  }

  @Patch(':id/engineering-review-upload')
  @UseInterceptors(FileInterceptor('file'))
  async engineeringReviewWithUpload(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
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

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const fileName = `engineer-annotated-${uniqueSuffix}${ext}`;

    const uploadResult = await this.supabaseService.uploadFile(
      file.buffer,
      fileName,
      'documents',
    );

    return this.documentService.engineeringReview(
      req.user,
      +id,
      action,
      notes,
      undefined,
      uploadResult.path,
    );
  }

  @Patch(':id/manager-review-upload')
  @UseInterceptors(FileInterceptor('file'))
  async managerReviewWithUpload(
    @Request() req,
    @Param('id') id: number,
    @UploadedFile() file?: Express.Multer.File,
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

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const fileName = `manager-annotated-${uniqueSuffix}${ext}`;

    const uploadResult = await this.supabaseService.uploadFile(
      file.buffer,
      fileName,
      'documents',
    );

    return this.documentService.managerReview(
      req.user,
      +id,
      action,
      notes,
      undefined,
      uploadResult.path,
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

  // === GET FILE (ENDPOINT PREVIEW/DOWNLOAD) - Updated for Supabase ===
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

    const { fileBuffer, fileName, contentType } =
      await this.documentService.getDocumentFile(+id, user);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${fileName}.pdf"`,
    });

    return new StreamableFile(fileBuffer);
  }

  // === GET FILE BY VERSION (untuk download versi tertentu) - Updated for Supabase ===
  @UseGuards(JwtAuthGuard)
  @Get(':id/file/:versionId')
  async getDocumentFileByVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const { fileBuffer, fileName, contentType } =
      await this.documentService.getDocumentFileByVersion(+id, versionId, user);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${fileName}.pdf"`,
    });

    return new StreamableFile(fileBuffer);
  }

  // === GET HISTORY DETAIL (dengan semua versions dan approvals) ===
  @UseGuards(JwtAuthGuard)
  @Get('history/:id')
  async getHistoryDetail(@Param('id') id: number, @Request() req) {
    return this.documentService.getHistoryDetail(+id, req.user);
  }
}
