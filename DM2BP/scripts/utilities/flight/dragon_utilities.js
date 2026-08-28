import { world, system, Player } from "@minecraft/server";
import * as dragonArrays from "../../arrays/dragon_arrays.js";
import * as settings from "../../data/settings.js";
import { consumeFlightQuery } from "./flight_budget.js";

export const dragonTypes = { families: ["dragon"] };
const dragonTypeSet = new Set(dragonArrays.dragonTypesList);
const jumpData = new Map();
const flightDebugPlayers = new Map();
const CLEANUP_INTERVAL = 600;
let lastCleanup = 0;

const fallRescueData = new Map();
const elytraRescueTracking = new Map();
const FALL_RESCUE_MIN_FALL_HEIGHT = 2.5;
const FALL_RESCUE_MIN_FALL_TICKS = 4;
const FALL_RESCUE_DELAY_TICKS = 10;
const FALL_RESCUE_SEARCH_RADIUS = 56;
const FALL_RESCUE_MAX_RECENT_TICKS = 120;
const ELYTRA_RESCUE_ARM_TICKS = 120;
const ELYTRA_RESCUE_DELAY_TICKS = 40;
const ELYTRA_ACTIVATION_WINDOW_TICKS = 20;
const LANDING_GLIDE_ANGLE = Math.PI / 3;

const playerLookupCache = {
  tick: -1,
  map: new Map(),
};
const obstacleTargetCache = new WeakMap();
const flightProgressCache = new WeakMap();
const corridorCache = new WeakMap();
const ownerFlightRosterCache = new WeakMap();
const landingTargetCache = new WeakMap();

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  jumpData.delete(playerId);
  flightDebugPlayers.delete(playerId);
  fallRescueData.delete(playerId);
  elytraRescueTracking.delete(playerId);
});

export function toggleFlightDebug(player) {
  if (!player?.isValid) return false;
  if (flightDebugPlayers.has(player.id)) {
    flightDebugPlayers.delete(player.id);
    player.onScreenDisplay.setActionBar({
      rawtext: [{ text: "Flight speed debug: off" }],
    });
    return false;
  }
  flightDebugPlayers.set(player.id, {
    lastTick: system.currentTick,
    speedTotal: 0,
    sampleCount: 0,
  });
  player.onScreenDisplay.setActionBar({
    rawtext: [{ text: "Flight speed debug: on" }],
  });
  return true;
}

export function tickFlightDebug() {
  for (const [playerId, state] of flightDebugPlayers) {
    const player = getPlayerById(playerId);
    if (!player?.isValid) {
      flightDebugPlayers.delete(playerId);
      continue;
    }
    const dragon = player.getComponent("minecraft:riding")?.entityRidingOn;
    if (!dragon?.isValid) {
      state.lastTick = system.currentTick;
      state.speedTotal = 0;
      state.sampleCount = 0;
      continue;
    }
    const velocity = getSafeVelocity(dragon);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z) * 20;
    if (Number.isFinite(horizontalSpeed)) {
      state.speedTotal += horizontalSpeed;
      state.sampleCount++;
    }
    if (system.currentTick - state.lastTick < 20) continue;
    const blocksPerSecond =
      state.sampleCount > 0 ? state.speedTotal / state.sampleCount : 0;
    player.onScreenDisplay.setActionBar({
      rawtext: [
        { text: `Dragon flight speed: ${blocksPerSecond.toFixed(2)} blocks/s` },
      ],
    });
    state.lastTick = system.currentTick;
    state.speedTotal = 0;
    state.sampleCount = 0;
  }
}

export function getPlayerById(playerId) {
  if (!playerId) return null;
  if (playerLookupCache.tick !== system.currentTick) {
    playerLookupCache.tick = system.currentTick;
    playerLookupCache.map.clear();
    for (const player of world.getAllPlayers()) {
      playerLookupCache.map.set(player.id, player);
    }
  }
  return playerLookupCache.map.get(playerId) || null;
}

export function getSafeVelocity(entity) {
  return entity?.getVelocity ? entity.getVelocity() : { x: 0, y: 0, z: 0 };
}

export function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

export function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function blendVelocity(current, desired, amount) {
  return {
    x: current.x + (desired.x - current.x) * amount,
    y: current.y + (desired.y - current.y) * amount,
    z: current.z + (desired.z - current.z) * amount,
  };
}

export function applyFlightMotion(dragon, desiredVelocity, smoothing = 0.35) {
  if (!dragon?.isValid || !desiredVelocity) return;
  const currentVelocity = getSafeVelocity(dragon);
  const amount = Math.max(0.08, Math.min(0.5, smoothing));
  const nextVelocity = blendVelocity(currentVelocity, desiredVelocity, amount);
  try {
    dragon.clearVelocity();
    dragon.applyImpulse(nextVelocity);
  } catch {}
}

function applyMountedFlightMovement(dragon, player) {
  if (!dragon?.isValid || !player?.isValid) return;
  if (dragon.getProperty?.("dragonmounts2:movement_state") !== "flying") return;

  let movement;
  try {
    movement = player.inputInfo?.getMovementVector?.();
  } catch {
    return;
  }
  if (!movement) return;

  const forwardInput = Number(movement.y ?? movement.z ?? 0);
  const strafeInput = Number(movement.x ?? 0);
  if (!Number.isFinite(forwardInput) || !Number.isFinite(strafeInput)) return;
  const magnitude = Math.hypot(forwardInput, strafeInput);

  const view = player.getViewDirection?.();
  if (!view) return;
  const horizontal = Math.hypot(view.x, view.z);
  if (horizontal < 0.01) return;
  const forward = { x: view.x / horizontal, z: view.z / horizontal };
  const right = { x: forward.z, z: -forward.x };
  const speed = 0.6 * settings.getPlayerDragonSpeed(player);
  const hasHorizontalInput = magnitude >= 0.01;
  const direction = hasHorizontalInput
    ? {
        x: (forward.x * forwardInput + right.x * strafeInput) / magnitude,
        z: (forward.z * forwardInput + right.z * strafeInput) / magnitude,
      }
    : { x: 0, z: 0 };
  const verticalInput =
    (player.isJumping ? 1 : 0) - (player.isSneaking ? 1 : 0);
  const verticalSpeed =
    verticalInput * speed * 0.8 +
    (hasHorizontalInput ? view.y * speed * 0.35 : 0);
  const desiredX = direction.x * speed;
  const desiredZ = direction.z * speed;
  applyFlightMotion(
    dragon,
    {
      x: desiredX,
      y: verticalSpeed,
      z: desiredZ,
    },
    0.45,
  );
}

export const V_FLIGHT_MAX_FOLLOWERS = 4;
const V_FLIGHT_BACK_GAP = 11;
const V_FLIGHT_SIDE_GAP = 9;
const V_FLIGHT_PREDICTION_TICKS = 4;
const V_FLIGHT_CRUISE_PAD = 0.08;
const V_FLIGHT_SPEED_MULTIPLIER = 0.76;
const V_FLIGHT_SLOT_SPEED_FACTORS = [0.96, 0.88, 0.94, 0.9];
const V_FLIGHT_CATCHUP_RANGE = 12;
const V_FLIGHT_CATCHUP_BONUS = 8;
const V_FLIGHT_MAX_SPEED = 7;
const V_FLIGHT_ARRIVE_RADIUS = 1.8;
const V_FLIGHT_HOVER_DEADZONE = 0.9;
const V_FLIGHT_RECOVERY_DISTANCE = 96;
const V_FLIGHT_STUCK_TICKS = 40;
const V_FLIGHT_LINE_GAP = 5.5;
const V_FLIGHT_CORRIDOR_WIDTH = 3.5;
const V_FLIGHT_STEERING_SMOOTH_BASE = 0.16;
const V_FLIGHT_STEERING_SMOOTH_CATCHUP = 0.72;
const V_FLIGHT_LEAD_TICKS = 6;
const WORLD_MIN_Y = -64;
const WORLD_MAX_Y = 319;
const WORLD_CEILING_MARGIN = 4;
const WORLD_BORDER_LIMIT = 30000000;

function getSafeBlock(dimension, location) {
  if (!dimension || !location) return null;
  if (!consumeFlightQuery()) return null;
  const { x, y, z } = location;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
    return null;
  if (
    x < -WORLD_BORDER_LIMIT ||
    x > WORLD_BORDER_LIMIT ||
    z < -WORLD_BORDER_LIMIT ||
    z > WORLD_BORDER_LIMIT
  )
    return null;
  if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return null;
  try {
    return dimension.getBlock({
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z),
    });
  } catch {
    return null;
  }
}

