import { describe, expect, it } from 'vitest';
import {
  addValueNode,
  createEmptyModel,
  setExecution,
} from '../src/model/index.js';
import { createDefaultCombinerRegistry } from '../src/combiners/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';
import { executeModel } from '../src/execution/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

function singleNodeModel(steps: number) {
  let m = createEmptyModel();
  m = addValueNode(m, {
    id: 'n',
    label: 'N',
    unitId: 'count',
    unitOverride: { min: 0, max: 10 },
    initialNumber: 0,
  });
  m = setExecution(m, { steps });
  return m;
}

describe('executeModel — stepIntervalMs (P9)', () => {
  it('stepIntervalMs 전달 시 trajectory.simulationTimeMs 가 step 누적', () => {
    const traj = executeModel(singleNodeModel(10), {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      stepIntervalMs: 16,
    });
    expect(traj[0]!.simulationTimeMs).toBe(0);
    expect(traj[1]!.simulationTimeMs).toBe(16);
    expect(traj[10]!.simulationTimeMs).toBe(160);
  });

  it('stepIntervalMs 미전달 시 모든 step 의 simulationTimeMs 가 0 유지', () => {
    const traj = executeModel(singleNodeModel(5), {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    for (const s of traj) {
      expect(s.simulationTimeMs).toBe(0);
    }
  });

  it('stepIntervalMs=0 명시도 모든 step 0 유지', () => {
    const traj = executeModel(singleNodeModel(3), {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      stepIntervalMs: 0,
    });
    for (const s of traj) {
      expect(s.simulationTimeMs).toBe(0);
    }
  });
});
