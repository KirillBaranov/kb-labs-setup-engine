import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { OperationWithMetadata } from '@kb-labs/setup-operations';
import type {
  ChangeJournal,
  ExecutionArtifacts,
  JournalEntry,
  OperationSnapshot
} from './contracts.js';

export interface ChangeJournalOptions {
  workspaceRoot: string;
  logPath?: string;
  maxCaptureBytes?: number;
}

const DEFAULT_CAPTURE_BYTES = 256 * 1024; // 256KB

export function createChangeJournal(options: ChangeJournalOptions): ChangeJournal {
  if (!options?.workspaceRoot) {
    throw new Error('createChangeJournal requires workspaceRoot option.');
  }

  const entries: JournalEntry[] = [];
  const entryIndex = new Map<string, number>();
  const artifacts: ExecutionArtifacts = {
    backups: [],
    logs: [],
  };

  let logPath = options.logPath;
  if (logPath) {
    artifacts.logs = [logPath];
  }
  const maxBytes = options.maxCaptureBytes ?? DEFAULT_CAPTURE_BYTES;

  return {
    async startStage(): Promise<void> {
      // Placeholder for future per-stage bookkeeping.
    },
    async beforeOperation(operation: OperationWithMetadata): Promise<void> {
      const entry: JournalEntry = {
        timestamp: new Date().toISOString(),
        operation: cloneOperation(operation),
        before: await captureSnapshot(options.workspaceRoot, operation, maxBytes)
      };
      entries.push(entry);
      entryIndex.set(operation.metadata.id, entries.length - 1);
    },
    async afterOperation(
      operation: OperationWithMetadata,
      context?: { backupPath?: string },
    ): Promise<void> {
      const index = entryIndex.get(operation.metadata.id);
      if (index === undefined) {
        return;
      }
      const entry = entries[index];
      if (!entry) {
        return;
      }
      entry.after = await captureSnapshot(options.workspaceRoot, operation, maxBytes);
      if (context?.backupPath) {
        entry.backupPath = context.backupPath;
        artifacts.backups.push(context.backupPath);
      }
    },
    async commitStage(): Promise<void> {
      // No-op for the current implementation.
    },
    async rollback(): Promise<void> {
      // Rollback metadata can be appended here in future revisions.
    },
    getLogPath(): string {
      return logPath ?? '';
    },
    setLogPath(next: string): void {
      logPath = next;
      if (next) {
        artifacts.logs = [next];
      }
    },
    getArtifacts(): ExecutionArtifacts {
      return {
        backups: [...artifacts.backups],
        logs: [...artifacts.logs],
        metadata: artifacts.metadata ? { ...artifacts.metadata } : undefined,
      };
    },
    getEntries(): ReadonlyArray<JournalEntry> {
      return entries.map((entry) => ({
        ...entry,
        operation: cloneOperation(entry.operation),
        before: { ...entry.before },
        after: entry.after ? { ...entry.after } : undefined,
      }));
    },
  };
}

function cloneOperation(operation: OperationWithMetadata): OperationWithMetadata {
  return JSON.parse(JSON.stringify(operation)) as OperationWithMetadata;
}

async function captureSnapshot(
  workspaceRoot: string,
  operation: OperationWithMetadata,
  maxBytes: number,
): Promise<OperationSnapshot> {
  switch (operation.operation.kind) {
    case 'file': {
      const target = resolvePath(workspaceRoot, operation.operation.path);
      const result = await readFileIfExists(target, maxBytes, operation.operation.encoding);
      return {
        exists: result.exists,
        content: result.content,
        checksum: result.checksum,
        metadata: operation.metadata,
      };
    }
    case 'config':
    case 'script': {
      const target = resolvePath(workspaceRoot, getOperationPath(operation.operation));
      const result = await readFileIfExists(target, maxBytes, 'utf8');
      return {
        exists: result.exists,
        content: result.content,
        checksum: result.checksum,
        metadata: operation.metadata,
      };
    }
    default:
      return {
        exists: false,
        metadata: operation.metadata,
      };
  }
}

function resolvePath(workspaceRoot: string, relativePath: string): string {
  return path.resolve(workspaceRoot, relativePath);
}

async function readFileIfExists(
  target: string,
  maxBytes: number,
  encoding?: BufferEncoding,
): Promise<{ exists: boolean; content?: string; checksum?: string }> {
  try {
    const buffer = await fs.readFile(target);
    const checksum = createHash('sha256').update(buffer).digest('hex');

    if (buffer.byteLength > maxBytes) {
      return {
        exists: true,
        checksum,
        content: `<truncated ${buffer.byteLength} bytes>`,
      };
    }

    return {
      exists: true,
      checksum,
      content: buffer.toString(encoding ?? 'utf8'),
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { exists: false };
    }
    return { exists: false, content: `<error: ${error.message}>` };
  }
}

function getOperationPath(operation: OperationWithMetadata['operation']): string {
  if (operation.kind === 'config') {
    return operation.path;
  }
  if (operation.kind === 'script') {
    return operation.file;
  }
  return '';
}
