import { world, system, BlockPermutation, BlockVolume } from '@minecraft/server';
import { FallingBlocks } from './fallingBlocks.js';

class FallingBlockUtils {
    // Stores falling block types for easy access
    static FallingBlockTypes = Object.keys(FallingBlocks);
    // Creates permutations of all FallingBlocks for easy access
    static FallingBlockPermutations = Object.fromEntries(Object.keys(FallingBlocks).map(id => [id, BlockPermutation.resolve(id)]));
    // Air Permutation
    static AirBlock = BlockPermutation.resolve('minecraft:air');
    // The name of the states and properties used in layer blocks
    static LayerState = 'falling_block:layers';
    static LayerProperty = 'falling_block:layers';
    // These are the blocks that can be replaced by the falling blocks
    static ReplaceableBlocks = new Set([
    'minecraft:air', 'minecraft:structure_void',
    'minecraft:water', 'minecraft:flowing_water', 'minecraft:bubble_column',
    'minecraft:lava', 'minecraft:flowing_lava',
    'minecraft:fire', 'minecraft:soul_fire',
    'minecraft:vine', 'minecraft:glow_lichen',
    'minecraft:deadbush', 'minecraft:short_grass', 'minecraft:tall_grass',
    'minecraft:fern', 'minecraft:large_fern', 'minecraft:seagrass',
    'minecraft:warped_roots', 'minecraft:crimson_roots', 'minecraft:nether_sprouts',
    'minecraft:light_block_0', 'minecraft:light_block_1', 'minecraft:light_block_2', 'minecraft:light_block_3',
    'minecraft:light_block_4', 'minecraft:light_block_5', 'minecraft:light_block_6', 'minecraft:light_block_7',
    'minecraft:light_block_8', 'minecraft:light_block_9', 'minecraft:light_block_10', 'minecraft:light_block_11',
    'minecraft:light_block_12', 'minecraft:light_block_13', 'minecraft:light_block_14', 'minecraft:light_block_15'
    ]);
    // The Falling Blocks that are on top of these blocks will fall
    static PassableBlocks = new Set([...FallingBlockUtils.ReplaceableBlocks,
    'minecraft:moss_carpet', 'minecraft:pale_moss_carpet', 'minecraft:pale_hanging_moss',
    'minecraft:acacia_sapling', 'minecraft:bamboo_sapling', 'minecraft:birch_sapling',
    'minecraft:cherry_sapling', 'minecraft:dark_oak_sapling', 'minecraft:jungle_sapling',
    'minecraft:mangrove_propagule', 'minecraft:pale_oak_sapling', 'minecraft:oak_sapling',
    'minecraft:spruce_sapling', 'minecraft:kelp', 'minecraft:sea_pickle', 'minecraft:reeds',
    'minecraft:nether_wart', 'minecraft:twisting_vines', 'minecraft:warped_fungus',
    'minecraft:crimson_fungus', 'minecraft:brown_mushroom', 'minecraft:red_mushroom',
    'minecraft:small_dripleaf_block', 'minecraft:snow_layer', 'minecraft:cocoa', 'minecraft:wheat', 
    'minecraft:potatoes', 'minecraft:carrots', 'minecraft:beetroot', 'minecraft:pumpkin_stem',
    'minecraft:melon_stem', 'minecraft:pitcher_crop', 'minecraft:torchflower_crop', 'minecraft:sweet_berry_bush',
    'minecraft:brain_coral', 'minecraft:brain_coral_fan', 'minecraft:brain_coral_wall_fan',
    'minecraft:bubble_coral', 'minecraft:bubble_coral_fan', 'minecraft:bubble_coral_wall_fan',
    'minecraft:fire_coral', 'minecraft:fire_coral_fan', 'minecraft:fire_coral_wall_fan',
    'minecraft:horn_coral', 'minecraft:horn_coral_fan', 'minecraft:horn_coral_wall_fan',
    'minecraft:tube_coral', 'minecraft:tube_coral_fan', 'minecraft:tube_coral_wall_fan',
    'minecraft:dead_brain_coral', 'minecraft:dead_brain_coral_fan', 'minecraft:dead_brain_coral_wall_fan',
    'minecraft:dead_bubble_coral', 'minecraft:dead_bubble_coral_fan', 'minecraft:dead_bubble_coral_wall_fan',
    'minecraft:dead_fire_coral', 'minecraft:dead_fire_coral_fan', 'minecraft:dead_fire_coral_wall_fan',
    'minecraft:dead_horn_coral', 'minecraft:dead_horn_coral_fan', 'minecraft:dead_horn_coral_wall_fan',
    'minecraft:dead_tube_coral', 'minecraft:dead_tube_coral_fan', 'minecraft:dead_tube_coral_wall_fan',
    'minecraft:dandelion', 'minecraft:poppy', 'minecraft:blue_orchid', 'minecraft:allium', 'minecraft:azure_bluet',
    'minecraft:red_tulip', 'minecraft:orange_tulip', 'minecraft:white_tulip', 'minecraft:pink_tulip', 'minecraft:oxeye_daisy',
    'minecraft:cornflower', 'minecraft:lily_of_the_valley', 'minecraft:sunflower', 'minecraft:lilac', 
    'minecraft:rose_bush', 'minecraft:peony', 'minecraft:pitcher_plant', 'minecraft:pink_petals',
    'minecraft:wither_rose', 'minecraft:torchflower', 'minecraft:open_eyeblossom', 'minecraft:closed_eyeblossom'
    ]);
    // These entities can trigger falling blocks when spawning
    static TriggeringEntities = new Set(['minecraft:tnt', 'minecraft:falling_block']);
    // Check if the block should fall
    static shouldFall(block, fb) {
        if (block.y <= block.dimension.heightRange.min) return false;
        const blockBelow = block.below();
        return blockBelow && (FallingBlockUtils.PassableBlocks.has(blockBelow.typeId) || (fb.config?.type === 'layers' && blockBelow.typeId === block.typeId && blockBelow.permutation.getState(FallingBlockUtils.LayerState) < fb.config.maxLayers - 1));
    }
    // Check if the block is water
    static isWater(block) { return block && (block.typeId === 'minecraft:water' || block.typeId === 'minecraft:flowing_water'); }
    // Resolves the permutation to be placed for the powder blocks
    static resolvePowderPermutation(permutation, solidBlock, isInWater = false) {
        return (!solidBlock || !isInWater) ? FallingBlockUtils.FallingBlockPermutations[permutation] : solidBlock instanceof BlockPermutation ? solidBlock : BlockPermutation.resolve(solidBlock);
    }
    // Custom component for placing powder blocks
    static PowderPlacement = { beforeOnPlayerPlace(data) { if (FallingBlockUtils.isWater(data.block)) data.permutationToPlace = FallingBlockUtils.resolvePowderPermutation(data.permutationToPlace.type.id, FallingBlocks[data.permutationToPlace.type.id]?.config?.solidBlock, true); } }
    // Custom component for placing layer blocks
    static LayerPlacement = {
        onPlayerInteract({ player, block }) {
            const equippableComp = player.getComponent('equippable'), itemStack = equippableComp.getEquipment('Mainhand');
            if (itemStack?.typeId !== block.typeId) return;
            block.setPermutation(block.permutation.withState(FallingBlockUtils.LayerState, block.permutation.getState(FallingBlockUtils.LayerState) + 1));
            // decrement stack
            if (player.getGameMode() !== 'creative') {
                if (itemStack.amount <= 1) equippableComp.setEquipment('Mainhand', null);
                else { itemStack.amount--; equippableComp.setEquipment('Mainhand', itemStack); }
            }
        }
    }
    // Maps custom components with their respective identifiers
    static CustomComponents = { 
        'falling_block:powder_placement': FallingBlockUtils.PowderPlacement,
        'falling_block:layer_placement': FallingBlockUtils.LayerPlacement
    }
}

