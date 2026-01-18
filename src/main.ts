import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './commmon/interceptors/logging.interceptors';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cors = {
    origin: ['http://localhost:3000', 'https://zpzbzpbq-3000.asse.devtunnels.ms'],
    methods: 'GET, HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  };

  // Increase payload size limit for annotations (100MB)
  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ limit: '100mb', extended: true }));

  app.enableCors(cors);
  app.useGlobalInterceptors(new LoggingInterceptor());
  await app.listen(process.env.PORT ?? 3030);
}
bootstrap();