export function getOwnerVFlightDragons(dimension, ownerIdentifier) {
  if (!dimension || !ownerIdentifier) return [];
  const dragons = dimension.getEntities({ families: dragonTypes.families });
  return dragons.filter((d) => {
    if (!d?.isValid) return false;
    if (
      d.getDynamicProperty("dragonmounts2:owner_identifier") !== ownerIdentifier
    )
      return false;
    return d.getProperty("dragonmounts2:v_flight_enabled") === true;
  });
}
export function assignFreeVFlightSlot(dimension, ownerIdentifier) {
  if (!dimension || !ownerIdentifier) return -1;
  const occupied = dimension
    .getEntities({ families: dragonTypes.families })
    .filter((d) => {
      if (!d?.isValid) return false;
      if (
        d.getDynamicProperty("dragonmounts2:owner_identifier") !==
        ownerIdentifier
      )
        return false;
      if (
        d.getProperty("dragonmounts2:v_flight_enabled") !== true &&
        d.getDynamicProperty("dragonmounts2:v_flight_reserved") !== true
      )
        return false;
      if (d.getDynamicProperty("dragonmounts2:v_flight_slot") === undefined)
        return false;
      return true;
    });
  if (occupied.length >= V_FLIGHT_MAX_FOLLOWERS) return -1;
  const used = new Set(
    occupied.map((d) => d.getDynamicProperty("dragonmounts2:v_flight_slot")),
  );
  for (let slot = 0; slot < V_FLIGHT_MAX_FOLLOWERS; slot++) {
    if (!used.has(slot)) return slot;
  }
  return -1;
}

function isSolidOrLiquidBlock(block) {
  if (!block) return true;
  if (isLiquidBlock(block)) return true;
  return ![
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air",
  ].includes(block.typeId);
}

function isOpenVFlightWaypoint(dimension, pos) {
  if (!dimension || !pos) return false;
  const checks = [
    { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) },
    { x: Math.floor(pos.x), y: Math.floor(pos.y + 1), z: Math.floor(pos.z) },
    { x: Math.floor(pos.x), y: Math.floor(pos.y + 2), z: Math.floor(pos.z) },
  ];
  for (const chk of checks) {
    const block = getSafeBlock(dimension, chk);
    if (isSolidOrLiquidBlock(block)) return false;
  }
  return true;
}

export function isPathClearForVFlight(dimension, from, to) {
  if (!dimension || !from || !to) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.max(1, distanceBetween(from, to));
  const steps = Math.min(8, Math.max(3, Math.ceil(dist / 1.75)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sample = {
      x: from.x + dx * t,
      y: from.y + dy * t,
      z: from.z + dz * t,
    };
    if (!isOpenVFlightWaypoint(dimension, sample)) return false;
  }
  return true;
}

function trackVFlightProgress(dragon, targetPos) {
  const position = dragon.location;
  const distance = distanceBetween(targetPos, position);
  let state = flightProgressCache.get(dragon);
  if (!state || distanceBetween(state.target, targetPos) > 4) {
    state = {
      target: { ...targetPos },
      position: { ...position },
      distance,
      stalledTicks: 0,
      routeAttempt: 0,
    };
    flightProgressCache.set(dragon, state);
    return state;
  }

  const moved = distanceBetween(position, state.position);
  const improved = state.distance - distance > 0.12;
  if (distance < V_FLIGHT_ARRIVE_RADIUS + 1) {
    state.stalledTicks = 0;
  } else if (improved || moved > 0.35) {
    state.stalledTicks = 0;
    state.routeAttempt = 0;
  } else {
    state.stalledTicks += 5;
  }
  state.position = { ...position };
  state.distance = distance;
  state.target = { ...targetPos };

  if (state.stalledTicks < V_FLIGHT_STUCK_TICKS) return state;
  state.stalledTicks = 0;
  state.routeAttempt = (state.routeAttempt + 1) % 5;
  obstacleTargetCache.delete(dragon);
  return state;
}

function resolveVFlightObstacleTarget(
  dragon,
  controllingDragon,
  targetPos,
  routeAttempt = 0,
) {
  if (!dragon?.isValid || !controllingDragon?.isValid || !targetPos)
    return targetPos;
  const from = dragon.location;
  const dim = dragon.dimension;
  const cached = obstacleTargetCache.get(dragon);
  if (
    routeAttempt === 0 &&
    cached &&
    system.currentTick - cached.tick < 6 &&
    distanceBetween(cached.target, targetPos) < 1.5 &&
    distanceBetween(cached.from, from) < 4
  ) {
    return cached.result;
  }
  if (routeAttempt === 0 && isPathClearForVFlight(dim, from, targetPos)) {
    obstacleTargetCache.set(dragon, {
      tick: system.currentTick,
      from,
      target: targetPos,
      result: targetPos,
    });
    return targetPos;
  }
  const rot = controllingDragon.getRotation();
  const yawRad = (rot.y * Math.PI) / 180;
  const forwardHoriz = { x: -Math.sin(yawRad), z: Math.cos(yawRad) };
  const right = { x: forwardHoriz.z, z: -forwardHoriz.x };
  const candidates = [
    { x: 0, y: 0, z: 0 },
    { x: right.x * 2.4, y: 0, z: right.z * 2.4 },
    { x: -right.x * 2.4, y: 0, z: -right.z * 2.4 },
    { x: right.x * 4.2, y: 0, z: right.z * 4.2 },
    { x: -right.x * 4.2, y: 0, z: -right.z * 4.2 },
    { x: forwardHoriz.x * 2.2, y: 0, z: forwardHoriz.z * 2.2 },
    { x: -forwardHoriz.x * 2.2, y: 0, z: -forwardHoriz.z * 2.2 },
    { x: 0, y: 4, z: 0 },
    { x: 0, y: -4, z: 0 },
    { x: 0, y: 8, z: 0 },
    { x: 0, y: -8, z: 0 },
    { x: right.x * 2.6, y: 3.5, z: right.z * 2.6 },
    { x: -right.x * 2.6, y: 3.5, z: -right.z * 2.6 },
    { x: right.x * 2.6, y: -3.5, z: right.z * 2.6 },
    { x: -right.x * 2.6, y: -3.5, z: -right.z * 2.6 },
    { x: forwardHoriz.x * 2.2, y: 4, z: forwardHoriz.z * 2.2 },
    { x: -forwardHoriz.x * 2.2, y: 4, z: -forwardHoriz.z * 2.2 },
    { x: forwardHoriz.x * 2.2, y: -4, z: forwardHoriz.z * 2.2 },
    { x: -forwardHoriz.x * 2.2, y: -4, z: -forwardHoriz.z * 2.2 },
  ];
  const currentVelocity = getSafeVelocity(dragon);
  const velocityLength = vectorLength(currentVelocity);
  const travelX =
    velocityLength > 0.1 ? currentVelocity.x / velocityLength : forwardHoriz.x;
  const travelY = velocityLength > 0.1 ? currentVelocity.y / velocityLength : 0;
  const travelZ =
    velocityLength > 0.1 ? currentVelocity.z / velocityLength : forwardHoriz.z;
  const routeBiases = [
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: right.x, y: 0, z: right.z },
    { x: -right.x, y: 0, z: -right.z },
  ];
  const routeBias = routeBiases[routeAttempt - 1];
  let bestTarget = targetPos;
  let bestScore = Number.POSITIVE_INFINITY;
  const maxDetourChecks = 8;
  for (const offset of candidates.slice(0, maxDetourChecks)) {
    const candidate = {
      x: targetPos.x + offset.x,
      y: targetPos.y + offset.y,
      z: targetPos.z + offset.z,
    };
    if (!isPathClearForVFlight(dim, from, candidate)) continue;
    const candidateDirection = {
      x: candidate.x - from.x,
      y: candidate.y - from.y,
      z: candidate.z - from.z,
    };
    const candidateLength = Math.max(
      Math.hypot(
        candidateDirection.x,
        candidateDirection.y,
        candidateDirection.z,
      ),
      0.001,
    );
    const turnPenalty =
      1 -
      Math.max(
        0,
        (candidateDirection.x * travelX +
          candidateDirection.y * travelY +
          candidateDirection.z * travelZ) /
          candidateLength,
      );
    const offsetLength = Math.hypot(offset.x, offset.y, offset.z);
    const biasScore = routeBias
      ? (offset.x * routeBias.x +
          offset.y * routeBias.y +
          offset.z * routeBias.z) /
        Math.max(offsetLength, 1)
      : 0;
    const score =
      offsetLength +
      turnPenalty * 2.5 +
      Math.abs(offset.y) * 0.2 -
      biasScore * 3;
    if (score < bestScore) {
      bestScore = score;
      bestTarget = candidate;
    }
  }
  if (bestTarget !== targetPos) {
    obstacleTargetCache.set(dragon, {
      tick: system.currentTick,
      from,
      target: targetPos,
      result: bestTarget,
    });
    return bestTarget;
  }
  const fallback = {
    x: targetPos.x - forwardHoriz.x * 2.8,
    y: targetPos.y,
    z: targetPos.z - forwardHoriz.z * 2.8,
  };
  const result = isPathClearForVFlight(dim, from, fallback)
    ? fallback
    : targetPos;
  obstacleTargetCache.set(dragon, {
    tick: system.currentTick,
    from,
    target: targetPos,
    result,
  });
  return result;
}
function computeVFlightSlotPosition(controllingDragon, slot) {
  const rot = controllingDragon.getRotation();
  const yawRad = (rot.y * Math.PI) / 180;
  const forwardHoriz = { x: -Math.sin(yawRad), z: Math.cos(yawRad) };
  const right = { x: forwardHoriz.z, z: -forwardHoriz.x };

  const wingSign = slot % 2 === 0 ? 1 : -1;
  const echelon = Math.floor(slot / 2) + 1;
  const velocity = getSafeVelocity(controllingDragon);
  const speed = Math.sqrt(
    velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z,
  );
  const leadAdvance = Math.min(speed * V_FLIGHT_PREDICTION_TICKS * 0.15, 6);
  const backDist =
    V_FLIGHT_BACK_GAP * echelon + Math.min(speed * 0.35, 4) * echelon;
  const sideDist =
    V_FLIGHT_SIDE_GAP * echelon + Math.min(speed * 0.18, 3) * echelon;
  const altitudeOffset =
    -0.8 +
    echelon * 0.45 +
    wingSign * 0.2 +
    Math.max(Math.min(velocity.y * 0.4, 0.8), -0.8);

  const leadLoc = controllingDragon.location;
  const predictedLead = {
    x: leadLoc.x + forwardHoriz.x * leadAdvance,
    y:
      leadLoc.y +
      Math.max(Math.min(velocity.y * V_FLIGHT_LEAD_TICKS * 0.08, 2), -2),
    z: leadLoc.z + forwardHoriz.z * leadAdvance,
  };

  return {
    x:
      predictedLead.x -
      forwardHoriz.x * backDist +
      right.x * sideDist * wingSign,
    y: predictedLead.y + altitudeOffset,
    z:
      predictedLead.z -
      forwardHoriz.z * backDist +
      right.z * sideDist * wingSign,
  };
}

