import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  Analyzer,
  AnalyzerBatch,
  AnalysisResult,
  Conflict,
  OperationRiskLevel
} from '../contracts.js';
import type {
  OperationWithMetadata,
  FileOperation,
  ConfigOperation
} from '@kb-labs/setup-operations';
import { FileAnalyzer } from './file-analyzer.js';
import { ConfigAnalyzer } from './config-analyzer.js';
import type { OperationRegistry } from '../operation-registry.js';

export interface BasicAnalyzerOptions {
  cwd: string;
  registry?: OperationRegistry;
}

export class BasicAnalyzer implements Analyzer, AnalyzerBatch {
  private readonly fileAnalyzer: FileAnalyzer;
  private readonly configAnalyzer: ConfigAnalyzer;
  private readonly registry?: OperationRegistry;

  constructor(private readonly options: BasicAnalyzerOptions) {
    this.fileAnalyzer = new FileAnalyzer({ cwd: this.options.cwd });
    this.configAnalyzer = new ConfigAnalyzer({ cwd: this.options.cwd });
    this.registry = options.registry;
  }

  async analyze(operation: OperationWithMetadata): Promise<AnalysisResult> {
    const customAnalyzer = this.registry?.getAnalyzer(operation.operation.kind);
    if (customAnalyzer) {
      return customAnalyzer(operation, { workspaceRoot: this.options.cwd });
    }

    const op = operation.operation;
    switch (op.kind) {
      case 'file':
        return this.fileAnalyzer.analyze(operation as OperationWithMetadata<FileOperation>);
      case 'config':
        return this.configAnalyzer.analyze(operation as OperationWithMetadata<ConfigOperation>);
      case 'code':
        return this.analyzeCode(operation);
      case 'script':
        return this.analyzeScript(op);
      default:
        return {
          needed: true,
          risk: 'moderate',
          notes: [`No analyzer registered for kind "${(op as any).kind}"`]
        } satisfies AnalysisResult;
    }
  }

  async analyzeAll(operations: OperationWithMetadata[]): Promise<Map<string, AnalysisResult>> {
    const results = new Map<string, AnalysisResult>();
    for (const operation of operations) {
      const result = await this.analyze(operation);
      results.set(operation.metadata.id, result);
    }
    return results;
  }

  private async analyzeCode(operation: OperationWithMetadata): Promise<AnalysisResult> {
    // Placeholder implementation - real AST analysis will be introduced later.
    return {
      needed: true,
      risk: 'moderate',
      notes: ['Code operations are currently assumed to be needed.']
    } satisfies AnalysisResult;
  }

  private async analyzeScript(operation: OperationWithMetadata['operation'] & { kind: 'script' }): Promise<AnalysisResult> {
    const packageJsonPath = path.resolve(this.options.cwd, operation.file);
    try {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const json = JSON.parse(content) as Record<string, any>;
      const scripts = json.scripts ?? {};
      const current = scripts[operation.name];

      if (operation.action === 'delete') {
        const needed = typeof current !== 'undefined';
        return {
          needed,
          current,
          risk: needed ? 'moderate' : 'safe'
        } satisfies AnalysisResult;
      }

      if (current === operation.command) {
        return {
          needed: false,
          current,
          risk: 'safe'
        } satisfies AnalysisResult;
      }

      return {
        needed: true,
        current,
        risk: 'moderate'
      } satisfies AnalysisResult;
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return {
          needed: true,
          current: undefined,
          risk: 'moderate',
          conflicts: [
            {
              type: 'missing',
              path: operation.file,
              suggestion: 'Create package.json before applying script operation.'
            }
          ]
        } satisfies AnalysisResult;
      }

      return {
        needed: true,
        risk: 'moderate',
        conflicts: [createUnknownErrorConflict(operation.file, error)]
      } satisfies AnalysisResult;
    }
  }
}

function createUnknownErrorConflict(pathRelative: string, error: unknown): Conflict {
  return {
    type: 'unknown',
    path: pathRelative,
    actual: error instanceof Error ? error.message : String(error),
    suggestion: 'Review the operation manually before applying.'
  } satisfies Conflict;
}
