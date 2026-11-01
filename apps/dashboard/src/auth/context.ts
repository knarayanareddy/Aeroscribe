import { createContext, useContext } from 'react';
import type { Principal } from './permissions';

/**
 * The principal, for views that offer role-gated actions.
 *
 * `null` when this deployment has no notion of people (fixture mode, `none`,
 * `token`), which is exactly when every control stays available.
 */
export const PrincipalContext = createContext<Principal | null>(null);

export function usePrincipal(): Principal | null {
  return useContext(PrincipalContext);
}
