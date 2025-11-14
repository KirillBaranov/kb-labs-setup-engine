import type {
  ChangeJournal,
  ExecutionArtifacts,
  JournalEntry,
  OperationSnapshot
} from '../contracts.js';
import type { OperationWithMetadata } from '@kb-labs/setup-operations';

function clone<T>(value: T): T {
  const globalClone = (globalThis as { structuredClone?: <U>(val: U) => U }).structuredClone;
  if (globalClone) {
    return globalClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryChangeJournal implements ChangeJournal {
  private readonly entries: JournalEntry[] = [];
  private logPath: string | undefined;

  async startStage(): Promise<void> {
    // No-op for in-memory journal.
  }

  async beforeOperation(operation: OperationWithMetadata): Promise<void> {
    const entry: JournalEntry = {
      timestamp: new Date().toISOString(),
      operation: clone(operation),
      before: createSnapshot(undefined)
    } satisfies JournalEntry;

    this.entries.push(entry);
  }

  async afterOperation(
    operation: OperationWithMetadata,
    context?: { backupPath?: string },
  ): Promise<void> {
    const entry = this.entries[this.entries.length - 1];
    if (!entry) {
      return;
    }

    entry.after = createSnapshot(undefined, operation.metadata);
    if (context?.backupPath) {
      entry.backupPath = context.backupPath;
    }
  }

  async commitStage(): Promise<void> {
    // No-op
  }

  async rollback(): Promise<void> {
    // Rollback logic will be implemented in a later revision.
  }

  getLogPath(): string {
    return this.logPath ?? '';
  }

  setLogPath(logPath: string): void {
    this.logPath = logPath;
  }

  getArtifacts(): ExecutionArtifacts {
    return {
      backups: [],
      logs: this.logPath ? [this.logPath] : []
    } satisfies ExecutionArtifacts;
  }

  getEntries(): JournalEntry[] {
    return this.entries.map((entry) => clone(entry));
  }
}

function createSnapshot(value: unknown, metadata?: OperationWithMetadata['metadata']): OperationSnapshot {
  return {
    exists: value !== undefined,
    content: value as string | undefined,
    metadata
  } satisfies OperationSnapshot;
}
