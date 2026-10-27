import {
  EntityDamageCause,
  MolangVariableMap,
  system,
} from "@minecraft/server";
import * as entityData from "../data/entity_data.js";
import { getSafeVelocity } from "./entity_utilities.js";
import { onAfterEntityHurt, onBeforeEntityHurt } from "../core/combat_events.js";
import { registerIntervalTask } from "../core/scheduler.js";
import { onWorldEvent } from "../core/world_events.js";
import { getAddonDimensions } from "../lib/runtime.js";
import {
  BREATH_PARTICLE_STYLES,
  breathDefinitionFor,
  FLAME_STYLE,
  LIGHTNING_KINDS,
  LIGHTNING_PROFILES,
} from "../data/breath_data.js";
import * as breathEffects from "./breath_effects.js";
import { spawnParticle } from "./particle_utilities.js";
import { getWorldEnvironmentalEffectsEnabled } from "../data/settings.js";

const TARGET_SCAN_RANGE = 16;
const TARGET_SCAN_INTERVAL = 10;
const RETALIATION_RANGE = 64;
const COMBAT_RANGE = 40;
const BREATH_RANGE = 32;
const BREATH_DURATION = 40;
const BREATH_COOLDOWN = 40;
const BREATH_MUZZLE_OFFSET = 1.25;
const BREATH_JAW_OFFSETS = Object.freeze({
  adult: 1.5,
  juvenile: 0.75,
  baby: 0.3,
});
const DRAGON_PROJECTILE_MUZZLE_OFFSET = 3;
const LIGHTNING_BOLT_ENTITY = "dragonmounts2:lightning_bolt";
const LIGHTNING_BEAM_TIMEOUT_EVENT = "dragonmounts2:refresh_timeout";
const LIGHTNING_BEAM_TIMEOUT_REFRESH_TICKS = 5;
const LIGHTNING_BEAM_MAX_LENGTH = BREATH_RANGE;
const STORM_STRIKE_INTERVAL = 10;
const STORM_STRIKE_CHANCE = 0.25;
const STORM_STRIKE_MIN_DISTANCE_SQ = 25;
const LIGHTNING_BEAM_AIM_SMOOTHING = 0.55;
const LIGHTNING_BEAM_AIM_EPSILON = 0.1;
const DRAGON_HARMLESS_ITEM_TAGS = Object.freeze([
  "dragonmounts2:is_dragon_scepter",
  "dragonmounts2:is_dragon_amulet",
]);
const RAD_TO_DEG = 180 / Math.PI;
const LONG_FIGHT_TICKS = 200;
const BREATH_LOOP_SOUND_PROFILES = Object.freeze({
  aether: "airflow",
  dark: "airflow",
  enchanted: "age",
  ender: "age",
  fire: "age",
  forest: "forest",
  ice: "ice",
  light: "airflow",
  moonlight: "lightning",
  nether: "age",
  sculk: null,
  skeleton: "age",
  storm: "lightning",
  sunlight: "lightning",
  terra: "age",
  water: "water",
  wither: "age",
  zombie: "forest",
});
const breathStopWarnings = new Set();
const reportedLightningRaycastErrors = new Set();
const MELEE_COOLDOWN = 40;
const RIDDEN_BITE_COOLDOWN = 15;
const RIDDEN_BITE_REACH = 2;
                                                                
                                                                 
                                                                
                                                    
                                
                                                                               
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
                                                                                    
const BREATH_START_DELAY_TICKS = 25;
                                                                                                  
const ENTITY_DENSITY_RESET_TICKS = 7;
                                                                            
const BREATH_DAMAGE_INTERVAL = 10;
                                                         
const NODE_SPEED_VARIATION_ABS = 0.05;
                                                                                
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
const PROJECTILE_SLOW_SPEED = 0.08;
const PROJECTILE_SLOW_TICKS = 10;
const PROJECTILE_MAX_AGE_TICKS = 1200;
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
const DRAGON_PROJECTILE_TYPES = Object.freeze([
  ...new Set([
    ...Object.values(PROJECTILE_ABILITIES).map((ability) => ability.entity),
    DEFAULT_PROJECTILE_ABILITY.entity,
  ]),
]);
const EXPLOSIVE_DRAGON_PROJECTILE_TYPES = new Set([
  "dragonmounts2:ender_dragonball",
  "dragonmounts2:fire_dragonball",
  "dragonmounts2:nether_dragonball",
]);
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
                                                                                               
const breathDefinitions = new Map();
const reportedLightningBoltErrors = new Set();
function breathFor(typeId) {
  let definition = breathDefinitions.get(typeId);
  if (definition === undefined) {
    definition = breathDefinitionFor(typeId);
    breathDefinitions.set(typeId, definition);
  }
  return definition;
}

                                                                                            
const IMPACT_EFFECT_BY_KIND = Object.freeze({
  fire: "fire", nether: "nether", ice: "ice", water: "water", storm: "lightning",
  aether: "airflow", sculk: "sculk", wither: "poison", moonlight: "lightning", sunlight: "lightning",
});
const IMPACT_PARTICLE_BY_KIND = Object.freeze({
  fire: "minecraft:basic_flame_particle", nether: "minecraft:basic_flame_particle",
  ice: "minecraft:snowflake_particle", water: "minecraft:splash_particle",
  forest: "minecraft:happy_villager_particle",
});
const BREATH_PROJECTILE_IMPACTS = (() => {
  const impacts = {};
  const add = (entityId, definition) => {
    impacts[entityId] = Object.freeze({
      effect: IMPACT_EFFECT_BY_KIND[definition.kind],
      particle: IMPACT_PARTICLE_BY_KIND[definition.kind] ?? "minecraft:basic_smoke_particle",
      particleCount: 24,
      sound: "dragonmounts2:mob.dragon.dragonbreath",
      lightningKind: LIGHTNING_KINDS.has(definition.kind) ? definition.kind : null,
      breathCloud: definition.cloud ?? undefined,
    });
  };
  for (const typeId of [
    "aether", "dark", "enchanted", "ender", "fire", "forest", "ice", "light", "moonlight",
    "nether", "sculk", "skeleton", "storm", "sunlight", "terra", "water", "wither", "zombie",
  ]) {
    const dragonId = `dragonmounts2:${typeId}_dragon`;
    add(`${dragonId}breath`, breathFor(dragonId));
  }
  add("dragonmounts2:blue_fire_dragonbreath", breathFor("dragonmounts2:fire_dragon"));
  return Object.freeze(impacts);
})();

const BREATH_PROJECTILE_DRAGONS = Object.freeze({
  "dragonmounts2:aether_dragonbreath": "dragonmounts2:aether_dragon",
  "dragonmounts2:dark_dragonbreath": "dragonmounts2:dark_dragon",
  "dragonmounts2:enchanted_dragonbreath": "dragonmounts2:enchanted_dragon",
  "dragonmounts2:ender_dragonbreath": "dragonmounts2:ender_dragon",
  "dragonmounts2:fire_dragonbreath": "dragonmounts2:fire_dragon",
  "dragonmounts2:blue_fire_dragonbreath": "dragonmounts2:fire_dragon",
  "dragonmounts2:forest_dragonbreath": "dragonmounts2:forest_dragon",
  "dragonmounts2:ice_dragonbreath": "dragonmounts2:ice_dragon",
  "dragonmounts2:light_dragonbreath": "dragonmounts2:light_dragon",
  "dragonmounts2:moonlight_dragonbreath": "dragonmounts2:moonlight_dragon",
  "dragonmounts2:nether_dragonbreath": "dragonmounts2:nether_dragon",
  "dragonmounts2:sculk_dragonbreath": "dragonmounts2:sculk_dragon",
  "dragonmounts2:skeleton_dragonbreath": "dragonmounts2:skeleton_dragon",
  "dragonmounts2:storm_dragonbreath": "dragonmounts2:storm_dragon",
  "dragonmounts2:sunlight_dragonbreath": "dragonmounts2:sunlight_dragon",
  "dragonmounts2:terra_dragonbreath": "dragonmounts2:terra_dragon",
  "dragonmounts2:water_dragonbreath": "dragonmounts2:water_dragon",
  "dragonmounts2:wither_dragonbreath": "dragonmounts2:wither_dragon",
  "dragonmounts2:zombie_dragonbreath": "dragonmounts2:zombie_dragon",
});

