import { Player, world, system } from '@minecraft/server';

const cooldownMap = new Map();

function setCooldown(player, tickDelay) {
  cooldownMap.set(player.id, system.currentTick + tickDelay);
}

function isOnCooldown(player) {
  const cooldownEnd = cooldownMap.get(player.id) || 0;
  return system.currentTick < cooldownEnd;
}

const validDragonIds = [
  "dm2:aether_dragon",
  "dm2:enchant_dragon",
  "dm2:ender_dragon",
  "dm2:nether_dragon",
  "dm2:ice_dragon",
  "dm2:fire_dragon",
  "dm2:forest_dragon",
  "dm2:moonlight_dragon",
  "dm2:sunlight_dragon",
  "dm2:zombie_dragon",
  "dm2:water_dragon",
  "dm2:terra_dragon",
  "dm2:skeleton_dragon",
  "dm2:wither_dragon",
  "dm2:storm_dragon",
  "dm2:dark_dragon",
  "dm2:f_enchant_dragon",
  "dm2:f_aether_dragon",
  "dm2:m_ender_dragon",
  "dm2:f_nether_dragon",
  "dm2:f_ice_dragon",
  "dm2:f_fire_dragon",
  "dm2:f_forest_dragon",
  "dm2:f_moonlight_dragon",
  "dm2:f_sunlight_dragon",
  "dm2:f_water_dragon",
  "dm2:f_terra_dragon",
  "dm2:f_storm_dragon",
  "dm2:f_dark_dragon",
  "dm2:r_fire_dragon"
];

world.afterEvents.itemUse.subscribe(e => {
  const player = e.source;
  if (!(player instanceof Player)) return;
  if (e.itemStack.typeId !== "bj:ruby_wand") return;
  if (isOnCooldown(player)) return;

  const riding = player.getComponent("minecraft:riding")?.entityRidingOn;
  if (!riding) return;
  if (!validDragonIds.includes(riding.typeId)) return;

  player.runCommandAsync("function attack");
  setCooldown(player, 10);
});