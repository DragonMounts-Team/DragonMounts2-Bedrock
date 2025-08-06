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
  "dragonmountsplus:aether_dragon",
  "dragonmountsplus:enchant_dragon",
  "dragonmountsplus:ender_dragon",
  "dragonmountsplus:nether_dragon",
  "dragonmountsplus:ice_dragon",
  "dragonmountsplus:fire_dragon",
  "dragonmountsplus:forest_dragon",
  "dragonmountsplus:moonlight_dragon",
  "dragonmountsplus:sculk_dragon",
  "dragonmountsplus:sunlight_dragon",
  "dragonmountsplus:zombie_dragon",
  "dragonmountsplus:water_dragon",
  "dragonmountsplus:terra_dragon",
  "dragonmountsplus:skeleton_dragon",
  "dragonmountsplus:wither_dragon",
  "dragonmountsplus:storm_dragon",
  "dragonmountsplus:dark_dragon",
];

world.afterEvents.itemUse.subscribe(e => {
  const player = e.source;
  if (!(player instanceof Player)) return;
  if (e.itemStack.typeId !== "dragonmountsplus:amethyst_wand") return;
  if (isOnCooldown(player)) return;

  const riding = player.getComponent("minecraft:riding")?.entityRidingOn;
  if (!riding) return;
  if (!validDragonIds.includes(riding.typeId)) return;

  player.runCommandAsync("function attack");
  setCooldown(player, 10);
});
