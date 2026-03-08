import { getServiceWorker } from "../state.js";

export const definition = {
  name: "extension_storage",
  description: "Read from or write to chrome.storage (local, sync, or session) in the extension's service worker context.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["get", "set", "remove", "clear"],
        description: "Storage operation: get keys, set data, remove keys, or clear all",
      },
      area: {
        type: "string",
        enum: ["local", "sync", "session"],
        description: "Storage area to use (default: local)",
      },
      keys: {
        type: "array",
        items: { type: "string" },
        description: "Keys to read or remove (for 'get' and 'remove' actions; omit to get all)",
      },
      data: {
        type: "object",
        description: "Key-value pairs to write (for 'set' action)",
      },
    },
    required: ["action"],
  },
};

export async function handler(args) {
  const sw = await getServiceWorker();
  const area = args.area || "local";

  if (args.action === "get") {
    const keys = args.keys?.length ? args.keys : null;
    const result = await sw.evaluate(
      ({ area, keys }) => new Promise((resolve) => chrome.storage[area].get(keys, resolve)),
      { area, keys }
    );
    return {
      content: [{ type: "text", text: `storage.${area} contents:\n${JSON.stringify(result, null, 2)}` }],
    };
  }

  if (args.action === "set") {
    if (!args.data || !Object.keys(args.data).length) {
      return { content: [{ type: "text", text: "Provide a 'data' object for the set action." }] };
    }
    await sw.evaluate(
      ({ area, data }) => new Promise((resolve) => chrome.storage[area].set(data, resolve)),
      { area, data: args.data }
    );
    return {
      content: [{ type: "text", text: `Set ${Object.keys(args.data).length} key(s) in storage.${area}:\n${JSON.stringify(args.data, null, 2)}` }],
    };
  }

  if (args.action === "remove") {
    if (!args.keys?.length) {
      return { content: [{ type: "text", text: "Provide 'keys' array for the remove action." }] };
    }
    await sw.evaluate(
      ({ area, keys }) => new Promise((resolve) => chrome.storage[area].remove(keys, resolve)),
      { area, keys: args.keys }
    );
    return {
      content: [{ type: "text", text: `Removed [${args.keys.join(", ")}] from storage.${area}` }],
    };
  }

  if (args.action === "clear") {
    await sw.evaluate(
      ({ area }) => new Promise((resolve) => chrome.storage[area].clear(resolve)),
      { area }
    );
    return { content: [{ type: "text", text: `Cleared all keys from storage.${area}` }] };
  }
}
