import { system } from "@minecraft/server";
import { dragonTypeIds } from "../data/entity_data.js";
import { getAddonDimensions } from "../lib/runtime.js";

const BEAM_TYPE = "dragonmounts2:crystal_beam";
const PROP_LENGTH = "dragonmounts2:beam_length";
const PROP_YAW = "dragonmounts2:beam_yaw";
const PROP_PITCH = "dragonmounts2:beam_pitch";

// Where the beam leaves the crystal and where it lands on the dragon,
// measured up from each entity's location.
const CRYSTAL_CORE_HEIGHT = 1.2;

// A beam nobody has refreshed for this many ticks belongs to no dragon.
const STALE_TICKS = 10;
const FORGET_TICKS = 1200;
// Beyond this the dragon is out of crystal range anyway (32 blocks plus offsets).
const MAX_LENGTH = 40;
const TARGET_STALE_TICKS = 40;
const AIM_SMOOTHING = 0.35;
const AIM_EPSILON = 0.005;
const RAD_TO_DEG = 180 / Math.PI;

// beam entity id -> last tick a dragon updated it
const liveBeams = new Map();
const crystalTargets = new Map();
const vanillaDragonCache = new Map();
let vanillaDragonCacheTick = -1;

function safe(action, fallback = undefined) {
  try {
    return action();
  } catch {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function angleDifference(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function signedAngleDifference(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function normalizeAngle(angle) {
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

function smoothValue(current, target) {
  const difference = target - current;
  return Math.abs(difference) <= AIM_EPSILON
    ? target
    : current + difference * AIM_SMOOTHING;
}

function smoothAngle(current, target) {
  const difference = signedAngleDifference(current, target);
  return Math.abs(difference) <= AIM_EPSILON
    ? target
    : normalizeAngle(current + difference * AIM_SMOOTHING);
}

// The aim animation assumes the beam entity itself faces yaw 0 / pitch 0; any
// body rotation on the entity would be added on top of beam_yaw on the client.
function lockBeamRotation(beam) {
  const rotation = safe(() => beam.getRotation(), null);
  if (!rotation || Math.abs(rotation.x) > 0.01 || Math.abs(rotation.y) > 0.01) {
    safe(() => beam.setRotation({ x: 0, y: 0 }));
  }
}

function spawnBeam(dragon, position) {
  const beam = safe(() => dragon.dimension.spawnEntity(BEAM_TYPE, position));
  if (beam) lockBeamRotation(beam);
  return beam;
}

function needsHealing(dragon) {
  const health = safe(() => dragon.getComponent("minecraft:health"), null);
  const current = Number(health?.currentValue);
  const maximum = Number(health?.effectiveMax ?? health?.defaultValue);
  return Number.isFinite(current) && Number.isFinite(maximum) && current < maximum;
}

function hasLivingVanillaEnderDragon(dimension, crystal) {
  if (vanillaDragonCacheTick !== system.currentTick) {
    vanillaDragonCache.clear();
    vanillaDragonCacheTick = system.currentTick;
  }

  const cacheKey = `${dimension.id}:${crystal.id}`;
  if (vanillaDragonCache.has(cacheKey)) return vanillaDragonCache.get(cacheKey);

  const exists = safe(
    () => dimension.getEntities({
      type: "minecraft:ender_dragon",
      location: crystal.location,
      maxDistance: 32,
    })
      .some((dragon) => {
        if (!dragon?.isValid) return false;
        const health = safe(() => dragon.getComponent("minecraft:health"), null);
        return Number(health?.currentValue) > 0;
      }),
    false,
  );
  vanillaDragonCache.set(cacheKey, exists);
  return exists;
}

export function claimCrystalTarget(crystal, dragon, state, dragonNeedsHealing) {
  if (!crystal?.isValid || !dragon?.isValid || !dragonTypeIds.has(dragon.typeId)) {
    return false;
  }

  const current = crystalTargets.get(crystal.id);
  if (current && current.dragon !== dragon) {
    const currentIsValid =
      current.dragon?.isValid &&
      current.state?.crystal?.id === crystal.id &&
      system.currentTick - current.lastUpdate <= TARGET_STALE_TICKS;
    if (currentIsValid && (!dragonNeedsHealing || needsHealing(current.dragon))) {
      return false;
    }

    if (current.state) {
      current.state.crystalTicks = 0;
      removeCrystalBeam(current.state);
    }
  }

  crystalTargets.set(crystal.id, {
    dragon,
    state,
    lastUpdate: system.currentTick,
  });
  return true;
}

export function releaseCrystalTarget(crystal, dragon) {
  if (crystal && crystalTargets.get(crystal.id)?.dragon === dragon) {
    crystalTargets.delete(crystal.id);
  }
}

/**
 * Keeps one beam entity running from the dragon's linked crystal to the
 * dragon. The beam entity never rotates itself: its direction and length are
 * entity properties that the resource pack animation turns into bone rotation
 * and scale, so every dragon linked to a crystal gets its own beam.
 */
export function updateCrystalBeam(dragon, state) {
  if (!dragonTypeIds.has(dragon?.typeId)) {
    removeCrystalBeam(state);
    return;
  }

  const crystal = state.crystal;
  if (!dragon?.isValid || !crystal?.isValid) {
    removeCrystalBeam(state);
    return;
  }
  if (hasLivingVanillaEnderDragon(dragon.dimension, crystal)) {
    removeCrystalBeam(state);
    return;
  }

  const start = {
    x: crystal.location.x,
    y: crystal.location.y + CRYSTAL_CORE_HEIGHT,
    z: crystal.location.z,
  };
  const target = dragon.getHeadLocation();
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const dz = target.z - start.z;
  const length = Math.hypot(dx, dy, dz);

  let beam = state.beam;
  if (!beam?.isValid || beam.dimension.id !== dragon.dimension.id) {
    removeCrystalBeam(state);
    beam = spawnBeam(dragon, start);
    if (!beam) return;
    state.beam = beam;
    state.beamAim = null;
  } else {
    const location = beam.location;
    if (Math.hypot(location.x - start.x, location.y - start.y, location.z - start.z) > 0.05) {
      safe(() => beam.teleport(start));
    }
    lockBeamRotation(beam);
  }
  liveBeams.set(beam.id, system.currentTick);

  const aim = {
    length: clamp(length, 0, MAX_LENGTH),
    // Same convention as Minecraft entity yaw (and the rest of this pack):
    // 0 = +Z (south), +90 = -X (west). The -dz in the old formula mirrored the
    // beam on the north/south axis, so it only lined up when the dragon was
    // exactly east or west of the crystal.
    yaw: length > 0.01 ? Math.atan2(-dx, dz) * RAD_TO_DEG : 0,
    pitch: length > 0.01
      ? clamp(-Math.asin(dy / length) * RAD_TO_DEG, -90, 90)
      : 0,
  };
  const firstAim = state.beamAim === null;
  const current = state.beamAim ?? aim;
  const next = {
    length: smoothValue(current.length, aim.length),
    yaw: smoothAngle(current.yaw, aim.yaw),
    pitch: smoothValue(current.pitch, aim.pitch),
  };
  if (
    firstAim ||
    Math.abs(current.length - next.length) > AIM_EPSILON ||
    angleDifference(current.yaw, next.yaw) > AIM_EPSILON ||
    Math.abs(current.pitch - next.pitch) > AIM_EPSILON
  ) {
    safe(() => beam.setProperty(PROP_LENGTH, next.length));
    safe(() => beam.setProperty(PROP_YAW, next.yaw));
    safe(() => beam.setProperty(PROP_PITCH, next.pitch));
  }
  state.beamAim = next;
}

export function removeCrystalBeam(state) {
  const beam = state?.beam;
  if (beam) {
    liveBeams.delete(beam.id);
    if (beam.isValid) safe(() => beam.remove());
  }
  if (state) {
    state.beam = null;
    state.beamAim = null;
  }
}

/**
 * Removes beams that no dragon is refreshing any more: the dragon died or
 * unloaded, the crystal broke, or the script reloaded and lost its tracking.
 */
export function sweepOrphanedCrystalBeams() {
  const now = system.currentTick;
  for (const [crystalId, target] of crystalTargets) {
    const targetIsStale =
      !target.dragon?.isValid ||
      now - target.lastUpdate > TARGET_STALE_TICKS ||
      target.state?.crystal?.id !== crystalId;
    if (!targetIsStale) continue;

    if (target.state?.crystal?.id === crystalId) {
      target.state.crystalTicks = 0;
      removeCrystalBeam(target.state);
    }
    crystalTargets.delete(crystalId);
  }

  for (const dimension of getAddonDimensions()) {
    const beams = safe(() => dimension.getEntities({ type: BEAM_TYPE }), []);
    for (const beam of beams) {
      const lastUpdate = liveBeams.get(beam.id);
      if (lastUpdate === undefined || now - lastUpdate > STALE_TICKS) {
        liveBeams.delete(beam.id);
        safe(() => beam.remove());
      }
    }
  }
  for (const [id, tick] of liveBeams) {
    if (now - tick > FORGET_TICKS) liveBeams.delete(id);
  }
}
