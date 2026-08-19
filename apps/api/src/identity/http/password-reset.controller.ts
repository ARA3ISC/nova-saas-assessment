import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PasswordResetHttpService } from '../application/password-reset-http.service';
@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly reset: PasswordResetHttpService) {}
  @Post('request') async request(@Body() body: { email: string }, @Req() request: Request) {
    if (typeof body?.email === 'string' && body.email.trim()) {
      await this.reset.request(body.email, request.ip || request.socket.remoteAddress || 'unknown');
    }
    return { accepted: true };
  }
  @Post('complete') async complete(@Body() body: { token: string; password: string }) {
    if (typeof body?.token !== 'string' || !body.token || typeof body?.password !== 'string') {
      throw new BadRequestException('A reset token and new password are required');
    }
    try {
      return { accepted: await this.reset.complete(body.token, body.password) };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('at least 15 characters')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
