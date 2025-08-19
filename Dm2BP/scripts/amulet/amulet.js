import { world } from "@minecraft/server";

const EntitiesDeny = [
    "minecraft:ender_crystal",
    "minecraft:ender_dragon",
    "minecraft:falling_block",
    "minecraft:player",
    "minecraft:warden",
    "minecraft:wither"
];

const AllowedMobs = [
        "dragonmountsplus:enchant_dragon",
        "dragonmountsplus:aether_dragon",
        "dragonmountsplus:ender_dragon",
        "dragonmountsplus:nether_dragon",
        "dragonmountsplus:ice_dragon",
        "dragonmountsplus:fire_dragon",
        "dragonmountsplus:forest_dragon",
        "dragonmountsplus:moonlight_dragon",
        "dragonmountsplus:sunlight_dragon",
        "dragonmountsplus:zombie_dragon",
        "dragonmountsplus:water_dragon",
        "dragonmountsplus:terra_dragon",
        "dragonmountsplus:sculk_dragon",
        "dragonmountsplus:skeleton_dragon",
        "dragonmountsplus:wither_dragon",
        "dragonmountsplus:storm_dragon",
        "dragonmountsplus:dark_dragon"
]  

world.afterEvents.entityHitEntity.subscribe((data) => {
    const { damagingEntity, hitEntity } = data;
    if (damagingEntity.typeId != "minecraft:player") return;

    const family = hitEntity.getComponent("type_family");
    if (!AllowedMobs.includes(hitEntity.typeId) || EntitiesDeny.includes(hitEntity.typeId) || hitEntity.typeId == "minecraft:painting" || family.hasTypeFamily("npc") || family.hasTypeFamily("inanimate")) return;
    
const isTamed = hitEntity.getComponent("minecraft:is_tamed");
if (!isTamed || (typeof isTamed.value === "boolean" && !isTamed.value)) return;

    const equipment = damagingEntity.getComponent("equippable").getEquipment("Mainhand");
    if (equipment == undefined || equipment.typeId != "dragonmountsplus:amulet") return;

    const { x, y, z } = hitEntity.location;
    const lore = equipment.getLore();

    if (equipment.getLore().length == 0 && equipment.typeId == "dragonmountsplus:amulet" && hitEntity.typeId != "minecraft:player") {
        equipment.setLore([`Name: ${hitEntity.typeId}`,`ID: ${hitEntity.id}`]);
        damagingEntity.getComponent("equippable").setEquipment("Mainhand", equipment);
        hitEntity.runCommand(`ride @a[r=3.1] stop_riding`);
        hitEntity.runCommand(`tp ${x} ${y + 320} ${z}`);
        hitEntity.runCommand(`structure save "${hitEntity.id}" ${x} ${y + 320} ${z} ${x} ${y + 320} ${z} true disk false`);
        hitEntity.runCommand(`playsound mob.endermen.portal @a ${x} ${y} ${z} 1 1 `);
        hitEntity.remove();
    };
});

world.beforeEvents.worldInitialize.subscribe((data) => {
    data.itemComponentRegistry.registerCustomComponent("dragonmountsplus:amulet", {
        onUseOn: ((event) => {
            const { block, blockFace, source, itemStack} = event;
            const pos = block.location;
            const direction = {
                "North": {x: pos.x +0.5, y: pos.y, z: pos.z -0.5},
                "South": {x: pos.x +0.5, y: pos.y, z: pos.z +1.5},
                "East": {x: pos.x +1.5, y: pos.y, z: pos.z +0.5},
                "West": {x: pos.x -0.5, y: pos.y, z: pos.z +0.5},
                "Up": {x: pos.x +0.5, y: pos.y +1, z: pos.z +0.5},
                "Down": {x: pos.x +0.5, y: pos.y -1, z: pos.z +0.5}
            };
            const { x, y, z } = direction[blockFace];

            if (itemStack.getLore().length > 0) {
                source.runCommand(`structure load "${Number(itemStack.getLore()[1].replace("ID: ", ""))}" ${x} ${y} ${z}`);
                source.runCommand(`structure delete "${Number(itemStack.getLore()[1].replace("ID: ", ""))}"`);
                source.runCommand(`playsound mob.endermen.portal @a ${x} ${y} ${z} 1 1 `);
                itemStack.setLore([]);
                source.getComponent("equippable").setEquipment("Mainhand", itemStack);
            };
        })
    });
});
