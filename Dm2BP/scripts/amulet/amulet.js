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
        "dm2:enchant_dragon",
        "dm2:aether_dragon",
        "dm2:ender_dragon",
        "dm2:nether_dragon",
        "dm2:ice_dragon",
        "dm2:fire_dragon",
        "dm2:forest_dragon",
        "dm2:moonlight_dragon",
        "dm2:sunlight_dragon",
        "dm2:zombie_dragon",
        "dm2:water_dragon",
        "dm2:terra_dragon",
         "dm2:skeleton_dragon",
         "dm2:wither_dragon",
        "dm2:storm_dragon",
        "dm2:dark_dragon",
         "dm2:f_enchant_dragon",
        "dm2:f_aether_dragon",
        "dm2:m_ender_dragon",
        "dm2:f_nether_dragon",
        "dm2:f_ice_dragon",
        "dm2:f_fire_dragon",
        "dm2:f_forest_dragon",
        "dm2:f_moonlight_dragon",
        "dm2:f_sunlight_dragon",
        "dm2:f_water_dragon",
        "dm2:f_terra_dragon",
        "dm2:f_storm_dragon",
        "dm2:f_dark_dragon",
        "dm2:r_fire_dragon",
        "dm2:f_phantom_dragon",
        "dm2:phantom_dragon"
]  

world.afterEvents.entityHitEntity.subscribe((data) => {
    const { damagingEntity, hitEntity } = data;
    if (damagingEntity.typeId != "minecraft:player") return;

    const family = hitEntity.getComponent("type_family");
    if (!AllowedMobs.includes(hitEntity.typeId) || EntitiesDeny.includes(hitEntity.typeId) || hitEntity.typeId == "minecraft:painting" || family.hasTypeFamily("npc") || family.hasTypeFamily("inanimate")) return;

    const equipment = damagingEntity.getComponent("equippable").getEquipment("Mainhand");
    if (equipment == undefined || equipment.typeId != "dm:amulet") return;

    const { x, y, z } = hitEntity.location;
    const lore = equipment.getLore();

    if (equipment.getLore().length == 0 && equipment.typeId == "dm:amulet" && hitEntity.typeId != "minecraft:player") {
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
    data.itemComponentRegistry.registerCustomComponent("dm:amulet", {
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