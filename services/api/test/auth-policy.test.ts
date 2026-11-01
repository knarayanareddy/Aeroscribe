// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { auditActor, principalFromUser, ROLES, type Role } from '../src/auth/principal';
import { authorize, seesEveryRun, type Action } from '../src/auth/policy';
import type { Principal } from '../src/auth/principal';
import type { UserRecord } from '../src/store';
import { ApiError } from '../src/errors';

/**
 * The authorization table, one row at a time.
 *
 * A table test is the right shape here because the *table* is the rule: the
 * interesting question is never "does `authorize` throw" but "may a reviewer
 * advance a run they do not own", and the answer must be a single cell, visible
 * in one place, changing only when someone edits `policy.ts`.
 */

const ACTIONS: Action[] = [
  'run:create',
  'run:read',
  'run:advance',
  'gate:approve',
  'gate:reject',
  'audit:read',
  'users:read',
  'users:write',
];

function principal(role: Role, sub = 'user-a'): Principal {
  return { sub, email: null, name: null, role };
}

function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    sub: 'user-a',
    email: 'a@example.org',
    name: 'A',
    role: 'researcher',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** May this role do this, on a run owned by somebody else? */
function allowed(role: Role, action: Action, owner: string | null = 'user-other'): boolean {
  try {
    authorize(principal(role), action, { ownerSub: owner });
    return true;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    return false;
  }
}

describe('who may do what', () => {
  it('lets a researcher own, read, advance and gate their own run', () => {
    const owner = 'user-a';
    for (const action of ['run:read', 'run:advance', 'gate:approve', 'gate:reject'] as Action[]) {
      expect(allowed('researcher', action, owner)).toBe(true);
    }
    // Creating happens before there is a run to own, so no run is passed.
    expect(() => authorize(principal('researcher'), 'run:create')).not.toThrow();
  });

  it('stops a researcher at somebody else’s run', () => {
    expect(allowed('researcher', 'run:read', 'user-b')).toBe(false);
    expect(allowed('researcher', 'run:advance', 'user-b')).toBe(false);
    expect(allowed('researcher', 'gate:approve', 'user-b')).toBe(false);
    expect(allowed('researcher', 'gate:reject', 'user-b')).toBe(false);
  });

  it('lets a reviewer judge any run, and produce none', () => {
    expect(allowed('reviewer', 'run:read', 'user-b')).toBe(true);
    expect(allowed('reviewer', 'gate:approve', 'user-b')).toBe(true);
    expect(allowed('reviewer', 'gate:reject', 'user-b')).toBe(true);
    expect(allowed('reviewer', 'audit:read', 'user-b')).toBe(true);
    // Running a stage is the owner's work; judging it is the reviewer's. A
    // reviewer who could advance a run could write the evidence they approve.
    expect(allowed('reviewer', 'run:advance', 'user-b')).toBe(false);
    expect(allowed('reviewer', 'run:advance', 'user-a')).toBe(false);
    expect(allowed('reviewer', 'run:create', 'user-a')).toBe(false);
  });

  it('lets an admin do everything', () => {
    for (const action of ACTIONS) expect(allowed('admin', action, 'user-b')).toBe(true);
  });

  it('gives an unowned run to reviewers and admins only', () => {
    const legacy = null;
    expect(allowed('researcher', 'run:read', legacy)).toBe(false);
    expect(allowed('researcher', 'gate:approve', legacy)).toBe(false);
    expect(allowed('reviewer', 'run:read', legacy)).toBe(true);
    expect(allowed('admin', 'run:read', legacy)).toBe(true);
  });

  it('treats “no run” as “ownership is not the question”', () => {
    // Creating a run happens before there is anything to own.
    expect(() => authorize(principal('researcher'), 'run:create')).not.toThrow();
  });

  it('names the action, the role and the roles that would do', () => {
    try {
      authorize(principal('reviewer'), 'run:advance', { ownerSub: 'user-b' });
      throw new Error('expected a refusal');
    } catch (error) {
      const refusal = error as ApiError;
      expect(refusal.message).toMatch(/reviewer/);
      expect(refusal.message).toMatch(/run a stage/);
      expect(refusal.details).toMatchObject({
        action: 'run:advance',
        required: ['researcher', 'admin'],
      });
    }
  });

  it('shows researchers only their own runs, and the rest everything', () => {
    expect(seesEveryRun(principal('researcher'))).toBe(false);
    expect(seesEveryRun(principal('reviewer'))).toBe(true);
    expect(seesEveryRun(principal('admin'))).toBe(true);
  });

  it('has exactly three roles', () => {
    expect(ROLES).toEqual(['researcher', 'reviewer', 'admin']);
  });
});

describe('the audit actor', () => {
  it('is the subject, never the display name', () => {
    // A display name is a claim the caller makes; the subject is one the IdP
    // signed. Only one of them can be trusted in an audit trail.
    const user = userRecord({ sub: 'user-a', name: 'Ana (but really B)' });
    expect(auditActor(principalFromUser(user))).toBe('user:user-a');
  });

  it('carries the role from the stored record, not the token', () => {
    const user = userRecord({ role: 'reviewer', email: null, name: null });
    expect(principalFromUser(user)).toEqual({
      sub: 'user-a',
      email: null,
      name: null,
      role: 'reviewer',
    });
  });
});
