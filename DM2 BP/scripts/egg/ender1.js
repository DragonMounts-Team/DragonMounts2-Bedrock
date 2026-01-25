import { world } from "@minecraft/server";

world.beforeEvents.itemUseOn.subscribe(event => {
  const player = event.source;
  const item = event.itemStack;
  const block = event.block;

  if (!player || !item || !block) return;

  // Kiểm tra người chơi đang "ngồi" (sneaking)
  if (
    player.isSneaking &&
    item.typeId === "minecraft:flint_and_steel" &&
    block.typeId === "minecraft:dragon_egg"
  ) {
    const { x, y, z } = block.location;
    player.runCommandAsync(`setblock ${x} ${y} ${z} air`);
    player.runCommandAsync(`summon dragonmountsplus:ender_dragon_egg ${x} ${y + 1} ${z}`);
  }
});