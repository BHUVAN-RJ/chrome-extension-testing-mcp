#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, HANDLERS } from "./tools/index.js";
import { PROMPTS, PROMPT_HANDLERS } from "./prompts/index.js";

const server = new Server(
  { name: "chrome-extension-tester", version: "2.0.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

// ── Tools ─────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = HANDLERS[name];

  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    return await handler(args || {});
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error in ${name}: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Prompts ───────────────────────────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const getMessages = PROMPT_HANDLERS[name];

  if (!getMessages) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  const definition = PROMPTS.find((p) => p.name === name);

  return {
    description: definition.description,
    messages: getMessages(args || {}),
  };
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Chrome Extension Tester MCP server running (v2.0.0)...");
