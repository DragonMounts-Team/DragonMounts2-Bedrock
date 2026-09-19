import * as itemUtilities from "../utilities/item_utilities.js";

export function registerItemComponents(itemComponentRegistry) {
  for (const [id, component] of getItemComponents()) {
    itemComponentRegistry.registerCustomComponent(id, component);
  }
}

function getItemComponents() {
  return [
  ["dragonmounts2:dragon_flute", DragonFlute],
  ["dragonmounts2:dragon_scepter", DragonScepter],
  ["dragonmounts2:dragon_amulet", DragonAmulet],
  ["dragonmounts2:aether_dragon_scale_effects", Aetherdragon_scaleEffects],
  ["dragonmounts2:storm_dragon_scale_effects", Stormdragon_scaleEffects],
  ["dragonmounts2:fire_dragon_scale_effects", Firedragon_scaleEffects],
  ["dragonmounts2:ice_dragon_scale_effects", Icedragon_scaleEffects],
  ["dragonmounts2:forest_dragon_scale_effects", Forestdragon_scaleEffects],
  ["dragonmounts2:ender_dragon_scale_effects", Enderdragon_scaleEffects],
  ["dragonmounts2:dark_dragon_scale_effects", Darkdragon_scaleEffects],
  ["dragonmounts2:light_dragon_scale_effects", Lightdragon_scaleEffects],
  ["dragonmounts2:enchanted_dragon_scale_effects", Enchanteddragon_scaleEffects],
  ["dragonmounts2:water_dragon_scale_effects", Waterdragon_scaleEffects],
  ["dragonmounts2:moonlight_dragon_scale_effects", Moonlightdragon_scaleEffects],
  ["dragonmounts2:sculk_dragon_scale_effects", Sculkdragon_scaleEffects],
  ["dragonmounts2:terra_dragon_scale_effects", Terradragon_scaleEffects],
  ["dragonmounts2:zombie_dragon_scale_effects", Zombiedragon_scaleEffects],
  ["dragonmounts2:sunlight_dragon_scale_effects", Sunlightdragon_scaleEffects],
  ["dragonmounts2:nether_dragon_scale_effects", Netherdragon_scaleEffects],
  ["dragonmounts2:wither_dragon_scale_effects", Witherdragon_scaleEffects],
  ["dragonmounts2:dragon_scale_shield", dragon_scaleShield],
  ];
}
const DragonFlute = {
  onHitEntity({ attackingEntity, hitEntity, itemStack }, { params }) {
    itemUtilities.dragonFluteHitEntity(
      attackingEntity,
      hitEntity,
      itemStack,
      params,
    );
  },
  onUse({ itemStack, source }, { params }) {
    itemUtilities.dragonFluteUse(itemStack, source, params);
  },
};

const DragonScepter = {
  onCompleteUse({ itemStack, source }, { params }) {
    itemUtilities.dragonScepterCompleteUse(itemStack, source, params);
  },
  onHitEntity({ attackingEntity, hitEntity, itemStack }, { params }) {
    itemUtilities.dragonScepterHitEntity(
      attackingEntity,
      hitEntity,
      itemStack,
      params,
    );
  },
  onUse({ itemStack, source }, { params }) {
    itemUtilities.dragonScepterUse(itemStack, source, params);
  },
};

const DragonAmulet = {
  onHitEntity({ attackingEntity, hitEntity, itemStack }, { params }) {
    itemUtilities.dragonAmuletHitEntity(
      attackingEntity,
      hitEntity,
      itemStack,
      params,
    );
  },
  onUseOn({ block, blockFace, source, itemStack }, { params }) {
    itemUtilities.dragonAmuletUseOn(
      source,
      block,
      blockFace,
      itemStack,
      params,
    );
  },
};

const dragon_scaleShield = {};

const Aetherdragon_scaleEffects = {};
const Firedragon_scaleEffects = {};
const Icedragon_scaleEffects = {};
const Stormdragon_scaleEffects = {};
const Enderdragon_scaleEffects = {};
const Forestdragon_scaleEffects = {};
const Darkdragon_scaleEffects = {};
const Lightdragon_scaleEffects = {};
const Enchanteddragon_scaleEffects = {};
const Waterdragon_scaleEffects = {};
const Moonlightdragon_scaleEffects = {};
const Sculkdragon_scaleEffects = {};
const Terradragon_scaleEffects = {};
const Zombiedragon_scaleEffects = {};
const Sunlightdragon_scaleEffects = {};
const Netherdragon_scaleEffects = {};
const Witherdragon_scaleEffects = {};

