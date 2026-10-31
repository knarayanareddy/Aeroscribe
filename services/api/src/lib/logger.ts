/**
 * A dependency-free structured logger.
 *
 * One JSON object per line on stdout, because the only consumer that matters
 * during an incident is `jq`. Fields are flat, key order is stable, and every
 * line carries the request scope bound by `requestContext.ts`.
 *
 * Two protections are built in rather than left to callers:
 * - **Key redaction.** A field named like a credential (`authorization`,
 *   `apiKey`, `password`, …) is masked wherever it appears, at any depth.
 * - **Value redaction.** Values the operator declared secret (the API key, the
 *   Semantic Scholar key) are masked even if they arrive under an innocent
 *   field name — for example a message that interpolated a URL with a key in it.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export type LogFields = Record<string, unknown>;

export interface Logger {
  readonly level: LogLevel;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** A logger that adds the given fields to every line it writes. */
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Where each serialised line goes. Defaults to stdout. */
  sink?: (line: string) => void;
  /** Fields bound to every line from this logger. */
  bindings?: LogFields;
  /** Values that must never appear in output, whatever their field name. */
  secrets?: readonly string[];
  /** Injected for tests; the default is the real clock. */
  clock?: () => Date;
}

/** Field names whose values are credentials by definition. */
const SECRET_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|apikey|password|passwd|secret|token|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key)$/i;

const REDACTED = '[redacted]';
const MAX_DEPTH = 5;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactValue(value: string, secrets: readonly string[]): string {
  for (const secret of secrets) {
    // Short strings would redact half the log; a real key is never that short.
    if (secret.length >= 8 && value.includes(secret)) return REDACTED;
  }
  return value;
}

function serialise(value: unknown, secrets: readonly string[], depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactValue(value, secrets);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redactValue(value.message, secrets) };
  }

  if (depth >= MAX_DEPTH) return '[depth limit]';

  if (Array.isArray(value)) {
    return value.map((entry) => serialise(entry, secrets, depth + 1));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (SECRET_KEY.test(key)) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = serialise(value[key], secrets, depth + 1);
    }
    return result;
  }

  // Functions and symbols carry no useful information in a log line.
  return `[${typeof value}]`;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const secrets = options.secrets ?? [];
  const clock = options.clock ?? (() => new Date());
  const bindings = options.bindings ?? {};
  const threshold = SEVERITY[level];

  const write = (severity: Exclude<LogLevel, 'silent'>, event: string, fields?: LogFields) => {
    if (SEVERITY[severity] < threshold) return;
    const line = {
      ts: clock().toISOString(),
      level: severity,
      event,
      ...(serialise(bindings, secrets) as Record<string, unknown>),
      ...(fields ? (serialise(fields, secrets) as Record<string, unknown>) : {}),
    };
    sink(JSON.stringify(line));
  };

  return {
    level,
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
    child: (extra) => createLogger({ ...options, bindings: { ...bindings, ...extra } }),
  };
}

/** A logger that writes nothing; used where output would be noise (tests, CLIs). */
export function silentLogger(): Logger {
  return createLogger({ level: 'silent', sink: () => undefined });
}

/** Narrow an arbitrary string to a level, falling back rather than throwing. */
export function parseLogLevel(raw: string | undefined, fallback: LogLevel = 'info'): LogLevel {
  const value = raw?.trim().toLowerCase();
  if (value && value in SEVERITY) return value as LogLevel;
  return fallback;
}
