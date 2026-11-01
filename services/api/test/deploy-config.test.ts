// @vitest-environment node
import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The deployment files are code that only runs on a host this repository cannot
 * reach from a test, and a wrong variable name there fails at 3 a.m. rather than
 * in review. These tests compare them to the things that define the truth: the
 * config loader, the API's own example file, and each other.
 *
 * They read the YAML with a line scanner rather than a parser on purpose. The
 * assertions are textual (which names appear, whether a service publishes a
 * port), and a YAML parser would be a new dependency carried by every build
 * just to answer them.
 */

const root = process.cwd();

async function readRepoFile(path: string): Promise<string> {
  return readFile(resolve(root, path), 'utf8');
}

/** The indented body of a top-level mapping key, e.g. `services:` or `networks:`. */
function block(source: string, key: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start === -1) throw new Error(`no top-level "${key}:" in the document`);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('#')) break;
    body.push(line);
  }
  return body.join('\n');
}

/** `services.<name>` bodies, split on the two-space service keys. */
function composeServices(source: string): Map<string, string> {
  const body = block(source, 'services');
  const services = new Map<string, string>();
  let current: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (current !== null) services.set(current, lines.join('\n'));
  };
  for (const line of body.split('\n')) {
    const match = /^ {2}([a-z][a-z0-9-]*):$/.exec(line);
    if (match) {
      flush();
      current = match[1]!;
      lines = [];
      continue;
    }
    if (current !== null) lines.push(line);
  }
  flush();
  return services;
}

/** The `environment:` mapping of one service, as key → raw value. */
function serviceEnvironment(service: string): Map<string, string> {
  const lines = service.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'environment:');
  if (start === -1) return new Map();
  const entries = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !line.startsWith('      ')) break;
    const match = /^\s{6}([A-Z][A-Z0-9_]+):\s*(.*)$/.exec(line);
    if (match) entries.set(match[1]!, match[2]!);
  }
  return entries;
}

/** Variable names `compose.yaml` interpolates, i.e. `${NAME…}`. */
function interpolatedNames(source: string): string[] {
  return Array.from(new Set(Array.from(source.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g), (m) => m[1]!)));
}

/** `NAME=` assignments in a dotenv file, values trimmed of a trailing comment. */
function dotenvAssignments(source: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of source.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) entries.set(match[1]!, match[2]!.trim());
  }
  return entries;
}

