import { state, ensurePage } from "../state.js";

export const definition = {
  name: "interact_with_popup",
  description: "Open the extension popup and interact with UI elements (click, type, read text/HTML).",
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
};

export async function handler(args) {
  if (!state.extensionId && args.action === "open") {
    return {
      content: [{ type: "text", text: "Extension ID not detected. Make sure the extension has a background service worker." }],
    };
  }

  const p = await ensurePage();

  if (args.action === "open") {
    const popupUrl = `chrome-extension://${state.extensionId}/popup.html`;
    await p.goto(popupUrl, { waitUntil: "domcontentloaded" });
    return { content: [{ type: "text", text: `Popup opened at ${popupUrl}` }] };
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
