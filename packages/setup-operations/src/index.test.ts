import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  SetupBuilder,
  type CodeOperation,
  type ConfigOperation,
  type FileOperation,
  type Operation,
  type OperationKind,
  type OperationMetadata,
  type OperationWithMetadata,
  type ScriptOperation
} from './index.js';

describe('@kb-labs/setup-operations types', () => {
  it('exposes the union of operation kinds', () => {
    expectTypeOf<OperationKind>().toEqualTypeOf<'file' | 'config' | 'code' | 'script'>();
  });

  it('allows constructing a minimal file operation', () => {
    const op: FileOperation = {
      kind: 'file',
      action: 'ensure',
      path: '.kb/example.txt'
    };

    expect(op.path).toBe('.kb/example.txt');
  });

  it('allows composing an operation with metadata', () => {
    const operation: Operation = {
      kind: 'config',
      action: 'merge',
      path: '.kb/kb-labs.config.json',
      pointer: '/plugins/example',
      value: { enabled: true }
    } satisfies ConfigOperation;

    const wrapped: OperationWithMetadata = {
      operation,
      metadata: {
        id: 'config-1',
        description: 'Enable example plugin',
        idempotent: true,
        reversible: true
      }
    } satisfies OperationWithMetadata<ConfigOperation>;

    expect(wrapped.metadata.id).toBe('config-1');
  });

  it('supports advanced code operations', () => {
    const op: CodeOperation = {
      kind: 'code',
      action: 'ensureImport',
      file: 'src/index.ts',
      language: 'typescript',
      import: {
        specifier: '@kb-labs/example',
        named: ['init']
      }
    };

    expect(op.import?.specifier).toBe('@kb-labs/example');
  });

  it('supports script operations with conflict resolution', () => {
    const op: ScriptOperation = {
      kind: 'script',
      action: 'ensure',
      file: 'package.json',
      name: 'example',
      command: 'kb example run',
      conflictResolution: 'prompt'
    };

    expect(op.conflictResolution).toBe('prompt');
  });

  it('defines operation metadata contract', () => {
    const meta: OperationMetadata = {
      id: 'op-123',
      description: 'Example metadata',
      idempotent: true,
      reversible: false,
      tags: ['example']
    };

    expect(meta.id).toBe('op-123');
  });
});

describe('SetupBuilder', () => {
  it('collects operations with automatically generated identifiers', () => {
    const builder = new SetupBuilder();
    builder.ensureFile('.kb/example.txt', 'hello');

    const result = builder.build();
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].metadata.id).toMatch(/^file-\d+$/);
  });

  it('normalises config pointers', () => {
    const builder = new SetupBuilder();
    builder.ensureConfigSection('plugins.example.settings', { enabled: true });

    const [{ operation }] = builder.build().operations;
    expect(operation.kind).toBe('config');
    expect((operation as ConfigOperation).pointer).toBe('/plugins/example/settings');
  });

  it('tracks dependencies through dependsOn', () => {
    const builder = new SetupBuilder();
    builder.ensureFile('.kb/base.yaml', 'base');
    const firstId = builder.getLastOperationId();
    builder.ensureFile('.kb/extended.yaml', 'extended').dependsOn(firstId!);

    const [, second] = builder.build().operations;
    expect(second.metadata.dependencies).toEqual([firstId]);
  });

  it('supports custom script suggestions', () => {
    const builder = new SetupBuilder();
    builder.suggestScript('kb:check', {
      command: 'kb example check',
      description: 'Run KB Labs example check'
    });

    const [{ operation }] = builder.build().operations;
    expect(operation.kind).toBe('script');
    expect((operation as ScriptOperation).command).toBe('kb example check');
  });

  it('generates template-backed file operations', () => {
    const builder = new SetupBuilder();
    builder.ensureFileFromTemplate('.kb/example.yml', './templates/example.yml.hbs', {
      variables: { name: 'demo' }
    });

    const [{ operation }] = builder.build().operations;
    expect(operation.kind).toBe('file');
    expect((operation as FileOperation).template).toEqual({
      source: './templates/example.yml.hbs',
      variables: { name: 'demo' }
    });
  });
});
