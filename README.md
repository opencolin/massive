# GEO Tracker — Daily Brand Visibility Across AI Assistants

A small Node.js project that asks the same category question to ChatGPT, Gemini, Perplexity, and Copilot every day and tracks which brands each model surfaces, in what order, and how that drifts over time. Built on [Massive's Web Render AI](https://docs.joinmassive.com/web-render/ai), a single HTTP endpoint that proxies all four assistants.

## The idea

When someone asks an AI assistant "what are the best AI coding tools?" — different assistants surface different brands, and the answers shift week to week as models retrain and the web underneath them changes. For any company that wants to be one of those surfaced brands ("generative engine optimization" / GEO), the foundational question is: **which models mention me, where in the ranking, and how is that changing?**

Pulling that data is hard because it requires running the same prompt through four different assistants whose web UIs aren't designed to be queried programmatically. Massive's Web Render AI bundles all four behind one HTTP API — that's what makes daily cross-model tracking tractable. This project is a thin layer on top: a config-driven collector, a markdown diff report, and an append-only CSV.

## What it does

- **`track.js`** — fans every `(prompt × model)` pair across the API in parallel, extracts brand mentions from each response by first-character index (a robust ordering signal that works across prose, bullets, tables, and the assistant-specific HTML chrome), and writes one JSON line per pair to `data/YYYY-MM-DD.jsonl`.
- **`report.js`** — diffs the latest day against the prior day. Outputs `reports/YYYY-MM-DD.md` (per-model rankings with `+new` / `−dropped` / `↑↓N` markers, plus a cross-model consensus table) and appends `reports/share-of-voice.csv` for plotting.
- **`reprocess.js`** — re-runs extraction over saved `raw_response` data when you tweak aliases or extraction logic. No re-querying = no re-billing.
- **`config.json`** — single source of truth: prompts, brands, aliases. Adding a new category is a config edit, not a code change.
- **`web-render-test.js`** — the original one-shot CLI for ad-hoc queries. Still useful for exploration.

The data and reports are committed to the repo intentionally — for v1, the git history *is* the time series. Cheapest possible storage.

## Quick start

```bash
export MASSIVE_API_TOKEN="..."
node track.js          # writes data/YYYY-MM-DD.jsonl
node report.js         # writes reports/YYYY-MM-DD.md + appends share-of-voice.csv
```

To run daily via cron:

```cron
0 9 * * * cd /path/to/repo && MASSIVE_API_TOKEN=... node track.js && node report.js
```

## Files

| File | What it does |
|---|---|
| `lib.js` | Shared API client + extraction (`makeAiRequest`, `extractResponseText`, `extractBrands`, `stripHtml`). |
| `track.js` | Daily collector. Fans `(prompt × model)`, ranks brands, appends JSONL. |
| `report.js` | Diff generator. Markdown + CSV. |
| `reprocess.js` | Re-extracts brands from saved data. |
| `config.json` | Prompts, brands, aliases, models. |
| `web-render-test.js` | Original ad-hoc CLI. |
| `data/` | Append-only daily JSONL snapshots (committed). |
| `reports/` | Markdown reports + share-of-voice CSV (committed). |
| `PLAN.md` | Design doc. |

## CLI reference (web-render-test.js)

```bash
node web-render-test.js "What is the weather in Portland?"
node web-render-test.js --devices
node web-render-test.js "Best basketball shoes" --model perplexity
node web-render-test.js "Show me this page" --device "iPhone 14"
node web-render-test.js "Summarize this" --format raw
node web-render-test.js "Current stock prices" --expiration 0
```

| Option | Description |
|--------|-------------|
| `--model MODEL` | `chatgpt`, `gemini`, `perplexity`, `copilot` (default: chatgpt) |
| `--device DEVICE` | Emulate a device from `--devices` |
| `--format FORMAT` | `json`, `rendered`, `raw` (default: json) |
| `--expiration DAYS` | Cache TTL in days; `0` disables (default: 1) |
| `--devices` | List available devices |

---

## Notes on Massive's Web Render AI API (for the PM)

This section is feedback from building the daily tracker on top of the API. Documenting both what worked and what tripped me up — hopefully useful for the docs and DX roadmap.

### What's great

- **One endpoint, four assistants.** This is the killer feature. Without it, building this project means juggling four different vendor APIs, auth flows, rate limits, and undocumented response formats. The bundled cross-model access is genuinely hard to replicate elsewhere — it's the reason this project exists at all.
- **Auth is dead simple.** Bearer token in the `Authorization` header, one env var, done. No OAuth dance, no refresh tokens, no SDK install.
- **Caching with explicit TTL.** `expiration` is a clear knob — `0` to bypass, `N` for N-day TTL. For daily-cadence trackers like this one, `expiration=0` is exactly the right primitive.
- **503s are recoverable.** The API does throw 503s under load, but they're transient — a simple retry-with-backoff (`fetchWithRetry` in `lib.js`) handled them fine across 100% of the runs we did.

### Gotchas that cost me time

1. **The response shape isn't obvious from the docs page I read.** I expected `response` or `text` to hold the answer, since that's the convention with most AI APIs. The actual field is `completion`. The full top-level shape is:
   ```js
   { model, query, html, prompt, completion, sources, ads?, subqueries }
   ```
   I had to `console.log(Object.keys(payload))` after the first call to discover this. **Suggestion:** put a "Response shape" section in the docs with a concrete example. Even a one-line schema would have saved me ~15 minutes of inspection.

2. **`completion` is HTML, not text.** It's the rendered HTML of just the answer (sometimes assistant-specific chrome — e.g., Copilot wraps its answer in a `<div data-content="ai-message">…<h6>Copilot said</h6>…`). To get the actual answer text you have to strip tags + decode entities. **Suggestions:**
   - Add a `format=text` (or `completion_text`) option that returns plain text.
   - Or document clearly that `completion` is HTML and what's outside vs. inside the actual answer block.

3. **The `html` field is *huge*.** A single response can be 200KB–1.5MB depending on model (Gemini was the worst). For a daily collector saving one row per model, that meant ~2.7MB per day, ~1GB per year, just for one prompt. We ended up stripping `html` before persisting. **Suggestions:**
   - Add a `fields=` query param so callers can opt out of the rendered page when they only want `completion`. Saves you bandwidth too.
   - Or split into two endpoints: one for the answer payload, one for the full rendered page.

4. **Latency varies a lot per model.** First real run timings (single prompt, parallel calls):
   - chatgpt: 17s
   - gemini: 21s
   - perplexity: 25s
   - copilot: 43s

   Sequential fan-out across 4 models would be 100+ seconds; parallel via `Promise.allSettled` brought it to ~43s (bound by the slowest). **Suggestions:**
   - Document expected latency ranges so users know to fan out in parallel from the start.
   - Consider streaming `completion` for slow models — would massively improve perceived UX.

5. **Field-name inconsistency in the response.** `query` is the user's question, `prompt` is also in there (echo of the param), `completion` is the answer. Took a beat to figure out which is which. **Suggestion:** rename `query` → `request` or drop one of them.

6. **No documented way to know how many requests I have left.** Useful for daily cron jobs that should fail loudly if the budget is exhausted. **Suggestion:** include `X-RateLimit-Remaining` / `X-Quota-Remaining` headers in responses.

7. **Assistant-UI noise leaks into matching.** Copilot's answer-block markup contains the literal text "Copilot said" (an `aria-label` and an `<h6>` heading). After stripping HTML, that text remains and false-matched a "Copilot" alias I had on the GitHub Copilot brand. Not the API's fault per se, but a `format=text` option that strips the host's UI chrome would solve it. **Suggestion:** if a `text` format is added, normalize away the per-assistant labels (`"Copilot said"`, `"ChatGPT said"`, etc.) so consumers don't have to learn each assistant's quirks.

### Wishlist

- **A `fields=completion` (or similar) param** to drop the `html` blob.
- **A `format=text` option** that returns plain text from the assistant's answer block, with UI chrome stripped.
- **Streaming** for `completion`, especially for slow models like Copilot.
- **Rate-limit headers** so cron-driven consumers can detect budget issues without parsing 429 bodies.
- **A "ranked items" extraction helper** — even a simple "pull the items out of the top-N list" affordance would let consumers like this project skip the brand-extraction layer entirely. Probably out of scope for v1 of the API but a natural higher-level primitive.

### Bottom line

The cross-model bundling is real magic and made an otherwise-multi-week integration project a one-evening build. The two paper-cuts that cost the most time were both about response shape: undocumented field names, and HTML where I expected text. Both are docs/feature fixes, not architectural — easy wins.

---

## API reference

- Base URL: `https://render.joinmassive.com/ai`
- Devices: `GET /ai/devices`
- Query: `GET /ai?prompt=...&model=...&format=json&expiration=0`
- Auth: `Authorization: Bearer <MASSIVE_API_TOKEN>`

See the [full docs](https://docs.joinmassive.com/web-render/ai) for more.