class FallingBlockManager {
    // Pull the Falling Blocks stacked in sequence.
    pullAboveBlock(block) { if (block.y < block.dimension.heightRange.max) system.runTimeout(() => this.startFalling(block.above()), 5); }
    // Handles the logic of causing the blocks to fall.
    startFalling(block) {
        const fb = FallingBlocks[block?.typeId];
        if (!fb || !FallingBlockUtils.shouldFall(block, fb)) return;
        const { typeId, permutation } = block;
        fb.onStartFalling?.(block.dimension, block.location);
        block.setPermutation(FallingBlockUtils.AirBlock);
        const fallingEntity = block.dimension.spawnEntity(`${typeId}.entity`, { x: block.x + 0.5, y: block.y, z: block.z + 0.5 });
        if (fb.config?.fallingSpeed) fallingEntity.applyImpulse({ x: 0, y: Math.min(1, -Math.abs(fb.config.fallingSpeed)), z: 0 });
        if (fb.config?.type === 'layers') fallingEntity.setProperty(FallingBlockUtils.LayerProperty, permutation.getState(FallingBlockUtils.LayerState));
        this.pullAboveBlock(block);
    }
    // Handles the logic of placing the blocks after falling.
    onGround(block, entity) {
        const id = entity.typeId.replace('.entity', ''), fb = FallingBlocks[id]; 
        if (!fb) return;
        let permutationToPlace = null;
        const isReplaceable = FallingBlockUtils.ReplaceableBlocks.has(block.typeId),
        stackLayers = fb.config?.type === 'layers' && block.typeId === id,
        action = !stackLayers && (fb.config?.destroyOnFall || !isReplaceable) ? 'destroy' : fb.config?.type;
        switch (action) {
            case 'destroy': break;
            case 'powder': permutationToPlace = FallingBlockUtils.resolvePowderPermutation(id, fb.config?.solidBlock, entity.isInWater); break;
            case 'layers': {
                const addLayers = 1 + entity.getProperty(FallingBlockUtils.LayerProperty);
                if (!stackLayers) { if (isReplaceable) permutationToPlace = FallingBlockUtils.FallingBlockPermutations[id].withState(FallingBlockUtils.LayerState, addLayers - 1 ); break; }
                const blockLayers = block.permutation.getState(FallingBlockUtils.LayerState) + addLayers;
                if (blockLayers < fb.config.maxLayers) { permutationToPlace = FallingBlockUtils.FallingBlockPermutations[id].withState(FallingBlockUtils.LayerState, blockLayers ); break; }
                permutationToPlace = FallingBlockUtils.FallingBlockPermutations[id].withState(FallingBlockUtils.LayerState, fb.config.maxLayers - 1 );
                if (block.y < block.dimension.heightRange.max) block.above().setPermutation(BlockPermutation.resolve(id, { [FallingBlockUtils.LayerState]: blockLayers - fb.config.maxLayers }));
                break;
            }
            default: permutationToPlace = FallingBlockUtils.FallingBlockPermutations[id];
        }
        entity.remove();
        if (permutationToPlace) { block.setPermutation(permutationToPlace); fb.onGround?.(block); }
        else fb.onRemove?.(block.dimension, block.location);
    }
}
const FBM = new FallingBlockManager();

