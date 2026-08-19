const secureCookies = process.env.NODE_ENV === 'production';

// Browsers reject Secure/__Host- cookies over a plain local HTTP origin. The
// production contract remains host-only and Secure; local development uses a
// distinct non-production name so it cannot be mistaken for that cookie.
export const SESSION_COOKIE_NAME = secureCookies ? '__Host-nova_session' : 'nova_session';
export const sessionCookieOptions = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: 'strict' as const,
  path: '/',
};
export const csrfCookieOptions = {
  httpOnly: false,
  secure: secureCookies,
  sameSite: 'strict' as const,
  path: '/',
};
