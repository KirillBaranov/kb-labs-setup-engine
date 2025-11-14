import type {
  CodeImportPosition,
  CodeOperation,
  ConfigConflictResolution,
  ConfigMergeStrategy,
  ConfigOperation,
  FileOperation,
  Operation,
  OperationId,
  OperationMetadata,
  OperationTemplateSpec,
  OperationWithMetadata,
  ScriptConflictResolution,
  ScriptOperation
} from './types/index.js';

export interface EnsureFileOptions {
  encoding?: BufferEncoding;
  mode?: number;
  checksum?: string;
  metadata?: PartialOperationMetadata;
}

export interface EnsureFileTemplateOptions extends EnsureFileOptions {
  variables?: Record<string, string>;
}

export interface EnsureConfigSectionOptions {
  path?: string;
  strategy?: ConfigMergeStrategy;
  conflictResolution?: ConfigConflictResolution;
  metadata?: PartialOperationMetadata;
}

export interface EnsureImportOptions {
  named?: string[];
  namespace?: string;
  default?: string;
  position?: CodeImportPosition;
  language?: CodeOperation['language'];
  metadata?: PartialOperationMetadata;
}

export interface SuggestScriptOptions {
  command?: string;
  description?: string;
  conflictResolution?: ScriptConflictResolution;
  file?: string;
  metadata?: PartialOperationMetadata;
}

export interface AddOperationOptions {
  metadata?: PartialOperationMetadata;
}

export interface PartialOperationMetadata {
  id?: OperationId;
  description?: string;
  idempotent?: boolean;
  reversible?: boolean;
  dependencies?: OperationId[];
  tags?: string[];
  annotations?: Record<string, unknown>;
}

interface BuildResult {
  operations: OperationWithMetadata[];
}

export class SetupBuilder {
  private readonly operations: OperationWithMetadata[] = [];
  private nextIdCounter = 0;

  ensureFile(path: string, content: string, options: EnsureFileOptions = {}): this {
    const operation: FileOperation = {
      kind: 'file',
      action: 'ensure',
      path,
      content,
      encoding: options.encoding,
      mode: options.mode,
      checksum: options.checksum
    };

    this.pushOperation(operation, 'file', options.metadata, `Ensure file ${path}`);
    return this;
  }

  ensureFileFromTemplate(path: string, templatePath: string, options: EnsureFileTemplateOptions = {}): this {
    const operation: FileOperation = {
      kind: 'file',
      action: 'ensure',
      path,
      template: {
        source: templatePath,
        variables: options.variables
      },
      encoding: options.encoding,
      mode: options.mode,
      checksum: options.checksum
    };

    this.pushOperation(operation, 'fileTpl', options.metadata, `Ensure file ${path} from template`);
    return this;
  }

  ensureConfigSection(pointer: string, value: unknown, options: EnsureConfigSectionOptions = {}): this {
    const operation: ConfigOperation = {
      kind: 'config',
      action: 'merge',
      path: options.path ?? '.kb/kb-labs.config.json',
      pointer: pointerToJsonPointer(pointer),
      value,
      strategy: options.strategy ?? 'deep',
      conflictResolution: options.conflictResolution
    };

    this.pushOperation(operation, 'config', options.metadata, `Ensure config section ${pointer}`);
    return this;
  }

  ensureImport(file: string, specifier: string, options: EnsureImportOptions = {}): this {
    const operation: CodeOperation = {
      kind: 'code',
      action: 'ensureImport',
      file,
      language: options.language ?? inferLanguageFromPath(file),
      import: {
        specifier,
        named: options.named,
        namespace: options.namespace,
        default: options.default,
        position: options.position
      }
    };

    this.pushOperation(operation, 'import', options.metadata, `Ensure import ${specifier} in ${file}`);
    return this;
  }

  suggestScript(name: string, options: SuggestScriptOptions = {}): this {
    const operation: ScriptOperation = {
      kind: 'script',
      action: 'ensure',
      file: options.file ?? 'package.json',
      name,
      command: options.command,
      description: options.description,
      conflictResolution: options.conflictResolution
    };

    this.pushOperation(operation, 'script', options.metadata, `Suggest script ${name}`);
    return this;
  }

  dependsOn(...operationIds: OperationId[]): this {
    if (operationIds.length === 0) {
      return this;
    }

    const last = this.operations[this.operations.length - 1];
    if (!last) {
      throw new Error('SetupBuilder.dependsOn() called before any operation was added');
    }

    last.metadata.dependencies = Array.from(new Set([...(last.metadata.dependencies ?? []), ...operationIds]));
    return this;
  }

  getLastOperationId(): OperationId | undefined {
    return this.operations[this.operations.length - 1]?.metadata.id;
  }

  addOperation(operation: Operation, options: AddOperationOptions = {}): this {
    this.pushOperation(operation, 'custom', options.metadata, `${operation.kind} operation`);
    return this;
  }

  build(): BuildResult {
    return {
      operations: [...this.operations]
    };
  }

  private pushOperation(
    operation: Operation,
    prefix: string,
    metadata: PartialOperationMetadata | undefined,
    fallbackDescription: string
  ): void {
    const resolvedMetadata = this.createMetadata(prefix, metadata, fallbackDescription);
    this.operations.push({ operation, metadata: resolvedMetadata });
  }

  private createMetadata(
    prefix: string,
    metadata: PartialOperationMetadata | undefined,
    fallbackDescription: string
  ): OperationMetadata {
    return {
      id: metadata?.id ?? this.generateId(prefix),
      description: metadata?.description ?? fallbackDescription,
      idempotent: metadata?.idempotent ?? true,
      reversible: metadata?.reversible ?? true,
      dependencies: metadata?.dependencies ? [...metadata.dependencies] : undefined,
      tags: metadata?.tags ? [...metadata.tags] : undefined,
      annotations: metadata?.annotations ? { ...metadata.annotations } : undefined
    };
  }

  private generateId(prefix: string): OperationId {
    this.nextIdCounter += 1;
    return `${prefix}-${this.nextIdCounter}`;
  }
}

function pointerToJsonPointer(pointer: string): string {
  if (!pointer) {
    return '/';
  }

  if (pointer.startsWith('/')) {
    const trimmed = pointer.replace(/\/+$/, '');
    return trimmed.length === 0 ? '/' : trimmed;
  }

  const segments = pointer
    .split('/')
    .flatMap((segment) => segment.split('.'))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const normalized = segments.join('/');
  return normalized.length === 0 ? '/' : `/${normalized}`;
}

function inferLanguageFromPath(path: string): CodeOperation['language'] {
  if (path.endsWith('.tsx')) {
    return 'tsx';
  }
  if (path.endsWith('.jsx')) {
    return 'jsx';
  }
  if (path.endsWith('.ts')) {
    return 'typescript';
  }
  return 'javascript';
}
