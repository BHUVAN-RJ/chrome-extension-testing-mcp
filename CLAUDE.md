# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the MCP server
npm start          # node src/index.js
npm run dev        # node --watch src/index.js (hot-reload)

# Install Chromium after npm install
npm run postinstall  # playwright install chromium
```

There is no test runner or linter configured. The server is tested end-to-end by connecting Claude Desktop to it and calling tools manually.

## Architecture

This is an **ES Module** (`"type": "module"`) MCP server. All files use `import`/`export` — no `require()`.

### Request flow

```
Claude Desktop  →  StdioServerTransport  →  src/index.js
                                               ├── ListTools  →  TOOLS[] from src/tools/index.js
                                               ├── CallTool   →  HANDLERS{} from src/tools/index.js
                                               ├── ListPrompts → PROMPTS[] from src/prompts/index.js
                                               └── GetPrompt  →  PROMPT_HANDLERS{} from src/prompts/index.js
```

### Adding a new tool

Each tool is its own file in `src/tools/` and must export exactly two named exports:

```js
export const definition = { name, description, inputSchema };  // MCP tool schema
export async function handler(args) { return { content: [{ type: "text", text: "..." }] }; }
```

Then import it in `src/tools/index.js` and add it to the `allTools` array — the aggregator builds `TOOLS[]` and `HANDLERS{}` automatically.

### Shared browser state (`src/state.js`)

All tools share a single mutable `state` object:
```js
{ browser, page, extensionId, swLogs[], networkCaptures[] }
```

Three helpers manage the browser lifecycle:
- `ensureBrowser(extensionPath)` — launches Chromium with `--load-extension`, captures the extension ID from the service worker URL, and sets `state.page`
- `ensurePage()` — returns `state.page`, reopening it if closed; throws if no browser
- `ensurePageStandalone()` — like `ensurePage` but starts a plain Chromium without an extension (used by `test_account_login`)

`load_extension` is the only tool that tears down an existing browser before relaunching — it's the canonical restart mechanism and resets all state fields.

### Adding a new prompt

Prompt files live in `src/prompts/` and export:
```js
export const definition = { name, description, arguments: [...] };
export function getMessages(args) { return [{ role, content }]; }
```

Import and add to `allPrompts` in `src/prompts/index.js`.

## MCP config for Claude Desktop

```json
{
  "mcpServers": {
    "chrome-extension-tester": {
      "command": "node",
      "args": ["/absolute/path/to/src/index.js"]
    }
  }
}
```

The server logs startup to `stderr` (`console.error`) so it doesn't pollute the MCP stdout transport.