function getFlightBasis(entity) {
  const direction = directionFromRotation(entity.getRotation());
  if (!direction) return null;
  const horizontalLength = Math.max(
    Math.hypot(direction.x, direction.z),
    0.001,
  );
  const forward = {
    x: direction.x / horizontalLength,
    y: 0,
    z: direction.z / horizontalLength,
  };
  return {
    forward,
    right: { x: forward.z, z: -forward.x },
  };
}

function isNarrowVFlightCorridor(dragon, dimension, from, to, basis) {
  if (!dimension || !from || !to || !basis) return false;
  const cached = corridorCache.get(dragon);
  if (
    cached &&
    system.currentTick - cached.tick < 6 &&
    distanceBetween(cached.from, from) < 3 &&
    distanceBetween(cached.to, to) < 3
  ) {
    return cached.result;
  }
  let narrowSamples = 0;
  for (const progress of [0.35, 0.55, 0.75]) {
    const center = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      z: from.z + (to.z - from.z) * progress,
    };
    if (!isOpenVFlightWaypoint(dimension, center)) continue;
    const left = {
      x: center.x + basis.right.x * V_FLIGHT_CORRIDOR_WIDTH,
      y: center.y,
      z: center.z + basis.right.z * V_FLIGHT_CORRIDOR_WIDTH,
    };
    const right = {
      x: center.x - basis.right.x * V_FLIGHT_CORRIDOR_WIDTH,
      y: center.y,
      z: center.z - basis.right.z * V_FLIGHT_CORRIDOR_WIDTH,
    };
    if (
      !isOpenVFlightWaypoint(dimension, left) &&
      !isOpenVFlightWaypoint(dimension, right)
    ) {
      narrowSamples++;
    }
  }
  const result = narrowSamples >= 2;
  corridorCache.set(dragon, { tick: system.currentTick, from, to, result });
  return result;
}

function getLinePredecessor(dragon, slot, ownerIdentifier) {
  if (!dragon?.isValid || !ownerIdentifier || slot <= 0) return null;
  let predecessor = null;
  let predecessorSlot = -1;
  for (const candidate of getOwnerFlightRoster(
    dragon.dimension,
    ownerIdentifier,
  )) {
    if (!candidate?.isValid || candidate === dragon) continue;
    if (
      candidate.getDynamicProperty("dragonmounts2:owner_identifier") !==
      ownerIdentifier
    )
      continue;
    if (candidate.getProperty("dragonmounts2:v_flight_enabled") !== true)
      continue;
    const candidateSlot = candidate.getDynamicProperty(
      "dragonmounts2:v_flight_slot",
    );
    if (!Number.isInteger(candidateSlot)) continue;
    if (candidateSlot >= slot || candidateSlot <= predecessorSlot) continue;
    predecessor = candidate;
    predecessorSlot = candidateSlot;
  }
  return predecessor;
}

function getOwnerFlightRoster(dimension, ownerIdentifier) {
  let dimensionCache = ownerFlightRosterCache.get(dimension);
  if (!dimensionCache || dimensionCache.tick !== system.currentTick) {
    dimensionCache = {
      tick: system.currentTick,
      dragons: dimension.getEntities(dragonTypes),
      owners: new Map(),
    };
    ownerFlightRosterCache.set(dimension, dimensionCache);
  }
  if (dimensionCache.owners.has(ownerIdentifier)) {
    return dimensionCache.owners.get(ownerIdentifier);
  }
  const roster = dimensionCache.dragons.filter(
    (candidate) =>
      candidate?.isValid &&
      candidate.getDynamicProperty("dragonmounts2:owner_identifier") ===
        ownerIdentifier,
  );
  dimensionCache.owners.set(ownerIdentifier, roster);
  return roster;
}

function computeVFlightLinePosition(controllingDragon, slot, predecessor) {
  const basis = getFlightBasis(controllingDragon);
  if (!basis) return computeVFlightSlotPosition(controllingDragon, slot);
  const anchor = predecessor?.isValid
    ? predecessor.location
    : controllingDragon.location;
  const gap = predecessor ? V_FLIGHT_LINE_GAP : V_FLIGHT_LINE_GAP * (slot + 1);
  return {
    x: anchor.x - basis.forward.x * gap,
    y: anchor.y + (predecessor ? 0 : 0.5),
    z: anchor.z - basis.forward.z * gap,
  };
}

export function shouldSyncRotation(currentRotation, targetRotation) {
  if (!currentRotation || !targetRotation) return true;
  const yawDelta = Math.abs(
    ((((targetRotation.y - currentRotation.y) % 360) + 540) % 360) - 180,
  );
  const pitchDelta = Math.abs(targetRotation.x - currentRotation.x);
  return yawDelta > 1 || pitchDelta > 2;
}

function isVFlightRelevant(dragon) {
  if (!dragon?.isValid) return false;
  if (dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") === true)
    return true;
  if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true)
    return true;
  if (dragon.getDynamicProperty("dragonmounts2:v_flight_reserved") === true)
    return true;
  if (
    dragon.getDynamicProperty("dragonmounts2:v_flight_manual_disable") === true
  )
    return true;
  if (
    dragon.getDynamicProperty("dragonmounts2:v_flight_disable_blocked") === true
  )
    return true;
  return (
    dragon.getDynamicProperty("dragonmounts2:v_flight_controller_pid") !==
    undefined
  );
}

function isInWater(entity) {
  return entity?.isInWater === true;
}

function isAirborneFlying(dragon) {
  return (
    dragon?.getProperty("dragonmounts2:movement_state") === "flying" &&
    dragon.isOnGround !== true &&
    !isInWater(dragon)
  );
}

function isLiquidBlock(block) {
  if (!block) return false;
  if (block.typeId.includes("water") || block.typeId.includes("lava"))
    return true;
  try {
    return (
      block.permutation?.getState("minecraft:waterlogged") === true ||
      block.permutation?.getState("waterlogged") === true
    );
  } catch {
    return false;
  }
}

function isAirBlock(block) {
  return (
    block?.typeId === "minecraft:air" ||
    block?.typeId === "minecraft:cave_air" ||
    block?.typeId === "minecraft:void_air"
  );
}

function getLiquidClearanceY(dimension, x, y, z) {
  const minimumScanY = Math.max(WORLD_MIN_Y, Math.floor(y) - 48);
  for (let scanY = Math.floor(y) - 1; scanY >= minimumScanY; scanY--) {
    const block = getSafeBlock(dimension, { x, y: scanY, z });
    if (isLiquidBlock(block)) return scanY + 6;
    if (!isAirBlock(block)) return y;
  }
  return y;
}

