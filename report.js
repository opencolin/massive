#!/usr/bin/env node
/**
 * Generate a markdown diff report comparing the latest data/*.jsonl against
 * the prior day, plus append a row per (date, prompt, model, brand) to
 * reports/share-of-voice.csv for downstream plotting.
 *
 * Usage:
 *   node report.js
 */

const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const REPORTS_DIR = path.join(__dirname, "reports");
const CSV_PATH = path.join(REPORTS_DIR, "share-of-voice.csv");
const CSV_HEADER = "date,prompt_id,model,brand,rank,first_index\n";

async function listJsonlFiles() {
  const entries = await fs.readdir(DATA_DIR);
  return entries
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort();
}

async function readJsonl(file) {
  const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function groupBy(rows, keyFn) {
  const out = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
}

function findRow(rows, prompt_id, model) {
  return rows.find((r) => r.prompt_id === prompt_id && r.model === model);
}

function rankMap(brands) {
  const m = new Map();
  for (const b of brands || []) m.set(b.name, b.rank);
  return m;
}

function modelSection(today, prior) {
  if (today.error) return `_error: ${today.error}_`;
  if (!today.brands || today.brands.length === 0) return "_no brands matched_";

  const priorRanks = prior ? rankMap(prior.brands) : null;
  const lines = [];
  for (const b of today.brands) {
    let marker = "";
    if (priorRanks) {
      if (!priorRanks.has(b.name)) {
        marker = " **+new**";
      } else {
        const delta = priorRanks.get(b.name) - b.rank;
        if (delta > 0) marker = ` ↑${delta}`;
        else if (delta < 0) marker = ` ↓${-delta}`;
      }
    }
    lines.push(`${b.rank}. ${b.name}${marker}`);
  }

  if (priorRanks) {
    const todayNames = new Set(today.brands.map((b) => b.name));
    for (const [name, rank] of priorRanks) {
      if (!todayNames.has(name)) lines.push(`- ~~${name}~~ **−dropped** (was #${rank})`);
    }
  }

  return lines.join("\n");
}

function consensusTable(promptRowsToday, promptRowsPrior) {
  const todayCounts = new Map();
  for (const row of promptRowsToday) {
    for (const b of row.brands || []) {
      todayCounts.set(b.name, (todayCounts.get(b.name) || 0) + 1);
    }
  }
  const priorCounts = new Map();
  for (const row of promptRowsPrior || []) {
    for (const b of row.brands || []) {
      priorCounts.set(b.name, (priorCounts.get(b.name) || 0) + 1);
    }
  }

  const allBrands = [...new Set([...todayCounts.keys(), ...priorCounts.keys()])];
  allBrands.sort((a, b) => (todayCounts.get(b) || 0) - (todayCounts.get(a) || 0));

  const rows = ["| Brand | Models today | Δ vs prior |", "|---|---|---|"];
  for (const name of allBrands) {
    const t = todayCounts.get(name) || 0;
    const p = priorCounts.get(name);
    let delta = "";
    if (p === undefined) delta = t > 0 ? "**new**" : "";
    else if (t > p) delta = `+${t - p}`;
    else if (t < p) delta = `${t - p}`;
    else delta = "—";
    rows.push(`| ${name} | ${t} | ${delta} |`);
  }
  return rows.join("\n");
}

function buildReport(latestDate, priorDate, latestRows, priorRows) {
  const out = [];
  out.push(`# Brand visibility — ${latestDate}`);
  out.push("");
  if (priorDate) out.push(`Comparing **${latestDate}** vs **${priorDate}**.`);
  else out.push(`First snapshot — no prior day to diff against.`);
  out.push("");

  const byPrompt = groupBy(latestRows, (r) => r.prompt_id);
  const priorByPrompt = priorRows ? groupBy(priorRows, (r) => r.prompt_id) : null;

  for (const [prompt_id, todayRows] of byPrompt) {
    const priorPromptRows = priorByPrompt?.get(prompt_id);
    out.push(`## Prompt: \`${prompt_id}\``);
    out.push("");
    out.push("### Per-model rankings");
    out.push("");
    const models = todayRows.map((r) => r.model);
    for (const model of models) {
      const today = findRow(todayRows, prompt_id, model);
      const prior = priorPromptRows ? findRow(priorPromptRows, prompt_id, model) : null;
      out.push(`#### ${model}`);
      out.push("");
      out.push(modelSection(today, prior));
      out.push("");
    }
    out.push("### Cross-model consensus");
    out.push("");
    out.push(consensusTable(todayRows, priorPromptRows));
    out.push("");
  }

  return out.join("\n");
}

function csvRows(date, rows) {
  const lines = [];
  for (const row of rows) {
    if (!row.brands) continue;
    for (const b of row.brands) {
      const brandEsc = b.name.includes(",") ? `"${b.name}"` : b.name;
      lines.push(`${date},${row.prompt_id},${row.model},${brandEsc},${b.rank},${b.first_index}`);
    }
  }
  return lines;
}

async function appendCsv(date, rows) {
  const lines = csvRows(date, rows);
  if (lines.length === 0) return;
  let body = "";
  try {
    await fs.access(CSV_PATH);
  } catch {
    body = CSV_HEADER;
  }
  body += lines.join("\n") + "\n";
  await fs.appendFile(CSV_PATH, body);
}

async function main() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const files = await listJsonlFiles();
  if (files.length === 0) {
    console.error("No data/*.jsonl files found. Run track.js first.");
    process.exit(1);
  }

  const latestFile = files[files.length - 1];
  const priorFile = files.length >= 2 ? files[files.length - 2] : null;
  const latestDate = latestFile.replace(".jsonl", "");
  const priorDate = priorFile ? priorFile.replace(".jsonl", "") : null;

  const latestRows = await readJsonl(latestFile);
  const priorRows = priorFile ? await readJsonl(priorFile) : null;

  const md = buildReport(latestDate, priorDate, latestRows, priorRows);
  const outPath = path.join(REPORTS_DIR, `${latestDate}.md`);
  await fs.writeFile(outPath, md);
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);

  await appendCsv(latestDate, latestRows);
  console.log(`Appended share-of-voice rows to ${path.relative(process.cwd(), CSV_PATH)}`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
