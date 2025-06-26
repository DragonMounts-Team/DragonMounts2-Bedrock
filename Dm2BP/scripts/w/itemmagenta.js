import { Player, world, system } from '@minecraft/server';

const cooldownMap = new Map();

function setCooldown(player, tickDelay) {
  cooldownMap.set(player.id, system.currentTick + tickDelay);
}

function isOnCooldown(player) {
  const cooldownEnd = cooldownMap.get(player.id) || 0;
  return system.currentTick < cooldownEnd;
}

world.beforeEvents.worldInitialize.subscribe((event) => {
  event.itemComponentRegistry.registerCustomComponent('bj_whistle_magenta:trigger', {
    onUse: ({ itemStack, source }) => {
      if (!(source instanceof Player)) return;
      if (itemStack.typeId !== 'bj:whistle_magenta') return;
      if (isOnCooldown(source)) return;
      source.runCommandAsync("function item/itemmagenta");
      setCooldown(source, 40);
    }
  });
});

world.afterEvents.itemUse.subscribe((event) => {
  const { itemStack, source } = event;
  if (!(source instanceof Player)) return;
  if (itemStack?.typeId !== "bj:whistle_magenta") return;
  if (isOnCooldown(source)) return;
  source.runCommandAsync("function item/itemmagenta");
  setCooldown(source, 40);
});