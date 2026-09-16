import type { DraftNotifier, Topic } from "../domain/types.js";
import { fetchLatestTopics } from "../infrastructure/news/rss-news-source.js";
import { ContentWriter } from "./content-writer.js";

export class DailyJob {
  private running = false;
  private readonly deliveredUrls = new Set<string>();
  private lastAutomaticRunDate?: string;

  constructor(private readonly writer: ContentWriter, private readonly notifier: DraftNotifier) {}

  async run(automatic = false, localDate?: string): Promise<{ outcome: "sent" | "failed" | "no-topic" | "already-running" | "already-sent-today"; topic?: string }> {
    if (automatic && localDate && this.lastAutomaticRunDate === localDate) return { outcome: "already-sent-today" };
    if (this.running) return { outcome: "already-running" };
    this.running = true;
    try {
      const topic = await this.findTopic();
      if (!topic) return { outcome: "no-topic" };
      const drafts = await this.writer.write(topic);
      await this.notifier.send(this.format("X DRAFT", drafts.x, topic));
      await this.notifier.send(this.format("LINKEDIN DRAFT", drafts.linkedin, topic));
      this.deliveredUrls.add(topic.url);
      if (automatic && localDate) this.lastAutomaticRunDate = localDate;
      return { outcome: "sent", topic: topic.title };
    } catch (error) {
      try {
        await this.notifier.send(this.formatFailure(error));
      } catch {
        // The original error remains visible in the service logs when Telegram itself is unreachable.
      }
      return { outcome: "failed" };
    } finally {
      this.running = false;
    }
  }

  private async findTopic(): Promise<Topic | null> {
    const topics = await fetchLatestTopics();
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
    const eligible = topics.filter((topic) =>
      (!topic.publishedAt || topic.publishedAt.valueOf() >= cutoff) && !this.deliveredUrls.has(topic.url)
    );
    if (!eligible.length) return null;

    // Do not make every manual request use the newest feed item. Random selection
    // provides variety even after a Render restart, when in-memory history is lost.
    const recent = eligible.slice(0, Math.min(20, eligible.length));
    return recent[Math.floor(Math.random() * recent.length)] ?? null;
  }

  private format(label: string, draft: string, topic: Topic): string {
    return `${label}\n\n${draft}\n\nSource: ${topic.source}`;
  }

  private formatFailure(error: unknown): string {
    const message = error instanceof Error ? error.message : "Unknown generation error";
    return `DRAFT REQUEST FAILED\n\n${message.replace(/\s+/g, " ").slice(0, 1_500)}\n\nNo fallback draft was sent. Check the AI provider, account limits, API key, and source connectivity.`;
  }
}
