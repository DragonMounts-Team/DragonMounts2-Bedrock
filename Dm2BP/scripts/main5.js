import { world, ItemStack } from '@minecraft/server';

const tools = [
   'dm2:diamond_shears'
];
world.afterEvents.playerBreakBlock.subscribe(event => {
    const { itemStackBeforeBreak, player } = event;
    const survival = player.getGameMode() == "survival";
    if (!itemStackBeforeBreak || !tools.includes(itemStackBeforeBreak.typeId)) return;

    if (survival) {
        try {
            const durability = itemStackBeforeBreak.getComponent('durability');
            durability.damage += 1;
            player.getComponent('equippable').setEquipment('Mainhand', itemStackBeforeBreak);
        } catch {
            player.playSound('random.break', { pitch: 1, location: player.location, volume: 1 });
            player.getComponent('equippable').setEquipment('Mainhand');
        }
    }
});

world.afterEvents.playerBreakBlock.subscribe(event => {
    const player = event.player;
    const inventory = player.getComponent("minecraft:inventory");
    const item = inventory.container.getItem(player.selectedSlotIndex)
    const survival = player.getGameMode() == "survival";

    if (item && tools.includes(item.typeId) && survival) {
        const blockBefore = event.brokenBlockPermutation;
        const block = event.block;
        const blockLocation = block.location;

        switch (blockBefore.type.id) {
            case 'minecraft:vine':
                player.dimension.spawnItem(new ItemStack('minecraft:vine', 1), blockLocation);
                break;
            case 'minecraft:acacia_leaves':
                player.dimension.spawnItem(new ItemStack('minecraft:acacia_leaves', 1), blockLocation);
                break;
            case 'minecraft:azalea_leaves':
                player.dimension.spawnItem(new ItemStack('minecraft:azalea_leaves', 1), blockLocation);
                break;
            case 'minecraft:azalea_leaves_flowered':
                player.dimension.spawnItem(new ItemStack('minecraft:azalea_leaves_flowered', 1), blockLocation);
                break;
            case 'minecraft:birch_leaves':
                player.dimension.spawnItem(new ItemStack('minecraft:birch_leaves', 1), blockLocation);
                break;
            case 'minecraft:cherry_leaves':
                player.dimension.spawnItem(new ItemStack('minecraft:cherry_leaves', 1), blockLocation);
                break;
            case 'minecraft:dark_oak_leaves':
                player.dimension.spawnItem(new ItemStack('minecraft:dark_oak_leaves', 1), blockLocation);
                break;
            case 'minecraft:jungle_leaves':
                player.dimension.spawnItem(new ItemStack('minecraft:jungle_leaves', 1), blockLocation);
                break;
            case 'minecraft:mangrove_leaves':
                player.dimension.spawnItem(new ItemStack('minecraft:mangrove_leaves', 1), blockLocation);
                break;
            case 'minecraft:oak_leaves':
                player.dimension.spawnItem(new ItemStack('minecraft:oak_leaves', 1), blockLocation);
                break;
            case 'minecraft:spruce_leaves':
                player.dimension.spawnItem(new ItemStack('minecraft:spruce_leaves', 1), blockLocation);
                break;
            case 'minecraft:seagrass':
                player.dimension.spawnItem(new ItemStack('minecraft:seagrass', 1), blockLocation);
                break;
            case 'minecraft:short_grass':
                player.dimension.spawnItem(new ItemStack('minecraft:short_grass', 1), blockLocation);
                break;
            case 'minecraft:tall_grass':
                player.dimension.spawnItem(new ItemStack('minecraft:tall_grass', 2), blockLocation);
                break;
            case 'minecraft:twisting_vines':
                player.dimension.spawnItem(new ItemStack('minecraft:twisting_vines', 1), blockLocation);
                break;
            case 'minecraft:weeping_vines':
                player.dimension.spawnItem(new ItemStack('minecraft:weeping_vines', 1), blockLocation);
                break;
        }
    }
})
// shears custom by mimic