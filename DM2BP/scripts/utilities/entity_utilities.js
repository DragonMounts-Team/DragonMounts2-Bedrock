import {
  EntityHealthComponent,
  EntityTameableComponent,
  system,
} from "@minecraft/server";
import * as entityArrays from "../arrays/entity_arrays.js";
import * as entityData from "../data/entity_data.js";

const XP_ORBS_PER_SPLIT = 64;
const XP_BOOST_MULTIPLIER = 1.5;
const XP_TIER_HOSTILE_WEAK = 2;
const XP_TIER_HOSTILE_NORMAL = 5;
const XP_TIER_HOSTILE_STRONG = 10;
const XP_TIER_BOSS = 50;
const XP_TIER_BOSS_MAJOR = 120;
const HOSTILE_ENTITIES = new Set(entityArrays.hostileEntityTypes);
const BOSS_ENTITIES = new Set(entityArrays.bossEntityTypes);

export function getPersistentId(entity) {
  if (!entity?.isValid) return null;
  let persistentId = entity.getDynamicProperty("dragonmounts2:persistent_id");
  if (!persistentId) {
    persistentId = `${entity.typeId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    entity.setDynamicProperty("dragonmounts2:persistent_id", persistentId);
  }
  return persistentId;
}

export function getSafeVelocity(entity) {
  try {
    return entity.getVelocity();
  } catch {
    return { x: 0, y: 0, z: 0 };
  }
}

export function distanceBetween(first, second) {
  if (!first || !second) return Infinity;
  return Math.hypot(
    first.x - second.x,
    first.y - second.y,
    first.z - second.z,
  );
}

export function applyAoeKnockback(
  hurtEntity,
  playerId,
  radius,
  knockbackStrength,
  applyEffect,
) {
  const origin = hurtEntity.location;
  const nearbyEntities = hurtEntity.dimension.getEntities({
    location: origin,
    maxDistance: radius,
  });

  for (const entity of nearbyEntities) {
    if (!entity.isValid || entity.id === hurtEntity.id) continue;

    const tameable = entity.getComponent(EntityTameableComponent.componentId);
    if (tameable?.isTamed && tameable.tamedToPlayerId === playerId) continue;

    try {
      const dx = entity.location.x - origin.x;
      const dz = entity.location.z - origin.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance > 0) {
        const velocity = entity.getVelocity();
        entity.applyImpulse({
          x: velocity.x + (dx / distance) * knockbackStrength,
          y: velocity.y + 0.4,
          z: velocity.z + (dz / distance) * knockbackStrength,
        });
      }

      applyEffect(entity);
    } catch {}
  }
}

export function calculateEntityXpReward(entity, applyBonus = false) {
  const typeId = entity.typeId;
  let baseXp = 0;

  if (BOSS_ENTITIES.has(typeId)) {
    baseXp =
      typeId === "minecraft:ender_dragon"
        ? XP_TIER_BOSS_MAJOR
        : XP_TIER_BOSS;
  } else if (HOSTILE_ENTITIES.has(typeId)) {
    try {
      const healthComp = entity.getComponent(EntityHealthComponent.componentId);
      const maxHealth = healthComp?.maxValue || 20;

      if (maxHealth <= 4) baseXp = XP_TIER_HOSTILE_WEAK;
      else if (maxHealth <= 10) baseXp = XP_TIER_HOSTILE_NORMAL;
      else baseXp = XP_TIER_HOSTILE_STRONG;
    } catch {
      baseXp = XP_TIER_HOSTILE_NORMAL;
    }
  } else {
    return 0;
  }

  return Math.floor(baseXp * (applyBonus ? XP_BOOST_MULTIPLIER : 1));
}

export function spawnXpOrbs(dimension, location, totalXp) {
  if (!dimension || !location || totalXp <= 0) return;

  try {
    const orbCount = Math.ceil(totalXp / XP_ORBS_PER_SPLIT);
    let remaining = totalXp;

    for (let i = 0; i < orbCount; i++) {
      const xpAmount = Math.min(remaining, XP_ORBS_PER_SPLIT);
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.2;
      const orb = dimension.spawnEntity("xp_orb", location);

      if (orb) {
        orb.setProperty("xp_value", xpAmount);
        orb.applyImpulse({
          x: Math.cos(angle) * speed,
          y: 0.2,
          z: Math.sin(angle) * speed,
        });
      }
      remaining -= xpAmount;
    }
  } catch {}
}

const ICE_DRAGON_EGG_TYPE = "dragonmounts2:ice_dragon_egg";
const FROST_WALK_WATER_TYPES = new Set(entityArrays.frostWalkWaterTypes);
const FROST_WALKER_RADIUS = 3;
const FROST_WALKER_RADIUS_SQUARED = FROST_WALKER_RADIUS ** 2;

const methodCheckers = {
  ring: checkRingMethod,
  radius: checkRadiusMethod,
  single: checkSingleMethod,
};

export function getDragonEggDebugMessage(player) {
  if (!player?.isValid) return null;

  let hits;
  try {
    hits = player.getEntitiesFromViewDirection({
      maxDistance: 16,
      families: ["dragonmounts2", "dragon_egg"],
    });
  } catch {
    return null;
  }

  const egg = hits?.find((hit) => hit?.entity?.isValid)?.entity;
  if (!egg) return null;
  const eggState = egg.getProperty("dragonmounts2:egg_state");
  const hatchProgress =
    Number(egg.getProperty("dragonmounts2:egg_hatch_time")) || 0;
  return `Dragon egg: ${eggState}, ${((hatchProgress / 0.3) * 100).toFixed(1)}%`;
}

export function getDragonEggNestingBlock(dragonEgg) {
  if (!dragonEgg?.isValid) return;

  const dragonEggTypes = entityData.dragonEggTypes[dragonEgg.typeId];
  if (!dragonEggTypes) return;

  const eggDim = dragonEgg.dimension;
  if (!eggDim.isChunkLoaded(dragonEgg.location)) return;
  freezeWaterForIceDragonEgg(dragonEgg);

  const eggNestingBlock = dragonEgg.getProperty(
    "dragonmounts2:egg_nesting_block",
  );
  const eggLoc = eggDim.getBlock(dragonEgg.location).center();
  const checker = methodCheckers[dragonEggTypes.hatch_method];
  if (!checker) return;

  const success = checker(
    dragonEgg,
    eggDim,
    eggLoc,
    dragonEggTypes.block_placement,
  );

  if (success) {
    tryActivateEggNestBlock(dragonEgg, eggNestingBlock);
  } else {
    tryDeactivateEggNestBlock(dragonEgg, eggNestingBlock);
  }
}

function freezeWaterForIceDragonEgg(dragonEgg) {
  if (dragonEgg.typeId !== ICE_DRAGON_EGG_TYPE) return;

  const location = dragonEgg.location;
  const centerX = Math.floor(location.x);
  const centerY = Math.floor(location.y);
  const centerZ = Math.floor(location.z);
  const waterY = centerY - 1;

  for (let offsetX = -FROST_WALKER_RADIUS; offsetX <= FROST_WALKER_RADIUS; offsetX++) {
    for (let offsetZ = -FROST_WALKER_RADIUS; offsetZ <= FROST_WALKER_RADIUS; offsetZ++) {
      if (offsetX ** 2 + offsetZ ** 2 > FROST_WALKER_RADIUS_SQUARED) continue;
      try {
        const block = dragonEgg.dimension.getBlock({
          x: centerX + offsetX,
          y: waterY,
          z: centerZ + offsetZ,
        });
        if (block?.typeId === "minecraft:frosted_ice") {
          block.setType("minecraft:frosted_ice");
          continue;
        }
        if (!FROST_WALK_WATER_TYPES.has(block?.typeId)) continue;
        const blockAbove = dragonEgg.dimension.getBlock({
          x: centerX + offsetX,
          y: waterY + 1,
          z: centerZ + offsetZ,
        });
        if (!blockAbove?.isAir) continue;

        block.setType("minecraft:frosted_ice");
      } catch {
        continue;
      }
    }
  }
}

export function getDragonEggConvertBlock(dragonEgg) {
  if (!dragonEgg?.isValid) return;

  const convertTypes = entityData.dragonEggTypes;
  if (!convertTypes) return;

  const eggNestingBlock = dragonEgg.getProperty(
    "dragonmounts2:egg_nesting_block",
  );
  const eggState = dragonEgg.getProperty("dragonmounts2:egg_state");

  if (eggNestingBlock === true || eggState !== "transformed") return;

  const eggDim = dragonEgg.dimension;
  if (!eggDim.isChunkLoaded(dragonEgg.location)) return;

  const currentTypeId = dragonEgg.typeId;
  const eggLoc = eggDim.getBlock(dragonEgg.location).center();

  for (const key in convertTypes) {
    const convertData = convertTypes[key];
    if (!convertData) continue;
    if (convertData.egg_type === currentTypeId) continue;
    if (convertData.deny === currentTypeId) continue;

    const checker = methodCheckers[convertData.hatch_method];
    if (!checker) continue;

    if (checker(dragonEgg, eggDim, eggLoc, convertData.block_placement)) {
      return convertDragonEgg(dragonEgg, convertData.egg_type);
    }
  }
}

function checkRingMethod(dragonEgg, eggDim, eggLoc, blockPlacement) {
  return checkPrimaryOrSecondary(
    eggDim,
    eggLoc,
    blockPlacement,
    checkLocations,
  );
}

function checkRadiusMethod(dragonEgg, eggDim, eggLoc, blockPlacement) {
  return checkPrimaryOrSecondary(
    eggDim,
    eggLoc,
    blockPlacement,
    checkRadiusArea,
  );
}

function checkSingleMethod(dragonEgg, eggDim, eggLoc, blockPlacement) {
  return checkPrimaryOrSecondary(
    eggDim,
    eggLoc,
    blockPlacement,
    checkSingleLocation,
  );
}

function checkPrimaryOrSecondary(eggDim, eggLoc, blockPlacement, checker) {
  const firstMethod = blockPlacement?.first_method;
  if (firstMethod && checker(eggDim, eggLoc, firstMethod)) return true;
  const secondMethod = blockPlacement?.second_method;
  return secondMethod ? checker(eggDim, eggLoc, secondMethod) : false;
}

function checkLocations(eggDim, eggLoc, method) {
  if (!method.xz_locations) return false;
  for (const dxz of method.xz_locations) {
    const requiredBlock = eggDim.getBlock({
      x: eggLoc.x + dxz.x,
      y: eggLoc.y + method.y_location,
      z: eggLoc.z + dxz.z,
    });
    if (!requiredBlock || !method.blocks.includes(requiredBlock.typeId))
      return false;
  }
  return true;
}

function checkRadiusArea(eggDim, eggLoc, method) {
  const { start_xz_locations: start, end_xz_locations: end } = method;
  for (let x = start.x; x <= end.x; x++) {
    for (let z = start.z; z <= end.z; z++) {
      const requiredBlock = eggDim.getBlock({
        x: eggLoc.x + x,
        y: eggLoc.y + method.y_location,
        z: eggLoc.z + z,
      });
      if (!requiredBlock || !method.blocks.includes(requiredBlock.typeId))
        return false;
    }
  }
  return true;
}

function checkSingleLocation(eggDim, eggLoc, method) {
  const { location } = method;
  const requiredBlock = eggDim.getBlock({
    x: eggLoc.x + location.x,
    y: eggLoc.y + location.y,
    z: eggLoc.z + location.z,
  });
  return requiredBlock ? method.blocks.includes(requiredBlock.typeId) : false;
}

function convertDragonEgg(dragonEgg, newTypeId) {
  const dim = dragonEgg.dimension;
  const loc = dragonEgg.location;
  dragonEgg.remove();
  dim.spawnEntity(newTypeId, loc);
}

export function tryActivateEggNestBlock(dragonEgg, eggNestingBlock) {
  if (eggNestingBlock === true || !dragonEgg?.isValid) return;
  dragonEgg.setProperty("dragonmounts2:egg_nesting_block", true);
}

export function tryDeactivateEggNestBlock(dragonEgg, eggNestingBlock) {
  if (eggNestingBlock === false || !dragonEgg?.isValid) return;
  dragonEgg.setProperty("dragonmounts2:egg_nesting_block", false);
}
