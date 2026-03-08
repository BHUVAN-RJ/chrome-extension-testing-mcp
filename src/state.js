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

  await new Promise((r) => setTimeout(r, 1000));
  const workers = state.browser.serviceWorkers();
  if (workers.length > 0) {
    const url = workers[0].url();
    const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
    if (match) state.extensionId = match[1];
  }

  state.page = await state.browser.newPage();
}

export async function ensurePage() {
  if (!state.page || state.page.isClosed()) {
    if (!state.browser) throw new Error("Browser not started. Call load_extension first.");
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
