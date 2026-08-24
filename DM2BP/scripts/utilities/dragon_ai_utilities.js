import { system, world } from "@minecraft/server";
import * as dragonUtilities from "./dragon_utilities.js";

const states = new WeakMap();
const followStates = new WeakMap();
const FLIGHT_WAYPOINT_ARRIVAL = 5;
const FLIGHT_STUCK_TICKS = 40;
const FLIGHT_REPLAN_COOLDOWN = 30;
const FLIGHT_AWAY_TICKS = 15;
const FLIGHT_AWAY_DOT = -0.2;
const FLIGHT_NEW_TARGET_DISTANCE = 12;
const FLIGHT_SPEED = 0.72;
const LANDING_SPEED = 0.62;
const STEERING_RESPONSE = 0.65;
const LANDING_GLIDE_ANGLE = Math.PI / 3;
const LANDING_CONFIRM_TICKS = 3;
const FOLLOW_START_DISTANCE = 14;
const FOLLOW_LAND_DISTANCE = 10;
const FOLLOW_STUCK_TICKS = 60;
const WORLD_MIN_Y = -64;
const WORLD_MAX_Y = 319;
const WORLD_CEILING_MARGIN = 4;
const LANDING_SEARCH_RADIUS = 64;
const LANDING_SEARCH_EXPANDED_RADIUS = 128;
const LANDING_SEARCH_DEPTH = 96;

function getBlock(dimension, location) {
  if (
    !dimension ||
    !location ||
    location.y < WORLD_MIN_Y ||
    location.y > WORLD_MAX_Y
  ) return null;
  try {
    return dimension.getBlock({
      x: Math.floor(location.x),
      y: Math.floor(location.y),
      z: Math.floor(location.z),
    });
  } catch {
    return null;
  }
}

function isAir(block) {
  return block?.typeId === "minecraft:air" ||
    block?.typeId === "minecraft:cave_air" ||
    block?.typeId === "minecraft:void_air";
}

function isLiquid(block) {
  return block?.typeId?.includes("water") || block?.typeId?.includes("lava");
}

function isWaterlogged(block) {
  try {
    return (
      block?.permutation?.getState("minecraft:waterlogged") === true ||
      block?.permutation?.getState("waterlogged") === true
    );
  } catch {
    return false;
  }
}

function getLiquidSurfaceY(dimension, location) {
  for (let y = Math.floor(location.y) - 1; y >= WORLD_MIN_Y; y--) {
    const block = getBlock(dimension, { x: location.x, y, z: location.z });
    if (isLiquid(block) || isWaterlogged(block)) return y + 1;
    if (!isAir(block)) return null;
  }
  return null;
}

function isOpen(dimension, location) {
  const liquidSurfaceY = getLiquidSurfaceY(dimension, location);
  if (liquidSurfaceY !== null && location.y < liquidSurfaceY + 5) return false;
  return (
    isAir(getBlock(dimension, location)) &&
    isAir(getBlock(dimension, { ...location, y: location.y + 1 })) &&
    isAir(getBlock(dimension, { ...location, y: location.y + 2 }))
  );
}

function isClearPath(dimension, from, to) {
  const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
  const steps = Math.min(14, Math.max(4, Math.ceil(distance / 2)));
  for (let index = 0; index <= steps; index++) {
    const progress = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      z: from.z + (to.z - from.z) * progress,
    };
    if (!isOpen(dimension, point)) return false;
  }
  return true;
}

function getVelocity(entity) {
  return entity.getVelocity?.() ?? { x: 0, y: 0, z: 0 };
}

function rotateToward(dragon, direction, amount) {
  const horizontal = Math.hypot(direction.x, direction.z);
  if (horizontal < 0.01) return;
  const current = dragon.getRotation?.();
  if (!current) return;
  const desiredYaw = (-Math.atan2(direction.x, direction.z) * 180) / Math.PI;
  const yawDelta = ((desiredYaw - current.y + 540) % 360) - 180;
  const desiredPitch = (-Math.atan2(direction.y, horizontal) * 180) / Math.PI;
  try {
    dragon.setRotation({
      x: current.x + (desiredPitch - current.x) * amount,
      y: current.y + yawDelta * amount,
      z: 0,
    });
  } catch {}
}

