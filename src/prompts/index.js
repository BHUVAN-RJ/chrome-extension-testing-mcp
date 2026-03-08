import * as extensionTester from "./extension-tester.js";

const allPrompts = [extensionTester];

export const PROMPTS = allPrompts.map((p) => p.definition);

export const PROMPT_HANDLERS = Object.fromEntries(
  allPrompts.map((p) => [p.definition.name, p.getMessages])
);