/** Settings the API reads, per `services/api/src/config.ts`. */
function apiEnvKeys(config: string): Set<string> {
  const wrapped = Array.from(
    config.matchAll(/env(?:String|Int|Bool)?\(\s*env,\s*'([A-Z0-9_]+)'/g),
    (m) => m[1]!,
  );
  const direct = Array.from(config.matchAll(/env\.([A-Z0-9_]{3,})/g), (m) => m[1]!);
  // Read by `services/api/src/index.ts`, outside the loader, like the example file says.
  return new Set([...wrapped, ...direct, 'SEMANTIC_SCHOLAR_API_KEY']);
}

describe('compose.yaml is wired to real configuration', () => {
  it('defines the stack the deployment documents describe', async () => {
    const compose = await readRepoFile('compose.yaml');
    const services = composeServices(compose);

    expect(Array.from(services.keys()).sort()).toEqual([
      'api',
      'caddy',
      'migrate',
      'postgres',
      'redis',
    ]);
  });

  it('interpolates only variables the root .env.example documents', async () => {
    const [compose, example] = await Promise.all([
      readRepoFile('compose.yaml'),
      readRepoFile('.env.example'),
    ]);
    const documented = new Set(dotenvAssignments(example).keys());

    expect(interpolatedNames(compose).length).toBeGreaterThan(5);
    for (const name of interpolatedNames(compose)) {
      expect(
        documented.has(name),
        `${name} is interpolated by compose.yaml but absent from .env.example`,
      ).toBe(true);
    }
  });

  it('passes the API only variables the API reads', async () => {
    const [compose, config] = await Promise.all([
      readRepoFile('compose.yaml'),
      readRepoFile('services/api/src/config.ts'),
    ]);
    const known = apiEnvKeys(config);
    const environment = serviceEnvironment(composeServices(compose).get('api')!);

    // The container cannot inherit a shell environment: every setting has to be
    // listed. A typo here is a setting that silently keeps its default.
    expect(environment.has('AEROSCRIBE_API_KEY')).toBe(true);
    expect(environment.has('AEROSCRIBE_DATABASE_URL')).toBe(true);
    expect(environment.has('AEROSCRIBE_REDIS_URL')).toBe(true);
    for (const key of environment.keys()) {
      expect(
        known.has(key),
        `compose passes ${key}, which services/api/src/config.ts never reads`,
      ).toBe(true);
    }
  });

  it('publishes no port except the edge', async () => {
    const services = composeServices(await readRepoFile('compose.yaml'));

    // The API injects a bearer token at the proxy and has no authentication of
    // its own beyond that key; a published 8787 would bypass TLS *and* the
    // key injection. Postgres and Redis must never be reachable off-host.
    for (const name of ['api', 'postgres', 'redis', 'migrate']) {
      expect(services.get(name)!.includes('\n    ports:'), `${name} must not publish a port`).toBe(
        false,
      );
    }
    expect(services.get('caddy')!).toContain('ports:');
  });

  it('keeps the datastores off any network with a route out', async () => {
    const compose = await readRepoFile('compose.yaml');
    const services = composeServices(compose);

    expect(block(compose, 'networks')).toContain('internal: true');
    for (const name of ['postgres', 'redis']) {
      expect(services.get(name)!).toContain('networks: [internal]');
      expect(services.get(name)!).not.toContain('edge');
    }
  });

  it('starts the API only after the schema exists', async () => {
    const services = composeServices(await readRepoFile('compose.yaml'));
    const api = services.get('api')!;
    const migrate = services.get('migrate')!;

    // `AEROSCRIBE_STORE=postgres` refuses to boot against an empty database, and
    // the service does not migrate on startup.
    expect(api).toContain('migrate:');
    expect(api).toContain('condition: service_completed_successfully');
    expect(migrate).toContain('services/api/scripts/db-migrate.ts');
    expect(migrate).toContain('restart: ');
  });

  it('builds the dashboard as a same-origin bundle', async () => {
    const [compose, dockerfile] = await Promise.all([
      readRepoFile('compose.yaml'),
      readRepoFile('docker/dashboard.Dockerfile'),
    ]);
    const caddy = composeServices(compose).get('caddy')!;

    // Present and empty is same-origin. Omitting the argument builds the
    // fixture-only dashboard, which must never be what a stack serves.
    expect(caddy).toMatch(/VITE_API_URL: ''/);
    // Served from the origin root, not from the Pages sub-path.
    expect(dockerfile).toContain('ENV BASE_PATH=/');
    expect(dockerfile).toMatch(/ARG VITE_API_URL/);
  });
});

describe('the edge refuses to leak the key or the API', () => {
  it('injects the bearer token upstream and nowhere else', async () => {
    const caddyfile = await readRepoFile('docker/Caddyfile');

    expect(caddyfile).toContain('header_up Authorization "Bearer {$AEROSCRIBE_API_KEY}"');
    expect(caddyfile).toContain('handle /api/*');
    expect(caddyfile).toContain('reverse_proxy api:8787');
    // Only for a request that brought no credential of its own, or an `oidc`
    // deployment would have every user's identity replaced by a shared key.
    expect(caddyfile).toContain('@anonymous not header Authorization *');
    // A response header would put the token in the browser, which is the one
    // thing the proxy exists to prevent.
    expect(caddyfile).not.toMatch(/^\s*header Authorization/m);
    expect(caddyfile).not.toContain('header X-Api-Key');
  });

  it('serves the single-page app from the origin root', async () => {
    const caddyfile = await readRepoFile('docker/Caddyfile');

    expect(caddyfile).toContain('try_files {path} /index.html');
    expect(caddyfile).toContain('root * /srv/www');
  });
});

describe('.env.example is safe to copy', () => {
  it('ships no secret and no enabled capability', async () => {
    const example = dotenvAssignments(await readRepoFile('.env.example'));

    // A default token is a published token; a default password is a published
    // password. compose.yaml's `:?` turns the empty password into a refusal,
    // and `AEROSCRIBE_AUTH` has to be chosen rather than inherited.
    expect(example.get('AEROSCRIBE_API_KEY')).toBe('');
    expect(example.get('AEROSCRIBE_DB_PASSWORD')).toBe('');
    expect(example.get('AEROSCRIBE_AUTH')).toBe('token');
    // Offline by default, and no solver/engine that the image does not contain.
    expect(example.get('AEROSCRIBE_OFFLINE')).toBe('true');
    expect(example.get('AEROSCRIBE_INSTALL_LATEX')).toBe('false');
    expect(example.get('SU2_CFD_BINARY')).toBe('');
    expect(example.get('LATEX_BINARY')).toBe('');
  });

  it('is not ignored by git', async () => {
    const [ignore, example] = await Promise.all([
      readRepoFile('.gitignore'),
      access(resolve(root, '.env.example')).then(
        () => true,
        () => false,
      ),
    ]);

    expect(example).toBe(true);
    expect(ignore).toContain('!.env.example');
  });
});

describe('the deploy workflows gate on the right environment', () => {
  it('releases from tags only', async () => {
    const workflow = await readRepoFile('.github/workflows/release-api.yml');

    // `push` must carry a tag filter; a branch filter would publish an image
    // from a commit nobody reviewed.
    expect(block(workflow, 'on')).toContain("tags: ['v*']");
    expect(block(workflow, 'on')).not.toContain('branches:');
    // And a release verifies what it published before anyone can deploy it.
    expect(workflow).toContain('scripts/smoke-deploy.sh');
    expect(workflow).toContain('sbom: true');
    expect(workflow).toContain('platforms: linux/amd64,linux/arm64');
  });

  it('runs staging behind the `staging` environment, and only by hand', async () => {
    const workflow = await readRepoFile('.github/workflows/deploy-staging.yml');
    const triggers = block(workflow, 'on');

    expect(triggers).toContain('workflow_dispatch:');
    expect(triggers).not.toContain('push:');
    // The environment is what carries the secrets and, in production, the
    // reviewers; a deploy job outside one inherits the repository's secrets.
    expect(workflow).toContain('      name: staging');
    expect(workflow).toContain('scripts/smoke-deploy.sh');
    // The stage-8 blocker is the acceptance criterion, and it is asserted, not
    // assumed: the smoke test is told which solver to expect.
    expect(workflow).toContain('--expect-solver');
  });

  it('cannot deploy production without reviewers, and never skips TLS', async () => {
    const workflow = await readRepoFile('.github/workflows/deploy-production.yml');
    const triggers = block(workflow, 'on');

    expect(triggers).toContain('workflow_dispatch:');
    expect(triggers).not.toContain('push:');
    // Required reviewers are configured on the environment, not in this file;
    // declaring the environment is what lets that gate apply at all.
    expect(workflow).toContain('      name: production');
    // A mistyped tag deploys the wrong release; the confirmation is compared to
    // the tag before anything is fetched.
    expect(workflow).toContain('CONFIRM: ${{ inputs.confirm }}');
    expect(workflow).toContain('confirmation');
    // A self-signed certificate is a staging problem. Production has no flag
    // that turns verification off — the file may *mention* the flag in prose,
    // so the assertion is on invocations, not on the string.
    const insecureInvocations = workflow
      .split('\n')
      .filter((line) => line.includes('--insecure') && !line.trim().startsWith('#'));
    expect(insecureInvocations).toEqual([]);
    // The digest staging proved can be pinned instead of a tag.
    expect(workflow).toContain('sha256:');
  });

  it('writes the host environment file as a private file', async () => {
    for (const file of ['deploy-staging.yml', 'deploy-production.yml']) {
      const workflow = await readRepoFile(`.github/workflows/${file}`);
      // It holds the bearer token and the database password.
      expect(workflow, `${file} must create .env with mode 600`).toContain('install -m 600');
      expect(workflow).toContain("trap 'rm -f deploy.env' EXIT");
    }
  });
});
