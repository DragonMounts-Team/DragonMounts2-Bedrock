import * as blockUtilities from "../utilities/block_utilities.js";

const DragonCoreComponent = {
  onPlayerInteract({ block, dimension, player }, { params }) {
    blockUtilities.dragonCorePlayerInteract(block, dimension, player, params);
  },
};

const DragonEggComponent = {
  onPlayerInteract({ block, dimension, player }, { params }) {
    blockUtilities.dragonEggPlayerInteract(block, dimension, player, params);
  },
  onRandomTick({ block, dimension }, { params }) {
    blockUtilities.dragonEggRandomTick(block, dimension, params);
  },
};

export function registerBlockComponents(blockComponentRegistry) {
  blockComponentRegistry.registerCustomComponent(
    "dragonmounts2:dragon_core",
    DragonCoreComponent,
  );
  blockComponentRegistry.registerCustomComponent(
    "dragonmounts2:dragon_egg",
    DragonEggComponent,
  );
}
