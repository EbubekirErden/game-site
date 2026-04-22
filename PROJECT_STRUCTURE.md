# Project Structure

This repository uses a small monorepo layout:

- `apps/` contains runnable applications.
- `packages/` contains shared code used by one or more apps.
- Root config files keep TypeScript and workspace settings consistent.

## Tree View

```text
game-site/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   │   └── CardView.tsx
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── cards.ts
│       │   ├── engine.ts
│       │   ├── index.ts
│       │   ├── rules.ts
│       │   └── types.ts
│       ├── package.json
│       └── tsconfig.json
├── .gitignore
├── package.json
├── tsconfig.base.json
├── tsconfig.json
└── PROJECT_STRUCTURE.md
```

## Folder Roles

### `apps/`

Holds user-facing or deployable applications.

### `apps/server/`

Contains the backend Socket.IO server.

- `src/index.ts`: server entrypoint and room event wiring.
- `package.json`: server package dependencies.
- `tsconfig.json`: server-specific TypeScript settings.

### `apps/web/`

Contains frontend UI code.

- `src/components/`: React UI pieces.
- `src/components/CardView.tsx`: card presentation component.
- `src/index.ts`: web package entrypoint barrel.
- `package.json`: frontend package dependencies.
- `tsconfig.json`: frontend-specific TypeScript settings including JSX and DOM libs.

### `packages/`

Holds reusable code that should not belong to a single app.

### `packages/shared/`

Contains shared game domain code used by both server and web.

- `src/types.ts`: shared domain types.
- `src/cards.ts`: card definitions.
- `src/rules.ts`: action and rule result types.
- `src/engine.ts`: game state creation and round-start logic.
- `src/index.ts`: package barrel export so apps can import from `@game-site/shared`.
- `package.json`: shared package metadata.
- `tsconfig.json`: shared package build and declaration settings.

## Root Files

- `package.json`: workspace root and shared scripts such as `npm run typecheck`.
- `tsconfig.base.json`: common TypeScript compiler settings and shared import aliases.
- `tsconfig.json`: project references entrypoint for multi-package typechecking.
- `.gitignore`: ignores generated artifacts like `node_modules`, `dist`, and `*.tsbuildinfo`.

## Import Strategy

Apps should prefer package-level imports instead of deep relative paths.

Example:

```ts
import { createGame } from "@game-site/shared";
```

This keeps imports stable as the repo grows and avoids fragile paths like `../../../packages/shared/...`.
