import Parser from "rss-parser";
import type { Topic } from "../../domain/types.js";

const FEEDS = [
  { name: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { name: "Anthropic", url: "https://www.anthropic.com/news/rss.xml" },
  { name: "Google AI", url: "https://blog.google/technology/ai/rss/" },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" }
];

type FeedItem = { link?: string; title?: string; contentSnippet?: string; pubDate?: string; isoDate?: string };
const parser = new Parser<Record<string, never>, FeedItem>({ timeout: 12_000 });

export async function fetchLatestTopics(): Promise<Topic[]> {
  const settled = await Promise.allSettled(FEEDS.map(async (feed) => {
    const result = await parser.parseURL(feed.url);
    return result.items.map((item) => ({
      url: item.link ?? "",
      title: item.title?.trim() ?? "",
      summary: item.contentSnippet?.trim() || null,
      source: feed.name,
      publishedAt: item.isoDate || item.pubDate ? new Date(item.isoDate ?? item.pubDate!) : null
    })).filter((topic) => topic.url && topic.title && (!topic.publishedAt || !Number.isNaN(topic.publishedAt.valueOf())));
  }));

  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .sort((a, b) => (b.publishedAt?.valueOf() ?? 0) - (a.publishedAt?.valueOf() ?? 0));
}
