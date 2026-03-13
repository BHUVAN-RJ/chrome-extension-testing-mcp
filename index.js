#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

// ── State ─────────────────────────────────────────────────────────────────────
let browser = null;
let context = null;
let page = null;
let extensionId = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function ensureBrowser(extensionPath) {
  if (browser) return;
  const absPath = path.resolve(extensionPath);
  if (!fs.existsSync(absPath)) throw new Error(`Extension path not found: ${absPath}`);

  browser = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${absPath}`,
      `--load-extension=${absPath}`,
    ],
  });

  // Grab extension ID from background service worker
  await new Promise((r) => setTimeout(r, 1000));
  const workers = browser.serviceWorkers();
  if (workers.length > 0) {
    const url = workers[0].url();
    const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
    if (match) extensionId = match[1];
  }

  page = await browser.newPage();
}

async function ensurePage() {
  if (!page || page.isClosed()) {
    if (!browser) throw new Error("Browser not started. Call load_extension first.");
    page = await browser.newPage();
  }
  return page;
}

// ── Tool Definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "load_extension",
    description: "Load an unpacked Chrome extension from a local path and launch the browser.",
    inputSchema: {
      type: "object",
      properties: {
        extension_path: {
          type: "string",
          description: "Absolute or relative path to the unpacked extension folder (containing manifest.json)",
        },
      },
      required: ["extension_path"],
    },
  },
  {
    name: "interact_with_popup",
    description: "Open the extension popup and interact with UI elements (click, type, read text).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["open", "click", "type", "get_text", "get_html"],
          description: "Action to perform",
        },
        selector: {
          type: "string",
          description: "CSS selector for the target element (not needed for 'open')",
        },
        value: {
          type: "string",
          description: "Text to type (only for 'type' action)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "inspect_dom",
    description: "Inspect DOM or run JavaScript in a content script context on the current page.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to navigate to before inspecting (optional)",
        },
        selector: {
          type: "string",
          description: "CSS selector to query (returns outerHTML)",
        },
        script: {
          type: "string",
          description: "JavaScript to evaluate in page context (overrides selector)",
        },
      },
    },
  },
  {
    name: "get_service_worker_logs",
    description: "Fetch console logs from the extension's background service worker.",
    inputSchema: {
      type: "object",
      properties: {
        clear_after: {
          type: "boolean",
          description: "Clear the log buffer after reading (default: false)",
        },
      },
    },
  },
  {
    name: "take_screenshot",
    description: "Take a screenshot of the current browser page or popup.",
    inputSchema: {
      type: "object",
      properties: {
        output_path: {
          type: "string",
          description: "File path to save the screenshot (e.g. ./screenshot.png). Defaults to ./screenshot.png",
        },
        full_page: {
          type: "boolean",
          description: "Capture the full scrollable page (default: false)",
        },
      },
    },
  },
  {
    name: "run_assertion",
    description: "Run a test assertion. Checks a condition and reports pass/fail.",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Human-readable description of what is being tested",
        },
        selector: {
          type: "string",
          description: "CSS selector to check existence/text of",
        },
        expected_text: {
          type: "string",
          description: "Expected text content of the element (optional)",
        },
        script: {
          type: "string",
          description: "JS expression that should return true for the assertion to pass (overrides selector)",
        },
      },
      required: ["description"],
    },
  },
];

// ── Log buffer for service worker ─────────────────────────────────────────────
const swLogs = [];

// ── Server ────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "chrome-extension-tester", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ── load_extension ──────────────────────────────────────────────────────
    if (name === "load_extension") {
      if (browser) {
        await browser.close();
        browser = null; context = null; page = null; extensionId = null;
      }
      await ensureBrowser(args.extension_path);

      // Attach service worker log listener
      browser.serviceWorkers().forEach((sw) => {
        sw.on("console", (msg) => swLogs.push(`[${new Date().toISOString()}] ${msg.type()}: ${msg.text()}`));
      });
      browser.on("serviceworker", (sw) => {
        sw.on("console", (msg) => swLogs.push(`[${new Date().toISOString()}] ${msg.type()}: ${msg.text()}`));
      });

      return {
        content: [{
          type: "text",
          text: `✅ Extension loaded successfully.\nPath: ${path.resolve(args.extension_path)}\nExtension ID: ${extensionId || "unknown (no service worker detected)"}`,
        }],
      };
    }

    // ── interact_with_popup ─────────────────────────────────────────────────
    if (name === "interact_with_popup") {
      if (!extensionId && args.action === "open") {
        return { content: [{ type: "text", text: "⚠️ Extension ID not detected. Make sure the extension has a background service worker or try navigating manually." }] };
      }

      const p = await ensurePage();

      if (args.action === "open") {
        const popupUrl = `chrome-extension://${extensionId}/popup.html`;
        await p.goto(popupUrl, { waitUntil: "domcontentloaded" });
        return { content: [{ type: "text", text: `✅ Popup opened at ${popupUrl}` }] };
      }

      if (args.action === "click") {
        await p.click(args.selector);
        return { content: [{ type: "text", text: `✅ Clicked: ${args.selector}` }] };
      }

      if (args.action === "type") {
        await p.fill(args.selector, args.value || "");
        return { content: [{ type: "text", text: `✅ Typed "${args.value}" into ${args.selector}` }] };
      }

      if (args.action === "get_text") {
        const text = await p.textContent(args.selector);
        return { content: [{ type: "text", text: `Text content of "${args.selector}":\n${text}` }] };
      }

      if (args.action === "get_html") {
        const html = await p.innerHTML(args.selector);
        return { content: [{ type: "text", text: `Inner HTML of "${args.selector}":\n${html}` }] };
      }
    }

    // ── inspect_dom ─────────────────────────────────────────────────────────
    if (name === "inspect_dom") {
      const p = await ensurePage();
      if (args.url) await p.goto(args.url, { waitUntil: "domcontentloaded" });

      if (args.script) {
        const result = await p.evaluate(args.script);
        return { content: [{ type: "text", text: `Script result:\n${JSON.stringify(result, null, 2)}` }] };
      }

      if (args.selector) {
        const elements = await p.$$eval(args.selector, (els) => els.map((el) => el.outerHTML));
        return {
          content: [{
            type: "text",
            text: elements.length
              ? `Found ${elements.length} element(s) matching "${args.selector}":\n\n${elements.join("\n\n")}`
              : `No elements found matching "${args.selector}"`,
          }],
        };
      }

      return { content: [{ type: "text", text: "⚠️ Provide either a selector or a script." }] };
    }

    // ── get_service_worker_logs ─────────────────────────────────────────────
    if (name === "get_service_worker_logs") {
      const logs = [...swLogs];
      if (args.clear_after) swLogs.length = 0;
      return {
        content: [{
          type: "text",
          text: logs.length
            ? `📋 Service Worker Logs (${logs.length} entries):\n\n${logs.join("\n")}`
            : "📋 No service worker logs captured yet.",
        }],
      };
    }

    // ── take_screenshot ─────────────────────────────────────────────────────
    if (name === "take_screenshot") {
      const p = await ensurePage();
      const outPath = path.resolve(args.output_path || "./screenshot.png");
      await p.screenshot({ path: outPath, fullPage: args.full_page || false });
      return { content: [{ type: "text", text: `📸 Screenshot saved to: ${outPath}` }] };
    }

    // ── run_assertion ───────────────────────────────────────────────────────
    if (name === "run_assertion") {
      const p = await ensurePage();
      let passed = false;
      let detail = "";

      try {
        if (args.script) {
          passed = !!(await p.evaluate(args.script));
          detail = `Script: ${args.script}`;
        } else if (args.selector) {
          const el = await p.$(args.selector);
          if (!el) {
            passed = false;
            detail = `Element "${args.selector}" not found`;
          } else if (args.expected_text) {
            const actual = await el.textContent();
            passed = actual.trim() === args.expected_text.trim();
            detail = `Expected: "${args.expected_text}" | Got: "${actual.trim()}"`;
          } else {
            passed = true;
            detail = `Element "${args.selector}" exists`;
          }
        } else {
          return { content: [{ type: "text", text: "⚠️ Provide a selector or script for the assertion." }] };
        }
      } catch (e) {
        passed = false;
        detail = `Error: ${e.message}`;
      }

      const icon = passed ? "✅ PASS" : "❌ FAIL";
      return {
        content: [{
          type: "text",
          text: `${icon} — ${args.description}\n${detail}`,
        }],
      };
    }

    return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };

  } catch (err) {
    return {
      content: [{ type: "text", text: `❌ Error in ${name}: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Chrome Extension Tester MCP server running...");
