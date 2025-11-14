import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { AnalysisResult, Conflict } from '../contracts.js';
import type { ConfigOperation, OperationWithMetadata } from '@kb-labs/setup-operations';

export interface ConfigAnalyzerOptions {
  cwd: string;
}

export class ConfigAnalyzer {
  constructor(private readonly options: ConfigAnalyzerOptions) {}

  async analyze(operation: OperationWithMetadata<ConfigOperation>): Promise<AnalysisResult> {
    const op = operation.operation;
    const absolutePath = path.resolve(this.options.cwd, op.path);

    try {
      const fileContent = await fs.readFile(absolutePath, 'utf8');
      const data = fileContent.trim() ? JSON.parse(fileContent) : {};
      return this.evaluateDocument(data, op);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return this.handleMissingDocument(op);
      }

      if (error instanceof SyntaxError) {
        return {
          needed: true,
          risk: 'moderate',
          conflicts: [
            {
              type: 'incompatible',
              path: op.path,
              actual: 'invalid-json',
              suggestion: 'Fix JSON syntax before applying setup operations.',
            },
          ],
        };
      }

      return {
        needed: true,
        risk: 'moderate',
        conflicts: [createUnknownErrorConflict(op.path, error)],
      };
    }
  }

  private handleMissingDocument(operation: ConfigOperation): AnalysisResult {
    if (operation.action === 'unset') {
      return {
        needed: false,
        current: undefined,
        risk: 'safe',
        notes: ['Config file missing, nothing to unset.'],
      };
    }

    return {
      needed: true,
      current: undefined,
      risk: 'safe',
    };
  }

  private evaluateDocument(document: unknown, operation: ConfigOperation): AnalysisResult {
    const currentValue = getPointerValue(document, operation.pointer);

    switch (operation.action) {
      case 'unset': {
        const needed = typeof currentValue !== 'undefined';
        return {
          needed,
          current: currentValue,
          risk: needed ? 'moderate' : 'safe',
        };
      }
      case 'set': {
        const equal = isDeepStrictEqual(currentValue, operation.value);
        return {
          needed: !equal,
          current: currentValue,
          risk: 'safe',
        };
      }
      case 'merge': {
        if (
          operation.value &&
          typeof operation.value === 'object' &&
          !Array.isArray(operation.value)
        ) {
          const subset = isDeepSubset(currentValue, operation.value);
          return {
            needed: !subset,
            current: currentValue,
            risk: 'safe',
            notes: subset ? ['Config already matches desired merge payload.'] : undefined,
          };
        }

        const equal = isDeepStrictEqual(currentValue, operation.value);
        return {
          needed: !equal,
          current: currentValue,
          risk: 'safe',
        };
      }
      default:
        return {
          needed: true,
          current: currentValue,
          risk: 'safe',
          notes: [`Unsupported config action "${operation.action}" treated as needed.`],
        };
    }
  }
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

function getPointerValue(target: unknown, pointer: string): unknown {
  const segments = decodePointer(pointer);
  if (segments.length === 0) {
    return target;
  }

  let current: any = target;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isDeepSubset(target: unknown, subset: unknown): boolean {
  if (subset === undefined) {
    return true;
  }

  if (target === undefined || target === null) {
    return false;
  }

  if (Array.isArray(subset)) {
    return isDeepStrictEqual(target, subset);
  }

  if (typeof subset !== 'object' || subset === null) {
    return isDeepStrictEqual(target, subset);
  }

  if (typeof target !== 'object' || target === null) {
    return false;
  }

  for (const [key, value] of Object.entries(subset)) {
    if (!isDeepSubset((target as Record<string, unknown>)[key], value as any)) {
      return false;
    }
  }
  return true;
}

function createUnknownErrorConflict(pathRelative: string, error: unknown): Conflict {
  return {
    type: 'unknown',
    path: pathRelative,
    actual: error instanceof Error ? error.message : String(error),
    suggestion: 'Review the operation manually before applying.',
  };
}

