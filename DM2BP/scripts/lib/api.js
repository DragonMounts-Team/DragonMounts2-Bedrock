// DragonMounts2 Lib: the stable, read-only surface other addons build on.
// In-pack code imports this directly; other addons use lib/bridge.js
// (script events) because Bedrock addons cannot import each other's code.
import { world } from "@minecraft/server";
import { dragonTypeIds } from "../data/entity_data.js";
import { getAddonDimensions } from "./runtime.js";
import { getDragonNameTag, getDragonTypeToken, getDragonDisplayName } from "./dragon_names.js";

export const LIB_VERSION = 1;
export const LIB_NAMESPACE = "dragonmounts2";

export function isDragon(entity) {
  try {
    return entity?.isValid === true && dragonTypeIds.has(entity.typeId);
  } catch {
    return false;
  }
}

function safe(fn, fallback) {
  try {
    const value = fn();
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

const PEAK_KEY = "dragonmounts2:hud_peak_health";

export function getDragonHealth(dragon) {
  const health = safe(() => dragon.getComponent("minecraft:health"), undefined);
  const current = Math.max(0, safe(() => health.currentValue, 0));
  // Per-dragon maximum, so every dragon uses its own health (180, 300, ...).
  // effectiveMax can wrongly report 20 when an entity JSON sets "value" without
  // "max", so also use the configured health and the highest health this dragon
  // has been seen with (saved on the dragon). The largest wins; never below current.
  let peak = safe(() => dragon.getDynamicProperty(PEAK_KEY), 0);
  peak = typeof peak === "number" ? peak : 0;
  if (current > peak) {
    peak = current;
    safe(() => dragon.setDynamicProperty(PEAK_KEY, current), undefined);
  }
  const max = Math.max(safe(() => health.effectiveMax, 0), safe(() => health.defaultValue, 0), peak, current);
  let percent = 100;
  if (max > 0) {
    percent = Math.round((current / max) * 100);
    percent = current > 0 ? Math.max(1, Math.min(100, percent)) : 0;
  }
  return { current, max, percent };
}

/** Plain-data snapshot of a dragon (JSON-safe). Returns undefined for non-dragons. */
export function getDragonInfo(dragon) {
  if (!isDragon(dragon)) return undefined;
  const tameable = safe(() => dragon.getComponent("minecraft:tameable"), undefined);
  const health = getDragonHealth(dragon);
  const nameTag = getDragonNameTag(dragon);
  return {
    id: dragon.id,
    typeId: dragon.typeId,
    type: getDragonTypeToken(dragon.typeId),
    nameTag,
    hasNameTag: nameTag !== "",
    displayName: getDragonDisplayName(dragon),
    health,
    tamed: safe(() => tameable.isTamed === true, false),
    ownerId:
      safe(() => tameable.tamedToPlayerId, "") ||
      safe(() => dragon.getDynamicProperty("dragonmounts2:owner_identifier"), "") ||
      "",
    ownerName: safe(() => dragon.getDynamicProperty("dragonmounts2:owner_name"), "") || "",
    dimension: safe(() => dragon.dimension.id, ""),
    location: safe(() => {
      const { x, y, z } = dragon.location;
      return { x, y, z };
    }, undefined),
  };
}

/** All loaded dragons, optionally filtered by owner id. */
export function listDragons({ ownerId } = {}) {
  const result = [];
  for (const dimension of getAddonDimensions()) {
    const dragons = safe(() => dimension.getEntities({ families: ["dragon"] }), []);
    for (const dragon of dragons) {
      const info = getDragonInfo(dragon);
      if (!info) continue;
      if (ownerId && info.ownerId !== ownerId) continue;
      result.push(info);
    }
  }
  return result;
}

export function getDragonById(entityId) {
  if (typeof entityId !== "string" || !entityId) return undefined;
  const entity = safe(() => world.getEntity(entityId), undefined);
  return isDragon(entity) ? entity : undefined;
}
