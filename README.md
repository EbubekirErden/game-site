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

If you want to use the Love Letter RL bot (`normal game rl bot`), you also need Python and the RL model dependencies. From the sibling `RL_native` folder:

```bash
cd ../RL_native
python -m venv venv
```

Activate the virtual environment and install the Python packages:

```bash
venv\Scripts\activate
pip install -r requirements.txt
```

The server will try to use `../RL_native/venv/Scripts/python.exe` by default for the RL bot predictor. If your Python lives somewhere else, set `RL_BOT_PYTHON` before starting the app.

Start the development servers:

```bash
npm run dev
```

This runs the server and web app together.

On Windows PowerShell, `npm.ps1` may be blocked by execution policy. If that happens, use:

```bash
npm.cmd run dev
```

After the app is running, open the Love Letter lobby and use the `Add normal game rl bot` button to add the trained RL bot.

## Love Letter RL Training

Start the RL bridge from the `game-site` folder before training:

```bash
npx tsx apps/server/src/rl-server.ts
```

Then train from the sibling `RL_native` folder:

```bash
cd ../RL_native
.\venv\Scripts\python.exe train.py
```

Useful training knobs:

- `TARGET_TIMESTEPS=10000000` - train or resume until this total timestep count
- `RESUME_FROM=auto` - resume from the latest checkpoint; use `RESUME_FROM=new` for a fresh model
- `BOT_COUNT=3` - force 1, 2, or 3 opponents
- `BOT_STRATEGIES=hard` - repeat one strategy for every bot
- `BOT_STRATEGIES=random,smart,hard` - cycle a fixed strategy mix
- `BOT_STRATEGY_POOL=random,hard` - keep random opponent count, but sample each bot from this strategy pool
- `LOVE_LETTER_MODE=classic` or `premium`

Example random-size random/hard pool run:

```bash
$env:TARGET_TIMESTEPS="10000000"
$env:BOT_STRATEGY_POOL="random,hard"
.\venv\Scripts\python.exe train.py
```

Evaluate fixed scenarios after training:

```bash
$env:EVAL_GAMES="300"
.\venv\Scripts\python.exe evaluate_scenarios.py
```

The RL observation schema must match the trained model. After a new self-play training run, copy the resulting `RL_native/masked_ppo_love_letter_self_play_agent.zip` to `game-site/models/masked_ppo_love_letter_self_play_agent.zip` before using the in-app RL bot.

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
- The RL bot model is loaded from `models/masked_ppo_love_letter_self_play_agent.zip`.