function findNearbyLandTarget(dragon, radius = 16, maxDepth = 12) {
  if (!dragon?.isValid) return null;
  const dim = dragon.dimension;
  const origin = dragon.location;
  const ox = Math.floor(origin.x);
  const oz = Math.floor(origin.z);
  const oy = Math.floor(origin.y);
  const velocity = getSafeVelocity(dragon);
  const horizSpeed = Math.sqrt(
    velocity.x * velocity.x + velocity.z * velocity.z,
  );
  const dirVelX = horizSpeed > 0.1 ? velocity.x / horizSpeed : 0;
  const dirVelZ = horizSpeed > 0.1 ? velocity.z / horizSpeed : 0;
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ];

  let bestTarget = null;
  let bestDistance = Infinity;
  let bestScore = -Infinity;
  let blockChecks = 0;
  const maxBlockChecks = 350;

  search: for (let step = 0; step <= radius; step += 2) {
    for (const [dx, dz] of offsets) {
      const x = ox + dx * step;
      const z = oz + dz * step;
      for (let dy = -maxDepth; dy <= maxDepth; dy++) {
        if (blockChecks++ >= maxBlockChecks) break search;
        const y = oy + dy;
        if (y > origin.y + 8) continue;
        const block = getSafeBlock(dim, { x, y, z });
        const above = getSafeBlock(dim, { x, y: y + 1, z });
        const above2 = getSafeBlock(dim, { x, y: y + 2, z });
        if (!block || !above || !above2) continue;
        if (isLiquidBlock(block) || !isAirBlock(above) || !isAirBlock(above2))
          continue;

        const horizontalDist = Math.sqrt(
          Math.pow(x + 0.5 - origin.x, 2) + Math.pow(z + 0.5 - origin.z, 2),
        );
        const heightDelta = y - oy;
        const heightScore =
          Math.max(0, heightDelta) * 2 - Math.abs(heightDelta) * 1.3;
        const headingBonus =
          horizSpeed > 0.1 && horizontalDist > 0.1
            ? Math.max(
                0,
                ((x + 0.5 - origin.x) * dirVelX +
                  (z + 0.5 - origin.z) * dirVelZ) /
                  horizontalDist,
              )
            : 0;
        const score =
          heightScore -
          horizontalDist * 2.2 +
          headingBonus * 10 +
          (horizontalDist < 4 ? 10 : 0);

        if (
          horizontalDist < bestDistance - 0.01 ||
          (Math.abs(horizontalDist - bestDistance) <= 0.01 && score > bestScore)
        ) {
          bestDistance = horizontalDist;
          bestScore = score;
          bestTarget = { x: x + 0.5, y: y + 1.5, z: z + 0.5 };
        }
      }
    }
  }
  return bestTarget;
}
export function rotationFromDirection(direction) {
  if (!direction) return null;
  const horiz = Math.sqrt(
    direction.x * direction.x + direction.z * direction.z,
  );
  if (horiz < 0.001) return null;
  const yaw = (-Math.atan2(direction.x, direction.z) * 180) / Math.PI;
  const pitch = (-Math.atan2(direction.y, horiz) * 180) / Math.PI;
  return {
    x: pitch,
    y: ((yaw % 360) + 360) % 360,
    z: 0,
  };
}

function directionFromRotation(rotation) {
  if (!rotation) return null;
  const yaw = (rotation.y * Math.PI) / 180;
  const pitch = (rotation.x * Math.PI) / 180;
  const horizontal = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * horizontal,
    y: -Math.sin(pitch),
    z: Math.cos(yaw) * horizontal,
  };
}

export function applyRotation(dragon, rotation) {
  if (!dragon?.isValid || !rotation) return;
  if (typeof dragon.setRotation === "function") {
    dragon.setRotation(rotation);
    return;
  }
  try {
    dragon.teleport(dragon.location, { dimension: dragon.dimension, rotation });
  } catch {}
}

function recoverDragonToFlightTarget(dragon, target, velocity = null) {
  if (!dragon?.isValid || !target) return false;
  const current = dragon.location;
  const direction = {
    x: target.x - current.x,
    y: target.y - current.y,
    z: target.z - current.z,
  };
  const rotation = rotationFromDirection(direction);
  try {
    const options = { dimension: dragon.dimension };
    if (rotation) options.rotation = rotation;
    dragon.teleport(target, options);
    dragon.clearVelocity();
    const speed = velocity ? Math.min(vectorLength(velocity) + 0.4, 3.5) : 1.2;
    const distance = Math.max(vectorLength(direction), 0.001);
    dragon.applyImpulse({
      x: (direction.x / distance) * speed,
      y: (direction.y / distance) * speed * 0.45,
      z: (direction.z / distance) * speed,
    });
    return true;
  } catch {
    return false;
  }
}
export function saveVFlightPreviousState(dragon) {
  if (!dragon?.isValid) return;
  dragon.setDynamicProperty(
    "dragonmounts2:v_flight_prev_mob_state",
    dragon.getProperty("dragonmounts2:mob_state") || "standing",
  );
  dragon.setDynamicProperty(
    "dragonmounts2:v_flight_prev_is_following",
    dragon.getProperty("dragonmounts2:is_following") === true,
  );
}

const elytraFollowTracking = new WeakMap();

export function activateElytraFollow(dragon, playerId) {
  if (!dragon?.isValid || !playerId) return false;
  if (!isAirborneFlying(dragon)) return false;
  if (dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") === true)
    return false;
  if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true)
    return false;
  if (dragon.getDynamicProperty("dragonmounts2:v_flight_landing") === true)
    return false;
  if (dragon.getDynamicProperty("dragonmounts2:v_flight_reserved") === true)
    return false;

  dragon.setDynamicProperty("dragonmounts2:v_flight_manual_disable", undefined);
  dragon.setDynamicProperty(
    "dragonmounts2:v_flight_disable_blocked",
    undefined,
  );
  dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", undefined);

  const player = getPlayerById(playerId);
  if (
    !player?.isValid ||
    !player.isGliding ||
    player.dimension.id !== dragon.dimension.id
  )
    return false;

  elytraFollowTracking.set(dragon, {
    playerId,
    activatedTick: system.currentTick,
  });

  dragon.setDynamicProperty("dragonmounts2:elytra_follow_active", true);
  dragon.setDynamicProperty("dragonmounts2:elytra_follow_player_id", playerId);
  dragon.setDynamicProperty(
    "dragonmounts2:elytra_prev_mob_state",
    dragon.getProperty("dragonmounts2:mob_state") || "standing",
  );
  dragon.setDynamicProperty(
    "dragonmounts2:elytra_prev_is_following",
    dragon.getProperty("dragonmounts2:is_following") === true,
  );
  dragon.setProperty("dragonmounts2:is_following", false);
  try {
    dragon.triggerEvent("dragonmounts2:on_elytra_follow_enable");
  } catch {}
  dragon.setProperty("dragonmounts2:movement_state", "flying");
  try {
    dragon.triggerEvent("minecraft:on_flying");
  } catch {}
  dragon.clearVelocity();

  return true;
}

