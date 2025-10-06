import { 
  Controller, Post, Patch, Body, Param, UseGuards, Request, HttpCode, HttpStatus 
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard';
import { ApprovalType } from '@prisma/client';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Request() req,
    @Body() body: { name: string; filePath: string; contractId?: number; documentType: string }
  ) {
    // Ensure documentType is of type ApprovalType
    return this.documentService.submit(req.user.id, {
      ...body,
      documentType: body.documentType as ApprovalType,
    });
  }

  @Patch(':id/dalkon-review')
  async dalkonReview(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { action: string }
  ) {
    return this.documentService.dalkonReview(req.user, +id, body.action);
  }

  @Patch(':id/engineering-review')
  async engineeringReview(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { action: string; notes?: string }
  ) {
    return this.documentService.engineeringReview(req.user, +id, body.action, body.notes);
  }

  @Patch(':id/manager-review')
  async managerReview(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { action: string }
  ) {
    return this.documentService.managerReview(req.user, +id, body.action);
  }

  @Patch(':id/resubmit')
  async resubmit(
    @Request() req,
    @Param('id') id: number,
    @Body() body: { filePath: string }
  ) {
    return this.documentService.resubmit(req.user.id, +id, body.filePath);
  }
}
