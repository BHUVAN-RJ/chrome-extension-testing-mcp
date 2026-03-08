import * as loadExtension from "./load-extension.js";
import * as popup from "./popup.js";
import * as dom from "./dom.js";
import * as logs from "./logs.js";
import * as screenshot from "./screenshot.js";
import * as assertion from "./assertion.js";
import * as storage from "./storage.js";
import * as network from "./network.js";
import * as optionsPage from "./options-page.js";
import * as contextMenu from "./context-menu.js";
import * as badge from "./badge.js";
import * as messaging from "./messaging.js";
import * as tabs from "./tabs.js";

const allTools = [
  loadExtension,
  popup,
  dom,
  logs,
  screenshot,
  assertion,
  storage,
  network,
  optionsPage,
  contextMenu,
  badge,
  messaging,
  tabs,
];

export const TOOLS = allTools.map((t) => t.definition);

export const HANDLERS = Object.fromEntries(
  allTools.map((t) => [t.definition.name, t.handler])
);