function isGrounded(dragon) {
  try {
    const standingOn = dragon.getBlockStandingOn?.();
    if (standingOn) return !isAir(standingOn) &&
      !isLiquid(standingOn) &&
      !isWaterlogged(standingOn);
  } catch {
  }
  const location = dragon.location;
  const support = getBlock(dragon.dimension, {
    x: location.x,
    y: location.y - 1,
    z: location.z,
  });
  return !!support &&
    !isAir(support) &&
    !isLiquid(support) &&
    !isWaterlogged(support);
}

function setGroundedState(dragon) {
  try {
    dragon.setDynamicProperty("dragonmounts2:autonomous_flight_active", undefined);
    dragon.setDynamicProperty("dragonmounts2:autonomous_roam_flight", undefined);
  } catch {}
  try {
    dragon.triggerEvent("minecraft:on_grounded");
  } catch {}
  try { dragon.setProperty("dragonmounts2:movement_state", "grounded"); } catch {}
  try { dragon.setProperty("dragonmounts2:mob_state", "standing"); } catch {}
  try { dragon.clearVelocity(); } catch {}
}

function finishFollowLanding(dragon, state) {
  state.active = false;
  state.landing = false;
  state.landingTarget = null;
  state.landingSearchRadius = LANDING_SEARCH_RADIUS;
  state.landingTicks = 0;
  dragon.setDynamicProperty("dragonmounts2:autonomous_flight_active", undefined);
  dragon.setProperty("dragonmounts2:is_following", false);
  try {
    dragon.triggerEvent("minecraft:on_wander");
  } catch {}
  setGroundedState(dragon);
  if (!state.wasFollowing) return;
  system.run(() => {
    if (!dragon?.isValid) return;
    dragon.setProperty("dragonmounts2:is_following", true);
    try {
      dragon.triggerEvent("minecraft:on_follow");
    } catch {}
  });
}

function synchronizeMovementState(dragon) {
  const movementState = dragon.getProperty("dragonmounts2:movement_state");
  const nextState = dragon.isInWater === true
    ? "swimming"
    : movementState === "flying"
      ? null
      : isGrounded(dragon)
        ? "grounded"
        : null;
  if (!nextState || nextState === movementState) return;

  try {
    dragon.triggerEvent(
      nextState === "swimming" ? "minecraft:on_swimming" : "minecraft:on_grounded",
    );
  } catch {}
  try {
    dragon.setProperty("dragonmounts2:movement_state", nextState);
  } catch {}
}

function updateFollowLanding(dragon, state) {
  if (!state.landingTarget) {
    state.landingTarget = findLandingTarget(
      dragon,
      state.landingSearchRadius ?? LANDING_SEARCH_RADIUS,
    );
    if (!state.landingTarget && state.landingSearchRadius !== LANDING_SEARCH_EXPANDED_RADIUS) {
      state.landingSearchRadius = LANDING_SEARCH_EXPANDED_RADIUS;
      state.landingTarget = findLandingTarget(dragon, state.landingSearchRadius);
    }
  }
  const target = state.landingTarget;
  state.landingTarget = target;
  const location = dragon.location;
  if (target) {
    const horizontalDistance = Math.hypot(
      target.x - location.x,
      target.z - location.z,
    );
    const glideHeight = horizontalDistance > 3
      ? Math.min(18, Math.max(2, horizontalDistance * Math.tan(LANDING_GLIDE_ANGLE)))
      : Math.max(0.2, horizontalDistance * 0.3);
    steer(dragon, {
      ...target,
      y: Math.min(target.y + glideHeight, location.y),
    }, LANDING_SPEED, true);
  } else {
    steer(dragon, { x: location.x, y: location.y - 8, z: location.z }, LANDING_SPEED, true);
  }

  const horizontalDistance = target
    ? Math.hypot(target.x - dragon.location.x, target.z - dragon.location.z)
    : 0;
  if (
    isGrounded(dragon) &&
    horizontalDistance <= 2.5
  ) {
    state.landingTicks++;
  } else {
    state.landingTicks = 0;
  }
  if (state.landingTicks < LANDING_CONFIRM_TICKS) return;

  finishFollowLanding(dragon, state);
}

function isNewFlightTarget(target, previousTarget) {
  return !previousTarget || Math.hypot(
    target.x - previousTarget.x,
    target.y - previousTarget.y,
    target.z - previousTarget.z,
  ) >= FLIGHT_NEW_TARGET_DISTANCE;
}

