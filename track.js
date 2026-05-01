#!/usr/bin/env node
/**
 * Daily brand-visibility tracker.
 *
 * Reads config.json, fans every (prompt × model) pair across Massive's Web
 * Render AI endpoint with caching disabled, extracts brand mentions from each
 * response, and appends one JSON line per (prompt, model) to data/YYYY-MM-DD.jsonl.
 *
 * Usage:
 *   MASSIVE_API_TOKEN=your_token node track.js
 */

const fs = require("fs/promises");
const path = require("path");
const { getApiToken, makeAiRequest } = require("./lib.js");

const CONFIG_PATH = path.join(__dirname, "config.json");
const DATA_DIR = path.join(__dirname, "data");

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function extractResponseText(payload) {
  if (typeof payload === "string") return payload;
  if (payload == null) return "";
  for (const key of ["response", "text", "content", "answer", "result"]) {
    if (typeof payload[key] === "string") return payload[key];
  }
  return JSON.stringify(payload);
}

function findFirstIndex(haystack, needle) {
  if (!needle) return -1;
  return haystack.toLowerCase().indexOf(needle.toLowerCase());
}

function extractBrands(text, brands) {
  const matched = [];
  for (const brand of brands) {
    const candidates = [brand.name, ...(brand.aliases || [])];
    let best = -1;
    for (const c of candidates) {
      const idx = findFirstIndex(text, c);
      if (idx >= 0 && (best === -1 || idx < best)) best = idx;
    }
    if (best >= 0) matched.push({ name: brand.name, first_index: best });
  }
  matched.sort((a, b) => a.first_index - b.first_index);
  return matched.map((b, i) => ({ name: b.name, rank: i + 1, first_index: b.first_index }));
}

async function collectOne(token, date, prompt, model, brands) {
  try {
    const raw = await makeAiRequest(token, {
      prompt: prompt.text,
      model,
      format: "json",
      expiration: "0",
    });
    const responseText = extractResponseText(raw);
    const matched = extractBrands(responseText, brands);
    return {
      date,
      prompt_id: prompt.id,
      model,
      brands: matched,
      response_text: responseText,
      raw_response: raw,
    };
  } catch (err) {
    return {
      date,
      prompt_id: prompt.id,
      model,
      brands: [],
      error: err.message,
    };
  }
}

async function main() {
  const token = getApiToken();
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const date = todayUtc();

  await fs.mkdir(DATA_DIR, { recursive: true });
  const outPath = path.join(DATA_DIR, `${date}.jsonl`);

  const jobs = [];
  for (const prompt of config.prompts) {
    for (const model of config.models) {
      jobs.push(collectOne(token, date, prompt, model, config.brands));
    }
  }

  console.log(`\nRunning ${jobs.length} (prompt × model) jobs in parallel...`);
  const results = await Promise.allSettled(jobs);

  const lines = [];
  let ok = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      lines.push(JSON.stringify(r.value));
      if (r.value.error) failed++; else ok++;
    } else {
      lines.push(JSON.stringify({ date, error: r.reason?.message || String(r.reason), brands: [] }));
      failed++;
    }
  }

  await fs.writeFile(outPath, lines.join("\n") + "\n");
  console.log(`\nWrote ${lines.length} rows to ${path.relative(process.cwd(), outPath)} (${ok} ok, ${failed} failed)`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
