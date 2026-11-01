import { ApiError } from '../errors';
import type { Principal, Role } from './principal';

/**
 * What a principal may do, in one table.
 *
 * The rule this file exists to state is that **being authenticated is not being
 * authorized**. Before accounts, any holder of the API key could approve any
 * gate on any run, and the trail recorded whatever name the caller typed. Now:
 *
 * - a researcher owns what they create and can read, advance and gate it;
 * - a reviewer judges: it can read any run, approve or reject its gates and read
 *   its audit trail, but it produces nothing — a reviewer who could run a stage
 *   could write the evidence it then approves;
 * - an admin can do everything, including changing somebody's role.
 *
 * `run.view` is what a null owner means: a run created before accounts existed
 * belongs to nobody, so only a reviewer or an admin may read it. Treating it as
 * everybody's would quietly hand every historical run to every new account.
 */
export type Action =
  | 'run:create'
  | 'run:read'
  | 'run:advance'
  | 'gate:approve'
  | 'gate:reject'
  | 'audit:read'
  | 'users:read'
  | 'users:write';

/** The part of a run authorization looks at. */
export interface RunOwnership {
  ownerSub?: string | null;
}

const ALLOWED: Record<Action, readonly Role[]> = {
  // Reviewers are deliberately absent: judging is the job, and a reviewer that
  // can start a run can approve a gate on work it produced.
  'run:create': ['researcher', 'admin'],
  'run:read': ['researcher', 'reviewer', 'admin'],
  'run:advance': ['researcher', 'admin'],
  'gate:approve': ['researcher', 'reviewer', 'admin'],
  'gate:reject': ['researcher', 'reviewer', 'admin'],
  'audit:read': ['researcher', 'reviewer', 'admin'],
  'users:read': ['admin'],
  'users:write': ['admin'],
};

/**
 * Does this role make the decision for *any* run, regardless of ownership?
 * Reviewers judge; admins do everything.
 */
function decidesForAnyRun(action: Action, role: Role): boolean {
  if (role === 'admin') return true;
  return (
    role === 'reviewer' &&
    (action === 'run:read' ||
      action === 'gate:approve' ||
      action === 'gate:reject' ||
      action === 'audit:read')
  );
}

/** True when the principal owns the run, or when ownership is not the question. */
function ownsRun(principal: Principal, run: RunOwnership | undefined): boolean {
  if (run === undefined) return true;
  return run.ownerSub === principal.sub;
}

/**
 * Throw `403` unless the principal may perform `action`.
 *
 * The refusal names the role the caller has and the role the action needs. A
 * bare "forbidden" leaves a researcher staring at a button and guessing; the
 * sentence the dashboard can show is "reviewer approval required".
 */
export function authorize(principal: Principal, action: Action, run?: RunOwnership): void {
  if (!ALLOWED[action].includes(principal.role)) {
    throw new ApiError(
      403,
      'forbidden',
      `Your role (${principal.role}) cannot ${describe(action)}. Required: ${requiredRoles(action)}.`,
      { action, role: principal.role, required: ALLOWED[action] },
    );
  }

  if (run === undefined || ownsRun(principal, run) || decidesForAnyRun(action, principal.role)) {
    return;
  }

  throw new ApiError(
    403,
    'forbidden',
    `This run belongs to another account. A ${principal.role} may only ${describe(action)} runs they created; a reviewer may approve gates on any run.`,
    { action, role: principal.role, owner: run.ownerSub ?? null },
  );
}

/** Whether a principal sees every run or only their own. */
export function seesEveryRun(principal: Principal): boolean {
  return principal.role === 'reviewer' || principal.role === 'admin';
}

function describe(action: Action): string {
  switch (action) {
    case 'run:create':
      return 'create a run';
    case 'run:read':
      return 'read this run';
    case 'run:advance':
      return 'run a stage of this run';
    case 'gate:approve':
      return 'approve this gate';
    case 'gate:reject':
      return 'reject this gate';
    case 'audit:read':
      return 'read this audit trail';
    case 'users:read':
      return 'list accounts';
    case 'users:write':
      return 'change a role';
  }
}

function requiredRoles(action: Action): string {
  return ALLOWED[action].join(' or ');
}
