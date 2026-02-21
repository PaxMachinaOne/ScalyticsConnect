# Dependency Upgrade Plan

## Goal
Keep ScalyticsCopilot secure and maintainable while minimizing regression risk.

## Principles
- Upgrade in small batches, not all-at-once.
- Prioritize security and runtime-critical dependencies first.
- Require green checks (`npm test`, frontend build, python compile) after each batch.
- Avoid major toolchain migrations in the same PR as security updates.

## Phase 1 (Now): Baseline + Safe Checks
- Capture outdated packages (backend + frontend).
- Capture audit findings (backend + frontend).
- Keep CI green with current lockfiles.

Commands:
- `npm run deps:check`
- `npm run deps:audit`
- `cd frontend && npm run deps:check && npm run deps:audit`

## Phase 2: Low-Risk Updates
- Patch/minor updates for direct dependencies with no breaking API changes.
- Rebuild and run tests after each dependency group.

## Phase 3: Medium-Risk Updates
- Update old transitive-heavy packages (where warnings are noisy but non-critical).
- Validate runtime behavior of auth, providers, model activation, and chat streaming.

## Phase 4: Toolchain Modernization
- Plan migration off `react-scripts` to a modern build tool (Vite/Next) separately.
- Upgrade lint/test infrastructure once toolchain migration is complete.

## Release Gate
A dependency PR is merge-ready only when:
- Backend tests pass.
- Frontend production build passes.
- Python compile sanity passes.
- No new high-severity vulnerabilities introduced.
