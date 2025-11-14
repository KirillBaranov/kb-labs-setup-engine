# @kb-labs/setup-operations

Typed operation primitives and fluent builder utilities that power the KB Labs setup engine.

## Installation

```bash
pnpm add @kb-labs/setup-operations
# or
npm install @kb-labs/setup-operations
```

## Features

- Declarative operation types (`file`, `config`, `code`, `script`)
- Rich metadata for idempotency, rollback, and dependency planning
- `SetupBuilder` fluent API for composing setup flows
- TypeScript-first design validated with Vitest type assertions

## Quick Start

```ts
import { SetupBuilder } from '@kb-labs/setup-operations';

const builder = new SetupBuilder();

builder
  .ensureFile('.kb/example/config.yml', 'enabled: true')
  .ensureConfigSection('plugins.example', { enabled: true })
  .ensureImport('src/main.ts', '@kb-labs/example', {
    named: ['init'],
    position: 'after-imports'
  })
  .suggestScript('example:check', { command: 'kb example check' });

const { operations } = builder.build();
```

## License

MIT © KB Labs


