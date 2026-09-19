import { Player, system, world } from "@minecraft/server";
import * as settings from "../data/settings.js";
import * as entityData from "../data/entity_data.js";
import {
  distanceBetween,
  getPersistentId,
  getSafeVelocity,
} from "./entity_utilities.js";

export const dragonTypes = entityData.dragonTypes;
const DRAGON_TYPES = entityData.dragonTypeIds;
const PLAYER_CACHE = { tick: -1, players: new Map() };
const JUMP_STATE = new Map();
const DEBUG_PLAYERS = new Map();
const FALL_RESCUE_STATE = new Map();
const DRAGON_RUNTIME = new WeakMap();
const FLIGHT_MODE_PROPERTY = "dragonmounts2:flight_mode";
let lastMemoryCleanupTick = -Infinity;
const {
  BREAK_IN_TRUST_PROPERTY,
  BREAK_IN_RIDES_TO_TAME,
  BREAK_IN_SUCCESS_TICKS,
  BREAK_IN_MIN_TICKS,
  BREAK_IN_MAX_TICKS,
  BREAK_IN_BANKED_RIDES_PROPERTY,
  DRAGON_MEMORY_MOB,
  DRAGON_MEMORY_FOLLOWING,
  DRAGON_MEMORY_VALID,
  BREAK_IN_SWEEP_RADIUS,
  BREAK_IN_SWEEP_HEIGHT,
  BREAK_IN_SWEEP_SPEED,
  BREAK_IN_SWEEP_RATE,
  BREAK_IN_SWEEP_Z_RATE,
  LIFTOFF_AIRBORNE_TICKS,
  FLIGHT_MODES,
  MODE_PRIORITY,
  DragonActivity,
} = entityData;

const DragonMemoryStore = {
  rot(memoryMap, maxAge = 600) {
    if (!memoryMap || typeof memoryMap !== "object") return;
    const currentTick = system.currentTick;
    for (const [key, state] of memoryMap.entries()) {
      const lastTick = state?.lastTick ?? state?.tick ?? currentTick;
      if (currentTick - lastTick > maxAge) {
        memoryMap.delete(key);
      }
    }
  },
  remember(memoryMap, key, value = {}) {
    if (!memoryMap || typeof memoryMap !== "object") return value;
    const entry = memoryMap.get(key) ?? {};
    const next = { ...entry, ...value, lastTick: system.currentTick };
    memoryMap.set(key, next);
    return next;
  },
  clear(memoryMap, key) {
    if (!memoryMap || typeof memoryMap !== "object") return;
    memoryMap.delete(key);
  },
  has(memoryMap, key) {
    return !!memoryMap?.has?.(key);
  },
};

function safeExecute(callback) {
  try {
    return callback();
  } catch {
    return undefined;
  }
}

function refreshPlayerCache() {
  const currentTick = system.currentTick;
  if (PLAYER_CACHE.tick === currentTick) return;
  PLAYER_CACHE.tick = currentTick;
  PLAYER_CACHE.players.clear();
  for (const player of world.getAllPlayers()) {
    PLAYER_CACHE.players.set(player.id, player);
  }
}

function getPlayerById(playerId) {
  if (!playerId) return null;
  refreshPlayerCache();
  return PLAYER_CACHE.players.get(playerId) ?? null;
}

function readProperty(entity, propertyName, fallback = undefined) {
  return safeExecute(() => entity.getProperty(propertyName)) ?? fallback;
}

function writeProperty(entity, propertyName, value) {
  safeExecute(() => entity.setProperty(propertyName, value));
}

function readDynamicProperty(entity, propertyName, fallback = undefined) {
  return safeExecute(() => entity.getDynamicProperty(propertyName)) ?? fallback;
}

function writeDynamicProperty(entity, propertyName, value) {
  safeExecute(() => entity.setDynamicProperty(propertyName, value));
}

function isElytraFollowActive(dragon) {
  return readProperty(dragon, "dragonmounts2:elytra_follow_enabled") === true ||
    readDynamicProperty(dragon, "dragonmounts2:elytra_follow_active") === true;
}

function setElytraFollowActive(dragon, active) {
  writeProperty(dragon, "dragonmounts2:elytra_follow_enabled", active === true);
  writeDynamicProperty(dragon, "dragonmounts2:elytra_follow_active", active === true ? true : undefined);
}

export function isBreakInTrusted(dragon) {
  return readDynamicProperty(dragon, BREAK_IN_TRUST_PROPERTY, false) === true;
}

export function setBreakInTrusted(dragon, state) {
  if (!dragon?.isValid) return false;
  writeDynamicProperty(dragon, BREAK_IN_TRUST_PROPERTY, state === true);
  return true;
}

function canUseAdvancedFlight(dragon) {
  const tameable = dragon?.getComponent("minecraft:tameable");
  return tameable?.isTamed === true && isBreakInTrusted(dragon);
}

function getRuntimeState(dragon) {
  if (!dragon?.isValid) return null;
  let state = DRAGON_RUNTIME.get(dragon);
  if (!state) {
    state = {
      lastOwnerDistance: Infinity,
      lastFlightTick: 0,
      followActive: false,
      followLanding: false,
      lastFlightTarget: null,
      breakInRiderId: null,
      breakInRideTicks: 0,
      breakInBuckThreshold: 0,
      breakInBankedRides: Number(readDynamicProperty(dragon, BREAK_IN_BANKED_RIDES_PROPERTY, 0)) || 0,
      breakInAnchor: null,
      breakInPhaseOffset: 0,
      lastBreakInParticleTick: -Infinity,
      autonomousAnchor: null,
      autonomousLandingAnchor: null,
      autonomousTarget: null,
      autonomousTargetTick: 0,
      autonomousPhaseOffset: Math.random() * Math.PI * 2,
      autonomousLanding: false,
      autonomousLandingComplete: false,
      autonomousLandingStartTick: 0,
      autonomousLandingDueTick: 0,
      airborneTicks: 0,
      autonomousLandingHistory: [],
      autonomousSearchPhase: Math.random() * Math.PI * 2,
      autonomousSearchCycleStartTick: 0,
      autonomousSearchRising: false,
      lastReconciledMode: null,
      lastReconciledMobState: null,
    };
    DRAGON_RUNTIME.set(dragon, state);
  }
  return state;
}

function persistBreakInProgress(dragon, state) {
  writeDynamicProperty(dragon, BREAK_IN_BANKED_RIDES_PROPERTY, state.breakInBankedRides);
}

function isDragonSaddled(dragon) {
  return safeExecute(() => dragon.hasComponent("minecraft:is_saddled")) === true;
}

function rememberDragonState(dragon) {
  if (!dragon?.isValid || readDynamicProperty(dragon, DRAGON_MEMORY_VALID, false) === true) return;
  writeDynamicProperty(dragon, DRAGON_MEMORY_MOB, readProperty(dragon, "dragonmounts2:mob_state", "standing"));
  writeDynamicProperty(dragon, DRAGON_MEMORY_FOLLOWING, readProperty(dragon, "dragonmounts2:is_following", false) === true);
  writeDynamicProperty(dragon, DRAGON_MEMORY_VALID, true);
}

function restoreDragonState(dragon) {
  if (!dragon?.isValid || readDynamicProperty(dragon, DRAGON_MEMORY_VALID, false) !== true) return false;
  const mob = readDynamicProperty(dragon, DRAGON_MEMORY_MOB, "standing");
  const following = readDynamicProperty(dragon, DRAGON_MEMORY_FOLLOWING, false) === true;
  writeDynamicProperty(dragon, DRAGON_MEMORY_VALID, undefined);
  writeDynamicProperty(dragon, DRAGON_MEMORY_MOB, undefined);
  writeDynamicProperty(dragon, DRAGON_MEMORY_FOLLOWING, undefined);

  transitionMovementState(dragon, "grounded", true);
  syncFollowState(dragon, following, true);
  syncMobState(dragon, "standing", true);
  if (mob === "sitting") {
    const restoreSitting = (attempts = 0) => {
      if (!dragon?.isValid) return;
      if (dragon.isOnGround) {
        syncMobState(dragon, "sitting", true);
        return;
      }
      if (attempts < 40) system.runTimeout(() => restoreSitting(attempts + 1), 1);
    };
    system.runTimeout(() => restoreSitting(), 1);
  }
  return true;
}