function findFlightTarget(dragon, previousTarget = null) {
  const origin = dragon.location;
  const rotation = dragon.getRotation?.() ?? { y: 0 };
  const yaw = (rotation.y * Math.PI) / 180;
  const forward = { x: -Math.sin(yaw), z: Math.cos(yaw) };
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = yaw + (Math.random() - 0.5) * 2.4;
    const distance = 20 + Math.random() * 32;
    const target = {
      x: origin.x - Math.sin(angle) * distance,
      y: Math.max(WORLD_MIN_Y + 8, Math.min(WORLD_MAX_Y - 8, origin.y)),
      z: origin.z + Math.cos(angle) * distance,
    };
    if (
      isNewFlightTarget(target, previousTarget) &&
      isClearPath(dragon.dimension, origin, target)
    ) return target;
    const fallback = {
      x: origin.x + forward.x * 18,
      y: origin.y,
      z: origin.z + forward.z * 18,
    };
    if (
      isNewFlightTarget(fallback, previousTarget) &&
      isClearPath(dragon.dimension, origin, fallback)
    ) return fallback;
  }
  return null;
}

function getEmergencyFlightTarget(dragon, previousTarget = null) {
  const origin = dragon.location;
  const rotation = dragon.getRotation?.() ?? { y: 0 };
  const yaw = (rotation.y * Math.PI) / 180;
  const directions = [yaw, yaw + Math.PI / 2, yaw - Math.PI / 2, yaw + Math.PI];
  for (const direction of directions) {
    const target = {
      x: origin.x - Math.sin(direction) * 16,
      y: Math.max(WORLD_MIN_Y + 8, Math.min(WORLD_MAX_Y - 8, origin.y)),
      z: origin.z + Math.cos(direction) * 16,
    };
    if (isNewFlightTarget(target, previousTarget)) return target;
  }
  return {
    x: origin.x + 16,
    y: Math.max(WORLD_MIN_Y + 8, Math.min(WORLD_MAX_Y - 8, origin.y)),
    z: origin.z,
  };
}

function getNextFlightTarget(dragon, previousTarget = null) {
  return findFlightTarget(dragon, previousTarget) ?? getEmergencyFlightTarget(dragon, previousTarget);
}

function findLandingTarget(dragon, maxRadius = LANDING_SEARCH_RADIUS) {
  const origin = dragon.location;
  const searchRadii = [0];
  for (let radius = 4; radius <= maxRadius; radius += 4) {
    searchRadii.push(radius);
  }
  for (const radius of searchRadii) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const x = origin.x + Math.cos(angle) * radius;
      const z = origin.z + Math.sin(angle) * radius;
      const minimumY = Math.max(WORLD_MIN_Y, Math.floor(origin.y) - LANDING_SEARCH_DEPTH);
      for (let y = Math.floor(origin.y); y >= minimumY; y--) {
        const ground = getBlock(dragon.dimension, { x, y, z });
        const target = { x: Math.floor(x) + 0.5, y: y + 1, z: Math.floor(z) + 0.5 };
        if (!ground || (!isAir(ground) && !isLiquid(ground) && !isWaterlogged(ground))) {
          if (
            ground &&
            !isAir(ground) &&
            !isLiquid(ground) &&
            !isWaterlogged(ground) &&
            isOpen(dragon.dimension, target)
          ) return target;
          break;
        }
      }
    }
  }
  return null;
}

function findNearestLandingTarget(dragon) {
  return findLandingTarget(dragon, LANDING_SEARCH_RADIUS) ??
    findLandingTarget(dragon, LANDING_SEARCH_EXPANDED_RADIUS);
}

