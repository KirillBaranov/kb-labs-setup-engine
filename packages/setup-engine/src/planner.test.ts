import { describe, expect, it } from 'vitest';
import { createPlanner } from './planner.js';
import { createOperationRegistry } from './operation-registry.js';
import type {
  OperationMetadata,
  OperationWithMetadata,
  ConfigOperation,
  FileOperation,
} from '@kb-labs/setup-operations';
import type { AnalysisResult } from './contracts.js';

function withMetadata<T extends FileOperation | ConfigOperation>(
  id: string,
  operation: T,
  extra?: Partial<OperationMetadata>,
): OperationWithMetadata<T> {
  return {
    operation,
    metadata: {
      id,
      description: id,
      idempotent: true,
      reversible: true,
      ...extra,
    },
  };
}

describe('Planner', () => {
  it('sorts operations into dependency stages', () => {
    const fileOp = withMetadata('file-1', {
      kind: 'file',
      action: 'ensure',
      path: '.kb/demo.txt',
      content: 'demo',
    });

    const configOp = withMetadata(
      'config-1',
      {
        kind: 'config',
        action: 'merge',
        path: '.kb/kb-labs.config.json',
        pointer: '/plugins/demo',
        value: { enabled: true },
      },
      { dependencies: ['file-1'] },
    );

    const planner = createPlanner();
    const analysis = new Map<string, AnalysisResult>([
      [
        'file-1',
        {
          needed: true,
          risk: 'safe',
          current: { exists: false },
        },
      ],
      [
        'config-1',
        {
          needed: true,
          risk: 'moderate',
          current: undefined,
        },
      ],
    ]);

    const plan = planner.plan([fileOp, configOp], analysis);

    expect(plan.stages).toHaveLength(2);
    expect(plan.stages[0].operations[0].metadata.id).toBe('file-1');
    expect(plan.stages[1].operations[0].metadata.id).toBe('config-1');
    expect(plan.diff.files[0]).toMatchObject({
      path: '.kb/demo.txt',
      status: 'created',
    });
    expect(plan.diff.configs[0]).toMatchObject({
      pointer: '/plugins/demo',
      after: { enabled: true },
    });
  });

  it('emits warning for missing dependency and keeps operations in final stage', () => {
    const lonelyOp = withMetadata(
      'file-2',
      {
        kind: 'file',
        action: 'ensure',
        path: 'README.md',
        content: 'hello',
      },
      { dependencies: ['missing-op'] },
    );

    const planner = createPlanner();
    const analysis = new Map<string, AnalysisResult>([
      [
        'file-2',
        {
          needed: true,
          risk: 'safe',
          current: { exists: false },
        },
      ],
    ]);

    const plan = planner.plan([lonelyOp], analysis);

    expect(plan.warnings?.[0]).toContain('missing-op');
    expect(plan.stages[0].operations[0].metadata.id).toBe('file-2');
  });

  it('uses custom diff builder from registry', () => {
    const customOperation = withMetadata(
      'custom-1',
      {
        kind: 'custom',
        action: 'noop',
      } as any,
    );

    const registry = createOperationRegistry();
    registry.registerDiffBuilder('custom', () => ({
      path: 'virtual.json',
      pointer: '/custom/feature',
      after: { enabled: true },
    }));

    const planner = createPlanner({ registry, workspaceRoot: process.cwd() });
    const analysis = new Map<string, AnalysisResult>([
      [
        'custom-1',
        {
          needed: true,
          risk: 'safe',
        },
      ],
    ]);

    const plan = planner.plan([customOperation], analysis);
    expect(plan.diff.configs).toHaveLength(1);
    expect(plan.diff.configs[0].pointer).toBe('/custom/feature');
  });
});

