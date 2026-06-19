import { spawn } from "child_process";
import os from "os";
import fs from "fs";
import { chromium } from "playwright";
import { state } from "../state.js";

const DEBUG_PORT_RANGE_START = 9222;
const DEBUG_PORT_RANGE_END = 9231;
const LAUNCH_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 500;

const KNOWN_BROWSERS = [
  {
    name: "Brave",
    executable: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    userDataDir: `${os.homedir()}/Library/Application Support/BraveSoftware/Brave-Browser`,
  },
  {
    name: "Chrome",
    executable: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    userDataDir: `${os.homedir()}/Library/Application Support/Google/Chrome`,
  },
  {
    name: "Chromium",
    executable: "/Applications/Chromium.app/Contents/MacOS/Chromium",
    userDataDir: `${os.homedir()}/Library/Application Support/Chromium`,
  },
];

async function fetchCdpVersionInfo(port) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const response = await fetch(`http://localhost:${port}/json/version`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.ok) return await response.json();
  } catch {}
  return null;
}

async function fetchCdpTargets(port) {
  try {
    const response = await fetch(`http://localhost:${port}/json`);
    if (response.ok) return await response.json();
  } catch {}
  return [];
}

async function scanRunningBrowsers() {
  const results = [];
  for (let port = DEBUG_PORT_RANGE_START; port <= DEBUG_PORT_RANGE_END; port++) {
    const info = await fetchCdpVersionInfo(port);
    if (info) {
      results.push({ port, browser: info.Browser });
    }
  }
  return results;
}

function detectInstalledBrowsers() {
  return KNOWN_BROWSERS.filter((b) => fs.existsSync(b.executable));
}

function extractExtensionIdFromUrl(url) {
  const match = url?.match(/chrome-extension:\/\/([a-z]{32})\//);
  return match ? match[1] : null;
}

function findExtensionIdFromWorkers(workers) {
  for (const worker of workers) {
    const id = extractExtensionIdFromUrl(worker.url());
    if (id) return id;
  }
  return null;
}

async function findExtensionIdFromTargets(port) {
  const targets = await fetchCdpTargets(port);
  for (const target of targets) {
    const id = extractExtensionIdFromUrl(target.url);
    if (id) return id;
  }
  return null;
}

function attachSwLogListeners(context) {
  const existingWorkers = context.serviceWorkers();
  existingWorkers.forEach((sw) => {
    sw.on("console", (msg) =>
      state.swLogs.push(`[${new Date().toISOString()}] ${msg.type()}: ${msg.text()}`)
    );
  });
  context.on("serviceworker", (sw) => {
    sw.on("console", (msg) =>
      state.swLogs.push(`[${new Date().toISOString()}] ${msg.type()}: ${msg.text()}`)
    );
  });
}

export async function teardownExistingConnection() {
  if (!state.browser) return;
  try {
    await state.browser.close();
  } catch {}
  state.browser = null;
  state.context = null;
  state.page = null;
  state.extensionId = null;
  state.connectionMode = null;
  state.swLogs.length = 0;
  state.networkCaptures.length = 0;
}

async function connectToDebugPort(port) {
  const endpoint = `http://localhost:${port}`;
  const browser = await chromium.connectOverCDP(endpoint);

  const contexts = browser.contexts();
  const context = contexts.length > 0 ? contexts[0] : await browser.newContext();

  const swWorkers = context.serviceWorkers();
  let extensionId = findExtensionIdFromWorkers(swWorkers);
  if (!extensionId) {
    extensionId = await findExtensionIdFromTargets(port);
  }

  const openPages = context.pages();
  const page = openPages.length > 0 ? openPages[openPages.length - 1] : await context.newPage();

  state.browser = browser;
  state.context = context;
  state.page = page;
  state.extensionId = extensionId;
  state.connectionMode = "cdp";

  attachSwLogListeners(context);

  return extensionId;
}

async function pollUntilCdpReady(port) {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const info = await fetchCdpVersionInfo(port);
    if (info) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

async function launchBrowserProcess(browserConfig, port) {
  const launchArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${browserConfig.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
  ];

  const child = spawn(browserConfig.executable, launchArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const ready = await pollUntilCdpReady(port);
  if (!ready) {
    throw new Error(
      `${browserConfig.name} did not expose debugging on port ${port} within ${LAUNCH_TIMEOUT_MS}ms. ` +
      `If ${browserConfig.name} is already running with the same profile, close it first and try again.`
    );
  }
}

export const definition = {
  name: "connect_browser",
  description:
    "Connect to an existing Brave/Chrome/Chromium browser using your real logged-in sessions. " +
    "Use action 'scan' first to see what's available, then 'connect' to attach to a running browser " +
    "or 'launch' to start one with debugging enabled. Your logins and tabs are preserved.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["scan", "connect", "launch"],
        description:
          "'scan' — list running debuggable browsers and installed browsers. " +
          "'connect' — attach to a browser already running with --remote-debugging-port. " +
          "'launch' — start an installed browser with your real profile and remote debugging, then connect.",
      },
      port: {
        type: "number",
        description: "CDP debug port to connect to (for 'connect' action). Defaults to 9222.",
      },
      browser_name: {
        type: "string",
        enum: ["Brave", "Chrome", "Chromium"],
        description: "Which browser to launch (for 'launch' action). Defaults to 'Brave'.",
      },
      debug_port: {
        type: "number",
        description: "Port to use for remote debugging when launching (for 'launch' action). Defaults to 9222.",
      },
    },
    required: ["action"],
  },
};

