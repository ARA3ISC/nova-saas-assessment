import { Request } from 'express';

import { AccessService } from '../../access/application/access.service';
import { AuthService } from '../application/auth.service';

export type AuthenticatedRequest = Request & {
  cookies?: Record<string, string>;

  authSession?: Awaited<
    ReturnType<AuthService['validateSession']>
  >;

  effectiveAccess?: Awaited<
    ReturnType<AccessService['resolveEffectiveAccess']>
  >;
};
