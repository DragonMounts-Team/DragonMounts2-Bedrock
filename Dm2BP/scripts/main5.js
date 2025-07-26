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

// Second listener modified to prevent item spawning
world.afterEvents.playerBreakBlock.subscribe(event => {
    const player = event.player;
    const inventory = player.getComponent("minecraft:inventory");
    const item = inventory.container.getItem(player.selectedSlotIndex);
    const survival = player.getGameMode() == "survival";

    if (item && tools.includes(item.typeId) && survival) {
    }
});