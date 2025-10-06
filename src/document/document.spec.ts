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
            user: { findUnique: jest.fn() },
            document: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // === BASIC FLOW TESTING ===
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

  // === EXTENDED FEATURE TESTS ===
  describe('resubmit / versioning', () => {
    it('should allow vendor to resubmit and increment version', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        role: Role.Vendor,
      });
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 5,
        version: 1,
      });
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 5,
        status: Status.submitted,
        version: 2,
      });

      const result = await service.resubmit(1, 5, 'file_v2.pdf');
      expect(result.status).toBe(Status.submitted);
      expect(result.version).toBe(2);
    });
  });

  describe('getProgress', () => {
    it('should allow Dalkon to view progress with all steps', async () => {
      const user = { id: 10, role: Role.Dalkon };
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        status: Status.approved,
        progress: [
          'Submitted by vendor',
          'Forwarded to Engineering',
          'Approved with notes',
          'Forwarded to Manager',
          'Approved by Manager',
        ],
      });

      const result = await service.getProgress(user, 1);
      expect(result.progress).toContain('Approved by Manager');
      expect((result.progress ?? []).length).toBeGreaterThan(1);
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

  describe('getHistory', () => {
    it('should return all completed documents for a vendor', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        role: Role.Vendor,
      });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        { id: 1, status: Status.approved },
        { id: 2, status: Status.rejected },
      ]);

      const result = await service.getHistory({ id: 1, role: Role.Vendor });

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe(Status.approved);
    });
  });

  // === FULL FLOW TESTING ===
  describe('Full approval workflow', () => {
    const vendor = { id: 1, role: Role.Vendor };
    const dalkon = { id: 2, role: Role.Dalkon };
    const engineer = { id: 3, role: Role.Engineer };
    const manager = { id: 4, role: Role.Manager };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should follow the full approval flow Vendor → Dalkon → Engineering → Dalkon → Manager → Vendor with progress updates', async () => {
      // Step 1: Vendor submits
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(vendor);
      (prisma.document.create as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.submitted,
        progress: ['Submitted by vendor'],
      });

      const submitted = await service.submit(vendor.id, {
        name: 'Doc Flow',
        filePath: 'file.pdf',
        documentType: 'civil',
      });
      expect(submitted.progress).toContain('Submitted by vendor');

      // Step 2: Dalkon approves → Engineering
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.inReviewEngineering,
        progress: ['Forwarded to Engineering'],
      });
      const toEngineering = await service.dalkonReview(dalkon, 1, 'approve');
      expect(toEngineering.progress).toContain('Forwarded to Engineering');

      // Step 3: Engineering approve with notes → Dalkon
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.approvedWithNotes,
        progress: ['Approved with notes'],
      });
      const toDalkon = await service.engineeringReview(
        engineer,
        1,
        'approveWithNotes',
        'Minor fixes',
      );
      expect(toDalkon.progress).toContain('Approved with notes');

      // Step 4: Dalkon sends → Manager
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.inReviewManager,
        progress: ['Forwarded to Manager'],
      });
      const toManager = await service.dalkonReview(dalkon, 1, 'approve');
      expect(toManager.progress).toContain('Forwarded to Manager');

      // Step 5: Manager approve → Vendor
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce({ id: 1 });
      (prisma.document.update as jest.Mock).mockResolvedValueOnce({
        id: 1,
        status: Status.approved,
        progress: ['Approved by Manager'],
      });
      const finalApprove = await service.managerReview(manager, 1, 'approve');
      expect(finalApprove.progress).toContain('Approved by Manager');
    });
  });
});
