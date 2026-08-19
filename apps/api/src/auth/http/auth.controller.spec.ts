import { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '../application/auth.service';
import { AuthController } from './auth.controller';
import { SESSION_COOKIE_NAME } from './session-cookie';

describe('AuthController', () => {
  it('logs in and sets the session cookie', async () => {
    const authService = {
      login: vi.fn().mockResolvedValue({
        token: 'session-token',
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        absoluteExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
        mustChangePassword: false,
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
      { ip: '127.0.0.1' } as unknown as Parameters<AuthController['login']>[1],
      response,
    );

    expect(result).toEqual({
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      absoluteExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
      mustChangePassword: false,
    });

    expect(response.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'session-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        expires: new Date('2026-10-01T00:00:00.000Z'),
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
        { ip: '127.0.0.1' } as unknown as Parameters<AuthController['login']>[1],
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
        [SESSION_COOKIE_NAME]: 'session-token',
      },
    } as unknown as Request;

    const result = await controller.logout(request, response);

    expect(result).toEqual({
      success: true,
    });

    expect(authService.revokeSession).toHaveBeenCalledWith('session-token');

    expect(response.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      }),
    );
  });

  it('returns the authenticated session', async () => {
    const session = {
      id: 'session-id',
      identityId: 'identity-id',
      tokenHash: 'must-not-leave-the-api',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      absoluteExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
    };

    const identity = { id: 'identity-id', email: 'member@example.test' };
    const authService = {
      getIdentityContext: vi.fn().mockResolvedValue(identity),
    } as unknown as AuthService;

    const controller = new AuthController(authService);

    const request = {
      authSession: session,
    } as unknown as Parameters<AuthController['me']>[0];

    const result = await controller.me(request);

    expect(result).toEqual({
      session: {
        expiresAt: session.expiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
      },
      identity,
      mustChangePassword: false,
    });
  });
});
