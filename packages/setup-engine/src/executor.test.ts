import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createExecutor } from './executor.js';
import { createOperationRegistry } from './operation-registry.js';
import type { ExecutionPlan, OperationRiskLevel } from './contracts.js';
import type {
  FileOperation,
  OperationMetadata,
  OperationWithMetadata,
} from '@kb-labs/setup-operations';

function createMetadata(id: string, description?: string): OperationMetadata {
  return {
    id,
    description: description ?? id,
    idempotent: true,
    reversible: true,
  };
}

function createPlan(operations: OperationWithMetadata[]): ExecutionPlan {
  const risks = new Map<string, OperationRiskLevel>();
  for (const operation of operations) {
    risks.set(operation.metadata.id, 'safe');
  }

  return {
    stages: [
      {
        id: 'stage-1',
        operations,
        parallel: false,
      },
    ],
    diff: {
      files: [],
      configs: [],
      summary: { created: 0, modified: 0, deleted: 0 },
    },
    risks: {
      overall: 'safe',
      byOperation: risks,
    },
  };
}

describe('Transactional executor', () => {
  let workspace: string;
  let executorBackupDir: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'setup-executor-'));
    executorBackupDir = path.join(workspace, '.kb', 'logs', 'setup');
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('performs dry-run without writing files', async () => {
    const fileOperation: OperationWithMetadata<FileOperation> = {
      metadata: createMetadata('file-1', 'create example'),
      operation: {
        kind: 'file',
        action: 'ensure',
        path: 'example.txt',
        content: 'hello world',
      },
    };

    const executor = createExecutor({ workspaceRoot: workspace });
    const plan = createPlan([fileOperation]);

    const result = await executor.execute(plan, {
      dryRun: true,
      autoConfirm: true,
      backupDir: executorBackupDir,
    });

    const target = path.join(workspace, 'example.txt');
    const exists = await pathExists(target);

    expect(result.success).toBe(true);
    expect(exists).toBe(false);
  });

  it('writes file and records backup metadata', async () => {
    const fileOperation: OperationWithMetadata<FileOperation> = {
      metadata: createMetadata('file-2', 'create hello'),
      operation: {
        kind: 'file',
        action: 'ensure',
        path: 'hello.txt',
        content: 'hi kb',
      },
    };

    const executor = createExecutor({ workspaceRoot: workspace });
    const plan = createPlan([fileOperation]);

    const result = await executor.execute(plan, {
      dryRun: false,
      autoConfirm: true,
      backupDir: executorBackupDir,
    });

    const target = path.join(workspace, 'hello.txt');
    const content = await fs.readFile(target, 'utf8');

    expect(result.success).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(content).toBe('hi kb');
  });

  it('rolls back applied changes when a later operation fails', async () => {
    const createFileOp: OperationWithMetadata<FileOperation> = {
      metadata: createMetadata('file-3', 'create temp'),
      operation: {
        kind: 'file',
        action: 'ensure',
        path: 'temp.txt',
        content: 'temp',
      },
    };

    const failingOp: OperationWithMetadata = {
      metadata: createMetadata('code-1', 'unsupported'),
      operation: {
        kind: 'code',
        action: 'patch',
        file: 'index.ts',
        language: 'typescript',
        patch: {
          selector: 'Program',
          transform: './noop',
        },
      } as any,
    };

    const executor = createExecutor({ workspaceRoot: workspace });
    const plan = createPlan([createFileOp, failingOp]);

    const result = await executor.execute(plan, {
      dryRun: false,
      autoConfirm: true,
      backupDir: executorBackupDir,
    });

    const target = path.join(workspace, 'temp.txt');
    const exists = await pathExists(target);

    expect(result.success).toBe(false);
    expect(result.failed?.[0].operation.metadata.id).toBe('code-1');
    expect(exists).toBe(false);
  });

  it('delegates execution to custom executor handlers', async () => {
    const registry = createOperationRegistry();
    const executeSpy = vi.fn(async () => ({ changed: true }));
    const simulateSpy = vi.fn(async () => {});

    registry.registerExecutor('custom', {
      simulate: simulateSpy,
      execute: async (operation) => {
        await executeSpy(operation);
        return { changed: true };
      },
    });

    const customOp: OperationWithMetadata = {
      metadata: createMetadata('custom-op', 'Custom op'),
      operation: {
        kind: 'custom',
        action: 'noop',
      } as any,
    };

    const executor = createExecutor({ workspaceRoot: workspace, registry });
    const plan = createPlan([customOp]);

    const result = await executor.execute(plan, {
      dryRun: false,
      autoConfirm: true,
      backupDir: executorBackupDir,
    });

    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);

    await executor.execute(plan, {
      dryRun: true,
      autoConfirm: true,
      backupDir: executorBackupDir,
    });
    expect(simulateSpy).toHaveBeenCalledTimes(1);
  });
});

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

