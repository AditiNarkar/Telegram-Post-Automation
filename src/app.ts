import Fastify from "fastify";
import os from "node:os";
import type { Config } from "./config.js";
import type { DraftNotifier } from "./domain/types.js";
import type { DailyJob } from "./services/daily-job.js";

type TelegramUpdate = {
  message?: { text?: string; chat?: { id?: number | string } };
};

const isCommand = (command: string, text?: string) => Boolean(text?.match(new RegExp(`^/${command}(?:@\\w+)?(?:\\s|$)`)));

export function buildApp(config: Config, job: DailyJob, notifier: DraftNotifier, nextRun: () => Date | null) {
  const app = Fastify({ logger: { level: config.NODE_ENV === "production" ? "info" : "debug" } });
  const requireCronSecret = async (request: { headers: Record<string, string | string[] | undefined> }, reply: { code: (code: number) => { send: (body: unknown) => void } }) => {
    if (config.CRON_SECRET && request.headers["x-api-key"] === config.CRON_SECRET) return;
    return reply.code(401).send({ error: "Unauthorized" });
  };

  app.get("/health", async () => ({ status: "ok" }));
  app.post("/jobs/daily", { preHandler: requireCronSecret }, async (_request, reply) => {
    const outcome = await job.run();
    return reply.code(outcome.outcome === "already-running" ? 409 : 200).send(outcome);
  });
  app.post("/jobs/scheduled", { preHandler: requireCronSecret }, async (_request, reply) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: config.TIMEZONE, hour: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
    const value = (type: string) => parts.find((part) => part.type === type)?.value;
    const hour = Number(value("hour"));
    const localDate = `${value("year")}-${value("month")}-${value("day")}`;
    if (hour !== config.DAILY_DRAFT_HOUR) return reply.send({ outcome: "outside-scheduled-hour", localDate, hour });
    const outcome = await job.run(true, localDate);
    return reply.code(outcome.outcome === "already-running" ? 409 : 200).send(outcome);
  });

  const receiveTelegramUpdate = async (expectedChatId: string, request: { headers: Record<string, string | string[] | undefined>; body: TelegramUpdate }, reply: { code: (code: number) => { send: (body: unknown) => void } }) => {
    if (request.headers["x-telegram-bot-api-secret-token"] !== config.TELEGRAM_WEBHOOK_SECRET) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const message = request.body?.message;
    if (String(message?.chat?.id) !== expectedChatId) return { ok: true };

    if (isCommand("start", message?.text)) {
      void job.run().catch((error) => app.log.error(error, "Telegram-triggered draft dispatch failed"));
      return { ok: true, triggered: true };
    }
    if (isCommand("time", message?.text)) {
      const scheduledAt = nextRun();
      const text = scheduledAt
        ? `Next scheduled drafts: ${new Intl.DateTimeFormat("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: config.TIMEZONE, timeZoneName: "short" }).format(scheduledAt)}`
        : "There is no upcoming scheduled draft run.";
      void notifier.send(text).catch((error) => app.log.error(error, "Telegram schedule response failed"));
      return { ok: true, command: "time" };
    }
    if (isCommand("active", message?.text)) {
      const scheduledAt = nextRun();
      const nextDraft = scheduledAt
        ? new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: config.TIMEZONE, timeZoneName: "short" }).format(scheduledAt)
        : "unavailable";
      const uptimeMinutes = Math.floor(process.uptime() / 60);
      const text = `Service status: active\nListening: yes\nHost: ${os.hostname()}\nProcess ID: ${process.pid}\nUptime: ${uptimeMinutes} minute${uptimeMinutes === 1 ? "" : "s"}\nNext scheduled drafts: ${nextDraft}`;
      void notifier.send(text).catch((error) => app.log.error(error, "Telegram active-status response failed"));
      return { ok: true, command: "active" };
    }
    return { ok: true };
  };

  app.post<{ Body: TelegramUpdate }>("/webhooks/telegram/x", async (request, reply) => receiveTelegramUpdate(config.TELEGRAM_X_CHAT_ID, request, reply));
  return app;
}
