import { world } from "@minecraft/server";

const startUseHandlers = [];
const stopUseHandlers = [];
const releaseUseHandlers = [];
let initialized = false;

export function onItemStartUse(handler) {
  startUseHandlers.push(handler);
}

export function onItemStopUse(handler) {
  stopUseHandlers.push(handler);
}

export function onItemReleaseUse(handler) {
  releaseUseHandlers.push(handler);
}

function dispatch(handlers, event, label) {
  for (const handler of handlers) {
    try {
      handler(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] ${label} handler failed: ${message}`);
    }
  }
}

export function initializeItemEvents() {
  if (initialized) return;
  initialized = true;

  world.afterEvents.itemStartUse.subscribe((event) => {
    dispatch(startUseHandlers, event, "Item start-use");
  });
  world.afterEvents.itemStopUse.subscribe((event) => {
    dispatch(stopUseHandlers, event, "Item stop-use");
  });
  world.afterEvents.itemReleaseUse.subscribe((event) => {
    dispatch(releaseUseHandlers, event, "Item release-use");
  });
}
