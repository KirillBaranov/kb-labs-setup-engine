import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  Operation,
  OperationWithMetadata,
  FileOperation,
  ConfigOperation,
  ScriptOperation,
} from '@kb-labs/setup-operations';
import type {
  Executor,
  ExecutionOptions,
  ExecutionPlan,
  ExecutionResult,
  FailedOperation,
  ProgressEvent,
  ChangeJournal,
} from './contracts.js';
import type {
  OperationRegistry,
  ExecutorHandlerContext,
  ApplyResult,
} from './operation-registry.js';

export interface TransactionalExecutorOptions {
  workspaceRoot?: string;
  registry?: OperationRegistry;
}

type ProgressStatus = ProgressEvent['status'];

interface AppliedMutation {
  targetPath: string;
  backupPath?: string;
  existedBefore: boolean;
}

interface OperationContext {
  workspaceRoot: string;
  backupDir: string;
  autoConfirm: boolean;
  mutations: AppliedMutation[];
  backupRegistry: string[];
  registry?: OperationRegistry;
}

export function createExecutor(
  options: TransactionalExecutorOptions = {},
): Executor {
  const workspaceRoot = options.workspaceRoot
    ? path.resolve(options.workspaceRoot)
    : process.cwd();
  const registry = options.registry;

  return {
    async execute(
      plan: ExecutionPlan,
      execOptions: ExecutionOptions,
    ): Promise<ExecutionResult> {
      const journal = execOptions.journal;
      const applied: OperationWithMetadata[] = [];
      const failed: FailedOperation[] = [];
      const mutations: AppliedMutation[] = [];
      const backupRegistry: string[] = [];

      const backupDir = path.resolve(
        execOptions.backupDir || path.join(workspaceRoot, '.kb', 'logs', 'setup'),
      );

      const context: OperationContext = {
        workspaceRoot,
        backupDir,
        autoConfirm: execOptions.autoConfirm ?? false,
        mutations,
        backupRegistry,
        registry,
      };

      for (const stage of plan.stages) {
        await journal?.startStage(stage.id);
        for (const operation of stage.operations) {
          emitProgress(
            execOptions.onProgress,
            stage.id,
            operation,
            execOptions.dryRun ? 'pending' : 'running',
          );

          try {
            if (execOptions.dryRun) {
              await simulateOperation(operation, context);
              await journal?.beforeOperation(operation);
              await journal?.afterOperation(operation);
              emitProgress(execOptions.onProgress, stage.id, operation, 'skipped');
              continue;
            }

            await journal?.beforeOperation(operation);
            const result = await applyOperation(operation, context);
            if (result.changed) {
              applied.push(operation);
            }
            await journal?.afterOperation(operation, { backupPath: result.backupPath });
            emitProgress(execOptions.onProgress, stage.id, operation, 'completed');
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            failed.push({ operation, error: err });
            emitProgress(execOptions.onProgress, stage.id, operation, 'failed', err);

            if (!execOptions.dryRun) {
              await rollbackMutations(context);
              await journal?.rollback(applied);
            }

            return {
              success: false,
              applied,
              failed,
              rollbackAvailable: !execOptions.dryRun,
              logPath: journal?.getLogPath(),
              artifacts: {
                backups: backupRegistry,
                logs: journal ? journal.getArtifacts().logs : [],
              },
            };
          }
        }
        await journal?.commitStage(stage.id);
      }

      if (journal) {
        await persistJournal(journal, context.backupDir);
      }

      return {
        success: failed.length === 0,
        applied,
        failed: failed.length > 0 ? failed : undefined,
        rollbackAvailable: !execOptions.dryRun,
        logPath: journal?.getLogPath(),
        artifacts: {
          backups: backupRegistry,
          logs: journal ? journal.getArtifacts().logs : [],
        },
      };
    },
  };
}

