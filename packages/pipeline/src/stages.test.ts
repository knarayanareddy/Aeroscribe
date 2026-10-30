import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CFD_GATE_CHECKPOINTS,
  GATE_CHECKPOINTS,
  GATE_CHECKPOINT_COUNT,
  PIPELINE_STAGES,
  STAGE_COUNT,
  createRun,
  createStages,
} from './index';

describe('the stage catalogue', () => {
  it('has nine stages, numbered 0..8 in order', () => {
    expect(STAGE_COUNT).toBe(9);
    expect(PIPELINE_STAGES.map((stage) => stage.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('gives every stage a gate, and that gate is its first checkpoint', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stage.gateIds.length).toBeGreaterThan(0);
      expect(stage.gateId).toBe(stage.gateIds[0]);
    }
  });
});

describe('gate checkpoints', () => {
  it('counts eleven checkpoints for nine stages', () => {
    expect(GATE_CHECKPOINT_COUNT).toBe(11);
    // Stage 4 is the only stage with more than one checkpoint.
    expect(GATE_CHECKPOINT_COUNT).toBe(STAGE_COUNT + 2);
  });

  it('lists the checkpoints in stage order', () => {
    expect(GATE_CHECKPOINTS).toEqual([
      'GATE-0',
      'GATE-1',
      'GATE-2',
      'GATE-3',
      'GATE-4A',
      'GATE-4B',
      'GATE-4C',
      'GATE-5',
      'GATE-6',
      'GATE-7',
      'GATE-8',
    ]);
  });

  it('gives stage 4 exactly the three specification checkpoints', () => {
    const stage = PIPELINE_STAGES.find((candidate) => candidate.id === 4);
    expect(stage?.gateIds).toEqual(['GATE-4A', 'GATE-4B', 'GATE-4C']);
    expect(stage?.gateIds).toEqual([...CFD_GATE_CHECKPOINTS]);
  });

  it('never repeats a checkpoint id', () => {
    expect(new Set(GATE_CHECKPOINTS).size).toBe(GATE_CHECKPOINT_COUNT);
  });
});

describe('the derived count cannot drift from the UI', () => {
  it('leaves no literal gateway count in the components that show it', async () => {
    // The landing hero used to hardcode "9" and "11" next to each other, which
    // is exactly how the two numbers drifted apart on the live site.
    const files = [
      'apps/landing-page/src/components/Hero.tsx',
      'apps/landing-page/src/components/HowItWorks.tsx',
      'apps/dashboard/src/components/Dashboard.tsx',
    ];

    for (const file of files) {
      // Vitest runs from the repository root, so a relative path is enough and
      // avoids depending on the bundler's `import.meta.url` rewriting.
      const source = await readFile(resolve(process.cwd(), file), 'utf8');
      expect(source, `${file} must derive the checkpoint count`).toMatch(/GATE_CHECKPOINT_COUNT/);
    }
  });
});

describe('createStages', () => {
  it('returns independent stage objects on every call', () => {
    const first = createStages();
    const second = createStages();

    expect(first).toHaveLength(STAGE_COUNT);
    expect(first[0]).not.toBe(second[0]);
    expect(first[0]!.agentsActive).not.toBe(second[0]!.agentsActive);

    const firstStage = first[0]!;
    const secondStage = second[0]!;
    firstStage.metrics!.changed = 1;
    expect(secondStage.metrics!.changed).toBeUndefined();
  });

  it('starts the first stage and leaves the rest pending', () => {
    const stages = createRun({
      id: 'run-1',
      topic: 'transonic wing drag prediction',
      journal: 'AIAA Journal',
    }).stages;

    expect(stages[0]!.status).toBe('running');
    expect(stages.slice(1).every((stage) => stage.status === 'pending')).toBe(true);
  });
});
