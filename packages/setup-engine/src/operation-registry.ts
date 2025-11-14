import type {
  Operation,
  OperationWithMetadata,
  FileOperation,
  ConfigOperation,
  ScriptOperation,
} from '@kb-labs/setup-operations';
import type { AnalysisResult, FileDiff, ConfigDiff } from './contracts.js';

export interface AnalyzerHandlerContext {
  workspaceRoot: string;
}

export type AnalyzerHandler = (
  operation: OperationWithMetadata,
  context: AnalyzerHandlerContext,
) => Promise<AnalysisResult>;

export interface DiffBuilderContext {
  workspaceRoot: string;
}

export type DiffBuilderResult = FileDiff | ConfigDiff | null | undefined;

export type DiffBuilder = (
  operation: OperationWithMetadata,
  analysis: AnalysisResult | undefined,
  context: DiffBuilderContext,
) => DiffBuilderResult;

export interface ExecutorHandlerContext {
  workspaceRoot: string;
  backupDir: string;
  autoConfirm: boolean;
}

export interface ApplyResult {
  changed: boolean;
  backupPath?: string;
}

export type SimulateHandler = (
  operation: OperationWithMetadata,
  context: ExecutorHandlerContext,
) => Promise<void>;

export type ExecuteHandler = (
  operation: OperationWithMetadata,
  context: ExecutorHandlerContext,
) => Promise<ApplyResult>;

export interface ExecutorHandlers {
  simulate?: SimulateHandler;
  execute: ExecuteHandler;
}

export class OperationRegistry {
  private readonly analyzers = new Map<string, AnalyzerHandler>();
  private readonly diffBuilders = new Map<string, DiffBuilder>();
  private readonly executors = new Map<string, ExecutorHandlers>();

  registerAnalyzer(kind: string, handler: AnalyzerHandler): this {
    this.analyzers.set(kind, handler);
    return this;
  }

  registerDiffBuilder(kind: string, handler: DiffBuilder): this {
    this.diffBuilders.set(kind, handler);
    return this;
  }

  registerExecutor(kind: string, handlers: ExecutorHandlers): this {
    this.executors.set(kind, handlers);
    return this;
  }

  getAnalyzer(kind: string): AnalyzerHandler | undefined {
    return this.analyzers.get(kind);
  }

  getDiffBuilder(kind: string): DiffBuilder | undefined {
    return this.diffBuilders.get(kind);
  }

  getExecutor(kind: string): ExecutorHandlers | undefined {
    return this.executors.get(kind);
  }
}

export function createOperationRegistry(): OperationRegistry {
  return new OperationRegistry();
}


