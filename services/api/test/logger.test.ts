// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createLogger, parseLogLevel, silentLogger } from '../src/lib/logger';
import {
  bindRunId,
  currentRequestScope,
  runIdFromPath,
  runWithRequestScope,
  scopeFields,
} from '../src/lib/requestContext';

/** A logger whose output is captured as parsed objects. */
function capture(options: Parameters<typeof createLogger>[0] = {}) {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger({
    level: 'debug',
    clock: () => new Date('2026-10-31T10:00:00.000Z'),
    sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
    ...options,
  });
  return { logger, lines };
}

describe('logger', () => {
  it('writes one JSON object per line with a stable envelope', () => {
    const { logger, lines } = capture();
    logger.info('stage.end', { run_id: 'run-1', evidence_seq: 4 });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      ts: '2026-10-31T10:00:00.000Z',
      level: 'info',
      event: 'stage.end',
      run_id: 'run-1',
      evidence_seq: 4,
    });
  });

  it('drops events below the configured level', () => {
    const { logger, lines } = capture({ level: 'warn' });
    logger.debug('ignored');
    logger.info('ignored');
    logger.warn('kept');
    logger.error('kept');

    expect(lines.map((line) => line.event)).toEqual(['kept', 'kept']);
  });

  it('silences everything at level silent', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'silent', sink: (line) => lines.push(line) });
    logger.error('nope');
    expect(lines).toEqual([]);
    expect(silentLogger().level).toBe('silent');
  });

  it('merges child bindings and lets call fields win', () => {
    const { logger, lines } = capture();
    logger.child({ run_id: 'run-1', stage_id: 3 }).warn('stage.failed', {
      stage_id: 4,
      error: 'solver exited 1',
    });

    expect(lines[0]).toMatchObject({ run_id: 'run-1', stage_id: 4, error: 'solver exited 1' });
  });

  it('masks credentials by field name, at any depth', () => {
    const { logger, lines } = capture();
    logger.info('config', {
      apiKey: 'abcdef123456',
      headers: { authorization: 'Bearer abc', accept: 'application/json' },
      nested: [{ password: 'hunter22', token: 'zzz' }],
    });

    const serialised = JSON.stringify(lines[0]);
    expect(serialised).not.toContain('abcdef123456');
    expect(serialised).not.toContain('Bearer abc');
    expect(serialised).not.toContain('hunter22');
    expect(serialised).toContain('[redacted]');
    // Non-secret neighbours survive.
    expect(serialised).toContain('application/json');
  });

  it('masks declared secret values even under an innocent field name', () => {
    const { logger, lines } = capture({ secrets: ['sk-live-1234567890'] });
    logger.info('provider.call', {
      url: 'https://api.example.org/search?key=sk-live-1234567890',
      note: 'using sk-live-1234567890',
    });

    const serialised = JSON.stringify(lines[0]);
    expect(serialised).not.toContain('sk-live-1234567890');
    expect(serialised).toContain('[redacted]');
  });

  it('ignores short secrets so ordinary text is not mangled', () => {
    const { logger, lines } = capture({ secrets: ['abc'] });
    logger.info('tick', { value: 'abcdef' });
    expect(lines[0]!.value).toBe('abcdef');
  });

  it('serialises errors, dates and bigints without throwing', () => {
    const { logger, lines } = capture();
    const error = new TypeError('solver failed');
    logger.error('stage.failed', {
      error,
      at: new Date('2026-10-31T11:00:00.000Z'),
      count: 10n,
      nothing: undefined,
      fn: () => undefined,
    });

    expect(lines[0]).toMatchObject({
      error: { name: 'TypeError', message: 'solver failed' },
      at: '2026-10-31T11:00:00.000Z',
      count: '10',
      fn: '[function]',
    });
    expect(lines[0]).not.toHaveProperty('nothing');
  });

  it('stops descending instead of recursing forever', () => {
    const { logger, lines } = capture();
    const deep = { a: { b: { c: { d: { e: { f: 'too deep' } } } } } };
    expect(() => logger.info('deep', deep)).not.toThrow();
    expect(JSON.stringify(lines[0])).toContain('[depth limit]');
  });

  it('parses levels leniently', () => {
    expect(parseLogLevel('WARN')).toBe('warn');
    expect(parseLogLevel(' debug ')).toBe('debug');
    expect(parseLogLevel('chatty')).toBe('info');
    expect(parseLogLevel(undefined)).toBe('info');
    expect(parseLogLevel('', 'error')).toBe('error');
  });
});

describe('request context', () => {
  it('exposes the scope to async continuations', async () => {
    await runWithRequestScope({ requestId: 'req-1', runId: 'run-9' }, async () => {
      await Promise.resolve();
      expect(currentRequestScope()).toMatchObject({ requestId: 'req-1', runId: 'run-9' });
      expect(scopeFields()).toEqual({ request_id: 'req-1', run_id: 'run-9' });
    });
  });

  it('is empty outside a request', () => {
    expect(currentRequestScope()).toBeUndefined();
    expect(scopeFields()).toEqual({});
    // Binding outside a request must not throw.
    expect(() => bindRunId('run-1')).not.toThrow();
  });

  it('lets a handler attach a run id after the fact', () => {
    runWithRequestScope({ requestId: 'req-2' }, () => {
      expect(scopeFields()).toEqual({ request_id: 'req-2' });
      bindRunId('run-7');
      expect(scopeFields()).toEqual({ request_id: 'req-2', run_id: 'run-7' });
    });
  });

  it('reads a run id from a run-scoped path only', () => {
    expect(runIdFromPath('/api/v1/runs/run-abc')).toBe('run-abc');
    expect(runIdFromPath('/api/v1/runs/run-abc/gates/GATE-0/approve')).toBe('run-abc');
    expect(runIdFromPath('/api/v1/runs/run-abc?x=1')).toBe('run-abc');
    expect(runIdFromPath('/api/v1/runs')).toBeUndefined();
    expect(runIdFromPath('/health')).toBeUndefined();
    expect(runIdFromPath('/api/v1/evidence/verify')).toBeUndefined();
  });
});
