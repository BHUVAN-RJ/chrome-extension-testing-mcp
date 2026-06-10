import { getContext } from "../state.js";

export const definition = {
  name: "manage_cookies",
  description:
    "Inspect, edit, delete, and assert browser cookies at the Playwright context layer. Works regardless of the extension's declared permissions and can read httpOnly cookies. Requires a browser started via load_extension.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["get", "set", "delete", "clear", "assert"],
        description:
          "get: list cookies; set: add/update a cookie; delete: remove cookies matching a filter; clear: remove ALL cookies; assert: PASS/FAIL on a cookie's existence/value",
      },
      url: {
        type: "string",
        description:
          "For 'get'/'assert': only consider cookies that would be sent to this URL. For 'set': the cookie's URL (alternative to domain+path).",
      },
      name: {
        type: "string",
        description: "Cookie name. Filters 'get'; targets 'delete'; required for 'assert'.",
      },
      cookie: {
        type: "object",
        description:
          "Full cookie object for 'set': { name, value, url | (domain & path), expires?, httpOnly?, secure?, sameSite? }. sameSite is Strict|Lax|None; expires is unix seconds.",
      },
      domain: {
        type: "string",
        description: "Domain filter for 'delete'; optional disambiguator for 'assert'.",
      },
      path: {
        type: "string",
        description: "Path filter for 'delete'.",
      },
      expected_value: {
        type: "string",
        description: "For 'assert': expected cookie value. Omit to assert mere existence.",
      },
    },
    required: ["action"],
  },
};

export async function handler(args) {
  const ctx = getContext();

  if (args.action === "get") {
    let cookies = args.url ? await ctx.cookies(args.url) : await ctx.cookies();
    if (args.name) cookies = cookies.filter((c) => c.name === args.name);
    return {
      content: [{
        type: "text",
        text: cookies.length
          ? `${cookies.length} cookie(s):\n${JSON.stringify(cookies, null, 2)}`
          : "No cookies match.",
      }],
    };
  }

  if (args.action === "set") {
    const c = args.cookie;
    if (!c || !c.name || c.value === undefined) {
      return { content: [{ type: "text", text: "Provide a 'cookie' object with at least 'name' and 'value'." }], isError: true };
    }
    if (!c.url && !(c.domain && c.path)) {
      return { content: [{ type: "text", text: "Cookie needs either a 'url' or both 'domain' and 'path'." }], isError: true };
    }
    await ctx.addCookies([c]);
    return { content: [{ type: "text", text: `Set cookie '${c.name}':\n${JSON.stringify(c, null, 2)}` }] };
  }

  if (args.action === "delete") {
    const filter = {};
    if (args.name) filter.name = args.name;
    if (args.domain) filter.domain = args.domain;
    if (args.path) filter.path = args.path;
    if (!Object.keys(filter).length) {
      return { content: [{ type: "text", text: "Provide at least one of 'name', 'domain', or 'path' to delete. Use action 'clear' to remove all cookies." }], isError: true };
    }
    await ctx.clearCookies(filter);
    return { content: [{ type: "text", text: `Deleted cookies matching ${JSON.stringify(filter)}.` }] };
  }

  if (args.action === "clear") {
    await ctx.clearCookies();
    return { content: [{ type: "text", text: "All cookies cleared." }] };
  }

  if (args.action === "assert") {
    if (!args.name) {
      return { content: [{ type: "text", text: "Provide 'name' for the assert action." }], isError: true };
    }
    const cookies = args.url ? await ctx.cookies(args.url) : await ctx.cookies();
    const match = cookies.find((c) => c.name === args.name && (!args.domain || c.domain === args.domain));
    if (!match) {
      return { content: [{ type: "text", text: `FAIL: no cookie named '${args.name}'${args.domain ? ` for domain '${args.domain}'` : ""}.` }] };
    }
    if (args.expected_value !== undefined && match.value !== args.expected_value) {
      return { content: [{ type: "text", text: `FAIL: cookie '${args.name}' is '${match.value}', expected '${args.expected_value}'.` }] };
    }
    return { content: [{ type: "text", text: `PASS: cookie '${args.name}'${args.expected_value !== undefined ? ` equals '${args.expected_value}'` : " exists"} (value: '${match.value}').` }] };
  }
}
