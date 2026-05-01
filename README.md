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