function updateAutonomousFollowFlight(dragon) {
  if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true) return;
  if (dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") === true) return;
  if (dragon.isInWater === true) {
    const state = followStates.get(dragon);
    if (state) {
      state.active = false;
      state.stuckTicks = 0;
      state.landingTicks = 0;
    }
    dragon.setDynamicProperty("dragonmounts2:autonomous_flight_active", undefined);
    return;
  }
  let state = followStates.get(dragon);
  const ownerId = dragon.getDynamicProperty("dragonmounts2:owner_identifier");
  const tameable = dragon.getComponent("minecraft:tameable");
  const owner = tameable?.tamedToPlayer?.isValid
    ? tameable.tamedToPlayer
    : world.getAllPlayers().find((player) => player.id === ownerId);
  if (!state) {
    if (!owner?.isValid) return;
    const distance = dragonUtilities.distanceBetween(owner.location, dragon.location);
    state = {
      lastDistance: distance,
      stuckTicks: 0,
      landingTicks: 0,
      active: false,
      wasFollowing: false,
    };
    followStates.set(dragon, state);
  }
  if (!owner?.isValid || owner.dimension.id !== dragon.dimension.id) {
    if (state.active) {
      state.landing = true;
      updateFollowLanding(dragon, state);
    }
    return;
  }

  const dragonLocation = dragon.location;
  const distance = dragonUtilities.distanceBetween(owner.location, dragonLocation);

  if (state.landing) {
    updateFollowLanding(dragon, state);
    return;
  }

  if (!state.active && dragon.getProperty("dragonmounts2:movement_state") === "grounded") {
    if (distance <= FOLLOW_START_DISTANCE) {
      state.lastDistance = distance;
      state.stuckTicks = 0;
      return;
    }
    state.stuckTicks = distance >= state.lastDistance - 0.05 ? state.stuckTicks + 1 : 0;
    state.lastDistance = distance;
    if (state.stuckTicks < FOLLOW_STUCK_TICKS) return;
    state.active = true;
    state.stuckTicks = 0;
    state.landingTicks = 0;
    state.wasFollowing = dragon.getProperty("dragonmounts2:is_following") === true;
    if (state.wasFollowing) {
      dragon.setProperty("dragonmounts2:is_following", false);
      try {
        dragon.triggerEvent("minecraft:on_wander");
      } catch {}
    }
    dragon.setDynamicProperty("dragonmounts2:autonomous_flight_active", true);
    dragon.triggerEvent("minecraft:on_flying");
    dragon.clearVelocity();
  }

  if (!state.active) return;
  const ownerLocation = owner.location;
  if (owner.isOnGround && distance <= FOLLOW_LAND_DISTANCE) {
    state.landing = true;
    state.landingTarget = null;
    state.landingSearchRadius = LANDING_SEARCH_RADIUS;
    state.landingTicks = 0;
    updateFollowLanding(dragon, state);
    return;
  } else {
    steer(dragon, {
      x: ownerLocation.x,
      y: ownerLocation.y + 3,
      z: ownerLocation.z,
    }, 1.1, true);
  }
}

function steer(dragon, target, speed, flying) {
  const location = dragon.location;
  const direction = {
    x: target.x - location.x,
    y: target.y - location.y,
    z: target.z - location.z,
  };
  const distance = Math.max(Math.hypot(direction.x, direction.y, direction.z), 0.001);
  const velocity = getVelocity(dragon);
  const approachSpeed = flying
    ? Math.min(speed, Math.max(0.04, distance * 0.18))
    : speed;
  const desired = {
    x: (direction.x / distance) * approachSpeed,
    y: flying ? (direction.y / distance) * approachSpeed : velocity.y,
    z: (direction.z / distance) * approachSpeed,
  };
  try {
    const blendedVelocity = dragonUtilities.blendVelocity(
      velocity,
      desired,
      STEERING_RESPONSE,
    );
    dragon.clearVelocity();
    dragon.applyImpulse(blendedVelocity);
    rotateToward(
      dragon,
      flying ? blendedVelocity : direction,
      flying ? 0.18 : 0.12,
    );
  } catch {}
  return distance;
}

function startFlight(dragon, state) {
  const target = getNextFlightTarget(dragon);
  if (!target) return false;
  try {
    dragon.triggerEvent("minecraft:on_flying");
    dragon.setProperty("dragonmounts2:movement_state", "flying");
    dragon.setDynamicProperty("dragonmounts2:autonomous_roam_flight", true);
    dragon.clearVelocity();
  } catch {
    return false;
  }
  state.target = target;
  state.targetKind = "flight";
  state.flightStarted = system.currentTick;
  state.flightLegs = 0;
  state.landingTicks = 0;
  state.lastFlightRouteTick = system.currentTick;
  state.lastFlightLocation = { ...dragon.location };
  state.flightStuckTicks = 0;
  state.flightAwayTicks = 0;
  return true;
}

function finishFlight(dragon, state) {
  if (isGrounded(dragon)) {
    dragon.setDynamicProperty("dragonmounts2:autonomous_roam_flight", undefined);
    setGroundedState(dragon);
    state.target = null;
    state.targetKind = null;
    state.flightLegs = 0;
    state.landingTicks = 0;
    state.lastFlightLocation = null;
    state.flightStuckTicks = 0;
    state.flightAwayTicks = 0;
    return;
  }
  if (state.targetKind === "landing") return;
  const target = findNearestLandingTarget(dragon);
  if (target) {
    state.target = target;
    state.targetKind = "landing";
    state.landingTicks = 0;
    return;
  }
  state.target = getNextFlightTarget(dragon, state.target);
  state.targetKind = "flight";
  state.flightLegs = 0;
  state.landingTicks = 0;
  state.lastFlightRouteTick = system.currentTick;
  state.lastFlightLocation = { ...dragon.location };
  state.flightStuckTicks = 0;
  state.flightAwayTicks = 0;
}

