import type { ReactNode } from 'react';
import { PrincipalContext } from './context';
import type { Principal } from './permissions';

/**
 * Who is using the app, or `null` when this deployment has no notion of people.
 *
 * Read by views that offer role-gated actions. Fixture and `token` deployments
 * never provide one, so their behaviour is unchanged.
 */
export function PrincipalProvider({
  principal,
  children,
}: {
  principal: Principal | null;
  children: ReactNode;
}) {
  return <PrincipalContext.Provider value={principal}>{children}</PrincipalContext.Provider>;
}