const runtimeByDragon = new Map();
const activeDragonProjectiles = new Map();
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
      lightningBeam: null,
      lightningBeamAim: null,
      lightningBeamSent: null,
      lightningBeamLastRefreshTick: 0,
      breathNodes: [],
      breathBreathingTicks: 0,
      nodesTickedAt: -1,
      lastBreath: null,
      lastAim: null,
      affectedEntities: new Map(),
      affectedBlocks: new Map(),
      breathMemo: {},
      breathCtx: null,
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
  origin = breathMouthLocation(dragon),
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
  if (
    !valid(target) ||
    target.id === dragon.id ||
    target.typeId === "dragonmounts2:attack_interaction"
  ) return true;
  if (ridersOf(dragon).some((rider) => rider.id === target.id)) return true;
  const ownerId = dragonOwnerId(dragon);
  if (ownerId && target.id === ownerId) return true;
  const targetTameable = component(target, "minecraft:tameable");
  if (targetTameable?.isTamed === true) return true;
  const targetOwnerId = targetTameable?.tamedToPlayerId;
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
  if (enabled) setBreathReady(dragon, false);
}

function setBreathReady(dragon, ready) {
  if (dragon.getProperty("dragonmounts2:breath_ready") !== ready) {
    dragon.setProperty("dragonmounts2:breath_ready", ready);
  }
}

