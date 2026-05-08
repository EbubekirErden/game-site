# Codex Bot integration guide

This project now includes a server-side **Codex Bot** for Love Letter. The bot uses your local Codex CLI ChatGPT login, following the same credential-borrowing idea as [`simonw/llm-openai-via-codex`](https://github.com/simonw/llm-openai-via-codex).

The browser never receives your ChatGPT/Codex tokens. All Codex requests happen inside the Node server.

## What was added

- `apps/server/src/codexAuth.ts` — reads and refreshes Codex CLI ChatGPT OAuth credentials from `~/.codex/auth.json` or `$CODEX_HOME/auth.json`.
- `apps/server/src/codexClient.ts` — calls the Codex backend Responses endpoint with structured JSON output.
- `apps/server/src/codexBotBrain.ts` — asks Codex to choose from existing legal Love Letter actions only.
- `room:add-codex-bot` Socket.IO event — lets the room creator add a Codex Bot in the lobby.
- `server:capabilities` Socket.IO event — lets the UI know whether Codex Bot is configured.
- UI button: **Add Codex Bot**.

## How the bot makes safe moves

The LLM does **not** create arbitrary game actions. The server first calls the existing deterministic helper:

```ts
listBotActionCandidates(view)
```

Then Codex receives a compact observation plus an indexed list of legal candidates and must return JSON like:

```json
{
  "candidateIndex": 0,
  "reason": "This is the strongest legal play."
}
```

The server validates the index. If Codex fails, times out, returns invalid JSON, or chooses an invalid option, the bot falls back to Smart Bot logic and then Random Bot logic.

## Step-by-step setup on your machine

### 1. Install project dependencies

From the repo root:

```bash
npm install
```

### 2. Install and authenticate Codex CLI

Make sure the OpenAI Codex CLI is installed and authenticated with your paid ChatGPT account.

```bash
codex login
```

After login, this file should exist:

```bash
ls ~/.codex/auth.json
```

The integration expects this file to contain ChatGPT OAuth credentials with:

```json
{
  "auth_mode": "chatgpt"
}
```

If you use a custom Codex home directory, set `CODEX_HOME` to the directory that contains `auth.json`.

### 3. Start the app with Codex Bot enabled

For local development:

```bash
CODEX_BOT_ENABLED=true \
CODEX_BOT_MODEL=gpt-5.4-mini \
CODEX_BOT_TIMEOUT_MS=12000 \
npm run dev
```

Environment variables:

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `CODEX_BOT_ENABLED` | Yes | disabled | Must be exactly `true` for Codex Bot to be available. |
| `CODEX_BOT_MODEL` | No | `gpt-5.4-mini` | Model slug sent to the Codex backend. |
| `CODEX_BOT_TIMEOUT_MS` | No | `12000` | Abort Codex decision calls after this many milliseconds. |
| `CODEX_HOME` | No | `~/.codex` | Directory containing `auth.json`. |

### 4. Add the bot in the game UI

1. Open the app.
2. Create or join a **Love Letter** room.
3. Stay in the lobby.
4. As the room creator, click **Add Codex Bot**.
5. Start the round.

The bot acts on its turn after the normal bot delay.

### 5. Verify behavior

Run:

```bash
npm run typecheck
npm test
```

Expected result: typecheck and tests pass.

Manual QA checklist:

- The **Add Codex Bot** button is enabled only when the server reports Codex is configured.
- If `CODEX_BOT_ENABLED` is missing or false, the button is disabled.
- If Codex auth is missing, the button is disabled.
- If a Codex call fails mid-game, the bot still moves using fallback logic.
- The bot never plays illegal cards or illegal targets because it can only choose from validated legal candidates.

## Troubleshooting

### The Add Codex Bot button is disabled

Check that you started the dev server with:

```bash
CODEX_BOT_ENABLED=true
```

Then check that Codex CLI auth exists:

```bash
ls ~/.codex/auth.json
```

If the auth file is elsewhere:

```bash
CODEX_HOME=/path/to/codex-home CODEX_BOT_ENABLED=true npm run dev
```

### Server says Codex Bot is not configured

Run:

```bash
codex login
```

Then restart the Node server with `CODEX_BOT_ENABLED=true`.

### Codex times out or fails during a turn

The server logs a warning beginning with:

```txt
[codex-bot]
```

The bot should automatically fall back to Smart Bot / Random Bot for that turn.

If this happens often, increase:

```bash
CODEX_BOT_TIMEOUT_MS=20000
```

### I want a different model

Set:

```bash
CODEX_BOT_MODEL=gpt-5.4-mini
```

You can use any model slug your Codex subscription exposes through the Codex backend. `gpt-5.4-mini` is the default because it is a reasonable latency/cost choice for a game bot.

## Security notes

- Do not commit `~/.codex/auth.json`.
- Do not copy Codex access tokens into frontend code.
- Run this only on a trusted server/user account.
- The current implementation does not send room chat to Codex, reducing prompt-injection risk.
- Public game logs and bot memory are labeled as game information, not instructions.

## Files to inspect if you want to customize behavior

- Bot prompt and fallback logic:
  - `apps/server/src/codexBotBrain.ts`
- Codex backend request shape:
  - `apps/server/src/codexClient.ts`
- Codex credential borrowing/refreshing:
  - `apps/server/src/codexAuth.ts`
- Server event wiring:
  - `apps/server/src/index.ts`
- UI button:
  - `apps/web/src/pages/RoomPage.tsx`
  - `apps/web/src/app/App.tsx`

## Future improvements

Possible next additions:

- Add a visible explanation feed entry when Codex chooses an action.
- Add difficulty/personality presets.
- Add a model selector in server config.
- Cache Codex model discovery from `/models?client_version=1.0.0`.
- Add per-account or per-room rate limiting if deployed publicly.
