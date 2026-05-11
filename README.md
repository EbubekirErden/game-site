# Deck Harbor

Deck Harbor is a real-time multiplayer card game platform focused on shared game-engine design, responsive room-based play, and bot experimentation.

The project currently includes two games:

- Love Letter, with public and private state handling, spectator support, and multiple bot difficulty levels
- Skull King, with trick-taking flow, bidding, turn progression, and synchronized room state

Beyond playable matches, the repository also includes bot-decision infrastructure, simulation helpers, and telemetry logs that are useful for AI experimentation, heuristic evaluation, and reinforcement-learning-style workflows.

## Highlights

- Real-time multiplayer rooms powered by Socket.IO
- Shared TypeScript game engines used across server and client boundaries
- Love Letter support for random, smart, and hard bots
- Bot memory, decision scoring, and per-turn telemetry logging
- Simulation utilities for enumerating and stepping legal Love Letter bot actions
- Spectator mode, room chat, and reconnect handling
- Separate UI flows and rules helpers for Love Letter and Skull King

## Architecture

The repository is organized as a small monorepo:

- `apps/web` - React + Vite frontend
- `apps/server` - Socket.IO server, room orchestration, and bot runtime
- `packages/shared` - shared game rules, types, cards, and engines

This layout keeps core game logic centralized in `packages/shared`, which helps maintain consistency between gameplay validation, server orchestration, bot reasoning, and client presentation.

## Bot, Simulation, and RL-Adjacent Work

The Love Letter server includes several building blocks for bot and agent research:

- Rule-based bots with random, smart, and hard strategies
- Decision-candidate generation and heuristic scoring in [`apps/server/src`](apps/server/src)
- A simulation helper in [apps/server/src/loveLetterSimulator.ts](/Users/ebubekirerden/Documents/VSCode/game-site/apps/server/src/loveLetterSimulator.ts) for listing legal actions and stepping game state forward
- Bot telemetry in [apps/server/bot-logs/love-letter-bot-decisions.jsonl](/Users/ebubekirerden/Documents/VSCode/game-site/apps/server/bot-logs/love-letter-bot-decisions.jsonl) for offline analysis and future training workflows

In practical terms, that means the repository already supports:

- Heuristic bot development
- Offline policy evaluation from logged behavior
- RL-style experimentation built on top of simulator and telemetry primitives
- External agent integration at the game-state level with additional API work

It does not currently expose a dedicated external-agent service or a full end-to-end reinforcement learning training pipeline out of the box. The current codebase is better described as having the core runtime pieces that make those workflows possible.

## Getting Started

Install dependencies from the repository root:

```bash
npm install
```

Start the web app and game server together:

```bash
npm run dev
```

By default, the Socket.IO server listens on `3001` and the Vite client runs on its standard development port.

## Scripts

From the repository root:

- `npm run dev` - start the web and server development processes
- `npm run typecheck` - run TypeScript project checks across the workspace
- `npm run test` - run type checks and the shared engine test suite

## Project Notes

- Love Letter supports both classic and premium modes
- The client persists recent local room and player selections
- Bot telemetry is stored as JSONL for easy inspection and downstream processing
- Current external integrations are internal Socket.IO game flows rather than a standalone agent API
