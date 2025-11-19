# @kb-labs/setup-operations

Typed operations and builder primitives for KB Labs setup workflows.

## Vision & Purpose

**@kb-labs/setup-operations** provides typed operations and builder primitives for KB Labs setup workflows. It includes operation types, builders, and utilities for creating idempotent setup operations.

### Core Goals

- **Operation Types**: TypeScript types for setup operations
- **Builder Primitives**: Builder utilities for creating operations
- **Idempotent Operations**: Support for idempotent setup operations

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Setup Operations
    │
    ├──► Operation Types
    ├──► Builder Primitives
    └──► Utilities
```

### Key Components

1. **Types** (`types/`): TypeScript type definitions for operations
2. **Builder** (`builder.ts`): Builder utilities for creating operations

## ✨ Features

- **Operation Types**: TypeScript types for setup operations
- **Builder Primitives**: Builder utilities for creating operations
- **Idempotent Operations**: Support for idempotent setup operations

## 📦 API Reference

### Main Exports

#### Types

- `SetupOperation`: Setup operation type
- `OperationResult`: Operation result type

#### Builder

- `createOperation`: Create setup operation
- `buildOperation`: Build operation from specification

## 🔧 Configuration

### Configuration Options

No configuration needed - pure type definitions and builders.

## 🔗 Dependencies

### Runtime Dependencies

None (pure types and builders)

### Development Dependencies

- `@kb-labs/devkit` (`github:KirillBaranov/kb-labs-devkit#main`): DevKit presets
- `@types/node` (`^20.16.10`): Node.js types
- `tsup` (`^8`): TypeScript bundler
- `tsx` (`^4.20.5`): TypeScript execution
- `vitest` (`^3`): Test runner

## 🧪 Testing

### Test Structure

```
src/
└── index.test.ts
```

### Test Coverage

- **Current Coverage**: ~70%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for type operations, O(1) for builder operations
- **Space Complexity**: O(1)
- **Bottlenecks**: None

## 🔒 Security

### Security Considerations

- **Type Safety**: TypeScript type safety

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Operation Types**: Fixed operation types

### Future Improvements

- **More Operation Types**: Additional operation types

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Create Operation

```typescript
import { createOperation } from '@kb-labs/setup-operations';

const operation = createOperation({
  type: 'write-file',
  path: 'package.json',
  content: '{}',
});
```

### Example 2: Build Operation

```typescript
import { buildOperation } from '@kb-labs/setup-operations';

const operation = buildOperation({
  type: 'write-file',
  path: 'package.json',
  content: '{}',
});
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
