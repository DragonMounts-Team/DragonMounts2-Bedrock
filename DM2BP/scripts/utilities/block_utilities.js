import { world, system, Player, GameMode, EquipmentSlot, EntityEquippableComponent } from "@minecraft/server";
import * as blockData from "../data/block_data.js";
import * as itemData from "../data/item_data.js";

function setBlockEntityRotation(blockEntity, cardinalDirection) {
	const rotations = {
		"south": {x:0, y:180},
		"east": {x:0, y:90},
		"west": {x:0, y:-90}
	};
	const rotation = rotations[cardinalDirection];
	if (rotation) blockEntity.setRotation(rotation);
}

function animateCore(block, dimension, params, state, sound1, sound2, spawnEvent) {
	const cardinalDirection = block.permutation.getState(params.states.cardinal);
	
	system.runTimeout(() => {
		block.dimension.playSound(sound1, block.center(), {volume:0.9});
		block.dimension.playSound(sound2, block.center(), {volume:0.1});
		block.setPermutation(block.permutation.withState(params.states.core_state, state));
		
		const blockEntity = block.dimension.spawnEntity(params.block_entity, {
			x: block.center().x,
			y: block.center().y - 0.5,
			z: block.center().z
		}, {spawnEvent: spawnEvent});
		
		setBlockEntityRotation(blockEntity, cardinalDirection);
		
		system.runTimeout(() => {
			block.setPermutation(block.permutation.withState(params.states.core_state, 
				state === "opening" ? "open" : "closed"));
			blockEntity.triggerEvent("minecraft:dragon_core_destroyed");
		}, 10);
	}, 0);
}

export function dragonCorePlayerInteract(block, dimension, player, params) {
	if (!player?.isValid || !block) return;
	
	const testEquip = player.getComponent(EntityEquippableComponent.componentId);
	if (!testEquip) return;
	
	const itemStack = testEquip.getEquipmentSlot(EquipmentSlot.Mainhand).getItem();
	const dragonCoreBlocks = blockData.dragonCoreBlockTypes;
	const essenceItemData = itemData.dragonEssenceDataItemTypes;
	
	if (!dragonCoreBlocks.includes(block.typeId)) return;
	
	const cardinalDirection = block.permutation.getState(params.states.cardinal);
	const coreState = block.permutation.getState(params.states.core_state);
	const coreUsed = block.permutation.getState(params.states.core_used);
	const blockAbove = block.dimension.getBlock(block.above(1));
	
	if (!itemStack) {
		if ((blockAbove.isAir || blockAbove.isLiquid) && coreState === "closed") {
			animateCore(block, dimension, params, "opening", "random.enderchestopen", "block.end_portal.spawn", "minecraft:dragon_core_open");
		} else if (coreState === "open") {
			animateCore(block, dimension, params, "closing", "random.enderchestclosed", "", "minecraft:dragon_core_close");
		}
		return;
	}
	
	if (!essenceItemData[itemStack.typeId]) return;
	
	const lore = itemStack.getLore();
	if (!lore.length) return;
	
	const ownerIdentifier = itemStack.getDynamicProperty("dragonmounts2:owner_identifier") || 
		lore[3]?.replace("§r§8 ", "") || lore[0]?.replace("§r§bownerID: ", "");
	
	if (player.id !== ownerIdentifier) {
		player.sendMessage({rawtext:[{text:"§c"},{translate:"tooltip.dragonmounts2:dragon_not_owned"}]});
		return;
	}
	
	const variantType = itemStack.getDynamicProperty("dragonmounts2:variant_type") || 
		lore[5]?.replace("§r§9 ", "") || lore[1]?.replace("§r§bvariant: ", "") || "default";
	
	let variantHatched = essenceItemData[itemStack.typeId].dragon_hatch_variants[variantType];
	let dragonName = itemStack.getDynamicProperty("dragonmounts2:dragon_name") || 
		lore[7]?.replace("§r§9 ", "") || lore[2]?.replace("§r§bname: ", "");
	
	const {x, y, z} = block.center();
	
	if ((blockAbove.isAir || blockAbove.isLiquid) && coreState === "closed") {
		animateCore(block, dimension, params, "opening", "random.enderchestopen", "block.end_portal.spawn", "minecraft:dragon_core_open");
		return;
	}
	
	if (coreState !== "open" || coreUsed === true) return;
	
	system.runTimeout(() => {
		block.setPermutation(block.permutation.withState(params.states.core_used, true));
		dimension.playSound("block.enchanting_table.use", block.center(), {volume:0.6, pitch:0.4});
		dimension.playSound("block.end_portal.fill", block.center(), {pitch:0.8});
		dimension.playSound("dragonmounts2:block.dragon_core", block.center(), {volume:1.2, pitch:0.7});
		
		block.setPermutation(block.permutation.withState(params.states.core_state, "closing"));
		
		const blockEntity = dimension.spawnEntity(params.block_entity, {
			x: block.center().x,
			y: block.center().y - 0.5,
			z: block.center().z
		});
		
		setBlockEntityRotation(blockEntity, cardinalDirection);
		blockEntity.setProperty("dragonmounts2:core_state", "open");
		
		dimension.spawnParticle("dragonmounts2:dragon_core_inner_cloud", block.center());
		
		system.runTimeout(() => {
			blockEntity.triggerEvent("minecraft:dragon_core_close");
			dimension.spawnParticle("dragonmounts2:dragon_core_inner_cloud", block.center());
		}, 10);
		
		system.runTimeout(() => {
			block.setType(params.block_transforms_into);
			blockEntity.triggerEvent("minecraft:dragon_core_destroyed");
			dimension.spawnParticle("dragonmounts2:dragon_core_outer_cloud", block.center());
		}, 20);
		
		system.runTimeout(() => {
			dimension.spawnParticle("dragonmounts2:dragon_core_outer_cloud", block.center());
		}, 40);
		
		const inventory = player.getComponent(EntityEquippableComponent.componentId);
		const mainhand = inventory?.getEquipmentSlot(EquipmentSlot.Mainhand);
		if (player.getGameMode() !== GameMode.creative && mainhand) {
			mainhand.setItem(undefined);
		}
		
		system.runTimeout(() => {
			dimension.playSound("dragonmounts2:item.dragon_essence", block.center(), {volume:1.2});
			const dragon = dimension.spawnEntity(essenceItemData[itemStack.typeId].dragon_entity, 
				{x: x, y: y - 0.5, z: z}, {spawnEvent: variantHatched});
			
			if (dragon) {
				if (dragon.hasComponent("minecraft:tameable")) {
					const tameable = dragon.getComponent("minecraft:tameable");
					tameable.tame(player);
				}
				if (dragonName === "Unnamed") dragonName = "";
				dragon.nameTag = dragonName;
			}
		}, 60);
	}, 0);
}

export function dragonEggRandomTick(block, dimension, params) {
	dimension.spawnParticle(params.particles.random_tick_particle, block.center());
}

export function dragonEggPlayerInteract(block, dimension, player, params) {
	block.setType(params.block_transforms_into);
	dimension.playSound(params.sounds.interact_sound, block.center());
	dimension.spawnEntity(params.block_entity, {
		x: block.center().x,
		y: block.location.y,
		z: block.center().z
	});
	dimension.spawnParticle(params.particles.interact_particle, block.center());
}