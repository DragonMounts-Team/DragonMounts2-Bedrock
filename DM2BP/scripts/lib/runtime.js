import { system, world } from "@minecraft/server";
import { addonDimensions } from "../arrays/default_world_arrays.js";

const dimensionCache = new Map();
const reportedErrors = new Map();

export function getAddonDimensions() {
  const dimensions = [];

  for (const dimensionId of addonDimensions) {
    let dimension = dimensionCache.get(dimensionId);
    if (!dimension) {
      try {
        dimension = world.getDimension(dimensionId);
        dimensionCache.set(dimensionId, dimension);
      } catch {
        continue;
      }
    }
    dimensions.push(dimension);
  }

  return dimensions;
}

export function runSafely(label, callback, interval = 100) {
  try {
    return callback();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const currentTick = system.currentTick;
    const lastReportedTick = reportedErrors.get(label) ?? -Infinity;
    if (currentTick - lastReportedTick >= interval) {
      reportedErrors.set(label, currentTick);
      console.warn(`[DragonMounts2] ${label}: ${message}`);
    }
    return undefined;
  }
}
