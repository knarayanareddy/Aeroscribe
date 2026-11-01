import type { Role, UserRecord } from '../store';

export type { Role };
export { ROLES } from '../store';

/**
 * Who is making this request.
 *
 * There is no `Principal` in `none` or `token` mode: those modes authenticate a
 * *credential*, not a person, so the HTTP layer carries `null` and skips the
 * ownership checks rather than inventing an identity. `oidc` mode always has
 * one — the middleware refuses the request before a handler runs.
 */
export interface Principal {
  /** The OIDC subject: the only identifier authorization keys on. */
  sub: string;
  email: string | null;
  name: string | null;
  role: Role;
}

export function principalFromUser(user: UserRecord): Principal {
  return { sub: user.sub, email: user.email, name: user.name, role: user.role };
}

/**
 * How this principal is written into the audit trail.
 *
 * A `user:` prefix rather than a bare subject, so a reader can tell an identity
 * apart from the free-text `actor` a `none`/`token` deployment records.
 */
export function auditActor(principal: Principal): string {
  return `user:${principal.sub}`;
}
