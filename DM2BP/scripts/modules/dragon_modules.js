import { world, system } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";
import * as dragonUtilities from "../utilities/dragon_utilities.js";

const reportedFlightErrors = new WeakMap();
let lastDimensionErrorTick = -Infinity;
let lastSupportErrorTick = -Infinity;

function reportFlightError(dragon, error) {
  const message = error instanceof Error ? error.message : String(error);
  if (reportedFlightErrors.get(dragon) === message) return;
  reportedFlightErrors.set(dragon, message);
  console.warn(`[DragonMounts2] Flight update failed for ${dragon.typeId}: ${message}`);
}

system.runInterval(() => {
  for (const dim of defaultWorldArrays.addonDimensions) {
    try {
      const dimension = world.getDimension(dim);
      const entities = dimension.getEntities(dragonUtilities.dragonTypes);
      for (const dragon of entities) {
        if (!dragon?.isValid) continue;
        try {
          dragonUtilities.tickDragon(dragon);
        } catch (error) {
          reportFlightError(dragon, error);
        }
      }
    } catch (error) {
      if (system.currentTick - lastDimensionErrorTick >= 100) {
        lastDimensionErrorTick = system.currentTick;
        console.warn(`[DragonMounts2] Dragon flight dimension update failed: ${error}`);
      }
    }
  }
  try {
    dragonUtilities.tickFallRescue();
    dragonUtilities.tickFlightDebug();
  } catch (error) {
    if (system.currentTick - lastSupportErrorTick >= 100) {
      lastSupportErrorTick = system.currentTick;
      console.warn(`[DragonMounts2] Dragon flight support update failed: ${error}`);
    }
  }
}, 1);
