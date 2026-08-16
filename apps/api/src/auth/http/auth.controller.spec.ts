import { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '../application/auth.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('logs in and sets the session cookie', async () => {
    const authService = {
      login: vi.fn().mockResolvedValue({
        token: 'session-token',
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        absoluteExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
    } as unknown as AuthService;

    const controller = new AuthController(authService);

    const response = {
      cookie: vi.fn(),
    } as unknown as Response;

    const result = await controller.login(
      {
        email: 'user@example.com',
        password: 'correct-password',
      },
      response,
    );

    expect(result).toEqual({
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      absoluteExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(response.cookie).toHaveBeenCalledWith(
      'nova_session',
      'session-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('rejects invalid credentials', async () => {
    const authService = {
      login: vi.fn().mockResolvedValue(null),
    } as unknown as AuthService;

    const controller = new AuthController(authService);

    const response = {
      cookie: vi.fn(),
    } as unknown as Response;

    await expect(
      controller.login(
        {
          email: 'user@example.com',
          password: 'wrong-password',
        },
        response,
      ),
    ).rejects.toThrow('Invalid credentials');

    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('logs out and revokes the current session', async () => {
    const authService = {
      revokeSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;

    const controller = new AuthController(authService);

    const response = {
      clearCookie: vi.fn(),
    } as unknown as Response;

    const request = {
      cookies: {
        nova_session: 'session-token',
      },
    } as unknown as Request;

    const result = await controller.logout(
      request,
      response,
    );

    expect(result).toEqual({
      success: true,
    });

    expect(authService.revokeSession).toHaveBeenCalledWith(
      'session-token',
    );

    expect(response.clearCookie).toHaveBeenCalledWith(
      'nova_session',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('returns the authenticated session', async () => {
    const session = {
      id: 'session-id',
      identityId: 'identity-id',
    };

    const authService = {} as AuthService;

    const controller = new AuthController(authService);

    const request = {
      authSession: session,
    } as unknown as Parameters<
      AuthController['me']
    >[0];

    const result = await controller.me(request);

    expect(result).toEqual({
      session,
    });
  });
});
