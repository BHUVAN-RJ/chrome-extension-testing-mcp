import { ensurePage } from "../state.js";

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

  return { content: [{ type: "text", text: "Provide either a selector or a script." }] };
}
