import { world, system, ItemStack } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";
import * as itemData from "../data/item_data.js";
import * as itemUtilities from "../utilities/item_utilities.js";

system.beforeEvents.startup.subscribe(({itemComponentRegistry}) => {
    itemComponentRegistry.registerCustomComponent("dragonmounts2:dragon_flute", DragonFlute);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:dragon_scepter", DragonScepter);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:dragon_amulet", DragonAmulet);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:aether_dragon_scale_effects", Aetherdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:storm_dragon_scale_effects", Stormdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:fire_dragon_scale_effects", Firedragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:ice_dragon_scale_effects", Icedragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:forest_dragon_scale_effects", Forestdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:ender_dragon_scale_effects", Enderdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:dark_dragon_scale_effects", Darkdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:light_dragon_scale_effects", Lightdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:enchanted_dragon_scale_effects", Enchanteddragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:water_dragon_scale_effects", Waterdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:moonlight_dragon_scale_effects", Moonlightdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:sculk_dragon_scale_effects", Sculkdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:terra_dragon_scale_effects", Terradragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:zombie_dragon_scale_effects", Zombiedragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:sunlight_dragon_scale_effects", Sunlightdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:nether_dragon_scale_effects", Netherdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:wither_dragon_scale_effects", Witherdragon_scaleEffects);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:fire_dragon_scale_lore", Firedragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:ice_dragon_scale_lore", Icedragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:storm_dragon_scale_lore", Stormdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:forest_dragon_scale_lore", Forestdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:ender_dragon_scale_lore", Enderdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:enchanted_dragon_scale_lore", Enchanteddragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:dark_dragon_scale_lore", Darkdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:light_dragon_scale_lore", Lightdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:aether_dragon_scale_lore", Aetherdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:water_dragon_scale_lore", Waterdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:moonlight_dragon_scale_lore", Moonlightdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:sculk_dragon_scale_lore", Sculkdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:terra_dragon_scale_lore", Terradragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:zombie_dragon_scale_lore", Zombiedragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:sunlight_dragon_scale_lore", Sunlightdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:nether_dragon_scale_lore", Netherdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:wither_dragon_scale_lore", Witherdragon_scaleLore);
    itemComponentRegistry.registerCustomComponent("dragonmounts2:dragon_scale_shield", dragon_scaleShield);
});
const DragonFlute = {
    onHitEntity({attackingEntity,hitEntity,itemStack},{params}) {
        itemUtilities.dragonFluteHitEntity(attackingEntity,hitEntity,itemStack,params);
    },
    onUse({itemStack,source},{params}) {
        itemUtilities.dragonFluteUse(itemStack,source,params);
    }
};

const DragonScepter = {
    onCompleteUse({itemStack,source},{params}) {
        itemUtilities.dragonScepterCompleteUse(itemStack,source,params);
    },
    onHitEntity({attackingEntity,hitEntity,itemStack},{params}) {
        itemUtilities.dragonScepterHitEntity(attackingEntity,hitEntity,itemStack,params);
    },
    onUse({itemStack,source},{params}) {
        itemUtilities.dragonScepterUse(itemStack,source,params);
    }
};

const DragonAmulet = {
    onHitEntity({attackingEntity,hitEntity,itemStack},{params}) {
        itemUtilities.dragonAmuletHitEntity(attackingEntity,hitEntity,itemStack,params);
    },
    onUseOn({block,blockFace,source,itemStack},{params}) {
        itemUtilities.dragonAmuletUseOn(source,block,blockFace,itemStack,params);
    }
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

const Firedragon_scaleLore = {};
const Icedragon_scaleLore = {};
const Stormdragon_scaleLore = {};
const Enderdragon_scaleLore = {};
const Forestdragon_scaleLore = {};
const Enchanteddragon_scaleLore = {};
const Darkdragon_scaleLore = {};
const Lightdragon_scaleLore = {};
const Aetherdragon_scaleLore = {};
const Waterdragon_scaleLore = {};
const Moonlightdragon_scaleLore = {};
const Sculkdragon_scaleLore = {};
const Terradragon_scaleLore = {};
const Zombiedragon_scaleLore = {};
const Sunlightdragon_scaleLore = {};
const Netherdragon_scaleLore = {};
const Witherdragon_scaleLore = {};