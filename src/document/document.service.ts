import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Status, ApprovalType } from '@prisma/client';

@Injectable()
export class DocumentService {
  constructor(private prisma: PrismaService) {}

  // === SUBMIT ===
  async submit(
    userId: number,
    data: {
      name: string;
      filePath: string;
      contractId?: number;
      documentType: ApprovalType;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.Vendor)
      throw new ForbiddenException('Only vendors can submit documents');

    return this.prisma.document.create({
      data: {
        name: data.name,
        filePath: data.filePath,
        documentType: data.documentType,
        contractId: data.contractId,
        submittedById: userId,
        status: Status.submitted,
        // progress awal
        progress: 'Submitted by vendor',
      },
    });
  }

  // === DALKON REVIEW ===
  async dalkonReview(user: any, docId: number, action: string) {
    if (user.role !== Role.Dalkon)
      throw new ForbiddenException('Only Dalkon can review');
    await this.getDocument(docId);

    if (action === 'approve') {
      return this.updateStatus(
        docId,
        Status.inReviewEngineering,
        user.id,
        'Forwarded to Engineering',
      );
    } else if (action === 'returnForCorrection') {
      return this.updateStatus(
        docId,
        Status.returnForCorrection,
        user.id,
        'Returned to Vendor',
      );
    } else if (action === 'reject') {
      return this.updateStatus(
        docId,
        Status.rejected,
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
    if (user.role !== Role.Engineer)
      throw new ForbiddenException('Only Engineer can review');
    await this.getDocument(docId);

    if (action === 'approve') {
      return this.updateStatus(
        docId,
        Status.approved,
        user.id,
        'Approved by Engineer',
      );
    } else if (action === 'approveWithNotes') {
      return this.updateStatus(
        docId,
        Status.approvedWithNotes,
        user.id,
        notes || 'Approved with notes',
      );
    } else if (action === 'returnForCorrection') {
      return this.updateStatus(
        docId,
        Status.returnForCorrection,
        user.id,
        notes || 'Returned for correction',
      );
    }
    throw new BadRequestException('Invalid action');
  }

  // === MANAGER REVIEW ===
  async managerReview(user: any, docId: number, action: string) {
    if (user.role !== Role.Manager)
      throw new ForbiddenException('Only Manager can review');
    await this.getDocument(docId);

    if (action === 'approve') {
      return this.updateStatus(
        docId,
        Status.approved,
        user.id,
        'Approved by Manager',
      );
    } else if (action === 'returnForCorrection') {
      return this.updateStatus(
        docId,
        Status.returnForCorrection,
        user.id,
        'Returned by Manager',
      );
    }
    throw new BadRequestException('Invalid action');
  }

  // === RESUBMIT VENDOR ===
  async resubmit(userId: number, docId: number, filePath: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.Vendor)
      throw new ForbiddenException('Only vendors can resubmit documents');

    return this.prisma.document.update({
      where: { id: docId },
      data: {
        filePath,
        status: Status.submitted,
        reviewedById: null,
        progress: 'Resubmitted by vendor',
      },
    });
  }

  // === GET PROGRESS (Manager & Dalkon Only) ===
  async getProgress(user: any, docId: number) {
    if (![Role.Dalkon, Role.Manager].includes(user.role)) {
      throw new ForbiddenException('Only Dalkon and Manager can view progress');
    }

    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      include: {
        approvals: {
          orderBy: { createdAt: 'asc' },
          include: {
            approvedBy: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');

    return {
      documentId: doc.id,
      name: doc.name,
      status: doc.status,
      progress: doc.progress,
      approvals: (doc.approvals ?? []).map((a) => ({
        id: a.id,
        status: a.status,
        notes: a.notes,
        reviewedBy: a.approvedBy
          ? {
              id: a.approvedBy.id,
              name: a.approvedBy.name,
              role: a.approvedBy.role,
            }
          : null,
        deadline: a.deadline,
        createdAt: a.createdAt,
      })),
    };
  }

  // === UPLOAD PDF (update filePath) ===
  async uploadFile(userId: number, docId: number, filePath: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const doc = await this.getDocument(docId);
    if (doc.submittedById !== userId) {
      throw new ForbiddenException(
        'Only the vendor who submitted can upload file',
      );
    }

    return this.prisma.document.update({
      where: { id: docId },
      data: { filePath, progress: 'File updated' },
    });
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
  ) {
    return this.prisma.document.update({
      where: { id: docId },
      data: {
        status,
        reviewedById: reviewerId,
        progress: notes || `Status updated to ${status}`,
        approvals: {
          create: {
            status,
            approvedById: reviewerId,
            id: docId,
            type: ApprovalType.civil,
            notes,
            deadline: new Date(new Date().setDate(new Date().getDate() + 7)),
          },
        },
      },
      include: { approvals: true },
    });
  }
  // === GET HISTORY ===
  async getHistory(user: any) {
    const userRole = user.role;

    // === Vendor melihat semua dokumen yang ia submit ===
    if (userRole === Role.Vendor) {
      return this.prisma.document.findMany({
        where: { submittedById: user.id },
        include: {
          approvals: {
            orderBy: { createdAt: 'desc' },
            include: {
              approvedBy: {
                select: { id: true, name: true, role: true },
              },
            },
          },
          contract: {
            select: { contractNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // === Reviewer (Dalkon, Engineer, Manager) melihat semua dokumen yang pernah direview ===
    if ([Role.Dalkon, Role.Engineer, Role.Manager].includes(userRole)) {
      return this.prisma.document.findMany({
        where: {
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
                select: { id: true, name: true, role: true },
              },
            },
          },
          submittedBy: {
            select: { id: true, name: true, email: true },
          },
          contract: {
            select: { contractNumber: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    throw new ForbiddenException('Role not permitted to view history');
  }
}