export function deactivateElytraFollow(dragon) {
  if (!dragon?.isValid) return false;
  if (dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") !== true)
    return false;

  const dragonId = getPersistentId(dragon);
  const tracking = elytraFollowTracking.get(dragon);
  elytraFollowTracking.delete(dragon);
  if (tracking?.playerId && isAirborneFlying(dragon)) {
    elytraRescueTracking.set(tracking.playerId, {
      dragonPid: dragonId,
      releasedTick: system.currentTick,
    });
  }
  try {
    dragon.triggerEvent("dragonmounts2:on_elytra_follow_disable");
  } catch {}
  dragon.setDynamicProperty("dragonmounts2:elytra_follow_active", undefined);
  dragon.setDynamicProperty("dragonmounts2:elytra_follow_player_id", undefined);
  dragon.clearVelocity();
  const prevMobState = dragon.getDynamicProperty(
    "dragonmounts2:elytra_prev_mob_state",
  );
  const prevIsFollowing =
    dragon.getDynamicProperty("dragonmounts2:elytra_prev_is_following") ===
    true;
  dragon.setDynamicProperty("dragonmounts2:elytra_prev_mob_state", undefined);
  dragon.setDynamicProperty(
    "dragonmounts2:elytra_prev_is_following",
    undefined,
  );
  dragon.setProperty("dragonmounts2:movement_state", "grounded");
  try {
    dragon.triggerEvent("minecraft:on_grounded");
  } catch {}
  dragon.setProperty("dragonmounts2:is_following", prevIsFollowing);
  if (prevMobState === "sitting") {
    dragon.setProperty("dragonmounts2:mob_state", "sitting");
    try {
      dragon.triggerEvent("minecraft:on_sit");
    } catch {}
  }

  return true;
}

function setVFlightController(dragon, controllerDragon) {
  if (!dragon?.isValid) return;
  if (!controllerDragon?.isValid) {
    dragon.setDynamicProperty(
      "dragonmounts2:v_flight_controller_pid",
      undefined,
    );
    return;
  }

  const pid = getPersistentId(controllerDragon);
  if (pid)
    dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", pid);
}

function isGrounded(dragon) {
  if (!dragon?.isValid) return false;
  try {
    const standingOn = dragon.getBlockStandingOn?.();
    if (standingOn)
      return !isLiquidBlock(standingOn) && !isAirBlock(standingOn);
  } catch {}
  const location = dragon.location;
  const support = getSafeBlock(dragon.dimension, {
    x: location.x,
    y: location.y - 1,
    z: location.z,
  });
  return !!support && !isLiquidBlock(support) && !isAirBlock(support);
}

function updateVFlightLanding(dragon) {
  if (!dragon?.isValid) return false;
  if (dragon.getDynamicProperty("dragonmounts2:v_flight_landing") !== true)
    return false;

  if (isGrounded(dragon)) {
    dragon.setDynamicProperty("dragonmounts2:v_flight_landing", undefined);
    dragon.setDynamicProperty(
      "dragonmounts2:v_flight_disable_blocked",
      undefined,
    );
    dragon.setProperty("dragonmounts2:v_flight_enabled", false);
    dragon.clearVelocity();
    dragon.triggerEvent("minecraft:on_grounded");
    dragon.triggerEvent("dragonmounts2:on_vflight_disable");
    restoreVFlightPreviousState(dragon);
    return true;
  }

  const cachedLanding = landingTargetCache.get(dragon);
  let landTarget = cachedLanding?.target ?? null;
  if (!cachedLanding || system.currentTick - cachedLanding.tick >= 20) {
    const searchRadius = cachedLanding
      ? Math.min(cachedLanding.searchRadius * 2, 128)
      : 64;
    landTarget = findNearbyLandTarget(dragon, searchRadius, 40);
    landingTargetCache.set(dragon, {
      tick: system.currentTick,
      target: landTarget,
      searchRadius,
    });
  }

  if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") {
    dragon.triggerEvent("minecraft:on_flying");
  }

  const loc = dragon.location;
  const landingTarget = landTarget
    ? {
        ...landTarget,
        y: Math.min(
          landTarget.y +
            (Math.hypot(landTarget.x - loc.x, landTarget.z - loc.z) > 3
              ? Math.min(
                  18,
                  Math.max(
                    2,
                    Math.hypot(landTarget.x - loc.x, landTarget.z - loc.z) *
                      Math.tan(LANDING_GLIDE_ANGLE),
                  ),
                )
              : Math.max(
                  0.2,
                  Math.hypot(landTarget.x - loc.x, landTarget.z - loc.z) * 0.3,
                )),
          loc.y,
        ),
      }
    : null;
  const target = landingTarget ?? {
    x: loc.x + currentVel.x * 12,
    y: loc.y - 12,
    z: loc.z + currentVel.z * 12,
  };
  const direction = {
    x: target.x - loc.x,
    y: target.y - loc.y,
    z: target.z - loc.z,
  };
  const distance = Math.max(vectorLength(direction), 0.001);
  const landingSpeed = landTarget
    ? Math.min(Math.max(distance * 0.18, 1.2), 3.8)
    : Math.min(Math.max(distance * 0.14, 0.9), 2.8);
  const landingVelocity = {
    x: (direction.x / distance) * landingSpeed,
    y: landTarget
      ? Math.max(Math.min((direction.y / distance) * landingSpeed, 1.4), -1.8)
      : Math.max((direction.y / distance) * landingSpeed, -1.0),
    z: (direction.z / distance) * landingSpeed,
  };
  steerVFlightRotation(dragon, landingVelocity, landTarget ? 0.68 : 0.5);
  applyFlightMotion(dragon, landingVelocity, landTarget ? 0.35 : 0.22);
  return true;
}

export function startVFlight(
  dragon,
  ownerId,
  dimension,
  controllerDragon = null,
) {
  if (!dragon?.isValid) return false;
  if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true)
    return false;
  const slot = assignFreeVFlightSlot(dimension, ownerId);
  if (slot === -1) return false;
  saveVFlightPreviousState(dragon);
  dragon.setDynamicProperty("dragonmounts2:v_flight_slot", slot);
  dragon.setDynamicProperty("dragonmounts2:v_flight_disable_reason", undefined);
  dragon.setDynamicProperty("dragonmounts2:v_flight_manual_disable", undefined);
  dragon.setDynamicProperty("dragonmounts2:v_flight_reserved", true);
  if (controllerDragon?.isValid) setVFlightController(dragon, controllerDragon);
  dragon.triggerEvent("dragonmounts2:on_vflight_enable");
  if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") {
    dragon.triggerEvent("minecraft:on_flying");
  }
  if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") {
    dragon.setProperty("dragonmounts2:movement_state", "flying");
  }
  dragon.clearVelocity();
  return true;
}

function restoreVFlightPreviousState(dragon) {
  if (!dragon?.isValid) return;
  const prevMobState = dragon.getDynamicProperty(
    "dragonmounts2:v_flight_prev_mob_state",
  );
  const prevIsFollowing = dragon.getDynamicProperty(
    "dragonmounts2:v_flight_prev_is_following",
  );

  dragon.setProperty("dragonmounts2:v_flight_enabled", false);
  dragon.setDynamicProperty("dragonmounts2:v_flight_slot", undefined);
  dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", undefined);
  dragon.setDynamicProperty("dragonmounts2:v_flight_activated", undefined);
  dragon.setDynamicProperty("dragonmounts2:v_flight_landing", undefined);
  dragon.setDynamicProperty(
    "dragonmounts2:v_flight_disable_blocked",
    undefined,
  );

  if (prevMobState === "sitting") {
    dragon.triggerEvent("minecraft:on_sit");
  } else if (prevMobState === "standing") {
    dragon.triggerEvent("minecraft:on_stand");
  }

  if (dragon.getProperty("dragonmounts2:movement_state") === "grounded") {
    if (prevIsFollowing) {
      dragon.setProperty("dragonmounts2:is_following", true);
      dragon.triggerEvent("minecraft:on_follow");
    } else {
      dragon.setProperty("dragonmounts2:is_following", false);
      dragon.triggerEvent("minecraft:on_wander");
    }
  } else if (prevIsFollowing) {
    dragon.triggerEvent("minecraft:on_follow");
  } else {
    dragon.triggerEvent("minecraft:on_wander");
  }

  dragon.setDynamicProperty("dragonmounts2:v_flight_prev_mob_state", undefined);
  dragon.setDynamicProperty(
    "dragonmounts2:v_flight_prev_is_following",
    undefined,
  );
  dragon.setDynamicProperty("dragonmounts2:v_flight_reserved", undefined);
}

function requestVFlightLanding(dragon) {
  if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") return;
  dragon.setDynamicProperty("dragonmounts2:v_flight_landing", true);
  updateVFlightLanding(dragon);
}

export function disableVFlight(dragon, reason = null) {
  if (!dragon?.isValid) return;
  if (dragon.getProperty("dragonmounts2:v_flight_enabled") !== true) return;

  if (reason === "manual") {
    dragon.setDynamicProperty("dragonmounts2:v_flight_manual_disable", true);
    dragon.setDynamicProperty(
      "dragonmounts2:v_flight_disable_reason",
      "manual",
    );
  } else {
    dragon.setDynamicProperty(
      "dragonmounts2:v_flight_manual_disable",
      undefined,
    );
    dragon.setDynamicProperty(
      "dragonmounts2:v_flight_disable_reason",
      reason || undefined,
    );
  }

  if (isAirborneFlying(dragon)) {
    dragon.setDynamicProperty("dragonmounts2:v_flight_landing", true);
    dragon.setDynamicProperty("dragonmounts2:v_flight_disable_blocked", true);
    dragon.setDynamicProperty("dragonmounts2:v_flight_slot", undefined);
    dragon.setDynamicProperty(
      "dragonmounts2:v_flight_controller_pid",
      undefined,
    );
    dragon.setDynamicProperty("dragonmounts2:v_flight_activated", undefined);
    dragon.setDynamicProperty("dragonmounts2:v_flight_reserved", undefined);
    return;
  }

  dragon.triggerEvent("dragonmounts2:on_vflight_disable");
  restoreVFlightPreviousState(dragon);
  dragon.setDynamicProperty("dragonmounts2:v_flight_slot", undefined);
  dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", undefined);
  dragon.setDynamicProperty("dragonmounts2:v_flight_activated", undefined);
  dragon.setDynamicProperty("dragonmounts2:v_flight_reserved", undefined);
}

export function normalizeDragonAfterTeleport(dragon) {
  if (!dragon?.isValid) return;
  const wasSitting =
    dragon.getProperty("dragonmounts2:mob_state") === "sitting";
  const wasFollowing =
    dragon.getProperty("dragonmounts2:is_following") === true;

  dragon.setDynamicProperty(
    "dragonmounts2:autonomous_flight_active",
    undefined,
  );
  dragon.setDynamicProperty("dragonmounts2:autonomous_roam_flight", undefined);
  if (dragon.getProperty("dragonmounts2:movement_state") !== "grounded") {
    try {
      dragon.triggerEvent("minecraft:on_grounded");
    } catch {}
    dragon.setProperty("dragonmounts2:movement_state", "grounded");
  }
  dragon.clearVelocity();

  if (wasSitting) {
    try {
      dragon.triggerEvent("minecraft:on_sit");
    } catch {}
    dragon.setProperty("dragonmounts2:mob_state", "sitting");
  } else if (wasFollowing) {
    try {
      dragon.triggerEvent("minecraft:on_follow");
    } catch {}
  }
}

