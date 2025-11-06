import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './commmon/interceptors/logging.interceptors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cors = {
    origin: ['http://localhost:3001'],
    methods: 'GET, HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  };

  app.enableCors(cors);
  app.useGlobalInterceptors(new LoggingInterceptor());
  await app.listen(process.env.PORT ?? 3030);
}
bootstrap();
