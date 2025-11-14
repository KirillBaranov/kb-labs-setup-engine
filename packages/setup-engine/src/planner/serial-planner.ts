import type {
  Planner,
  ExecutionPlan,
  PlanDiff,
  PlanStage,
  RiskAssessment,
  DiffSummary,
  AnalysisResult
} from '../contracts.js';
import type { OperationWithMetadata } from '@kb-labs/setup-operations';

export class SerialPlanner implements Planner {
  plan(
    operations: OperationWithMetadata[],
    analysis: Map<string, AnalysisResult>
  ): ExecutionPlan {
    const stages: PlanStage[] = [
      {
        id: 'stage-1',
        operations,
        parallel: false
      }
    ];

    const diff = buildDiff(operations, analysis);
    const risks = buildRiskAssessment(operations, analysis);

    return {
      stages,
      diff,
      risks
    } satisfies ExecutionPlan;
  }
}

function buildDiff(
  operations: OperationWithMetadata[],
  analysis: Map<string, AnalysisResult>
): PlanDiff {
  const files: PlanDiff['files'] = [];
  const configs: PlanDiff['configs'] = [];

  for (const op of operations) {
    const result = analysis.get(op.metadata.id);

    switch (op.operation.kind) {
      case 'file':
        files.push({
          path: op.operation.path,
          status: op.operation.action === 'delete' ? 'deleted' : 'modified',
          preview: buildPreview(result?.current, op.operation.content)
        });
        break;
      case 'config':
        configs.push({
          path: op.operation.path,
          pointer: op.operation.pointer,
          before: result?.current,
          after: op.operation.value
        });
        break;
      default:
        break;
    }
  }

  const summary: DiffSummary = {
    created: operations.filter((op) => op.operation.kind === 'file' && op.operation.action === 'ensure').length,
    modified: operations.filter((op) => op.operation.kind !== 'file' || op.operation.action !== 'delete').length,
    deleted: operations.filter((op) => op.operation.kind === 'file' && op.operation.action === 'delete').length
  } satisfies DiffSummary;

  return {
    files,
    configs,
    summary
  } satisfies PlanDiff;
}

function buildRiskAssessment(
  operations: OperationWithMetadata[],
  analysis: Map<string, AnalysisResult>
): RiskAssessment {
  let overall: RiskAssessment['overall'] = 'safe';
  const byOperation = new Map<string, RiskAssessment['overall']>();

  for (const op of operations) {
    const result = analysis.get(op.metadata.id);
    const risk = result?.risk ?? 'safe';
    byOperation.set(op.metadata.id, risk);

    if (risk === 'high') {
      overall = 'high';
    } else if (risk === 'moderate' && overall === 'safe') {
      overall = 'moderate';
    }
  }

  return {
    overall,
    byOperation
  } satisfies RiskAssessment;
}

function buildPreview(before: unknown, after: unknown) {
  return {
    before: serialize(before),
    after: serialize(after)
  };
}

function serialize(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
