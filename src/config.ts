import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  SCHEDULE_CRON: z.string().default("0 9 * * *"),
  TIMEZONE: z.string().default("UTC"),
  DAILY_DRAFT_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  CRON_SECRET: z.string().min(24).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().default("openai/gpt-oss-20b"),
  TAVILY_API_KEY: z.string().min(1).optional(),
  TELEGRAM_X_BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/),
  TELEGRAM_X_CHAT_ID: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/)
});

export type Config = z.infer<typeof schema>;
export const config = schema.superRefine((value, context) => {
  if (!value.CRON_SECRET) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CRON_SECRET is required to protect manual job triggers" });
  }
}).parse(process.env);
