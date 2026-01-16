import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Division } from '@prisma/client';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerSelf', () => {
    const registerData = {
      email: 'selfregister@example.com',
      name: 'Self Register',
      password: 'password123',
      division: Division.Vendor,
    };

    it('should register user successfully without manager or consultant', async () => {
      // Email belum ada di DB
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      // Mock bcrypt hash
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');

      // Mock Prisma create
      mockPrismaService.user.create.mockResolvedValue({
        id: 10,
        email: registerData.email,
        name: registerData.name,
        division: registerData.division,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Jalankan register mandiri — misalnya kamu tambahkan method baru di AuthService:
      // service.registerSelf(registerData)
      const result = await service.register(registerData);

      expect(result.message).toBe('User registered successfully');
      expect(result.user.email).toBe(registerData.email);
    });

    it('should throw BadRequestException when email already exists', async () => {
      // Email sudah terdaftar
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 10,
        email: registerData.email,
      });

      await expect(service.register(registerData)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'password123',
    };

    const mockUser = {
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      division: Division.Vendor,
      password: 'hashedPassword',
    };

    it('should login successfully with valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      const result = await service.login(loginData);

      expect(result.message).toBe('Login successful');
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      //login method does not return 'user'
      // expect(result.user.email).toBe(loginData.email);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginData)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginData)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw BadRequestException for missing credentials', async () => {
      await expect(service.login({ email: '', password: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid email format', async () => {
      await expect(
        service.login({ email: 'invalid-email', password: 'password123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refreshToken', () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      division: Division.Vendor,
      refreshToken: 'valid-refresh-token',
    };

    it('should refresh token successfully', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = {
        sub: 1,
        email: 'test@example.com',
        division: Division.Vendor,
      };

      mockJwtService.verify.mockReturnValue(payload);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('new-access-token');

      const result = await service.refreshToken(refreshToken);

      expect(result.message).toBe('Token refreshed successfully');
      expect(result.accessToken).toBe('new-access-token');
    });

    it('should throw BadRequestException for missing refresh token', async () => {
      await expect(service.refreshToken('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.logout(1);

      expect(result.message).toBe('Logout successful');
    });
  });

  describe('getAccount', () => {
    const mockUserWithRelations = {
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      division: Division.Vendor,
      createdAt: new Date(),
      updatedAt: new Date(),
      submittedDocuments: [],
      reviewedDocuments: [],
      approvals: [],
    };

    it('should return account information successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(
        mockUserWithRelations,
      );

      const result = await service.getAccount(1);

      expect(result.message).toBe('Account retrieved successfully');
      expect(result.user.id).toBe(1);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getAccount(999)).rejects.toThrow(NotFoundException);
    });
  });
});
