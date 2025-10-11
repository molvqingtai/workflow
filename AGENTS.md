# Repository Guidelines

## Project Structure & Module Organization
The repository is a pnpm workspace that links `core` and `__tests__`. Authoritative source code lives in `core/src`, with entry re-exports in `core/src/index.ts` and compiled output in `core/dist` for distribution. Shared configuration (Prettier, commitlint, Husky) sits at the root, while test fixtures and Vitest suites are grouped under `__tests__/unit`.

## Build, Test, and Development Commands
Install dependencies once with `pnpm install`. Use `pnpm dev` for an iterative build of `core` via `tsdown`, and `pnpm build` to emit optimized ESM artifacts into `core/dist`. Run `pnpm lint` for ESLint+Prettier autofix, `pnpm check` for TypeScript project validation, and `pnpm test` to execute the Vitest suite with type checking enabled.

## Coding Style & Naming Conventions
TypeScript is the default; prefer ES module syntax and keep ambient types in `.d.ts` files when needed. Prettier enforces two-space indentation, 120-character lines, single quotes, and no semicolons—do not override these conventions manually. Export classes (for example, `Workflow`, `Work`, `Step`) in PascalCase, while helper modules such as `utils/uuid.ts` stay in camelCase; mirror existing folder casing when adding files.

## Testing Guidelines
Unit tests live beside shared fixtures in `__tests__/unit` and follow the `*.test.ts` suffix. Aim to cover new workflow branches (success, pause/resume, failure) and verify emitted snapshots, not just return values. Before opening a PR, run `pnpm test` locally; if a test needs data setup, create reusable helpers instead of ad-hoc mocks to keep suites deterministic.

## Commit & Pull Request Guidelines
Commits must follow Conventional Commits, enforced by `.commitlintrc` and the Husky `commit-msg` hook (`pnpm commitlint --edit "$1"`). The `pre-commit` hook runs `pnpm lint && pnpm check`, so ensure both pass before staging. Pull requests should explain the workflow scenario addressed, link to related issues, and include screenshots or CLI logs when behavior changes; mention any follow-up tasks so reviewers can triage safely.
