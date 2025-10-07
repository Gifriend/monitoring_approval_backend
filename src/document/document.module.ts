import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategy/jwt.strategy';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'supersecretjwtkey',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [DocumentController],
  providers: [DocumentService, PrismaService, JwtAuthGuard, JwtStrategy],
  exports: [DocumentService],
})
export class DocumentModule {}
