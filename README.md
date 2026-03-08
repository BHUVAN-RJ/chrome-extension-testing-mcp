# Chrome Extension Tester — MCP Server

An MCP server that lets **Claude interactively test any unpacked Chrome extension** using Playwright. Load your extension, interact with its popup and options page, inspect storage, monitor network requests, check badges, test messaging, and more — all through natural language.

---

## Setup

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Connect to Claude Desktop

Add this to your Claude MCP config file:

**macOS/Linux** — `~/.config/claude/claude_desktop_config.json`
**Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "chrome-extension-tester": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-extension-tester/src/index.js"]
    }
  }
}
```

### 3. Restart Claude Desktop

After saving the config, restart Claude Desktop to load the MCP server.

---

## Testing Agent Prompt

The server exposes an MCP prompt called **`extension-tester-agent`** — a fully generic testing agent that validates all implemented changes before returning to the user.

### Arguments

| Argument | Required | Description |
|---|---|---|
| `extension_path` | yes | Absolute path to the unpacked extension folder |
| `extension_description` | yes | What the extension does — features, UI, storage, background behaviour |
| `changes` | yes | Everything implemented or changed in this session |

### What it does

1. **Understands** the extension and derives tests from the changes list
2. **Writes a test plan** — every change gets at least one test, mapped to the right MCP tool
3. **Executes every test** — never skips, takes screenshots on failure
4. **Reports** a structured PASS/FAIL table with details on any failures

The agent does not run after every edit. It is invoked once at the end of an implementation session, gets the full list of changes, and returns a single complete report.

### How to invoke

In Claude Code, after implementing changes to an extension:

```
Use the extension-tester-agent prompt with:
- extension_path: /path/to/my-extension
- extension_description: "A tab manager that saves sessions to chrome.storage.local and restores them via a popup with a save and restore button"
- changes: "Added save button to popup; save button writes open tabs to storage.local; added restore button that reopens saved tabs; badge shows count of saved tabs"
```

Claude will write a test plan, execute every test using the MCP tools, and return a full report.

---

## Available Tools

| Tool | What it does |
|------|-------------|
| `load_extension` | Load an unpacked extension & launch Chrome |
| `interact_with_popup` | Open popup, click, type, read content |
| `open_options_page` | Open options/settings page and interact with it |
| `inspect_dom` | Inspect DOM or run JS in a page context |
| `get_service_worker_logs` | Read background service worker console logs |
| `take_screenshot` | Capture a screenshot of the current page or popup |
| `run_assertion` | Assert a condition — returns PASS or FAIL |
| `extension_storage` | Read, write, remove, or clear chrome.storage (local/sync/session) |
| `monitor_network` | Capture and inspect network requests (ad blockers, header modifiers, etc.) |
| `check_badge` | Read or assert the extension icon badge text and color |
| `send_message_to_background` | Send chrome.runtime.sendMessage and assert the response |
| `test_context_menu` | Check contextMenus API availability and simulate right-click events |
| `simulate_tab_events` | Open, close, switch, and list browser tabs |

---

## Example Prompts

```
Load my extension from /Users/me/my-extension and open the popup
```

```
Click the button with selector #submit and take a screenshot
```

```
Navigate to https://example.com and check if my content script injected a .banner element
```

```
Read all keys from chrome.storage.local
```

```
Navigate to https://example.com and capture all network requests, then show me any that were blocked
```

```
Check the badge text — it should say "ON"
```

```
Send the message { "type": "GET_STATUS" } to the background and show the response
```

```
Open a tab to https://news.ycombinator.com, then open another to https://github.com, then list all tabs
```

---

## Project Structure

```
chrome-extension-tester/
├── src/
│   ├── index.js              # MCP server entry point
│   ├── state.js              # Shared browser state and helpers
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

## Requirements

- Node.js 18+
- A Chrome extension with a `manifest.json` (MV2 or MV3)
- For popup testing: extension must have a `popup.html`
- For storage/badge/messaging: extension must have a background service worker (MV3)

---

## Notes

- The browser launches in **headed mode** (visible) so you can watch what's happening
- Screenshots default to `./screenshot.png`
- Service worker logs are buffered from the moment `load_extension` is called
- Call `load_extension` again to get a fresh browser instance
- Native Chrome context menus cannot be automated by Playwright — use `test_context_menu` with `trigger_item` to invoke handlers directly
