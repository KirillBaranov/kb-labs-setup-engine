import type {
  Operation,
  OperationId,
  OperationMetadata,
  OperationWithMetadata
} from '@kb-labs/setup-operations';

export type OperationRiskLevel = 'safe' | 'moderate' | 'high';

export interface Conflict {
  type: 'modified' | 'missing' | 'incompatible' | 'permission' | 'unknown';
  path: string;
  expected?: unknown;
  actual?: unknown;
  suggestion?: string;
}

export interface AnalysisResult {
  needed: boolean;
  current?: unknown;
  conflicts?: Conflict[];
  risk: OperationRiskLevel;
  notes?: string[];
}

export interface Analyzer {
  analyze(operation: OperationWithMetadata): Promise<AnalysisResult>;
}

export interface AnalyzerBatch {
  analyzeAll(operations: OperationWithMetadata[]): Promise<Map<OperationId, AnalysisResult>>;
}

export interface Planner {
  plan(
    operations: OperationWithMetadata[],
    analysis: Map<OperationId, AnalysisResult>
  ): ExecutionPlan;
}

export interface ExecutionPlan {
  stages: PlanStage[];
  diff: PlanDiff;
  risks: RiskAssessment;
  warnings?: string[];
}

export interface PlanStage {
  id: string;
  operations: OperationWithMetadata[];
  parallel: boolean;
}

export interface PlanDiff {
  files: FileDiff[];
  configs: ConfigDiff[];
  summary: DiffSummary;
}

export interface FileDiff {
  path: string;
  status: 'created' | 'modified' | 'deleted';
  unified?: string;
  preview?: DiffPreview;
}

export interface DiffPreview {
  before?: string;
  after?: string;
}

export interface ConfigDiff {
  path: string;
  pointer: string;
  before?: unknown;
  after?: unknown;
}

export interface DiffSummary {
  created: number;
  modified: number;
  deleted: number;
}

export interface RiskAssessment {
  overall: OperationRiskLevel;
  byOperation: Map<OperationId, OperationRiskLevel>;
}

export interface Executor {
  execute(plan: ExecutionPlan, options: ExecutionOptions): Promise<ExecutionResult>;
}

export interface ExecutionOptions {
  dryRun: boolean;
  autoConfirm: boolean;
  backupDir: string;
  journal?: ChangeJournal;
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  stageId: string;
  operation: OperationWithMetadata;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  error?: Error;
}

export interface ExecutionResult {
  success: boolean;
  applied: OperationWithMetadata[];
  failed?: FailedOperation[];
  rollbackAvailable: boolean;
  logPath?: string;
  artifacts?: ExecutionArtifacts;
}

export interface FailedOperation {
  operation: OperationWithMetadata;
  error: Error;
}

export interface ExecutionArtifacts {
  backups: string[];
  logs: string[];
  metadata?: Record<string, unknown>;
}

export interface ChangeJournal {
  startStage(stageId: string): Promise<void>;
  beforeOperation(operation: OperationWithMetadata): Promise<void>;
  afterOperation(
    operation: OperationWithMetadata,
    context?: { backupPath?: string },
  ): Promise<void>;
  commitStage(stageId: string): Promise<void>;
  rollback(operations: OperationWithMetadata[]): Promise<void>;
  getLogPath(): string;
  getArtifacts(): ExecutionArtifacts;
  setLogPath(logPath: string): void;
  getEntries(): ReadonlyArray<JournalEntry>;
}

export interface JournalEntry {
  timestamp: string;
  operation: OperationWithMetadata;
  before: OperationSnapshot;
  after?: OperationSnapshot;
  backupPath?: string;
}

export interface OperationSnapshot {
  exists: boolean;
  content?: string;
  checksum?: string;
  metadata?: OperationMetadata;
}

export interface JournalExporter {
  load(path: string): Promise<ReadonlyArray<JournalEntry>>;
}

export type execute = Executor['execute'];
