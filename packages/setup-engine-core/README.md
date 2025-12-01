# @kb-labs/setup-engine

Core analysis, planning, and execution engine for KB Labs setup workflows.

## Vision & Purpose

**@kb-labs/setup-engine** provides core analysis, planning, and execution engine for KB Labs setup workflows. It includes analyzers, planners, executors, and journals for idempotent setup operations.

### Core Goals

- **Analysis**: Analyze current state and determine required operations
- **Planning**: Plan execution order for operations
- **Execution**: Execute operations idempotently
- **Journaling**: Track changes and support rollback

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Setup Engine
    │
    ├──► Analyzer
    ├──► Planner
    ├──► Executor
    ├──► Journal
    └──► Operation Registry
```

### Key Components

1. **Analyzer** (`analyzer/`): Analyze current state and determine required operations
2. **Planner** (`planner/`): Plan execution order for operations
3. **Executor** (`executor/`): Execute operations idempotently
4. **Journal** (`journal/`): Track changes and support rollback
5. **Operation Registry** (`operation-registry.ts`): Registry of available operations

## ✨ Features

- **State Analysis**: Analyze current state and determine required operations
- **Execution Planning**: Plan execution order for operations
- **Idempotent Execution**: Execute operations idempotently
- **Change Journaling**: Track changes and support rollback
- **Operation Registry**: Registry of available operations

## 📦 API Reference

### Main Exports

#### Analyzer

- `createAnalyzer`: Create analyzer instance

#### Planner

- `createPlanner`: Create planner instance

#### Executor

- `createExecutor`: Create executor instance

#### Journal

- `createChangeJournal`: Create change journal instance

#### Operation Registry

- `createOperationRegistry`: Create operation registry
- `OperationRegistry`: Operation registry class

## 🔧 Configuration

### Configuration Options

All configuration via function parameters.

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/setup-operations` (`workspace:^0.1.0`): Setup operations

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
├── analyzer/
│   └── basic-analyzer.test.ts
├── executor.test.ts
├── index.test.ts
└── planner.test.ts
```

### Test Coverage

- **Current Coverage**: ~75%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for analysis, O(n log n) for planning, O(n) for execution
- **Space Complexity**: O(n) where n = number of operations
- **Bottlenecks**: Large operation sets

## 🔒 Security

### Security Considerations

- **Input Validation**: Operation input validation
- **Path Validation**: Path validation for file operations

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Operation Types**: Fixed operation types
- **Planner Types**: Fixed planner types

### Future Improvements

- **More Operation Types**: Additional operation types
- **More Planner Types**: Additional planner types

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Create Analyzer

```typescript
import { createAnalyzer } from '@kb-labs/setup-engine';

const analyzer = createAnalyzer();
const operations = await analyzer.analyze(currentState, targetState);
```

### Example 2: Create Planner

```typescript
import { createPlanner } from '@kb-labs/setup-engine';

const planner = createPlanner();
const plan = await planner.plan(operations);
```

### Example 3: Create Executor

```typescript
import { createExecutor } from '@kb-labs/setup-engine';

const executor = createExecutor();
const results = await executor.execute(plan);
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
