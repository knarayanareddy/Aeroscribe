/**
 * CFD smoke test — proves the solver path and the GCI machinery end to end.
 *
 * ```bash
 * npm run smoke:cfd                       # synthetic benchmark, labelled
 * SU2_CFD_BINARY=/opt/su2/bin/SU2_CFD npm run smoke:cfd -- --solver su2 --workdir ./data/cfd
 * ```
 *
 * With `--solver su2` you must also pass three mesh configurations, either as
 * `--mesh fine:8000000:fine.cfg` triples (three of them) or via the existing
 * `--workdir` convention. Without a real binary the script refuses to run SU2
 * and says so; it never substitutes the synthetic solver silently.
 *
 * The synthetic mode prints a large banner because its number looks like a
 * result and is not one.
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CfdService } from '../src/cfd';
import { detectSu2, loadConfig } from '../src/config';

interface MeshArgument {
  level: string;
  cells: number;
  path: string;
}

function parseArgs(argv: readonly string[]): {
  solver: 'synthetic' | 'su2';
  quantity: string;
  caseDescription?: string;
  workDir: string;
  meshes: MeshArgument[];
} {
  let solver: 'synthetic' | 'su2' = 'synthetic';
  let quantity = 'drag coefficient';
  let caseDescription: string | undefined;
  let workDir = '';
  const meshes: MeshArgument[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    switch (argument) {
      case '--solver':
        solver = argv[++index] === 'su2' ? 'su2' : 'synthetic';
        break;
      case '--quantity':
        quantity = argv[++index] ?? quantity;
        break;
      case '--case':
        caseDescription = argv[++index];
        break;
      case '--workdir':
        workDir = argv[++index] ?? '';
        break;
      case '--mesh': {
        const [level, cells, path] = (argv[++index] ?? '').split(':');
        if (level && cells && path) {
          meshes.push({ level, cells: Number.parseInt(cells, 10), path });
        }
        break;
      }
      default:
        break;
    }
  }

  return { solver, quantity, caseDescription, workDir, meshes };
}

async function main(): Promise<number> {
  const config = loadConfig(process.env);
  const args = parseArgs(process.argv.slice(2));
  const workDir = resolve(args.workDir || `${config.dataDir}/cfd`);

  await mkdir(workDir, { recursive: true });

  const su2 = await detectSu2(config.su2Binary);
  const service = new CfdService({ su2, workDir });

  console.log('─'.repeat(72));
  console.log('AeroScribe CFD smoke test');
  console.log(`solver:    ${args.solver}`);
  console.log(`quantity:  ${args.quantity}`);
  console.log(`workdir:   ${workDir}`);
  console.log(`SU2:       ${su2.available ? su2.binary : 'not available'}`);
  console.log('─'.repeat(72));

  const result = await service.run(
    {
      quantity: args.quantity,
      ...(args.caseDescription ? { caseDescription: args.caseDescription } : {}),
      ...(args.meshes.length > 0 ? { meshes: args.meshes } : {}),
    },
    { solver: args.solver },
  );

  if (result.solver === 'synthetic') {
    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────────────┐');
    console.log('│ SYNTHETIC SOLVER — NOT A CFD RESULT                                  │');
    console.log('│ These numbers come from an analytic benchmark, not from fluid flow.  │');
    console.log('│ They exercise the verification path and must not be published.       │');
    console.log('└──────────────────────────────────────────────────────────────────────┘');
    console.log('');
  }

  const study = result.study;
  console.log(`solver:    ${result.solver}`);
  console.log(`method:    ${result.method}`);
  console.log(`value:     ${result.value.toPrecision(8)} ${result.unit}`);
  console.log(`uncertainty (GCI): ${result.uncertainty.toPrecision(3)}`);

  if (study) {
    console.log('\nmesh study');
    for (const level of study.levels) {
      console.log(
        `  ${level.level.padEnd(7)} ${String(level.cells).padStart(12)} cells  ` +
          `${level.value.toPrecision(8)}`,
      );
    }
    console.log(`\n  observed order    ${study.apparentOrder.toPrecision(4)}`);
    console.log(`  GCI (fine)        ${study.fineGciPercent.toPrecision(4)} %`);
    console.log(`  GCI (medium)      ${study.mediumGciPercent.toPrecision(4)} %`);
    console.log(`  asymptotic ratio  ${study.asymptoticRatio.toPrecision(4)} (1.000 ± 0.150)`);
    console.log(`  valid             ${study.valid ? 'yes' : `no — ${study.reason}`}`);
  } else {
    console.log('\nno grid-convergence study was produced; nothing may be quoted from this run.');
  }

  console.log('\nnotes');
  for (const note of result.notes) console.log(`  - ${note}`);

  console.log('\nartefacts');
  for (const artefact of result.artefacts) {
    console.log(`  ${artefact.name.padEnd(24)} sha256:${artefact.sha256}`);
  }

  if (result.disclaimer) {
    console.log('\ndisclaimer');
    console.log(`  ${result.disclaimer}`);
  }

  console.log('─'.repeat(72));

  if (!result.study?.valid) {
    console.error('Smoke test: the grid study is not valid, so this run cannot be quoted.');
    return 1;
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nSmoke test failed: ${message}`);
    if (/SU2/i.test(message)) {
      console.error('Set SU2_CFD_BINARY to an executable SU2_CFD, or run without --solver su2.');
    }
    process.exit(1);
  });
