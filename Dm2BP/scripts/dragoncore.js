import { world } from "@minecraft/server";

// Cấu hình: mỗi key ứng với một entity
const summonMap = {
  "dm2:essence_aether": "dm2:aether_dragon",
  "dm2:essence_nether": "dm2:nether_dragon",
  "dm2:essence_ender": "dm2:ender_dragon",
  "dm2:essence_enchant": "dm2:enchant_dragon",
  "dm2:essence_sunlight": "dm2:sunlight_dragon",
  "dm2:essence_moonlight": "dm2:moonlight_dragon",
  "dm2:essence_storm": "dm2:storm_dragon",
  "dm2:essence_dark": "dm2:dark_dragon",
  "dm2:essence_skeleton": "dm2:skeleton_dragon",
  "dm2:essence_wither": "dm2:wither_dragon",
  "dm2:essence_zombie": "dm2:zombie_dragon",
  "dm2:essence_terra": "dm2:terra_dragon",
  "dm2:essence_water": "dm2:water_dragon",
  "dm2:essence_fire": "dm2:fire_dragon",
  "dm2:essence_forest": "dm2:forest_dragon",
  "dm2:essence_ice": "dm2:ice_dragon"
};

world.beforeEvents.itemUseOn.subscribe(event => {
  const player = event.source;
  const item = event.itemStack;
  const block = event.block;

  if (!player || !item || !block) return;

  const entityId = summonMap[item.typeId];
  if (!entityId || block.typeId !== "dragonmounts:dragon_core") return;

  const { x, y, z } = block.location;

  player.runCommandAsync(`clear @s ${item.typeId} 0 1`);
  player.runCommandAsync(`playsound mob.endermen.portal @a ${x} ${y} ${z} 1 1 `);
  player.runCommandAsync(`setblock ${x} ${y} ${z} air`);
  player.runCommandAsync(`summon ${entityId} ${x} ${y} ${z} minecraft:entity_transformed`);
});
//hi grummboy ping me if you read this code