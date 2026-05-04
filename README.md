# Deck Harbor

Deck Harbor is a multiplayer card-game hub for two fast-paced tabletop games:

- Love Letter, with room-based play, optional bots, spectators, and private effect handling
- Skull King, with trick play, bidding, turn timers, and live room state sync

The project is split into a small web client, a Socket.IO server, and a shared rules and engine package that powers both games.

## Features

- Create or join rooms with a short code
- Play as a player or join as a spectator
- Chat inside rooms during matches
- Use bots in Love Letter to fill seats or test game flow
- View in-game card guides and rules from the UI
- Keep game logic shared between the server and client through the workspace packages

## Tech Stack

- React + Vite for the web client
- Socket.IO for real-time room updates
- TypeScript across the full monorepo
- Shared game engines and rules in `packages/shared`

## Getting Started

Install dependencies from the repository root:

```bash
npm install
```

Start the development servers:

```bash
npm run dev
```

This runs the server and web app together.

## Available Scripts

From the repository root:

- `npm run dev` - start the server and web client in development mode
- `npm run typecheck` - run TypeScript checks across the workspace
- `npm run test` - run type checks and the shared game tests

## Project Structure

- `apps/server` - Socket.IO game server and room orchestration
- `apps/web` - Vite React client and UI
- `packages/shared` - shared cards, rules, engines, and game types

## Notes

- The browser app restores the last selected game, name, and room from local storage.
- Love Letter and Skull King each have their own room pages and rules helpers in the UI.