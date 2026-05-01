# Massive Web Render AI API Test

Test script for the Massive Web Render AI API.

## Setup

1. Get your API token from [Massive](https://docs.joinmassive.com/)
2. Set the environment variable:
   ```bash
   export MASSIVE_API_TOKEN="your_api_token_here"
   ```

## Usage

### Basic query (default: ChatGPT model)
```bash
node web-render-test.js "What is the weather in Portland?"
```

### List available devices
```bash
node web-render-test.js --devices
```

### Use a specific model
```bash
node web-render-test.js "Best basketball shoes" --model perplexity
```

### Emulate a mobile device
```bash
node web-render-test.js "Show me this page" --device "iPhone 14"
```

### Get raw HTML response
```bash
node web-render-test.js "Summarize this" --format raw
```

### Disable caching (cachebust)
```bash
node web-render-test.js "Current stock prices" --expiration 0
```

## Options

| Option | Description |
|--------|-------------|
| `--model MODEL` | AI model: `chatgpt`, `gemini`, `perplexity`, `copilot` (default: chatgpt) |
| `--device DEVICE` | Emulate a device from the devices list |
| `--format FORMAT` | Response format: `json`, `rendered`, `raw` (default: json) |
| `--expiration DAYS` | Cache expiration (0 to disable, default: 1) |
| `--devices` | List available devices |

## API Documentation

- Base URL: `https://render.joinmassive.com/ai`
- Devices endpoint: `GET /ai/devices`
- Query endpoint: `GET /ai?prompt=...&model=...`

See the [full docs](https://docs.joinmassive.com/web-render/ai) for more details.

## Daily tracker

Track which brands each model surfaces for a category prompt, every day, across ChatGPT, Gemini, Perplexity, and Copilot. See [PLAN.md](./PLAN.md) for the design rationale.

### Configure
Edit `config.json` to set the prompts and brands you want tracked. One prompt + N brands = one daily snapshot per model.

### Collect
```bash
MASSIVE_API_TOKEN=... node track.js
```
Fans every `(prompt × model)` pair through the API with caching disabled and writes one JSON line per pair to `data/YYYY-MM-DD.jsonl`. Failures are recorded as rows with an `error` field so the day's record is still complete.

### Report
```bash
node report.js
```
Reads the latest `data/*.jsonl` (and the prior one if present) and writes:
- `reports/YYYY-MM-DD.md` — per-model ranked brand list with `+new` / `−dropped` / `↑↓N` markers vs. the prior day, plus a cross-model consensus table.
- `reports/share-of-voice.csv` — append-only `(date, prompt_id, model, brand, rank, first_index)` rows for plotting.

### Schedule
One-line cron example (runs daily at 9:00):
```cron
0 9 * * * cd /path/to/repo && MASSIVE_API_TOKEN=... node track.js && node report.js
```
