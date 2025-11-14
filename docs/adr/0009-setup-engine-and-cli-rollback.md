# ADR-0009: Unified Setup Engine, Journaling, and CLI Rollback

**Date:** 2025-11-14  
**Status:** Accepted  
**Deciders:** KB Labs Platform Team  
**Last Reviewed:** 2025-11-14  
**Reviewers:** —  
**Tags:** setup, cli, safety, rollback

## Context

Plugin onboarding had diverged across products: some templates wrote files imperatively, others copied scripts. There was no diff/preview, repeated runs duplicated config, and any failure outside `.kb/` could leave the workspace in a broken state. Additionally, there was no standard way to rollback changes or to give users confidence before accepting modifications.

Requirements gathered from stakeholders:

- Declarative setup operations (ensure file/config/import/script) with idempotency guarantees.
- Dry-run and diff preview prior to writing anything.
- Journaling + backups to enable rollback flows.
- Ability to extend the system with custom operations from future plugins.
- CLI experience should remain “`pnpm kb <namespace>:setup`”, with optional `setup:rollback`.
- Backwards compatibility with imperative helpers (`ctx.runtime.fs`, `ctx.runtime.config`) to avoid blocking existing plugins.

## Decision

1. **Setup Engine packages (`kb-labs-setup-engine` monorepo).**
   - `@kb-labs/setup-operations`: shared operation types + `SetupBuilder`.
   - `@kb-labs/setup-engine`: Analyzer → Planner → Executor pipeline, ChangeJournal, and new `OperationRegistry` for extensions.

2. **Change tracking + rollback.**
   - All operations (declarative builder + imperative shims) pass through `OperationTracker` inside plugin runtime.
   - Executor wraps real filesystem writes with automatic backups and logs snapshots in `.kb/logs/setup/<namespace>-<id>.json`.
   - `setup:rollback` replays the journal in reverse order, restoring files from backups/snapshots.

3. **CLI orchestration.**
   - `plugin-setup-command.ts` composes analyzer/planner/executor/journal via a single `operationRegistry`.
   - Flags: `--dry-run`, `--force`, `--yes`, `--kb-only`.
   - New command `plugin-setup-rollback.ts` (auto-registered as `<namespace>:setup:rollback`) with `--list`, `--log`, `--yes`.

4. **Guidance for plugin authors.**
   - Templates now showcase both `SetupBuilder` usage and imperative helpers.
   - Docs (`docs/cli-guide.md`, `docs/plugin-development.md`) updated to describe builder-first flows, logging, and rollback.

## Consequences

### Positive

- Consistent, idempotent setup flows across plugins.
- Safe dry-run and diff preview—users can see planned operations before accepting.
- Automatic journaling enables rollback command, improving trust.
- OperationRegistry allows future plugins to add custom analyzers/diff/execution logic without forking core code.
- Template + docs make best practices observable for contributors.

### Negative

- Executor introduces more complexity (backups, journals) and requires disciplined testing.
- Additional packages (`setup-engine`, `setup-operations`) need publishing/versioning.
- Rollback currently focuses on file/config/script operations; AST/code patches still rely on future extensions.

### Alternatives Considered

- **Keep imperative-only helpers.** Rejected: no consistent diff/idempotency/rollback, repeated regressions likely.
- **Use existing devlink/apply engine.** Rejected: heavier (lockfiles, manifests) and tightly coupled to DevLink semantics.
- **Defer rollback until later.** Rejected: stakeholders insisted on safety guarantees before enabling setup ecosystem-wide.

## Implementation

- `kb-labs-setup-engine` repository hosts new packages, ADRs, and docs.
- Plugin runtime updated to expose `OperationTracker`, `SmartConfigHelper`, and propagate operation metadata to the engine.
- CLI commands discover setup + rollback entries automatically.
- Template handler + docs updated; e2e tests added to `@kb-labs/cli-commands`.
- Follow-up: extend OperationRegistry with more builtin handlers (code operations), improve rollback UX (diff previews per log).

## References

- PR: _tbd_  
- Related ADRs: [0002-plugins-and-extensibility](./0002-plugins-and-extensibility.md), [0004-versioning-and-release-policy](./0004-versioning-and-release-policy.md)

---

**Last Updated:** 2025-11-14  
**Next Review:** 2026-02-14

