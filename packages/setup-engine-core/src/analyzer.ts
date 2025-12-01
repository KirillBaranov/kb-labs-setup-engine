import type { AnalyzerBatch } from './contracts';
import { BasicAnalyzer } from './analyzer/basic-analyzer';
import type { OperationRegistry } from './operation-registry';

export interface AnalyzerFactoryOptions {
  workspaceRoot: string;
  registry?: OperationRegistry;
}

export function createAnalyzer(options: AnalyzerFactoryOptions): AnalyzerBatch {
  if (!options?.workspaceRoot) {
    throw new Error('createAnalyzer requires workspaceRoot option.');
  }

  const analyzer = new BasicAnalyzer({ cwd: options.workspaceRoot, registry: options.registry });
  return {
    analyzeAll: (operations) => analyzer.analyzeAll(operations),
  };
}
