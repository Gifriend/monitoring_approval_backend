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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard';
import { ApprovalType } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  // === UPLOAD & SUBMIT DOKUMEN ===
  @Post('submit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
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
    @Body() body: { name: string; contractId?: number; documentType: string },
    @UploadedFile() file?: Express.Multer.File, // <-- optional
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const filePath = `uploads/${file.filename}`;
    return this.documentService.submit(req.user.id, {
      name: body.name,
      filePath,
      contractId: body.contractId ? Number(body.contractId) : undefined,
      documentType: body.documentType as ApprovalType,
    });
  }

  // === RESUBMIT (upload ulang file revisi) ===
  @Patch(':id/resubmit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
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
    const filePath = `uploads/${file.filename}`;
    return this.documentService.resubmit(req.user.id, +id, filePath);
  }

  // === REVIEW HANDLERS (tetap sama) ===
  @Patch(':id/dalkon-review')
  async dalkonReview(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { action: string },
  ) {
    return this.documentService.dalkonReview(req.user, +id, body.action);
  }

  @Patch(':id/engineering-review')
  async engineeringReview(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { action: string; notes?: string },
  ) {
    return this.documentService.engineeringReview(
      req.user,
      +id,
      body.action,
      body.notes,
    );
  }

  @Patch(':id/manager-review')
  async managerReview(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { action: string },
  ) {
    return this.documentService.managerReview(req.user, +id, body.action);
  }

  // === GET HISTORY DOKUMEN ===
  @Get('history')
  async getHistory(@Request() req) {
    return this.documentService.getHistory(req.user);
  }
}
