import type { DraftNotifier, Topic } from "../domain/types.js";
import { fetchLatestTopics } from "../infrastructure/news/rss-news-source.js";
import { ContentWriter } from "./content-writer.js";

export class DailyJob {
  private running = false;
  private readonly deliveredUrls = new Set<string>();

  constructor(private readonly writer: ContentWriter, private readonly notifier: DraftNotifier) {}

  async run(): Promise<{ outcome: "sent" | "no-topic" | "already-running"; topic?: string }> {
    if (this.running) return { outcome: "already-running" };
    this.running = true;
    try {
      const topic = await this.findTopic();
      if (!topic) return { outcome: "no-topic" };
      const drafts = await this.writer.write(topic);
      await this.notifier.send(this.format("X DRAFT", drafts.x, topic));
      await this.notifier.send(this.format("LINKEDIN DRAFT", drafts.linkedin, topic));
      this.deliveredUrls.add(topic.url);
      return { outcome: "sent", topic: topic.title };
    } finally {
      this.running = false;
    }
  }

  private async findTopic(): Promise<Topic | null> {
    const topics = await fetchLatestTopics();
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
    return topics.find((topic) =>
      (!topic.publishedAt || topic.publishedAt.valueOf() >= cutoff) && !this.deliveredUrls.has(topic.url)
    ) ?? null;
  }

  private format(label: string, draft: string, topic: Topic): string {
    return `${label}\n\n${draft}\n\n—\nSource: ${topic.source}`;
  }
}
