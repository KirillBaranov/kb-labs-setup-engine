import { promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AnalysisResult, Conflict } from '../contracts.js';
import type { FileOperation, OperationWithMetadata } from '@kb-labs/setup-operations';

export interface FileAnalyzerOptions {
  cwd: string;
}

export class FileAnalyzer {
  constructor(private readonly options: FileAnalyzerOptions) {}

  async analyze(operation: OperationWithMetadata<FileOperation>): Promise<AnalysisResult> {
    const op = operation.operation;
    const absolutePath = path.resolve(this.options.cwd, op.path);

    try {
      const stat = await fs.stat(absolutePath);
      return this.evaluateExistingFile(stat, absolutePath, op);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return this.handleMissingFile(op);
      }
      return {
        needed: true,
        risk: 'moderate',
        conflicts: [createUnknownErrorConflict(op.path, error)],
      };
    }
  }

  private handleMissingFile(operation: FileOperation): AnalysisResult {
    if (operation.action === 'delete') {
      return {
        needed: false,
        current: { exists: false },
        risk: 'safe',
        notes: ['File already removed'],
      };
    }

    return {
      needed: true,
      current: { exists: false },
      risk: 'safe',
    };
  }

  private async evaluateExistingFile(
    stat: Stats,
    absolutePath: string,
    operation: FileOperation,
  ): Promise<AnalysisResult> {
    const encoding = operation.encoding ?? 'utf8';
    const buffer = await fs.readFile(absolutePath);
    const existingContent = buffer.toString(encoding);

    const current = {
      exists: true,
      size: stat.size,
      mode: stat.mode & 0o777,
      mtime: stat.mtime.toISOString(),
      content: existingContent,
    };

    if (operation.action === 'delete') {
      return {
        needed: true,
        current,
        risk: 'moderate',
      };
    }

    if (operation.content !== undefined) {
      if (existingContent === operation.content) {
        const modeMatches =
          typeof operation.mode === 'number'
            ? operation.mode === (stat.mode & 0o777)
            : true;
        if (modeMatches) {
          return {
            needed: false,
            current,
            risk: 'safe',
            notes: ['File content matches desired state'],
          };
        }
      }
    } else if (operation.checksum) {
      const checksum = createHash('sha256').update(buffer).digest('hex');
      if (checksum === operation.checksum) {
        return {
          needed: false,
          current,
          risk: 'safe',
          notes: ['Checksum matches desired state'],
        };
      }
    }

    return {
      needed: true,
      current,
      risk: 'moderate',
      notes: operation.template
        ? ['Template-based file operation cannot be fully analyzed; assuming changes are required.']
        : undefined,
    };
  }
}

function createUnknownErrorConflict(pathRelative: string, error: unknown): Conflict {
  return {
    type: 'unknown',
    path: pathRelative,
    actual: error instanceof Error ? error.message : String(error),
    suggestion: 'Review the operation manually before applying.',
  };
}

