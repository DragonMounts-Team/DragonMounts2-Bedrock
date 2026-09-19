import { system } from "@minecraft/server";

const handlers = [];
let initialized = false;

export function onScriptEvent(handler) {
  handlers.push(handler);
}

export function initializeScriptEvents() {
  if (initialized) return;
  initialized = true;

  system.afterEvents.scriptEventReceive.subscribe((event) => {
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[DragonMounts2] Script event handler failed: ${message}`);
      }
    }
  });
}
