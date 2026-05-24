import { chromium } from "playwright";
import fs from "fs";
import path from "path";

export const state = {
  browser: null,
  page: null,
  extensionId: null,
  swLogs: [],
  networkCaptures: [],
};

export async function ensureBrowser(extensionPath) {
  if (state.browser) return;
  const absPath = path.resolve(extensionPath);
  if (!fs.existsSync(absPath)) throw new Error(`Extension path not found: ${absPath}`);

  state.browser = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${absPath}`,
      `--load-extension=${absPath}`,
    ],
  });

  // Prefer an already-registered service worker; otherwise wait for one to register.
  const existingWorkers = state.browser.serviceWorkers();
  let workerUrl = existingWorkers.length > 0 ? existingWorkers[0].url() : null;

  if (!workerUrl) {
    const worker = await state.browser.waitForEvent("serviceworker", { timeout: 5000 });
    workerUrl = worker.url();
  }

  const extensionIdMatch = workerUrl.match(/chrome-extension:\/\/([a-z]{32})\//);
  if (extensionIdMatch) state.extensionId = extensionIdMatch[1];

  state.page = await state.browser.newPage();
}

export async function ensurePage() {
  if (!state.page || state.page.isClosed()) {
    if (!state.browser) throw new Error("Browser not started. Call load_extension first.");
    state.page = await state.browser.newPage();
  }
  return state.page;
}

/**
 * Like ensurePage but launches a plain headed Chromium if no browser is running yet.
 * Used by tools that don't require an extension (e.g. test_account_login).
 */
export async function ensurePageStandalone() {
  if (!state.browser) {
    state.browser = await chromium.launchPersistentContext("", {
      headless: false,
    });
    state.page = await state.browser.newPage();
  }

  if (!state.page || state.page.isClosed()) {
    state.page = await state.browser.newPage();
  }

  return state.page;
}

export async function getServiceWorker() {
  if (!state.browser) throw new Error("Browser not started. Call load_extension first.");
  const workers = state.browser.serviceWorkers();
  if (!workers.length) throw new Error("No service worker found. Extension may not have a background service worker.");
  return workers[0];
}
