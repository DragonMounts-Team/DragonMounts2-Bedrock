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
<<<<<<< Updated upstream
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
=======
"dragonmountsplus:aether_dragon",
"dragonmountsplus:dark_dragon",
"dragonmountsplus:ender_dragon",
"dragonmountsplus:moonlight_dragon",
"dragonmountsplus:sculk_dragon",
"dragonmountsplus:storm_dragon",
"dragonmountsplus:sunlight_dragon",
"dragonmountsplus:terra_dragon",
"dragonmountsplus:enchant_dragon",
"dragonmountsplus:nether_dragon",
"dragonmountsplus:ice_dragon",
"dragonmountsplus:fire_dragon",
"dragonmountsplus:forest_dragon",
"dragonmountsplus:water_dragon",
"dragonmountsplus:skeleton_dragon",
"dragonmountsplus:wither_dragon",
"dragonmountsplus:zombie_dragon"
];

const MobToAmulet = {
"dragonmountsplus:aether_dragon": "dragonmountsplus:aether_amulet",
"dragonmountsplus:dark_dragon": "dragonmountsplus:dark_amulet",
"dragonmountsplus:ender_dragon": "dragonmountsplus:ender_amulet",
"dragonmountsplus:nether_dragon": "dragonmountsplus:nether_amulet",
"dragonmountsplus:ice_dragon": "dragonmountsplus:ice_amulet",
"dragonmountsplus:fire_dragon": "dragonmountsplus:fire_amulet",
"dragonmountsplus:forest_dragon": "dragonmountsplus:forest_amulet",
"dragonmountsplus:water_dragon": "dragonmountsplus:water_amulet",
"dragonmountsplus:skeleton_dragon": "dragonmountsplus:skeleton_amulet",
"dragonmountsplus:moonlight_dragon": "dragonmountsplus:moonlight_amulet",
"dragonmountsplus:sculk_dragon": "dragonmountsplus:sculk_amulet",
"dragonmountsplus:enchant_dragon": "dragonmountsplus:enchant_amulet",
"dragonmountsplus:storm_dragon": "dragonmountsplus:storm_amulet",
"dragonmountsplus:sunlight_dragon": "dragonmountsplus:sunlight_amulet",
"dragonmountsplus:terra_dragon": "dragonmountsplus:terra_amulet",
"dragonmountsplus:wither_dragon": "dragonmountsplus:wither_amulet",
"dragonmountsplus:zombie_dragon": "dragonmountsplus:zombie_amulet"
};

const MobNames = {
"dragonmountsplus:aether_dragon": "§3Aether",
"dragonmountsplus:dark_dragon": "§8Dark",
"dragonmountsplus:ender_dragon": "§5Ender",
"dragonmountsplus:enchant_dragon": "§uEnchanted",
"dragonmountsplus:nether_dragon": "§pNether",
"dragonmountsplus:ice_dragon": "§bIce",
"dragonmountsplus:fire_dragon": "§mFire",
"dragonmountsplus:forest_dragon": "§2Forest",
"dragonmountsplus:water_dragon": "§sWater",
"dragonmountsplus:skeleton_dragon": "§7Skeleton",
"dragonmountsplus:moonlight_dragon": "§tMoonlight",
"dragonmountsplus:sculk_dragon": "§sSculk",
"dragonmountsplus:storm_dragon": "§eStorm",
"dragonmountsplus:sunlight_dragon": "§eSunlight",
"dragonmountsplus:terra_dragon": "§jTerra",
"dragonmountsplus:wither_dragon": "§0Wither",
"dragonmountsplus:zombie_dragon": "§qZombie"
};

const FilledAmulets = Object.values(MobToAmulet);
>>>>>>> Stashed changes

