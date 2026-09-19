import { world } from "@minecraft/server";

const registrations = [];
let initialized = false;

export function onWorldEvent(phase, eventName, handler) {
  registrations.push({ phase, eventName, handler });
}

export function initializeWorldEvents() {
  if (initialized) return;
  initialized = true;

  for (const { phase, eventName, handler } of registrations) {
    const eventSignal = world[phase]?.[eventName];
    if (!eventSignal?.subscribe) {
      console.warn(`[DragonMounts2] Unsupported world event: ${phase}.${eventName}`);
      continue;
    }
    eventSignal.subscribe((event) => {
      try {
        handler(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[DragonMounts2] ${eventName} handler failed: ${message}`);
      }
    });
  }
}
