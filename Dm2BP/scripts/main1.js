import { world, EquipmentSlot, GameMode, Player, BlockPermutation } from "@minecraft/server";

function applyDurabilityDamage(source, mainhand) {
    if (source.getGameMode() === GameMode.creative) return; // Skip durability damage in creative mode

    const itemStack = mainhand.getItem();
    if (!itemStack) return;

    const durability = itemStack.getComponent("minecraft:durability");
    if (!durability) return;

    // Factor in unbreaking enchantment
    const enchantable = itemStack.getComponent("minecraft:able");
    const unbreakingLevel = enchantable?.getEnchantment("unbreaking")?.level ?? 0;

    const damageChance = durability.getDamageChance(unbreakingLevel) / 100;

    if (Math.random() > damageChance) return; // Randomly skip damage based on unbreaking level

    // Damage the item
    if (durability.damage >= durability.maxDurability - 1) {
        mainhand.setItem(undefined); // Remove the item when it breaks
        source.playSound("random.break"); // Play break sound
    } else {
        durability.damage++; // Increase durability damage
        mainhand.setItem(itemStack); // Update item in hand
    }
}

world.beforeEvents.worldInitialize.subscribe(initEvent => {
    initEvent.itemComponentRegistry.registerCustomComponent('tool:can_be_damaged', {
        onMineBlock({ source }) {
            // Get main hand slot
            if (!(source instanceof Player)) return;
        
            const equippable = source.getComponent("minecraft:equippable");
            if (!equippable) return;
        
            const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
            if (!mainhand.hasItem()) return;
        
            applyDurabilityDamage(source, mainhand);
        }
      });
});

