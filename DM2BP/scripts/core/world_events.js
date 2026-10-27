import { world } from "@minecraft/server";

const registrations = [];
let initialized = false;

function subscribeRegistration({ phase, eventName, handler }) {
  const eventSignal = world[phase]?.[eventName];
  if (!eventSignal?.subscribe) {
    console.warn(`[DragonMounts2] Unsupported world event: ${phase}.${eventName}`);
    return;
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

export function onWorldEvent(phase, eventName, handler) {
  const registration = { phase, eventName, handler };
  registrations.push(registration);
  // Registered after startup? Subscribe now instead of silently dropping it.
  if (initialized) subscribeRegistration(registration);
}

export function initializeWorldEvents() {
  if (initialized) return;
  initialized = true;
  for (const registration of registrations) subscribeRegistration(registration);
}