function steerVFlightRotation(dragon, direction, amount = 0.22) {
  const desired = rotationFromDirection(direction);
  const current = dragon.getRotation?.();
  if (!desired || !current) return;
  const yawDelta = ((desired.y - current.y + 540) % 360) - 180;
  const pitchDelta = desired.x - current.x;
  if (Math.abs(yawDelta) < 1 && Math.abs(pitchDelta) < 1) return;
  try {
    dragon.setRotation({
      x: current.x + pitchDelta * amount,
      y: current.y + yawDelta * amount,
      z: 0,
    });
  } catch {}
}

function steerTowardVFlightSlot(
  dragon,
  targetPos,
  controllerSpeed,
  returnHeading = null,
) {
  const loc = dragon.location;
  const dx = targetPos.x - loc.x;
  const dy = targetPos.y - loc.y;
  const dz = targetPos.z - loc.z;
  const targetDirection = { x: dx, y: dy, z: dz };
  const dist = vectorLength(targetDirection);
  const rotationDirection = returnHeading ?? targetDirection;
  const rotationAmount = returnHeading
    ? 0.72
    : Math.min(0.62, 0.34 + dist / 90);
  steerVFlightRotation(dragon, rotationDirection, rotationAmount);

  if (dist > V_FLIGHT_RECOVERY_DISTANCE) {
    recoverDragonToFlightTarget(dragon, targetPos, getSafeVelocity(dragon));
    return;
  }

  if (dist < V_FLIGHT_HOVER_DEADZONE && controllerSpeed < 0.08) {
    dragon.clearVelocity();
    return;
  }

  const slot = dragon.getDynamicProperty("dragonmounts2:v_flight_slot") ?? 0;
  const slotSpeedFactor = V_FLIGHT_SLOT_SPEED_FACTORS[slot] ?? 1.0;
  const ownerId = dragon.getDynamicProperty("dragonmounts2:owner_identifier");
  const ownerSpeed = settings.getPlayerDragonSpeed(getPlayerById(ownerId));
  const baseSpeed =
    controllerSpeed * V_FLIGHT_SPEED_MULTIPLIER * slotSpeedFactor * ownerSpeed +
    V_FLIGHT_CRUISE_PAD;
  const overshoot = Math.max(0, dist - V_FLIGHT_ARRIVE_RADIUS);
  const catchUpBonus =
    Math.min(overshoot / V_FLIGHT_CATCHUP_RANGE, 1) * V_FLIGHT_CATCHUP_BONUS;
  let desiredSpeed = baseSpeed + catchUpBonus;
  if (dist < V_FLIGHT_ARRIVE_RADIUS) {
    desiredSpeed *= Math.max(dist / V_FLIGHT_ARRIVE_RADIUS, 0.18);
  }
  desiredSpeed = Math.min(desiredSpeed, V_FLIGHT_MAX_SPEED);
  if (desiredSpeed <= 0.01 || dist < 0.05) {
    dragon.clearVelocity();
    return;
  }

  const inv = desiredSpeed / dist;
  const desiredVel = { x: dx * inv, y: dy * inv, z: dz * inv };
  steerVFlightRotation(dragon, desiredVel, rotationAmount);

  const smoothT = Math.min(dist / V_FLIGHT_CATCHUP_RANGE, 1);
  const steeringSmooth =
    V_FLIGHT_STEERING_SMOOTH_BASE +
    (V_FLIGHT_STEERING_SMOOTH_CATCHUP - V_FLIGHT_STEERING_SMOOTH_BASE) *
      smoothT;

  applyFlightMotion(dragon, desiredVel, steeringSmooth);
}
export function updateVFlightFollower(dragon) {
  if (!isVFlightRelevant(dragon)) return;
  if (updateVFlightLanding(dragon)) return;
  if (dragon.location.y >= WORLD_MAX_Y - WORLD_CEILING_MARGIN) {
    dragon.setDynamicProperty("dragonmounts2:v_flight_landing", true);
    updateVFlightLanding(dragon);
    return;
  }

  const ownerId = dragon.getDynamicProperty("dragonmounts2:owner_identifier");
  if (!ownerId) {
    requestVFlightLanding(dragon);
    return;
  }

  const owner = getPlayerById(ownerId);
  if (!owner?.isValid || owner.dimension.id !== dragon.dimension.id) {
    requestVFlightLanding(dragon);
    return;
  }

  const mountedDragon = owner.getComponent("minecraft:riding")?.entityRidingOn;
  let controllingDragon = null;

  if (mountedDragon?.isValid) {
    controllingDragon = mountedDragon;
    setVFlightController(dragon, mountedDragon);
  } else {
    const controllerPid = dragon.getDynamicProperty(
      "dragonmounts2:v_flight_controller_pid",
    );
    if (controllerPid) {
      controllingDragon = getDragonByPersistentId(
        dragon.dimension,
        controllerPid,
      );
      if (!controllingDragon?.isValid) {
        dragon.setDynamicProperty(
          "dragonmounts2:v_flight_controller_pid",
          undefined,
        );
        controllingDragon = null;
      }
    }
  }

  if (!controllingDragon) {
    if (dragon.getProperty("dragonmounts2:v_flight_enabled") !== true) return;
    if (dragon.getProperty("dragonmounts2:movement_state") === "flying") {
      dragon.setDynamicProperty("dragonmounts2:v_flight_landing", true);
      updateVFlightLanding(dragon);
    }
    return;
  }

  const controllerFlying =
    controllingDragon.getProperty("dragonmounts2:movement_state") === "flying";
  const isManuallyDisabled =
    dragon.getDynamicProperty("dragonmounts2:v_flight_manual_disable") === true;

  if (!controllerFlying) {
    if (!isManuallyDisabled) requestVFlightLanding(dragon);
    return;
  }

  if (dragon.getProperty("dragonmounts2:v_flight_enabled") !== true) {
    if (isManuallyDisabled) return;
    if (
      dragon.getDynamicProperty("dragonmounts2:v_flight_disable_blocked") !==
      true
    ) {
      startVFlight(dragon, ownerId, dragon.dimension, controllingDragon);
    }
  }

  if (dragon.getProperty("dragonmounts2:v_flight_enabled") !== true) return;

  const movementState = dragon.getProperty("dragonmounts2:movement_state");
  if (movementState !== "flying") {
    dragon.setProperty("dragonmounts2:movement_state", "flying");
  }

  const inWater = isInWater(dragon) || isInWater(controllingDragon);
  if (inWater) {
    disableVFlight(dragon);
    return;
  }

  const controllerVelocity = getSafeVelocity(controllingDragon);
  const controllerSpeed = vectorLength(controllerVelocity);
  const slot = dragon.getDynamicProperty("dragonmounts2:v_flight_slot") ?? 0;
  const formationTarget = computeVFlightSlotPosition(controllingDragon, slot);
  const basis = getFlightBasis(controllingDragon);
  const narrowCorridor = isNarrowVFlightCorridor(
    dragon,
    dragon.dimension,
    dragon.location,
    formationTarget,
    basis,
  );
  const predecessor = narrowCorridor
    ? getLinePredecessor(dragon, slot, ownerId)
    : null;
  const targetPos = narrowCorridor
    ? computeVFlightLinePosition(controllingDragon, slot, predecessor)
    : formationTarget;
  targetPos.y = Math.max(
    targetPos.y,
    getLiquidClearanceY(
      dragon.dimension,
      targetPos.x,
      targetPos.y,
      targetPos.z,
    ),
  );
  const progress = trackVFlightProgress(dragon, targetPos);
  const resolvedTargetPos = resolveVFlightObstacleTarget(
    dragon,
    controllingDragon,
    targetPos,
    progress.routeAttempt,
  );
  const returnHeading =
    resolvedTargetPos === targetPos
      ? directionFromRotation(controllingDragon.getRotation())
      : null;
  steerTowardVFlightSlot(
    dragon,
    resolvedTargetPos,
    controllerSpeed,
    returnHeading,
  );
}

