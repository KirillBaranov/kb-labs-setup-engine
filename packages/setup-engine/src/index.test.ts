import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type Analyzer,
  type AnalysisResult,
  type ChangeJournal,
  type ExecutionPlan,
  type ExecutionResult,
  type Planner
} from './index.js';
import { SetupBuilder } from '@kb-labs/setup-operations';

describe('@kb-labs/setup-engine contracts', () => {
  it('exposes the analyzer contract', () => {
    const analyzer: Analyzer = {
      async analyze() {
        const result: AnalysisResult = {
          needed: true,
          risk: 'safe'
        };
        return result;
      }
    };

    expect(analyzer).toBeDefined();
  });

  it('exposes planner and execution plan shapes', () => {
    const builder = new SetupBuilder();
    builder.ensureFile('.kb/example.txt', 'hello');
    const operations = builder.build().operations;

    const plan: ExecutionPlan = {
      stages: [
        {
          id: 'stage-1',
          operations,
          parallel: false
        }
      ],
      diff: {
        files: [],
        configs: [],
        summary: {
          created: 0,
          modified: 0,
          deleted: 0
        }
      },
      risks: {
        overall: 'safe',
        byOperation: new Map()
      }
    };

    const planner: Planner = {
      plan() {
        return plan;
      }
    };

    expect(planner.plan(operations, new Map())).toEqual(plan);
  });

  it('exposes the change journal interface', () => {
    const journal: ChangeJournal = {
      async startStage() {},
      async beforeOperation() {},
      async afterOperation() {},
      async commitStage() {},
      async rollback() {},
      getLogPath() {
        return '.kb/logs/setup/example.json';
      },
      getArtifacts() {
        return { backups: [], logs: [] };
      }
    };

    expect(journal.getLogPath()).toContain('.kb/logs/setup');
  });

  it('declares execution result shape', () => {
    expectTypeOf<ExecutionResult>().toMatchTypeOf({
      success: true,
      applied: [],
      rollbackAvailable: true
    });
  });
});


