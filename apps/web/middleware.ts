import { NextRequest, NextResponse } from 'next/server';

const DEVELOPMENT_SESSION_COOKIE = 'nova_session';
const PRODUCTION_SESSION_COOKIE = '__Host-nova_session';

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === '/platform/bootstrap' ||
    request.nextUrl.pathname === '/password-change-required'
  )
    return NextResponse.next();

  const hasSession =
    request.cookies.has(DEVELOPMENT_SESSION_COOKIE) ||
    request.cookies.has(PRODUCTION_SESSION_COOKIE);
  if (hasSession) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('returnTo', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    '/',
    '/portfolio',
    '/administration/:path*',
    '/platform/:path*',
    '/password-change-required',
  ],
};
