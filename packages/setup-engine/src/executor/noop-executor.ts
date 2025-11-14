import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  Executor,
  ExecutionOptions,
  ExecutionPlan,
  ExecutionResult,
  FailedOperation,
  ChangeJournal,
  JournalEntry
} from '../contracts.js';

export interface NoopExecutorOptions {
  journal: ChangeJournal;
}

export class NoopExecutor implements Executor {
  constructor(private readonly options: NoopExecutorOptions) {}

  async execute(plan: ExecutionPlan, options: ExecutionOptions): Promise<ExecutionResult> {
    const applied: ExecutionResult['applied'] = [];
    const failed: FailedOperation[] = [];

    for (const stage of plan.stages) {
      await this.options.journal.startStage(stage.id);

      for (const operation of stage.operations) {
        await this.options.journal.beforeOperation(operation);

        if (!options.dryRun) {
          // Real execution of operations will be handled by runtime trackers for now.
          // This executor only logs the intent for review and rollback metadata.
          await this.options.journal.afterOperation(operation);
          applied.push(operation);
        } else {
          await this.options.journal.afterOperation(operation);
        }
      }

      await this.options.journal.commitStage(stage.id);
    }

    await persistJournal(this.options.journal, options.backupDir);

    return {
      success: failed.length === 0,
      applied,
      failed: failed.length > 0 ? failed : undefined,
      rollbackAvailable: true,
      logPath: this.options.journal.getLogPath(),
      artifacts: this.options.journal.getArtifacts()
    } satisfies ExecutionResult;
  }
}

async function persistJournal(journal: ChangeJournal, backupDir: string): Promise<void> {
  const existingPath = journal.getLogPath();
  if (existingPath) {
    return;
  }

  const entries = journal.getEntries();
  if (entries.length === 0) {
    return;
  }

  const fileName = `${Date.now()}-setup-log.json`;
  const outputPath = path.resolve(backupDir, fileName);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(entries, null, 2), 'utf8');
  journal.setLogPath(outputPath);
}
