# AGENTS.md

## Scope

This file applies to the entire repository. More specific `AGENTS.md` files may add narrower rules for their subdirectories, but must not weaken the constraints below.

## Product

The product is **烛照AI投标助手（Zhuzhao AI Bidding Assistant）**, a web application for managing bidding projects, candidate quotations, company performance history, multi-scenario 清标 calculations, 定标 forecasts, decision analysis, and reports.

User-facing copy is Chinese. Source code identifiers, database identifiers, type names, comments that explain implementation details, and commit messages should be clear English unless a statutory or domain term is clearer in Chinese pinyin.

## Required stack

- Next.js with the App Router
- TypeScript in strict mode
- Tailwind CSS
- shadcn/ui
- Prisma ORM
- SQLite for the MVP
- A schema and persistence boundary that can migrate to PostgreSQL
- A single full-stack application; do not introduce microservices without an approved architecture change
- `pnpm` as the package manager once the application is scaffolded

Do not replace a required technology without explicit user approval.

## Architecture boundaries

Use these top-level code boundaries once the application is scaffolded:

- `src/app`: routes, layouts, route handlers, and thin Server Action adapters
- `src/components/ui`: shadcn/ui primitives
- `src/components/layout`: application shell and shared layout components
- `src/features`: feature-specific UI, view models, form schemas, and client interactions
- `src/domain`: framework-independent domain types, value objects, policies, and pure calculation functions
- `src/server/application`: use-case orchestration and transaction boundaries
- `src/server/repositories`: persistence interfaces and Prisma-backed implementations
- `src/server/db`: Prisma client and database-only utilities
- `src/lib`: small cross-cutting utilities that do not belong to a domain module

Dependency direction must stay inward:

```text
app/features -> server application -> domain
                         |
                         v
                   repositories -> Prisma
```

The domain layer must not import React, Next.js, Prisma Client, browser APIs, route handlers, Server Actions, or UI components.

React pages and components must not import Prisma Client. Database access is server-only and goes through application services/repositories.

Route handlers and Server Actions must remain thin: validate input, authorize, call an application service, and map the result. They must not contain business formulas.

## Business calculation rules

- All core 清标、定标、履约 and decision-analysis formulas must be independent TypeScript functions under `src/domain`.
- Formula functions must be deterministic and side-effect free.
- Formula input and output types must be explicit and domain-oriented.
- Do not read from the database, environment, clock, random generator, or UI state inside formula functions.
- Do not embed business formulas in React components, Server Actions, route handlers, Prisma queries, or report templates.
- Every formula must have unit tests that cover normal inputs, boundary values, ties, missing-data policy, rounding, and invalid input.
- Persist the calculation rule version and input revision with every saved result.
- Do not implement or silently assume unresolved formulas. In particular, 清标 K2 semantics, 定标 M-value semantics, percentage representation, ranking tie-breaking, and performance weighting require an approved rule and golden test fixture.

## Numeric correctness

- Do not use JavaScript `number` arithmetic for money, percentages, scores, averages, ranking distances, or formula intermediates.
- Use an approved arbitrary-precision decimal library in the domain layer. Keep that library independent from Prisma.
- Convert Prisma decimal values to domain decimal values at repository boundaries.
- API and Server Action DTOs must serialize money, rates, scores, and computed decimal values as canonical decimal strings, not JSON floating-point numbers.
- Store rates internally as decimal fractions: `1%` is `0.01`. Format percentages only at the presentation boundary.
- Define rounding explicitly at output boundaries. Do not round intermediate values unless the signed-off business rule says to do so.
- Ranking and winner selection must use unrounded values.

## TypeScript rules

- Enable strict TypeScript checking.
- Do not use `any`, `as any`, `@ts-ignore`, or broad type assertions to bypass errors.
- Treat external input as `unknown` and validate it before use.
- Prefer discriminated unions and exhaustive `switch` statements for calculation and workflow states.
- Avoid non-null assertions. Prove the value exists or return a typed error.
- Keep domain types separate from Prisma-generated types and UI form types; map explicitly at boundaries.
- Do not expose Prisma models directly as public DTOs.