export function stopDragonBreathAudio(dragon) {
  const dragonType = dragon.typeId
    .replace("dragonmounts2:", "")
    .replace("_dragon", "");
  const soundProfile = BREATH_LOOP_SOUND_PROFILES[dragonType];
  if (soundProfile) {
    const age = dragon.getProperty("dragonmounts2:age_variant");
    const ageSound = age === "baby"
      ? "hatchling"
      : age === "juvenile"
        ? "juvenile"
        : "adult";
    const sound = `dragonmounts2:mob.dragon.java_breath_loop_dragon_${dragonType}${
      soundProfile === "age" ? `_${ageSound}` : ""
    }`;
    for (const player of dragon.dimension.getPlayers({
      location: dragon.location,
      maxDistance: 40,
    })) {
      const sameTypeLoopActive = dragon.dimension.getEntities({
        location: player.location,
        maxDistance: 40,
      }).some((candidate) =>
        candidate.id !== dragon.id &&
        candidate.typeId === dragon.typeId &&
        candidate.getProperty("dragonmounts2:is_breathing") === true &&
        candidate.getProperty("dragonmounts2:breath_ready") === true
      );
      if (sameTypeLoopActive) continue;

      try {
        player.runCommand(`stopsound @s ${sound}`);
      } catch (error) {
        if (!breathStopWarnings.has(sound)) {
          breathStopWarnings.add(sound);
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[DragonMounts2] Failed to stop breath loop ${sound}: ${message}`,
          );
        }
      }
    }
  }
  dragon.triggerEvent("dragonmounts2:stop_breath_sound");
}

function endAIBreath(dragon, state) {
  if (dragon.getProperty("dragonmounts2:ai_breath_active") !== true) {
    state.breathStartedAt = -1;
    return;
  }
  removeLightningBreathBeam(state);
  dragon.setProperty("dragonmounts2:ai_breath_active", false);
  dragon.setProperty("dragonmounts2:is_breathing", false);
  setBreathReady(dragon, false);
  stopDragonBreathAudio(dragon);
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

                                                                                 
                                                                                      
const BREATH_CONE_START = 0.1;
function breathNodeRadius(node) {
  const origin = node.origin;
  const at = node.position;
  const travelled = origin && at
    ? Math.hypot(at.x - origin.x, at.y - origin.y, at.z - origin.z)
    : 0;
  const growth = Math.min(1, travelled / BREATH_CONE_LENGTH);
  return node.profile.radius * (BREATH_CONE_START + (1 - BREATH_CONE_START) * growth);
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
    cx: centre.x,
    cy: centre.y,
    cz: centre.z,
  };
}

                                                                                    
                                                                                         
                                                                                       
                                  
function packBlockKey(x, y, z) {
  return ((x & 0x1fffff) * 2097152 + (z & 0x1fffff)) * 512 + ((y + 64) & 511);
}
                                                                                    
                                                                                   
const BREATH_PASSABLE_PATTERN =
  /(flower|tulip|orchid|sapling|torch|grass|fern|vine|carpet|rail|button|lever|sign|banner|pressure_plate|tripwire|web|coral_fan|lichen|roots|mushroom|dripleaf|seagrass|kelp|candle|redstone_wire|snow_layer|petals|leaf_litter|deadbush|fire|poppy|dandelion|allium|bluet|daisy|lily|rose|peony|lilac|sunflower|cornflower|sprouts|wart$|ladder|scaffolding|^minecraft:light_block|^minecraft:structure_void)/;
function isBreathBlocking(block) {
  if (block.isAir || block.isLiquid) return false;
  if (block.isSolid) return true;
  return !BREATH_PASSABLE_PATTERN.test(block.typeId);
}
                                                                           
function lineBlocked(dimension, ax, ay, az, bx, by, bz) {
  for (const t of [0.34, 0.67, 1]) {
    const entry = cachedBlock(
      dimension,
      Math.floor(ax + (bx - ax) * t),
      Math.floor(ay + (by - ay) * t),
      Math.floor(az + (bz - az) * t),
    );
    if (entry?.solid) return true;
  }
  return false;
}
const nodeBlockCache = { tick: -1, byDimension: new Map() };
function cachedBlock(dimension, x, y, z) {
  const now = system.currentTick;
  if (nodeBlockCache.tick !== now) {
    nodeBlockCache.tick = now;
    nodeBlockCache.byDimension.clear();
  }
  let cache = nodeBlockCache.byDimension.get(dimension.id);
  if (!cache) {
    cache = new Map();
    nodeBlockCache.byDimension.set(dimension.id, cache);
  }
  const key = packBlockKey(x, y, z);
  let entry = cache.get(key);
  if (entry === undefined) {
    let block;
    try {
      block = dimension.getBlock({ x, y, z });
    } catch {
      block = undefined;
    }
    entry = block
      ? {
        block,
        key,
        x,
        y,
        z,
        air: block.isAir,
        liquid: block.isLiquid,
        solid: isBreathBlocking(block),
        water: block.isLiquid &&
          (block.typeId === "minecraft:water" || block.typeId === "minecraft:flowing_water"),
      }
      : null;
    cache.set(key, entry);
  }
  return entry;
}

                                                                               
                                                                                     
function findNodeCollision(dragon, start, end) {
  const dimension = dragon.dimension;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dy, dz);
  const open = { position: end, block: null, entry: null, collided: false, extinguished: false, axis: null, t: 1 };
  if (length < 1e-6) return open;
  const at = (t) => ({ x: start.x + dx * t, y: start.y + dy * t, z: start.z + dz * t });
  let x = Math.floor(start.x);
  let y = Math.floor(start.y);
  let z = Math.floor(start.z);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const stepZ = Math.sign(dz);
  const deltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const deltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const deltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let maxX = dx > 0 ? (x + 1 - start.x) / dx : dx < 0 ? (start.x - x) / -dx : Infinity;
  let maxY = dy > 0 ? (y + 1 - start.y) / dy : dy < 0 ? (start.y - y) / -dy : Infinity;
  let maxZ = dz > 0 ? (z + 1 - start.z) / dz : dz < 0 ? (start.z - z) / -dz : Infinity;
  try {
    for (let guard = 0; guard < 96; guard++) {
      let tEnter;
      let axis;
      if (maxX <= maxY && maxX <= maxZ) {
        tEnter = maxX; axis = "x"; x += stepX; maxX += deltaX;
      } else if (maxY <= maxZ) {
        tEnter = maxY; axis = "y"; y += stepY; maxY += deltaY;
      } else {
        tEnter = maxZ; axis = "z"; z += stepZ; maxZ += deltaZ;
      }
      if (tEnter > 1) break;
      const entry = cachedBlock(dimension, x, y, z);
      if (!entry) continue;
      if (entry.water) {
        return { position: at(Math.max(0, tEnter)), block: entry.block, entry, collided: false, extinguished: true, axis, t: tEnter };
      }
      if (entry.solid) {
        return {
          position: at(Math.max(0, tEnter - 0.02 / length)),
          block: entry.block,
          entry,
          collided: true,
          extinguished: false,
          axis,
          t: Math.min(1, Math.max(0, tEnter)),
        };
      }
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
  return open;
}

                                                                               
                                                                                       
                                                                   
function slideNode(dragon, start, node) {
  let position = start;
  const velocity = { x: node.velocity.x, y: node.velocity.y, z: node.velocity.z };
  let remaining = 1;
  const collisions = [];
  let extinguished = false;
  for (let leg = 0; leg < 3 && remaining > 0.001; leg++) {
    const result = findNodeCollision(dragon, position, {
      x: position.x + velocity.x * remaining,
      y: position.y + velocity.y * remaining,
      z: position.z + velocity.z * remaining,
    });
    position = result.position;
    if (result.extinguished) {
      extinguished = true;
      break;
    }
    if (!result.collided) break;
                                                                                
    const heading = velocity[result.axis] > 0;
    collisions.push({
      entry: result.entry,
      face: result.axis === "x"
        ? (heading ? breathEffects.FACE_WEST : breathEffects.FACE_EAST)
        : result.axis === "y"
        ? (heading ? breathEffects.FACE_DOWN : breathEffects.FACE_UP)
        : (heading ? breathEffects.FACE_NORTH : breathEffects.FACE_SOUTH),
    });
    velocity[result.axis] = 0;
    remaining *= 1 - result.t;
  }
  node.velocity = velocity;
  return { position, collided: collisions.length > 0, collisions, extinguished };
}

                                                                                             
                                                                                            
                                                                                         
const MAX_AFFECTED_BLOCKS = 640;
function addBlockExposure(affected, entry, density, face, definition, now) {
  if (!entry || (entry.air && !definition.exposeAir) || (entry.liquid && !definition.exposeLiquid)) return;
  let record = affected.get(entry.key);
  if (!record) {
    if (affected.size >= MAX_AFFECTED_BLOCKS) return;
    record = breathEffects.createAffectedBlock(entry.key, entry.x, entry.y, entry.z, entry.block);
    affected.set(entry.key, record);
  }
  record.block = entry.block;
  record.touchedAt = now;
  breathEffects.addHitDensity(record, face, density);
}

function addEntityExposure(exposureByEntity, candidate, density, direction) {
  const exposure = exposureByEntity.get(candidate.id);
  if (exposure) {
    exposure.density += density;
    exposure.direction = addVector(exposure.direction, direction, density);
  } else {
    exposureByEntity.set(candidate.id, {
      entity: candidate.entity,
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
  const { x, y, z, width, height } = candidate;
  return (
    x + width / 2 >= Math.min(start.x, end.x) - radius &&
    x - width / 2 <= Math.max(start.x, end.x) + radius &&
    y + height >= Math.min(start.y, end.y) - radius &&
    y <= Math.max(start.y, end.y) + radius &&
    z + width / 2 >= Math.min(start.z, end.z) - radius &&
    z - width / 2 <= Math.max(start.z, end.z) + radius
  );
}

function sampleBreathNode(dragon, node, candidates, affectedBlocks, entityExposure, definition, now) {
  const lightning = LIGHTNING_KINDS.has(definition.kind);
  node.age += 1;
  const start = node.position;
  node.lastStart = { x: start.x, y: start.y, z: start.z };
  const collision = lightning
    ? {
        position: addVector(start, node.velocity),
        collisions: [],
        collided: false,
        extinguished: false,
      }
    : slideNode(dragon, start, node);
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
    candidateNearBreathNode(candidate, start, end, radius)
  );

  for (const { entry, face } of collision.collisions) {
    addBlockExposure(affectedBlocks, entry, intensity, face, definition, now);
  }
  for (let pointIndex = 0; pointIndex < BREATH_NODE_POINTS; pointIndex++) {
    const point = randomNodePoint(start, end, radius, pointIndex);
                                                                                         
                                                    
    if (lineBlocked(dragon.dimension, point.cx, point.cy, point.cz, point.x, point.y, point.z)) {
      const own = cachedBlock(dragon.dimension, Math.floor(point.x), Math.floor(point.y), Math.floor(point.z));
                                                                             
      if (!lightning && own && own.solid) {
        addBlockExposure(
          affectedBlocks, own, sampleDensity,
          breathEffects.intersectedFace(point.cx, point.cy, point.cz, point.x, point.y, point.z),
          definition, now,
        );
      }
      continue;
    }
    if (!lightning) {
      addBlockExposure(
        affectedBlocks,
        cachedBlock(
          dragon.dimension,
          Math.floor(point.x),
          Math.floor(point.y),
          Math.floor(point.z),
        ),
        sampleDensity,
        breathEffects.intersectedFace(point.cx, point.cy, point.cz, point.x, point.y, point.z),
        definition,
        now,
      );
    }
    for (const candidate of nearbyCandidates) {
      if (
        Math.abs(point.x - candidate.x) <= candidate.width / 2 &&
        point.y >= candidate.y &&
        point.y <= candidate.y + candidate.height &&
        Math.abs(point.z - candidate.z) <= candidate.width / 2
      ) {
        sampledEntityHits.set(
          candidate.id,
          (sampledEntityHits.get(candidate.id) ?? 0) + 1,
        );
      }
    }
  }

  for (const candidate of nearbyCandidates) {
                                                                               
    const seg = pointAlongSegment(start, end, 1);
    if (lineBlocked(
      dragon.dimension, seg.x, seg.y, seg.z,
      candidate.x, candidate.y + candidate.height * 0.5, candidate.z,
    )) continue;
    let cornersInside = 0;
    for (const xSign of [-1, 1]) {
      for (const ySign of [0, 1]) {
        for (const zSign of [-1, 1]) {
          if (isInsideBreathNodeSegment({
            x: candidate.x + xSign * candidate.width / 2,
            y: candidate.y + ySign * candidate.height,
            z: candidate.z + zSign * candidate.width / 2,
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
    if (length < node.profile.speed * 0.25) node.age += 20;
  }
  return collision;
}

                                                                                   
                                                                                      
                                                                     
const BREATH_PARTICLE_BUDGET = 40;
const MAX_BLOCK_EFFECTS_PER_TICK = 32;
const NORMAL_PARTICLE_CHANCE = 0.1;
const SPECIAL_PARTICLE_CHANCE = 0.3;
function breathParticleStyle(dragon) {
  if (dragon.typeId === "dragonmounts2:nether_dragon") {
    const variant = String(dragon.getProperty("dragonmounts2:variant_type") ?? "");
    if (variant.includes("soul")) return { sprite: "soul", style: "plain" };
  }
  if (dragon.typeId === "dragonmounts2:fire_dragon") {
    const variant = String(dragon.getProperty("dragonmounts2:variant_type") ?? "");
    if (variant.includes("blue")) return { sprite: "blue_fire", style: "flame" };
  }
  return BREATH_PARTICLE_STYLES[dragon.typeId] ?? FLAME_STYLE;
}

function spawnBreathParticle(dimension, id, location, variables) {
  spawnParticle(dimension, id, location, variables);
}

                                                                                   
                                                                                  
                                                                               
                                                                              
                                                                             
const BREATH_CONE_LENGTH = 14;
const PARTICLE_LIFE = 0.055;                                                         
function coneSize(fullSize, travelled) {
  const growth = Math.min(1, travelled / BREATH_CONE_LENGTH);
  return Math.max(0.05, fullSize * (0.25 + 0.75 * Math.sin(growth * Math.PI / 2)));
}
                                                                                          
                                                                                        
function updateLightningBreathBeam(dragon, state, target, direction, kind) {
  const aim = normalizeDirection(direction ?? { x: 0, y: 0, z: 1 });
  const head = offsetAlongDirection(
    breathMouthLocation(dragon),
    aim,
    BREATH_MUZZLE_OFFSET,
  );
  let length = LIGHTNING_BEAM_MAX_LENGTH;
  if (valid(target)) {
    const dx = target.location.x - head.x;
    const dy = target.location.y - head.y;
    const dz = target.location.z - head.z;
    length = Math.max(0.1, Math.min(
      LIGHTNING_BEAM_MAX_LENGTH,
      dx * aim.x + dy * aim.y + dz * aim.z,
    ));
  }
  try {
    const hit = dragon.dimension.getBlockFromRay(head, aim, {
      maxDistance: length,
      includeLiquidBlocks: false,
      includePassableBlocks: false,
    });
    if (hit) {
      const base = hit.block.location;
      const face = hit.faceLocation;
      const hitLocation = {
        x: base.x + face.x,
        y: base.y + face.y,
        z: base.z + face.z,
      };
      const hitDistance = Math.hypot(
        hitLocation.x - head.x,
        hitLocation.y - head.y,
        hitLocation.z - head.z,
      );
      length = Math.max(0.1, Math.min(length, hitDistance - 0.1));
      if (kind === "storm") {
        tryStormBreathStrike(dragon, state, hit.block);
      }
    }
  } catch (error) {
    if (!reportedLightningRaycastErrors.has(dragon.typeId)) {
      reportedLightningRaycastErrors.add(dragon.typeId);
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[DragonMounts2] Lightning breath block raycast failed for ${dragon.typeId}: ${message}`,
      );
    }
  }
  const { sprite } = breathParticleStyle(dragon);
  for (let index = 0; index < 4; index += 1) {
    const distance = Math.random() * length;
    spawnBreathParticle(dragon.dimension, `dragonmounts2:${sprite}`, {
      x: head.x + aim.x * distance,
      y: head.y + aim.y * distance,
      z: head.z + aim.z * distance,
    });
  }
  updateLightningBolt(
    dragon.dimension,
    state,
    head,
    direction,
    Math.max(0.1, length),
    kind,
  );
}

function tryStormBreathStrike(dragon, state, block) {
  const memo = state.breathMemo;
  if (
    system.currentTick < (memo.nextStrikeAt ?? 0) ||
    Math.random() >= STORM_STRIKE_CHANCE
  ) return;
  const { x, y, z } = block.location;
  const location = { x: x + 0.5, y: y + 1, z: z + 0.5 };
  if (distanceSquared(dragon.location, location) < STORM_STRIKE_MIN_DISTANCE_SQ) return;
  memo.nextStrikeAt = system.currentTick + STORM_STRIKE_INTERVAL;
  try {
    dragon.dimension.spawnEntity("minecraft:lightning_bolt", location);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[DragonMounts2] Storm breath lightning strike failed: ${message}`);
  }
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// The aim animation assumes the bolt entity itself faces yaw 0 / pitch 0; any
// body rotation on the entity is added on top of beam_yaw on the client
// (same rule crystal_beam_utilities.js enforces for the crystal beam).
function lockLightningBeamRotation(bolt) {
  try {
    const rotation = bolt.getRotation();
    if (Math.abs(rotation.x) > 0.01 || Math.abs(rotation.y) > 0.01) {
      bolt.setRotation({ x: 0, y: 0 });
    }
  } catch {
    // Entity may have just been removed; the caller handles invalid beams.
  }
}

function smoothLightningValue(current, target) {
  const difference = target - current;
  return Math.abs(difference) <= LIGHTNING_BEAM_AIM_EPSILON
    ? target
    : current + difference * LIGHTNING_BEAM_AIM_SMOOTHING;
}

function smoothLightningAngle(current, target) {
  const difference = signedAngleDifference(current, target);
  return Math.abs(difference) <= LIGHTNING_BEAM_AIM_EPSILON
    ? target
    : normalizeAngle(current + difference * LIGHTNING_BEAM_AIM_SMOOTHING);
}

function updateLightningBolt(dimension, state, location, direction, length, kind) {
  const profile = LIGHTNING_PROFILES[kind];
  if (!profile) return false;
  const normalized = normalizeDirection(direction ?? { x: 0, y: 0, z: 1 });
  let bolt;
  let created = false;
  try {
    bolt = state?.lightningBeam;
    if (!valid(bolt) || bolt.dimension.id !== dimension.id) {
      removeLightningBreathBeam(state);
      bolt = dimension.spawnEntity(LIGHTNING_BOLT_ENTITY, location);
      created = true;
      if (state) {
        state.lightningBeam = bolt;
        state.lightningBeamAim = null;
        state.lightningBeamSent = null;
      }
      bolt.setProperty("dragonmounts2:lightning_red", profile.color.red);
      bolt.setProperty("dragonmounts2:lightning_green", profile.color.green);
      bolt.setProperty("dragonmounts2:lightning_blue", profile.color.blue);
    } else {
      const current = bolt.location;
      if (
        Math.hypot(
          current.x - location.x,
          current.y - location.y,
          current.z - location.z,
        ) > 0.025
      ) {
        bolt.teleport(location);
      }
    }
    lockLightningBeamRotation(bolt);

    const aim = {
      length: clampNumber(length, 0, LIGHTNING_BEAM_MAX_LENGTH),
      yaw: normalizeAngle(Math.atan2(-normalized.x, normalized.z) * RAD_TO_DEG),
      pitch: clampNumber(
        -Math.asin(clampNumber(normalized.y, -1, 1)) * RAD_TO_DEG,
        -90,
        90,
      ),
    };
    const previous = state?.lightningBeamAim ?? null;
    const nextAim = previous
      ? {
          length: clampNumber(
            smoothLightningValue(previous.length, aim.length),
            0,
            LIGHTNING_BEAM_MAX_LENGTH,
          ),
          yaw: smoothLightningAngle(previous.yaw, aim.yaw),
          pitch: clampNumber(
            smoothLightningValue(previous.pitch, aim.pitch),
            -90,
            90,
          ),
        }
      : aim;

    // Compare against what the client was last told, not against the previous
    // smoothed value; otherwise slow turns never cross the epsilon and the
    // beam visibly lags behind and then snaps.
    const sent = state?.lightningBeamSent ?? null;
    const sendLength =
      !sent || Math.abs(sent.length - nextAim.length) > LIGHTNING_BEAM_AIM_EPSILON;
    const sendYaw =
      !sent ||
      Math.abs(signedAngleDifference(sent.yaw, nextAim.yaw)) >
        LIGHTNING_BEAM_AIM_EPSILON;
    const sendPitch =
      !sent || Math.abs(sent.pitch - nextAim.pitch) > LIGHTNING_BEAM_AIM_EPSILON;
    if (sendLength) bolt.setProperty("dragonmounts2:beam_length", nextAim.length);
    if (sendYaw) bolt.setProperty("dragonmounts2:beam_yaw", nextAim.yaw);
    if (sendPitch) bolt.setProperty("dragonmounts2:beam_pitch", nextAim.pitch);
    if (state) {
      state.lightningBeamAim = nextAim;
      state.lightningBeamSent = {
        length: sendLength ? nextAim.length : sent.length,
        yaw: sendYaw ? nextAim.yaw : sent.yaw,
        pitch: sendPitch ? nextAim.pitch : sent.pitch,
      };
    }

    if (
      !state ||
      created ||
      state.lightningBeamLastRefreshTick === undefined ||
      system.currentTick - state.lightningBeamLastRefreshTick >=
        LIGHTNING_BEAM_TIMEOUT_REFRESH_TICKS
    ) {
      bolt.triggerEvent(LIGHTNING_BEAM_TIMEOUT_EVENT);
      if (state) state.lightningBeamLastRefreshTick = system.currentTick;
    }
    return true;
  } catch (error) {
    if (valid(bolt)) {
      try {
        bolt.remove();
      } catch {
        // Already gone.
      }
    }
    if (state) {
      state.lightningBeam = null;
      state.lightningBeamAim = null;
      state.lightningBeamSent = null;
      state.lightningBeamLastRefreshTick = 0;
    }
    if (!reportedLightningBoltErrors.has(kind)) {
      reportedLightningBoltErrors.add(kind);
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] Lightning breath effect failed for ${kind}: ${message}`);
    }
    return false;
  }
}

