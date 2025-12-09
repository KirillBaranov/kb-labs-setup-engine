# KB Labs Setup Engine

> **Setup workflows for the KB Labs ecosystem.** Declarative operations, idempotent execution, and rollback-ready installers for plugins, CLIs, and platform tools.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Purpose

`kb-labs-setup-engine` is the home for the next-generation setup system across the KB Labs ecosystem. It provides:

- **`@kb-labs/setup-operations`** – type-safe operation primitives and a fluent builder
- **`@kb-labs/setup-engine`** – analyzers, planners, and transactional executors

Together they power plugin setup commands (`kb <plugin> setup`), workspace bootstrap flows, and future installers that demand idempotency, diff previews, and safe rollback.

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/kirill-baranov/kb-labs-setup-engine.git
cd kb-labs-setup-engine

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## 📦 Packages

| Package | Description |
|---------|-------------|
| [`@kb-labs/setup-operations`](./packages/setup-operations/) | Operation types, metadata, and fluent builder utilities |
| [`@kb-labs/setup-engine`](./packages/setup-engine/) | Analyzer, planner, executor, and change journal runtime |

## 📁 Repository Structure

```
kb-labs-setup-engine/
├── apps/                # Demo apps and integration sandboxes
│   └── demo/            # Playground for showcasing setup flows
├── packages/            # Publishable libraries
│   ├── setup-operations/
│   └── setup-engine/
├── docs/                # Architecture decision records and guides
└── scripts/             # DevKit sync utilities
```

## 🔧 Tooling & Requirements

- **Node.js** ≥ 18.18.0
- **pnpm** ≥ 9.0.0
- **TypeScript** + **Vitest** via shared DevKit presets

Common commands:

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages via TSUP |
| `pnpm test` | Run package unit tests |
| `pnpm lint` | Lint repository code |
| `pnpm type-check` | Type-check all packages |

## 🤝 Contributing

1. Fork the repo & create a feature branch
2. Run `pnpm install` and `pnpm devkit:sync`
3. Add tests for new behaviour
4. Submit a PR with clear description and ADR references if needed

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution workflow.

## 📄 License

MIT © KB Labs

## License

KB Public License v1.1 - see [LICENSE](LICENSE) for details.

This is open source software with some restrictions on:
- Offering as a hosted service (SaaS/PaaS)
- Creating competing platform products

For commercial licensing inquiries: contact@kblabs.dev

**User Guides:**
- [English Guide](../LICENSE-GUIDE.en.md)
- [Русское руководство](../LICENSE-GUIDE.ru.md)
