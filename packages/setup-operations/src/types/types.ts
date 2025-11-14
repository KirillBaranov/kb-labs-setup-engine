/**
 * Core operation primitives used by the KB Labs setup engine.
 *
 * These types are designed to be portable between packages and
 * expressive enough for diff generation, dependency planning,
 * and rollback metadata.
 */

export type Operation =
  | FileOperation
  | ConfigOperation
  | CodeOperation
  | ScriptOperation;

export type OperationKind = Operation['kind'];

/**
 * File system operation executed relative to the workspace root.
 */
export interface FileOperation {
  kind: 'file';
  action: 'ensure' | 'update' | 'delete';
  path: string;
  content?: string;
  template?: OperationTemplateSpec;
  encoding?: BufferEncoding;
  mode?: number;
  checksum?: string;
}

export interface OperationTemplateSpec {
  source: string;
  variables?: Record<string, string>;
}

/**
 * Configuration operation targeting JSON (or JSON-compatible) files.
 */
export interface ConfigOperation {
  kind: 'config';
  action: 'merge' | 'set' | 'unset';
  path: string;
  pointer: string;
  value?: unknown;
  strategy?: ConfigMergeStrategy;
  conflictResolution?: ConfigConflictResolution;
}

export type ConfigMergeStrategy = 'shallow' | 'deep' | 'replace';

export type ConfigConflictResolution = 'ours' | 'theirs' | 'prompt' | 'fail';

/**
 * Source code manipulation. Backed by AST transforms or structured patches.
 */
export interface CodeOperation {
  kind: 'code';
  action: 'ensureImport' | 'ensureExport' | 'patch';
  file: string;
  language: CodeLanguage;
  import?: CodeImportSpec;
  export?: CodeExportSpec;
  patch?: CodePatchSpec;
}

export type CodeLanguage = 'typescript' | 'javascript' | 'tsx' | 'jsx';

export type CodeImportPosition = 'top' | 'after-imports' | { after: string };

export interface CodeImportSpec {
  specifier: string;
  named?: string[];
  namespace?: string;
  default?: string;
  position?: CodeImportPosition;
}

export interface CodeExportSpec {
  declaration: string;
  identifier?: string;
}

export interface CodePatchSpec {
  /** Selector syntax depends on the executor implementation (e.g. AST query). */
  selector: string;
  /** Path to a transform module or inline transform identifier. */
  transform: string;
  description?: string;
}

/**
 * Scripts (e.g. package.json) updates.
 */
export interface ScriptOperation {
  kind: 'script';
  action: 'ensure' | 'update' | 'delete';
  file: 'package.json' | string;
  name: string;
  command?: string;
  description?: string;
  conflictResolution?: ScriptConflictResolution;
}

export type ScriptConflictResolution = 'keep' | 'replace' | 'prompt';

/**
 * Metadata describing how an operation should be executed and tracked.
 */
export interface OperationMetadata {
  id: OperationId;
  description: string;
  idempotent: boolean;
  reversible: boolean;
  dependencies?: OperationId[];
  tags?: string[];
  annotations?: Record<string, unknown>;
}

export type OperationId = string;

export interface OperationWithMetadata<T extends Operation = Operation> {
  operation: T;
  metadata: OperationMetadata;
}
