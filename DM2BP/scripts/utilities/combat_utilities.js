import { EntityDamageCause, system } from "@minecraft/server";
import * as entityData from "../data/entity_data.js";
import { getSafeVelocity } from "./entity_utilities.js";
import { onAfterEntityHurt } from "../core/combat_events.js";
import { registerIntervalTask } from "../core/scheduler.js";
import { onWorldEvent } from "../core/world_events.js";

const TARGET_SCAN_RANGE = 16;
const TARGET_SCAN_INTERVAL = 10;
const RETALIATION_RANGE = 64;
const COMBAT_RANGE = 40;
const BREATH_RANGE = 32;
const BREATH_DURATION = 40;
const BREATH_COOLDOWN = 40;
const LONG_FIGHT_TICKS = 200;
const MELEE_COOLDOWN = 40;
const RIDDEN_BITE_COOLDOWN = 15;
const RIDDEN_BITE_REACH = 2;
// Derived from NeoDragonMounts BreathPower / BreathNode (Java):
//   speed    = power.speed * 1.2 (INITIAL_SPEED) blocks per tick
//   lifespan = 40 (DEFAULT_AGE_IN_TICKS) * power.lifetime ticks
//   radius   = 2.0 (NODE_DIAMETER) * power.size / 2
//   intensity = power.intensity
// JUVENILE -> MEDIUM(3.95, 0.7, 2.0, 1.2); ADULT -> LARGE(4.0, 0.8, 3.25, 1.4)
const BREATH_NODE_PROFILES = Object.freeze({
  juvenile: Object.freeze({
    radius: 2,
    intensity: 1.2,
    speed: 3.95 * 1.2,
    lifespan: 40 * 0.7,
  }),
  adult: Object.freeze({
    radius: 3.25,
    intensity: 1.4,
    speed: 4.0 * 1.2,
    lifespan: 40 * 0.8,
  }),
});
// Java ServerBreathHelper: nodes only spawn once the STARTING state (5 ticks) ends.
const BREATH_START_DELAY = 5;
// Java BreathAffectedEntity: density accumulates while hit and resets 7 ticks after the last hit.
const ENTITY_DENSITY_RESET_TICKS = 7;
// Hurt invulnerability window used to space out accumulated-density damage.
const BREATH_DAMAGE_INTERVAL = 10;
// Java BreathNode.SPEED_VARIATION_ABS (3 std deviations)
const NODE_SPEED_VARIATION_ABS = 0.05;
// Search radius cap so lingering fast nodes do not trigger huge entity queries.
const BREATH_CANDIDATE_RADIUS_CAP = 64;
const DEFAULT_BREATH_NODE_PROFILE = BREATH_NODE_PROFILES.adult;
const BREATH_NODE_POINTS = 10;
const BREATH_NODE_MAX_DISTANCE = Math.min(
  BREATH_CANDIDATE_RADIUS_CAP,
  DEFAULT_BREATH_NODE_PROFILE.speed * DEFAULT_BREATH_NODE_PROFILE.lifespan +
    DEFAULT_BREATH_NODE_PROFILE.radius,
);
const SCULK_REPLACEABLE_BLOCKS = new Set([
  "minecraft:stone",
  "minecraft:deepslate",
  "minecraft:cobblestone",
  "minecraft:cobbled_deepslate",
  "minecraft:andesite",
  "minecraft:diorite",
  "minecraft:granite",
  "minecraft:tuff",
  "minecraft:calcite",
  "minecraft:dirt",
  "minecraft:coarse_dirt",
  "minecraft:rooted_dirt",
  "minecraft:grass_block",
  "minecraft:podzol",
  "minecraft:mycelium",
  "minecraft:clay",
  "minecraft:gravel",
  "minecraft:sand",
  "minecraft:red_sand",
  "minecraft:netherrack",
  "minecraft:basalt",
  "minecraft:blackstone",
  "minecraft:end_stone",
  "minecraft:moss_block",
]);
const ELEMENTAL_CLOUD_LIFETIME = 600;
const ELEMENTAL_CLOUD_EFFECT_INTERVAL = 20;
const ELEMENTAL_CLOUD_VISUAL_INTERVAL = 5;
const RECENT_TARGET_KEYS = Object.freeze([
  ["dragonRevenge", "dragonRevengeAt"],
  ["ownerRevenge", "ownerRevengeAt"],
  ["ownerTarget", "ownerTargetAt"],
]);

