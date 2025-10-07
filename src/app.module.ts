import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DocumentModule } from './document/document.module';

@Module({
  imports: [AuthModule, DocumentModule],
  controllers: [AppController],
  providers: [AppService],
  // exports: [PrismaService]
})
export class AppModule {}
