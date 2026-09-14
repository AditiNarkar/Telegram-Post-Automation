export type Topic = {
  url: string;
  title: string;
  summary: string | null;
  source: string;
  publishedAt: Date | null;
};

export type Drafts = { x: string; linkedin: string };
export interface DraftNotifier {
  send(text: string): Promise<void>;
}
