import { world } from "@minecraft/server";

const beforeEntityHurtHandlers = [];
const afterEntityHurtHandlers = [];
let initialized = false;

export function onBeforeEntityHurt(handler) {
  beforeEntityHurtHandlers.push(handler);
}

export function onAfterEntityHurt(handler) {
  afterEntityHurtHandlers.push(handler);
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

export function initializeCombatEvents() {
  if (initialized) return;
  initialized = true;

  world.beforeEvents.entityHurt.subscribe((event) => {
    dispatch(beforeEntityHurtHandlers, event, "Before entity hurt");
  });

  world.afterEvents.entityHurt.subscribe((event) => {
    dispatch(afterEntityHurtHandlers, event, "After entity hurt");
  });
}
