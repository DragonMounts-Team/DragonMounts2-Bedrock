import { Player, world } from "@minecraft/server";

const spawnHandlers = [];
const leaveHandlers = [];
let initialized = false;

export function onPlayerSpawn(handler) {
  spawnHandlers.push(handler);
}

export function onPlayerLeave(handler) {
  leaveHandlers.push(handler);
}

function runHandlers(handlers, event, label) {
  for (const handler of handlers) {
    try {
      handler(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] ${label} handler failed: ${message}`);
    }
  }
}

export function initializePlayerLifecycle() {
  if (initialized) return;
  initialized = true;

  world.afterEvents.playerSpawn.subscribe((event) => {
    if (!(event.player instanceof Player) || !event.player.isValid) return;
    runHandlers(spawnHandlers, event, "Player spawn");
  });

  world.afterEvents.playerLeave.subscribe((event) => {
    if (!event.playerId) return;
    runHandlers(leaveHandlers, event, "Player leave");
  });
}
