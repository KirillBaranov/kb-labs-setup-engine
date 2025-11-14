import type {
  Operation,
  OperationWithMetadata,
} from '@kb-labs/setup-operations';
import type {
  AnalysisResult,
  ExecutionPlan,
  FileDiff,
  ConfigDiff,
  DiffSummary,
  Planner,
  PlanStage,
  RiskAssessment,
  OperationRiskLevel,
} from './contracts.js';
import type {
  OperationRegistry,
  DiffBuilder,
  DiffBuilderContext,
  DiffBuilderResult,
} from './operation-registry.js';

const RISK_WEIGHT: Record<OperationRiskLevel, number> = {
  safe: 0,
  moderate: 1,
  high: 2,
};

export interface PlannerFactoryOptions {
  registry?: OperationRegistry;
  workspaceRoot?: string;
}

export function createPlanner(options: PlannerFactoryOptions = {}): Planner {
  return {
    plan(
      operations: OperationWithMetadata[],
      analysis: Map<string, AnalysisResult>
    ): ExecutionPlan {
      const warnings: string[] = [];
      const stages = buildStages(operations, warnings);
      const diff = buildDiff(
        operations,
        analysis,
        options.registry,
        options.workspaceRoot,
      );
      const risks = buildRiskAssessment(operations, analysis);

      return {
        stages,
        diff,
        risks,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    },
  };
}

function buildStages(
  operations: OperationWithMetadata[],
  warnings: string[],
): PlanStage[] {
  const idToOperation = new Map<string, OperationWithMetadata>(
    operations.map((op) => [op.metadata.id, op]),
  );

  const indegree = new Map<string, number>();
  const graph = new Map<string, Set<string>>();

  for (const op of operations) {
    indegree.set(op.metadata.id, 0);
  }

  for (const op of operations) {
    const deps = op.metadata.dependencies ?? [];
    for (const dep of deps) {
      if (!idToOperation.has(dep)) {
        warnings.push(
          `Operation ${op.metadata.id} depends on missing operation ${dep}. It will run anyway.`,
        );
        continue;
      }

      indegree.set(op.metadata.id, (indegree.get(op.metadata.id) ?? 0) + 1);
      if (!graph.has(dep)) {
        graph.set(dep, new Set());
      }
      graph.get(dep)!.add(op.metadata.id);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of indegree.entries()) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const stages: PlanStage[] = [];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const levelSize = queue.length;
    const stageOperations: OperationWithMetadata[] = [];

    for (let i = 0; i < levelSize; i += 1) {
      const id = queue.shift()!;
      if (processed.has(id)) {
        continue;
      }

      const op = idToOperation.get(id);
      if (!op) {
        continue;
      }
      stageOperations.push(op);
      processed.add(id);

      for (const neighbour of graph.get(id) ?? []) {
        const next = (indegree.get(neighbour) ?? 0) - 1;
        indegree.set(neighbour, next);
        if (next === 0) {
          queue.push(neighbour);
        }
      }
    }

    if (stageOperations.length > 0) {
      stages.push({
        id: `stage-${stages.length + 1}`,
        operations: stageOperations,
        parallel: stageOperations.length > 1,
      });
    }
  }

  if (processed.size !== operations.length) {
    warnings.push(
      'Detected dependency cycle. Remaining operations will execute sequentially in declared order.',
    );

    for (const op of operations) {
      if (!processed.has(op.metadata.id)) {
        stages.push({
          id: `stage-${stages.length + 1}`,
          operations: [op],
          parallel: false,
        });
        processed.add(op.metadata.id);
      }
    }
  }

  if (stages.length === 0) {
    stages.push({
      id: 'stage-1',
      operations,
      parallel: operations.length > 1,
    });
  }

  return stages;
}

function buildDiff(
  operations: OperationWithMetadata[],
  analysis: Map<string, AnalysisResult>,
  registry?: OperationRegistry,
  workspaceRoot?: string,
) {
  const files: FileDiff[] = [];
  const configs: ConfigDiff[] = [];
  const diffContext: DiffBuilderContext = {
    workspaceRoot: workspaceRoot ?? process.cwd(),
  };

  for (const operation of operations) {
    const analysisResult = analysis.get(operation.metadata.id);
    const customBuilder = registry?.getDiffBuilder(operation.operation.kind);
    const customDiff = customBuilder?.(operation, analysisResult, diffContext);

    if (customDiff) {
      if (isFileDiff(customDiff)) {
        files.push(customDiff);
      } else {
        configs.push(customDiff);
      }
      continue;
    }

    if (operation.operation.kind === 'file') {
      const diff = buildFileDiff(operation.operation, analysisResult);
      if (diff) {
        files.push(diff);
      }
      continue;
    }

    if (operation.operation.kind === 'config') {
      const diff = buildConfigDiff(operation.operation, analysisResult);
      if (diff) {
        configs.push(diff);
      }
    }
  }

  return {
    files,
    configs,
    summary: summarise(files, configs),
  };
}

function buildFileDiff(
  operation: Operation,
  analysisResult?: AnalysisResult,
): FileDiff | null {
  if (operation.kind !== 'file') {
    return null;
  }

  const current = normalizeFileSnapshot(analysisResult?.current);
  let status: FileDiff['status'];
  if (operation.action === 'delete') {
    status = 'deleted';
  } else if (current?.exists === false) {
    status = 'created';
  } else {
    status = 'modified';
  }

  const after =
    operation.action === 'delete'
      ? undefined
      : operation.content ??
        (operation.template
          ? `{{template:${operation.template.source}}}`
          : undefined);

  const preview =
    beforeAfterPreview(current?.content, after) ?? (status === 'deleted'
      ? beforeAfterPreview(current?.content, undefined)
      : undefined);

  return {
    path: operation.path,
    status,
    preview,
  };
}

function buildConfigDiff(
  operation: Operation,
  analysisResult?: AnalysisResult,
): ConfigDiff | null {
  if (operation.kind !== 'config') {
    return null;
  }

  const configOperation = operation;
  let after: unknown;
  switch (configOperation.action) {
    case 'unset':
      after = undefined;
      break;
    case 'set':
      after = configOperation.value;
      break;
    case 'merge':
      after = configOperation.value;
      break;
    default:
      after = configOperation.value;
      break;
  }

  return {
    path: configOperation.path,
    pointer: configOperation.pointer,
    before: analysisResult?.current,
    after,
  };
}

function isFileDiff(value: DiffBuilderResult): value is FileDiff {
  return Boolean(value && (value as FileDiff).status);
}

function summarise(files: FileDiff[], configs: ConfigDiff[]): DiffSummary {
  let created = 0;
  let modified = 0;
  let deleted = 0;

  for (const file of files) {
    if (file.status === 'created') created += 1;
    else if (file.status === 'modified') modified += 1;
    else if (file.status === 'deleted') deleted += 1;
  }

  for (const config of configs) {
    if (config.after === undefined) {
      deleted += 1;
    } else if (config.before === undefined) {
      created += 1;
    } else {
      modified += 1;
    }
  }

  return { created, modified, deleted };
}

function buildRiskAssessment(
  operations: OperationWithMetadata[],
  analysis: Map<string, AnalysisResult>,
): RiskAssessment {
  let maxRisk: OperationRiskLevel = 'safe';
  const byOperation = new Map<string, OperationRiskLevel>();

  for (const operation of operations) {
    const risk = analysis.get(operation.metadata.id)?.risk ?? 'moderate';
    byOperation.set(operation.metadata.id, risk);
    if (RISK_WEIGHT[risk] > RISK_WEIGHT[maxRisk]) {
      maxRisk = risk;
    }
  }

  return {
    overall: maxRisk,
    byOperation,
  };
}

function normalizeFileSnapshot(
  snapshot: unknown,
): { exists?: boolean; content?: string } | undefined {
  if (!snapshot) {
    return undefined;
  }

  if (typeof snapshot === 'string') {
    return { exists: true, content: snapshot };
  }

  if (typeof snapshot === 'object') {
    const exists =
      typeof (snapshot as any).exists === 'boolean'
        ? (snapshot as any).exists
        : undefined;
    const content =
      typeof (snapshot as any).content === 'string'
        ? (snapshot as any).content
        : undefined;
    return { exists, content };
  }

  return undefined;
}

function beforeAfterPreview(
  before?: string,
  after?: string,
): { before?: string; after?: string } | undefined {
  if (before === undefined && after === undefined) {
    return undefined;
  }

  return {
    before,
    after,
  };
}
