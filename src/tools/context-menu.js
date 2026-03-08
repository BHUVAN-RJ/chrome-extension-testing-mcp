import { ensurePage, getServiceWorker } from "../state.js";

export const definition = {
  name: "test_context_menu",
  description: "Test context menus registered by the extension. Can verify the contextMenus API is available and simulate right-click events on page elements.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["check_api", "right_click", "trigger_item"],
        description: "check_api: verify contextMenus API is available in service worker; right_click: simulate right-click on a selector (triggers contextmenu DOM event); trigger_item: invoke a context menu item handler by id via service worker",
      },
      url: {
        type: "string",
        description: "URL to navigate to before right-clicking (optional)",
      },
      selector: {
        type: "string",
        description: "CSS selector of the element to right-click (for 'right_click' action)",
      },
      menu_item_id: {
        type: "string",
        description: "The context menu item ID to trigger (for 'trigger_item' action — matches the id passed to chrome.contextMenus.create)",
      },
      page_url: {
        type: "string",
        description: "The pageUrl to pass to the onClicked handler (for 'trigger_item' action)",
      },
    },
    required: ["action"],
  },
};

export async function handler(args) {
  if (args.action === "check_api") {
    const sw = await getServiceWorker();
    const result = await sw.evaluate(() => ({
      available: typeof chrome.contextMenus !== "undefined",
      hasCreate: typeof chrome.contextMenus?.create === "function",
      hasRemove: typeof chrome.contextMenus?.remove === "function",
      hasUpdate: typeof chrome.contextMenus?.update === "function",
    }));
    return {
      content: [{
        type: "text",
        text: `Context Menus API:\n${JSON.stringify(result, null, 2)}\n\nNote: chrome.contextMenus.getAll() is not available in MV3 service workers. Items are registered imperatively via chrome.contextMenus.create().`,
      }],
    };
  }

  if (args.action === "right_click") {
    if (!args.selector) return { content: [{ type: "text", text: "Provide a 'selector' for right_click action." }] };
    const p = await ensurePage();
    if (args.url) await p.goto(args.url, { waitUntil: "domcontentloaded" });
    await p.click(args.selector, { button: "right" });
    return {
      content: [{
        type: "text",
        text: `Right-click dispatched on "${args.selector}".\nThis fires the contextmenu DOM event on the element. Note: native Chrome context menus cannot be interacted with via Playwright — use 'trigger_item' to invoke the handler directly.`,
      }],
    };
  }

  if (args.action === "trigger_item") {
    if (!args.menu_item_id) return { content: [{ type: "text", text: "Provide a 'menu_item_id' to trigger." }] };
    const sw = await getServiceWorker();
    // Directly invoke the onClicked listener by dispatching a synthetic event via the SW
    const result = await sw.evaluate(({ menuItemId, pageUrl }) => {
      return new Promise((resolve) => {
        const info = { menuItemId, editable: false, pageUrl: pageUrl || "about:blank" };
        const tab = { id: 0, index: 0, url: pageUrl || "about:blank", active: true, highlighted: true, pinned: false, incognito: false };
        try {
          chrome.contextMenus.onClicked.dispatch(info, tab);
          resolve({ dispatched: true, menuItemId });
        } catch (e) {
          resolve({ dispatched: false, error: e.message });
        }
      });
    }, { menuItemId: args.menu_item_id, pageUrl: args.page_url });
    return {
      content: [{ type: "text", text: `Context menu trigger result:\n${JSON.stringify(result, null, 2)}` }],
    };
  }
}
