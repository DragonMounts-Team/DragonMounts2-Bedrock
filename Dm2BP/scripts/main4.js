import { world } from "@minecraft/server";

world.afterEvents.playerSpawn.subscribe(event => {
  const player = event.player;
  if (!event.initialSpawn) return;

  if (player.hasTag("given_starter_structures")) return;
  player.addTag("given_starter_structures");

  const dimension = player.dimension.id;

  if (dimension === "minecraft:overworld") {
    player.runCommandAsync("scoreboard objectives add Timer dummy Timer");
  }
});