function stopAdvancedFlight(dragon) {
  const state = getRuntimeState(dragon);
  if (state) {
    state.autonomousLanding = false;
    state.autonomousTarget = null;
    state.autonomousLandingComplete = false;
    state.autonomousLandingStartTick = 0;
    state.autonomousLandingDueTick = 0;
    state.autonomousLandingAnchor = null;
    state.autonomousSearchCycleStartTick = 0;
    state.autonomousSearchRising = false;
  }
  writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_requested", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active", undefined);
  setElytraFollowActive(dragon, false);
  writeDynamicProperty(dragon, "dragonmounts2:elytra_follow_player_id", undefined);
  if (readProperty(dragon, "dragonmounts2:v_flight_enabled") === true) {
    disableVFlight(dragon, "restricted");
  }
  restoreDragonState(dragon);
  if (readProperty(dragon, "dragonmounts2:movement_state") === "flying") transitionMovementState(dragon, "grounded", true);
  requestModeActivation(dragon, FLIGHT_MODES.GROUNDED, { force: true });
}

function requestAutonomousFlight(dragon, landing = true) {
  if (!dragon?.isValid) return;
  const state = getRuntimeState(dragon);
  if (!state.autonomousAnchor) state.autonomousAnchor = { ...dragon.location };
  writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_requested", true);
  writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active", true);
  state.autonomousLanding = false;
  state.autonomousLandingComplete = false;
  state.autonomousLandingStartTick = system.currentTick;
  state.autonomousLandingAnchor = landing ? { ...dragon.location } : null;
  if (landing) state.autonomousPhaseOffset = Math.random() * Math.PI * 2;
  state.autonomousLandingDueTick = landing ? system.currentTick + 80 : 0;
  state.autonomousTarget = null;
  state.autonomousSearchCycleStartTick = system.currentTick;
  state.autonomousSearchRising = false;
}

function handoffToAutonomousFlight(dragon) {
  if (!dragon?.isValid) return;
  setElytraFollowActive(dragon, false);
  writeDynamicProperty(dragon, "dragonmounts2:elytra_follow_player_id", undefined);
  writeProperty(dragon, "dragonmounts2:v_flight_enabled", false);
  clearRuntimeFlightState(dragon);
  requestAutonomousFlight(dragon);
}

function isChunkLoaded(dimension, location) {
  return safeExecute(() => dimension?.isChunkLoaded?.(location) === true) === true;
}

function getAutonomousGroundTarget(dragon, state) {
  const anchor = state?.autonomousLandingAnchor ?? state?.autonomousAnchor;
  if (!dragon?.isValid || !anchor) return null;
  const history = state.autonomousLandingHistory;
  const candidates = [{ angle: 0, radius: 0 }];
  for (const radius of [2, 4, 8, 14, 24, 40, 64, 96, 120]) {
    for (let side = 0; side < 4; side++) {
      candidates.push({ angle: side * Math.PI / 2 + Math.random() * 0.35, radius });
    }
  }
  for (let attempt = candidates.length; attempt < 128; attempt++) {
    candidates.push({ angle: Math.random() * Math.PI * 2, radius: 8 + Math.random() * 120 });
  }
  for (const candidate of candidates) {
    const angle = candidate.angle;
    const radius = candidate.radius;
    const searchLocation = {
      x: anchor.x + Math.cos(angle) * radius,
      y: anchor.y,
      z: anchor.z + Math.sin(angle) * radius,
    };
    if (!isChunkLoaded(dragon.dimension, searchLocation)) continue;
    const block = safeExecute(() => dragon.dimension.getTopmostBlock({
      x: searchLocation.x,
      z: searchLocation.z,
    }, -64));
    if (!block?.location || block.isAir || block.isLiquid) continue;
    if (!isChunkLoaded(dragon.dimension, block.location)) continue;
    const above = safeExecute(() => dragon.dimension.getBlock({
      x: block.location.x,
      y: block.location.y + 1,
      z: block.location.z,
    }));
    if (!above?.isAir && !above?.isLiquid) continue;
    const target = {
      x: block.location.x + 0.5,
      y: block.location.y + 1.2,
      z: block.location.z + 0.5,
    };
    if (radius > 8 && history.some((location) => distanceBetween(location, target) < 8)) continue;
    history.push(target);
    if (history.length > 8) history.shift();
    return target;
  }
  return null;
}

function resetBreakInRide(state) {
  state.breakInRiderId = null;
  state.breakInRideTicks = 0;
  state.breakInBuckThreshold = 0;
  state.breakInAnchor = null;
  state.breakInPhaseOffset = 0;
}

function startBreakInRide(state, rider, dragon) {
  state.breakInRiderId = rider.id;
  state.breakInRideTicks = 0;
  state.breakInBuckThreshold = BREAK_IN_MIN_TICKS + Math.floor(Math.random() * (BREAK_IN_MAX_TICKS - BREAK_IN_MIN_TICKS));
  state.breakInAnchor = { ...dragon.location };
  state.breakInPhaseOffset = Math.random() * Math.PI * 2;
}

function buckBreakInRider(dragon, rider, state) {
  safeExecute(() => dragon.getComponent("rideable")?.ejectRiders());
  safeExecute(() => rider.applyImpulse({ x: 0, y: 0.3, z: 0 }));
  requestAutonomousFlight(dragon);
  resetBreakInRide(state);
  persistBreakInProgress(dragon, state);
}

function completeBreakIn(dragon, rider, state) {
  const tameable = dragon.getComponent("minecraft:tameable");
  safeExecute(() => tameable?.tame(rider));
  setBreakInTrusted(dragon, true);
  safeExecute(() => dragon.triggerEvent("minecraft:on_tame"));
  state.breakInBankedRides = 0;
  resetBreakInRide(state);
  persistBreakInProgress(dragon, state);
}

function updateBreakInRide(dragon, rider, state) {
  if (isBreakInTrusted(dragon) || !rider?.isValid) {
    resetBreakInRide(state);
    persistBreakInProgress(dragon, state);
    return false;
  }
  if (state.breakInRiderId !== rider.id) startBreakInRide(state, rider, dragon);

  state.breakInRideTicks += 1;
  if (state.breakInRideTicks < state.breakInBuckThreshold) {
    if (system.currentTick - state.lastBreakInParticleTick >= 10) {
      safeExecute(() => dragon.dimension.spawnParticle("minecraft:basic_smoke_particle", dragon.location));
      state.lastBreakInParticleTick = system.currentTick;
    }
    transitionMovementState(dragon, "flying", true);
    const anchor = state.breakInAnchor ?? dragon.location;
    const phase = system.currentTick * BREAK_IN_SWEEP_RATE + state.breakInPhaseOffset;
    flyTowardTarget(
      dragon,
      {
        x: anchor.x + Math.sin(phase) * BREAK_IN_SWEEP_RADIUS,
        y: anchor.y + BREAK_IN_SWEEP_HEIGHT + Math.sin(phase * 0.5) * 2,
        z: anchor.z + Math.cos(phase * BREAK_IN_SWEEP_Z_RATE) * BREAK_IN_SWEEP_RADIUS,
      },
      BREAK_IN_SWEEP_SPEED,
      0.55,
    );
    return true;
  }

  if (state.breakInRideTicks >= BREAK_IN_SUCCESS_TICKS) {
    state.breakInBankedRides = Math.min(BREAK_IN_RIDES_TO_TAME, state.breakInBankedRides + 1);
  }
  if (state.breakInBankedRides >= BREAK_IN_RIDES_TO_TAME) {
    completeBreakIn(dragon, rider, state);
    return false;
  }
  buckBreakInRider(dragon, rider, state);
  transitionMovementState(dragon, "grounded", true);
  return true;
}

function cleanupMemory() {
  const currentTick = system.currentTick;
  if (currentTick - lastMemoryCleanupTick < 20) return;
  lastMemoryCleanupTick = currentTick;
  for (const [playerId, value] of DEBUG_PLAYERS.entries()) {
    const player = getPlayerById(playerId);
    if (!player?.isValid || currentTick - (value.lastTick ?? 0) > 600) {
      DEBUG_PLAYERS.delete(playerId);
    }
  }
  for (const [playerId, value] of FALL_RESCUE_STATE.entries()) {
    const player = getPlayerById(playerId);
    if (!player?.isValid || currentTick - (value.lastTick ?? 0) > 600) {
      FALL_RESCUE_STATE.delete(playerId);
    }
  }
  DragonMemoryStore.rot(DEBUG_PLAYERS, 600);
  DragonMemoryStore.rot(FALL_RESCUE_STATE, 600);
}

