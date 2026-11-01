import { describe, expect, it } from 'vitest';
import { canAdvance, canDecideGate, whyNot, type Principal } from './permissions';

/**
 * The UI's copy of the server's table.
 *
 * It is tested as a table because that is how it is written on the server, and
 * because the failure mode this prevents is a button that cannot work: a
 * reviewer offered "Run next stage", a researcher offered approve on a run they
 * cannot read. The API still refuses; this is about not asking.
 */

function who(role: Principal['role'], sub = 'user-a'): Principal {
  return { sub, email: null, name: null, role };
}

describe('what the UI offers', () => {
  it('offers everything when the deployment has no roles', () => {
    expect(canAdvance(null, 'user-b')).toBe(true);
    expect(canDecideGate(null, 'user-b')).toBe(true);
  });

  it('keeps a reviewer out of producing', () => {
    expect(canAdvance(who('reviewer'), 'user-a')).toBe(false);
    expect(canAdvance(who('reviewer'), 'user-b')).toBe(false);
    // ...but it may judge anybody's gate.
    expect(canDecideGate(who('reviewer'), 'user-b')).toBe(true);
  });

  it('scopes a researcher to their own runs', () => {
    expect(canAdvance(who('researcher'), 'user-a')).toBe(true);
    expect(canDecideGate(who('researcher'), 'user-a')).toBe(true);
    expect(canAdvance(who('researcher'), 'user-b')).toBe(false);
    expect(canDecideGate(who('researcher'), 'user-b')).toBe(false);
  });

  it('locks a researcher out of a run with no owner', () => {
    // A run from before accounts belongs to nobody, which is not everybody.
    expect(canAdvance(who('researcher'), null)).toBe(false);
    expect(canAdvance(who('researcher'), undefined)).toBe(false);
    expect(canDecideGate(who('admin'), null)).toBe(true);
  });

  it('lets an admin do everything', () => {
    for (const owner of ['user-a', 'user-b', null, undefined]) {
      expect(canAdvance(who('admin'), owner)).toBe(true);
      expect(canDecideGate(who('admin'), owner)).toBe(true);
    }
  });

  it('explains a disabled control in a sentence a person can act on', () => {
    expect(whyNot(who('reviewer'), 'advance')).toMatch(/reviewer judges/);
    expect(whyNot(who('researcher'), 'advance')).toMatch(/another account/);
    expect(whyNot(who('researcher'), 'gate')).toMatch(/owner of this run/);
    expect(whyNot(null, 'gate')).toMatch(/not available/);
  });
});
