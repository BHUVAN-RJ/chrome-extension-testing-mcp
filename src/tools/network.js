import { state, ensurePage } from "../state.js";

export const definition = {
  name: "monitor_network",
  description: "Monitor, capture, and inspect network requests. Useful for testing extensions that block, redirect, or modify requests (e.g. ad blockers, header modifiers).",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["navigate_and_capture", "get_captured", "clear"],
        description: "navigate_and_capture: go to a URL and record all requests; get_captured: return buffered results; clear: empty the buffer",
      },
      url: {
        type: "string",
        description: "URL to navigate to (required for navigate_and_capture)",
      },
      filter_pattern: {
        type: "string",
        description: "Only show requests whose URL contains this string (optional)",
      },
      include_types: {
        type: "array",
        items: { type: "string" },
        description: "Filter by resource type: document, script, stylesheet, image, xhr, fetch, etc. (optional)",
      },
    },
    required: ["action"],
  },
};

export async function handler(args) {
  if (args.action === "clear") {
    state.networkCaptures.length = 0;
    return { content: [{ type: "text", text: "Network capture buffer cleared." }] };
  }

  if (args.action === "get_captured") {
    let entries = [...state.networkCaptures];
    if (args.filter_pattern) entries = entries.filter((r) => r.url.includes(args.filter_pattern));
    if (args.include_types?.length) entries = entries.filter((r) => args.include_types.includes(r.resourceType));
    return {
      content: [{
        type: "text",
        text: entries.length
          ? `${entries.length} captured request(s):\n\n${entries.map((r) => `[${r.method}] [${r.resourceType}] ${r.status} ${r.url}`).join("\n")}`
          : "No captured requests match the filter.",
      }],
    };
  }

  if (args.action === "navigate_and_capture") {
    if (!args.url) return { content: [{ type: "text", text: "Provide a 'url' to navigate to." }] };

    const p = await ensurePage();
    const captured = [];

    const onResponse = (response) => {
      captured.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
        resourceType: response.request().resourceType(),
      });
    };

    p.on("response", onResponse);
    await p.goto(args.url, { waitUntil: "networkidle" });
    p.off("response", onResponse);

    captured.forEach((r) => state.networkCaptures.push(r));

    let displayed = captured;
    if (args.filter_pattern) displayed = displayed.filter((r) => r.url.includes(args.filter_pattern));
    if (args.include_types?.length) displayed = displayed.filter((r) => args.include_types.includes(r.resourceType));

    return {
      content: [{
        type: "text",
        text: `Captured ${captured.length} total request(s)${args.filter_pattern ? ` (${displayed.length} matching "${args.filter_pattern}")` : ""}:\n\n${displayed.map((r) => `[${r.method}] [${r.resourceType}] ${r.status} ${r.url}`).join("\n")}`,
      }],
    };
  }
}
