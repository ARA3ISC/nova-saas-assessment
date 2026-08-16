import { AuthService } from '../application/auth.service';
import {
	Body,
	Controller,
	Delete,
	Get,
	Post,
	Req,
	Res,
	UnauthorizedException,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard';

import { Response } from 'express';

import { AuthenticatedRequest } from './auth.request';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) { }

	@Post('login')
	async login(
		@Body()
		body: {
			email: string;
			password: string;
		},
		@Res({ passthrough: true }) response: Response,
	) {
		const session = await this.authService.login(
			body.email,
			body.password,
		);

		if (!session) {
			throw new UnauthorizedException('Invalid credentials');
		}

		response.cookie('nova_session', session.token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			expires: session.expiresAt,
			path: '/',
		});

		return {
			expiresAt: session.expiresAt,
			absoluteExpiresAt: session.absoluteExpiresAt,
		};
	}

	@Delete('logout')
	async logout(
		@Req() request: AuthenticatedRequest,
		@Res({ passthrough: true }) response: Response,
	) {
		const token = request.cookies?.nova_session;

		if (token) {
			await this.authService.revokeSession(token);
		}

		response.clearCookie('nova_session', {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/',
		});

		return {
			success: true,
		};
	}

	@Get('me')
	@UseGuards(AuthGuard)
	async me(@Req() request: AuthenticatedRequest) {
		return {
			session: request.authSession,
		};
	}
}