function removeLightningBreathBeam(state) {
  const beam = state?.lightningBeam;
  if (beam?.isValid) {
    try {
      beam.remove();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] Failed to remove lightning breath beam: ${message}`);
    }
  }
  if (state) {
    state.lightningBeam = null;
    state.lightningBeamAim = null;
    state.lightningBeamSent = null;
    state.lightningBeamLastRefreshTick = 0;
  }
}

function signedAngleDifference(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function normalizeAngle(angle) {
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

function emitNodeParticle(dragon, node, budget, definition) {
  if (LIGHTNING_KINDS.has(definition.kind)) return;
  if (budget.left <= 0) return;
  const { sprite, style } = breathParticleStyle(dragon);
  const fullSize = node.profile.radius * 2 * 0.375 / 2;                                      
  const renderDiameter = breathNodeRadius(node) * 2 * 0.375;
  const origin = node.origin ?? node.lastStart ?? node.position;
  const from = node.lastStart ?? node.position;
  const to = node.position;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  const variables = new MolangVariableMap();
  variables.setFloat("variable.life", PARTICLE_LIFE);
  variables.setFloat("variable.size0", coneSize(fullSize, Math.hypot(from.x - origin.x, from.y - origin.y, from.z - origin.z)));
  variables.setFloat("variable.size1", coneSize(fullSize, Math.hypot(to.x - origin.x, to.y - origin.y, to.z - origin.z)));
  if (length > 0.02) {
    variables.setFloat("variable.dx", dx / length);
    variables.setFloat("variable.dy", dy / length);
    variables.setFloat("variable.dz", dz / length);
    variables.setFloat("variable.speed", length / PARTICLE_LIFE);
  } else {
    variables.setFloat("variable.dx", 0);
    variables.setFloat("variable.dy", 1);
    variables.setFloat("variable.dz", 0);
    variables.setFloat("variable.speed", 0);
  }
  if (style === "air") {
    variables.setFloat("variable.roll", (node.rollSign ??= Math.random() < 0.5 ? 1 : -1) * 1200);
  }
  spawnBreathParticle(dragon.dimension, `dragonmounts2:breath_${sprite}`, from, variables);
  budget.left -= 1;

                                                      
  const lifetimeFraction = Math.min(node.age / node.profile.lifespan, 1);
  if (
    Math.random() > NORMAL_PARTICLE_CHANCE ||
    Math.random() >= lifetimeFraction
  ) return;
  const special = Math.random() < SPECIAL_PARTICLE_CHANCE;
  const at = node.position;
  const dimension = dragon.dimension;
  switch (style) {
    case "flame":
      spawnBreathParticle(dimension, "minecraft:basic_smoke_particle", at);
      break;
    case "nether":
      spawnBreathParticle(
        dimension,
        special ? "minecraft:lava_particle" : "minecraft:basic_smoke_particle",
        at,
      );
      break;
    case "ender":
      spawnBreathParticle(dimension, "minecraft:dragon_breath_trail", at);
      break;
    case "water":
      {
        // The vanilla splash particle reads variable.direction (a vec3).
        const splash = new MolangVariableMap();
        splash.setVector3("variable.direction", { x: 0, y: 1, z: 0 });
        spawnBreathParticle(dimension, "minecraft:water_splash_particle", {
          x: at.x + (Math.random() - 0.5) * renderDiameter,
          y: at.y + 0.8,
          z: at.z + (Math.random() - 0.5) * renderDiameter,
        }, splash);
      }
      break;
    case "ice": {
      const small = new MolangVariableMap();
      small.setFloat("variable.size0", 0.12);
      small.setFloat("variable.size1", 0.12);
      small.setFloat("variable.life", 0.6);
      small.setFloat("variable.speed", 0);
      small.setFloat("variable.dx", 0);
      small.setFloat("variable.dy", 1);
      small.setFloat("variable.dz", 0);
      spawnBreathParticle(dimension, "dragonmounts2:breath_ice", at, small);
      break;
    }
    default:
      break;
  }
}

function isEntityWet(entity) {
  if (!valid(entity)) return false;
  if (entity.isInWater) return true;
                                                                
  try {
    const dimension = entity.dimension;
    const weather = dimension.getWeather?.();
    if (weather !== "Rain" && weather !== "Thunder") return false;
    const { x, y, z } = entity.location;
    const top = dimension.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
    return !top || top.location.y < y;
  } catch {
    return false;
  }
}

const SOUL_FIRE_BREEDS = new Set(["dragonmounts2:skeleton_dragon"]);
function breathFireBlockId(dragon, definition) {
  const variant = String(dragon.getProperty("dragonmounts2:variant_type") ?? "");
  if (definition.kind === "nether") {
    return SOUL_FIRE_BREEDS.has(dragon.typeId) || variant.includes("soul")
      ? "minecraft:soul_fire"
      : "minecraft:fire";
  }
                                                           
  return variant.includes("blue") && Math.random() < 0.5
    ? "minecraft:soul_fire"
    : "minecraft:fire";
}

                                                                                      
                                                                               
function breathContext(dragon, state, definition) {
  let ctx = state.breathCtx;
  if (!ctx) {
    ctx = {
      dragon,
      dimension: dragon.dimension,
      now: 0,
      definition,
      memo: state.breathMemo,
      counters: breathEffects.newCounters(),
      at: (x, y, z) => cachedBlock(ctx.dimension, x, y, z)?.block,
      damage: (target, amount) => applyDragonCombatDamage(ctx.dragon, target, amount),
      spawnCloud: (block, cloud) =>
        spawnBreathEffectCloud(ctx.dimension, block, ctx.dragon, cloud),
      env: {
        onFire: isEntityOnFire,
        inPowderSnow: isEntityInPowderSnow,
        isWet: isEntityWet,
        fireBlockId: () => breathFireBlockId(ctx.dragon, ctx.definition),
      },
    };
    state.breathCtx = ctx;
  }
  ctx.dragon = dragon;
  ctx.dimension = dragon.dimension;
  ctx.definition = definition;
  ctx.now = system.currentTick;
  const counters = ctx.counters;
  for (const key in counters) counters[key] = 0;
  return ctx;
}

function isSculkReplaceable(block) {
  return SCULK_REPLACEABLE_BLOCKS.has(block.typeId) ||
    (typeof block.hasTag === "function" && block.hasTag("minecraft:sculk_replaceable"));
}

                                                                                              
                                                                                                
                                                                       
const BREATH_DRAG_MAX = 1.2;
function applyBreathDrag(definition, target, record) {
  if (!definition.drag) return;
  const dx = record.direction.x;
  const dz = record.direction.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-4) return;
  const strength = Math.min(definition.drag * record.density, BREATH_DRAG_MAX);
  if (strength < 0.01) return;
  const push = { x: dx / length * strength, z: dz / length * strength };
  const lift = target.isOnGround ? Math.min(0.4, strength) : 0;
  try {
    target.applyKnockback(push, lift);
  } catch {
    try {
      target.applyImpulse({ x: push.x, y: lift, z: push.z });
    } catch {
                                                      
    }
  }
}

                                                                                
                                                                                  
                                                                                  
                                                 
export function getRiderAimDirection(dragon, rider, maxDistance = 64) {
  const view = rider.getViewDirection();
  try {
    const eye = rider.getHeadLocation();
    const head = breathMouthLocation(dragon);
    let aimPoint = null;
    let range = maxDistance;
    const blockHit = rider.dimension.getBlockFromRay(eye, view, {
      maxDistance,
      includeLiquidBlocks: false,
      includePassableBlocks: false,
    });
    if (blockHit) {
      const base = blockHit.block.location;
      const face = blockHit.faceLocation;
      aimPoint = { x: base.x + face.x, y: base.y + face.y, z: base.z + face.z };
      range = Math.hypot(aimPoint.x - eye.x, aimPoint.y - eye.y, aimPoint.z - eye.z);
    }
    const entityHits = rider.dimension.getEntitiesFromRay(eye, view, {
      maxDistance: range,
      ignoreBlockCollision: true,
    }) ?? [];
    for (const hit of entityHits) {
      const entity = hit.entity;
      if (
        !valid(entity) ||
        entity.id === rider.id ||
        entity.id === dragon.id ||
        !component(entity, "minecraft:health") ||
        isFriendly(dragon, entity)
      ) continue;
      const height = component(entity, "minecraft:collision_box")?.height ?? 1;
      aimPoint = {
        x: entity.location.x,
        y: entity.location.y + height * 0.6,
        z: entity.location.z,
      };
      break;
    }
    if (!aimPoint) {
      aimPoint = {
        x: eye.x + view.x * maxDistance,
        y: eye.y + view.y * maxDistance,
        z: eye.z + view.z * maxDistance,
      };
    }
    const toPoint = {
      x: aimPoint.x - head.x,
      y: aimPoint.y - head.y,
      z: aimPoint.z - head.z,
    };
    const distance = Math.hypot(toPoint.x, toPoint.y, toPoint.z);
    const forward = toPoint.x * view.x + toPoint.y * view.y + toPoint.z * view.z;
                                                                             
    if (distance < 2 || forward <= 0) return view;
    return { x: toPoint.x / distance, y: toPoint.y / distance, z: toPoint.z / distance };
  } catch {
    return view;
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
                                                                                            
                                                                       
  const head = offsetAlongDirection(
    breathMouthLocation(dragon),
    aim,
    DRAGON_PROJECTILE_MUZZLE_OFFSET,
  );
  const speed = 1 + Math.max(0, Math.min(1, chargePower));
  const ability = getDragonProjectileAbility(dragon);
  let projectileEntity;
  try {
    projectileEntity = dragon.dimension.spawnEntity(ability.entity, head);
    const projectile = projectileEntity.getComponent("minecraft:projectile");
    if (!projectile) throw new Error(`${ability.entity} is missing its projectile component`);
    if (EXPLOSIVE_DRAGON_PROJECTILE_TYPES.has(ability.entity)) {
      projectileEntity.setProperty(
        "dragonmounts2:environmental_effects_enabled",
        getWorldEnvironmentalEffectsEnabled(),
      );
    }
    projectile.owner = dragon;
    projectile.shoot({
      x: aim.x * speed,
      y: aim.y * speed,
      z: aim.z * speed,
    });
    activeDragonProjectiles.set(projectileEntity.id, {
      entity: projectileEntity,
      slowTicks: 0,
      spawnedAt: system.currentTick,
      velocityErrorReported: false,
      removeErrorReported: false,
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

const MAX_BREATH_CLOUDS_TOTAL = 40;
const MAX_BREATH_CLOUDS_PER_OWNER = 10;
const CLOUD_SLAB_HEIGHT = 0.5;                                                       
const CLOUD_CHECK_INTERVAL = 5;                                
const CLOUD_REAPPLY_DELAY = 20;                                                    

                                                                                     
                                                                             
function spawnBreathEffectCloud(dimension, block, owner, cloudEffect) {
  const location = {
    x: block.location.x + 0.5,
    y: block.location.y + 1,
    z: block.location.z + 0.5,
  };
  let total = 0;
  let owned = 0;
  for (const cloud of elementalClouds.values()) {
    if (cloud.slab !== true) continue;
    total += 1;
    if (cloud.owner?.id !== owner?.id) continue;
    owned += 1;
    if (
      cloud.effect === cloudEffect.effect &&
      Math.abs(cloud.location.x - location.x) < 1.5 &&
      Math.abs(cloud.location.y - location.y) < 1.5 &&
      Math.abs(cloud.location.z - location.z) < 1.5
    ) return;
  }
  if (total >= MAX_BREATH_CLOUDS_TOTAL || owned >= MAX_BREATH_CLOUDS_PER_OWNER) return;
  const createdAt = system.currentTick;
  elementalClouds.set(++nextWaterballCloudId, {
    dimension,
    location,
    owner,
    effect: cloudEffect.effect,
    effectDuration: cloudEffect.duration,
    particle: cloudEffect.particle,
    radiusStart: cloudEffect.radius,
    radiusEnd: 1,
    lifetime: cloudEffect.lifetime,
    ignoreOwner: true,
    slab: true,
    victims: new Map(),
    createdAt,
    nextApplyAt: createdAt + CLOUD_CHECK_INTERVAL,
    nextVisualAt: createdAt,
  });
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

                                                                               
                                                                               
                                                                               
                                                                              
                                                                                
                                                                             
  
function breathMouthLocation(dragon) {
  const head = dragon.getHeadLocation();
  const direction = normalizeDirection(dragon.getViewDirection());
  const jawOffset =
    BREATH_JAW_OFFSETS[dragon.getProperty("dragonmounts2:age_variant")] ?? 1.5;
  return offsetAlongDirection(head, direction, jawOffset);
}

function offsetAlongDirection(location, direction, distance) {
  const aim = normalizeDirection(direction);
  return {
    x: location.x + aim.x * distance,
    y: location.y + aim.y * distance,
    z: location.z + aim.z * distance,
  };
}

function positionDragonBreathProjectile(event) {
  const projectile = event.entity;
  if (!valid(projectile)) return;
  const dragonType = BREATH_PROJECTILE_DRAGONS[projectile.typeId];
  if (!dragonType) return;

  const owner = component(projectile, "minecraft:projectile")?.owner;
  let dragon = valid(owner) && owner.typeId === dragonType ? owner : null;
  if (!dragon) {
    let nearestDistance = 8 ** 2;
    for (const candidate of projectile.dimension.getEntities({
      location: projectile.location,
      maxDistance: 8,
      type: dragonType,
    })) {
      if (
        !valid(candidate) ||
        candidate.getProperty("dragonmounts2:is_breathing") !== true
      ) continue;
      const distance = distanceSquared(projectile.location, candidate.location);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        dragon = candidate;
      }
    }
  }

  if (dragon) {
    const velocity = getSafeVelocity(projectile);
    const direction = Math.hypot(velocity.x, velocity.y, velocity.z) > 0.001
      ? velocity
      : dragon.getViewDirection();
    projectile.teleport(
      offsetAlongDirection(
        breathMouthLocation(dragon),
        direction,
        BREATH_MUZZLE_OFFSET,
      ),
      { keepVelocity: true },
    );
  }
}

onWorldEvent("afterEvents", "entitySpawn", positionDragonBreathProjectile);

                                                                                
                                                                                 
                                                                                  
                                                                                  
function getRiderBreathDirection(dragon, rider) {
  try {
    const riderRotation = rider.getRotation();
    const dragonRotation = dragon.getRotation();
    dragon.setRotation({
      x: dragonRotation.x,
      y: riderRotation.y,
      z: 0,
    });
    const yaw = riderRotation.y * DEG_TO_RAD;
    const pitch = Math.max(-90, Math.min(90, riderRotation.x)) * DEG_TO_RAD;
    const flat = Math.cos(pitch);
    return {
      x: -Math.sin(yaw) * flat,
      y: -Math.sin(pitch),
      z: Math.cos(yaw) * flat,
    };
  } catch {
    return rider.getViewDirection();
  }
}

                                                                                   
                                                                               
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
    const head = breathMouthLocation(dragon);
    direction = aimedDirection
      ? normalizeDirection(aimedDirection)
      : getAttackDirection(dragon, target, head);
    const muzzle = offsetAlongDirection(head, direction, BREATH_MUZZLE_OFFSET);
    state.lastAim = direction;
    state.breathNodes.push({
      position: muzzle,
      velocity: {
        x: (direction.x + truncatedGaussian(NODE_SPEED_VARIATION_ABS)) * profile.speed,
        y: (direction.y + truncatedGaussian(NODE_SPEED_VARIATION_ABS)) * profile.speed,
        z: (direction.z + truncatedGaussian(NODE_SPEED_VARIATION_ABS)) * profile.speed,
      },
      profile,
      age: 0,
      origin: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
    });
  } else {
    direction = state.lastAim ?? { x: 0, y: 0, z: 1 };
  }

                                                                       
  let reach = 8;
  for (const node of state.breathNodes) {
    const nodeDistance = Math.hypot(
      node.position.x - dragon.location.x,
      node.position.y - dragon.location.y,
      node.position.z - dragon.location.z,
    ) + node.profile.speed + node.profile.radius + 2;
    if (nodeDistance > reach) reach = nodeDistance;
  }
  const candidates = [];
  if (state.breathNodes.length > 0) {
    for (const entity of dragon.dimension.getEntities({
      location: dragon.location,
      maxDistance: Math.min(reach, BREATH_NODE_MAX_DISTANCE),
    })) {
      if (!valid(entity) || isFriendly(dragon, entity)) continue;
      if (!component(entity, "minecraft:health")) continue;
      const box = component(entity, "minecraft:collision_box");
      const location = entity.location;
      candidates.push({
        entity,
        id: entity.id,
        x: location.x,
        y: location.y,
        z: location.z,
        width: box?.width ?? 1,
        height: box?.height ?? 1,
      });
    }
  }
  const affectedBlocks = state.affectedBlocks;
  const entityExposure = new Map();
  const particleBudget = { left: BREATH_PARTICLE_BUDGET };

  for (const node of state.breathNodes) {
    if (node.age >= node.profile.lifespan) continue;
    sampleBreathNode(
      dragon,
      node,
      candidates,
      affectedBlocks,
      entityExposure,
      breath,
      now,
    );
    emitNodeParticle(dragon, node, particleBudget, breath);
  }
  if (spawn && LIGHTNING_KINDS.has(breath.kind)) {
    updateLightningBreathBeam(dragon, state, target, state.lastAim, breath.kind);
  }
  state.breathNodes = state.breathNodes.filter(
    (node) => node.age < node.profile.lifespan,
  );

  if (!LIGHTNING_KINDS.has(breath.kind)) {
    applyBreathToBlocks(dragon, state, breath, affectedBlocks, now);
  }

                                                                                
                                                                        
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
  applyBreathToEntities(dragon, state, breath, now);
}

                                                                                              
                                                                                             
                                                                                              
                                
function applyBreathToBlocks(dragon, state, breath, affectedBlocks, now) {
  if (affectedBlocks.size === 0) return;
  const touched = [];
  for (const [key, record] of affectedBlocks) {
    if (record.touchedAt === now) touched.push(record);
    else if (breathEffects.decayAffectedBlock(record)) affectedBlocks.delete(key);
  }
  if (touched.length === 0) return;
  let batch = touched;
  if (touched.length > MAX_BLOCK_EFFECTS_PER_TICK) {
    batch = touched
      .map((record) => ({ record, max: breathEffects.maxDensity(record) }))
      .sort((first, second) => second.max - first.max)
      .slice(0, MAX_BLOCK_EFFECTS_PER_TICK)
      .map((entry) => entry.record);
  }
  const ctx = breathContext(dragon, state, breath);
  for (const record of batch) {
    try {
      if (breathEffects.affectBlock(breath, ctx, record, isSculkReplaceable)) {
        breathEffects.resetAffectedBlock(record);
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
  for (const record of touched) {
    if (breathEffects.decayAffectedBlock(record)) affectedBlocks.delete(record.key);
  }
}

                                                                                                
                                                                                               
function applyBreathToEntities(dragon, state, breath, now) {
  if (state.affectedEntities.size === 0) return;
  let ctx = null;
  for (const [id, record] of state.affectedEntities) {
    if (
      !valid(record.entity) ||
      now - record.lastHitAt >= ENTITY_DENSITY_RESET_TICKS
    ) {
      state.affectedEntities.delete(id);
      continue;
    }
    try {
      if (now - record.lastDamageAt >= BREATH_DAMAGE_INTERVAL) {
        record.lastDamageAt = now;
        ctx ??= breathContext(dragon, state, breath);
        breathEffects.affectEntity(breath, ctx, record.entity, record.density);
      }
      applyBreathDrag(breath, record.entity, record);
    } catch (error) {
      if (!reportedBreathBlockErrors.has(`${dragon.typeId}:entity`)) {
        reportedBreathBlockErrors.add(`${dragon.typeId}:entity`);
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[DragonMounts2] Breath entity effect failed for ${dragon.typeId}: ${message}`,
        );
      }
    }
  }
}

                                                                                
function applyProjectileBreathToBlock(owner, block, breath) {
  const state = stateFor(owner);
  const ctx = breathContext(owner, state, breath);
  const { x, y, z } = block.location;
  const record = breathEffects.createAffectedBlock(0, x, y, z, block);
  record.faces.fill(DEFAULT_BREATH_NODE_PROFILE.intensity);
  breathEffects.affectBlock(breath, ctx, record, isSculkReplaceable);
}

