import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const REFRESH_URL = "https://auth.openai.com/oauth/token";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const REFRESH_SKEW_SECONDS = 30;

export class CodexAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexAuthError";
  }
}

type CodexAuthFile = {
  auth_mode?: string;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    account_id?: string;
  };
  last_refresh?: string;
  [key: string]: unknown;
};

type RefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
};

export type BorrowedCodexCredentials = {
  accessToken: string;
  accountId?: string;
};

function getAuthPath(): string {
  const codexHome = process.env.CODEX_HOME || path.join(homedir(), ".codex");
  return path.join(codexHome, "auth.json");
}

function jwtExpirySeconds(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const decoded = JSON.parse(Buffer.from(padded, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

async function readAuthFile(authPath: string): Promise<CodexAuthFile> {
  let raw: string;
  try {
    raw = await fs.readFile(authPath, "utf8");
  } catch (error) {
    throw new CodexAuthError(`Codex auth file not found at ${authPath}. Run \`codex login\` first.`);
  }

  const data = JSON.parse(raw) as CodexAuthFile;
  if (data.auth_mode !== "chatgpt") {
    throw new CodexAuthError(`Expected Codex auth_mode 'chatgpt', got '${data.auth_mode ?? "missing"}'. Run \`codex login\` with a ChatGPT account.`);
  }
  return data;
}

async function writeAuthFile(authPath: string, data: CodexAuthFile): Promise<void> {
  const tempPath = `${authPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tempPath, authPath);
  await fs.chmod(authPath, 0o600);
}

async function refreshTokens(refreshToken: string): Promise<RefreshResponse> {
  const response = await fetch(REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as RefreshResponse) : {};
  if (!response.ok) {
    const errorCode = parsed.error;
    if (errorCode === "refresh_token_expired" || errorCode === "refresh_token_reused" || errorCode === "refresh_token_invalidated") {
      throw new CodexAuthError(`Codex refresh token is no longer valid (${errorCode}). Run \`codex login\` again.`);
    }
    throw new CodexAuthError(`Codex token refresh failed (HTTP ${response.status}): ${text}`);
  }

  return parsed;
}

export async function borrowCodexCredentials(): Promise<BorrowedCodexCredentials> {
  const authPath = getAuthPath();
  const data = await readAuthFile(authPath);
  const tokens = data.tokens;

  if (!tokens?.access_token) {
    throw new CodexAuthError("No ChatGPT access token found in Codex auth.json. Run `codex login` first.");
  }

  const exp = jwtExpirySeconds(tokens.access_token);
  if (exp === null || Date.now() / 1000 < exp - REFRESH_SKEW_SECONDS) {
    return { accessToken: tokens.access_token, accountId: tokens.account_id };
  }

  if (!tokens.refresh_token) {
    throw new CodexAuthError("No Codex refresh token available. Run `codex login` again.");
  }

  const refreshed = await refreshTokens(tokens.refresh_token);
  if (refreshed.access_token) tokens.access_token = refreshed.access_token;
  if (refreshed.id_token) tokens.id_token = refreshed.id_token;
  if (refreshed.refresh_token) tokens.refresh_token = refreshed.refresh_token;

  data.tokens = tokens;
  data.last_refresh = new Date().toISOString();
  await writeAuthFile(authPath, data);

  return { accessToken: tokens.access_token, accountId: tokens.account_id };
}
