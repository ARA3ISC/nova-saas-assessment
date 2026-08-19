import { AuthService } from '../application/auth.service';
import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from './session.guard';

import { Response } from 'express';

import { AuthenticatedRequest } from './auth.request';
import { csrfCookieOptions, SESSION_COOKIE_NAME, sessionCookieOptions } from './session-cookie';
import { CSRF_COOKIE_NAME } from './csrf.guard';
import { CsrfGuard } from './csrf.guard';
import { randomBytes } from 'node:crypto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body()
    body: {
      email: string;
      password: string;
    },
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(
      body.email,
      body.password,
      request.ip || request.socket.remoteAddress || 'unknown',
    );

    if (!session) {
      throw new UnauthorizedException('Invalid credentials');
    }

    response.cookie(SESSION_COOKIE_NAME, session.token, {
      ...sessionCookieOptions,
      expires: session.absoluteExpiresAt,
    });
    response.cookie(CSRF_COOKIE_NAME, randomBytes(32).toString('base64url'), csrfCookieOptions);

    return {
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      mustChangePassword: session.mustChangePassword,
    };
  }

  @Post('complete-required-password-change')
  @UseGuards(SessionGuard, CsrfGuard)
  async completeRequiredPasswordChange(
    @Body() body: { password: string },
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identityId = request.authSession!.identityId;
    let session;
    try {
      session = await this.authService.completeRequiredPasswordChange(identityId, body.password);
    } catch (error) {
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
    if (!session) throw new UnauthorizedException('Password change is not available');
    response.cookie(SESSION_COOKIE_NAME, session.token, {
      ...sessionCookieOptions,
      expires: session.absoluteExpiresAt,
    });
    response.cookie(CSRF_COOKIE_NAME, randomBytes(32).toString('base64url'), csrfCookieOptions);
    return { expiresAt: session.expiresAt, absoluteExpiresAt: session.absoluteExpiresAt };
  }

  @Delete('logout')
  @UseGuards(CsrfGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (token) {
      await this.authService.revokeSession(token);
    }

    response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
    response.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions);

    return {
      success: true,
    };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() request: AuthenticatedRequest) {
    const identityId = request.authSession!.identityId;
    return {
      session: {
        expiresAt: request.authSession!.expiresAt,
        absoluteExpiresAt: request.authSession!.absoluteExpiresAt,
      },
      identity: await this.authService.getIdentityContext(identityId),
      mustChangePassword:
        request.authSession!.identity?.passwordCredential?.mustChangePassword ?? false,
    };
  }
}