export function updateElytraFollow(dragon) {
  if (!dragon?.isValid) return;
  if (dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") !== true)
    return;
  if (!isAirborneFlying(dragon)) {
    deactivateElytraFollow(dragon);
    return;
  }

  const tracking = elytraFollowTracking.get(dragon);
  if (!tracking) {
    deactivateElytraFollow(dragon);
    return;
  }

  const player = getPlayerById(tracking.playerId);
  if (
    !player?.isValid ||
    !player.isGliding ||
    player.dimension.id !== dragon.dimension.id
  ) {
    deactivateElytraFollow(dragon);
    return;
  }

  if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") {
    dragon.setProperty("dragonmounts2:movement_state", "flying");
  }
  if (dragon.getProperty("dragonmounts2:is_following") === true) {
    dragon.setProperty("dragonmounts2:is_following", false);
  }
  const dragonLoc = dragon.location;
  const playerLoc = player.location;
  const playerVelocity = getSafeVelocity(player);
  const horizontalSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
  const behindX =
    horizontalSpeed > 0.1 ? (-playerVelocity.x / horizontalSpeed) * 5 : 0;
  const behindZ =
    horizontalSpeed > 0.1 ? (-playerVelocity.z / horizontalSpeed) * 5 : 0;
  const targetLoc = {
    x: playerLoc.x + behindX + playerVelocity.x * 3,
    y: playerLoc.y + 2.5,
    z: playerLoc.z + behindZ + playerVelocity.z * 3,
  };
  const dx = targetLoc.x - dragonLoc.x;
  const dy = targetLoc.y - dragonLoc.y;
  const dz = targetLoc.z - dragonLoc.z;
  const dist = vectorLength({ x: dx, y: dy, z: dz });
  if (dist > 100) {
    recoverDragonToFlightTarget(dragon, targetLoc, playerVelocity);
    return;
  }
  if (dist < 2.5) {
    dragon.clearVelocity();
    return;
  }
  const playerSpeed = vectorLength(playerVelocity);
  let desiredSpeed = playerSpeed;
  const overshoot = Math.max(0, dist - 2.0);
  const catchupBonus = Math.min(overshoot / 12, 1) * 4.0;
  desiredSpeed = desiredSpeed + catchupBonus;
  if (dist < 3.5) {
    desiredSpeed *= Math.max(dist / 3.5, 0.1);
  }

  desiredSpeed = Math.min(desiredSpeed, 12);

  if (desiredSpeed <= 0.01 || dist < 0.1) {
    dragon.clearVelocity();
    return;
  }
  const inv = desiredSpeed / dist;
  const desiredVel = { x: dx * inv, y: dy * inv, z: dz * inv };
  const smoothBase = 0.12;
  const smoothCatchup = 0.35;
  const smoothT = Math.min(dist / 20, 1);
  const steeringSmooth = smoothBase + (smoothCatchup - smoothBase) * smoothT;
  applyFlightMotion(dragon, desiredVel, steeringSmooth);
  const currentRotation = dragon.getRotation?.();
  const lookDirection = { x: dx, y: dy, z: dz };
  const desiredRotation = rotationFromDirection(lookDirection);
  if (desiredRotation && shouldSyncRotation(currentRotation, desiredRotation)) {
    applyRotation(dragon, desiredRotation);
  }
}

export function getDragonByPersistentId(dimension, pid) {
  if (!dimension || !pid) return null;
  const entities = dimension.getEntities(dragonTypes);
  for (const entity of entities) {
    if (entity?.isValid && getPersistentId(entity) === pid) return entity;
  }
  return null;
}

function resetPlayerFallRescue(playerId) {
  const data = fallRescueData.get(playerId);
  if (!data) return;
  data.rescueScheduled = false;
  data.rescueDragonPid = undefined;
  fallRescueData.set(playerId, data);
}

function resetPlayerFallTrajectory(player, data) {
  const y = player.location.y;
  data.startTick = system.currentTick;
  data.startY = y;
  data.maxY = y;
  data.lastY = y;
  data.fallStartTick = 0;
  data.fallStartY = y;
  resetPlayerFallRescue(player.id);
}

function markPlayerRodeDragon(player, dragon) {
  if (!player?.isValid || !dragon?.isValid) return;
  const data = getPlayerFallData(player);
  const pid = getPersistentId(dragon);
  data.recentDragonPid = pid;
  data.recentDragonTick = system.currentTick;
  fallRescueData.set(player.id, data);
}

function shouldTrackPlayerFall(player) {
  if (!player?.isValid) return false;
  if (player.isGliding) return false;
  if (player.isInWater) return false;
  if (player.getComponent("minecraft:riding")?.entityRidingOn) return false;
  return !player.isOnGround;
}

function isDragonInAirAbovePlayer(player, dragon) {
  if (!dragon?.isValid || !player?.isValid) return false;
  if (dragon.isOnGround) return false;
  try {
    const dy = dragon.location.y - player.location.y;
    return dy > 1.0;
  } catch {
    return false;
  }
}

function getNearestOwnedRescueDragon(player) {
  if (!player?.isValid) return null;
  const data = getPlayerFallData(player);
  const elytraLease = elytraRescueTracking.get(player.id);
  const leaseActive =
    elytraLease &&
    system.currentTick - elytraLease.releasedTick <= ELYTRA_RESCUE_ARM_TICKS;
  if (elytraLease && !leaseActive) elytraRescueTracking.delete(player.id);
  const dragonPid = leaseActive ? elytraLease.dragonPid : data.recentDragonPid;
  const recent =
    data.recentDragonPid &&
    system.currentTick - data.recentDragonTick <= FALL_RESCUE_MAX_RECENT_TICKS;
  if (!dragonPid || (!leaseActive && !recent)) return null;

  const dragon = getDragonByPersistentId(player.dimension, dragonPid);
  if (!dragon?.isValid) return null;
  if (dragon.getDynamicProperty("dragonmounts2:owner_identifier") !== player.id)
    return null;
  if (!leaseActive && !isDragonInAirAbovePlayer(player, dragon)) return null;
  const rideable = dragon.getComponent("rideable");
  if (!rideable) return null;
  const riders = rideable.getRiders();
  if (riders && riders.length > 0) return null;
  if (dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") === true)
    return null;
  if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true)
    return null;

  const dx = dragon.location.x - player.location.x;
  const dy = dragon.location.y - player.location.y;
  const dz = dragon.location.z - player.location.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq > FALL_RESCUE_SEARCH_RADIUS * FALL_RESCUE_SEARCH_RADIUS)
    return null;

  return dragon;
}

function getPlayerFallData(player) {
  let data = fallRescueData.get(player.id);
  if (!data) {
    data = {
      startTick: system.currentTick,
      startY: player.location.y,
      maxY: player.location.y,
      lastY: player.location.y,
      rescueScheduled: false,
      rescueDragonPid: undefined,
      recentDragonPid: undefined,
      recentDragonTick: 0,
      fallStartTick: 0,
      fallStartY: player.location.y,
    };
    fallRescueData.set(player.id, data);
  }
  return data;
}

function predictPlayerRescuePosition(player, extraTicks = 0) {
  if (!player?.isValid) return null;
  const loc = player.location;
  const velocity = getSafeVelocity(player);
  const ticksAhead = Math.max(4, FALL_RESCUE_DELAY_TICKS + extraTicks);
  return {
    x: loc.x + velocity.x * ticksAhead,
    y: loc.y + velocity.y * ticksAhead,
    z: loc.z + velocity.z * ticksAhead,
  };
}

function requestPlayerRescue(player, dragon) {
  const data = getPlayerFallData(player);
  if (data.rescueScheduled) return;
  const pid = getPersistentId(dragon);
  data.rescueScheduled = true;
  data.rescueDragonPid = pid;
  fallRescueData.set(player.id, data);

  system.runTimeout(() => {
    executePlayerRescue(player.id, pid);
  }, FALL_RESCUE_DELAY_TICKS);
}

function executePlayerRescue(playerId, dragonPid) {
  const player = getPlayerById(playerId);
  const data = fallRescueData.get(playerId);
  if (!player?.isValid || !data || data.rescueDragonPid !== dragonPid) {
    resetPlayerFallRescue(playerId);
    return;
  }
  if (
    player.isOnGround ||
    player.isGliding ||
    player.isInWater ||
    player.getComponent("minecraft:riding")?.entityRidingOn
  ) {
    resetPlayerFallRescue(playerId);
    return;
  }

  const dragon = getDragonByPersistentId(player.dimension, dragonPid);
  if (!dragon?.isValid) {
    resetPlayerFallRescue(playerId);
    return;
  }

  const rideable = dragon.getComponent("rideable");
  if (!rideable || (rideable.getRiders()?.length ?? 0) > 0) {
    resetPlayerFallRescue(playerId);
    return;
  }

  const playerLoc = player.location;
  const predictedTarget = predictPlayerRescuePosition(player, 8) ?? playerLoc;
  const verticalLead = Math.max(
    2.5,
    Math.min(7.5, Math.max(0, playerLoc.y - predictedTarget.y) * 0.5 + 2.5),
  );
  const teleportPos = {
    x: predictedTarget.x,
    y: Math.max(predictedTarget.y + verticalLead, playerLoc.y + 3.0),
    z: predictedTarget.z,
  };
  recoverDragonToFlightTarget(dragon, teleportPos, getSafeVelocity(player));
  if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") {
    dragon.setProperty("dragonmounts2:movement_state", "flying");
  }
  try {
    dragon.triggerEvent("minecraft:on_flying");
  } catch {}
  try {
    dragon.runCommand(`ride @a[name=${player.name}] start_riding @s`);
  } catch {
    player.runCommand(
      `ride @s start_riding @e[type=${dragon.typeId},c=1,sort=nearest]`,
    );
  }

  resetPlayerFallRescue(playerId);
}

