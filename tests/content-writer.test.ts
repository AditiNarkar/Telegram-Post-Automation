import { describe, expect, it } from "vitest";
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

describe("ContentWriter fallback", () => {
  it("makes an X post no longer than the platform limit", async () => {
    const drafts = await new ContentWriter(config).write({ url: "https://example.test/a", title: "A".repeat(600), summary: null, source: "Test", publishedAt: null });
    expect(drafts.x.length).toBeLessThanOrEqual(280);
    expect(drafts.x).toContain("https://example.test/a");
  });
});