function clearAutonomousFlightState(dragon, state) {
  state.target = null;
  state.targetKind = null;
  state.flightLegs = 0;
  state.landingTicks = 0;
  state.flightStuckTicks = 0;
  state.flightAwayTicks = 0;
  dragon.setDynamicProperty("dragonmounts2:autonomous_flight_active", undefined);
  dragon.setDynamicProperty("dragonmounts2:autonomous_roam_flight", undefined);
}

export function updateDragonAI(dragon) {
  if (!dragon?.isValid) return;
  if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true) return;
  if (dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") === true) return;
  if (followStates.get(dragon)?.active === true) {
    updateAutonomousFollowFlight(dragon);
    return;
  }

  const movementState = dragon.getProperty("dragonmounts2:movement_state");
  const autonomousFlight = dragon.getDynamicProperty("dragonmounts2:autonomous_roam_flight") === true;
  if (dragon.isInWater === true) {
    if (autonomousFlight) {
      dragon.setDynamicProperty("dragonmounts2:autonomous_roam_flight", undefined);
    }
    synchronizeMovementState(dragon);
    const state = states.get(dragon);
    if (state) {
      state.target = null;
      state.targetKind = null;
      state.flightLegs = 0;
      state.flightStuckTicks = 0;
      state.flightAwayTicks = 0;
    }
    return;
  }
  if (
    autonomousFlight &&
    movementState !== "flying" &&
    dragon.getDynamicProperty("dragonmounts2:v_flight_enabled") !== true &&
    dragon.getDynamicProperty("dragonmounts2:elytra_follow_active") !== true
  ) {
    dragon.setDynamicProperty("dragonmounts2:autonomous_roam_flight", undefined);
  }
  synchronizeMovementState(dragon);
  if (dragon.getProperty("dragonmounts2:is_following") === true) {
    updateAutonomousFollowFlight(dragon);
    return;
  }
  if (dragon.getProperty("dragonmounts2:mob_state") !== "standing") return;
  if (dragon.getProperty("dragonmounts2:is_following") === true) return;
  if (dragon.getProperty("dragonmounts2:is_breathing") === true) return;
  if (dragon.getDynamicProperty("dragonmounts2:autonomous_flight_active") === true) return;
  if (dragon.getComponent("rideable")?.getRiders?.().length > 0) return;
  let state = states.get(dragon);
  if (!state) {
    state = {
      target: null,
      targetKind: null,
      nextFlightTick: system.currentTick + 300 + Math.random() * 500,
      flightStarted: 0,
      flightLegs: 0,
      lastFlightRouteTick: 0,
      lastFlightLocation: null,
      flightStuckTicks: 0,
      flightAwayTicks: 0,
      landingTicks: 0,
    };
    states.set(dragon, state);
  }

  if (movementState === "swimming") {
    state.target = null;
    state.targetKind = null;
    state.flightLegs = 0;
    state.flightStuckTicks = 0;
    state.flightAwayTicks = 0;
  }

  const currentMovementState = dragon.getProperty("dragonmounts2:movement_state");
  if (currentMovementState === "grounded") {
    clearAutonomousFlightState(dragon, state);
    if (system.currentTick < state.nextFlightTick) return;
    if (dragon.isInWater === true) return;
    startFlight(dragon, state);
    return;
  }
  if (currentMovementState === "flying") {
    if (dragon.getDynamicProperty("dragonmounts2:autonomous_roam_flight") !== true) {
      if (!startFlight(dragon, state)) return;
    }
    if (
      dragon.location.y >= WORLD_MAX_Y - WORLD_CEILING_MARGIN &&
      state.targetKind !== "landing"
    ) {
      state.target = findNearestLandingTarget(dragon);
      state.targetKind = "landing";
      state.landingTicks = 0;
    }
    if (state.targetKind === "flight") {
      if (!state.target || !isClearPath(dragon.dimension, dragon.location, state.target)) {
        if (system.currentTick - state.lastFlightRouteTick >= FLIGHT_REPLAN_COOLDOWN) {
          state.target = getNextFlightTarget(dragon, state.target);
          state.lastFlightRouteTick = system.currentTick;
          state.flightStuckTicks = 0;
        }
      }
      if (!state.lastFlightLocation) state.lastFlightLocation = { ...dragon.location };
      const velocity = getVelocity(dragon);
      const toTarget = {
        x: state.target.x - dragon.location.x,
        y: state.target.y - dragon.location.y,
        z: state.target.z - dragon.location.z,
      };
      const targetDistance = Math.max(
        Math.hypot(toTarget.x, toTarget.y, toTarget.z),
        0.001,
      );
      const velocityLength = Math.hypot(velocity.x, velocity.y, velocity.z);
      const travelAlignment = velocityLength > 0.1
        ? (velocity.x * toTarget.x + velocity.y * toTarget.y + velocity.z * toTarget.z) /
          (velocityLength * targetDistance)
        : 1;
      state.flightAwayTicks = travelAlignment < FLIGHT_AWAY_DOT
        ? state.flightAwayTicks + 5
        : 0;
      const flightMoved = Math.hypot(
        dragon.location.x - state.lastFlightLocation.x,
        dragon.location.y - state.lastFlightLocation.y,
        dragon.location.z - state.lastFlightLocation.z,
      );
      state.flightStuckTicks = flightMoved < 0.12 ? state.flightStuckTicks + 5 : 0;
      state.lastFlightLocation = { ...dragon.location };
      if (
        system.currentTick - state.lastFlightRouteTick >= FLIGHT_REPLAN_COOLDOWN &&
        (state.flightStuckTicks >= FLIGHT_STUCK_TICKS ||
          state.flightAwayTicks >= FLIGHT_AWAY_TICKS)
      ) {
        state.target = getNextFlightTarget(dragon, state.target);
        state.lastFlightRouteTick = system.currentTick;
        state.flightStuckTicks = 0;
        state.flightAwayTicks = 0;
      }
    }
    if (!state.target && state.targetKind === "flight") {
      state.target = getNextFlightTarget(dragon);
      state.lastFlightRouteTick = system.currentTick;
    }
    if (!state.target && state.targetKind === "landing") {
      const location = dragon.location;
      state.target = findNearestLandingTarget(dragon) ?? {
        x: location.x,
        y: Math.max(WORLD_MIN_Y + 2, location.y - 12),
        z: location.z,
      };
    }
    if (state.target) {
      let steeringTarget = state.target;
      if (state.targetKind === "landing") {
        const horizontalDistance = Math.hypot(
          state.target.x - dragon.location.x,
          state.target.z - dragon.location.z,
        );
        const glideHeight = horizontalDistance > 3
          ? Math.min(18, Math.max(2, horizontalDistance * Math.tan(LANDING_GLIDE_ANGLE)))
          : Math.max(0.2, horizontalDistance * 0.3);
        steeringTarget = {
          ...state.target,
          y: Math.min(state.target.y + glideHeight, dragon.location.y),
        };
      }
      const distance = steer(
        dragon,
        steeringTarget,
        state.targetKind === "landing" ? LANDING_SPEED : FLIGHT_SPEED,
        true,
      );
      if (state.targetKind === "landing" && !isGrounded(dragon)) {
        const horizontalDistance = Math.hypot(
          state.target.x - dragon.location.x,
          state.target.z - dragon.location.z,
        );
        if (horizontalDistance < 4) {
          try {
            dragon.applyImpulse({ x: 0, y: -0.08, z: 0 });
          } catch {}
        }
      }
      if (state.targetKind === "flight" && distance < FLIGHT_WAYPOINT_ARRIVAL) {
        state.target = findNearestLandingTarget(dragon);
        state.targetKind = state.target ? "landing" : "flight";
        state.landingTicks = 0;
        state.lastFlightRouteTick = system.currentTick;
      }
      if (state.targetKind === "landing") {
        const landingHorizontalDistance = Math.hypot(
          state.target.x - dragon.location.x,
          state.target.z - dragon.location.z,
        );
        if (
          isGrounded(dragon) &&
          landingHorizontalDistance <= 2.5
        ) {
          state.landingTicks++;
        } else {
          state.landingTicks = 0;
        }
        if (state.landingTicks >= LANDING_CONFIRM_TICKS) {
          finishFlight(dragon, state);
        } else if (!isGrounded(dragon) && distance < 2.5) {
          state.target = null;
          state.landingTicks = 0;
        }
      }
    }
    return;
  }

}
