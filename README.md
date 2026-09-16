# AI Social Draft Dispatcher

This service fetches recent AI announcements, writes two distinct drafts, and sends them as separate messages through one Telegram bot. It has **no database** and it never posts to X or LinkedIn.

```text
AI RSS feeds → topic rotation → AI writer → X Telegram bot
                                      ├────→ X draft message
                                      └────→ LinkedIn draft message
```

The X draft is short, playful, and gently sarcastic about the technology. The LinkedIn draft is natural, professional, and human. Both link to the original source. You review, edit, and publish them manually.

OpenAI is the primary draft provider. If it fails, including due to an API limit, rate limit, or invalid key, the service tries Groq when `GROQ_API_KEY` is configured. The Groq path uses its Chat Completions structured-output endpoint with a strict JSON schema. If Groq also fails, Tavily Search is tried when `TAVILY_API_KEY` is configured. Tavily generates each draft from current search results in two separate requests. If every configured provider fails, Telegram receives a `DRAFT REQUEST FAILED` message containing the provider failure details. No template draft is ever generated. [Groq documentation](https://console.groq.com/docs/openai) and [Tavily Search documentation](https://docs.tavily.com/documentation/api-reference/endpoint/search)

## Setup

1. In Telegram, open `@BotFather` and create one bot for drafts. Keep its token private.
2. Open a private chat with the bot, press **Start**, and send it a message.
3. Find its chat ID by opening `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` in your browser after sending the bot a message. Copy `message.chat.id`.
4. Copy the template and fill in all values: `cp .env.example .env`.
   Add `GROQ_API_KEY` and `TAVILY_API_KEY` to enable both fallback providers.
5. Install and run: `npm install && npm run dev`.

Existing `TELEGRAM_LINKEDIN_BOT_TOKEN` and `TELEGRAM_LINKEDIN_CHAT_ID` environment values may remain in your deployment; they are now ignored.

The service generates drafts once a day at `SCHEDULE_CRON` in `TIMEZONE`. During a running deployment, each successfully delivered source URL is remembered and the next request selects another unseen article from the past 30 days. It also chooses randomly from the latest eligible set, so a Render restart does not force the same newest item again. Since there is no database, exact long term history is intentionally not retained.

## Daily automatic trigger on Render

Render web services may sleep on some plans, so an in process cron alone is not dependable. The included [GitHub Actions scheduler](/Users/bigfatrat/Desktop/Projects/PostAutomation/.github/workflows/daily-drafts.yml) calls the protected Render endpoint at 9:05 AM Melbourne time every day, including across daylight saving changes. It runs at both possible UTC hours but the app sends only during `DAILY_DRAFT_HOUR`.

Add these GitHub Actions secrets to the repository:

- `CRON_SECRET`: the same secret configured in Render

Keep `SCHEDULE_CRON="0 9 * * *"`, `TIMEZONE="Australia/Melbourne"`, and `DAILY_DRAFT_HOUR=9` in Render. The local cron remains a backup if the service is awake; the scheduler prevents it from sending twice in one running instance.

## Trigger drafts with `/start`

Sending `/start` to the X bot triggers a draft run and returns both drafts as separate messages in the same chat. This requires a public HTTPS deployment because Telegram delivers commands through webhooks.

Send `/time` to the same bot to receive the next scheduled draft time in your configured `TIMEZONE`.

Send `/active` to confirm that the instance receiving the command is online and listening. The reply includes its hostname, process ID, uptime, and next scheduled draft time.

1. Deploy the service behind HTTPS at a public domain, for example `https://drafts.example.com`.
2. Set a long random `TELEGRAM_WEBHOOK_SECRET` in `.env` (letters, numbers, `_`, and `-` only).
3. Register the X-bot webhook, replacing the placeholders locally—never paste tokens into a terminal recording or commit them:

```sh
curl -X POST "https://api.telegram.org/bot$TELEGRAM_X_BOT_TOKEN/setWebhook" \
  -d "url=https://drafts.example.com/webhooks/telegram/x" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message"]'

```

Only `/start` messages from the configured chat IDs trigger a job. The webhook secret is checked before the command is processed, and a concurrent run is ignored. Telegram webhooks require HTTPS and provide the configured secret in the `X-Telegram-Bot-Api-Secret-Token` header. [Telegram Bot API](https://core.telegram.org/bots/api)

## Manual trigger

Use the protected endpoint to test immediately:

```sh
curl -X POST http://localhost:3000/jobs/daily \
  -H "x-api-key: YOUR_CRON_SECRET"
```

`GET /health` returns the process health status. Do not expose the manual trigger publicly without a strong `CRON_SECRET` and HTTPS.

## Run with Docker

```sh
docker compose up --build
```

## Deploy on every `main` push

The included [GitHub Actions workflow](/Users/bigfatrat/Desktop/Projects/PostAutomation/.github/workflows/deploy.yml) deploys to one Docker host after every push to `main` (and can also be run manually). It serializes deployments, pulls the exact `origin/main` revision on the server, then runs `docker compose up --build --detach`.

<!-- One-time server setup:

1. Install Docker Engine, Docker Compose, and Git. Create a dedicated deployment user that can run `docker compose` without `sudo`.
2. Clone this repository into a fixed directory on that host, create its production `.env` there, and run `docker compose up --build --detach` once.
3. Create an SSH key pair dedicated to this deployment. Add the public key to the deployment user's `~/.ssh/authorized_keys`.
4. In GitHub, create a `production` environment and add these environment secrets:
   - `DEPLOY_HOST` — server hostname or IP
   - `DEPLOY_USER` — dedicated deployment user
   - `DEPLOY_PATH` — absolute path to the server checkout
   - `DEPLOY_SSH_KEY` — private deployment key
   - `DEPLOY_KNOWN_HOSTS` — verified `known_hosts` entry for the server; do not rely on an unverified `ssh-keyscan` result -->

The deployment workflow does not copy `.env`; that file stays only on the server. Use a protected `production` environment to require approval before deployment if desired. GitHub supports branch-filtered push triggers, deployment environments, environment secrets, and concurrency controls. [GitHub Actions documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

## Safety notes

- Telegram bot tokens and your OpenAI key are secrets. Never commit `.env` or send a token in chat.
- The app uses Telegram's HTTPS `sendMessage` endpoint, which accepts a bot token and target chat ID. See the [Telegram Bot API](https://core.telegram.org/bots/api).
- Source summaries are treated as untrusted input and the writer is instructed not to follow embedded instructions or invent claims.
- Since no state is retained, human review is the final quality gate before you publish.
