import { state, ensurePage } from "../state.js";

export const definition = {
  name: "simulate_tab_events",
  description: "Open, close, switch, and list browser tabs to test extension behavior across tab lifecycle events (tab managers, session savers, per-tab state, etc.).",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["open", "close", "switch", "list", "close_all"],
        description: "open: open a new tab; close: close tab by index; switch: focus tab by index; list: list all open tabs; close_all: close all non-extension tabs",
      },
      url: {
        type: "string",
        description: "URL to open (for 'open' action; defaults to about:blank)",
      },
      tab_index: {
        type: "number",
        description: "0-based index of the tab to act on (from 'list' output). Required for 'close' and 'switch'.",
      },
    },
    required: ["action"],
  },
};

export async function handler(args) {
  if (!state.browser) throw new Error("Browser not started. Call load_extension first.");

  if (args.action === "list") {
    const pages = state.browser.pages();
    const list = await Promise.all(
      pages.map(async (p, i) => {
        const title = await p.title().catch(() => "(no title)");
        const active = p === state.page ? " [active]" : "";
        return `[${i}]${active} ${title} — ${p.url()}`;
      })
    );
    return { content: [{ type: "text", text: `Open tabs (${pages.length}):\n${list.join("\n")}` }] };
  }

  if (args.action === "open") {
    const url = args.url || "about:blank";
    const newPage = await state.browser.newPage();
    if (args.url) await newPage.goto(url, { waitUntil: "domcontentloaded" });
    state.page = newPage;
    const index = state.browser.pages().length - 1;
    return { content: [{ type: "text", text: `Opened new tab [${index}]: ${url}` }] };
  }

  if (args.action === "switch") {
    const pages = state.browser.pages();
    if (args.tab_index === undefined || args.tab_index < 0 || args.tab_index >= pages.length) {
      return { content: [{ type: "text", text: `Invalid tab_index ${args.tab_index}. Run 'list' to see available tabs.` }] };
    }
    state.page = pages[args.tab_index];
    await state.page.bringToFront();
    return { content: [{ type: "text", text: `Switched to tab [${args.tab_index}]: ${state.page.url()}` }] };
  }

  if (args.action === "close") {
    const pages = state.browser.pages();
    if (args.tab_index === undefined || args.tab_index < 0 || args.tab_index >= pages.length) {
      return { content: [{ type: "text", text: `Invalid tab_index ${args.tab_index}. Run 'list' to see available tabs.` }] };
    }
    const toClose = pages[args.tab_index];
    const closedUrl = toClose.url();
    await toClose.close();
    if (state.page === toClose || state.page?.isClosed()) {
      const remaining = state.browser.pages();
      state.page = remaining.length ? remaining[remaining.length - 1] : null;
    }
    return { content: [{ type: "text", text: `Closed tab [${args.tab_index}]: ${closedUrl}` }] };
  }

  if (args.action === "close_all") {
    const pages = state.browser.pages();
    const closed = [];
    for (const p of pages) {
      const url = p.url();
      if (!url.startsWith("chrome-extension://") && url !== "about:blank") {
        await p.close();
        closed.push(url);
      }
    }
    state.page = null;
    return {
      content: [{
        type: "text",
        text: closed.length
          ? `Closed ${closed.length} tab(s):\n${closed.join("\n")}`
          : "No non-extension tabs to close.",
      }],
    };
  }
}