async function simulateOperation(
  operation: OperationWithMetadata,
  ctx: OperationContext,
): Promise<void> {
  const customExecutor = ctx.registry?.getExecutor(operation.operation.kind);
  if (customExecutor?.simulate) {
    await customExecutor.simulate(operation, toExecutorContext(ctx));
    return;
  }
  switch (operation.operation.kind) {
    case 'file':
      await resolveFileContent(operation.operation, ctx, operation.metadata);
      break;
    case 'config':
    case 'script':
      // No-op for dry-run: we only care about diffs, not touching filesystem.
      break;
    default:
      throw new Error(`Operation kind "${operation.operation.kind}" is not supported in executor.`);
  }
}

async function applyOperation(
  operation: OperationWithMetadata,
  ctx: OperationContext,
): Promise<ApplyResult> {
  const customExecutor = ctx.registry?.getExecutor(operation.operation.kind);
  if (customExecutor?.execute) {
    return customExecutor.execute(operation, toExecutorContext(ctx));
  }

  switch (operation.operation.kind) {
    case 'file':
      return applyFileOperation(operation.operation, operation.metadata, ctx);
    case 'config':
      return applyConfigOperation(operation.operation, operation.metadata.id, ctx);
    case 'script':
      return applyScriptOperation(operation.operation, operation.metadata.id, ctx);
    default:
      throw new Error(`Unsupported operation kind "${operation.operation.kind}".`);
  }
}

async function applyFileOperation(
  operation: FileOperation,
  metadata: OperationWithMetadata['metadata'],
  ctx: OperationContext,
): Promise<ApplyResult> {
  const opId = metadata.id;
  const targetPath = resolveWorkspacePath(ctx.workspaceRoot, operation.path);
  const exists = await pathExists(targetPath);

  if (operation.action === 'delete') {
    if (!exists) {
      return { changed: false };
    }

    const backupPath = await createBackupIfNeeded(targetPath, ctx, opId);
    await fs.rm(targetPath, { force: true });
    recordMutation(ctx, targetPath, backupPath, true);
    return { changed: true, backupPath };
  }

  const nextContent = await resolveFileContent(operation, ctx, metadata);
  const encoding = operation.encoding ?? 'utf8';

  if (exists) {
    const current = await fs.readFile(targetPath);
    if (current.equals(nextContent)) {
      return { changed: false };
    }
  }

  const backupPath = exists
    ? await createBackupIfNeeded(targetPath, ctx, opId)
    : undefined;

  await ensureParentDir(targetPath);
  await fs.writeFile(targetPath, nextContent, { encoding });

  if (typeof operation.mode === 'number') {
    await fs.chmod(targetPath, operation.mode);
  }

  recordMutation(ctx, targetPath, backupPath, !exists);
  return { changed: true, backupPath };
}

async function applyConfigOperation(
  operation: ConfigOperation,
  opId: string,
  ctx: OperationContext,
): Promise<ApplyResult> {
  const targetPath = resolveWorkspacePath(ctx.workspaceRoot, operation.path);
  const exists = await pathExists(targetPath);
  let document: any = {};

  if (exists) {
    const raw = await fs.readFile(targetPath, 'utf8');
    document = raw.trim() ? JSON.parse(raw) : {};
  }

  const before = JSON.stringify(document);
  const updated = applyConfigMutation(document, operation);

  if (!updated.changed) {
    return { changed: false };
  }

  const backupPath = exists
    ? await createBackupIfNeeded(targetPath, ctx, opId)
    : undefined;

  await ensureParentDir(targetPath);
  await fs.writeFile(targetPath, `${JSON.stringify(updated.document, null, 2)}\n`, 'utf8');
  recordMutation(ctx, targetPath, backupPath, !exists);
  return { changed: true, backupPath };
}

