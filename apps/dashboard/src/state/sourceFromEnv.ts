import { createApiSource } from './apiSource';
import { createFixtureSource } from './fixtureSource';
import type { RunSource } from './source';

/**
 * Choose the source **once**, at build time.
 *
 * The decision is made from the build environment rather than at runtime, so a
 * production bundle either contains an API URL or it does not — there is no
 * toggle a user can flip that quietly changes where numbers come from.
 *
 * `VITE_API_URL` set  → live mode, talking to that origin.
 * `VITE_API_URL` unset → fixtures, labelled as such on every screen.
 *
 * An empty string is used for the same-origin case: with the dev proxy or a
 * reverse proxy in front, the browser calls `/api/...` and never needs to know
 * the API's address. That is also the only way to have the API require a key
 * without putting one in the bundle.
 */
export function createSourceFromEnv(env: Record<string, string | undefined> = import.meta.env) {
  const url = env['VITE_API_URL'];
  if (url === undefined) return createFixtureSource();
  return createApiSource({ baseUrl: url });
}

export function isLiveBuild(env: Record<string, string | undefined> = import.meta.env): boolean {
  return env['VITE_API_URL'] !== undefined;
}

export type { RunSource };
