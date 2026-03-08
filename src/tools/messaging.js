import { state, ensurePage } from "../state.js";

export const definition = {
  name: "send_message_to_background",
  description: "Send a chrome.runtime.sendMessage to the extension's background service worker and return the response. Runs from within the extension's popup context.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "object",
        description: "The message object to send (must be JSON-serializable)",
      },
      timeout_ms: {
        type: "number",
        description: "Milliseconds to wait for a response before timing out (default: 5000)",
      },
    },
    required: ["message"],
  },
};

export async function handler(args) {
  if (!state.extensionId) {
    return { content: [{ type: "text", text: "Extension ID not detected. Call load_extension first." }] };
  }

  const p = await ensurePage();
  const currentUrl = p.url();

  // Must be in extension context to use chrome.runtime.sendMessage
  if (!currentUrl.startsWith(`chrome-extension://${state.extensionId}`)) {
    await p.goto(`chrome-extension://${state.extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
  }

  const timeout = args.timeout_ms || 5000;

  const result = await p.evaluate(
    ({ message, timeout }) =>
      new Promise((resolve) => {
        const timer = setTimeout(
          () => resolve({ error: "Timeout: no response received within " + timeout + "ms" }),
          timeout
        );
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve({ response });
          }
        });
      }),
    { message: args.message, timeout }
  );

  if (result.error) {
    return { content: [{ type: "text", text: `Message failed: ${result.error}` }] };
  }

  return {
    content: [{
      type: "text",
      text: `Message sent: ${JSON.stringify(args.message, null, 2)}\n\nResponse: ${JSON.stringify(result.response, null, 2)}`,
    }],
  };
}