const PROJECTILE_ABILITIES = Object.freeze({
  "dragonmounts2:ender_dragon": Object.freeze({
    entity: "dragonmounts2:ender_dragonball",
    name: "Ender Charge",
    minChargeTicks: 15,
    cooldownTicks: 30,
    launchSound: "mob.enderdragon.shoot",
  }),
  "dragonmounts2:ice_dragon": Object.freeze({
    entity: "dragonmounts2:ice_dragonball",
    name: "Iceball",
    minChargeTicks: 20,
    cooldownTicks: 30,
    launchSound: "block.snow.place",
  }),
  "dragonmounts2:nether_dragon": Object.freeze({
    entity: "dragonmounts2:nether_dragonball",
    name: "Nether Fireball",
    minChargeTicks: 20,
    cooldownTicks: 30,
  }),
  "dragonmounts2:water_dragon": Object.freeze({
    entity: "dragonmounts2:water_dragonball",
    name: "Waterball",
    minChargeTicks: 20,
    cooldownTicks: 30,
    launchSound: "bucket.empty_water",
  }),
});
const DEFAULT_PROJECTILE_ABILITY = Object.freeze({
  entity: "dragonmounts2:fire_dragonball",
  name: "Fireball",
  minChargeTicks: 20,
  cooldownTicks: 30,
});
const ELEMENTAL_PROJECTILE_IMPACTS = Object.freeze({
  "dragonmounts2:ice_dragonball": Object.freeze({
    effect: "slowness",
    particle: "minecraft:snowflake_particle",
    particleCount: 80,
    secondaryParticle: "minecraft:snowflake_particle",
    secondaryParticleCount: 25,
    sound: "block.snow.break",
    cloud: true,
  }),
  "dragonmounts2:water_dragonball": Object.freeze({
    effect: "slowness",
    particle: "minecraft:splash_particle",
    particleCount: 80,
    secondaryParticle: "minecraft:bubble_particle",
    secondaryParticleCount: 40,
    sound: "block.powder_snow.break",
    cloud: true,
  }),
});
const BREATH_PROJECTILE_IMPACTS = Object.freeze({
  "dragonmounts2:aether_dragonbreath": Object.freeze({ effect: "airflow", particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:dark_dragonbreath": Object.freeze({ particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath", breathCloud: { chance: 0.002, effect: "darkness", duration: 120, radius: 1.4, lifetime: 600, particle: "minecraft:basic_smoke_particle" } }),
  "dragonmounts2:enchanted_dragonbreath": Object.freeze({ effect: "fire", particle: "minecraft:basic_flame_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:ender_dragonbreath": Object.freeze({ particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath", breathCloud: { chance: 0.002, effect: "instant_damage", duration: 1, radius: 1.6, lifetime: 750, particle: "minecraft:basic_smoke_particle" } }),
  "dragonmounts2:fire_dragonbreath": Object.freeze({ effect: "fire", particle: "minecraft:basic_flame_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:forest_dragonbreath": Object.freeze({ particle: "minecraft:happy_villager_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath", breathCloud: { chance: 0.008, effect: "poison", duration: 100, radius: 1.3, lifetime: 600, particle: "minecraft:happy_villager_particle" } }),
  "dragonmounts2:ice_dragonbreath": Object.freeze({ effect: "ice", particle: "minecraft:snowflake_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:light_dragonbreath": Object.freeze({ effect: "airflow", particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:moonlight_dragonbreath": Object.freeze({ effect: "airflow", particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:nether_dragonbreath": Object.freeze({ effect: "nether", particle: "minecraft:basic_flame_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:sculk_dragonbreath": Object.freeze({ effect: "sculk", particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:skeleton_dragonbreath": Object.freeze({ effect: "nether", particle: "minecraft:basic_flame_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:storm_dragonbreath": Object.freeze({ effect: "water", lightningStrike: true, particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:sunlight_dragonbreath": Object.freeze({ effect: "lightning", particle: "minecraft:basic_flame_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:terra_dragonbreath": Object.freeze({ effect: "fire", particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:water_dragonbreath": Object.freeze({ effect: "water", particle: "minecraft:splash_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath" }),
  "dragonmounts2:wither_dragonbreath": Object.freeze({ effect: "poison", particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath", breathCloud: { chance: 0.002, effect: "wither", duration: 120, radius: 1.4, lifetime: 600, particle: "minecraft:basic_smoke_particle" } }),
  "dragonmounts2:zombie_dragonbreath": Object.freeze({ particle: "minecraft:basic_smoke_particle", particleCount: 24, sound: "dragonmounts2:mob.dragon.dragonbreath", breathCloud: { chance: 0.002, effect: "poison", duration: 100, radius: 1.3, lifetime: 600, particle: "minecraft:basic_smoke_particle" } }),
});

const BREATH_TYPES = Object.freeze({
  "dragonmounts2:aether_dragon": { damage: 0.7, particle: "minecraft:basic_smoke_particle", effect: "airflow" },
  "dragonmounts2:dark_dragon": {
    damage: 0.6,
    particle: "minecraft:basic_smoke_particle",
    cloud: { chance: 0.002, effect: "darkness", duration: 120, radius: 1.4, lifetime: 600, particle: "minecraft:basic_smoke_particle" },
  },
  "dragonmounts2:enchanted_dragon": { damage: 0.7, particle: "minecraft:basic_flame_particle", effect: "fire" },
  "dragonmounts2:ender_dragon": {
    damage: 0.9,
    particle: "minecraft:basic_smoke_particle",
    cloud: { chance: 0.002, effect: "instant_damage", duration: 1, radius: 1.6, lifetime: 750, particle: "minecraft:basic_smoke_particle" },
  },
  "dragonmounts2:fire_dragon": { damage: 0.7, particle: "minecraft:basic_flame_particle", effect: "fire" },
  "dragonmounts2:forest_dragon": {
    damage: 0.6,
    particle: "minecraft:happy_villager_particle",
    cloud: { chance: 0.008, effect: "poison", duration: 100, radius: 1.3, lifetime: 600, particle: "minecraft:happy_villager_particle" },
  },
  "dragonmounts2:ice_dragon": { damage: 0.7, particle: "minecraft:snowflake_particle", effect: "ice" },
  "dragonmounts2:light_dragon": { damage: 0.7, particle: "minecraft:basic_smoke_particle", effect: "airflow" },
  "dragonmounts2:moonlight_dragon": { damage: 0.7, particle: "minecraft:basic_smoke_particle", effect: "airflow" },
  "dragonmounts2:nether_dragon": { damage: 0.9, particle: "minecraft:basic_flame_particle", effect: "nether" },
  "dragonmounts2:sculk_dragon": { damage: 0.6, particle: "minecraft:basic_smoke_particle", effect: "sculk" },
  "dragonmounts2:skeleton_dragon": { damage: 0.7, particle: "minecraft:basic_flame_particle", effect: "nether" },
  "dragonmounts2:storm_dragon": { damage: 0.7, particle: "minecraft:basic_smoke_particle", effect: "water" },
  "dragonmounts2:sunlight_dragon": { damage: 0.7, particle: "minecraft:basic_flame_particle", effect: "lightning" },
  "dragonmounts2:terra_dragon": { damage: 0.7, particle: "minecraft:basic_smoke_particle", effect: "fire" },
  "dragonmounts2:water_dragon": { damage: 0.7, particle: "minecraft:snowflake_particle", effect: "water" },
  "dragonmounts2:wither_dragon": {
    damage: 0.6,
    particle: "minecraft:basic_smoke_particle",
    effect: "poison",
    cloud: { chance: 0.002, effect: "wither", duration: 120, radius: 1.4, lifetime: 600, particle: "minecraft:basic_smoke_particle" },
  },
  "dragonmounts2:zombie_dragon": {
    damage: 0.6,
    particle: "minecraft:basic_smoke_particle",
    cloud: { chance: 0.002, effect: "poison", duration: 100, radius: 1.3, lifetime: 600, particle: "minecraft:basic_smoke_particle" },
  },
});

const runtimeByDragon = new Map();
const reportedParticleErrors = new Set();
const reportedBreathBlockErrors = new Set();
const reportedBreathEnvironmentErrors = new Set();
const elementalClouds = new Map();
let lastCleanupTick = -Infinity;
let nextWaterballCloudId = 0;

function stateFor(dragon) {
  let state = runtimeByDragon.get(dragon.id);
  if (!state) {
    state = {
      dragon,
      target: null,
      targetSince: -1,
      nextScanAt: 0,
      dragonRevenge: null,
      dragonRevengeAt: -1,
      ownerRevenge: null,
      ownerRevengeAt: -1,
      ownerTarget: null,
      ownerTargetAt: -1,
      aerialTargetId: null,
      aerialCommitted: false,
      breathStartedAt: -1,
      riderBreathing: false,
      lastBreathEndedAt: -Infinity,
      hasBreathed: false,
      lastMeleeAt: -Infinity,
      lastRiddenBiteAt: -Infinity,
      cooldowns: new Map(),
      nextLightningAt: 0,
      breathNodes: [],
      breathBreathingTicks: 0,
      nodesTickedAt: -1,
      lastBreath: null,
      lastAim: null,
      affectedEntities: new Map(),
    };
    runtimeByDragon.set(dragon.id, state);
  }
  return state;
}

function valid(entity) {
  return entity?.isValid === true;
}

function isLocationInLoadedChunk(dimension, location) {
  if (
    !location ||
    !Number.isFinite(location.x) ||
    !Number.isFinite(location.y) ||
    !Number.isFinite(location.z)
  ) return false;
  try {
    return Boolean(dimension.getBlock({
      x: Math.floor(location.x),
      y: Math.floor(location.y),
      z: Math.floor(location.z),
    }));
  } catch {
    return false;
  }
}

function component(entity, id) {
  return valid(entity) ? entity.getComponent(id) : undefined;
}

function isEntityOnFire(entity) {
  return (component(entity, "minecraft:onfire")?.onFireTicksRemaining ?? 0) > 0;
}

function isEntityInPowderSnow(entity) {
  if (!valid(entity)) return false;
  try {
    const x = Math.floor(entity.location.x);
    const y = Math.floor(entity.location.y);
    const z = Math.floor(entity.location.z);
    return [y, y + 1].some((blockY) =>
      entity.dimension.getBlock({ x, y: blockY, z })?.typeId ===
        "minecraft:powder_snow"
    );
  } catch (error) {
    if (!reportedBreathEnvironmentErrors.has("powder-snow")) {
      reportedBreathEnvironmentErrors.add("powder-snow");
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] Powder snow check failed: ${message}`);
    }
    return false;
  }
}

function clearStaleTargets(state, now) {
  for (const [targetKey, tickKey] of RECENT_TARGET_KEYS) {
    if (!valid(state[targetKey]) || now - state[tickKey] > 600) {
      state[targetKey] = null;
      state[tickKey] = -1;
    }
  }
}

function distanceSquared(first, second) {
  const x = first.x - second.x;
  const y = first.y - second.y;
  const z = first.z - second.z;
  return x * x + y * y + z * z;
}

export function isAttackReady(dragon, attack) {
  if (!valid(dragon) || typeof attack !== "string" || attack.length === 0) {
    return false;
  }
  return system.currentTick >=
    (stateFor(dragon).cooldowns.get(attack) ?? -Infinity);
}

export function startAttackCooldown(dragon, attack, cooldownTicks) {
  if (
    !valid(dragon) ||
    typeof attack !== "string" ||
    attack.length === 0 ||
    !Number.isFinite(cooldownTicks) ||
    cooldownTicks < 0
  ) {
    throw new TypeError("Invalid dragon attack cooldown");
  }
  stateFor(dragon).cooldowns.set(
    attack,
    system.currentTick + cooldownTicks,
  );
}

function applyDragonCombatDamage(dragon, target, damage) {
  if (!valid(dragon) || !valid(target) || !Number.isFinite(damage) || damage <= 0) {
    return false;
  }
  return target.applyDamage(damage, {
    cause: EntityDamageCause.entityAttack,
    damagingEntity: dragon,
  });
}

function attackDamage(dragon) {
  return component(dragon, "minecraft:attack")?.damage ?? 0;
}

function isWithinRiddenBiteReach(dragon, target) {
  const dragonBox = component(dragon, "minecraft:collision_box");
  const targetBox = component(target, "minecraft:collision_box");
  const reach = RIDDEN_BITE_REACH +
    ((dragonBox?.width ?? 1) + (targetBox?.width ?? 1)) / 2;
  const dx = Math.abs(dragon.location.x - target.location.x);
  const dz = Math.abs(dragon.location.z - target.location.z);
  const dy = target.location.y - dragon.location.y;
  return dx <= reach && dz <= reach &&
    dy >= -(targetBox?.height ?? 1) &&
    dy <= (dragonBox?.height ?? 1) + RIDDEN_BITE_REACH;
}

function tryRiddenBite(dragon, state, riders) {
  const now = system.currentTick;
  if (now - state.lastRiddenBiteAt < RIDDEN_BITE_COOLDOWN) return;
  const revengeId = valid(state.dragonRevenge)
    ? state.dragonRevenge.id
    : null;
  const biteRange = RIDDEN_BITE_REACH +
    (component(dragon, "minecraft:collision_box")?.width ?? 1) + 1;
  const target = dragon.dimension.getEntities({
    location: dragon.location,
    maxDistance: biteRange + 2,
  }).filter((candidate) =>
    isAttackable(dragon, candidate, candidate.id === revengeId ? revengeId : null) &&
    (isHostile(candidate) || candidate.id === revengeId) &&
    !riders.some((rider) => rider.id === candidate.id) &&
    isWithinRiddenBiteReach(dragon, candidate)
  ).sort((first, second) =>
    distanceSquared(dragon.location, first.location) -
    distanceSquared(dragon.location, second.location)
  )[0];
  if (!target) return;
  if (applyDragonCombatDamage(dragon, target, attackDamage(dragon))) {
    state.lastRiddenBiteAt = now;
  }
}

function tryAIMeleeAttack(dragon, target, state) {
  const now = system.currentTick;
  if (now - state.lastMeleeAt < MELEE_COOLDOWN) return;
  const dragonWidth = component(dragon, "minecraft:collision_box")?.width ?? 1;
  const targetWidth = component(target, "minecraft:collision_box")?.width ?? 1;
  const reach = 1 + (dragonWidth + targetWidth) / 2;
  if (distanceSquared(dragon.location, target.location) > reach * reach) return;
  if (applyDragonCombatDamage(dragon, target, attackDamage(dragon))) {
    state.lastMeleeAt = now;
  }
}

function getAttackDirection(
  dragon,
  target,
  origin = dragon.getHeadLocation(),
) {
  const speed = breathNodeProfile(dragon).speed;
  const velocity = getSafeVelocity(target);
  const distance = Math.sqrt(distanceSquared(dragon.location, target.location));
  const leadTicks = Math.min(12, distance / speed);
  const dx = target.location.x + velocity.x * leadTicks - origin.x;
  const dy = target.location.y + 1 + velocity.y * leadTicks - origin.y;
  const dz = target.location.z + velocity.z * leadTicks - origin.z;
  const length = Math.max(Math.hypot(dx, dy, dz), 0.001);
  return { x: dx / length, y: dy / length, z: dz / length };
}

function ridersOf(dragon) {
  return component(dragon, "minecraft:rideable")?.getRiders?.() ?? [];
}

function dragonOwnerId(dragon) {
  const tameable = component(dragon, "minecraft:tameable");
  const tameOwnerId = tameable?.tamedToPlayerId;
  if (
    tameable?.isTamed === true &&
    typeof tameOwnerId === "string" &&
    tameOwnerId
  ) {
    return tameOwnerId;
  }
  return dragon.getDynamicProperty("dragonmounts2:owner_identifier");
}

function isFriendly(dragon, target) {
  if (!valid(target) || target.id === dragon.id) return true;
  if (ridersOf(dragon).some((rider) => rider.id === target.id)) return true;
  const ownerId = dragonOwnerId(dragon);
  if (ownerId && target.id === ownerId) return true;
  const targetOwnerId = component(target, "minecraft:tameable")?.tamedToPlayerId;
  return Boolean(ownerId && targetOwnerId === ownerId);
}

function isAttackable(dragon, target, allowedPlayerId = null) {
  if (
    !valid(target) ||
    isFriendly(dragon, target) ||
    target.typeId === "minecraft:armor_stand" ||
    !component(target, "minecraft:health")
  ) return false;
  return target.typeId !== "minecraft:player" || target.id === allowedPlayerId;
}

function isHostile(target) {
  return target.matches?.({ families: ["monster"] }) === true;
}

function isAirborne(target) {
  if (entityData.dragonTypeIds.has(target.typeId)) {
    return target.getProperty("dragonmounts2:movement_state") === "flying";
  }
  return target.isOnGround === false && getSafeVelocity(target).y >= -0.1;
}

function healthFraction(entity) {
  const health = component(entity, "minecraft:health");
  const maximum = health?.effectiveMax ?? health?.defaultValue;
  return maximum > 0 ? health.currentValue / maximum : 1;
}

function targetIsDangerous(target) {
  const health = component(target, "minecraft:health");
  return (component(target, "minecraft:armor")?.value ?? 0) >= 8 ||
    (health?.effectiveMax ?? health?.defaultValue ?? 0) >= 40 ||
    (component(target, "minecraft:attack")?.damage ?? 0) >= 7;
}

function targetIsTrivial(target) {
  const health = component(target, "minecraft:health");
  return (health?.effectiveMax ?? health?.defaultValue ?? 0) <= 20 &&
    (component(target, "minecraft:armor")?.value ?? 0) <= 0;
}

function currentEntityTarget(dragon) {
  return component(dragon, "minecraft:target")?.targetEntity ?? null;
}

function findTarget(dragon, state) {
  const now = system.currentTick;
  if (
    valid(state.dragonRevenge) &&
    now - state.dragonRevengeAt <= 600 &&
    distanceSquared(dragon.location, state.dragonRevenge.location) <= RETALIATION_RANGE ** 2 &&
    isAttackable(dragon, state.dragonRevenge, state.dragonRevenge.id)
  ) return state.dragonRevenge;

  if (
    valid(state.ownerRevenge) &&
    now - state.ownerRevengeAt <= 600 &&
    distanceSquared(dragon.location, state.ownerRevenge.location) <= RETALIATION_RANGE ** 2 &&
    isAttackable(dragon, state.ownerRevenge, state.ownerRevenge.id)
  ) return state.ownerRevenge;

  if (
    valid(state.ownerTarget) &&
    now - state.ownerTargetAt <= 600 &&
    distanceSquared(dragon.location, state.ownerTarget.location) <= RETALIATION_RANGE ** 2 &&
    isAttackable(dragon, state.ownerTarget, state.ownerTarget.id)
  ) return state.ownerTarget;

  const entityTarget = currentEntityTarget(dragon);
  if (
    entityTarget &&
    isAttackable(
      dragon,
      entityTarget,
      entityTarget.id === state.target?.id ? entityTarget.id : null,
    ) &&
    distanceSquared(dragon.location, entityTarget.location) <= COMBAT_RANGE ** 2
  ) return entityTarget;

  if (now < state.nextScanAt) {
    return isAttackable(dragon, state.target, state.target?.id) &&
      distanceSquared(dragon.location, state.target.location) <= COMBAT_RANGE ** 2
      ? state.target
      : null;
  }
  state.nextScanAt = now + TARGET_SCAN_INTERVAL;

  let nearest = null;
  let nearestDistance = Infinity;
  for (const candidate of dragon.dimension.getEntities({
    location: dragon.location,
    maxDistance: TARGET_SCAN_RANGE,
    families: ["monster"],
  })) {
    if (!isAttackable(dragon, candidate)) continue;
    const distance = distanceSquared(dragon.location, candidate.location);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function setAIBreathing(dragon, enabled) {
  dragon.setProperty("dragonmounts2:ai_breath_active", enabled);
  dragon.setProperty("dragonmounts2:is_breathing", enabled);
}

function endAIBreath(dragon, state) {
  if (dragon.getProperty("dragonmounts2:ai_breath_active") !== true) {
    state.breathStartedAt = -1;
    return;
  }
  dragon.setProperty("dragonmounts2:ai_breath_active", false);
  dragon.setProperty("dragonmounts2:is_breathing", false);
  if (state.breathStartedAt >= 0) {
    state.lastBreathEndedAt = system.currentTick;
    state.hasBreathed = true;
  }
  state.breathStartedAt = -1;
}

function aerialAttackPosition(dragon, target, state) {
  if (
    !valid(target) ||
    dragon.isInWater ||
    dragon.getProperty("dragonmounts2:age_variant") === "baby" ||
    distanceSquared(dragon.location, target.location) > COMBAT_RANGE ** 2
  ) {
    state.aerialCommitted = false;
    state.aerialTargetId = null;
    return null;
  }

  if (state.aerialTargetId !== target.id) {
    state.aerialTargetId = target.id;
    state.aerialCommitted = false;
  }

  const airborne = isAirborne(target);
  if (airborne || targetIsDangerous(target)) {
    state.aerialCommitted = true;
  } else if (state.aerialCommitted) {
    if (healthFraction(dragon) >= 0.85) state.aerialCommitted = false;
  } else if (healthFraction(dragon) < 0.7) {
    state.aerialCommitted = true;
  }
  if (!state.aerialCommitted) return null;

  const dx = dragon.location.x - target.location.x;
  const dz = dragon.location.z - target.location.z;
  const horizontal = Math.hypot(dx, dz);
  const nx = horizontal > 0.001 ? dx / horizontal : 1;
  const nz = horizontal > 0.001 ? dz / horizontal : 0;
  const standoff = airborne ? 12 : 16;
  const height = airborne ? 6 : 14;
  return {
    x: target.location.x + nx * standoff,
    y: target.location.y + height + 1,
    z: target.location.z + nz * standoff,
  };
}

function breathNodeRadius(node) {
  const lifetimeFraction = Math.min(node.age / node.profile.lifespan, 1);
  const sizeFraction = lifetimeFraction < 0.25
    ? Math.sin((lifetimeFraction / 0.25) * Math.PI / 2)
    : 1;
  return node.profile.radius * (Math.max(0, sizeFraction) * 0.8 + 0.2);
}

function breathNodeIntensity(node) {
  const lifetimeFraction = Math.min(node.age / node.profile.lifespan, 1);
  if (lifetimeFraction >= 1) return 0;
  if (lifetimeFraction < 0.25) {
    return Math.sin((lifetimeFraction / 0.25) * Math.PI / 2) *
      node.profile.intensity;
  }
  if (lifetimeFraction > 0.74) {
    return Math.sin(
      ((1 - lifetimeFraction) / (1 - 0.74)) * Math.PI / 2,
    ) * node.profile.intensity;
  }
  return node.profile.intensity;
}

// Truncated gaussian: mean 0, `limit` = 3 standard deviations (Java MathUtil.getTruncatedGaussian).
function truncatedGaussian(limit) {
  const deviation = limit / 3;
  for (let attempt = 0; attempt < 8; attempt++) {
    const u = 1 - Math.random();
    const v = Math.random();
    const value = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * deviation;
    if (Math.abs(value) <= limit) return value;
  }
  return 0;
}

function breathNodeProfile(dragon) {
  return BREATH_NODE_PROFILES[
    dragon.getProperty("dragonmounts2:age_variant")
  ] ?? DEFAULT_BREATH_NODE_PROFILE;
}

function addVector(first, second, scale = 1) {
  return {
    x: first.x + second.x * scale,
    y: first.y + second.y * scale,
    z: first.z + second.z * scale,
  };
}

function pointAlongSegment(start, end, fraction) {
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
    z: start.z + (end.z - start.z) * fraction,
  };
}

function randomNodePoint(start, end, radius, pointIndex) {
  const angle = Math.random() * Math.PI * 2;
  const vertical = Math.random() * 2 - 1;
  const horizontal = Math.sqrt(1 - vertical * vertical);
  const distance = Math.random() * radius;
  const segmentWidth = 1 / (BREATH_NODE_POINTS + 1);
  const linePosition = pointIndex * segmentWidth +
    Math.random() * segmentWidth;
  const centre = pointAlongSegment(start, end, linePosition);
  return {
    x: centre.x + Math.cos(angle) * horizontal * distance,
    y: centre.y + vertical * distance,
    z: centre.z + Math.sin(angle) * horizontal * distance,
  };
}

function findNodeCollision(dragon, start, end) {
  const delta = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  const steps = Math.max(1, Math.ceil(length / 0.25));
  let previous = start;
  try {
    for (let step = 1; step <= steps; step++) {
      const point = pointAlongSegment(start, end, step / steps);
      const block = dragon.dimension.getBlock({
        x: Math.floor(point.x),
        y: Math.floor(point.y),
        z: Math.floor(point.z),
      });
      if (block?.isLiquid) {
        return { position: previous, block, collided: false, extinguished: true };
      }
      if (block?.isSolid) {
        return { position: previous, block, collided: true, extinguished: false };
      }
      previous = point;
    }
  } catch (error) {
    if (!reportedBreathBlockErrors.has(dragon.typeId)) {
      reportedBreathBlockErrors.add(dragon.typeId);
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[DragonMounts2] Breath node collision scan failed for ${dragon.typeId}: ${message}`,
      );
    }
  }
  return { position: end, block: null, collided: false, extinguished: false };
}

function addBlockExposure(blocks, block, density, direction) {
  if (!block || block.isAir || block.isLiquid) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const existing = blocks.get(key);
  if (existing) {
    existing.density += density;
    existing.direction = addVector(existing.direction, direction, density);
  } else {
    blocks.set(key, {
      block,
      density,
      direction: {
        x: direction.x * density,
        y: direction.y * density,
        z: direction.z * density,
      },
    });
  }
}

function addEntityExposure(exposureByEntity, candidate, density, direction) {
  const exposure = exposureByEntity.get(candidate.id);
  if (exposure) {
    exposure.density += density;
    exposure.direction = addVector(exposure.direction, direction, density);
  } else {
    exposureByEntity.set(candidate.id, {
      entity: candidate,
      density,
      direction: {
        x: direction.x * density,
        y: direction.y * density,
        z: direction.z * density,
      },
    });
  }
}

function isInsideBreathNodeSegment(point, start, end, radius) {
  const segment = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
  const relative = {
    x: point.x - start.x,
    y: point.y - start.y,
    z: point.z - start.z,
  };
  const lengthSquared = segment.x ** 2 + segment.y ** 2 + segment.z ** 2;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, (
      relative.x * segment.x +
      relative.y * segment.y +
      relative.z * segment.z
    ) / lengthSquared));
  const closest = pointAlongSegment(start, end, projection);
  return distanceSquared(point, closest) <= radius ** 2;
}

function candidateNearBreathNode(candidate, start, end, radius) {
  const box = component(candidate, "minecraft:collision_box");
  const width = box?.width ?? 1;
  const height = box?.height ?? 1;
  const location = candidate.location;
  return (
    location.x + width / 2 >= Math.min(start.x, end.x) - radius &&
    location.x - width / 2 <= Math.max(start.x, end.x) + radius &&
    location.y + height >= Math.min(start.y, end.y) - radius &&
    location.y <= Math.max(start.y, end.y) + radius &&
    location.z + width / 2 >= Math.min(start.z, end.z) - radius &&
    location.z - width / 2 <= Math.max(start.z, end.z) + radius
  );
}

function sampleBreathNode(dragon, node, candidates, blockExposure, entityExposure) {
  node.age += 1;
  const start = node.position;
  const intendedEnd = addVector(start, node.velocity);
  const collision = findNodeCollision(dragon, start, intendedEnd);
  const end = collision.position;
  const movement = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
  const length = Math.hypot(movement.x, movement.y, movement.z);
  const direction = length > 0
    ? { x: movement.x / length, y: movement.y / length, z: movement.z / length }
    : { x: 0, y: 0, z: 0 };
  const intensity = breathNodeIntensity(node);
  const sampleDensity = intensity / BREATH_NODE_POINTS;
  const radius = breathNodeRadius(node);
  const sampledEntityHits = new Map();
  const nearbyCandidates = candidates.filter((candidate) =>
    valid(candidate) && component(candidate, "minecraft:health") &&
    candidateNearBreathNode(candidate, start, end, radius)
  );

  if (collision.collided) {
    addBlockExposure(blockExposure, collision.block, intensity, direction);
  }
  for (let pointIndex = 0; pointIndex < BREATH_NODE_POINTS; pointIndex++) {
    const point = randomNodePoint(start, end, radius, pointIndex);
    try {
      const block = dragon.dimension.getBlock({
        x: Math.floor(point.x),
        y: Math.floor(point.y),
        z: Math.floor(point.z),
      });
      addBlockExposure(blockExposure, block, sampleDensity, direction);
    } catch (error) {
      if (!reportedBreathBlockErrors.has(dragon.typeId)) {
        reportedBreathBlockErrors.add(dragon.typeId);
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[DragonMounts2] Breath node sample failed for ${dragon.typeId}: ${message}`,
        );
      }
    }

    for (const candidate of nearbyCandidates) {
      const box = component(candidate, "minecraft:collision_box");
      const width = box?.width ?? 1;
      const height = box?.height ?? 1;
      const location = candidate.location;
      if (
        Math.abs(point.x - location.x) <= width / 2 &&
        point.y >= location.y &&
        point.y <= location.y + height &&
        Math.abs(point.z - location.z) <= width / 2
      ) {
        sampledEntityHits.set(
          candidate.id,
          (sampledEntityHits.get(candidate.id) ?? 0) + 1,
        );
      }
    }
  }

  for (const candidate of nearbyCandidates) {
    const box = component(candidate, "minecraft:collision_box");
    const width = box?.width ?? 1;
    const height = box?.height ?? 1;
    const location = candidate.location;
    let cornersInside = 0;
    for (const xSign of [-1, 1]) {
      for (const ySign of [0, 1]) {
        for (const zSign of [-1, 1]) {
          if (isInsideBreathNodeSegment({
            x: location.x + xSign * width / 2,
            y: location.y + ySign * height,
            z: location.z + zSign * width / 2,
          }, start, end, radius)) {
            cornersInside += 1;
          }
        }
      }
    }
    const density = Math.max(
      (sampledEntityHits.get(candidate.id) ?? 0) * sampleDensity,
      cornersInside * intensity * 0.125,
    );
    if (density > 0) addEntityExposure(entityExposure, candidate, density, direction);
  }

  node.position = end;
  if (collision.extinguished) node.age = node.profile.lifespan + 1;
  else {
    if (collision.collided) node.age += 5;
    if (collision.collided || length < node.profile.speed * 0.25) {
      node.age += 20;
    }
  }
  return collision;
}

function emitNodeParticle(dragon, breath, node) {
  if (!isLocationInLoadedChunk(dragon.dimension, node.position)) return;
  try {
    dragon.dimension.spawnParticle(breath.particle, node.position);
  } catch (error) {
    if (reportedParticleErrors.has(breath.particle)) return;
    reportedParticleErrors.add(breath.particle);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[DragonMounts2] Breath particle ${breath.particle} failed: ${message}`,
    );
  }
}

function applyBreathDamage(
  dragon,
  target,
  breath,
  direction,
  hitDensity,
  damageDue = true,
) {
  let damage = breath.damage * hitDensity;
  let knockback = 0;
  const onFire = isEntityOnFire(target);
  const inPowderSnow = isEntityInPowderSnow(target);
  switch (breath.effect) {
    case "fire":
      target.setOnFire(4, true);
      if (inPowderSnow) damage *= 2;
      else if (target.isInWater) damage *= 1.5;
      break;
    case "nether":
      target.setOnFire(8, true);
      if (inPowderSnow) damage *= 2.5;
      else if (target.isInWater) damage *= 2;
      break;
    case "ice":
      if (onFire) {
        target.extinguishFire();
        damage *= 2;
      }
      knockback = 0.075 * hitDensity;
      break;
    case "water":
    {
      const aquatic = target.matches?.({ families: ["aquatic"] }) === true;
      const breathable = component(target, "minecraft:breathable");
      const waterBreathing = target.getEffect("water_breathing");
      if (aquatic) damage += 4;
      if (breathable?.breathesWater === true || waterBreathing) {
        damage *= 0.5;
      }
      if (onFire) {
        target.extinguishFire();
        damage *= 1.5;
      }
      knockback = 0.05 * hitDensity;
      break;
    }
    case "airflow":
      // Java AetherBreath: wind puts the target out.
      if (onFire) target.extinguishFire();
      knockback = 0.1 * hitDensity;
      break;
    case "sculk":
      if (hitDensity > 0.2) {
        target.addEffect("darkness", 80, { amplifier: 0 });
      }
      knockback = 0.05 * hitDensity;
      break;
    case "poison":
      target.addEffect(
        "poison",
        Math.min(200, Math.max(1, Math.round(4 * hitDensity))),
        { amplifier: 0 },
      );
      break;
    case "lightning":
      if (target.isInWater) damage *= 1.5;
      target.setOnFire(5, true);
      knockback = 0.05 * hitDensity;
      break;
  }

  // Accumulated density makes per-hit damage large, so (like Java's hurt
  // invulnerability) it is applied once per interval; knockback rides along.
  if (!damageDue) return;
  applyDragonCombatDamage(dragon, target, damage);
  if (knockback > 0) {
    const capped = Math.min(knockback, 1);
    target.applyImpulse({
      x: direction.x * capped,
      y: 0.04,
      z: direction.z * capped,
    });
  }
}

export function getDragonProjectileAbility(dragon) {
  return PROJECTILE_ABILITIES[dragon?.typeId] ?? DEFAULT_PROJECTILE_ABILITY;
}

export function launchDragonProjectile(dragon, direction, chargePower = 0) {
  if (!valid(dragon) || !direction || !Number.isFinite(chargePower)) {
    throw new TypeError("Invalid dragon projectile launch");
  }
  const directionLength = Math.hypot(direction.x, direction.y, direction.z);
  if (
    !Number.isFinite(directionLength) ||
    directionLength < 0.001
  ) {
    throw new TypeError("Dragon projectile direction must be non-zero");
  }
  const aim = {
    x: direction.x / directionLength,
    y: direction.y / directionLength,
    z: direction.z / directionLength,
  };
  const head = dragon.getHeadLocation();
  const speed = 1 + Math.max(0, Math.min(1, chargePower));
  const ability = getDragonProjectileAbility(dragon);
  let projectileEntity;
  try {
    projectileEntity = dragon.dimension.spawnEntity(ability.entity, {
      x: head.x + aim.x * 1.5,
      y: head.y + aim.y * 1.5,
      z: head.z + aim.z * 1.5,
    });
    const projectile = projectileEntity.getComponent("minecraft:projectile");
    if (!projectile) throw new Error(`${ability.entity} is missing its projectile component`);
    projectile.owner = dragon;
    projectile.shoot({
      x: aim.x * speed,
      y: aim.y * speed,
      z: aim.z * speed,
    });
  } catch (error) {
    if (valid(projectileEntity)) {
      try {
        projectileEntity.remove();
      } catch (removeError) {
        const message = removeError instanceof Error
          ? removeError.message
          : String(removeError);
        console.warn(`[DragonMounts2] Failed to remove incomplete ${ability.entity}: ${message}`);
      }
    }
    throw error;
  }
  if (ability.launchSound) {
    try {
      dragon.dimension.playSound(ability.launchSound, head);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[DragonMounts2] ${ability.name} launch sound failed: ${message}`,
      );
    }
  }
}

function updateBlockState(block, stateName, value) {
  const states = block.permutation.getAllStates();
  if (
    !Object.prototype.hasOwnProperty.call(states, stateName) ||
    states[stateName] === value
  ) return false;
  block.setPermutation(block.permutation.withState(stateName, value));
  return true;
}

// Java AetherBreath.getDestroyDensity = hardness^2 * 400 for blocks in the
// airflow_destructible tag. Bedrock has no hardness API, so the tag members
// are mapped to their Java hardness values.
const AIRFLOW_HARDNESS_EXACT = new Map([
  ["minecraft:web", 4],
  ["minecraft:cactus", 0.4],
  ["minecraft:chorus_plant", 0.4],
  ["minecraft:sponge", 0.6],
  ["minecraft:cocoa", 0.2],
  ["minecraft:snow_layer", 0.1],
  ["minecraft:moss_carpet", 0.1],
  ["minecraft:pale_moss_carpet", 0.1],
  ["minecraft:sand", 0.5],
  ["minecraft:red_sand", 0.5],
  ["minecraft:suspicious_sand", 0.25],
]);
const AIRFLOW_ZERO_HARDNESS_EXACT = new Set([
  "minecraft:short_grass", "minecraft:tallgrass", "minecraft:tall_grass",
  "minecraft:fern", "minecraft:large_fern", "minecraft:deadbush",
  "minecraft:vine", "minecraft:glow_lichen", "minecraft:double_plant",
  "minecraft:hanging_roots", "minecraft:brown_mushroom", "minecraft:red_mushroom",
  "minecraft:small_dripleaf_block", "minecraft:big_dripleaf",
  "minecraft:sweet_berry_bush", "minecraft:waterlily", "minecraft:reeds",
  "minecraft:nether_sprouts", "minecraft:nether_wart", "minecraft:crimson_roots",
  "minecraft:crimson_fungus", "minecraft:warped_roots", "minecraft:warped_fungus",
  "minecraft:twisting_vines", "minecraft:weeping_vines", "minecraft:cave_vines",
  "minecraft:cave_vines_body_with_berries", "minecraft:cave_vines_head_with_berries",
  "minecraft:fire", "minecraft:soul_fire",
]);
const AIRFLOW_ZERO_HARDNESS_PATTERN =
  /(^minecraft:(yellow_flower|red_flower|wither_rose|rose_bush|peony|lilac|sunflower|cornflower|torchflower|pitcher_plant)$)|(_tulip$)|(sapling$)|(^minecraft:(wheat|carrots|potatoes|beetroot|melon_stem|pumpkin_stem|torchflower_crop|pitcher_crop)$)|(torch$)|(^minecraft:(spore_blossom|azalea|flowering_azalea|pink_petals)$)/;

function airflowDestroyDensity(typeId) {
  if (AIRFLOW_HARDNESS_EXACT.has(typeId)) {
    const hardness = AIRFLOW_HARDNESS_EXACT.get(typeId);
    return hardness * hardness * 400;
  }
  if (typeId.endsWith("_leaves") || typeId === "minecraft:leaves" || typeId === "minecraft:leaves2") {
    return 0.2 * 0.2 * 400;
  }
  if (typeId.endsWith("glass_pane")) return 0.3 * 0.3 * 400;
  if (typeId.endsWith("_concrete_powder")) return 0.5 * 0.5 * 400;
  if (AIRFLOW_ZERO_HARDNESS_EXACT.has(typeId)) return 0;
  if (AIRFLOW_ZERO_HARDNESS_PATTERN.test(typeId)) return 0;
  return null;
}

function applyAirflowBlockEffects(block, state, hitDensity) {
  // Extinguish lit candles / campfires (Java AetherBreath).
  if (
    updateBlockState(block, "lit", false) ||
    updateBlockState(block, "extinguished", true)
  ) return;
  const threshold = airflowDestroyDensity(block.typeId);
  if (threshold === null) return;
  // Java keeps per-face hit density that decays after ~10 ticks without a hit.
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  state.airflowBlockExposure ??= new Map();
  const previous = state.airflowBlockExposure.get(key);
  const exposure = (previous && system.currentTick - previous.lastTick <= 10
    ? previous.density
    : 0) + hitDensity;
  state.airflowBlockExposure.set(key, {
    density: exposure,
    lastTick: system.currentTick,
  });
  for (const [position, record] of state.airflowBlockExposure) {
    if (system.currentTick - record.lastTick > 10) {
      state.airflowBlockExposure.delete(position);
    }
  }
  if (exposure <= threshold) return;
  state.airflowBlockExposure.delete(key);
  const { x, y, z } = block.location;
  try {
    block.dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
  } catch {
    block.setType("minecraft:air");
  }
}

function applyBreathBlockEffects(
  dragon,
  state,
  block,
  direction,
  breath,
  hitDensity = DEFAULT_BREATH_NODE_PROFILE.intensity,
) {
  const typeId = block.typeId;
  const iceBreath = breath.effect === "ice";
  const waterBreath = breath.effect === "water" ||
    dragon.typeId === "dragonmounts2:storm_dragon";
  const fireBreath = breath.effect === "fire" || breath.effect === "nether";

  try {
    if (iceBreath || waterBreath) {
      if (typeId === "minecraft:lava") {
        const depth = block.permutation.getState("liquid_depth");
        block.setType(depth === undefined || depth === 0
          ? "minecraft:obsidian"
          : "minecraft:cobblestone");
        return;
      }
      if (
        typeId === "minecraft:fire" ||
        typeId === "minecraft:soul_fire"
      ) {
        block.setType("minecraft:air");
        return;
      }
      if (
        updateBlockState(block, "lit", false) ||
        updateBlockState(block, "extinguished", true)
      ) return;
    }

    if (breath.effect === "airflow") {
      applyAirflowBlockEffects(block, state, hitDensity);
      return;
    }

    if (iceBreath) {
      if (typeId === "minecraft:water") {
        const depth = block.permutation.getState("liquid_depth");
        if (depth === undefined || depth === 0) block.setType("minecraft:ice");
        return;
      }
      const snowPosition = {
        x: block.location.x,
        y: block.location.y + 1,
        z: block.location.z,
      };
      const snow = block.dimension.getBlock(snowPosition);
      if (snow?.isAir && !block.isLiquid) {
        snow.setType("minecraft:snow");
      } else if (snow?.typeId === "minecraft:snow") {
        const height = snow.permutation.getState("height");
        if (typeof height === "number" && height < 7) {
          snow.setPermutation(snow.permutation.withState("height", height + 1));
        }
      }
      return;
    }

    if (waterBreath && typeId === "minecraft:farmland") {
      const moisture = block.permutation.getState("moisturized_amount");
      if (typeof moisture === "number" && moisture < 7) {
        block.setPermutation(
          block.permutation.withState("moisturized_amount", moisture + 1),
        );
      }
      return;
    }

    if (waterBreath) return;

    if (fireBreath) {
      if (updateBlockState(block, "lit", true)) return;
      if (updateBlockState(block, "extinguished", false)) return;
      if (typeId === "minecraft:fire" || typeId === "minecraft:soul_fire") {
        return;
      }
      if (typeId === "minecraft:snow") {
        const height = block.permutation.getState("height");
        if (typeof height === "number" && height > 0) {
          block.setPermutation(
            block.permutation.withState("height", height - 1),
          );
        } else {
          block.setType("minecraft:air");
        }
        return;
      }
      if (
        typeId === "minecraft:ice" ||
        typeId === "minecraft:packed_ice" ||
        typeId === "minecraft:blue_ice" ||
        typeId === "minecraft:frosted_ice" ||
        typeId === "minecraft:powder_snow"
      ) {
        block.setType("minecraft:air");
        return;
      }

      const key = `${block.location.x},${block.location.y},${block.location.z}`;
      const previous = state.breathBlockExposure?.get(key);
      const exposure = previous?.lastTick === system.currentTick - 1
        ? previous.ticks + 1
        : 1;
      state.breathBlockExposure ??= new Map();
      state.breathBlockExposure.set(key, {
        ticks: exposure,
        lastTick: system.currentTick,
      });
      for (const [position, record] of state.breathBlockExposure) {
        if (system.currentTick - record.lastTick > 1) {
          state.breathBlockExposure.delete(position);
        }
      }
      const igniteSkipChance = breath.effect === "nether" ? 0.1875 : 0.0625;
      if (exposure < 6 || Math.random() < igniteSkipChance) return;

      const axes = [
        ["x", direction.x],
        ["y", direction.y],
        ["z", direction.z],
      ].sort((first, second) => Math.abs(second[1]) - Math.abs(first[1]));
      const [axis, componentValue] = axes[0];
      if (Math.abs(componentValue) < 0.001) return;
      const firePosition = {
        x: block.location.x,
        y: block.location.y,
        z: block.location.z,
      };
      firePosition[axis] -= Math.sign(componentValue);
      const fireSpace = block.dimension.getBlock(firePosition);
      const support = block.dimension.getBlock({
        x: firePosition.x,
        y: firePosition.y - 1,
        z: firePosition.z,
      });
      if (fireSpace?.isAir && support && !support.isAir && !support.isLiquid) {
        fireSpace.setType("minecraft:fire");
        state.breathBlockExposure.delete(key);
      }
    }

    const isSculkReplaceable = SCULK_REPLACEABLE_BLOCKS.has(typeId) ||
      (typeof block.hasTag === "function" &&
        block.hasTag("minecraft:sculk_replaceable"));
    if (breath.effect === "sculk" && isSculkReplaceable) {
      const key = `${block.location.x},${block.location.y},${block.location.z}`;
      state.sculkBlockExposure ??= new Map();
      const previous = state.sculkBlockExposure.get(key);
      const exposure = (previous?.lastTick === system.currentTick - 1
        ? previous.density
        : 0) + hitDensity;
      state.sculkBlockExposure.set(key, {
        density: exposure,
        lastTick: system.currentTick,
      });
      for (const [position, record] of state.sculkBlockExposure) {
        if (system.currentTick - record.lastTick > 1) {
          state.sculkBlockExposure.delete(position);
        }
      }
      if (
        exposure < 2 ||
        system.currentTick < (state.nextSculkSpreadAt ?? 0) ||
        Math.random() >= 0.5
      ) return;

      const catalyst = Math.random() < 0.02;
      block.setType(catalyst ? "minecraft:sculk_catalyst" : "minecraft:sculk");
      state.nextSculkSpreadAt = system.currentTick + 20;
      state.sculkBlockExposure.delete(key);
      if (!catalyst && Math.random() < 0.08) {
        const above = block.dimension.getBlock({
          x: block.location.x,
          y: block.location.y + 1,
          z: block.location.z,
        });
        if (above?.isAir) {
          above.setType("minecraft:sculk_vein");
          updateBlockState(above, "down", true);
        }
      }
    }
  } catch (error) {
    if (!reportedBreathBlockErrors.has(dragon.typeId)) {
      reportedBreathBlockErrors.add(dragon.typeId);
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[DragonMounts2] Breath block effect failed for ${dragon.typeId}: ${message}`,
      );
    }
  }
}

function spawnBreathEffectCloud(dimension, block, owner, cloudEffect) {
  const createdAt = system.currentTick;
  elementalClouds.set(++nextWaterballCloudId, {
    dimension,
    location: {
      x: block.location.x + 0.5,
      y: block.location.y + 1,
      z: block.location.z + 0.5,
    },
    owner,
    effect: cloudEffect.effect,
    effectDuration: cloudEffect.duration,
    particle: cloudEffect.particle,
    radiusStart: cloudEffect.radius,
    radiusEnd: 1,
    lifetime: cloudEffect.lifetime,
    ignoreOwner: true,
    createdAt,
    nextApplyAt: createdAt + 10,
    nextVisualAt: createdAt,
  });
}

function tryLightningStrike(dragon, state, block) {
  if (
    system.currentTick < state.nextLightningAt ||
    Math.random() >= 0.06
  ) return;
  const location = {
    x: block.location.x + 0.5,
    y: block.location.y + 1,
    z: block.location.z + 0.5,
  };
  if (distanceSquared(dragon.location, location) < 25) return;
  dragon.dimension.spawnEntity("minecraft:lightning_bolt", location);
  state.nextLightningAt = system.currentTick + 20;
}

function normalizeDirection(direction) {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 0.001) return { x: 0, y: 0, z: 1 };
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
}

// `spawn` = false keeps already-flying nodes moving/hurting after the dragon stops
// breathing, as Java does (nodes are only removed by age, collision or water).
function tickBreathNodes(
  dragon,
  target,
  state,
  breath,
  aimedDirection = null,
  spawn = true,
) {
  const now = system.currentTick;
  state.nodesTickedAt = now;
  state.lastBreath = breath;
  const profile = breathNodeProfile(dragon);
  let direction;
  if (spawn) {
    const head = dragon.getHeadLocation();
    direction = aimedDirection
      ? normalizeDirection(aimedDirection)
      : getAttackDirection(dragon, target, head);
    state.lastAim = direction;
    state.breathNodes.push({
      position: { x: head.x, y: head.y, z: head.z },
      velocity: {
        x: (direction.x + truncatedGaussian(NODE_SPEED_VARIATION_ABS)) * profile.speed,
        y: (direction.y + truncatedGaussian(NODE_SPEED_VARIATION_ABS)) * profile.speed,
        z: (direction.z + truncatedGaussian(NODE_SPEED_VARIATION_ABS)) * profile.speed,
      },
      profile,
      age: 0,
    });
  } else {
    direction = state.lastAim ?? { x: 0, y: 0, z: 1 };
  }

  const candidates = dragon.dimension.getEntities({
    location: dragon.location,
    maxDistance: BREATH_NODE_MAX_DISTANCE,
  }).filter((candidate) =>
    !isFriendly(dragon, candidate) &&
    !(dragon.typeId === "dragonmounts2:forest_dragon" &&
      !canForestBreathAffect(candidate))
  );
  const blockExposure = new Map();
  const entityExposure = new Map();

  for (const node of state.breathNodes) {
    if (node.age >= node.profile.lifespan) continue;
    sampleBreathNode(
      dragon,
      node,
      candidates,
      blockExposure,
      entityExposure,
    );
    if ((now & 1) === 0) {
      emitNodeParticle(dragon, breath, node);
    }
  }
  state.breathNodes = state.breathNodes.filter(
    (node) => node.age < node.profile.lifespan,
  );

  for (const { block, density, direction: blockDirection } of blockExposure.values()) {
    if (density <= 0) continue;
    const blockDirectionLength = Math.hypot(
      blockDirection.x,
      blockDirection.y,
      blockDirection.z,
    );
    const normalizedBlockDirection = blockDirectionLength > 0
      ? {
        x: blockDirection.x / blockDirectionLength,
        y: blockDirection.y / blockDirectionLength,
        z: blockDirection.z / blockDirectionLength,
      }
      : direction;
    applyBreathBlockEffects(
      dragon,
      state,
      block,
      normalizedBlockDirection,
      breath,
      density,
    );
    if (
      breath.cloud &&
      !block.isLiquid &&
      Math.random() < breath.cloud.chance
    ) {
      spawnBreathEffectCloud(dragon.dimension, block, dragon, breath.cloud);
    }
    if (
      dragon.typeId === "dragonmounts2:storm_dragon" &&
      !block.isLiquid
    ) tryLightningStrike(dragon, state, block);
  }

  // Java BreathAffectedEntity: hit density accumulates every tick the entity is
  // touched and is only reset once it has not been hit for a few ticks.
  for (const { entity, density, direction: hitDirection } of entityExposure.values()) {
    if (density <= 0 || !valid(entity)) continue;
    let record = state.affectedEntities.get(entity.id);
    if (!record) {
      record = {
        entity,
        density: 0,
        direction: { x: 0, y: 0, z: 0 },
        lastHitAt: now,
        lastDamageAt: -Infinity,
      };
      state.affectedEntities.set(entity.id, record);
    }
    record.entity = entity;
    record.density += density;
    record.direction = addVector(record.direction, hitDirection);
    record.lastHitAt = now;
  }
  for (const [id, record] of state.affectedEntities) {
    if (
      !valid(record.entity) ||
      now - record.lastHitAt >= ENTITY_DENSITY_RESET_TICKS
    ) {
      state.affectedEntities.delete(id);
      continue;
    }
    const damageDue = now - record.lastDamageAt >= BREATH_DAMAGE_INTERVAL;
    if (damageDue) record.lastDamageAt = now;
    applyBreathDamage(
      dragon,
      record.entity,
      breath,
      normalizeDirection(record.direction),
      record.density,
      damageDue,
    );
  }
}

function canForestBreathAffect(target) {
  return target.typeId === "minecraft:player" ||
    target.matches?.({ families: ["monster"] }) === true;
}

function tickBreath(dragon, target, state, aerial) {
  const targetInRange = valid(target) &&
    distanceSquared(dragon.location, target.location) <= BREATH_RANGE ** 2;
  const airDuel = aerial && targetInRange && isAirborne(target);
  const breath = BREATH_TYPES[dragon.typeId];

  if (
    dragon.getProperty("dragonmounts2:age_variant") === "baby" ||
    dragon.isInWater ||
    !breath
  ) {
    endAIBreath(dragon, state);
    return false;
  }

  if (state.breathStartedAt >= 0) {
    const expired = system.currentTick - state.breathStartedAt >= BREATH_DURATION;
    const airDuel = aerial && targetInRange && isAirborne(target);
    const targetTooClose = aerial && targetInRange && !isAirborne(target) &&
      distanceSquared(dragon.location, target.location) < 100;
    if (!targetInRange || (expired && !airDuel) || targetTooClose) {
      endAIBreath(dragon, state);
      return false;
    }

    tickBreathNodes(
      dragon,
      target,
      state,
      breath,
      null,
      system.currentTick - state.breathStartedAt >= BREATH_START_DELAY,
    );
    return true;
  }

  if (!targetInRange) return false;
  const cooldownReady = !state.hasBreathed ||
    system.currentTick - state.lastBreathEndedAt >= BREATH_COOLDOWN;
  const longFight = state.targetSince >= 0 &&
    system.currentTick - state.targetSince >= LONG_FIGHT_TICKS;
  if (airDuel || (cooldownReady &&
      (targetIsDangerous(target) || (longFight && !targetIsTrivial(target))))) {
    state.breathStartedAt = system.currentTick;
    setAIBreathing(dragon, true);
    return true;
  }
  return false;
}

function spawnParticleBurst(dimension, particle, location, count, spread) {
  try {
    for (let index = 0; index < count; index += 1) {
      const particleLocation = {
        x: location.x + (Math.random() * 2 - 1) * spread.x,
        y: location.y + (Math.random() * 2 - 1) * spread.y,
        z: location.z + (Math.random() * 2 - 1) * spread.z,
      };
      if (!isLocationInLoadedChunk(dimension, particleLocation)) continue;
      dimension.spawnParticle(particle, particleLocation);
    }
  } catch (error) {
    if (reportedParticleErrors.has(particle)) return;
    reportedParticleErrors.add(particle);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[DragonMounts2] Projectile particle ${particle} failed: ${message}`);
  }
}

function spawnElementalCloud(dimension, impactLocation, owner, impact) {
  let location = { x: impactLocation.x, y: impactLocation.y, z: impactLocation.z };
  try {
    const nearbyLivingEntities = dimension.getEntities({
      location: impactLocation,
      maxDistance: 4,
    });
    const firstNearbyTarget = nearbyLivingEntities.find((target) => {
      if (!component(target, "minecraft:health")) return false;
      const dx = target.location.x - impactLocation.x;
      const dy = target.location.y - impactLocation.y;
      const dz = target.location.z - impactLocation.z;
      return dx * dx + dy * dy + dz * dz < 16;
    });
    if (firstNearbyTarget) {
      location = {
        x: firstNearbyTarget.location.x,
        y: firstNearbyTarget.location.y,
        z: firstNearbyTarget.location.z,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[DragonMounts2] Waterball cloud target scan failed: ${message}`);
  }

  const createdAt = system.currentTick;
  elementalClouds.set(++nextWaterballCloudId, {
    dimension,
    location,
    owner,
    effect: impact.effect,
    particle: impact.particle,
    createdAt,
    nextApplyAt: createdAt + 10,
    nextVisualAt: createdAt,
  });
}

function tickElementalClouds() {
  const now = system.currentTick;
  for (const [id, cloud] of elementalClouds) {
    const lifetime = cloud.lifetime ?? ELEMENTAL_CLOUD_LIFETIME;
    if (now >= cloud.createdAt + lifetime) {
      elementalClouds.delete(id);
      continue;
    }
    if (!isLocationInLoadedChunk(cloud.dimension, cloud.location)) {
      elementalClouds.delete(id);
      continue;
    }
    const elapsed = now - cloud.createdAt;
    const progress = Math.min(1, elapsed / lifetime);
    const radius = cloud.radiusStart === undefined
      ? 3 + 4 * (elapsed / ELEMENTAL_CLOUD_LIFETIME)
      : cloud.radiusStart + (cloud.radiusEnd - cloud.radiusStart) * progress;
    if (now >= cloud.nextVisualAt) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      const particleLocation = {
        x: cloud.location.x + Math.cos(angle) * distance,
        y: cloud.location.y + (Math.random() - 0.5) * 0.6,
        z: cloud.location.z + Math.sin(angle) * distance,
      };
      try {
        if (isLocationInLoadedChunk(cloud.dimension, particleLocation)) {
          cloud.dimension.spawnParticle(cloud.particle, particleLocation);
        }
      } catch (error) {
        if (!reportedParticleErrors.has(cloud.particle)) {
          reportedParticleErrors.add(cloud.particle);
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[DragonMounts2] Elemental cloud particle ${cloud.particle} failed: ${message}`,
          );
        }
      }
      cloud.nextVisualAt = now + ELEMENTAL_CLOUD_VISUAL_INTERVAL;
    }
    if (now < cloud.nextApplyAt) continue;
    try {
      const targets = cloud.dimension.getEntities({
        location: cloud.location,
        maxDistance: radius,
      });
      for (const target of targets) {
        if (
          !valid(target) ||
          !component(target, "minecraft:health") ||
          (cloud.ignoreOwner !== false && target.id === cloud.owner?.id)
        ) continue;
        const dx = target.location.x - cloud.location.x;
        const dy = target.location.y - cloud.location.y;
        const dz = target.location.z - cloud.location.z;
        if (dx * dx + dy * dy + dz * dz <= radius * radius) {
          if (cloud.effect) {
            target.addEffect(cloud.effect, cloud.effectDuration ?? 1, {
              amplifier: cloud.effectDuration === undefined ? 1 : 0,
            });
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] Elemental cloud update failed: ${message}`);
      elementalClouds.delete(id);
      continue;
    }
    cloud.nextApplyAt = now + ELEMENTAL_CLOUD_EFFECT_INTERVAL;
  }
}

function applyImpactKnockback(owner, target, strength) {
  if (!valid(owner)) return;
  const dx = target.location.x - owner.location.x;
  const dz = target.location.z - owner.location.z;
  const length = Math.max(Math.hypot(dx, dz), 0.001);
  target.applyImpulse({
    x: dx / length * strength,
    y: 0.04,
    z: dz / length * strength,
  });
}

function getProjectileImpactLocation(event, dimension, hitEntity, hitBlock) {
  const candidates = [
    event.hitVector,
    hitBlock?.location && {
      x: hitBlock.location.x + 0.5,
      y: hitBlock.location.y + 0.5,
      z: hitBlock.location.z + 0.5,
    },
    hitEntity?.location,
    event.projectile?.location,
  ];
  for (const location of candidates) {
    if (
      !location ||
      (location.x === -1 && location.y === -1 && location.z === -1) ||
      (location.x === 0 && location.y === -1 && location.z === -1) ||
      (location.x === 0 && location.y === 0 && location.z === -1) ||
      !isLocationInLoadedChunk(dimension, location)
    ) continue;
    return { x: location.x, y: location.y, z: location.z };
  }
  return null;
}

function applyElementalProjectileImpact(event, impact) {
  const dimension = event.dimension;
  if (!dimension) return;
  const owner = component(
    event.projectile,
    "minecraft:projectile",
  )?.owner ?? event.source;
  let hitEntity;
  if (typeof event.getEntityHit === "function") {
    try {
      hitEntity = event.getEntityHit()?.entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] Elemental projectile hit lookup failed: ${message}`);
    }
  }
  let hitBlock;
  if (typeof event.getBlockHit === "function") {
    try {
      hitBlock = event.getBlockHit()?.block;
    } catch (error) {
      if (!reportedBreathBlockErrors.has("projectile-hit")) {
        reportedBreathBlockErrors.add("projectile-hit");
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[DragonMounts2] Breath projectile block lookup failed: ${message}`);
      }
    }
  }
  const location = getProjectileImpactLocation(
    event,
    dimension,
    hitEntity,
    hitBlock,
  );
  if (!location) {
    if (valid(event.projectile)) event.projectile.remove();
    return;
  }
  if (impact.cloud && hitEntity?.id === owner?.id) {
    if (valid(event.projectile)) event.projectile.remove();
    return;
  }

  spawnParticleBurst(
    dimension,
    impact.particle,
    location,
    impact.particleCount ?? 1,
    { x: 0.8, y: 0.5, z: 0.8 },
  );
  if (impact.secondaryParticle) {
    spawnParticleBurst(
      dimension,
      impact.secondaryParticle,
      location,
      impact.secondaryParticleCount ?? 1,
      { x: 0.6, y: 0.6, z: 0.6 },
    );
  }
  try {
    dimension.playSound(impact.sound, location);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[DragonMounts2] Projectile impact sound ${impact.sound} failed: ${message}`);
  }

  if (impact.cloud) {
    spawnElementalCloud(dimension, location, owner, impact);
    if (valid(event.projectile)) event.projectile.remove();
    return;
  }

  if (
    hitBlock &&
    !hitEntity &&
    valid(owner) &&
    entityData.dragonTypeIds.has(owner.typeId)
  ) {
    const breath = BREATH_TYPES[owner.typeId];
    if (breath) {
      applyBreathBlockEffects(
        owner,
        stateFor(owner),
        hitBlock,
        { x: 0, y: 0, z: 0 },
        breath,
      );
    }
  }

  if (
    impact.breathCloud &&
    !hitEntity &&
    hitBlock &&
    !hitBlock.isAir &&
    !hitBlock.isLiquid &&
    Math.random() < impact.breathCloud.chance
  ) {
    spawnBreathEffectCloud(
      dimension,
      hitBlock,
      owner,
      impact.breathCloud,
    );
  }

  if (
    impact.lightningStrike === true &&
    !hitEntity &&
    (!valid(owner) || distanceSquared(owner.location, location) >= 25)
  ) {
    dimension.spawnEntity("minecraft:lightning_bolt", location);
  }

  for (const target of dimension.getEntities({
    location,
    maxDistance: 3,
  })) {
    if (
      !component(target, "minecraft:health") ||
      target.id === owner?.id ||
      (valid(owner) && isFriendly(owner, target))
    ) continue;
    switch (impact.effect) {
      case "fire":
        target.setOnFire(4, true);
        break;
      case "nether":
        target.setOnFire(8, true);
        break;
      case "ice":
        if (isEntityOnFire(target)) target.extinguishFire();
        break;
      case "water":
        if (isEntityOnFire(target)) target.extinguishFire();
        applyImpactKnockback(owner, target, 0.05);
        break;
      case "lightning":
        target.setOnFire(5, true);
        applyImpactKnockback(owner, target, 0.05);
        break;
      case "airflow":
        if (isEntityOnFire(target)) target.setOnFire(5, true);
        applyImpactKnockback(owner, target, 0.1);
        break;
      case "knockback":
        applyImpactKnockback(owner, target, 0.1);
        break;
      case "poison":
        target.addEffect("poison", 4, { amplifier: 0 });
        break;
      case "sculk":
        target.addEffect("darkness", 80, { amplifier: 0 });
        break;
      default:
        break;
    }
  }
}

registerIntervalTask("elemental-cloud-effects", 5, tickElementalClouds);

function handleElementalProjectileImpact(event) {
  const impact = ELEMENTAL_PROJECTILE_IMPACTS[event.projectile?.typeId] ??
    BREATH_PROJECTILE_IMPACTS[event.projectile?.typeId];
  if (impact) applyElementalProjectileImpact(event, impact);
}

onWorldEvent("afterEvents", "projectileHitEntity", handleElementalProjectileImpact);
onWorldEvent("afterEvents", "projectileHitBlock", handleElementalProjectileImpact);

export function rememberDragonCombatHurt({ hurtEntity, damageSource }) {
  if (!valid(hurtEntity)) return;
  const attacker = damageSource?.damagingEntity;
  if (!valid(attacker) || attacker.id === hurtEntity.id) return;

  if (
    entityData.dragonTypeIds.has(attacker.typeId) &&
    damageSource.cause === EntityDamageCause.entityAttack &&
    attacker.getProperty("dragonmounts2:is_breathing") !== true &&
    attacker.getProperty("dragonmounts2:ai_breath_active") !== true
  ) {
    try {
      attacker.dimension.playSound(
        "dragonmounts2:mob.dragon.bite",
        attacker.location,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] Dragon melee sound failed: ${message}`);
    }
  }

  if (entityData.dragonTypeIds.has(hurtEntity.typeId)) {
    const state = stateFor(hurtEntity);
    state.dragonRevenge = attacker;
    state.dragonRevengeAt = system.currentTick;
  }
  if (hurtEntity.typeId === "minecraft:player") {
    rememberOwnedDragonTarget(hurtEntity, attacker, "ownerRevenge");
  }
  if (attacker.typeId === "minecraft:player") {
    rememberOwnedDragonTarget(attacker, hurtEntity, "ownerTarget");
  }
}

function rememberOwnedDragonTarget(owner, target, targetKind) {
  for (const dragon of owner.dimension.getEntities({
    location: owner.location,
    maxDistance: RETALIATION_RANGE,
    families: ["dragonmounts2"],
  })) {
    if (!entityData.dragonTypeIds.has(dragon.typeId)) continue;
    const ownerId = dragonOwnerId(dragon);
    if (ownerId !== owner.id || !isAttackable(dragon, target, target.id)) continue;
    const state = stateFor(dragon);
    state[targetKind] = target;
    state[`${targetKind}At`] = system.currentTick;
  }
}

onAfterEntityHurt(rememberDragonCombatHurt);
onWorldEvent("afterEvents", "entityDie", ({ deadEntity }) => {
  if (deadEntity?.id) runtimeByDragon.delete(deadEntity.id);
});

export function tickDragonCombat(dragon) {
  const result = tickDragonCombatInner(dragon);
  const state = valid(dragon) ? runtimeByDragon.get(dragon.id) : undefined;
  if (
    state &&
    state.breathNodes.length > 0 &&
    state.nodesTickedAt !== system.currentTick &&
    state.lastBreath
  ) {
    tickBreathNodes(dragon, null, state, state.lastBreath, null, false);
  }
  if (state && state.affectedEntities.size > 0 && state.breathNodes.length === 0) {
    // No nodes left: let stale densities expire.
    for (const [id, record] of state.affectedEntities) {
      if (system.currentTick - record.lastHitAt >= ENTITY_DENSITY_RESET_TICKS) {
        state.affectedEntities.delete(id);
      }
    }
  }
  return result;
}

function tickDragonCombatInner(dragon) {
  if (!dragon || !entityData.dragonTypeIds.has(dragon.typeId)) return null;
  if (!valid(dragon) || dragon.isDead) {
    runtimeByDragon.delete(dragon.id);
    return null;
  }
  if (system.currentTick - lastCleanupTick >= 200) {
    lastCleanupTick = system.currentTick;
    for (const [id, state] of runtimeByDragon) {
      if (!valid(state.dragon)) runtimeByDragon.delete(id);
    }
  }

  const state = stateFor(dragon);
  clearStaleTargets(state, system.currentTick);
  const riders = ridersOf(dragon);
  if (riders.length > 0) {
    endAIBreath(dragon, state);
    state.aerialCommitted = false;
    state.aerialTargetId = null;
    const rider = riders[0];
    const breath = BREATH_TYPES[dragon.typeId];
    const tameable = component(dragon, "minecraft:tameable");
    const canRiderBreathe = tameable?.isTamed === true &&
      dragon.hasComponent("minecraft:is_saddled") &&
      dragon.getProperty("dragonmounts2:age_variant") !== "baby" &&
      !dragon.isInWater &&
      dragon.getProperty("dragonmounts2:rider_attack_mode") === "breath" &&
      rider.isJumping === true &&
      breath;
    if (canRiderBreathe) {
      state.riderBreathing = true;
      state.breathBreathingTicks += 1;
      tickBreathNodes(
        dragon,
        null,
        state,
        breath,
        rider.getViewDirection(),
        state.breathBreathingTicks > BREATH_START_DELAY,
      );
    } else {
      state.breathBreathingTicks = 0;
      state.riderBreathing = false;
    }
    tryRiddenBite(dragon, state, riders);
    return null;
  }
  if (state.riderBreathing) {
    dragon.setProperty("dragonmounts2:is_breathing", false);
    dragon.setProperty("dragonmounts2:breath_charge", 0);
  }
  state.riderBreathing = false;
  if (dragon.getProperty("dragonmounts2:rider_attack_mode") !== "breath") {
    dragon.setProperty("dragonmounts2:rider_attack_mode", "breath");
  }

  if (
    dragon.getProperty("dragonmounts2:is_sleeping") === true ||
    dragon.getProperty("dragonmounts2:mob_state") === "sitting"
  ) {
    endAIBreath(dragon, state);
    state.target = null;
    state.targetSince = -1;
    state.aerialCommitted = false;
    state.aerialTargetId = null;
    return null;
  }

  const target = findTarget(dragon, state);
  if (target?.id !== state.target?.id) {
    endAIBreath(dragon, state);
    state.target = target;
    state.targetSince = valid(target) ? system.currentTick : -1;
  } else {
    state.target = valid(target) ? target : null;
  }

  if (!valid(target)) {
    endAIBreath(dragon, state);
    state.aerialCommitted = false;
    state.aerialTargetId = null;
    return null;
  }

  const flightTarget = aerialAttackPosition(dragon, target, state);
  const isFlying = dragon.getProperty("dragonmounts2:movement_state") === "flying";
  const breathing = tickBreath(dragon, target, state, isFlying);
  if (!breathing) tryAIMeleeAttack(dragon, target, state);
  return {
    lookTarget: target,
    flightTarget,
    holdPosition: breathing,
  };
}
