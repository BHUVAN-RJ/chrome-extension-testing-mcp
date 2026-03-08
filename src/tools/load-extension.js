import path from "path";
import { state, ensureBrowser } from "../state.js";

export const definition = {
  name: "load_extension",
  description: "Load an unpacked Chrome extension from a local path and launch the browser. Call again to reload/restart.",
  inputSchema: {
    type: "object",
    properties: {
      extension_path: {
        type: "string",
        description: "Absolute or relative path to the unpacked extension folder (must contain manifest.json)",
      },
    },
    required: ["extension_path"],
  },
};

export async function handler(args) {
  if (state.browser) {
    await state.browser.close();
    state.browser = null;
    state.page = null;
    state.extensionId = null;
    state.swLogs.length = 0;
    state.networkCaptures.length = 0;
  }

  await ensureBrowser(args.extension_path);

  state.browser.serviceWorkers().forEach((sw) => {
    sw.on("console", (msg) =>
      state.swLogs.push(`[${new Date().toISOString()}] ${msg.type()}: ${msg.text()}`)
    );
  });
  state.browser.on("serviceworker", (sw) => {
    sw.on("console", (msg) =>
      state.swLogs.push(`[${new Date().toISOString()}] ${msg.type()}: ${msg.text()}`)
    );
  });

  return {
    content: [{
      type: "text",
      text: `Extension loaded.\nPath: ${path.resolve(args.extension_path)}\nExtension ID: ${state.extensionId || "unknown (no service worker detected)"}`,
    }],
  };
}
