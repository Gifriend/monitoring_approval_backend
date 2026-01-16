import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './commmon/interceptors/logging.interceptors';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cors = {
    origin: ['http://localhost:3000', 'https://zpzbzpbq-3000.asse.devtunnels.ms'],
    methods: 'GET, HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  };

  // Increase payload size limit for annotations (50MB)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.enableCors(cors);
  app.useGlobalInterceptors(new LoggingInterceptor());
  await app.listen(process.env.PORT ?? 3030);
}
bootstrap();