Recommended compiler checks include:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitOverride`
- `useUnknownInCatchVariables`
- `noFallthroughCasesInSwitch`
- `noEmit`

## Validation and errors

- Validate all mutation inputs on the server with a schema validator such as Zod.
- Client-side validation improves usability but never replaces server validation.
- Represent expected domain failures with typed results/errors. Do not use generic exceptions for normal validation failures.
- Chinese UI error messages must identify the field or business rule that failed.
- Never return raw database errors, stack traces, or sensitive paths to the client.

## Next.js and UI rules

- Use Server Components by default. Add `"use client"` only to the smallest interactive boundary that needs it.
- Fetch initial data on the server. Do not add client-side data fetching for data already available during server rendering without a clear reason.
- Use shadcn/ui primitives from `src/components/ui`; compose business components under `src/features`.
- Keep accessibility intact: labels, keyboard navigation, focus states, error associations, and non-color-only status indicators are required.
- Use Tailwind design tokens and shared variants. Avoid repeated arbitrary values and large inline class expressions when a component or variant is clearer.
- Keep UI text Chinese and business identifiers English.
- Wide calculation tables are desktop-first, but result pages must remain readable on smaller screens.

## Persistence and migrations

- Use Prisma migrations for schema changes. Do not edit an already-applied migration.
- Do not commit local SQLite database files, temporary databases, generated exports, or secrets.
- Use stable string IDs (`cuid`/UUID style) rather than SQLite row IDs in domain relationships.
- Model multi-select relationships explicitly. Do not store comma-separated company IDs or project types in one field.
- Add foreign keys, uniqueness constraints, and indexes for business identities and common lookups.
- Avoid SQLite-specific raw SQL and database behavior that would block PostgreSQL migration.
- SQLite enum values still require application validation.
- Save immutable input snapshots or revision references for calculated results so historical reports remain reproducible.

## Testing strategy

- Use Vitest for pure domain unit tests and service-level tests.
- Use React Testing Library only where component behavior adds value; do not replace domain tests with component tests.
- Use isolated temporary SQLite databases for repository/integration tests.
- Use Playwright for a small set of critical end-to-end flows after pages exist.
- Prefer golden fixtures approved by the business for formula verification.
- Tests must be deterministic and must not depend on execution order or a developer's local database.

Expected scripts after scaffolding:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
```

The default pre-merge quality gate is:

```text
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Run E2E tests when a changed user flow is covered by Playwright or before a release.

## Linting and formatting

- Use ESLint with a flat `eslint.config.mjs` configuration and the Next.js TypeScript rules.
- Run ESLint directly; do not use the removed `next lint` command.
- Treat warnings as failures in CI.
- Enforce `@typescript-eslint/no-explicit-any` as an error.
- Add Prettier only for formatting; do not make it a competing linter.
- Keep generated shadcn/ui source formatted, typed, and lint-clean after generation.

## Change discipline

- Inspect the working tree before editing.
- Preserve user changes and unrelated working functionality.
- Do not refactor unrelated modules merely to complete the current task.
- Keep commits and patches focused on one bounded concern.
- Do not initialize new infrastructure, install packages, change the package manager, or alter the database schema unless the current task requires it.
- Update architecture and domain documentation when a decision changes module boundaries, data ownership, calculation contracts, or persistence strategy.

## Definition of done

A code change is not complete until, in proportion to its scope:

- Types are explicit and no forbidden escape hatch is used.
- Server-side validation exists for changed inputs.
- Business logic is outside React and transport adapters.
- Relevant unit/integration/E2E tests pass.
- Lint and TypeScript checks pass.
- Database changes include a migration and repository tests.
- User-facing behavior and failure states are verified.
- Documentation is updated for architectural or formula changes.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
