import { ensurePage, state } from "../state.js";

export const definition = {
  name: "inspect_dom",
  description: "Inspect DOM elements or run JavaScript in a page context. Optionally navigate to a URL first.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to navigate to before inspecting (optional)",
      },
      selector: {
        type: "string",
        description: "CSS selector to query — returns outerHTML of all matching elements",
      },
      script: {
        type: "string",
        description: "JavaScript expression to evaluate in page context (overrides selector)",
      },
    },
  },
};

export async function handler(args) {
  let p = await ensurePage();

  if (args.url) {
    // In CDP mode the active page may be a restricted URL (devtools://, chrome://, chrome-extension://).
    // Rather than failing to navigate it, open a fresh tab for the requested URL.
    const currentUrl = p.url();
    const isRestricted = ["chrome://", "devtools://", "chrome-extension://", "about:"].some(
      (prefix) => currentUrl.startsWith(prefix)
    );
    if (isRestricted && state.connectionMode === "cdp") {
      const ctx = state.context || state.browser;
      p = await ctx.newPage();
      state.page = p;
    }
    await p.goto(args.url, { waitUntil: "domcontentloaded" });
  }

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

  return { content: [{ type: "text", text: "Provide either a selector or a script." }], isError: true };
}
