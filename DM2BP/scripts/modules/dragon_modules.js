import * as dragonUtilities from "../utilities/dragon_utilities.js";
import { getAddonDimensions, runSafely } from "../lib/runtime.js";
import { registerIntervalTask } from "../core/scheduler.js";

const reportedFlightErrors = new WeakMap();
const activeDragons = new Set();

function reportFlightError(dragon, error) {
  const message = error instanceof Error ? error.message : String(error);
  if (reportedFlightErrors.get(dragon) === message) return;
  reportedFlightErrors.set(dragon, message);
  console.warn(`[DragonMounts2] Flight update failed for ${dragon.typeId}: ${message}`);
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
  for (const dragon of activeDragons) {
    if (!dragon?.isValid) {
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
    dragonUtilities.tickFallRescue();
    dragonUtilities.tickFlightDebug();
  });
});