export async function handler(args) {
  const { action } = args;

  if (action === "scan") {
    const runningBrowsers = await scanRunningBrowsers();
    const installedBrowsers = detectInstalledBrowsers();

    const runningSection =
      runningBrowsers.length > 0
        ? runningBrowsers.map((b) => `  Port ${b.port}: ${b.browser}`).join("\n")
        : "  None — browsers must be started with --remote-debugging-port to appear here.";

    const installedSection =
      installedBrowsers.length > 0
        ? installedBrowsers.map((b) => `  ${b.name}: ${b.executable}`).join("\n")
        : "  None found in /Applications.";

    const nextStep =
      runningBrowsers.length > 0
        ? `Use action:"connect" with port:${runningBrowsers[0].port} to attach.`
        : `Use action:"launch" with browser_name:"${installedBrowsers[0]?.name || "Brave"}" to start one.\n` +
          `Note: close your existing ${installedBrowsers.map((b) => b.name).join("/")} window first — ` +
          `Chrome-based browsers won't open a second instance with the same profile.`;

    return {
      content: [
        {
          type: "text",
          text: [
            "Running browsers with remote debugging:",
            runningSection,
            "",
            "Installed browsers:",
            installedSection,
            "",
            nextStep,
          ].join("\n"),
        },
      ],
    };
  }

  if (action === "connect") {
    const port = args.port || 9222;
    const versionInfo = await fetchCdpVersionInfo(port);
    if (!versionInfo) {
      throw new Error(
        `No browser with remote debugging found on port ${port}. ` +
        `Run action:"scan" to see what's available, or use action:"launch" to start one.`
      );
    }

    await teardownExistingConnection();
    const extensionId = await connectToDebugPort(port);

    return {
      content: [
        {
          type: "text",
          text: [
            `Connected to ${versionInfo.Browser} on port ${port}.`,
            `Extension ID: ${extensionId || "not detected — open chrome://extensions to find it"}`,
            "",
            "Your existing tabs and logged-in sessions are preserved.",
            "All other tools (interact_with_popup, inspect_dom, etc.) will now use this browser.",
          ].join("\n"),
        },
      ],
    };
  }

  if (action === "launch") {
    const browserName = args.browser_name || "Brave";
    const port = args.debug_port || 9222;

    const browserConfig = KNOWN_BROWSERS.find((b) => b.name === browserName);
    if (!browserConfig) {
      const validNames = KNOWN_BROWSERS.map((b) => b.name).join(", ");
      throw new Error(`Unknown browser "${browserName}". Choose from: ${validNames}`);
    }
    if (!fs.existsSync(browserConfig.executable)) {
      throw new Error(`${browserName} not found at: ${browserConfig.executable}`);
    }

    // If a browser is already debugging on the target port, just connect to it.
    const alreadyRunning = await fetchCdpVersionInfo(port);
    if (alreadyRunning) {
      await teardownExistingConnection();
      const extensionId = await connectToDebugPort(port);
      return {
        content: [
          {
            type: "text",
            text: [
              `Browser already running with debugging on port ${port}. Connected to ${alreadyRunning.Browser}.`,
              `Extension ID: ${extensionId || "not detected"}`,
            ].join("\n"),
          },
        ],
      };
    }

    await teardownExistingConnection();
    await launchBrowserProcess(browserConfig, port);
    const extensionId = await connectToDebugPort(port);

    return {
      content: [
        {
          type: "text",
          text: [
            `Launched ${browserName} with remote debugging on port ${port}.`,
            `Profile: ${browserConfig.userDataDir}`,
            `Extension ID: ${extensionId || "not detected — open chrome://extensions to find it"}`,
            "",
            "All your existing logins are available.",
            "All other tools (interact_with_popup, inspect_dom, etc.) will now use this browser.",
          ].join("\n"),
        },
      ],
    };
  }

  throw new Error(`Unknown action "${action}". Valid actions: "scan", "connect", "launch".`);
}