function tickBreath(dragon, target, state, aerial) {
  const targetInRange = valid(target) &&
    distanceSquared(dragon.location, target.location) <= BREATH_RANGE ** 2;
  const airDuel = aerial && targetInRange && isAirborne(target);
  const breath = breathFor(dragon.typeId);

  if (
    dragon.getProperty("dragonmounts2:age_variant") === "baby" ||
    dragon.isInWater ||
    !breath
  ) {
    endAIBreath(dragon, state);
    return false;
  }

  if (state.breathStartedAt >= 0) {
    const elapsedTicks = system.currentTick - state.breathStartedAt;
    const startDelayTicks = BREATH_START_DELAY_TICKS;
    const expired = elapsedTicks >= startDelayTicks + BREATH_DURATION;
    const targetTooClose = aerial && targetInRange && !isAirborne(target) &&
      distanceSquared(dragon.location, target.location) < 100;
    if (!targetInRange || (expired && !airDuel) || targetTooClose) {
      endAIBreath(dragon, state);
      return false;
    }

    const breathReady = elapsedTicks >= startDelayTicks;
    setBreathReady(dragon, breathReady);
    tickBreathNodes(
      dragon,
      target,
      state,
      breath,
      null,
      breathReady,
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
  for (let index = 0; index < count; index += 1) {
    const particleLocation = {
      x: location.x + (Math.random() * 2 - 1) * spread.x,
      y: location.y + (Math.random() * 2 - 1) * spread.y,
      z: location.z + (Math.random() * 2 - 1) * spread.z,
    };
    if (!isLocationInLoadedChunk(dimension, particleLocation)) continue;
    spawnParticle(dimension, particle, particleLocation);
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
      if (isLocationInLoadedChunk(cloud.dimension, particleLocation)) {
        spawnParticle(cloud.dimension, cloud.particle, particleLocation);
      }
      cloud.nextVisualAt = now + ELEMENTAL_CLOUD_VISUAL_INTERVAL;
    }
    if (now < cloud.nextApplyAt) continue;
    try {
      const targets = cloud.dimension.getEntities({
        location: cloud.location,
        maxDistance: cloud.slab ? radius + 2 : radius,
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
        if (cloud.slab) {
                                                                                 
          if (dx * dx + dz * dz > radius * radius) continue;
          const height = component(target, "minecraft:collision_box")?.height ?? 1;
          if (dy > CLOUD_SLAB_HEIGHT || dy + height < 0) continue;
          if ((cloud.victims.get(target.id) ?? 0) > now) continue;
          cloud.victims.set(target.id, now + CLOUD_REAPPLY_DELAY);
        } else if (dx * dx + dy * dy + dz * dz > radius * radius) {
          continue;
        }
        if (cloud.effect) {
          target.addEffect(cloud.effect, cloud.effectDuration ?? 1, {
            amplifier: cloud.effectDuration === undefined ? 1 : 0,
          });
        }
      }
      if (cloud.victims && cloud.victims.size > 24) {
        for (const [id, until] of cloud.victims) {
          if (until <= now) cloud.victims.delete(id);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] Elemental cloud update failed: ${message}`);
      elementalClouds.delete(id);
      continue;
    }
    cloud.nextApplyAt = now + (cloud.slab ? CLOUD_CHECK_INTERVAL : ELEMENTAL_CLOUD_EFFECT_INTERVAL);
    continue;
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

  if (impact.lightningKind) {
    updateLightningBolt(
      dimension,
      null,
      location,
      getSafeVelocity(event.projectile),
      2,
      impact.lightningKind,
    );
  } else {
    spawnParticleBurst(
      dimension,
      impact.particle,
      location,
      impact.particleCount ?? 1,
      { x: 0.8, y: 0.5, z: 0.8 },
    );
  }
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
    const breath = breathFor(owner.typeId);
    if (breath) applyProjectileBreathToBlock(owner, hitBlock, breath);
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

                                                                                  
                                                                                
                                                                                    
                                                                                  
                                                          
const DRAGON_PROJECTILE_PATTERN = /^dragonmounts2:.*(dragonball|dragonbreath)$/;
const recentDragonBlasts = [];
function noteDragonBlast(event) {
  const projectile = event.projectile;
  if (!projectile || !DRAGON_PROJECTILE_PATTERN.test(projectile.typeId)) return;
  const at = event.location ?? projectile.location;
  if (!at) return;
  recentDragonBlasts.push({
    tick: system.currentTick,
    dimension: projectile.dimension.id,
    x: at.x, y: at.y, z: at.z,
  });
  if (recentDragonBlasts.length > 24) recentDragonBlasts.shift();
}
onWorldEvent("afterEvents", "projectileHitEntity", noteDragonBlast);
onWorldEvent("afterEvents", "projectileHitBlock", noteDragonBlast);

onBeforeEntityHurt((event) => {
  const hurt = event.hurtEntity;
  if (!hurt?.isValid || !entityData.dragonTypeIds.has(hurt.typeId)) return;
  const source = event.damageSource;
  const direct = source?.damagingProjectile?.typeId ?? source?.damagingEntity?.typeId ?? "";
  if (DRAGON_PROJECTILE_PATTERN.test(direct)) {
    event.cancel = true;
    return;
  }
  const cause = source?.cause;
  if (
    cause !== EntityDamageCause.entityExplosion &&
    cause !== EntityDamageCause.blockExplosion &&
    cause !== EntityDamageCause.fire &&
    cause !== EntityDamageCause.fireTick &&
    cause !== EntityDamageCause.projectile
  ) return;
  const now = system.currentTick;
  const dimensionId = hurt.dimension.id;
  for (const blast of recentDragonBlasts) {
    if (now - blast.tick > 40 || blast.dimension !== dimensionId) continue;
    const dx = hurt.location.x - blast.x;
    const dy = hurt.location.y - blast.y;
    const dz = hurt.location.z - blast.z;
    if (dx * dx + dy * dy + dz * dz <= 12 * 12) {
      event.cancel = true;
      return;
    }
  }
});

registerIntervalTask("elemental-cloud-effects", 5, tickElementalClouds);

registerIntervalTask("dragon-projectile-recovery", 100, () => {
  for (const dimension of getAddonDimensions()) {
    for (const typeId of DRAGON_PROJECTILE_TYPES) {
      for (const projectile of dimension.getEntities({ type: typeId })) {
        if (!valid(projectile) || activeDragonProjectiles.has(projectile.id)) continue;
        activeDragonProjectiles.set(projectile.id, {
          entity: projectile,
          slowTicks: 0,
          spawnedAt: system.currentTick,
          velocityErrorReported: false,
          removeErrorReported: false,
        });
      }
    }
  }
});

registerIntervalTask("dragon-projectile-cleanup", 5, () => {
  const now = system.currentTick;
  for (const [id, record] of activeDragonProjectiles) {
    const projectile = record.entity;
    if (!valid(projectile)) {
      activeDragonProjectiles.delete(id);
      continue;
    }
    let speed = Infinity;
    try {
      const velocity = projectile.getVelocity();
      speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    } catch (error) {
      if (!record.velocityErrorReported) {
        record.velocityErrorReported = true;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[DragonMounts2] Failed to read projectile velocity ${id}: ${message}`);
      }
    }
    record.slowTicks = speed <= PROJECTILE_SLOW_SPEED
      ? record.slowTicks + 5
      : 0;
    if (
      record.slowTicks < PROJECTILE_SLOW_TICKS &&
      now - record.spawnedAt < PROJECTILE_MAX_AGE_TICKS
    ) continue;
    try {
      projectile.remove();
    } catch (error) {
      if (!record.removeErrorReported) {
        record.removeErrorReported = true;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[DragonMounts2] Failed to remove stopped projectile ${id}: ${message}`);
      }
      continue;
    }
    activeDragonProjectiles.delete(id);
  }
});

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
  if (deadEntity?.id) {
    removeLightningBreathBeam(runtimeByDragon.get(deadEntity.id));
    runtimeByDragon.delete(deadEntity.id);
  }
});

export function tickDragonCombat(dragon) {
  if (
    valid(dragon) &&
    entityData.dragonTypeIds.has(dragon.typeId) &&
    dragon.getProperty("dragonmounts2:mob_state") === "sitting" &&
    ridersOf(dragon).length === 0
  ) {
    const state = stateFor(dragon);
    const aiBreathing = dragon.getProperty("dragonmounts2:ai_breath_active") === true;
    const shouldStopRiderBreath = !aiBreathing && (
      state.riderBreathing ||
      dragon.getProperty("dragonmounts2:is_breathing") === true ||
      dragon.getProperty("dragonmounts2:breath_audio_active") === true
    );
    endAIBreath(dragon, state);
    dragon.setProperty("dragonmounts2:is_breathing", false);
    if (shouldStopRiderBreath) stopDragonBreathAudio(dragon);
    state.target = null;
    state.targetSince = -1;
    state.aerialCommitted = false;
    state.aerialTargetId = null;
    state.riderBreathing = false;
    state.breathBreathingTicks = 0;
    state.breathNodes.length = 0;
    state.lastBreath = null;
    removeLightningBreathBeam(state);
    state.nodesTickedAt = system.currentTick;
    return null;
  }
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
    removeLightningBreathBeam(runtimeByDragon.get(dragon.id));
    runtimeByDragon.delete(dragon.id);
    return null;
  }
  if (system.currentTick - lastCleanupTick >= 200) {
    lastCleanupTick = system.currentTick;
    for (const [id, state] of runtimeByDragon) {
      if (!valid(state.dragon)) {
        removeLightningBreathBeam(state);
        runtimeByDragon.delete(id);
      }
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
    const breath = breathFor(dragon.typeId);
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
      setBreathReady(
        dragon,
        state.breathBreathingTicks >= BREATH_START_DELAY_TICKS,
      );
      tickBreathNodes(
        dragon,
        null,
        state,
        breath,
        getRiderBreathDirection(dragon, rider),
        state.breathBreathingTicks >= BREATH_START_DELAY_TICKS,
      );
    } else {
      state.breathBreathingTicks = 0;
      state.riderBreathing = false;
      setBreathReady(dragon, false);
      removeLightningBreathBeam(state);
    }
    tryRiddenBite(dragon, state, riders);
    return null;
  }
  if (state.riderBreathing) {
    dragon.setProperty("dragonmounts2:is_breathing", false);
    stopDragonBreathAudio(dragon);
    removeLightningBreathBeam(state);
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
