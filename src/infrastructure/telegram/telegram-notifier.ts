import type { DraftNotifier } from "../../domain/types.js";

type TelegramResponse = { ok: boolean; description?: string };

export class TelegramNotifier implements DraftNotifier {
  constructor(private readonly token: string, private readonly chatId: string) {}

  async send(text: string): Promise<void> {
    if (text.length > 4096) throw new Error("Telegram messages must not exceed 4096 characters");
    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: this.chatId, text, disable_web_page_preview: false })
    });
    const body = await response.json().catch(() => null) as TelegramResponse | null;
    if (!response.ok || !body?.ok) throw new Error(`Telegram delivery failed (${response.status}): ${body?.description ?? "unknown error"}`);
  }
}
