import { borrowCodexCredentials } from "./codexAuth.js";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_TIMEOUT_MS = 20_000;

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
  debugLabel?: string;
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

function extractMessageTextFromItem(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const content = (item as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown; value?: unknown }).text ?? (part as { text?: unknown; value?: unknown }).value;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

function extractTextFromStream(raw: string): string {
  let outputText = "";
  let completedBody: CodexResponseBody | null = null;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;

    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;

    try {
      const event = JSON.parse(data) as {
        type?: string;
        delta?: string;
        text?: string;
        item?: unknown;
        response?: CodexResponseBody;
      };

      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        outputText += event.delta;
      } else if (event.type === "response.output_text.done" && typeof event.text === "string" && !outputText.trim()) {
        outputText = event.text;
      } else if (event.type === "response.output_item.done" && !outputText.trim()) {
        outputText = extractMessageTextFromItem(event.item);
      } else if (event.type === "response.completed" && event.response) {
        completedBody = event.response;
      }
    } catch {
      // Ignore malformed SSE keepalive/comment lines.
    }
  }

  if (outputText.trim()) return outputText;
  return completedBody ? extractText(completedBody) : "";
}

function parsePossiblyWrappedJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]) as unknown;
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as unknown;
    }

    const snippet = text.slice(0, 300).replace(/\s+/g, " ");
    throw new Error(`Codex response was not valid JSON: ${snippet}`);
  }
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

    const requestBody = JSON.stringify({
      model: options.model ?? getConfiguredCodexBotModel(),
      input: options.input,
      instructions: options.instructions,
      store: false,
      stream: true,
      text: {
        format: {
          type: "json_schema",
          name: options.schemaName,
          schema: options.schema,
        },
      },
    });
    const startedAt = Date.now();
    const response = await fetch(`${CODEX_BASE_URL}/responses`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: requestBody,
    });

    const raw = await response.text();
    const elapsedMs = Date.now() - startedAt;
    if (!response.ok) {
      throw new Error(`Codex request failed label=${options.debugLabel ?? "unknown"} status=${response.status} elapsedMs=${elapsedMs} requestBytes=${requestBody.length} body=${raw.slice(0, 1000)}`);
    }

    const text = extractTextFromStream(raw).trim();
    if (!text) {
      throw new Error(`Codex response did not include output text label=${options.debugLabel ?? "unknown"} elapsedMs=${elapsedMs} requestBytes=${requestBody.length} rawPrefix=${raw.slice(0, 1000)}`);
    }
    try {
      return parsePossiblyWrappedJson(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Codex JSON parse failed label=${options.debugLabel ?? "unknown"} elapsedMs=${elapsedMs} requestBytes=${requestBody.length}: ${message}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Codex request timed out label=${options.debugLabel ?? "unknown"} timeoutMs=${options.timeoutMs ?? getConfiguredTimeoutMs()}`);
    }
    throw error;
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
