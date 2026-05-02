#!/usr/bin/env node
/**
 * Massive Web Render AI API Test Script
 * https://docs.joinmassive.com/web-render/ai
 *
 * Usage:
 *   MASSIVE_API_TOKEN=your_token node web-render-test.js [prompt] [options]
 *
 * Options:
 *   --model MODEL      AI model: chatgpt, gemini, perplexity, copilot (default: chatgpt)
 *   --device DEVICE    Device to emulate (default: none)
 *   --format FORMAT    Response format: json, rendered, raw (default: json)
 *   --expiration DAYS  Cache expiration in days, 0 to disable (default: 1)
 *   --devices          List available devices and exit
 */

const { getApiToken, fetchDevices, makeAiRequest } = require("./lib.js");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    model: "chatgpt",
    format: "json",
    expiration: "1",
  };
  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--devices") {
      options.devices = true;
    } else if (arg === "--model" && i + 1 < args.length) {
      options.model = args[++i];
    } else if (arg === "--device" && i + 1 < args.length) {
      options.device = args[++i];
    } else if (arg === "--format" && i + 1 < args.length) {
      options.format = args[++i];
    } else if (arg === "--expiration" && i + 1 < args.length) {
      options.expiration = args[++i];
    } else if (!arg.startsWith("--")) {
      positionals.push(arg);
    }
  }

  options.prompt = positionals.join(" ") || "What are the top 3 news stories today?";
  return options;
}

async function main() {
  const token = getApiToken();
  const options = parseArgs();

  if (options.devices) {
    const devices = await fetchDevices(token);
    console.log("\nAvailable devices:");
    devices.forEach((d) => console.log(`  - ${d}`));
    return;
  }

  const result = await makeAiRequest(token, options);

  if (options.format === "rendered" || options.format === "raw") {
    console.log("\n--- Response HTML ---");
    console.log(result);
  } else {
    console.log("\n--- Response JSON ---");
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
