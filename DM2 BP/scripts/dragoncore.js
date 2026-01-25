import { world } from "@minecraft/server";

// Cấu hình: mỗi key ứng với một entity
const summonMap = {
  "dragonmountsplus:essence_aether": "dragonmountsplus:aether_dragon",
  "dragonmountsplus:essence_nether": "dragonmountsplus:nether_dragon",
  "dragonmountsplus:essence_ender": "dragonmountsplus:ender_dragon",
  "dragonmountsplus:essence_enchant": "dragonmountsplus:enchant_dragon",
  "dragonmountsplus:essence_sunlight": "dragonmountsplus:sunlight_dragon",
  "dragonmountsplus:essence_moonlight": "dragonmountsplus:moonlight_dragon",
  "dragonmountsplus:essence_storm": "dragonmountsplus:storm_dragon",
  "dragonmountsplus:essence_dark": "dragonmountsplus:dark_dragon",
  "dragonmountsplus:essence_sculk": "dragonmountsplus:sculk_dragon",
  "dragonmountsplus:essence_skeleton": "dragonmountsplus:skeleton_dragon",
  "dragonmountsplus:essence_wither": "dragonmountsplus:wither_dragon",
  "dragonmountsplus:essence_zombie": "dragonmountsplus:zombie_dragon",
  "dragonmountsplus:essence_terra": "dragonmountsplus:terra_dragon",
  "dragonmountsplus:essence_water": "dragonmountsplus:water_dragon",
  "dragonmountsplus:essence_fire": "dragonmountsplus:fire_dragon",
  "dragonmountsplus:essence_forest": "dragonmountsplus:forest_dragon",
  "dragonmountsplus:essence_ice": "dragonmountsplus:ice_dragon"
};

world.beforeEvents.itemUseOn.subscribe(event => {
  const player = event.source;
  const item = event.itemStack;
  const block = event.block;

  if (!player || !item || !block) return;

  const entityId = summonMap[item.typeId];
  if (!entityId || block.typeId !== "dragonmountsplus:dragon_core") return;

  const { x, y, z } = block.location;

  player.runCommandAsync(`clear @s ${item.typeId} 0 1`);
  player.runCommandAsync(`playsound mob.endermen.portal @a ${x} ${y} ${z} 1 1 `);
  player.runCommandAsync(`setblock ${x} ${y} ${z} air`);
  player.runCommandAsync(`summon ${entityId} ${x} ${y} ${z} minecraft:entity_transformed`);
});
