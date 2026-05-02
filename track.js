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
const { getApiToken, makeAiRequest, extractResponseText, extractBrands } = require("./lib.js");

const CONFIG_PATH = path.join(__dirname, "config.json");
const DATA_DIR = path.join(__dirname, "data");

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
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
    const { html, ...rawSlim } = raw || {};
    return {
      date,
      prompt_id: prompt.id,
      model,
      brands: matched,
      response_text: responseText,
      raw_response: rawSlim,
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
