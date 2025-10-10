import { 
  Controller, 
  Post, 
  Body, 
  Request, 
  UseGuards, 
  Get, 
  HttpCode,
  HttpStatus 
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './strategy/jwt-auth.guard';
import { Division } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: { email: string; name?: string; password: string; division: Division },
  ) {
    return this.authService.register({
      email: body.email,
      name: body.name ?? '',
      password: body.password,
      division: body.division,
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req) {
    return this.authService.logout(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('account')
  @HttpCode(HttpStatus.OK)
  async getAccount(@Request() req) {
    return this.authService.getAccount(req.user.id);
  }
}