export function tickFallRescue() {
  const players = world.getAllPlayers();
  const activePlayerIds = new Set(players.map((player) => player.id));
  for (const player of players) {
    if (!player?.isValid) continue;
    const data = getPlayerFallData(player);
    if (!shouldTrackPlayerFall(player)) {
      if (
        player.isOnGround ||
        player.isGliding ||
        player.isInWater ||
        player.getComponent("minecraft:riding")?.entityRidingOn
      ) {
        elytraRescueTracking.delete(player.id);
      }
      resetPlayerFallTrajectory(player, data);
      fallRescueData.set(player.id, data);
      continue;
    }

    const loc = player.location;
    data.maxY = Math.max(data.maxY, loc.y);
    const velocity = getSafeVelocity(player);
    const falling = velocity.y < -0.1 || loc.y < data.lastY - 0.02;
    const fallHeight = data.maxY - loc.y;
    const elytraLease = elytraRescueTracking.get(player.id);
    const elytraFall =
      elytraLease &&
      system.currentTick - elytraLease.releasedTick <= ELYTRA_RESCUE_ARM_TICKS;
    const requiredFallTicks = elytraFall
      ? ELYTRA_RESCUE_DELAY_TICKS
      : FALL_RESCUE_MIN_FALL_TICKS;
    const shouldRescue =
      falling &&
      (fallHeight >= FALL_RESCUE_MIN_FALL_HEIGHT || velocity.y <= -0.6) &&
      system.currentTick - data.startTick >= requiredFallTicks;
    if (shouldRescue) {
      const healthComp = player.getComponent("minecraft:health");
      const currentHealth = healthComp?.currentValue ?? 20;
      const projectedDamage = Math.max(0, Math.floor(fallHeight - 3));
      if (projectedDamage >= currentHealth) {
        const dragon = getNearestOwnedRescueDragon(player);
        if (dragon) {
          requestPlayerRescue(player, dragon);
        }
      }
    }
    data.lastY = loc.y;
    fallRescueData.set(player.id, data);
  }
  if (system.currentTick % CLEANUP_INTERVAL === 0) {
    for (const playerId of fallRescueData.keys()) {
      if (!activePlayerIds.has(playerId)) fallRescueData.delete(playerId);
    }
    for (const playerId of elytraRescueTracking.keys()) {
      if (!activePlayerIds.has(playerId)) elytraRescueTracking.delete(playerId);
    }
  }
}

export function getPersistentId(entity) {
  if (!entity?.isValid) return null;
  let pid = entity.getDynamicProperty("dragonmounts2:persistent_id");
  if (!pid) {
    pid = `${entity.typeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    entity.setDynamicProperty("dragonmounts2:persistent_id", pid);
  }
  return pid;
}
function shouldProcessDragon(dragon) {
  if (!dragon?.isValid) return false;
  if (dragon.getProperty("dragonmounts2:is_breathing") === true) return true;
  if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true)
    return true;
  if (dragon.getProperty("dragonmounts2:is_following") === true) return true;
  if (
    dragon.getDynamicProperty("dragonmounts2:autonomous_flight_active") === true
  )
    return true;
  if (dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") === true)
    return true;
  const rideable = dragon.getComponent("rideable");
  if (rideable?.getRiders?.().length > 0) return true;
  const lastRiderId = dragon.getDynamicProperty("dragonmounts2:last_rider_id");
  const lastRiddenTick =
    dragon.getDynamicProperty("dragonmounts2:last_ridden_tick") ?? 0;
  if (
    lastRiderId &&
    system.currentTick - lastRiddenTick < ELYTRA_ACTIVATION_WINDOW_TICKS &&
    isAirborneFlying(dragon)
  ) {
    const lastRider = getPlayerById(lastRiderId);
    if (lastRider?.isValid && lastRider.isGliding) return true;
  }
  return true;
}

export function dragonsMainComponents(dragon) {
  if (!dragon?.isValid) return;
  const dragonOnList = dragonTypeSet.has(dragon.typeId);
  if (!dragonOnList) return;
  if (!shouldProcessDragon(dragon)) return;
  const isBreathing = dragon.getProperty("dragonmounts2:is_breathing");
  const rideable = dragon.getComponent("rideable");
  const tameable = dragon.getComponent("minecraft:tameable");

  if (tameable?.isTamed) {
    const ownerName = tameable.tamedToPlayer?.name ?? "Unknown";
    const ownerIdentifier = tameable.tamedToPlayerId ?? "";
    if (dragon.getDynamicProperty("dragonmounts2:owner_name") !== ownerName) {
      dragon.setDynamicProperty("dragonmounts2:owner_name", ownerName);
    }
    if (
      dragon.getDynamicProperty("dragonmounts2:owner_identifier") !==
      ownerIdentifier
    ) {
      dragon.setDynamicProperty(
        "dragonmounts2:owner_identifier",
        ownerIdentifier,
      );
    }
  } else {
    if (dragon.getDynamicProperty("dragonmounts2:owner_name") !== undefined) {
      dragon.setDynamicProperty("dragonmounts2:owner_name", undefined);
    }
    if (
      dragon.getDynamicProperty("dragonmounts2:owner_identifier") !== undefined
    ) {
      dragon.setDynamicProperty("dragonmounts2:owner_identifier", undefined);
    }
  }
  if (!rideable) return;
  const riders = rideable.getRiders();
  if (!riders || riders.length === 0) {
    if (isBreathing) dragon.setProperty("dragonmounts2:is_breathing", false);
    if (
      dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") === true
    ) {
      updateElytraFollow(dragon);
      return;
    }
    const lastRiderId = dragon.getDynamicProperty(
      "dragonmounts2:last_rider_id",
    );
    const lastRiddenTick =
      dragon.getDynamicProperty("dragonmounts2:last_ridden_tick") || 0;
    const now = system.currentTick;

    if (lastRiderId && now - lastRiddenTick < ELYTRA_ACTIVATION_WINDOW_TICKS) {
      const player = getPlayerById(lastRiderId);
      if (
        player?.isValid &&
        player.dimension.id === dragon.dimension.id &&
        player.isGliding &&
        isAirborneFlying(dragon)
      ) {
        if (activateElytraFollow(dragon, player.id)) {
          updateElytraFollow(dragon);
          return;
        }
      }
    }
    updateVFlightFollower(dragon);
    return;
  }

  const controllingSeat = rideable.controllingSeat;
  const controllingRider = riders[controllingSeat];
  if (!controllingRider || !(controllingRider instanceof Player)) return;
  if (
    dragon.getDynamicProperty("dragonmounts2:last_rider_id") !==
    controllingRider.id
  ) {
    dragon.setDynamicProperty(
      "dragonmounts2:last_rider_id",
      controllingRider.id,
    );
  }
  dragon.setDynamicProperty(
    "dragonmounts2:last_ridden_tick",
    system.currentTick,
  );
  markPlayerRodeDragon(controllingRider, dragon);

  handleDragonJumpInput(dragon, controllingRider, isBreathing);
  applyMountedFlightMovement(dragon, controllingRider);
  cleanupOldJumpData();
}

function cleanupOldJumpData() {
  const now = system.currentTick;
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [id, data] of jumpData.entries()) {
    if (now - data.lastJumpTick > CLEANUP_INTERVAL * 2) {
      jumpData.delete(id);
    }
  }
}

function handleDragonJumpInput(dragon, player, isBreathing) {
  const id = player.id;
  const currentTick = system.currentTick;
  let data = jumpData.get(id);
  if (!data) {
    data = {
      wasJumping: false,
      holdTime: 0,
      lastJumpTick: -1000,
      pendingSingle: false,
    };
  }
  const isJumping = player.isJumping;
  const doubleTapWindow = 10;
  const holdThreshold = 5;

  if (isJumping && !data.wasJumping) {
    const timeSinceLastJump = currentTick - data.lastJumpTick;
    if (timeSinceLastJump < doubleTapWindow) {
      const ownerId = dragon.getDynamicProperty(
        "dragonmounts2:owner_identifier",
      );
      const isOwner = ownerId === player.id;
      if (
        isOwner &&
        dragon.getProperty("dragonmounts2:v_flight_enabled") !== true
      ) {
        startVFlight(dragon, ownerId, dragon.dimension);
      }
      data.pendingSingle = false;
    } else {
      data.pendingSingle = true;
    }
    data.lastJumpTick = currentTick;
  }

  if (isJumping) {
    data.holdTime++;
    if (data.holdTime === holdThreshold) {
      data.pendingSingle = false;
      if (!isBreathing) dragon.setProperty("dragonmounts2:is_breathing", true);
    }
    if (data.holdTime > holdThreshold) {
      if (!isBreathing) dragon.setProperty("dragonmounts2:is_breathing", true);
    }
  } else {
    if (isBreathing) dragon.setProperty("dragonmounts2:is_breathing", false);
    data.holdTime = 0;
  }

  if (
    data.pendingSingle &&
    currentTick - data.lastJumpTick > holdThreshold &&
    currentTick - data.lastJumpTick > doubleTapWindow
  ) {
    data.pendingSingle = false;
  }
  data.wasJumping = isJumping;
  jumpData.set(id, data);
}
