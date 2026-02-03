import { Test, TestingModule } from '@nestjs/testing';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard';
import { Division, ApprovalType, Status } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Readable } from 'stream';

// Mock fs module
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn(() => {
    const stream = new Readable();
    stream.push('mock file content');
    stream.push(null);
    return stream;
  }),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
}));

describe('DocumentController', () => {
  let controller: DocumentController;
  let service: DocumentService;

  const mockDocumentService = {
    submit: jest.fn(),
    resubmitSimple: jest.fn(),
    vendorResubmitStatus: jest.fn(),
    dalkonReview: jest.fn(),
    engineeringReview: jest.fn(),
    managerReview: jest.fn(),
    getVendorPendingCorrection: jest.fn(),
    getHistory: jest.fn(),
    getActiveDocuments: jest.fn(),
    saveAnnotations: jest.fn(),
    getById: jest.fn(),
    getDocumentFile: jest.fn(),
    getDocumentFileByVersion: jest.fn(),
    getHistoryDetail: jest.fn(),
  };

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    division: Division.Vendor,
  };

  const mockDocument = {
    id: 1,
    name: 'Test Document',
    contractNumber: '001/2024',
    contractDate: new Date(),
    status: Status.submitted,
    filePath: 'uploads/test-file.pdf',
    submittedById: 1,
    approvalType: ApprovalType.protection,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    destination: 'uploads',
    filename: 'test-1234567890.pdf',
    path: 'uploads/test-1234567890.pdf',
    buffer: Buffer.from('test'),
    stream: null,
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentController],
      providers: [
        {
          provide: DocumentService,
          useValue: mockDocumentService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<DocumentController>(DocumentController);
    service = module.get<DocumentService>(DocumentService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('submit', () => {
    it('should submit a document successfully', async () => {
      const req = { user: mockUser };
      const body = {
        name: 'Test Document',
        contractNumber: '001/2024',
        contractDate: '2024-01-01',
        documentType: 'protection',
      };

      const expectedResult = {
        message: 'Document submitted successfully',
        document: mockDocument,
      };

      mockDocumentService.submit.mockResolvedValue(expectedResult);

      const result = await controller.submit(req, body, mockFile);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.submit).toHaveBeenCalledWith(mockUser.id, {
        name: body.name,
        filePath: `uploads/${mockFile.filename}`,
        contractNumber: body.contractNumber,
        contractDate: new Date(body.contractDate),
        documentType: ApprovalType.protection,
      });
    });

    it('should throw BadRequestException when file is missing', async () => {
      const req = { user: mockUser };
      const body = {
        name: 'Test Document',
        documentType: 'protection',
      };

      await expect(controller.submit(req, body, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid documentType', async () => {
      const req = { user: mockUser };
      const body = {
        name: 'Test Document',
        documentType: 'invalid',
      };

      await expect(controller.submit(req, body, mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should submit without contractDate', async () => {
      const req = { user: mockUser };
      const body = {
        name: 'Test Document',
        documentType: 'civil',
      };

      const expectedResult = {
        message: 'Document submitted successfully',
        document: mockDocument,
      };

      mockDocumentService.submit.mockResolvedValue(expectedResult);

      await controller.submit(req, body, mockFile);

      expect(mockDocumentService.submit).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          contractDate: undefined,
        }),
      );
    });
  });

  describe('resubmit', () => {
    it('should resubmit a document successfully', async () => {
      const req = { user: mockUser };
      const id = 1;

      const expectedResult = {
        message: 'Document resubmitted successfully',
        document: mockDocument,
      };

      mockDocumentService.resubmitSimple.mockResolvedValue(expectedResult);

      const result = await controller.resubmit(req, id, mockFile);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.resubmitSimple).toHaveBeenCalledWith(
        mockUser.id,
        id,
        `uploads/${mockFile.filename}`,
      );
    });

    it('should throw BadRequestException when file is missing', async () => {
      const req = { user: mockUser };
      const id = 1;

      await expect(controller.resubmit(req, id, undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('vendorResubmit', () => {
    it('should allow vendor to resubmit', async () => {
      const req = { user: { ...mockUser, division: Division.Vendor } };
      const id = 1;

      const expectedResult = {
        message: 'Vendor resubmit status updated',
        document: mockDocument,
      };

      mockDocumentService.vendorResubmitStatus.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.vendorResubmit(req, id);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.vendorResubmitStatus).toHaveBeenCalledWith(
        mockUser.id,
        id,
      );
    });

    it('should throw ForbiddenException when user is not vendor', async () => {
      const req = { user: { ...mockUser, division: Division.Dalkon } };
      const id = 1;

      await expect(controller.vendorResubmit(req, id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('dalkonReview', () => {
    it('should perform dalkon review with annotations', async () => {
      const req = {
        user: { ...mockUser, division: Division.Dalkon },
        body: {
          action: 'approve',
          notes: 'Looks good',
          annotations: JSON.stringify([{ type: 'text', content: 'OK' }]),
        },
      };
      const id = 1;

      const expectedResult = {
        message: 'Review submitted successfully',
        document: mockDocument,
      };

      mockDocumentService.dalkonReview.mockResolvedValue(expectedResult);

      const result = await controller.dalkonReview(req, id, mockFile);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.dalkonReview).toHaveBeenCalledWith(
        req.user,
        id,
        'approve',
        'Looks good',
        [{ type: 'text', content: 'OK' }],
        `uploads/${mockFile.filename}`,
      );
    });

    it('should throw BadRequestException when action is missing', async () => {
      const req = {
        user: { ...mockUser, division: Division.Dalkon },
        body: {},
      };
      const id = 1;

      await expect(controller.dalkonReview(req, id, mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid annotations JSON', async () => {
      const req = {
        user: { ...mockUser, division: Division.Dalkon },
        body: {
          action: 'approve',
          annotations: 'invalid-json',
        },
      };
      const id = 1;

      await expect(controller.dalkonReview(req, id, mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should perform review without file', async () => {
      const req = {
        user: { ...mockUser, division: Division.Dalkon },
        body: {
          action: 'approve',
          notes: 'Approved',
        },
      };
      const id = 1;

      const expectedResult = {
        message: 'Review submitted successfully',
        document: mockDocument,
      };

      mockDocumentService.dalkonReview.mockResolvedValue(expectedResult);

      const result = await controller.dalkonReview(req, id, undefined);

      expect(mockDocumentService.dalkonReview).toHaveBeenCalledWith(
        req.user,
        id,
        'approve',
        'Approved',
        undefined,
        undefined,
      );
    });
  });

  describe('engineeringReview', () => {
    it('should perform engineering review successfully', async () => {
      const req = {
        user: { ...mockUser, division: Division.Engineer },
        body: {
          action: 'approve',
          notes: 'Technical review passed',
        },
      };
      const id = 1;

      const expectedResult = {
        message: 'Engineering review completed',
        document: mockDocument,
      };

      mockDocumentService.engineeringReview.mockResolvedValue(expectedResult);

      const result = await controller.engineeringReview(req, id, undefined);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.engineeringReview).toHaveBeenCalledWith(
        req.user,
        id,
        'approve',
        'Technical review passed',
        undefined,
        undefined,
      );
    });

    it('should throw BadRequestException when action is missing', async () => {
      const req = {
        user: { ...mockUser, division: Division.Engineer },
        body: {},
      };
      const id = 1;

      await expect(
        controller.engineeringReview(req, id, undefined),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('managerReview', () => {
    it('should perform manager review successfully', async () => {
      const req = {
        user: { ...mockUser, division: Division.Manager },
        body: {
          action: 'approve',
          notes: 'Final approval',
        },
      };
      const id = 1;

      const expectedResult = {
        message: 'Manager review completed',
        document: mockDocument,
      };

      mockDocumentService.managerReview.mockResolvedValue(expectedResult);

      const result = await controller.managerReview(req, id, mockFile);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.managerReview).toHaveBeenCalledWith(
        req.user,
        id,
        'approve',
        'Final approval',
        undefined,
        `uploads/${mockFile.filename}`,
      );
    });
  });

  describe('resubmitAnnotated', () => {
    it('should resubmit annotated document successfully', async () => {
      const req = { user: mockUser };
      const id = 1;

      const expectedResult = {
        message: 'Document resubmitted successfully',
        document: mockDocument,
      };

      mockDocumentService.resubmitSimple.mockResolvedValue(expectedResult);

      const result = await controller.resubmitAnnotated(req, id, mockFile);

      expect(result).toEqual(expectedResult);
    });

    it('should throw BadRequestException when file is missing', async () => {
      const req = { user: mockUser };
      const id = 1;

      await expect(
        controller.resubmitAnnotated(req, id, undefined as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('vendorReview', () => {
    it('should allow vendor to submit revision', async () => {
      const req = {
        user: { ...mockUser, division: Division.Vendor },
        body: {
          action: 'submit_revision',
        },
      };
      const id = 1;

      const expectedResult = {
        message: 'Revision submitted successfully',
        document: mockDocument,
      };

      mockDocumentService.resubmitSimple.mockResolvedValue(expectedResult);

      const result = await controller.vendorReview(req, id, mockFile);

      expect(result).toEqual(expectedResult);
    });

    it('should throw ForbiddenException when user is not vendor', async () => {
      const req = {
        user: { ...mockUser, division: Division.Dalkon },
        body: {
          action: 'submit_revision',
        },
      };
      const id = 1;

      await expect(controller.vendorReview(req, id, mockFile)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when file is missing', async () => {
      const req = {
        user: { ...mockUser, division: Division.Vendor },
        body: {
          action: 'submit_revision',
        },
      };
      const id = 1;

      await expect(
        controller.vendorReview(req, id, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid action', async () => {
      const req = {
        user: { ...mockUser, division: Division.Vendor },
        body: {
          action: 'invalid_action',
        },
      };
      const id = 1;

      await expect(controller.vendorReview(req, id, mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getVendorPendingCorrection', () => {
    it('should get vendor pending correction documents', async () => {
      const req = { user: { ...mockUser, division: Division.Vendor } };

      const expectedResult = {
        documents: [mockDocument],
      };

      mockDocumentService.getVendorPendingCorrection.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.getVendorPendingCorrection(req);

      expect(result).toEqual(expectedResult);
      expect(
        mockDocumentService.getVendorPendingCorrection,
      ).toHaveBeenCalledWith(req.user);
    });
  });

  describe('dalkonReviewWithUpload', () => {
    it('should perform dalkon review with file upload', async () => {
      const req = {
        user: { ...mockUser, division: Division.Dalkon },
        body: {
          action: 'approve',
          notes: 'Approved with upload',
        },
      };
      const id = 1;

      const expectedResult = {
        message: 'Review submitted successfully',
        document: mockDocument,
      };

      mockDocumentService.dalkonReview.mockResolvedValue(expectedResult);

      const result = await controller.dalkonReviewWithUpload(req, id, mockFile);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.dalkonReview).toHaveBeenCalledWith(
        req.user,
        id,
        'approve',
        'Approved with upload',
        undefined,
        `uploads/${mockFile.filename}`,
      );
    });

    it('should throw BadRequestException when file is missing', async () => {
      const req = {
        user: { ...mockUser, division: Division.Dalkon },
        body: {
          action: 'approve',
        },
      };
      const id = 1;

      await expect(
        controller.dalkonReviewWithUpload(req, id, undefined as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('engineeringReviewWithUpload', () => {
    it('should perform engineering review with file upload', async () => {
      const req = {
        user: { ...mockUser, division: Division.Engineer },
        body: {
          action: 'approve',
          notes: 'Engineering approved',
        },
      };
      const id = 1;

      const expectedResult = {
        message: 'Review submitted successfully',
        document: mockDocument,
      };

      mockDocumentService.engineeringReview.mockResolvedValue(expectedResult);

      const result = await controller.engineeringReviewWithUpload(
        req,
        id,
        mockFile,
      );

      expect(result).toEqual(expectedResult);
    });
  });

  describe('managerReviewWithUpload', () => {
    it('should perform manager review with file upload', async () => {
      const req = {
        user: { ...mockUser, division: Division.Manager },
        body: {
          action: 'approve',
          notes: 'Manager approved',
        },
      };
      const id = 1;

      const expectedResult = {
        message: 'Review submitted successfully',
        document: mockDocument,
      };

      mockDocumentService.managerReview.mockResolvedValue(expectedResult);

      const result = await controller.managerReviewWithUpload(
        req,
        id,
        mockFile,
      );

      expect(result).toEqual(expectedResult);
    });
  });

  describe('getHistory', () => {
    it('should get document history', async () => {
      const req = { user: mockUser };

      const expectedResult = {
        documents: [mockDocument],
      };

      mockDocumentService.getHistory.mockResolvedValue(expectedResult);

      const result = await controller.getHistory(req);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.getHistory).toHaveBeenCalledWith(req.user);
    });
  });

  describe('getActiveDocuments', () => {
    it('should get active documents', async () => {
      const req = { user: mockUser };

      const expectedResult = {
        documents: [mockDocument],
      };

      mockDocumentService.getActiveDocuments.mockResolvedValue(expectedResult);

      const result = await controller.getActiveDocuments(req);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.getActiveDocuments).toHaveBeenCalledWith(
        req.user,
      );
    });
  });

  describe('saveAnnotations', () => {
    it('should save annotations successfully', async () => {
      const req = { user: { id: 1 } };
      const id = '1';
      const body = {
        annotations: [{ type: 'text', content: 'Note' }],
        documentName: 'Test Document',
      };

      const expectedResult = {
        message: 'Annotations saved successfully',
      };

      mockDocumentService.saveAnnotations.mockResolvedValue(expectedResult);

      const result = await controller.saveAnnotations(id, body, req);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.saveAnnotations).toHaveBeenCalledWith(
        1,
        1,
        body.annotations,
        body.documentName,
      );
    });
  });

  describe('getById', () => {
    it('should get document by id', async () => {
      const req = { user: mockUser };
      const id = 1;

      const expectedResult = {
        document: mockDocument,
        versions: [],
        approvals: [],
      };

      mockDocumentService.getById.mockResolvedValue(expectedResult);

      const result = await controller.getById(id, req);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.getById).toHaveBeenCalledWith(id, req.user);
    });
  });

  describe('getDocumentFile', () => {
    it('should get document file successfully', async () => {
      const req = { user: mockUser };
      const id = '1';
      const mockResponse = {
        set: jest.fn(),
      };

      const expectedFileData = {
        filePath: 'uploads/test.pdf',
        fileName: 'Test Document',
      };

      mockDocumentService.getDocumentFile.mockResolvedValue(expectedFileData);

      await controller.getDocumentFile(id, req, mockResponse as any);

      expect(mockDocumentService.getDocumentFile).toHaveBeenCalledWith(
        1,
        mockUser,
      );
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="Test Document.pdf"',
      });
    });

    it('should throw ForbiddenException when user is not authenticated', async () => {
      const req = { user: null };
      const id = '1';
      const mockResponse = {
        set: jest.fn(),
      };

      await expect(
        controller.getDocumentFile(id, req, mockResponse as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getDocumentFileByVersion', () => {
    it('should get document file by version', async () => {
      const req = { user: mockUser };
      const id = '1';
      const versionId = 'version-1';
      const mockResponse = {
        set: jest.fn(),
      };

      const expectedFileData = {
        filePath: 'uploads/test-version.pdf',
        fileName: 'Test Document v1',
      };

      mockDocumentService.getDocumentFileByVersion.mockResolvedValue(
        expectedFileData,
      );

      await controller.getDocumentFileByVersion(id, versionId, req, mockResponse as any);

      expect(mockDocumentService.getDocumentFileByVersion).toHaveBeenCalledWith(
        1,
        versionId,
        mockUser,
      );
    });

    it('should throw ForbiddenException when user is not authenticated', async () => {
      const req = { user: null };
      const id = '1';
      const versionId = 'version-1';
      const mockResponse = {
        set: jest.fn(),
      };

      await expect(
        controller.getDocumentFileByVersion(
          id,
          versionId,
          req,
          mockResponse as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getHistoryDetail', () => {
    it('should get history detail', async () => {
      const req = { user: mockUser };
      const id = 1;

      const expectedResult = {
        document: mockDocument,
        versions: [],
        approvals: [],
      };

      mockDocumentService.getHistoryDetail.mockResolvedValue(expectedResult);

      const result = await controller.getHistoryDetail(id, req);

      expect(result).toEqual(expectedResult);
      expect(mockDocumentService.getHistoryDetail).toHaveBeenCalledWith(
        id,
        req.user,
      );
    });
  });
});
