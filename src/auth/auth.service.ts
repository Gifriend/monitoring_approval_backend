import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Division } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(data: {
    email: string;
    name: string;
    password: string;
    division: Division;
  }) {
    try {
      if (!data.email) {
        throw new BadRequestException('Email is required');
      }
      if (!data.password) {
        throw new BadRequestException('Password is required');
      }
      if (!data.division) {
        throw new BadRequestException('Division is required');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        throw new BadRequestException('Invalid email format');
      }

      const existingUser = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existingUser) {
        throw new BadRequestException('Email already registered');
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);

      const newUser = await this.prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          password: hashedPassword,
          division: data.division,
        },
        select: {
          id: true,
          email: true,
          name: true,
          division: true,
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
        id: user.id,
        name: user.name,
        email: user.email,
        division: user.division,
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
          id: payload.id,
          refreshToken: refreshToken,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Buat access token baru
      const newPayload = {
        id: user.id,
        email: user.email,
        division: user.division,
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
          division: user.division,
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
          division: true,
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
