import { state } from "../state.js";

export const definition = {
  name: "get_service_worker_logs",
  description: "Fetch console logs captured from the extension's background service worker.",
  inputSchema: {
    type: "object",
    properties: {
      clear_after: {
        type: "boolean",
        description: "Clear the log buffer after reading (default: false)",
      },
    },
  },
};

export async function handler(args) {
  const logs = [...state.swLogs];
  if (args.clear_after) state.swLogs.length = 0;
  return {
    content: [{
      type: "text",
      text: logs.length
        ? `Service Worker Logs (${logs.length} entries):\n\n${logs.join("\n")}`
        : "No service worker logs captured yet.",
    }],
  };
}
