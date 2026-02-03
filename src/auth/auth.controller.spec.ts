import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Division } from '@prisma/client';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    getAccount: jest.fn(),
  };

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    division: Division.Vendor,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
        division: Division.Vendor,
      };

      const expectedResult = {
        message: 'User registered successfully',
        user: mockUser,
      };

      mockAuthService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(registerDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
      expect(mockAuthService.register).toHaveBeenCalledTimes(1);
    });

    it('should register user without name (use empty string)', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
        division: Division.Vendor,
      };

      const expectedResult = {
        message: 'User registered successfully',
        user: mockUser,
      };

      mockAuthService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(registerDto);

      expect(mockAuthService.register).toHaveBeenCalledWith({
        ...registerDto,
        name: '',
      });
    });

    it('should throw BadRequestException when email already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        name: 'Test User',
        password: 'password123',
        division: Division.Vendor,
      };

      mockAuthService.register.mockRejectedValue(
        new BadRequestException('Email already registered'),
      );

      await expect(controller.register(registerDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const expectedResult = {
        message: 'Login successful',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto);
      expect(mockAuthService.login).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Email atau Password salah'),
      );

      await expect(controller.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw BadRequestException when email is missing', async () => {
      const loginDto = {
        email: '',
        password: 'password123',
      };

      mockAuthService.login.mockRejectedValue(
        new BadRequestException('Email and password are required'),
      );

      await expect(controller.login(loginDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const refreshDto = {
        refreshToken: 'valid-refresh-token',
      };

      const expectedResult = {
        message: 'Token refreshed successfully',
        accessToken: 'new-access-token',
        user: mockUser,
      };

      mockAuthService.refreshToken.mockResolvedValue(expectedResult);

      const result = await controller.refreshToken(refreshDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(
        refreshDto.refreshToken,
      );
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const refreshDto = {
        refreshToken: 'invalid-refresh-token',
      };

      mockAuthService.refreshToken.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(controller.refreshToken(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      const req = {
        user: { id: 1 },
      };

      const expectedResult = {
        message: 'Logout successful',
      };

      mockAuthService.logout.mockResolvedValue(expectedResult);

      const result = await controller.logout(req);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.logout).toHaveBeenCalledWith(1);
    });
  });

  describe('getAccount', () => {
    it('should get account details successfully', async () => {
      const req = {
        user: { id: 1 },
      };

      const expectedResult = {
        message: 'Account retrieved successfully',
        user: {
          ...mockUser,
          submittedDocuments: [],
          reviewedDocuments: [],
          approvals: [],
        },
      };

      mockAuthService.getAccount.mockResolvedValue(expectedResult);

      const result = await controller.getAccount(req);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.getAccount).toHaveBeenCalledWith(1);
    });
  });
});
