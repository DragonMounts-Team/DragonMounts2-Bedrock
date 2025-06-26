import { system, world } from '@minecraft/server';

world.beforeEvents.worldInitialize.subscribe(initEvent => {
  initEvent.blockComponentRegistry.registerCustomComponent('bj_forest_egg_block:trigger', {
    onPlayerInteract: e => {
      const { x, y, z } = e.block.location;
      e.player.runCommandAsync(`summon dragonmounts:forest_dragon_egg ${x} ${y + 1} ${z}`);
      e.player.runCommandAsync(`setblock ${x} ${y} ${z} air`);
    },
  });
});