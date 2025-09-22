
import { world, ItemStack } from '@minecraft/server';

function dropFallingBlock(blockId, dimension, location) {
    const centerLocation = { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 };
    if (world.gameRules.doEntityDrops) dimension.spawnItem(new ItemStack(blockId), centerLocation);
    dimension.spawnParticle(`${blockId}.break_particle`, centerLocation);
}

export const FallingBlocks = {
    'dragonmountsplus:aether_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:aether_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:dark_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:dark_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:enchant_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:enchant_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:fire_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:fire_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:forest_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:forest_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:ice_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:ice_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:moonlight_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:moonlight_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:nether_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:nether_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:sculk_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:sculk_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:skeleton_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:skeleton_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:storm_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:storm_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:sunlight_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:sunlight_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:terra_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:terra_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:water_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:water_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:wither_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:wither_dragon_egg', dimension, location); }
    },
    'dragonmountsplus:zombie_dragon_egg': {
        onRemove: (dimension, location) => { dropFallingBlock('dragonmountsplus:zombie_dragon_egg', dimension, location); }
    }
}
