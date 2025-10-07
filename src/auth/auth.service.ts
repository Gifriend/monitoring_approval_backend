import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(
    userId: number,
    data: { email: string; name?: string; password: string; role: Role },
  ) {
    try {
      // Periksa apakah user yang melakukan registrasi adalah Manager atau Consultant
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!currentUser || !['Manager', 'Dalkon'].includes(currentUser.role)) {
        throw new ForbiddenException(
          'Only Manager or Consultant can register new users',
        );
      }

      // Validasi input
      if (!data.email || !data.password || !data.role) {
        throw new BadRequestException('Email, password, and role are required');
      }

      // Validasi email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        throw new BadRequestException('Invalid email format');
      }

      // Validasi password strength
      if (data.password.length < 6) {
        throw new BadRequestException(
          'Password must be at least 6 characters long',
        );
      }

      // Validasi role
      const validRoles = Object.values(Role);
      if (!validRoles.includes(data.role)) {
        throw new BadRequestException('Invalid role');
      }

      // Cek apakah email sudah terdaftar
      const existingUser = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existingUser) {
        throw new BadRequestException('Email already registered');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Buat user baru
      const newUser = await this.prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          password: hashedPassword,
          role: data.role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        message: 'User registered successfully',
        user: newUser,
      };
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Email already registered');
      }

      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Registration failed');
    }
  }

  async login(data: { email: string; password: string }) {
    try {
      if (!data.email || !data.password) {
        throw new BadRequestException('Email and password are required');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        throw new BadRequestException('Invalid email format');
      }

      const user = await this.prisma.user.findUnique({
        where: { email: data.email },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const isPasswordValid = await bcrypt.compare(
        data.password,
        user.password,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        nonce: randomBytes(32).toString('hex'),
      };

      const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '1h' });

      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken },
      });

      return {
        message: 'Login successful',
        accessToken,
        refreshToken,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      console.error('Login error:', error);
      throw new InternalServerErrorException('Login failed');
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      if (!refreshToken) {
        throw new BadRequestException('Refresh token is required');
      }

      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken);

      // Cari user dengan refresh token yang sesuai
      const user = await this.prisma.user.findFirst({
        where: {
          id: payload.sub,
          refreshToken: refreshToken,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Buat access token baru
      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: '15m',
      });

      return {
        message: 'Token refreshed successfully',
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      if (
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Token refresh failed');
    }
  }

  async logout(userId: number) {
    try {
      // Hapus refresh token dari database
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });

      return {
        message: 'Logout successful',
      };
    } catch (error) {
      throw new InternalServerErrorException('Logout failed');
    }
  }

  async getAccount(userId: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          submittedDocuments: {
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          reviewedDocuments: {
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          approvals: {
            select: {
              id: true,
              document: {
                select: {
                  id: true,
                  name: true,
                },
              },
              type: true,
              status: true,
              deadline: true,
              createdAt: true,
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return {
        message: 'Account retrieved successfully',
        user,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to retrieve account information',
      );
    }
  }
}
