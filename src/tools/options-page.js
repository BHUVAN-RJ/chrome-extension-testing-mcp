import { state, ensurePage } from "../state.js";

export const definition = {
  name: "open_options_page",
  description: "Open the extension options/settings page (options.html or a custom page). Supports any extension page by filename.",
  inputSchema: {
    type: "object",
    properties: {
      page: {
        type: "string",
        description: "Extension page filename to open (default: options.html). Change if the extension uses a different filename.",
      },
      action: {
        type: "string",
        enum: ["open", "click", "type", "get_text", "get_html"],
        description: "Action to perform after opening (optional, defaults to just opening)",
      },
      selector: {
        type: "string",
        description: "CSS selector for interaction actions",
      },
      value: {
        type: "string",
        description: "Value to type (for 'type' action)",
      },
    },
  },
};

export async function handler(args) {
  if (!state.extensionId) {
    return { content: [{ type: "text", text: "Extension ID not detected. Call load_extension first." }] };
  }

  const pageName = args.page || "options.html";
  const optionsUrl = `chrome-extension://${state.extensionId}/${pageName}`;
  const p = await ensurePage();

  await p.goto(optionsUrl, { waitUntil: "domcontentloaded" });

  if (!args.action || args.action === "open") {
    return { content: [{ type: "text", text: `Options page opened at ${optionsUrl}` }] };
  }

  if (args.action === "click") {
    await p.click(args.selector);
    return { content: [{ type: "text", text: `Clicked: ${args.selector}` }] };
  }

  if (args.action === "type") {
    await p.fill(args.selector, args.value || "");
    return { content: [{ type: "text", text: `Typed "${args.value}" into ${args.selector}` }] };
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
