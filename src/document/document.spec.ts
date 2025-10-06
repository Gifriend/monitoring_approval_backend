import { Test, TestingModule } from '@nestjs/testing';
import { DocumentService } from './document.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Role, Status } from '@prisma/client';

describe('DocumentService', () => {
  let service: DocumentService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
            document: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('submit', () => {
    it('should allow vendor to submit document', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        role: Role.Vendor,
      });
      (prisma.document.create as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'Doc A',
      });

      const result = await service.submit(1, {
        name: 'Doc A',
        filePath: 'file.pdf',
        documentType: 'civil',
      });

      expect(result).toEqual({ id: 1, name: 'Doc A' });
      expect(prisma.document.create).toHaveBeenCalled();
    });

    it('should throw if user is not vendor', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        role: Role.Manager,
      });

      await expect(
        service.submit(2, {
          name: 'Test',
          filePath: 'f.pdf',
          documentType: 'civil',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('dalkonReview', () => {
    it('should approve document', async () => {
      const user = { id: 10, role: Role.Dalkon };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 1,
        status: Status.inReviewEngineering,
      });

      const result = await service.dalkonReview(user, 1, 'approve');

      expect(result.status).toBe(Status.inReviewEngineering);
    });

    it('should return for correction', async () => {
      const user = { id: 10, role: Role.Dalkon };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 1,
        status: Status.returnForCorrection,
      });

      const result = await service.dalkonReview(user, 1, 'returnForCorrection');

      expect(result.status).toBe(Status.returnForCorrection);
    });

    it('should throw if user is not Dalkon', async () => {
      const user = { id: 11, role: Role.Engineer };
      await expect(service.dalkonReview(user, 1, 'approve')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('engineeringReview', () => {
    it('should approve with notes', async () => {
      const user = { id: 20, role: Role.Engineer };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 1,
        status: Status.approvedWithNotes,
      });

      const result = await service.engineeringReview(
        user,
        1,
        'approveWithNotes',
        'Fix minor issue',
      );

      expect(result.status).toBe(Status.approvedWithNotes);
    });

    it('should throw if invalid action', async () => {
      const user = { id: 20, role: Role.Engineer };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({ id: 1 });

      await expect(
        service.engineeringReview(user, 1, 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('managerReview', () => {
    it('should approve document', async () => {
      const user = { id: 30, role: Role.Manager };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 1,
        status: Status.approved,
      });

      const result = await service.managerReview(user, 1, 'approve');

      expect(result.status).toBe(Status.approved);
    });
  });

  describe('resubmit', () => {
    it('should allow vendor to resubmit', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        role: Role.Vendor,
      });
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 1,
        status: Status.submitted,
      });

      const result = await service.resubmit(1, 1, 'newfile.pdf');

      expect(result.status).toBe(Status.submitted);
    });

    it('should throw if user is not vendor', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        role: Role.Manager,
      });

      await expect(service.resubmit(2, 1, 'f.pdf')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getDocument', () => {
    it('should throw if document not found', async () => {
      const user = { id: 10, role: Role.Dalkon };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);

      // Test via dalkonReview since getDocument is private
      await expect(service.dalkonReview(user, 999, 'approve')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getProgress', () => {
    it('should allow Dalkon to view progress', async () => {
      const user = { id: 10, role: Role.Dalkon };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: Status.submitted,
        progress: 'Submitted by vendor',
        approvals: [],
      });

      const result = await service.getProgress(user, 1);
      expect(result.progress).toBe('Submitted by vendor');
    });

    it('should throw if role not allowed', async () => {
      const user = { id: 20, role: Role.Engineer };
      await expect(service.getProgress(user, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('uploadFile', () => {
    it('should update filePath for vendor', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        role: Role.Vendor,
      });
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        submittedById: 1,
      });
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 1,
        filePath: 'new.pdf',
      });

      const result = await service.uploadFile(1, 1, 'new.pdf');
      expect(result.filePath).toBe('new.pdf');
    });
  });

  describe('Full approval workflow', () => {
    const vendor = { id: 1, role: Role.Vendor };
    const dalkon = { id: 2, role: Role.Dalkon };
    const engineer = { id: 3, role: Role.Engineer };
    const manager = { id: 4, role: Role.Manager };

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockReset();
      (prisma.document.create as jest.Mock).mockReset();
      (prisma.document.update as jest.Mock).mockReset();
      (prisma.document.findUnique as jest.Mock).mockReset();
    });

    it('should follow the full approval flow Vendor → Dalkon → Engineering → Dalkon → Manager → Vendor', async () => {
      // === Step 1: Vendor submits ===
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(vendor);
      (prisma.document.create as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.submitted,
        progress: 'Submitted by vendor',
      });

      const submitted = await service.submit(vendor.id, {
        name: 'Doc Flow',
        filePath: 'file.pdf',
        documentType: 'civil',
      });
      expect(submitted.status).toBe(Status.submitted);

      // === Step 2: Dalkon approves → goes to Engineering ===
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.inReviewEngineering,
        progress: 'Forwarded to Engineering',
      });
      const toEngineering = await service.dalkonReview(dalkon, 1, 'approve');
      expect(toEngineering.status).toBe(Status.inReviewEngineering);

      // === Step 3: Engineering approves with notes → goes back to Dalkon ===
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.approvedWithNotes,
        progress: 'Approved with notes',
      });
      const toDalkon = await service.engineeringReview(
        engineer,
        1,
        'approveWithNotes',
        'Minor fixes',
      );
      expect(toDalkon.status).toBe(Status.approvedWithNotes);

      // === Step 4: Dalkon sends to Manager ===
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.inReviewManager,
        progress: 'Forwarded to Manager',
      });
      const toManager = await service.dalkonReview(dalkon, 1, 'approve');
      expect(toManager.status).toBe(Status.inReviewManager);

      // === Step 5: Manager approves → goes back to Vendor ===
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.approved,
        progress: 'Approved by Manager',
      });
      const finalApprove = await service.managerReview(manager, 1, 'approve');
      expect(finalApprove.status).toBe(Status.approved);
    });

    it('should handle correction flow when Engineering returns for correction', async () => {
      // Setup mocks
      const doc = { id: 2 };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(doc);

      // === Step 1: Engineering returns for correction ===
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 2,
        status: Status.returnForCorrection,
        progress: 'Returned for correction',
      });
      const correction = await service.engineeringReview(
        engineer,
        2,
        'returnForCorrection',
        'Fix missing info',
      );
      expect(correction.status).toBe(Status.returnForCorrection);

      // === Step 2: Dalkon sends back to Vendor ===
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce(doc);
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 2,
        status: Status.returnForCorrection,
        progress: 'Returned to Vendor',
      });
      const backToVendor = await service.dalkonReview(
        dalkon,
        2,
        'returnForCorrection',
      );
      expect(backToVendor.status).toBe(Status.returnForCorrection);

      // === Step 3: Vendor resubmits ===
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(vendor);
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 2,
        status: Status.submitted,
        progress: 'Resubmitted by vendor',
      });
      const resubmitted = await service.resubmit(vendor.id, 2, 'file_v2.pdf');
      expect(resubmitted.status).toBe(Status.submitted);
    });

    it('should allow Dalkon to reject directly', async () => {
      const doc = { id: 3 };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(doc);
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 3,
        status: Status.rejected,
        progress: 'Rejected by Dalkon',
      });

      const result = await service.dalkonReview(dalkon, 3, 'reject');
      expect(result.status).toBe(Status.rejected);
    });
  });
});