world.beforeEvents.worldInitialize.subscribe(initEvent => {
    initEvent.itemComponentRegistry.registerCustomComponent('tool:act_as_axe', {
        onUseOn({ source, block }) {
            // Get main hand slot
            if (!(source instanceof Player)) return;
        
            const equippable = source.getComponent("minecraft:equippable");
            if (!equippable) return;
        
            const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
            if (!mainhand.hasItem()) return;
            
            // Act as Axe

            const dimension = block.dimension;
            const blockLocation = block.location;

            const logVariants = [
                "minecraft:oak_log",
                "minecraft:spruce_log",
                "minecraft:birch_log",
                "minecraft:jungle_log",
                "minecraft:acacia_log",
                "minecraft:dark_oak_log",
                "minecraft:mangrove_log",
                "minecraft:crimson_stem",
                "minecraft:warped_stem",
                "minecraft:oak_wood",
                "minecraft:spruce_wood",
                "minecraft:birch_wood",
                "minecraft:jungle_wood",
                "minecraft:acacia_wood",
                "minecraft:dark_oak_wood",
                "minecraft:mangrove_wood"
            ];
            
            const strippedVariants = {
                "minecraft:oak_log": "minecraft:stripped_oak_log",
                "minecraft:spruce_log": "minecraft:stripped_spruce_log",
                "minecraft:birch_log": "minecraft:stripped_birch_log",
                "minecraft:jungle_log": "minecraft:stripped_jungle_log",
                "minecraft:acacia_log": "minecraft:stripped_acacia_log",
                "minecraft:dark_oak_log": "minecraft:stripped_dark_oak_log",
                "minecraft:mangrove_log": "minecraft:stripped_mangrove_log",
                "minecraft:oak_wood": "minecraft:stripped_oak_wood",
                "minecraft:spruce_wood": "minecraft:stripped_spruce_wood",
                "minecraft:birch_wood": "minecraft:stripped_birch_wood",
                "minecraft:jungle_wood": "minecraft:stripped_jungle_wood",
                "minecraft:acacia_wood": "minecraft:stripped_acacia_wood",
                "minecraft:dark_oak_wood": "minecraft:stripped_dark_oak_wood",
                "minecraft:mangrove_wood": "minecraft:stripped_mangrove_wood"
            };

            const stemVariants = [
                "minecraft:crimson_stem",
                "minecraft:warped_stem",
                "minecraft:crimson_hyphae",
                "minecraft:warped_hyphae"
            ];
            
            const strippedStemVariants = {
                "minecraft:crimson_stem": "minecraft:stripped_crimson_stem",
                "minecraft:warped_stem": "minecraft:stripped_warped_stem",
                "minecraft:warped_hyphae": "minecraft:stripped_warped_hyphae",
                "minecraft:warped_hyphae": "minecraft:stripped_warped_hyphae"
            };

            const cherryVariants = [
                "minecraft:cherry_log",
                "minecraft:cherry_wood"
            ];
            
            const strippedCherryVariants = {
                "minecraft:cherry_log": "minecraft:stripped_cherry_log",
                "minecraft:cherry_wood": "minecraft:stripped_cherry_wood"
            };

            // Handling wax
            const waxedCopperBlocksVariants = [
                "minecraft:waxed_copper",
                "minecraft:waxed_exposed_copper",
                "minecraft:waxed_weathered_copper",
                "minecraft:waxed_oxidized_copper",
                "minecraft:waxed_chiseled_copper",
                "minecraft:waxed_exposed_chiseled_copper",
                "minecraft:waxed_weathered_chiseled_copper",
                "minecraft:waxed_oxidized_chiseled_copper",
                "minecraft:waxed_copper_grate",
                "minecraft:waxed_exposed_copper_grate",
                "minecraft:waxed_weathered_copper_grate",
                "minecraft:waxed_oxidized_copper_grate",
                "minecraft:waxed_cut_copper",
                "minecraft:waxed_exposed_cut_copper",
                "minecraft:waxed_weathered_cut_copper",
                "minecraft:waxed_oxidized_cut_copper",
                "minecraft:waxed_double_cut_copper_slab",
                "minecraft:waxed_exposed_double_cut_copper_slab",
                "minecraft:waxed_weathered_double_cut_copper_slab",
                "minecraft:waxed_oxidized_double_cut_copper_slab"
            ];
            
            const copperBlocksVariants = {
                "minecraft:waxed_copper": "minecraft:copper_block",
                "minecraft:waxed_exposed_copper": "minecraft:exposed_copper",
                "minecraft:waxed_weathered_copper": "minecraft:weathered_copper",
                "minecraft:waxed_oxidized_copper": "minecraft:oxidized_copper",
                "minecraft:waxed_chiseled_copper": "minecraft:chiseled_copper",
                "minecraft:waxed_exposed_chiseled_copper": "minecraft:exposed_chiseled_copper",
                "minecraft:waxed_weathered_chiseled_copper": "minecraft:weathered_chiseled_copper",
                "minecraft:waxed_oxidized_chiseled_copper": "minecraft:oxidized_chiseled_copper",
                "minecraft:waxed_copper_grate": "minecraft:copper_grate",
                "minecraft:waxed_exposed_copper_grate": "minecraft:exposed_copper_grate",
                "minecraft:waxed_weathered_copper_grate": "minecraft:weathered_copper_grate",
                "minecraft:waxed_oxidized_copper_grate": "minecraft:oxidized_copper_grate",
                "minecraft:waxed_cut_copper": "minecraft:cut_copper",
                "minecraft:waxed_exposed_cut_copper": "minecraft:exposed_cut_copper",
                "minecraft:waxed_weathered_cut_copper": "minecraft:weathered_cut_copper",
                "minecraft:waxed_oxidized_cut_copper": "minecraft:oxidized_cut_copper",
                "minecraft:waxed_double_cut_copper_slab": "minecraft:double_cut_copper_slab",
                "minecraft:waxed_exposed_double_cut_copper_slab": "minecraft:exposed_double_cut_copper_slab",
                "minecraft:waxed_weathered_double_cut_copper_slab": "minecraft:weathered_double_cut_copper_slab",
                "minecraft:waxed_oxidized_double_cut_copper_slab": "minecraft:oxidized_double_cut_copper_slab"
            };

            const waxedCopperStairsVariants = [
                "minecraft:waxed_cut_copper_stairs",
                "minecraft:waxed_exposed_cut_copper_stairs",
                "minecraft:waxed_weathered_cut_copper_stairs",
                "minecraft:waxed_oxidized_cut_copper_stairs"
            ];
            
            const copperStairsVariants = {
                "minecraft:waxed_cut_copper_stairs": "minecraft:cut_copper_stairs",
                "minecraft:waxed_exposed_cut_copper_stairs": "minecraft:exposed_cut_copper_stairs",
                "minecraft:waxed_weathered_cut_copper_stairs": "minecraft:weathered_cut_copper_stairs",
                "minecraft:waxed_oxidized_cut_copper_stairs": "minecraft:oxidized_cut_copper_stairs"
            };

            const waxedCopperSlabsVariants = [
                "minecraft:waxed_cut_copper_slab",
                "minecraft:waxed_exposed_cut_copper_slab",
                "minecraft:waxed_weathered_cut_copper_slab",
                "minecraft:waxed_oxidized_cut_copper_slab"
            ];
            
            const copperSlabsVariants = {
                "minecraft:waxed_cut_copper_slab": "minecraft:cut_copper_slab",
                "minecraft:waxed_exposed_cut_copper_slab": "minecraft:exposed_cut_copper_slab",
                "minecraft:waxed_weathered_cut_copper_slab": "minecraft:weathered_cut_copper_slab",
                "minecraft:waxed_oxidized_cut_copper_slab": "minecraft:oxidized_cut_copper_slab"
            };

            const waxedCopperBulbsVariants = [
                "minecraft:waxed_copper_bulb",
                "minecraft:waxed_exposed_copper_bulb",
                "minecraft:waxed_weathered_copper_bulb",
                "minecraft:waxed_oxidized_copper_bulb"
            ];
            
            const copperBulbsVariants = {
                "minecraft:waxed_copper_bulb": "minecraft:copper_bulb",
                "minecraft:waxed_exposed_copper_bulb": "minecraft:exposed_copper_bulb",
                "minecraft:waxed_weathered_copper_bulb": "minecraft:weathered_copper_bulb",
                "minecraft:waxed_oxidized_copper_bulb": "minecraft:oxidized_copper_bulb"
            };

            const waxedCopperTrapdoorsVariants = [
                "minecraft:waxed_copper_trapdoor",
                "minecraft:waxed_exposed_copper_trapdoor",
                "minecraft:waxed_weathered_copper_trapdoor",
                "minecraft:waxed_oxidized_copper_trapdoor"
            ];
            
            const copperTrapdoorsVariants = {
                "minecraft:waxed_copper_trapdoor": "minecraft:copper_trapdoor",
                "minecraft:waxed_exposed_copper_trapdoor": "minecraft:exposed_copper_trapdoor",
                "minecraft:waxed_weathered_copper_trapdoor": "minecraft:weathered_copper_trapdoor",
                "minecraft:waxed_oxidized_copper_trapdoor": "minecraft:oxidized_copper_trapdoor"
            };

            const waxedCopperDoorsVariants = [
                "minecraft:waxed_copper_door",
                "minecraft:waxed_exposed_copper_door",
                "minecraft:waxed_weathered_copper_door",
                "minecraft:waxed_oxidized_copper_door"
            ];
            
            const copperDoorsVariants = {
                "minecraft:waxed_copper_door": "minecraft:copper_door",
                "minecraft:waxed_exposed_copper_door": "minecraft:exposed_copper_door",
                "minecraft:waxed_weathered_copper_door": "minecraft:weathered_copper_door",
                "minecraft:waxed_oxidized_copper_door": "minecraft:oxidized_copper_door"
            };

            // Handling oxidation

            const oxidizedCopperBlocksVariants = [
                "minecraft:exposed_copper",
                "minecraft:weathered_copper",
                "minecraft:oxidized_copper",
                "minecraft:exposed_chiseled_copper",
                "minecraft:weathered_chiseled_copper",
                "minecraft:oxidized_chiseled_copper",
                "minecraft:exposed_copper_grate",
                "minecraft:weathered_copper_grate",
                "minecraft:oxidized_copper_grate",
                "minecraft:exposed_cut_copper",
                "minecraft:weathered_cut_copper",
                "minecraft:oxidized_cut_copper",
                "minecraft:exposed_double_cut_copper_slab",
                "minecraft:weathered_double_cut_copper_slab",
                "minecraft:oxidized_double_cut_copper_slab"
            ];

            const oxidizedCopperBlocksStages = {
                "minecraft:exposed_copper": "minecraft:copper_block",
                "minecraft:weathered_copper": "minecraft:exposed_copper",
                "minecraft:oxidized_copper": "minecraft:weathered_copper",
                "minecraft:exposed_chiseled_copper": "minecraft:chiseled_copper",
                "minecraft:weathered_chiseled_copper": "minecraft:exposed_chiseled_copper",
                "minecraft:oxidized_chiseled_copper": "minecraft:weathered_chiseled_copper",
                "minecraft:exposed_copper_grate": "minecraft:copper_grate",
                "minecraft:weathered_copper_grate": "minecraft:exposed_copper_grate",
                "minecraft:oxidized_copper_grate": "minecraft:weathered_copper_grate",
                "minecraft:exposed_cut_copper": "minecraft:cut_copper",
                "minecraft:weathered_cut_copper": "minecraft:exposed_cut_copper",
                "minecraft:oxidized_cut_copper": "minecraft:weathered_cut_copper",
                "minecraft:exposed_double_cut_copper_slab": "minecraft:double_cut_copper_slab",
                "minecraft:weathered_double_cut_copper_slab": "minecraft:exposed_double_cut_copper_slab",
                "minecraft:oxidized_double_cut_copper_slab": "minecraft:weathered_double_cut_copper_slab"
            };

            const oxidizedCopperStairsVariants = [
                "minecraft:exposed_cut_copper_stairs",
                "minecraft:weathered_cut_copper_stairs",
                "minecraft:oxidized_cut_copper_stairs",
            ];
            
            const oxidizedCopperStairsStages = {
                "minecraft:exposed_cut_copper_stairs": "minecraft:cut_copper_stairs",
                "minecraft:weathered_cut_copper_stairs": "minecraft:exposed_cut_copper_stairs",
                "minecraft:oxidized_cut_copper_stairs": "minecraft:weathered_cut_copper_stairs",
            };

            const oxidizedCopperSlabsVariants = [
                "minecraft:exposed_cut_copper_slab",
                "minecraft:weathered_cut_copper_slab",
                "minecraft:oxidized_cut_copper_slab",
            ];
            
            const oxidizedCopperSlabsStages = {
                "minecraft:exposed_cut_copper_slab": "minecraft:cut_copper_slab",
                "minecraft:weathered_cut_copper_slab": "minecraft:exposed_cut_copper_slab",
                "minecraft:oxidized_cut_copper_slab": "minecraft:weathered_cut_copper_slab",
            };

            const oxidizedCopperBulbsVariants = [
                "minecraft:exposed_copper_bulb",
                "minecraft:weathered_copper_bulb",
                "minecraft:oxidized_copper_bulb",
            ];
            
            const oxidizedCopperBulbsStages = {
                "minecraft:exposed_copper_bulb": "minecraft:copper_bulb",
                "minecraft:weathered_copper_bulb": "minecraft:exposed_copper_bulb",
                "minecraft:oxidized_copper_bulb": "minecraft:weathered_copper_bulb",
            };

            const oxidizedCopperTrapdoorsVariants = [
                "minecraft:exposed_copper_trapdoor",
                "minecraft:weathered_copper_trapdoor",
                "minecraft:oxidized_copper_trapdoor",
            ];
            
            const oxidizedCopperTrapdoorsStages = {
                "minecraft:exposed_copper_trapdoor": "minecraft:copper_trapdoor",
                "minecraft:weathered_copper_trapdoor": "minecraft:exposed_copper_trapdoor",
                "minecraft:oxidized_copper_trapdoor": "minecraft:weathered_copper_trapdoor",
            };

            const oxidizedCopperDoorsVariants = [
                "minecraft:exposed_copper_door",
                "minecraft:weathered_copper_door",
                "minecraft:oxidized_copper_door"
            ];
            
            const oxidizedCopperDoorsStages = {
                "minecraft:exposed_copper_door": "minecraft:copper_door",
                "minecraft:weathered_copper_door": "minecraft:exposed_copper_door",
                "minecraft:oxidized_copper_door": "minecraft:weathered_copper_door"
            };
            
            if (logVariants.includes(block.typeId)) {
                const strippedVariant = strippedVariants[block.typeId];
                block.setPermutation(BlockPermutation.resolve(strippedVariant, {pillar_axis: block.permutation.getState("pillar_axis")}));
                dimension.playSound("use.wood", blockLocation);
            }else if (stemVariants.includes(block.typeId)) {
                const strippedVariant = strippedStemVariants[block.typeId];
                block.setPermutation(BlockPermutation.resolve(strippedVariant, {pillar_axis: block.permutation.getState("pillar_axis")}));
                dimension.playSound("use.stem", blockLocation);
            }else if (cherryVariants.includes(block.typeId)) {
                const strippedVariant = strippedCherryVariants[block.typeId];
                block.setPermutation(BlockPermutation.resolve(strippedVariant, {pillar_axis: block.permutation.getState("pillar_axis")}));
                dimension.playSound("step.cherry_wood", blockLocation);
            } else if (block.matches("minecraft:bamboo_block")) {
                block.setPermutation(BlockPermutation.resolve("minecraft:stripped_bamboo_block", {pillar_axis: block.permutation.getState("pillar_axis")}));
                dimension.playSound("step.bamboo_wood", blockLocation);
            }else if (waxedCopperBlocksVariants.includes(block.typeId)) {
                const copperVariants = copperBlocksVariants[block.typeId];
                dimension.setBlockType(blockLocation, copperVariants);
                source.runCommand("particle tool:custom_wax_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (oxidizedCopperBlocksVariants.includes(block.typeId)) {
                const copperVariants = oxidizedCopperBlocksStages[block.typeId];
                dimension.setBlockType(blockLocation, copperVariants);
                source.runCommand("particle tool:custom_oxide_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (waxedCopperStairsVariants.includes(block.typeId)) {
                const copperVariants = copperStairsVariants[block.typeId];
                block.setPermutation(BlockPermutation.resolve(copperVariants, {upside_down_bit: block.permutation.getState("upside_down_bit"), weirdo_direction: block.permutation.getState("weirdo_direction")}));
                source.runCommand("particle tool:custom_wax_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (oxidizedCopperStairsVariants.includes(block.typeId)) {
                const copperVariants = oxidizedCopperStairsStages[block.typeId];
                block.setPermutation(BlockPermutation.resolve(copperVariants, {upside_down_bit: block.permutation.getState("upside_down_bit"), weirdo_direction: block.permutation.getState("weirdo_direction")}));
                source.runCommand("particle tool:custom_oxide_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (waxedCopperSlabsVariants.includes(block.typeId)) {
                const copperVariants = copperSlabsVariants[block.typeId];
                block.setPermutation(BlockPermutation.resolve(copperVariants, {"minecraft:vertical_half": block.permutation.getState("minecraft:vertical_half")}));
                source.runCommand("particle tool:custom_wax_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (oxidizedCopperSlabsVariants.includes(block.typeId)) {
                const copperVariants = oxidizedCopperSlabsStages[block.typeId];
                block.setPermutation(BlockPermutation.resolve(copperVariants, {"minecraft:vertical_half": block.permutation.getState("minecraft:vertical_half")}));
                source.runCommand("particle tool:custom_oxide_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (waxedCopperBulbsVariants.includes(block.typeId)) {
                const copperVariants = copperBulbsVariants[block.typeId];
                block.setPermutation(BlockPermutation.resolve(copperVariants, {lit: block.permutation.getState("lit"), powered_bit: block.permutation.getState("powered_bit")}));
                source.runCommand("particle tool:custom_wax_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (oxidizedCopperBulbsVariants.includes(block.typeId)) {
                const copperVariants = oxidizedCopperBulbsStages[block.typeId];
                block.setPermutation(BlockPermutation.resolve(copperVariants, {lit: block.permutation.getState("lit"), powered_bit: block.permutation.getState("powered_bit")}));
                source.runCommand("particle tool:custom_oxide_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (waxedCopperTrapdoorsVariants.includes(block.typeId) && source.isSneaking) {
                const copperVariants = copperTrapdoorsVariants[block.typeId];
                block.setPermutation(BlockPermutation.resolve(copperVariants, {direction: block.permutation.getState("direction"), open_bit: block.permutation.getState("open_bit"), upside_down_bit: block.permutation.getState("upside_down_bit")}));
                source.runCommand("particle tool:custom_wax_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (oxidizedCopperTrapdoorsVariants.includes(block.typeId) && source.isSneaking) {
                const copperVariants = oxidizedCopperTrapdoorsStages[block.typeId];
                block.setPermutation(BlockPermutation.resolve(copperVariants, {direction: block.permutation.getState("direction"), open_bit: block.permutation.getState("open_bit"), upside_down_bit: block.permutation.getState("upside_down_bit")}));
                source.runCommand("particle tool:custom_oxide_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (waxedCopperDoorsVariants.includes(block.typeId) && source.isSneaking) {

                const copperVariants = copperDoorsVariants[block.typeId];

                if(block.permutation.getState("upper_block_bit")){
                    const copperDirection = (block.below(1)).permutation.getState("direction");
                    const copperOpenBit = (block.below(1)).permutation.getState("open_bit");
                    const copperDoorHingeBit = (block.below(1)).permutation.getState("door_hinge_bit");

                    source.runCommand("setblock " + block.x + " " + (block.y-1) + " " + block.z + " " + copperVariants + " [ \"direction\" : " + copperDirection + ", \"open_bit\" : " + copperOpenBit + ", \"door_hinge_bit\" : " + copperDoorHingeBit + " ]");
                }else{ 
                    const copperDirection = block.permutation.getState("direction");
                    const copperOpenBit = block.permutation.getState("open_bit");
                    const copperDoorHingeBit = block.permutation.getState("door_hinge_bit");

                    source.runCommand("setblock " + block.x + " " + block.y + " " + block.z + " " + copperVariants + " [ \"direction\" : " + copperDirection + ", \"open_bit\" : " + copperOpenBit + ", \"door_hinge_bit\" : " + copperDoorHingeBit + " ]");
                }
                source.runCommand("particle tool:custom_wax_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }else if (oxidizedCopperDoorsVariants.includes(block.typeId) && source.isSneaking) {

                const copperVariants = oxidizedCopperDoorsStages[block.typeId];

                if(block.permutation.getState("upper_block_bit")){
                    const copperDirection = (block.below(1)).permutation.getState("direction");
                    const copperOpenBit = (block.below(1)).permutation.getState("open_bit");
                    const copperDoorHingeBit = (block.below(1)).permutation.getState("door_hinge_bit");

                    source.runCommand("setblock " + block.x + " " + (block.y-1) + " " + block.z + " " + copperVariants + " [ \"direction\" : " + copperDirection + ", \"open_bit\" : " + copperOpenBit + ", \"door_hinge_bit\" : " + copperDoorHingeBit + " ]");
                }else{ 
                    const copperDirection = block.permutation.getState("direction");
                    const copperOpenBit = block.permutation.getState("open_bit");
                    const copperDoorHingeBit = block.permutation.getState("door_hinge_bit");

                    source.runCommand("setblock " + block.x + " " + block.y + " " + block.z + " " + copperVariants + " [ \"direction\" : " + copperDirection + ", \"open_bit\" : " + copperOpenBit + ", \"door_hinge_bit\" : " + copperDoorHingeBit + " ]");
                }
                source.runCommand("particle tool:custom_oxide_particle " + (block.x+0.5) + " " + (block.y+0.5) + " " + (block.z+0.5))
                dimension.playSound("copper.wax.off", blockLocation); // Add appropriate sound for copper
            }
            else return;
        
            applyDurabilityDamage(source, mainhand); 
        }
      });
});

world.beforeEvents.worldInitialize.subscribe(initEvent => {
    initEvent.itemComponentRegistry.registerCustomComponent('tool:act_as_shovel', {
        onUseOn({ source, block }) {
            // Get main hand slot
            if (!(source instanceof Player)) return;
        
            const equippable = source.getComponent("minecraft:equippable");
            if (!equippable) return;
        
            const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
            if (!mainhand.hasItem()) return;
            
            // Act as Shovel

            if ( (block.matches("minecraft:dirt") || block.matches("minecraft:grass_block") || block.matches("minecraft:podzol") || block.matches("minecraft:mycelium") || block.matches("minecraft:dirt_with_roots") || block.matches("minecraft:coarse_dirt")) && source.isSneaking && (block.above(1)).matches("minecraft:air")) {
                // Change the block to a path block (crossroad)
                const dimension = block.dimension;
                const blockLocation = block.location;
                dimension.setBlockType(blockLocation, "minecraft:grass_path"); // Turn the block into a path block
                dimension.playSound("use.grass", blockLocation); // Play path creation sound 
            }else if(block.matches("minecraft:snow_layer")){
                source.runCommand("setblock " + block.x + " " + block.y + " " + block.z + " air destroy") 
            }
            else return;
        
            applyDurabilityDamage(source, mainhand);
        }
      });
});

world.beforeEvents.worldInitialize.subscribe(initEvent => {
    initEvent.itemComponentRegistry.registerCustomComponent('tool:act_as_hoe', {
        onUseOn({ source, block }) {
            // Get main hand slot
            if (!(source instanceof Player)) return;
        
            const equippable = source.getComponent("minecraft:equippable");
            if (!equippable) return;
        
            const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
            if (!mainhand.hasItem()) return;
            
            // Act as Hoe

            if((block.matches("minecraft:coarse_dirt")) && !source.isSneaking ){
                // Change the block to a dirt
                const dimension = block.dimension;
                const blockLocation = block.location;
                dimension.setBlockType(blockLocation, "minecraft:dirt"); // Turn the block into dirt
                dimension.playSound("use.gravel", blockLocation); // Play path creation sound
            }
            else if ( (block.matches("minecraft:dirt") || block.matches("minecraft:grass_block") || block.matches("minecraft:grass_path")) && !source.isSneaking && (block.above(1)).matches("minecraft:air")) {
                // Change the block to a farmland
                const dimension = block.dimension;
                const blockLocation = block.location;
                dimension.setBlockType(blockLocation, "minecraft:farmland"); // Turn the block into a farmland
                dimension.playSound("use.gravel", blockLocation); // Play path creation sound 
            }
            else if((block.matches("minecraft:dirt_with_roots")) && !source.isSneaking && (block.above(1)).matches("minecraft:air")){
                // Change the block to a dirt
                const dimension = block.dimension;
                const blockLocation = block.location;
                dimension.setBlockType(blockLocation, "minecraft:dirt"); // Turn the block into dirt
                source.runCommand("loot spawn " + block.x + " " + (block.y + 1) + " " + block.z + " loot \"blocks/rooted_dirt\"")
                dimension.playSound("use.gravel", blockLocation); // Play path creation sound
            }
            else return;
        
            applyDurabilityDamage(source, mainhand); 
        }
      });
});
