# @kb-labs/setup-engine

Analysis, planning, execution, and journaling contracts for KB Labs setup workflows.

## Installation

```bash
pnpm add @kb-labs/setup-engine
# or
npm install @kb-labs/setup-engine
```

## Highlights

- Analyzer contracts for detecting existing workspace state
- Planner interfaces for building dependency-aware execution plans
- Executor contracts for transactional apply with rollback hooks
- Change journal abstractions for diffing, backups, and audit trails

## Usage

```ts
import type {
  Analyzer,
  ExecutionPlan,
  Executor,
  Planner
} from '@kb-labs/setup-engine';
import { SetupBuilder } from '@kb-labs/setup-operations';

const builder = new SetupBuilder();
builder.ensureFile('.kb/example/config.yml', 'enabled: true');

const operations = builder.build().operations;

const analyzer: Analyzer = {
  async analyze(operation) {
    return { needed: true, risk: 'safe' };
  }
};

const planner: Planner = {
  plan() {
    const plan: ExecutionPlan = {
      stages: [
        { id: 'stage-1', operations, parallel: false }
      ],
      diff: { files: [], configs: [], summary: { created: 0, modified: 0, deleted: 0 } },
      risks: { overall: 'safe', byOperation: new Map() }
    };
    return plan;
  }
};

const executor: Executor = {
  async execute(plan, options) {
    options.onProgress?.({
      stageId: plan.stages[0].id,
      operation: plan.stages[0].operations[0],
      status: 'completed'
    });

    return {
      success: true,
      applied: plan.stages.flatMap((stage) => stage.operations),
      rollbackAvailable: false
    };
  }
};
```

## License

MIT © KB Labs


