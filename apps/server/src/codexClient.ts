import { borrowCodexCredentials } from "./codexAuth.js";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_TIMEOUT_MS = 12_000;

export type CodexJsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: readonly string[];
  additionalProperties?: boolean;
};

export type CodexResponseOptions = {
  instructions: string;
  input: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  schema: CodexJsonSchema;
  schemaName: string;
  model?: string;
  timeoutMs?: number;
};

type CodexOutputContent = {
  type?: string;
  text?: string;
};

type CodexOutputItem = {
  type?: string;
  content?: CodexOutputContent[];
};

type CodexResponseBody = {
  output_text?: string;
  output?: CodexOutputItem[];
};

export function getConfiguredCodexBotModel(): string {
  return process.env.CODEX_BOT_MODEL || DEFAULT_MODEL;
}

function getConfiguredTimeoutMs(): number {
  const value = Number(process.env.CODEX_BOT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function extractText(body: CodexResponseBody): string {
  if (typeof body.output_text === "string") return body.output_text;

  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }

  return "";
}

export function isCodexBotEnabled(): boolean {
  return process.env.CODEX_BOT_ENABLED === "true";
}

export async function requestCodexJson(options: CodexResponseOptions): Promise<unknown> {
  if (!isCodexBotEnabled()) {
    throw new Error("Codex bot is disabled. Set CODEX_BOT_ENABLED=true to enable it.");
  }

  const { accessToken, accountId } = await borrowCodexCredentials();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? getConfiguredTimeoutMs());

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    if (accountId) headers["ChatGPT-Account-ID"] = accountId;

    const response = await fetch(`${CODEX_BASE_URL}/responses`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model ?? getConfiguredCodexBotModel(),
        input: options.input,
        instructions: options.instructions,
        store: false,
        stream: false,
        text: {
          format: {
            type: "json_schema",
            name: options.schemaName,
            schema: options.schema,
          },
        },
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Codex request failed (HTTP ${response.status}): ${raw}`);
    }

    const body = raw ? (JSON.parse(raw) as CodexResponseBody) : {};
    const text = extractText(body).trim();
    if (!text) throw new Error("Codex response did not include output text.");
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

export type CodexBotStatus = {
  enabled: boolean;
  configured: boolean;
  model: string;
  reason?: string;
};

export async function getCodexBotStatus(): Promise<CodexBotStatus> {
  const model = getConfiguredCodexBotModel();
  if (!isCodexBotEnabled()) {
    return { enabled: false, configured: false, model, reason: "disabled" };
  }

  try {
    await borrowCodexCredentials();
    return { enabled: true, configured: true, model };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { enabled: true, configured: false, model, reason };
  }
}
