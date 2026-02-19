import {world, system, EquipmentSlot, EntityEquippableComponent } from "@minecraft/server";

const NAMESPACE = "dragonmounts2";
const CHECK_INTERVAL = 20;
const EFFECT_DURATION = 100;

const armorSets = {
  water: {
    prefix: "water_dragonscale",
    effects: [["water_breathing", 3]],
  },
  nether: {
    prefix: "nether_dragonscale",
    effects: [["fire_resistance", 0]],
  },
  dark: {
    prefix: "dark_dragonscale",
    effects: [["resistance", 1]],
  },
  terra: {
    prefix: "terra_dragonscale",
    effects: [["haste", 1]],
  },
  storm: {
    prefix: "storm_dragonscale",
    effects: [["slow_falling", 0]],
  },
  sculk: {
    prefix: "sculk_dragonscale",
    effects: [["resistance", 3]],
  },
  sunlight: {
    prefix: "sunlight_dragonscale",
    effects: [["regeneration", 0]],
  },
  moonlight: {
    prefix: "moonlight_dragonscale",
    effects: [["night_vision", 0]],
  },
  ender: {
    prefix: "ender_dragonscale",
    effects: [
      ["resistance", 2],
      ["strength", 1],
    ],
  },
  fire: {
    prefix: "fire_dragonscale",
    effects: [["fire_resistance", 0]],
  },
  forest: {
    prefix: "forest_dragonscale",
    effects: [["regeneration", 2]],
  },
  zombie: {
    prefix: "zombie_dragonscale",
    effects: [["strength", 2]],
  },
  aether: {
    prefix: "aether_dragonscale",
    effects: [["speed", 2]],
  },
};
const activeSets = new Map();
function isWearingFullSet(equippable, prefix) {
  return (
    equippable.getEquipment(EquipmentSlot.Head)?.typeId === `${NAMESPACE}:${prefix}_helmet` &&
    equippable.getEquipment(EquipmentSlot.Chest)?.typeId === `${NAMESPACE}:${prefix}_chestplate` &&
    equippable.getEquipment(EquipmentSlot.Legs)?.typeId === `${NAMESPACE}:${prefix}_leggings` &&
    equippable.getEquipment(EquipmentSlot.Feet)?.typeId === `${NAMESPACE}:${prefix}_boots`
  );
}
function applyArmorEffects() {
  for (const player of world.getPlayers()) {
    const equippable = player.getComponent(EntityEquippableComponent.componentId);
    if (!equippable) continue;
    let matchedSet = null;
    for (const set of Object.values(armorSets)) {
      if (isWearingFullSet(equippable, set.prefix)) {
        matchedSet = set;
        break;
      }
    }
    if (!matchedSet) {
      activeSets.delete(player.id);
      continue;
    }
    const previous = activeSets.get(player.id);
    if (previous !== matchedSet.prefix) {
      activeSets.set(player.id, matchedSet.prefix);
    }
    for (const [effectId, amplifier] of matchedSet.effects) {
      player.addEffect(effectId, EFFECT_DURATION, {
        amplifier,
        showParticles: false,
      });
    }
  }
}
system.runInterval(applyArmorEffects, CHECK_INTERVAL);