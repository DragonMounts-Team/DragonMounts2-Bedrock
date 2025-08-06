import { world } from "@minecraft/server";

world.beforeEvents.worldInitialize.subscribe(initEvent => {
  initEvent.blockComponentRegistry.registerCustomComponent('dragonmountsplus:precise_rotation', {
    beforeOnPlayerPlace(e) {
      const player = e.player;
      const y = player.getRotation().y;
      let rot = y + 360 * (y != Math.abs(y));
      rot = Math.round(rot / 22.5);
      rot = rot != 16 ? rot : 0;
      e.permutationToPlace = e.permutationToPlace.withState('dragonmountsplus:rotation', rot);
    }
  });
});
