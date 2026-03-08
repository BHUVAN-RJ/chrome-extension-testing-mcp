import { ensurePage } from "../state.js";

export const definition = {
  name: "run_assertion",
  description: "Run a test assertion against the current page. Checks a condition and reports PASS or FAIL.",
  inputSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "Human-readable description of what is being tested",
      },
      selector: {
        type: "string",
        description: "CSS selector to check existence or text content of",
      },
      expected_text: {
        type: "string",
        description: "Expected text content of the element (optional, used with selector)",
      },
      script: {
        type: "string",
        description: "JS expression that must return true to pass (overrides selector)",
      },
    },
    required: ["description"],
  },
};

export async function handler(args) {
  const p = await ensurePage();
  let passed = false;
  let detail = "";

  try {
    if (args.script) {
      passed = !!(await p.evaluate(args.script));
      detail = `Script: ${args.script}`;
    } else if (args.selector) {
      const el = await p.$(args.selector);
      if (!el) {
        passed = false;
        detail = `Element "${args.selector}" not found`;
      } else if (args.expected_text !== undefined) {
        const actual = await el.textContent();
        passed = actual.trim() === args.expected_text.trim();
        detail = `Expected: "${args.expected_text}" | Got: "${actual.trim()}"`;
      } else {
        passed = true;
        detail = `Element "${args.selector}" exists`;
      }
    } else {
      return { content: [{ type: "text", text: "Provide a selector or script for the assertion." }] };
    }
  } catch (e) {
    passed = false;
    detail = `Error: ${e.message}`;
  }

  return {
    content: [{
      type: "text",
      text: `${passed ? "PASS" : "FAIL"} — ${args.description}\n${detail}`,
    }],
  };
}
