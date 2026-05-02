const API_BASE = "https://render.joinmassive.com/ai";

function getApiToken() {
  const token = process.env.MASSIVE_API_TOKEN;
  if (!token) {
    console.error("Error: MASSIVE_API_TOKEN environment variable is required");
    process.exit(1);
  }
  return token;
}

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 503 && attempt < maxRetries) {
        const delay = attempt * 2000;
        console.log(`  Got 503, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = attempt * 2000;
      console.log(`  Network error, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

async function fetchDevices(token) {
  console.log("Fetching available devices...");
  const response = await fetchWithRetry(`${API_BASE}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch devices: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function makeAiRequest(token, options) {
  const params = new URLSearchParams();
  params.append("prompt", options.prompt);
  params.append("model", options.model);
  params.append("format", options.format);
  params.append("expiration", options.expiration);
  if (options.device) params.append("device", options.device);

  const url = `${API_BASE}?${params.toString()}`;
  console.log(`\nMaking AI request...`);
  console.log(`  Model: ${options.model}`);
  console.log(`  Prompt: ${options.prompt.substring(0, 80)}${options.prompt.length > 80 ? "..." : ""}`);
  if (options.device) console.log(`  Device: ${options.device}`);
  console.log(`  Format: ${options.format}`);

  const startTime = Date.now();
  const response = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  }, 5);
  const elapsed = Date.now() - startTime;

  console.log(`  Response received in ${elapsed}ms`);
  console.log(`  Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} ${response.statusText}\n${text}`);
  }

  if (options.format === "rendered" || options.format === "raw") {
    return await response.text();
  }

  return await response.json();
}

module.exports = {
  API_BASE,
  getApiToken,
  fetchWithRetry,
  fetchDevices,
  makeAiRequest,
};