async function applyScriptOperation(
  operation: ScriptOperation,
  opId: string,
  ctx: OperationContext,
): Promise<ApplyResult> {
  const targetPath = resolveWorkspacePath(ctx.workspaceRoot, operation.file);
  const exists = await pathExists(targetPath);
  const pkg = exists
    ? JSON.parse(await fs.readFile(targetPath, 'utf8'))
    : {};

  pkg.scripts = pkg.scripts ?? {};
  const current = pkg.scripts[operation.name];

  if (operation.action === 'delete') {
    if (typeof current === 'undefined') {
      return { changed: false };
    }
    delete pkg.scripts[operation.name];
  } else {
    const nextCommand = operation.command ?? '';

    if (typeof current !== 'undefined' && current !== nextCommand) {
      const resolution = operation.conflictResolution ?? 'prompt';
      if (resolution === 'keep') {
        return { changed: false };
      }
      if (resolution === 'prompt' && !ctx.autoConfirm) {
        throw new Error(
          `Script "${operation.name}" already exists in ${operation.file}. Re-run with --yes to overwrite.`,
        );
      }
    }

    pkg.scripts[operation.name] = nextCommand;
  }

  const backupPath = exists
    ? await createBackupIfNeeded(targetPath, ctx, opId)
    : undefined;

  await ensureParentDir(targetPath);
  await fs.writeFile(targetPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  recordMutation(ctx, targetPath, backupPath, !exists);
  return { changed: true, backupPath };
}

async function resolveFileContent(
  operation: FileOperation,
  ctx: OperationContext,
  metadata?: OperationWithMetadata['metadata'],
): Promise<Buffer> {
  if (operation.content !== undefined) {
    return Buffer.from(operation.content, operation.encoding ?? 'utf8');
  }

  const annotationContent = readAnnotationContent(metadata?.annotations);
  if (annotationContent) {
    return annotationContent;
  }

  if (operation.template) {
    return renderTemplate(operation.template, ctx.workspaceRoot);
  }

  throw new Error(
    `File operation for ${operation.path} does not include content or template information.`,
  );
}

function readAnnotationContent(
  annotations: Record<string, unknown> | undefined,
): Buffer | null {
  const base64 = annotations?.rawContentBase64;
  if (typeof base64 === 'string') {
    return Buffer.from(base64, 'base64');
  }
  return null;
}

async function renderTemplate(
  template: FileOperation['template'],
  workspaceRoot: string,
): Promise<Buffer> {
  if (!template) {
    throw new Error('Template specification is missing.');
  }

  const templatePath = path.isAbsolute(template.source)
    ? template.source
    : path.resolve(workspaceRoot, template.source);

  const baseContent = await fs.readFile(templatePath, 'utf8');
  const rendered =
    template.variables && Object.keys(template.variables).length > 0
      ? interpolateTemplate(baseContent, template.variables)
      : baseContent;

  return Buffer.from(rendered, 'utf8');
}

function interpolateTemplate(
  content: string,
  variables: Record<string, string>,
): string {
  return Object.entries(variables).reduce((acc, [key, value]) => {
    const pattern = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, 'g');
    return acc.replace(pattern, value);
  }, content);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyConfigMutation(
  document: any,
  operation: ConfigOperation,
): { changed: boolean; document: any } {
  const segments = decodePointer(operation.pointer);
  if (operation.action === 'unset') {
    const { parent, key } = getParent(document, segments, false);
    if (!parent || key == null || key === '' || !(key in parent)) {
      return { changed: false, document };
    }
    const target = parent as Record<string, any>;
    delete target[key];
    return { changed: true, document };
  }

  const { parent, key } = getParent(document, segments, true);
  if (!parent || key == null || key === '') {
    return { changed: false, document };
  }
  const targetParent = parent as Record<string, any>;
  const targetKey: string = key;

  if (operation.action === 'set') {
    if (isEqual(targetParent[targetKey], operation.value)) {
      return { changed: false, document };
    }
    targetParent[targetKey] = operation.value;
    return { changed: true, document };
  }

  if (operation.action === 'merge') {
  const existing = targetParent[targetKey];
    if (
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      operation.value &&
      typeof operation.value === 'object' &&
      !Array.isArray(operation.value)
    ) {
    const merged = operation.strategy === 'shallow'
      ? { ...existing, ...operation.value }
      : deepMerge(existing, operation.value);
      if (isEqual(existing, merged)) {
        return { changed: false, document };
      }
      targetParent[targetKey] = merged;
    targetParent[targetKey] = merged;
      return { changed: true, document };
    }

    if (isEqual(existing, operation.value)) {
      return { changed: false, document };
    }
    targetParent[targetKey] = operation.value;
    return { changed: true, document };
  }

  return { changed: false, document };
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function decodePointer(pointer: string): string[] {
  if (!pointer || pointer === '/') {
    return [];
  }
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function getParent(
  document: any,
  segments: string[],
  createPath: boolean,
): { parent: any | null; key: string | null } {
  if (segments.length === 0) {
    return { parent: null, key: null };
  }

  let parent = document;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!;
    if (parent[segment] == null) {
      if (!createPath) {
        return { parent: null, key: null };
      }
      parent[segment] = {};
    }
    if (typeof parent[segment] !== 'object') {
      if (!createPath) {
        return { parent: null, key: null };
      }
      parent[segment] = {};
    }
    parent = parent[segment];
  }

  return { parent, key: segments[segments.length - 1] ?? null };
}

function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function emitProgress(
  cb: ExecutionOptions['onProgress'],
  stageId: string,
  operation: OperationWithMetadata,
  status: ProgressStatus,
  error?: Error,
): void {
  if (!cb) return;
  cb({ stageId, operation, status, error });
}

async function createBackupIfNeeded(
  targetPath: string,
  ctx: OperationContext,
  opId: string,
): Promise<string | undefined> {
  const exists = await pathExists(targetPath);
  if (!exists) {
    return undefined;
  }

  await fs.mkdir(ctx.backupDir, { recursive: true });
  const fileName = `${Date.now()}-${sanitizeForFilename(opId)}-${sanitizeForFilename(
    path.relative(ctx.workspaceRoot, targetPath),
  )}`;
  const backupPath = path.join(ctx.backupDir, `${fileName}.bak`);
  await ensureParentDir(backupPath);
  await fs.copyFile(targetPath, backupPath);
  ctx.backupRegistry.push(backupPath);
  return backupPath;
}

function recordMutation(
  ctx: OperationContext,
  targetPath: string,
  backupPath: string | undefined,
  created: boolean,
): void {
  ctx.mutations.push({
    targetPath,
    backupPath,
    existedBefore: !created,
  });
}

async function rollbackMutations(ctx: OperationContext): Promise<void> {
  for (let i = ctx.mutations.length - 1; i >= 0; i -= 1) {
    const mutation = ctx.mutations[i];
    if (!mutation) {
      continue;
    }
    if (mutation.backupPath) {
      await ensureParentDir(mutation.targetPath);
      await fs.copyFile(mutation.backupPath, mutation.targetPath);
    } else if (!mutation.existedBefore) {
      await fs.rm(mutation.targetPath, { force: true });
    }
  }
}

async function ensureParentDir(targetPath: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function resolveWorkspacePath(workspaceRoot: string, filePath: string): string {
  const resolved = path.resolve(workspaceRoot, filePath);
  const normalizedWorkspace = path.resolve(workspaceRoot);
  const withSep = normalizedWorkspace.endsWith(path.sep)
    ? normalizedWorkspace
    : `${normalizedWorkspace}${path.sep}`;
  if (resolved !== normalizedWorkspace && !resolved.startsWith(withSep)) {
    throw new Error(`Operation path ${filePath} escapes workspace root.`);
  }
  return resolved;
}

async function persistJournal(
  journal: ChangeJournal,
  backupDir: string,
): Promise<void> {
  const entries = journal.getEntries();
  if (entries.length === 0) {
    return;
  }

  let logPath = journal.getLogPath();
  if (!logPath) {
    await fs.mkdir(backupDir, { recursive: true });
    logPath = path.join(backupDir, `${Date.now()}-setup-log.json`);
  }

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, JSON.stringify(entries, null, 2), 'utf8');
  journal.setLogPath(logPath);
}

function toExecutorContext(ctx: OperationContext): ExecutorHandlerContext {
  return {
    workspaceRoot: ctx.workspaceRoot,
    backupDir: ctx.backupDir,
    autoConfirm: ctx.autoConfirm,
  };
}

function getOperationPath(operation: ConfigOperation | ScriptOperation): string {
  return 'path' in operation ? operation.path : operation.file;
}

function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
