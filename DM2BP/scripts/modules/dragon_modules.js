import { system } from "@minecraft/server";
import * as dragonUtilities from "../utilities/dragon_utilities.js";
import { getAddonDimensions, runSafely } from "../lib/runtime.js";
import { registerIntervalTask } from "../core/scheduler.js";

const reportedFlightErrors = new WeakMap();
const activeDragons = new Set();

function reportFlightError(dragon, error) {
  const message = error instanceof Error ? error.message : String(error);
  const now = system.currentTick;
  const last = reportedFlightErrors.get(dragon);
                                                                            
                                                                             
  if (last && last.message === message && now - last.tick < 200) return;
  reportedFlightErrors.set(dragon, { message, tick: now });
  const stack = error instanceof Error ? error.stack : null;
  console.warn(
    `[DragonMounts2] Flight update failed for ${dragon.typeId}: ${message}${stack ? `\n${stack}` : ""}`,
  );
}

registerIntervalTask("dragon-discovery", 10, () => {
  for (const dimension of getAddonDimensions()) {
    runSafely("Dragon flight dimension update failed", () => {
      const entities = dimension.getEntities(dragonUtilities.dragonTypes);
      for (const dragon of entities) {
        if (dragon?.isValid) activeDragons.add(dragon);
      }
    });
  }
});

registerIntervalTask("dragon-flight", 1, () => {
  runSafely("Dragon fall tracking failed", () => dragonUtilities.tickFallRescue());
  for (const dragon of activeDragons) {
    if (!dragon?.isValid) {
      dragonUtilities.DragonFlightController.cleanupRiderAttackProxy(dragon);
      activeDragons.delete(dragon);
      continue;
    }
    try {
      dragonUtilities.tickDragon(dragon);
    } catch (error) {
      reportFlightError(dragon, error);
    }
  }
  runSafely("Dragon flight support update failed", () => {
    dragonUtilities.tickFlightDebug();
  });
});

                                                                        
                                                                              
registerIntervalTask("dragon-attack-proxy-sweep", 60, () => {
  runSafely("Dragon attack proxy sweep failed", () => {
    dragonUtilities.sweepOrphanedAttackProxies();
  });
});