// Falling Blocks Triggering Events
world.afterEvents.playerBreakBlock.subscribe(({ block }) => FBM.startFalling(block.dimension.getBlockFromRay(block.location, { x: 0, y: 1, z: 0 }, { maxDistance: 2 })?.block));
world.afterEvents.playerPlaceBlock.subscribe(({ block }) => { FBM.startFalling(block) }, { blockTypes: Object.keys(FallingBlocks) });
world.afterEvents.explosion.subscribe((data) => {
    const impactedBlocks = data.getImpactedBlocks();
    for (let i = 0; i < impactedBlocks.length; i++) {
        const aboveBlock = impactedBlocks[i]?.above();
        if (FallingBlocks[aboveBlock?.typeId]) FBM.startFalling(aboveBlock);
    }
});
world.afterEvents.pistonActivate.subscribe(async ({ piston: { block }, isExpanding }) => {
    if (block.typeId === 'minecraft:piston' && !isExpanding) {
        const offset = { x: 0, y: 1, z: 0 };
        const facingDirection = block.permutation.getState('facing_direction');
        if (block.y === block.dimension.heightRange.max) return;
        switch (facingDirection) {
            case 0: offset.y = 0; break;
            case 1: if (block.y + 1 < block.dimension.heightRange.max) offset.y = 2; break;
            case 2: offset.z = 1; break;
            case 3: offset.z = -1; break;
            case 4: offset.x = 1; break;
            case 5: offset.x = -1; break;
        }
        if (offset.y) FBM.startFalling(block.offset(offset));
        return;
    }
    const fallingBlockLocations = block.dimension.getBlocks(new BlockVolume(
    { x: block.x - 13, y: block.y - 13, z: block.z - 13 },
    { x: block.x + 13, y: block.y + 13, z: block.z + 13 }
    ), { includeTypes: ['minecraft:moving_block'] })?.getBlockLocationIterator();
    await system.waitTicks(2);
    if (fallingBlockLocations) for (const location of fallingBlockLocations) FBM.startFalling(block.dimension.getBlock(location));
});
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    if (!FallingBlockUtils.TriggeringEntities.has(entity.typeId)) return;
    if (entity.location.y < entity.dimension.heightRange.max) FBM.startFalling(entity.dimension.getBlock({ x: entity.location.x, y: entity.location.y + 1, z: entity.location.z }));
});
// Triggers when the falling entity touches the ground
system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity }) => {
    if (id === 'falling_block:is_on_ground') {
        if (!sourceEntity || sourceEntity.location.y < sourceEntity.dimension.heightRange.min || sourceEntity.location.y > sourceEntity.dimension.heightRange.max) sourceEntity?.remove();
        else FBM.onGround(sourceEntity.dimension.getBlock(sourceEntity.location), sourceEntity);
    }
});
// Custom component registration
world.beforeEvents.worldInitialize.subscribe(({ blockComponentRegistry }) => { for (const [id, comp] of Object.entries(FallingBlockUtils.CustomComponents)) blockComponentRegistry.registerCustomComponent(id, comp); });