// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { authSettings, describeCapabilities, loadConfig, type Config } from '../src/config';

/**
 * The three auth modes, decided at boot.
 *
 * Every refusal here is a deployment that would otherwise come up open, or come
 * up believing it is protected when it is not: a key nobody checks, a mode that
 * shares one credential and one that verifies people, an issuer over plain HTTP.
 * Each `throw` names the variable, so an operator fixes it in one read.
 */

const OIDC = {
  AEROSCRIBE_AUTH: 'oidc',
  OIDC_ISSUER: 'https://login.example.org/realms/aeroscribe',
  OIDC_AUDIENCE: 'aeroscribe-api',
} as const;

describe('choosing the mode', () => {
  it('derives token from a key and none from nothing', () => {
    expect(loadConfig({}).auth).toEqual({ mode: 'none', apiKey: '', oidc: null, adminSubs: [] });
    expect(loadConfig({ AEROSCRIBE_API_KEY: 'k' }).auth).toMatchObject({
      mode: 'token',
      apiKey: 'k',
      oidc: null,
    });
  });

  it('accepts each mode spelled out, in any case', () => {
    expect(loadConfig({ AEROSCRIBE_AUTH: 'NONE' }).auth?.mode).toBe('none');
    expect(loadConfig({ AEROSCRIBE_AUTH: 'Token', AEROSCRIBE_API_KEY: 'k' }).auth?.mode).toBe(
      'token',
    );
    expect(loadConfig(OIDC).auth?.mode).toBe('oidc');
  });

  it('refuses a mode it cannot implement', () => {
    expect(() => loadConfig({ AEROSCRIBE_AUTH: 'ldap' })).toThrow(/not a supported mode/);
  });

  it('refuses a key that no mode would check', () => {
    expect(() => loadConfig({ AEROSCRIBE_AUTH: 'none', AEROSCRIBE_API_KEY: 'k' })).toThrow(
      /a key the API ignores/,
    );
  });

  it('refuses token mode without a key', () => {
    expect(() => loadConfig({ AEROSCRIBE_AUTH: 'token' })).toThrow(/requires AEROSCRIBE_API_KEY/);
  });

  it('refuses an admin list nobody can satisfy', () => {
    expect(() => loadConfig({ AEROSCRIBE_ADMIN_SUBS: 'user-a' })).toThrow(
      /only means something with/,
    );
  });
});

describe('oidc', () => {
  it('reads the issuer, audience and defaults', () => {
    const auth = loadConfig(OIDC).auth!;
    expect(auth.apiKey).toBe('');
    expect(auth.oidc).toEqual({
      issuer: 'https://login.example.org/realms/aeroscribe',
      audience: 'aeroscribe-api',
      // The dashboard's client id defaults to the audience: one IdP client for
      // both is the common setup, and a second variable nobody sets is a trap.
      clientId: 'aeroscribe-api',
      scopes: ['openid', 'profile', 'email'],
      clockSkewSeconds: 60,
    });
  });

  it('trims a trailing slash off the issuer, so discovery does not double it', () => {
    const auth = loadConfig({ ...OIDC, OIDC_ISSUER: 'https://idp.example/' }).auth!;
    expect(auth.oidc?.issuer).toBe('https://idp.example');
  });

  it('splits scopes and admin subjects on the separators people type', () => {
    const auth = loadConfig({
      ...OIDC,
      OIDC_SCOPES: 'openid, profile  email',
      AEROSCRIBE_ADMIN_SUBS: ' user-a , user-b ,, ',
      OIDC_CLIENT_ID: 'aeroscribe-dashboard',
      OIDC_CLOCK_SKEW_SECONDS: '5',
    }).auth!;
    expect(auth.oidc?.scopes).toEqual(['openid', 'profile', 'email']);
    expect(auth.oidc?.clientId).toBe('aeroscribe-dashboard');
    expect(auth.oidc?.clockSkewSeconds).toBe(5);
    expect(auth.adminSubs).toEqual(['user-a', 'user-b']);
  });

  it('refuses a shared key beside an issuer', () => {
    expect(() => loadConfig({ ...OIDC, AEROSCRIBE_API_KEY: 'k' })).toThrow(
      /cannot be combined with AEROSCRIBE_API_KEY/,
    );
  });

  it('refuses an issuer without an audience, and the other way round', () => {
    expect(() => loadConfig({ AEROSCRIBE_AUTH: 'oidc', OIDC_AUDIENCE: 'a' })).toThrow(
      /requires OIDC_ISSUER/,
    );
    expect(() => loadConfig({ AEROSCRIBE_AUTH: 'oidc', OIDC_ISSUER: 'https://i.example' })).toThrow(
      /requires OIDC_AUDIENCE/,
    );
  });

  it('refuses a plain-HTTP issuer that is not loopback', () => {
    // Cleartext JWKS is a key set anyone on the path can replace.
    expect(() => loadConfig({ ...OIDC, OIDC_ISSUER: 'http://login.example.org' })).toThrow(
      /must be an https URL/,
    );
    expect(() => loadConfig({ ...OIDC, OIDC_ISSUER: 'not a url' })).toThrow(/must be an https URL/);
  });

  it('allows a loopback issuer, for a local IdP', () => {
    for (const issuer of ['http://localhost:8080', 'http://127.0.0.1:8080']) {
      expect(loadConfig({ ...OIDC, OIDC_ISSUER: issuer }).auth?.oidc?.issuer).toBe(issuer);
    }
  });
});

describe('what /health says about it', () => {
  function config(overrides: Partial<Config> = {}): Config {
    return { ...loadConfig({}), ...overrides };
  }

  it('reports the mode and the issuer, not just a boolean', async () => {
    const none = await describeCapabilities(config());
    expect(none.auth).toEqual({ required: false, mode: 'none', issuer: null });

    const token = await describeCapabilities(
      config({ apiKey: 'k', auth: loadConfig({ AEROSCRIBE_API_KEY: 'k' }).auth }),
    );
    expect(token.auth).toEqual({ required: true, mode: 'token', issuer: null });

    const oidc = await describeCapabilities(config({ auth: loadConfig(OIDC).auth }));
    expect(oidc.auth).toEqual({
      required: true,
      mode: 'oidc',
      issuer: 'https://login.example.org/realms/aeroscribe',
    });
  });

  it('derives the mode for a config built by hand, without an `auth` field', async () => {
    // Every test and every embedder builds `Config` literals; none of them had to
    // learn about `auth`, because a key still means token mode.
    const handBuilt: Config = { ...loadConfig({}), apiKey: 'k' };
    delete handBuilt.auth;

    expect((await describeCapabilities(handBuilt)).auth).toEqual({
      required: true,
      mode: 'token',
      issuer: null,
    });
    expect(authSettings(handBuilt)).toEqual({
      mode: 'token',
      apiKey: 'k',
      oidc: null,
      adminSubs: [],
    });

    const anonymous: Config = { ...loadConfig({}) };
    delete anonymous.auth;
    expect(authSettings(anonymous).mode).toBe('none');
  });
});