world.afterEvents.entityHitEntity.subscribe((data) => {
const { damagingEntity, hitEntity } = data;
if (damagingEntity.typeId !== "minecraft:player") return;

<<<<<<< Updated upstream
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
=======
const family = hitEntity.getComponent("type_family");  
if (  
    !AllowedMobs.includes(hitEntity.typeId) ||  
    EntitiesDeny.includes(hitEntity.typeId) ||  
    hitEntity.typeId === "minecraft:painting" ||  
    family.hasTypeFamily("npc") ||  
    family.hasTypeFamily("inanimate")  
) return;  

const isTamed = hitEntity.getComponent("minecraft:is_tamed");  
if (!isTamed || (typeof isTamed.value === "boolean" && !isTamed.value)) return;  

const equipment = damagingEntity.getComponent("equippable").getEquipment("Mainhand");  
if (!equipment || equipment.typeId !== "dragonmountsplus:amulet") return;  

const { x, y, z } = hitEntity.location;  

if (equipment.getLore().length === 0 && MobToAmulet[hitEntity.typeId]) {  
    const newItem = new ItemStack(MobToAmulet[hitEntity.typeId], 1);  

    const healthComp = hitEntity.getComponent("minecraft:health");  
    const ownerComp = hitEntity.getComponent("tamemob");  

    const mobName = MobNames[hitEntity.typeId] || hitEntity.typeId;  
    const health = healthComp ? healthComp.currentValue : "?";  
    const owner = ownerComp?.owner ? `${ownerComp.owner}` : "Unknown";  

    newItem.setLore([  
        `§7Type: ${mobName}`,  
        `§7Health: §a${health}`,  
        `§7Owner: ${hitEntity.id}`  
    ]);  

    damagingEntity.getComponent("equippable").setEquipment("Mainhand", newItem);  

    hitEntity.runCommand(`ride @a[r=3.1] stop_riding`);  
    hitEntity.runCommand(`tp ${x} ${y + 320} ${z}`);  
    hitEntity.runCommand(`structure save "${hitEntity.id}" ${x} ${y + 320} ${z} ${x} ${y + 320} ${z} true disk false`);  
    hitEntity.runCommand(`playsound item.amulet.capture @a ${x} ${y} ${z} 1 1`);  
    hitEntity.remove();  
}

});

function registerAmulet(itemId, returnEmpty) {
world.beforeEvents.worldInitialize.subscribe((data) => {
data.itemComponentRegistry.registerCustomComponent(itemId, {
onUseOn: (event) => {
const { block, blockFace, source, itemStack } = event;
const pos = block.location;
const direction = {
"North": { x: pos.x + 0.5, y: pos.y, z: pos.z - 0.5 },
"South": { x: pos.x + 0.5, y: pos.y, z: pos.z + 1.5 },
"East": { x: pos.x + 1.5, y: pos.y, z: pos.z + 0.5 },
"West": { x: pos.x - 0.5, y: pos.y, z: pos.z + 0.5 },
"Up": { x: pos.x + 0.5, y: pos.y + 1, z: pos.z + 0.5 },
"Down": { x: pos.x + 0.5, y: pos.y - 1, z: pos.z + 0.5 }
};
const { x, y, z } = direction[blockFace];

if (itemStack.getLore().length > 0) {  
                const id = String(itemStack.getLore()[2].replace("§7Owner: ", ""));  
                source.runCommand(`structure load "${id}" ${x} ${y} ${z}`);  
                source.runCommand(`structure delete "${id}"`);  
                source.runCommand(`playsound item.amulet.release @a ${x} ${y} ${z} 1 1`);  

                if (returnEmpty) {  
                    const emptyAmulet = new ItemStack("dragonmountsplus:amulet", 1);  
                    source.getComponent("equippable").setEquipment("Mainhand", emptyAmulet);  
                } else {  
                    itemStack.setLore([]);  
                    source.getComponent("equippable").setEquipment("Mainhand", itemStack);  
                }  
            }  
        }  
    });  
});

}

registerAmulet("dragonmountsplus:amulet", false);
FilledAmulets.forEach(id => registerAmulet(id, true));
>>>>>>> Stashed changes
