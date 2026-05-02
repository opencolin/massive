#!/usr/bin/env node
/**
 * Re-run brand extraction over an existing data/YYYY-MM-DD.jsonl using the
 * current lib.js logic and the current config.json brand list. Useful when
 * you tweak extraction or aliases and want to update past data without
 * re-querying the API.
 *
 * Usage:
 *   node reprocess.js                  # latest file
 *   node reprocess.js 2026-05-02       # specific date
 */

const fs = require("fs/promises");
const path = require("path");
const { extractResponseText, extractBrands } = require("./lib.js");

const CONFIG_PATH = path.join(__dirname, "config.json");
const DATA_DIR = path.join(__dirname, "data");

async function pickFile(arg) {
  if (arg) return path.join(DATA_DIR, `${arg}.jsonl`);
  const files = (await fs.readdir(DATA_DIR))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort();
  if (files.length === 0) throw new Error("No data/*.jsonl files to reprocess");
  return path.join(DATA_DIR, files[files.length - 1]);
}

async function main() {
  const file = await pickFile(process.argv[2]);
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const raw = await fs.readFile(file, "utf8");
  const rows = raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

  const out = [];
  let updated = 0;
  for (const row of rows) {
    if (!row.raw_response) {
      out.push(row);
      continue;
    }
    const text = extractResponseText(row.raw_response);
    const brands = extractBrands(text, config.brands);
    out.push({ ...row, response_text: text, brands });
    updated++;
  }

  await fs.writeFile(file, out.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`Reprocessed ${updated}/${rows.length} rows in ${path.relative(process.cwd(), file)}`);
  for (const r of out) {
    console.log(`  ${r.model}: ${r.brands.map((b) => b.name).join(", ") || "(none)"}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
