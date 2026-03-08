# Chrome Extension Tester — MCP Server

An **MCP (Model Context Protocol) server** that lets Claude interactively test any unpacked Chrome extension using Playwright. Load your extension, interact with its popup and options page, inspect storage, monitor network requests, check badges, test messaging, and more — all through natural language.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Setup with Claude Desktop](#setup-with-claude-desktop)
- [Setup with Claude Code (npx)](#setup-with-claude-code-npx)
- [Available Tools](#available-tools)
- [Testing Agent Prompt](#testing-agent-prompt)
- [Example Prompts](#example-prompts)
- [Project Structure](#project-structure)
- [Notes](#notes)

---

## Features

- Load and reload any unpacked Chrome extension
- Interact with popup and options pages (click, type, read content)
- Inspect and manipulate `chrome.storage` (local / sync / session)
- Read background service worker console logs
- Monitor and inspect network requests
- Check and assert badge text and color
- Send messages to the background script and validate responses
- Simulate tab open / close / switch events
- Test context menu registration and handler invocation
- Run assertions that return structured PASS / FAIL results
- Take screenshots at any point during testing

---

## Requirements

- **Node.js** 18 or higher
- **Claude Desktop** or **Claude Code** with MCP support
- A Chrome extension with a `manifest.json` (Manifest V2 or V3)

---

## Installation

### Option A — npx (no install needed)

```bash
npx chrome-extension-tester-mcp
```

### Option B — install globally

```bash
npm install -g chrome-extension-tester-mcp
```

### Option C — clone and run locally

```bash
git clone https://github.com/YOUR_USERNAME/chrome-extension-testing-mcp.git
cd chrome-extension-testing-mcp
npm install
npx playwright install chromium
```

---

## Setup with Claude Desktop

Add the following to your Claude Desktop MCP config file:

**macOS / Linux** — `~/.config/claude/claude_desktop_config.json`
**Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

### Using npx (recommended)

```json
{
  "mcpServers": {
    "chrome-extension-tester": {
      "command": "npx",
      "args": ["chrome-extension-tester-mcp"]
    }
  }
}
```

### Using a local clone

```json
{
  "mcpServers": {
    "chrome-extension-tester": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-extension-testing-mcp/src/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving the config.

---

## Setup with Claude Code (npx)

Add to your project's `.mcp.json` or user-level MCP config:

```json
{
  "mcpServers": {
    "chrome-extension-tester": {
      "command": "npx",
      "args": ["chrome-extension-tester-mcp"]
    }
  }
}
```

---

## Available Tools

| Tool | What it does |
|------|-------------|
| `load_extension` | Launch Chromium with an unpacked extension; captures the extension ID automatically |
| `interact_with_popup` | Open the popup, then click elements, type text, or read content |
| `open_options_page` | Open the extension's options / settings page and interact with it |
| `inspect_dom` | Navigate to a URL, query a DOM selector, or evaluate arbitrary JavaScript |
| `get_service_worker_logs` | Read buffered background service worker console logs; optionally clear them |
| `take_screenshot` | Save a screenshot of the current page or popup |
| `run_assertion` | Assert that an element exists, has specific text, or a JS expression is truthy — returns PASS or FAIL |
| `extension_storage` | Get, set, remove, or clear keys in `chrome.storage.local`, `.sync`, or `.session` |
| `monitor_network` | Capture network requests during navigation; retrieve or clear the captured list |
| `check_badge` | Read or assert the extension action badge text and background color |
| `send_message_to_background` | Send `chrome.runtime.sendMessage` from the popup context and return the response |
| `test_context_menu` | Check `contextMenus` API availability, simulate right-click, or invoke a menu item handler directly |
| `simulate_tab_events` | Open, close, switch, list, or close all browser tabs |

---

## Testing Agent Prompt

The server includes a built-in MCP prompt called **`extension-tester-agent`** — a fully automated testing agent that validates all implemented changes and returns a structured report.

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `extension_path` | yes | Absolute path to the unpacked extension folder |
| `extension_description` | yes | What the extension does — features, UI, storage, background behaviour |
| `changes` | yes | Everything implemented or changed in this session |

### What it does

1. **Understands** the extension and derives a set of tests from the changes list
2. **Writes a test plan** — every change maps to at least one test and the right MCP tool
3. **Executes every test** — never skips, takes screenshots on failure
4. **Reports** a structured PASS / FAIL table with details on any failures

### How to invoke

After implementing changes, tell Claude:

```
Use the extension-tester-agent prompt with:
- extension_path: /path/to/my-extension
- extension_description: "A tab manager that saves sessions to chrome.storage.local and restores them via a popup"
- changes: "Added save button; save button writes open tabs to storage.local; badge shows count of saved tabs"
```

Claude will write the test plan, execute every test, and return a full report.

---

## Example Prompts

```
Load my extension from /Users/me/my-extension and open the popup
```

```
Click the button with selector #save and take a screenshot
```

```
Navigate to https://example.com and check if my content script injected a .banner element
```

```
Read all keys from chrome.storage.local
```

```
Set { "enabled": true } in chrome.storage.local and verify it was saved
```

```
Navigate to https://example.com, capture all network requests, then show me any that were blocked
```

```
Check the badge text — it should say "ON"
```

```
Send the message { "type": "GET_STATUS" } to the background and show the response
```

```
Open a tab to https://news.ycombinator.com, then another to https://github.com, then list all open tabs
```

```
Right-click on https://example.com and trigger the context menu item with id "my-action"
```

---

## Project Structure

```
chrome-extension-testing-mcp/
├── src/
│   ├── index.js              # MCP server entry point
│   ├── state.js              # Shared browser state and helpers
│   ├── prompts/
│   │   ├── index.js          # Registers MCP prompts
│   │   └── extension-tester.js  # extension-tester-agent prompt definition
│   └── tools/
│       ├── index.js          # Aggregates all tool definitions and handlers
│       ├── load-extension.js
│       ├── popup.js
│       ├── dom.js
│       ├── logs.js
│       ├── screenshot.js
│       ├── assertion.js
│       ├── storage.js
│       ├── network.js
│       ├── options-page.js
│       ├── context-menu.js
│       ├── badge.js
│       ├── messaging.js
│       └── tabs.js
├── package.json
└── README.md
```

---

## Notes

- The browser launches in **headed mode** (visible window) so you can watch tests run in real time
- Screenshots default to `./screenshot.png` unless a custom path is provided
- Service worker logs are buffered from the moment `load_extension` is called
- Call `load_extension` again at any time to get a fresh browser instance
- Native Chrome context menus cannot be automated by Playwright — use `test_context_menu` with `trigger_item` to invoke handlers directly
- Badge and storage tools communicate via the service worker, so the extension must have a background service worker (MV3)

---

## License

MIT
