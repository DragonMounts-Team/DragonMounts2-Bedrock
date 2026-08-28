import { world } from "@minecraft/server";

export function getAllDimensions() {
  return world.getDimensions();
}

export function getDimensionById(dimensionId) {
  try {
    return world.getDimension(dimensionId);
  } catch {
    return null;
  }
}
