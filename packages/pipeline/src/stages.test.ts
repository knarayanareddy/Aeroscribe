import { describe, expect, it } from 'vitest';
import {
  GATE_CHECKPOINTS,
  GATE_CHECKPOINT_COUNT,
  PIPELINE_STAGES,
  STAGE_COUNT,
  createRun,
} from './stages';

describe('stage catalogue', () => {
  it('has nine stages with sequential ids', () => {
    expect(STAGE_COUNT).toBe(9);
    expect(PIPELINE_STAGES.map((stage) => stage.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('lists eleven gate checkpoints: one per stage, three for stage 4', () => {
    expect(GATE_CHECKPOINT_COUNT).toBe(11);
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
    expect(new Set(GATE_CHECKPOINTS).size).toBe(GATE_CHECKPOINT_COUNT);
  });

  it('keeps each stage gateId equal to the first checkpoint of that stage', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stage.gateIds[0]).toBe(stage.gateId);
      expect(stage.gateIds.length).toBeGreaterThan(0);
    }
  });

  it('gives every stage a name, short name and at least one agent', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stage.name.length).toBeGreaterThan(0);
      expect(stage.shortName.length).toBeGreaterThan(0);
      expect(stage.agents.length).toBeGreaterThan(0);
    }
  });

  it('builds new runs from the catalogue without sharing stage objects', () => {
    const first = createRun({ id: 'a', topic: 'Wing morphing', journal: 'AIAA Journal' });
    const second = createRun({ id: 'b', topic: 'Wing morphing', journal: 'AIAA Journal' });

    expect(first.stages.map((stage) => stage.name)).toEqual(PIPELINE_STAGES.map((s) => s.name));
    expect(first.stages[0]).not.toBe(second.stages[0]);
  });
});
