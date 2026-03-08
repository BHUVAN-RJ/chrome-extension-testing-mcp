import path from "path";
import { ensurePage } from "../state.js";

export const definition = {
  name: "take_screenshot",
  description: "Take a screenshot of the current browser page or popup.",
  inputSchema: {
    type: "object",
    properties: {
      output_path: {
        type: "string",
        description: "File path to save the screenshot (default: ./screenshot.png)",
      },
      full_page: {
        type: "boolean",
        description: "Capture the full scrollable page (default: false)",
      },
    },
  },
};

export async function handler(args) {
  const p = await ensurePage();
  const outPath = path.resolve(args.output_path || "./screenshot.png");
  await p.screenshot({ path: outPath, fullPage: args.full_page || false });
  return { content: [{ type: "text", text: `Screenshot saved to: ${outPath}` }] };
}
