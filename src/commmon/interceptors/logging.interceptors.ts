import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, originalUrl, ip, body } = req;
    const start = Date.now();

    this.logger.log(
      `📥 Request: ${method} ${originalUrl} from ${ip} — body: ${JSON.stringify(
        body,
      )}`,
    );

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - start;
        this.logger.log(
          `  Response: ${method} ${originalUrl} — ${duration}ms — result: ${JSON.stringify(
            data,
          )}`,
        );
      }),
      catchError((error) => {
        const duration = Date.now() - start;
        this.logger.error(
          ` Error: ${method} ${originalUrl} — ${duration}ms — ${error.message}`,
          error.stack,
        );
        return throwError(() => error);
      }),
    );
  }
}
