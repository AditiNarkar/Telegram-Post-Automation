import cron, { type ScheduledTask } from "node-cron";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { TelegramNotifier } from "./infrastructure/telegram/telegram-notifier.js";
import { ContentWriter } from "./services/content-writer.js";
import { DailyJob } from "./services/daily-job.js";

const notifier = new TelegramNotifier(config.TELEGRAM_X_BOT_TOKEN, config.TELEGRAM_X_CHAT_ID);
const job = new DailyJob(new ContentWriter(config), notifier);
let scheduledTask: ScheduledTask;
const app = buildApp(config, job, notifier, () => scheduledTask.getNextRun());

scheduledTask = cron.schedule(
  config.SCHEDULE_CRON,
  () => {
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: config.TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    void job.run(true, localDate).catch((error) => app.log.error(error, "Daily draft dispatch failed"));
  },
  { timezone: config.TIMEZONE }
);
await app.listen({ port: config.PORT, host: "0.0.0.0" });
