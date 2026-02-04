import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LoggingInterceptor } from '../src/commmon/interceptors/logging.interceptors';
import { json, urlencoded } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

let app: NestExpressApplication;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create<NestExpressApplication>(AppModule);
    
    const cors = {
      origin: true, // Allow all origins in production, or specify your frontend URL
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    };

    // Increase payload size limit for annotations (100MB)
    app.use(json({ limit: '100mb' }));
    app.use(urlencoded({ limit: '100mb', extended: true }));

    app.enableCors(cors);
    app.useGlobalInterceptors(new LoggingInterceptor());
    
    await app.init();
  }
  
  return app;
}

export default async (req: any, res: any) => {
  const server = await bootstrap();
  return server.getHttpAdapter().getInstance()(req, res);
};
