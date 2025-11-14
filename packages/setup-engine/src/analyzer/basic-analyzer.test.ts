import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BasicAnalyzer } from './basic-analyzer.js';
import { createOperationRegistry } from '../operation-registry.js';
import type {
  OperationMetadata,
  OperationWithMetadata,
  FileOperation,
  ConfigOperation
} from '@kb-labs/setup-operations';

function createMetadata(id: string, description = id): OperationMetadata {
  return {
    id,
    description,
    idempotent: true,
    reversible: true
  };
}

describe('BasicAnalyzer', () => {
  let workspace: string;
  let analyzer: BasicAnalyzer;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'setup-engine-analyzer-'));
    analyzer = new BasicAnalyzer({ cwd: workspace });
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('marks ensure file operation as not needed when content already matches', async () => {
    const filePath = path.join(workspace, 'README.md');
    await fs.writeFile(filePath, 'hello world', 'utf8');

    const operation: OperationWithMetadata<FileOperation> = {
      metadata: createMetadata('file-1', 'ensure README'),
      operation: {
        kind: 'file',
        action: 'ensure',
        path: 'README.md',
        content: 'hello world'
      }
    };

    const result = await analyzer.analyze(operation);
    expect(result.needed).toBe(false);
    expect(result.risk).toBe('safe');
  });

  it('marks delete file as not needed when file already missing', async () => {
    const operation: OperationWithMetadata<FileOperation> = {
      metadata: createMetadata('file-delete-1', 'remove tmp file'),
      operation: {
        kind: 'file',
        action: 'delete',
        path: 'missing.txt'
      }
    };

    const result = await analyzer.analyze(operation);
    expect(result.needed).toBe(false);
    expect(result.notes?.[0]).toContain('already removed');
  });

  it('detects config merge already satisfied', async () => {
    const configPath = path.join(workspace, '.kb', 'kb-labs.config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          plugins: {
            demo: {
              enabled: true,
              level: 'strict'
            }
          }
        },
        null,
        2
      )
    );

    const operation: OperationWithMetadata<ConfigOperation> = {
      metadata: createMetadata('config-1', 'ensure plugin config'),
      operation: {
        kind: 'config',
        action: 'merge',
        path: '.kb/kb-labs.config.json',
        pointer: '/plugins/demo',
        value: {
          enabled: true
        }
      }
    };

    const result = await analyzer.analyze(operation);
    expect(result.needed).toBe(false);
    expect(result.risk).toBe('safe');
  });

  it('requires config set when value differs', async () => {
    const configPath = path.join(workspace, 'kb.json');
    await fs.writeFile(configPath, JSON.stringify({ plugins: { demo: { enabled: false } } }));

    const operation: OperationWithMetadata<ConfigOperation> = {
      metadata: createMetadata('config-2', 'enable plugin'),
      operation: {
        kind: 'config',
        action: 'set',
        path: 'kb.json',
        pointer: '/plugins/demo/enabled',
        value: true
      }
    };

    const result = await analyzer.analyze(operation);
    expect(result.needed).toBe(true);
    expect(result.current).toBe(false);
  });

  it('uses custom analyzer from registry when provided', async () => {
    const registry = createOperationRegistry();
    registry.registerAnalyzer('custom', async () => ({
      needed: false,
      risk: 'safe',
      notes: ['handled by custom analyzer']
    }));

    const analyzer = new BasicAnalyzer({ cwd: workspace, registry });
    const operation: OperationWithMetadata = {
      metadata: createMetadata('custom-1', 'Custom op'),
      operation: {
        kind: 'custom',
        action: 'noop'
      } as any
    };

    const result = await analyzer.analyze(operation);
    expect(result.notes).toContain('handled by custom analyzer');
  });
});

