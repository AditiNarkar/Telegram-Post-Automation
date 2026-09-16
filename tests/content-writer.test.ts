import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentWriter } from "../src/services/content-writer.js";
import type { Config } from "../src/config.js";

const config = {
  NODE_ENV: "test",
  PORT: 3000,
  SCHEDULE_CRON: "0 9 * * *",
  TIMEZONE: "UTC",
  OPENAI_MODEL: "gpt-4.1-mini",
  GROQ_MODEL: "openai/gpt-oss-20b",
  TELEGRAM_X_BOT_TOKEN: "123456:test-token",
  TELEGRAM_X_CHAT_ID: "1",
  TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret"
} as Config;

describe("ContentWriter configuration", () => {
  it("fails clearly when no provider is configured", async () => {
    await expect(new ContentWriter(config).write({ url: "https://example.test/a", title: "Test", summary: null, source: "Test", publishedAt: null }))
      .rejects.toThrow("No AI provider is configured");
  });

  it("retries Groq in JSON-object mode when strict generation fails", async () => {
    const writer = new ContentWriter({ ...config, GROQ_API_KEY: "test-key" } as Config);
    const create = vi.fn()
      .mockRejectedValueOnce(new Error("400 Failed to validate JSON"))
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ x: "Tiny robots, enormous paperwork. https://example.test/a", linkedin: "A".repeat(800) }) } }] });
    (writer as any).groqClient = { chat: { completions: { create } } };

    await expect(writer.write({ url: "https://example.test/a", title: "Test", summary: null, source: "Test", publishedAt: null }))
      .resolves.toEqual({ x: "Tiny robots, enormous paperwork. https://example.test/a", linkedin: "A".repeat(800) });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].response_format.type).toBe("json_schema");
    expect(create.mock.calls[1][0].response_format).toEqual({ type: "json_object" });
  });

  it("normalizes Tavily labels before validating its draft", async () => {
    const writer = new ContentWriter({ ...config, TAVILY_API_KEY: "test-key" } as Config);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const query = JSON.parse(String(init?.body)).query as string;
      const answer = query.includes("LinkedIn") ? `LinkedIn: ${"A".repeat(800)}` : "X: Tiny robots, enormous paperwork.";
      return new Response(JSON.stringify({ answer }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    await expect(writer.write({ url: "https://example.test/a", title: "Test", summary: null, source: "Test", publishedAt: null }))
      .resolves.toEqual({ x: "Tiny robots, enormous paperwork. https://example.test/a", linkedin: "A".repeat(800) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  afterEach(() => vi.restoreAllMocks());
});
