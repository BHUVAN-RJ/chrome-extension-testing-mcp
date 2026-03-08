import { getServiceWorker } from "../state.js";

export const definition = {
  name: "check_badge",
  description: "Read or assert the extension icon badge text and background color from chrome.action.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["get", "assert_text", "assert_color"],
        description: "get: return current badge text and color; assert_text: check badge text equals expected; assert_color: check badge background color matches expected RGBA",
      },
      tab_id: {
        type: "number",
        description: "Tab ID to scope the badge check (optional, defaults to global badge)",
      },
      expected_text: {
        type: "string",
        description: "Expected badge text (for assert_text)",
      },
      expected_color: {
        type: "array",
        items: { type: "number" },
        description: "Expected RGBA color array e.g. [255, 0, 0, 255] (for assert_color)",
      },
    },
    required: ["action"],
  },
};

export async function handler(args) {
  const sw = await getServiceWorker();
  const tabId = args.tab_id ?? undefined;

  const badge = await sw.evaluate(async (tabId) => {
    const details = tabId !== undefined ? { tabId } : {};
    const [text, color] = await Promise.all([
      new Promise((resolve) => chrome.action.getBadgeText(details, resolve)),
      new Promise((resolve) => chrome.action.getBadgeBackgroundColor(details, resolve)),
    ]);
    return { text, color };
  }, tabId);

  if (args.action === "get") {
    return {
      content: [{
        type: "text",
        text: `Badge Text: "${badge.text || "(empty)"}\nBadge Color (RGBA): [${badge.color.join(", ")}]`,
      }],
    };
  }

  if (args.action === "assert_text") {
    const passed = badge.text.trim() === (args.expected_text ?? "").trim();
    return {
      content: [{
        type: "text",
        text: `${passed ? "PASS" : "FAIL"} — Badge text assertion\nExpected: "${args.expected_text}" | Got: "${badge.text}"`,
      }],
    };
  }

  if (args.action === "assert_color") {
    if (!args.expected_color?.length) {
      return { content: [{ type: "text", text: "Provide an 'expected_color' RGBA array for assert_color." }] };
    }
    const passed = args.expected_color.every((v, i) => v === badge.color[i]);
    return {
      content: [{
        type: "text",
        text: `${passed ? "PASS" : "FAIL"} — Badge color assertion\nExpected: [${args.expected_color.join(", ")}] | Got: [${badge.color.join(", ")}]`,
      }],
    };
  }
}