export function vectorLength(vector) {
  if (!vector) return 0;
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function rotationFromDirection(direction) {
  if (!direction) return null;
  const horizontal = Math.hypot(direction.x, direction.z);
  if (horizontal < 0.001) return null;
  const yaw = (-Math.atan2(direction.x, direction.z) * 180) / Math.PI;
  const pitch = (-Math.atan2(direction.y, horizontal) * 180) / Math.PI;
  return { x: pitch, y: ((yaw % 360) + 360) % 360, z: 0 };
}

export function shouldSyncRotation(currentRotation, targetRotation) {
  if (!currentRotation || !targetRotation) return true;
  const yawDelta = Math.abs((((targetRotation.y - currentRotation.y) % 360) + 540) % 360 - 180);
  const pitchDelta = Math.abs(targetRotation.x - currentRotation.x);
  return yawDelta > 1 || pitchDelta > 2;
}

export function applyRotation(dragon, rotation) {
  if (!dragon?.isValid || !rotation) return;
  safeExecute(() => dragon.setRotation(rotation));
}

function blendVelocity(current, desired, amount) {
  return {
    x: current.x + (desired.x - current.x) * amount,
    y: current.y + (desired.y - current.y) * amount,
    z: current.z + (desired.z - current.z) * amount,
  };
}

function applyFlightMotion(dragon, desiredVelocity, smoothing = 0.35) {
  if (!dragon?.isValid || !desiredVelocity) return;
  const current = getSafeVelocity(dragon);
  const next = blendVelocity(current, desiredVelocity, Math.max(0.08, Math.min(0.6, smoothing)));
  const impulse = {
    x: next.x - current.x,
    y: next.y - current.y,
    z: next.z - current.z,
  };
  safeExecute(() => {
    dragon.applyImpulse(impulse);
  });
  const horizontalSpeed = Math.hypot(next.x, next.z);
  if (horizontalSpeed > 0.05) {
    applyRotation(dragon, rotationFromDirection({ x: next.x, y: next.y, z: next.z }));
  }
}

function resetTakeoffState(dragon) {
  if (!dragon?.isValid) return;
  writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_requested", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_start_tick", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:flight_airborne_ticks", 0);
}

function canBeginFlying(dragon) {
  if (!dragon?.isValid) return false;
  if (dragon.isDead === true || dragon.isInWater === true) {
    resetTakeoffState(dragon);
    return false;
  }
  if (readProperty(dragon, "dragonmounts2:movement_state") === "flying") return true;
  if (readDynamicProperty(dragon, "dragonmounts2:flight_takeoff_requested") === true) {
    const airborneTicks = Number(readDynamicProperty(dragon, "dragonmounts2:flight_airborne_ticks", 0)) || 0;
    return !dragon.isOnGround && airborneTicks >= LIFTOFF_AIRBORNE_TICKS;
  }
  if (dragon.isOnGround === true) {
    resetTakeoffState(dragon);
    return false;
  }
  writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_start_tick", system.currentTick);
  writeDynamicProperty(dragon, "dragonmounts2:flight_airborne_ticks", 1);
  return true;
}

export function transitionMovementState(dragon, nextState, force = false) {
  if (!dragon?.isValid || !nextState) return false;
  const currentState = readProperty(dragon, "dragonmounts2:movement_state");
  if (currentState === nextState && !force) return false;

  if (nextState === "flying") {
    if (!force && !canBeginFlying(dragon)) return false;
    writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_requested", undefined);
  } else {
    resetTakeoffState(dragon);
  }

  safeExecute(() => {
    if (nextState === "flying") dragon.triggerEvent("minecraft:on_flying");
    else if (nextState === "swimming") dragon.triggerEvent("minecraft:on_swimming");
    else dragon.triggerEvent("minecraft:on_grounded");
  });

  writeProperty(dragon, "dragonmounts2:movement_state", nextState);
  return true;
}

function syncMobState(dragon, nextState, force = false) {
  if (!dragon?.isValid || !nextState) return false;
  const currentState = readProperty(dragon, "dragonmounts2:mob_state") ?? "standing";
  if (currentState === nextState && !force) return false;
  safeExecute(() => {
    if (nextState === "sitting") dragon.triggerEvent("minecraft:on_sit");
    else if (nextState === "standing") dragon.triggerEvent("minecraft:on_stand");
    else if (nextState === "wandering") dragon.triggerEvent("minecraft:on_wander");
  });
  writeProperty(dragon, "dragonmounts2:mob_state", nextState);
  return true;
}

function syncFollowState(dragon, shouldFollow, force = false) {
  if (!dragon?.isValid) return false;
  const currentState = readProperty(dragon, "dragonmounts2:is_following") === true;
  if (currentState === shouldFollow && !force) return false;
  writeProperty(dragon, "dragonmounts2:is_following", shouldFollow);
  safeExecute(() => {
    if (shouldFollow) dragon.triggerEvent("minecraft:on_follow");
    else if (readProperty(dragon, "dragonmounts2:mob_state") === "sitting") dragon.triggerEvent("minecraft:on_sit");
    else dragon.triggerEvent("minecraft:on_stand");
  });
  return true;
}

function getPlayerOwner(dragon) {
  const ownerId = readDynamicProperty(dragon, "dragonmounts2:owner_identifier");
  return getPlayerById(ownerId);
}

function requestModeActivation(dragon, nextMode, options = {}) {
  if (!dragon?.isValid || !nextMode) return false;
  if (nextMode !== FLIGHT_MODES.GROUNDED) rememberDragonState(dragon);
  const currentMode = resolveActiveMode(dragon, {
    riderPresent: !!dragon.getComponent("rideable")?.getRiders?.()?.length,
  });
  const currentPriority = MODE_PRIORITY[currentMode] ?? 0;
  const nextPriority = MODE_PRIORITY[nextMode] ?? 0;

  if (nextMode !== FLIGHT_MODES.GROUNDED && nextPriority < currentPriority && !options.force) {
    return false;
  }

  if (nextMode === FLIGHT_MODES.GROUNDED) {
    if (readProperty(dragon, "dragonmounts2:v_flight_enabled") === true) disableVFlight(dragon, "mode_switch");
    setElytraFollowActive(dragon, false);
    writeDynamicProperty(dragon, "dragonmounts2:elytra_follow_player_id", undefined);
    writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active", undefined);
    if (!restoreDragonState(dragon) && readProperty(dragon, "dragonmounts2:movement_state") === "flying") {
      transitionMovementState(dragon, "grounded", true);
    }
      writeDynamicProperty(dragon, FLIGHT_MODE_PROPERTY, FLIGHT_MODES.GROUNDED);
    return true;
  }

  if (currentMode === FLIGHT_MODES.V_FLIGHT && nextMode !== FLIGHT_MODES.V_FLIGHT) disableVFlight(dragon, "mode_switch");
  if (currentMode === FLIGHT_MODES.ELYTRA_FOLLOW && nextMode !== FLIGHT_MODES.ELYTRA_FOLLOW) {
    setElytraFollowActive(dragon, false);
    writeDynamicProperty(dragon, "dragonmounts2:elytra_follow_player_id", undefined);
  }
  if (currentMode === FLIGHT_MODES.AUTONOMOUS && nextMode !== FLIGHT_MODES.AUTONOMOUS) {
    writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active", undefined);
  }

  writeDynamicProperty(dragon, FLIGHT_MODE_PROPERTY, nextMode);
  return true;
}

function resolveActiveMode(dragon, context = {}) {
  if (!dragon?.isValid) return FLIGHT_MODES.GROUNDED;

  if (context.riderPresent === true) return FLIGHT_MODES.RIDER;
  if (readProperty(dragon, "dragonmounts2:v_flight_enabled") === true) return FLIGHT_MODES.V_FLIGHT;
  if (isElytraFollowActive(dragon)) return FLIGHT_MODES.ELYTRA_FOLLOW;
  if (readDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active") === true) return FLIGHT_MODES.AUTONOMOUS;
  const rememberedMode = readDynamicProperty(dragon, FLIGHT_MODE_PROPERTY);
  if (rememberedMode === FLIGHT_MODES.RIDER || rememberedMode === FLIGHT_MODES.GROUNDED) return rememberedMode;
  return FLIGHT_MODES.GROUNDED;
}

function getActiveFlightMode(dragon, context = {}) {
  return resolveActiveMode(dragon, context);
}

function getDragonActivity(dragon) {
  if (!dragon?.isValid) return DragonActivity.IDLE;
  const riders = dragon.getComponent("rideable")?.getRiders?.() ?? [];
  if (readProperty(dragon, "dragonmounts2:is_sleeping") === true) return DragonActivity.SLEEPING;
  if (riders.length > 0) return DragonActivity.CONTROLLED;
  if (readProperty(dragon, "dragonmounts2:movement_state") === "swimming") return DragonActivity.SWIMMING;
  if (readProperty(dragon, "dragonmounts2:v_flight_enabled") === true || isElytraFollowActive(dragon) || readDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active") === true) return DragonActivity.FIGHT;
  return DragonActivity.IDLE;
}

function updateSleepingState(dragon) {
  if (!dragon?.isValid) return;
  const rideable = dragon.getComponent("rideable");
  const riders = rideable?.getRiders?.() ?? [];
  const isSleeping = readProperty(dragon, "dragonmounts2:is_sleeping") === true;
  const tameable = dragon.getComponent("minecraft:tameable");
  const canSleep =
    (tameable?.isTamed !== true || readProperty(dragon, "dragonmounts2:mob_state") === "sitting") &&
    readProperty(dragon, "dragonmounts2:movement_state") === "grounded" &&
    riders.length === 0 &&
    !isElytraFollowActive(dragon) &&
    readProperty(dragon, "dragonmounts2:v_flight_enabled") !== true;

  if (isSleeping) {
    if (riders.length > 0 || !canSleep || Math.random() < 1 / 1200) {
      writeProperty(dragon, "dragonmounts2:is_sleeping", false);
      safeExecute(() => dragon.triggerEvent("dragonmounts2:on_wake"));
    }
    return;
  }

  if (canSleep && Math.random() < 1 / 1200) {
    writeProperty(dragon, "dragonmounts2:is_sleeping", true);
    safeExecute(() => {
      dragon.triggerEvent("dragonmounts2:on_sleep");
      dragon.clearVelocity();
    });
  }
}

function wakeDragon(dragon) {
  if (!dragon?.isValid) return;
  if (readProperty(dragon, "dragonmounts2:is_sleeping") !== true) return;
  writeProperty(dragon, "dragonmounts2:is_sleeping", false);
  safeExecute(() => dragon.triggerEvent("dragonmounts2:on_wake"));
}

function flyTowardTarget(dragon, target, speedScalar, liftMultiplier = 0.8) {
  if (!dragon?.isValid || !target) return;
  target = avoidFlightObstacle(dragon, target);
  const direction = {
    x: target.x - dragon.location.x,
    y: target.y - dragon.location.y,
    z: target.z - dragon.location.z,
  };
  const length = Math.max(vectorLength(direction), 0.001);
  applyFlightMotion(dragon, {
    x: (direction.x / length) * speedScalar,
    y: (direction.y / length) * speedScalar * liftMultiplier,
    z: (direction.z / length) * speedScalar,
  }, 0.4);
}

function avoidFlightObstacle(dragon, target) {
  if (!dragon?.isValid || !target) return target;
  const direction = {
    x: target.x - dragon.location.x,
    y: target.y - dragon.location.y,
    z: target.z - dragon.location.z,
  };
  const horizontalLength = Math.max(Math.hypot(direction.x, direction.z), 0.001);
  const forward = { x: direction.x / horizontalLength, z: direction.z / horizontalLength };
  const right = { x: forward.z, z: -forward.x };
  let blocked = false;

  for (const distance of [1.5, 3, 5]) {
    const sample = safeExecute(() => dragon.dimension.getBlock({
      x: Math.floor(dragon.location.x + forward.x * distance),
      y: Math.floor(dragon.location.y + direction.y * (distance / Math.max(horizontalLength, distance))),
      z: Math.floor(dragon.location.z + forward.z * distance),
    }));
    if (sample && !sample.isAir && !sample.isLiquid) {
      blocked = true;
      break;
    }
  }

  if (!blocked) return target;

  const side = system.currentTick % 2 === 0 ? 1 : -1;
  return {
    x: target.x + right.x * 3.5 * side,
    y: Math.max(target.y, dragon.location.y + 3.5),
    z: target.z + right.z * 3.5 * side,
  };
}

function getNaturalOwnerFlightTarget(dragon, owner) {
  if (!dragon?.isValid || !owner?.isValid) return null;
  const distance = distanceBetween(owner.location, dragon.location);
  const velocity = getSafeVelocity(owner);
  const velocityLength = vectorLength(velocity);
  const look = safeExecute(() => owner.getViewDirection?.()) ?? { x: 0, y: 0, z: 1 };
  const lead = Math.min(8, Math.max(2, distance * 0.35));
  const direction = velocityLength > 0.08 ? velocity : look;
  const directionLength = Math.max(vectorLength(direction), 0.001);
  const drift = distance > 9 ? 0.8 : 0.25;
  return {
    x: owner.location.x + (direction.x / directionLength) * lead + Math.cos(system.currentTick / 14) * drift,
    y: owner.location.y + 2.4 + (direction.y / directionLength) * Math.min(3, lead * 0.35) + Math.sin(system.currentTick / 18) * 0.7,
    z: owner.location.z + (direction.z / directionLength) * lead + Math.sin(system.currentTick / 14) * drift,
  };
}

function getEntityByPersistentId(dimension, persistentId) {
  if (!dimension || !persistentId) return null;
  return dimension.getEntities(dragonTypes).find((entity) =>
    entity?.isValid && getPersistentId(entity) === persistentId,
  ) ?? null;
}

function getDirectionalFollowTarget(dragon, entity, lead = 5, height = 2) {
  if (!dragon?.isValid || !entity?.isValid) return null;
  const velocity = getSafeVelocity(entity);
  const look = safeExecute(() => entity.getViewDirection?.()) ?? { x: 0, y: 0, z: 1 };
  const direction = vectorLength(velocity) > 0.08 ? velocity : look;
  const length = Math.max(vectorLength(direction), 0.001);
  return {
    x: entity.location.x + (direction.x / length) * lead,
    y: entity.location.y + height + (direction.y / length) * Math.min(2, lead * 0.3),
    z: entity.location.z + (direction.z / length) * lead,
  };
}

function getVFlightSlot(dimension, ownerId, excludedDragon) {
  const used = new Set();
  for (const candidate of dimension.getEntities(dragonTypes)) {
    if (!candidate?.isValid || candidate === excludedDragon) continue;
    if (readDynamicProperty(candidate, "dragonmounts2:owner_identifier") !== ownerId) continue;
    if (readProperty(candidate, "dragonmounts2:v_flight_enabled") !== true) continue;
    const slot = Number(readDynamicProperty(candidate, "dragonmounts2:v_flight_slot", -1));
    if (Number.isInteger(slot) && slot >= 0) used.add(slot);
  }
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

function getVFlightController(dimension, ownerId, dragon, requestedController) {
  if (requestedController?.isValid && requestedController.dimension === dimension) {
    return requestedController;
  }
  return dimension?.getEntities(dragonTypes).find((candidate) =>
    candidate?.isValid &&
    candidate !== dragon &&
    readDynamicProperty(candidate, "dragonmounts2:owner_identifier") === ownerId &&
    readProperty(candidate, "dragonmounts2:v_flight_enabled") === true,
  ) ?? dragon;
}

function getVFormationTarget(dragon, controller, slot) {
  if (!dragon?.isValid || !controller?.isValid) return null;
  const velocity = getSafeVelocity(controller);
  let forward = { x: velocity.x, z: velocity.z };
  if (Math.hypot(forward.x, forward.z) < 0.08) {
    const rotation = safeExecute(() => controller.getRotation?.()) ?? { y: 0 };
    const yaw = (rotation.y * Math.PI) / 180;
    forward = { x: -Math.sin(yaw), z: Math.cos(yaw) };
  } else {
    const length = Math.hypot(forward.x, forward.z);
    forward.x /= length;
    forward.z /= length;
  }
  const right = { x: forward.z, z: -forward.x };
  const row = Math.floor(slot / 2) + 1;
  const side = slot % 2 === 0 ? -1 : 1;
  const lateral = 3.5 + row * 0.7;
  const behind = 4 + row * 2.5;
  return {
    x: controller.location.x - forward.x * behind + right.x * lateral * side,
    y: controller.location.y + 1.5 + Math.min(3, row * 0.35),
    z: controller.location.z - forward.z * behind + right.z * lateral * side,
  };
}

function handleJumpInput(dragon, player) {
  if (!dragon?.isValid || !player?.isValid) return;

  const state = JUMP_STATE.get(player.id) ?? { wasJumping: false, holdTime: 0, lastJumpTick: 0 };
  const currentTick = system.currentTick;
  const isJumping = !!player.isJumping;

  if (isJumping && !state.wasJumping) {
    if (dragon.isOnGround) {
      dragon.applyImpulse({ x: 0, y: 0.7, z: 0 });
    }

    writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_requested", true);
    writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_start_tick", currentTick);
    writeDynamicProperty(dragon, "dragonmounts2:flight_airborne_ticks", 0);

    state.lastJumpTick = currentTick;
  }

  if (readDynamicProperty(dragon, "dragonmounts2:flight_takeoff_requested") === true) {
    if (dragon.isOnGround) {
      writeDynamicProperty(dragon, "dragonmounts2:flight_airborne_ticks", 0);
    } else {
      const airborneTicks = (Number(readDynamicProperty(dragon, "dragonmounts2:flight_airborne_ticks", 0)) || 0) + 1;
      writeDynamicProperty(dragon, "dragonmounts2:flight_airborne_ticks", airborneTicks);
      if (airborneTicks >= LIFTOFF_AIRBORNE_TICKS && readProperty(dragon, "dragonmounts2:movement_state") !== "flying") {
        transitionMovementState(dragon, "flying", true);
      }
    }
  }

  if (isJumping) {
    state.holdTime++;
  } else {
    state.holdTime = 0;
  }

  state.wasJumping = isJumping;
  JUMP_STATE.set(player.id, state);
}

function applyMountedFlightMotion(dragon, player) {
  if (!dragon?.isValid || !player?.isValid) return;
  if (readProperty(dragon, "dragonmounts2:movement_state") !== "flying") return;

  const inputVector = safeExecute(() => player.inputInfo?.getMovementVector?.());
  if (!inputVector) return;

  const forwardInput = Number(inputVector.y ?? inputVector.z ?? 0);
  const strafeInput = Number(inputVector.x ?? 0);
  if (!Number.isFinite(forwardInput) || !Number.isFinite(strafeInput)) return;

  const view = safeExecute(() => player.getViewDirection?.());
  if (!view) return;

  const horizontal = Math.hypot(view.x, view.z);
  if (horizontal < 0.01) return;

  const forward = { x: view.x / horizontal, z: view.z / horizontal };
  const right = { x: forward.z, z: -forward.x };
  const magnitude = Math.hypot(forwardInput, strafeInput);
  const direction = magnitude > 0.01
    ? {
        x: (forward.x * forwardInput + right.x * strafeInput) / magnitude,
        z: (forward.z * forwardInput + right.z * strafeInput) / magnitude,
      }
    : { x: 0, z: 0 };

  const speed = 0.9 * settings.getPlayerDragonSpeed(player);
  const verticalInput = (player.isJumping ? 1 : 0) - (player.isSneaking ? 1 : 0);
  const verticalSpeed = verticalInput * speed * 0.8 + (magnitude > 0.01 ? view.y * speed * 0.35 : 0);

  applyFlightMotion(dragon, {
    x: direction.x * speed,
    y: verticalSpeed,
    z: direction.z * speed,
  }, 0.45);
  if (isBreakInTrusted(dragon)) {
    applyRotation(dragon, rotationFromDirection({ x: view.x, y: view.y, z: view.z }));
  }
}

function updateAirborneFlightTransition(dragon) {
  if (!dragon?.isValid) return;
  const state = getRuntimeState(dragon);
  const riders = dragon.getComponent("rideable")?.getRiders?.() ?? [];
  const movementState = readProperty(dragon, "dragonmounts2:movement_state");

  if (dragon.isInWater || dragon.isOnGround || movementState === "flying") {
    state.airborneTicks = 0;
    return;
  }

  if (riders.length > 0) {
    const rider = riders[0];
    const tameable = dragon.getComponent("minecraft:tameable");
    if (tameable?.isTamed === true && isBreakInTrusted(dragon) && !isDragonSaddled(dragon)) {
      state.airborneTicks = 0;
      return;
    }
    if (!(rider instanceof Player) && tameable?.isTamed === true) {
      state.airborneTicks = 0;
      return;
    }
  }

  state.airborneTicks += 1;
  if (state.airborneTicks >= 5) {
    transitionMovementState(dragon, "flying", true);
    state.airborneTicks = 0;
  }
}

function updateAutonomousFlight(dragon) {
  if (!dragon?.isValid) return;
  if (readProperty(dragon, "dragonmounts2:mob_state") === "sitting") {
    stopAdvancedFlight(dragon);
    return;
  }
  const state = getRuntimeState(dragon);
  if (dragon.isOnGround && !state.autonomousLanding) {
    state.autonomousTarget = null;
    state.autonomousLandingComplete = true;
    writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_requested", undefined);
    writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active", undefined);
    if (readProperty(dragon, "dragonmounts2:movement_state") === "flying") {
      transitionMovementState(dragon, "grounded", true);
    }
    restoreDragonState(dragon);
    return;
  }
  const activeMode = resolveActiveMode(dragon, { riderPresent: false });
  if (activeMode !== FLIGHT_MODES.AUTONOMOUS) {
    if (activeMode === FLIGHT_MODES.V_FLIGHT || activeMode === FLIGHT_MODES.ELYTRA_FOLLOW || activeMode === FLIGHT_MODES.RIDER) return;
    requestModeActivation(dragon, FLIGHT_MODES.AUTONOMOUS);
  }

  if (!state.autonomousAnchor) state.autonomousAnchor = { ...dragon.location };
  if (
    !state.autonomousLanding &&
    state.autonomousLandingDueTick > 0 &&
    system.currentTick >= state.autonomousLandingDueTick
  ) {
    state.autonomousLanding = true;
    state.autonomousLandingStartTick = system.currentTick;
    state.autonomousLandingAnchor = { ...dragon.location };
    state.autonomousTarget = null;
  }
  if (state.autonomousLanding) {
    if (dragon.isOnGround) {
      state.autonomousLanding = false;
      state.autonomousLandingComplete = true;
      state.autonomousTarget = null;
      state.autonomousLandingAnchor = null;
      writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_requested", undefined);
      writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active", undefined);
      restoreDragonState(dragon);
      transitionMovementState(dragon, "grounded", true);
      return;
    }
    if (!state.autonomousTarget || system.currentTick - state.autonomousTargetTick >= 80) {
      state.autonomousTarget = getAutonomousGroundTarget(dragon, state);
      state.autonomousTargetTick = system.currentTick;
    }
    if (!state.autonomousTarget) {
      const cycleTick = system.currentTick - state.autonomousSearchCycleStartTick;
      if (cycleTick >= 180) {
        state.autonomousSearchCycleStartTick = system.currentTick;
        state.autonomousSearchRising = false;
        state.autonomousLandingAnchor = { ...dragon.location };
      } else if (cycleTick >= 110) {
        state.autonomousSearchRising = true;
      }
      state.autonomousSearchPhase += state.autonomousSearchRising ? 0.08 : 0.12;
      const verticalSpeed = state.autonomousSearchRising ? 0.24 : -0.18;
      applyFlightMotion(dragon, {
        x: Math.cos(state.autonomousSearchPhase) * 0.18,
        y: verticalSpeed,
        z: Math.sin(state.autonomousSearchPhase) * 0.18,
      }, 0.28);
      return;
    }
    if (readProperty(dragon, "dragonmounts2:movement_state") !== "flying") transitionMovementState(dragon, "flying", true);
    flyTowardTarget(dragon, state.autonomousTarget, 0.56, 0.6);
    return;
  }
  if (!state.autonomousTarget || system.currentTick - state.autonomousTargetTick >= 45) {
    const angle = state.autonomousPhaseOffset + Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 9;
    state.autonomousTarget = {
      x: state.autonomousAnchor.x + Math.cos(angle) * radius,
      y: state.autonomousAnchor.y + 2 + Math.random() * 3,
      z: state.autonomousAnchor.z + Math.sin(angle) * radius,
    };
    state.autonomousTargetTick = system.currentTick;
  }
  if (readProperty(dragon, "dragonmounts2:movement_state") !== "flying") transitionMovementState(dragon, "flying", true);
  flyTowardTarget(dragon, state.autonomousTarget, 0.58, 0.58);
}

function updateElytraFollow(dragon) {
  if (!dragon?.isValid) return;
  if (!canUseAdvancedFlight(dragon)) {
    deactivateElytraFollow(dragon);
    return;
  }
  const activeMode = resolveActiveMode(dragon, { riderPresent: false });
  if (activeMode !== FLIGHT_MODES.ELYTRA_FOLLOW) {
    if (activeMode === FLIGHT_MODES.V_FLIGHT || activeMode === FLIGHT_MODES.AUTONOMOUS || activeMode === FLIGHT_MODES.RIDER) return;
    requestModeActivation(dragon, FLIGHT_MODES.ELYTRA_FOLLOW);
  }

  const isActive = isElytraFollowActive(dragon);
  const playerId = readDynamicProperty(dragon, "dragonmounts2:elytra_follow_player_id");
  const player = getPlayerById(playerId);

  if (!isActive || !player?.isValid || player.dimension.id !== dragon.dimension.id || !player.isGliding) {
    if (isActive && !dragon.isOnGround) {
      handoffToAutonomousFlight(dragon);
      return;
    }
    if (isActive) {
      setElytraFollowActive(dragon, false);
      writeDynamicProperty(dragon, "dragonmounts2:elytra_follow_player_id", undefined);
    }
    transitionMovementState(dragon, "grounded", true);
    requestModeActivation(dragon, FLIGHT_MODES.GROUNDED);
    return;
  }

  if (readProperty(dragon, "dragonmounts2:movement_state") !== "flying") {
    transitionMovementState(dragon, "flying", true);
  }

  const target = getDirectionalFollowTarget(dragon, player, 6, 2);
  flyTowardTarget(dragon, target, 0.7, 0.7);
  const rotation = target ? rotationFromDirection({
    x: target.x - dragon.location.x,
    y: target.y - dragon.location.y,
    z: target.z - dragon.location.z,
  }) : null;
  if (rotation) applyRotation(dragon, rotation);
}

function updateVFlightFollower(dragon) {
  if (!dragon?.isValid) return;
  const activeMode = resolveActiveMode(dragon, { riderPresent: false });
  if (activeMode !== FLIGHT_MODES.V_FLIGHT) {
    if (activeMode === FLIGHT_MODES.ELYTRA_FOLLOW || activeMode === FLIGHT_MODES.AUTONOMOUS || activeMode === FLIGHT_MODES.RIDER) return;
    requestModeActivation(dragon, FLIGHT_MODES.V_FLIGHT);
  }

  const ownerId = readDynamicProperty(dragon, "dragonmounts2:owner_identifier");
  const owner = getPlayerById(ownerId);
  if (!owner?.isValid || owner.dimension.id !== dragon.dimension.id) {
    disableVFlight(dragon, "manual");
    requestModeActivation(dragon, FLIGHT_MODES.GROUNDED);
    return;
  }

  const controllerId = readDynamicProperty(dragon, "dragonmounts2:v_flight_controller_pid");
  const controller = getEntityByPersistentId(dragon.dimension, controllerId);
  if (dragon.isOnGround && readDynamicProperty(dragon, "dragonmounts2:flight_takeoff_requested") !== true) {
    safeExecute(() => dragon.applyImpulse({ x: 0, y: 0.7, z: 0 }));
    writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_requested", true);
    writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_start_tick", system.currentTick);
    writeDynamicProperty(dragon, "dragonmounts2:flight_airborne_ticks", 0);
  }

  if (readProperty(dragon, "dragonmounts2:movement_state") !== "flying") {
    transitionMovementState(dragon, "flying", true);
  }

  const slot = Number(readDynamicProperty(dragon, "dragonmounts2:v_flight_slot", 0));
  const target = controller && controller !== dragon
    ? getVFormationTarget(dragon, controller, Number.isFinite(slot) ? slot : 0)
    : getDirectionalFollowTarget(dragon, owner, 5, 2);
  flyTowardTarget(dragon, target, controller ? 0.72 : 0.6, controller ? 0.7 : 0.65);
  if (target) applyRotation(dragon, rotationFromDirection({
    x: target.x - dragon.location.x,
    y: target.y - dragon.location.y,
    z: target.z - dragon.location.z,
  }));
}

function clearRuntimeFlightState(dragon) {
  if (!dragon?.isValid) return;
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_slot", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_controller_pid", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_activated", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_landing", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_disable_blocked", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_reserved", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_manual_disable", undefined);
}

function saveFlightSnapshot(dragon) {
  if (!dragon?.isValid) return;
  const activeFlight =
    isElytraFollowActive(dragon) ||
    readProperty(dragon, "dragonmounts2:v_flight_enabled") === true ||
    readDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active") === true;
  if (!activeFlight) return;
  const location = dragon.location;
  writeDynamicProperty(dragon, "dragonmounts2:flight_last_x", location.x);
  writeDynamicProperty(dragon, "dragonmounts2:flight_last_y", location.y);
  writeDynamicProperty(dragon, "dragonmounts2:flight_last_z", location.z);
  writeDynamicProperty(dragon, "dragonmounts2:flight_last_dimension", dragon.dimension.id);
}

function markPlayerRodeDragon(player, dragon) {
  if (!player?.isValid || !dragon?.isValid) return;
  safeExecute(() => player.setDynamicProperty("dragonmounts2:last_ridden_dragon_id", dragon.id));
}

export function saveVFlightPreviousState(dragon) {
  if (!dragon?.isValid) return;
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_prev_mob_state", readProperty(dragon, "dragonmounts2:mob_state") || "standing");
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_prev_is_following", readProperty(dragon, "dragonmounts2:is_following") === true);
}

export function startVFlight(dragon, ownerId, dimension, controllerDragon = null) {
  if (!dragon?.isValid) return false;
  if (!canUseAdvancedFlight(dragon)) return false;
  if (readProperty(dragon, "dragonmounts2:v_flight_enabled") === true) return false;
  if (dragon.isInWater === true || dragon.isDead === true) return false;
  if (dragon.isOnGround === true) {
    safeExecute(() => dragon.applyImpulse({ x: 0, y: 0.7, z: 0 }));
    writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_requested", true);
    writeDynamicProperty(dragon, "dragonmounts2:flight_takeoff_start_tick", system.currentTick);
    writeDynamicProperty(dragon, "dragonmounts2:flight_airborne_ticks", 0);
  } else if (!canBeginFlying(dragon)) {
    return false;
  }

  const modeChanged = requestModeActivation(dragon, FLIGHT_MODES.V_FLIGHT, { force: true });
  if (!modeChanged) return false;

  writeDynamicProperty(dragon, "dragonmounts2:owner_identifier", ownerId);
  saveVFlightPreviousState(dragon);
  writeProperty(dragon, "dragonmounts2:is_following", false);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_slot", getVFlightSlot(dimension, ownerId, dragon));
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_disable_reason", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_manual_disable", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_reserved", true);
  const controller = getVFlightController(dimension, ownerId, dragon, controllerDragon);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_controller_pid", getPersistentId(controller));
  writeProperty(dragon, "dragonmounts2:v_flight_enabled", true);
  safeExecute(() => dragon.triggerEvent("dragonmounts2:on_vflight_enable"));
  transitionMovementState(dragon, "flying", true);
  safeExecute(() => dragon.clearVelocity());
  return true;
}

export function disableVFlight(dragon, reason = null) {
  if (!dragon?.isValid) return;
  if (readProperty(dragon, "dragonmounts2:v_flight_enabled") !== true) return;
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_disable_reason", reason || undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_manual_disable", reason === "manual" ? true : undefined);
  safeExecute(() => dragon.triggerEvent("dragonmounts2:on_vflight_disable"));
  writeProperty(dragon, "dragonmounts2:v_flight_enabled", false);
  clearRuntimeFlightState(dragon);
  if (reason === "mode_switch") return;
  if (!restoreDragonState(dragon) && readProperty(dragon, "dragonmounts2:movement_state") !== "grounded") transitionMovementState(dragon, "grounded", true);
}

export function normalizeDragonAfterTeleport(dragon) {
  if (!dragon?.isValid) return;
  const wasSitting = readProperty(dragon, "dragonmounts2:mob_state") === "sitting";
  const wasFollowing = readProperty(dragon, "dragonmounts2:is_following") === true;
  writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active", undefined);
  clearRuntimeFlightState(dragon);
  safeExecute(() => dragon.clearVelocity());
  transitionMovementState(dragon, "grounded", true);
  if (wasSitting) {
    syncFollowState(dragon, false, true);
    syncMobState(dragon, "sitting", true);
  } else if (wasFollowing) {
    syncFollowState(dragon, true, true);
    syncMobState(dragon, "standing", false);
  } else {
    syncFollowState(dragon, false, true);
    syncMobState(dragon, "standing", true);
  }
}

export function activateElytraFollow(dragon, playerId) {
  if (!dragon?.isValid || !playerId) return false;
  if (!canUseAdvancedFlight(dragon)) return false;
  if (isElytraFollowActive(dragon)) return false;
  if (readProperty(dragon, "dragonmounts2:v_flight_enabled") === true) return false;

  const player = getPlayerById(playerId);
  if (!player?.isValid || !player.isGliding || player.dimension.id !== dragon.dimension.id) return false;
  if (dragon.isInWater === true || dragon.isDead === true) return false;

  const modeChanged = requestModeActivation(dragon, FLIGHT_MODES.ELYTRA_FOLLOW, { force: true });
  if (!modeChanged) return false;

  setElytraFollowActive(dragon, true);
  writeDynamicProperty(dragon, "dragonmounts2:elytra_follow_player_id", playerId);
  safeExecute(() => dragon.triggerEvent("dragonmounts2:on_elytra_follow_enable"));
  transitionMovementState(dragon, "flying", true);
  safeExecute(() => dragon.clearVelocity());
  return true;
}

export function deactivateElytraFollow(dragon) {
  if (!dragon?.isValid) return false;
  if (!isElytraFollowActive(dragon)) return false;
  setElytraFollowActive(dragon, false);
  writeDynamicProperty(dragon, "dragonmounts2:elytra_follow_player_id", undefined);
  safeExecute(() => dragon.triggerEvent("dragonmounts2:on_elytra_follow_disable"));
  if (!restoreDragonState(dragon)) transitionMovementState(dragon, "grounded", true);
  return true;
}

export function restoreOwnedDragonFlightState(player) {
  if (!player?.isValid) return;
  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    const dimension = world.getDimension(dimensionId);
    for (const dragon of dimension.getEntities(dragonTypes)) {
      if (!dragon?.isValid) continue;
      if (readDynamicProperty(dragon, "dragonmounts2:owner_name") !== player.name) continue;
      writeDynamicProperty(dragon, "dragonmounts2:owner_identifier", player.id);
    }
  }
}

export function toggleFlightDebug(player) {
  if (!player?.isValid) return false;
  if (DEBUG_PLAYERS.has(player.id)) {
    DEBUG_PLAYERS.delete(player.id);
    player.onScreenDisplay.setActionBar({ rawtext: [{ text: "Flight debug: off" }] });
    return false;
  }

  DEBUG_PLAYERS.set(player.id, { lastTick: system.currentTick, speedTotal: 0, sampleCount: 0 });
  player.onScreenDisplay.setActionBar({ rawtext: [{ text: "Flight debug: on" }] });
  return true;
}

export function tickFlightDebug() {
  cleanupMemory();
  for (const [playerId, state] of DEBUG_PLAYERS) {
    const player = getPlayerById(playerId);
    if (!player?.isValid) {
      DEBUG_PLAYERS.delete(playerId);
      continue;
    }
    const dragon = player.getComponent("minecraft:riding")?.entityRidingOn;
    if (!dragon?.isValid) continue;
    const velocity = getSafeVelocity(dragon);
    const speed = Math.hypot(velocity.x, velocity.z) * 20;
    if (Number.isFinite(speed)) {
      state.speedTotal += speed;
      state.sampleCount++;
    }
    if (system.currentTick - state.lastTick < 20) continue;
    const average = state.sampleCount > 0 ? state.speedTotal / state.sampleCount : 0;
    player.onScreenDisplay.setActionBar({ rawtext: [{ text: `Dragon flight speed: ${average.toFixed(2)} blocks/s` }] });
    state.lastTick = system.currentTick;
    state.speedTotal = 0;
    state.sampleCount = 0;
  }
}

function getDragonRiders(dragon) {
  return dragon?.getComponent("rideable")?.getRiders?.() ?? [];
}

function reconcileFlightState(dragon, activeMode, riders) {
  if (!dragon?.isValid) return;
  const runtime = getRuntimeState(dragon);
  const flightActive = activeMode !== FLIGHT_MODES.GROUNDED && activeMode !== FLIGHT_MODES.AUTONOMOUS
    ? true
    : activeMode === FLIGHT_MODES.AUTONOMOUS || readProperty(dragon, "dragonmounts2:movement_state") === "flying";

  if (flightActive && readProperty(dragon, "dragonmounts2:mob_state") === "sitting") {
    syncMobState(dragon, "standing", true);
  }

  if (activeMode === FLIGHT_MODES.GROUNDED && riders.length === 0 && readProperty(dragon, "dragonmounts2:movement_state") === "flying") {
    transitionMovementState(dragon, "grounded", true);
  }

  if (runtime.lastReconciledMode !== activeMode) {
    writeDynamicProperty(dragon, FLIGHT_MODE_PROPERTY, activeMode);
    runtime.lastReconciledMode = activeMode;
  }
  runtime.lastReconciledMobState = readProperty(dragon, "dragonmounts2:mob_state", "standing");
}

function hasActiveFlight(dragon) {
  return (
    readProperty(dragon, "dragonmounts2:movement_state") === "flying" ||
    readDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active") === true ||
    isElytraFollowActive(dragon) ||
    readProperty(dragon, "dragonmounts2:v_flight_enabled") === true
  );
}

function updateActiveFlightMode(dragon, mode) {
  if (mode === FLIGHT_MODES.ELYTRA_FOLLOW) {
    updateElytraFollow(dragon);
    return true;
  }
  if (mode === FLIGHT_MODES.V_FLIGHT) {
    updateVFlightFollower(dragon);
    return true;
  }
  if (mode === FLIGHT_MODES.AUTONOMOUS) {
    updateAutonomousFlight(dragon);
    return true;
  }
  return false;
}

export function dragonsMainComponents(dragon) {
  if (!dragon?.isValid || !DRAGON_TYPES.has(dragon.typeId)) return;
  cleanupMemory();
  saveFlightSnapshot(dragon);
  updateSleepingState(dragon);

  const rideable = dragon.getComponent("rideable");
  const tameable = dragon.getComponent("minecraft:tameable");

  if (tameable?.isTamed && readDynamicProperty(dragon, BREAK_IN_TRUST_PROPERTY) === undefined) {
    setBreakInTrusted(dragon, false);
  }

  if (tameable?.isTamed) {
    const ownerName = tameable.tamedToPlayer?.name ?? "Unknown";
    const ownerId = tameable.tamedToPlayerId ?? "";
    if (readDynamicProperty(dragon, "dragonmounts2:owner_name") !== ownerName) {
      writeDynamicProperty(dragon, "dragonmounts2:owner_name", ownerName);
    }
    if (readDynamicProperty(dragon, "dragonmounts2:owner_identifier") !== ownerId) {
      writeDynamicProperty(dragon, "dragonmounts2:owner_identifier", ownerId);
    }
  }

  if (!rideable) return;

  const riders = getDragonRiders(dragon);
  const activeMode = resolveActiveMode(dragon, { riderPresent: riders.length > 0 });
  reconcileFlightState(dragon, activeMode, riders);
  writeProperty(dragon, "dragonmounts2:activity", getDragonActivity(dragon));

  if (dragon.isOnGround && !hasActiveFlight(dragon) && riders.length === 0) {
    restoreDragonState(dragon);
  }

  if (riders.length === 0) {
    resetBreakInRide(getRuntimeState(dragon));

    if (dragon.isInWater === true) {
      stopAdvancedFlight(dragon);
      transitionMovementState(dragon, "swimming", true);
      return;
    }

    if (readProperty(dragon, "dragonmounts2:mob_state") === "sitting") {
      stopAdvancedFlight(dragon);
      return;
    }

    const autonomousRequested = readDynamicProperty(dragon, "dragonmounts2:autonomous_flight_requested") === true;
    const trustedUnsaddled = tameable?.isTamed === true && isBreakInTrusted(dragon) && !isDragonSaddled(dragon);
    const runtime = getRuntimeState(dragon);
    if (isDragonSaddled(dragon)) runtime.autonomousLandingComplete = false;
    const autonomousActive = readDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active") === true;
    if (autonomousRequested && !autonomousActive) {
      requestAutonomousFlight(dragon, true);
    } else if (trustedUnsaddled && !autonomousActive && !dragon.isOnGround) {
      requestAutonomousFlight(dragon, false);
    }

    const activeMode = resolveActiveMode(dragon, { riderPresent: false });
    if (
      readProperty(dragon, "dragonmounts2:movement_state") === "flying" &&
      activeMode === FLIGHT_MODES.GROUNDED &&
      canUseAdvancedFlight(dragon)
    ) {
      handoffToAutonomousFlight(dragon);
    }

    if (updateActiveFlightMode(dragon, resolveActiveMode(dragon, { riderPresent: false }))) return;

    if (readProperty(dragon, "dragonmounts2:movement_state") === "flying") {
      transitionMovementState(dragon, "grounded", true);
      requestModeActivation(dragon, FLIGHT_MODES.GROUNDED, { force: true });
    }
    return;
  }

  const rider = riders[0];
  requestModeActivation(dragon, FLIGHT_MODES.RIDER, { force: true });
  if (!(rider instanceof Player)) return;

  const runtime = getRuntimeState(dragon);
  if (!isBreakInTrusted(dragon)) {
    const breakInActive = updateBreakInRide(dragon, rider, runtime);
    if (breakInActive || !isBreakInTrusted(dragon)) return;
  }

  if (!isDragonSaddled(dragon)) {
    stopAdvancedFlight(dragon);
    return;
  }

  if (readDynamicProperty(dragon, "dragonmounts2:last_rider_id") !== rider.id) {
    writeDynamicProperty(dragon, "dragonmounts2:last_rider_id", rider.id);
  }
  writeDynamicProperty(dragon, "dragonmounts2:last_ridden_tick", system.currentTick);
  markPlayerRodeDragon(rider, dragon);
  handleJumpInput(dragon, rider);
  applyMountedFlightMotion(dragon, rider);
}

export function updateDragonAI(dragon) {
  if (!dragon?.isValid) return;
  if (readProperty(dragon, "dragonmounts2:is_sleeping") === true) return;

  if (readProperty(dragon, "dragonmounts2:mob_state") === "sitting") {
    stopAdvancedFlight(dragon);
    return;
  }

  const rideable = dragon.getComponent("rideable");
  const riders = rideable?.getRiders?.() ?? [];
  if (riders.length > 0) return;

  const currentState = readProperty(dragon, "dragonmounts2:movement_state");
  if (dragon.isInWater === true) {
    if (currentState !== "swimming") transitionMovementState(dragon, "swimming", true);
    return;
  }

  if (
    currentState === "flying" &&
    readDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active") !== true &&
    !isElytraFollowActive(dragon) &&
    readProperty(dragon, "dragonmounts2:v_flight_enabled") !== true
  ) {
    requestAutonomousFlight(dragon);
    updateAutonomousFlight(dragon);
  }
}

export function tickDragon(dragon) {
  if (!dragon?.isValid || !DRAGON_TYPES.has(dragon.typeId)) return;
  dragonsMainComponents(dragon);
  updateDragonAI(dragon);
  updateAirborneFlightTransition(dragon);
}

export const DragonMemorySystem = Object.freeze({
  rot: DragonMemoryStore.rot,
  remember: DragonMemoryStore.remember,
  clear: DragonMemoryStore.clear,
  has: DragonMemoryStore.has,
  rememberDragonState,
  restoreDragonState,
});

export function makeBrain(dragon) {
  if (!dragon?.isValid) return null;
  return {
    dragon,
    tick: () => dragonsMainComponents(dragon),
    update: () => dragonsMainComponents(dragon),
    getActiveMode: () => resolveActiveMode(dragon, { riderPresent: !!dragon.getComponent("rideable")?.getRiders?.()?.length }),
    requestMode: (nextMode, options) => requestModeActivation(dragon, nextMode, options),
    activateAutonomousFlight: () => {
      writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active", true);
      updateAutonomousFlight(dragon);
      return resolveActiveMode(dragon, { riderPresent: false });
    },
    activateElytraFollow: (playerId) => activateElytraFollow(dragon, playerId),
    activateVFlight: (ownerId, dimension, controllerDragon = null) => startVFlight(dragon, ownerId, dimension, controllerDragon),
  };
}

export function tickBrain(dragon) {
  dragonsMainComponents(dragon);
  return resolveActiveMode(dragon, { riderPresent: !!dragon.getComponent("rideable")?.getRiders?.()?.length });
}

export function processRiderInput(dragon, rider) {
  handleJumpInput(dragon, rider);
}

export const DragonAI = Object.freeze({
  MODE_PRIORITY,
  FlightMode: FLIGHT_MODES,
  DragonActivity,
  resolveActiveMode,
  getActiveFlightMode,
  getDragonActivity,
  requestModeActivation,
  makeBrain,
  tickBrain,
  updateDragonAI,
  tickDragon,
  updateAutonomousFlight,
  updateElytraFollow,
  updateVFlightFollower,
  handleJumpInput,
  processRiderInput,
  activateAutonomousFlight: (dragon) => {
    if (!dragon?.isValid) return false;
    writeDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active", true);
    updateAutonomousFlight(dragon);
    return true;
  },
});

export const DragonAi = DragonAI;

export const DragonFlightController = Object.freeze({
  MODE_PRIORITY,
  FlightMode: FLIGHT_MODES,
  DragonActivity,
  resolveActiveMode,
  getActiveFlightMode,
  getDragonActivity,
  requestModeActivation,
  makeBrain,
  tickBrain,
  updateDragonAI,
  tickDragon,
  updateAutonomousFlight,
  updateElytraFollow,
  updateVFlightFollower,
  handleJumpInput,
  processRiderInput,
});

function getDragonByPersistentId(dimension, persistentId) {
  if (!dimension || !persistentId) return null;
  for (const entity of dimension.getEntities(dragonTypes)) {
    if (entity?.isValid && getPersistentId(entity) === persistentId) return entity;
  }
  return null;
}

function requestFallRescue(player, dragon) {
  if (!player?.isValid || !dragon?.isValid) return;
  const persistentId = getPersistentId(dragon);
  const currentTick = system.currentTick;
  let rescueState = FALL_RESCUE_STATE.get(player.id);
  if (!rescueState) {
    rescueState = { lastTick: 0, rescueDragonPid: null };
    FALL_RESCUE_STATE.set(player.id, rescueState);
  }
  if (rescueState.rescueDragonPid === persistentId && currentTick - rescueState.lastTick < 20) return;
  rescueState.rescueDragonPid = persistentId;
  rescueState.lastTick = currentTick;
  FALL_RESCUE_STATE.set(player.id, rescueState);
  system.runTimeout(() => {
    const livePlayer = getPlayerById(player.id);
    const liveDragon = livePlayer ? getDragonByPersistentId(livePlayer.dimension, persistentId) : null;
    if (!livePlayer?.isValid || !liveDragon?.isValid) return;
    safeExecute(() => livePlayer.startRiding(liveDragon));
  }, 10);
}

export function tickFallRescue() {
  cleanupMemory();
  for (const player of world.getAllPlayers()) {
    if (!player?.isValid) continue;
    if (player.isOnGround || player.isGliding || player.isInWater) continue;
    if (player.getComponent("minecraft:riding")?.entityRidingOn) continue;
    const dragonPid = player.getDynamicProperty("dragonmounts2:last_ridden_dragon_id");
    if (!dragonPid) continue;
    const dragon = getDragonByPersistentId(player.dimension, dragonPid);
    if (!dragon?.isValid) continue;
    if (readDynamicProperty(dragon, "dragonmounts2:owner_identifier") !== player.id) continue;
    if (readProperty(dragon, "dragonmounts2:v_flight_enabled") === true) continue;
    if (distanceBetween(player.location, dragon.location) > 24) continue;
    const velocity = getSafeVelocity(player);
    const isFalling = velocity.y < -0.2 || player.location.y < (player.getDynamicProperty("dragonmounts2:last_safe_y") ?? player.location.y);
    if (isFalling) requestFallRescue(player, dragon);
    player.setDynamicProperty("dragonmounts2:last_safe_y", player.location.y);
  }
}

export function restoreFlightState(dragon) {
  if (!dragon?.isValid) return;
  const previousMobState = readDynamicProperty(dragon, "dragonmounts2:v_flight_prev_mob_state");
  const previousFollow = readDynamicProperty(dragon, "dragonmounts2:v_flight_prev_is_following") === true;
  writeProperty(dragon, "dragonmounts2:v_flight_enabled", false);
  clearRuntimeFlightState(dragon);
  if (previousMobState === "sitting") {
    syncFollowState(dragon, false, true);
    syncMobState(dragon, "sitting", true);
  } else if (previousFollow) {
    syncFollowState(dragon, true, true);
    syncMobState(dragon, "standing", false);
  } else {
    syncFollowState(dragon, false, true);
    syncMobState(dragon, "standing", true);
  }
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_prev_mob_state", undefined);
  writeDynamicProperty(dragon, "dragonmounts2:v_flight_prev_is_following", undefined);
}

export function handleDragonOwnerLeave(playerId) {
  JUMP_STATE.delete(playerId);
  DEBUG_PLAYERS.delete(playerId);
  FALL_RESCUE_STATE.delete(playerId);
  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    const dimension = world.getDimension(dimensionId);
    for (const dragon of dimension.getEntities(dragonTypes)) {
      if (!dragon?.isValid) continue;
      if (readDynamicProperty(dragon, "dragonmounts2:owner_identifier") !== playerId) continue;
      if (
        isElytraFollowActive(dragon) ||
        readProperty(dragon, "dragonmounts2:v_flight_enabled") === true ||
        readDynamicProperty(dragon, "dragonmounts2:v_flight_reserved") === true ||
        readDynamicProperty(dragon, "dragonmounts2:autonomous_flight_active") === true
      ) {
        writeDynamicProperty(dragon, "dragonmounts2:flight_paused_for_logout", true);
      }
    }
  }
}

export function handleDragonHurt(hurtEntity) {
  if (!hurtEntity?.isValid || !DRAGON_TYPES.has(hurtEntity.typeId)) return;
  wakeDragon(hurtEntity);
}

export { resolveActiveMode, getActiveFlightMode, getDragonActivity, DragonActivity, FLIGHT_MODES, MODE_PRIORITY };
