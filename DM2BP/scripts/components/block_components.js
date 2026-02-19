import { world, system, ItemStack } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";
import * as blockArrays from "../arrays/block_arrays.js";
import * as blockData from "../data/block_data.js";
import * as blockUtilities from "../utilities/block_utilities.js"
import * as itemData from "../data/item_data.js";

system.afterEvents.scriptEventReceive.subscribe(event => {
	const essenceEntityData = itemData.dragonEssenceDataEntityTypes;
	const entity = event.sourceEntity;
	if (event.id=="dragonmounts2:dragon_death_ticks") {
		const deathTicks = entity.getProperty("dragonmounts2:death_ticks");
		entity.runCommand(`title @p actionbar ${deathTicks}`);
	}
	if (event.id=="dragonmounts2:dragon_core") {
		if (!essenceEntityData[entity.typeId].dragon_item) return;
		const variantProperty = entity.getProperty(essenceEntityData[entity.typeId].dragon_data.variant_property);
		const tameable = entity.getComponent("minecraft:tameable");
		const ownerName = entity.getDynamicProperty("dragonmounts2:owner_name")||tameable.tamedToPlayer.name;
		const ownerIdentifier = entity.getDynamicProperty("dragonmounts2:owner_identifier")||tameable.tamedToPlayerId;
		const dragonIdentifier = entity.getDynamicProperty("dragonmounts2:dragon_identifier")||entity.id;
		let dragonName = entity.nameTag;
		if (!dragonName||dragonName.trim()=="") dragonName = "Unnamed";
		const dimension = entity.dimension;
		let {x,y,z} = entity.location;
		const blockLocation = dimension.getBlock({x:Math.floor(x),y:Math.floor(y),z:Math.floor(z)});
		let spawnLocation = blockLocation.center();
		dimension.playSound("break.amethyst_block",spawnLocation);
		blockLocation.setType("dragonmounts2:dragon_core");
		const essenceItem = new ItemStack(essenceEntityData[entity.typeId].dragon_item,1);
		const textTranslateType = essenceEntityData[entity.typeId].dragon_data.text_translate_type;
		const textColorType = essenceEntityData[entity.typeId].dragon_data.text_color_type;
		essenceItem.setLore([
			{rawtext:[{text:`${textColorType}`},{translate:`${textTranslateType}`}]},
			{rawtext:[{text:"§r§7"},{translate:"tooltip.dragonmounts2:dragon_owner_name"},{text:":"}]},
			`§r§9 ${ownerName}`,
			`§r§8 ${ownerIdentifier}`,
			{rawtext:[{text:"§r§7"},{translate:"tooltip.dragonmounts2:dragon_variant_type"},{text:":"}]},
			`§r§9 ${variantProperty}`,
			{rawtext:[{text:"§r§7"},{translate:"tooltip.dragonmounts2:dragon_name"},{text:":"}]},
			`§r§9 ${dragonName}`,
			`§r§8 ${dragonIdentifier}`
		]);
		essenceItem.setDynamicProperty("dragonmounts2:owner_identifier", ownerIdentifier);
		essenceItem.setDynamicProperty("dragonmounts2:variant_type", variantProperty);
		essenceItem.setDynamicProperty("dragonmounts2:dragon_name", dragonName);
		essenceItem.setDynamicProperty("dragonmounts2:dragon_identifier", dragonIdentifier);
		dimension.spawnItem(essenceItem,{x:spawnLocation.x,y:spawnLocation.y+0.5,z:spawnLocation.z});
	}
});

world.beforeEvents.playerInteractWithBlock.subscribe(event => {
	const {block,itemStack,player} = event;
	const dragonCoreBlocks = blockData.dragonCoreBlockTypes;
	const essenceItemData = itemData.dragonEssenceDataItemTypes;
	if (!player||!block) return;
	if (!dragonCoreBlocks.includes(block.typeId)) return;
	const cardinalDirection = block.permutation.getState("minecraft:cardinal_direction");
	const coreState = block.permutation.getState("dragonmounts2:core_state");
	const coreUsed = block.permutation.getState("dragonmounts2:core_used");
	const blockAbove = block.dimension.getBlock(block.above(1));
	if (!itemStack) {
		if ((blockAbove.isAir||blockAbove.isLiquid)&&coreState=="closed") {
			system.runTimeout(() => {
				block.dimension.playSound("random.enderchestopen",block.center(),{volume:0.9});
				block.dimension.playSound("block.end_portal.spawn",block.center(),{volume:0.1});
				block.setPermutation(block.permutation.withState("dragonmounts2:core_state","opening"));
				const blockEntity = block.dimension.spawnEntity(block.typeId,{x:block.center().x,y:block.center().y-0.5,z:block.center().z},{spawnEvent:"minecraft:dragon_core_open"});
				if (cardinalDirection=="south") blockEntity.setRotation({x:0,y:180});
				else if (cardinalDirection=="east") blockEntity.setRotation({x:0,y:90});
				else if (cardinalDirection=="west") blockEntity.setRotation({x:0,y:-90});
				system.runTimeout(() => {
					block.setPermutation(block.permutation.withState("dragonmounts2:core_state","open"));
					blockEntity.triggerEvent("minecraft:dragon_core_destroyed");
				},10);
			},0);
			return;
		}
		if (coreState=="open") {
			system.runTimeout(() => {
				block.dimension.playSound("random.enderchestclosed",block.center(),{volume:0.9});
				block.setPermutation(block.permutation.withState("dragonmounts2:core_state","closing"));
				const blockEntity = block.dimension.spawnEntity(block.typeId,{x:block.center().x,y:block.center().y-0.5,z:block.center().z},{spawnEvent:"minecraft:dragon_core_close"});
				if (cardinalDirection=="south") blockEntity.setRotation({x:0,y:180});
				else if (cardinalDirection=="east") blockEntity.setRotation({x:0,y:90});
				else if (cardinalDirection=="west") blockEntity.setRotation({x:0,y:-90});
				system.runTimeout(() => {
					block.setPermutation(block.permutation.withState("dragonmounts2:core_state","closed"));
					blockEntity.triggerEvent("minecraft:dragon_core_destroyed");
				},10);
			},0);
			return;
		}
		else return;
	}
	if (!essenceItemData[itemStack.typeId]) return;
	const lore = itemStack.getLore();
	if (!lore.length) return;
	const ownerIdentifier = itemStack.getDynamicProperty("dragonmounts2:owner_identifier")||lore[3].replace("§r§8 ","")||lore[0].replace("§r§bownerID: ", "");
	if (player.id!=ownerIdentifier) {
		event.cancel = true;
		player.sendMessage({rawtext:[{text:"§c"},{translate:"tooltip.dragonmounts2:dragon_not_owned"}]});
		return;
	}
	const variantType = itemStack.getDynamicProperty("dragonmounts2:variant_type")||lore[5]?.replace("§r§9 ","")||lore[1].replace("§r§bvariant: ", "")||"default";
	let variantHatched = essenceItemData[itemStack.typeId].dragon_hatch_variants[variantType];
	let dragonName = itemStack.getDynamicProperty("dragonmounts2:dragon_name")||lore[7]?.replace("§r§9 ","")||lore[2].replace("§r§bname: ", "");
	const {x,y,z} = block.center();
	const dimension = block.dimension;
	if ((blockAbove.isAir||blockAbove.isLiquid)&&coreState=="closed") {
		system.runTimeout(() => {
			block.dimension.playSound("random.enderchestopen",block.center(),{volume:0.9});
			block.dimension.playSound("block.end_portal.spawn",block.center(),{volume:0.1});
			block.setPermutation(block.permutation.withState("dragonmounts2:core_state","opening"));
			const blockEntity = block.dimension.spawnEntity(block.typeId,{x:block.center().x,y:block.center().y-0.5,z:block.center().z},{spawnEvent:"minecraft:dragon_core_open"});
			if (cardinalDirection=="south") blockEntity.setRotation({x:0,y:180});
			else if (cardinalDirection=="east") blockEntity.setRotation({x:0,y:90});
			else if (cardinalDirection=="west") blockEntity.setRotation({x:0,y:-90});
			system.runTimeout(() => {
				block.setPermutation(block.permutation.withState("dragonmounts2:core_state","open"));
				blockEntity.triggerEvent("minecraft:dragon_core_destroyed");
			},10);
		},0);
		return;
	}
	if (coreState!="open") return;
	if (coreUsed==true) return;
	system.runTimeout(() => {
		block.setPermutation(block.permutation.withState("dragonmounts2:core_used",true));
		dimension.playSound("block.enchanting_table.use",block.center(),{volume:0.6,pitch:0.4});
		dimension.playSound("block.end_portal.fill",block.center(),{pitch:0.8});
		dimension.playSound("dragonmounts2:block.dragon_core",block.center(),{volume:1.2,pitch:0.7});
		block.setPermutation(block.permutation.withState("dragonmounts2:core_state","closing"));
		const blockEntity = dimension.spawnEntity(block.typeId,{x:block.center().x,y:block.center().y-0.5,z:block.center().z});
		if (cardinalDirection=="south") blockEntity.setRotation({x:0,y:180});
		else if (cardinalDirection=="east") blockEntity.setRotation({x:0,y:90});
		else if (cardinalDirection=="west") blockEntity.setRotation({x:0,y:-90});
		blockEntity.setProperty("dragonmounts2:core_state", "open");
		dimension.spawnParticle("dragonmounts2:dragon_core_inner_cloud",block.center());
		system.runTimeout(() => {
			blockEntity.triggerEvent("minecraft:dragon_core_close");
			dimension.spawnParticle("dragonmounts2:dragon_core_inner_cloud",block.center());
		},10);
		system.runTimeout(() => {
			block.setType("minecraft:air");
			blockEntity.triggerEvent("minecraft:dragon_core_destroyed");
			dimension.spawnParticle("dragonmounts2:dragon_core_outer_cloud",block.center());
		},20);
		system.runTimeout(() => {
			dimension.spawnParticle("dragonmounts2:dragon_core_outer_cloud",block.center());
		},40);
		const inventory = player.getComponent("minecraft:equippable");
		const mainhand = inventory.getEquipmentSlot("Mainhand");
		if (player.getGameMode()!="Creative"&&mainhand) mainhand.setItem(undefined);
		system.runTimeout(() => {
			dimension.playSound("dragonmounts2:item.dragon_essence",block.center(),{volume:1.2});
			const dragon = dimension.spawnEntity(essenceItemData[itemStack.typeId].dragon_entity,{x:x,y:y-0.5,z:z},{spawnEvent:variantHatched});
			if (dragon) {
				if (dragon.hasComponent("minecraft:tameable")) {
					const tameable = dragon.getComponent("minecraft:tameable");
					tameable.tame(player);
				}
				if (dragonName=="Unnamed") dragonName = "";
				dragon.nameTag = dragonName;
			}
		},60);
	},0);
});

world.afterEvents.playerPlaceBlock.subscribe(({block,player})=>{
	if (!blockArrays.dragonHeadTypes.includes(block.typeId)) return;
	const y = player.getRotation().y;
	let rot = y+360*(y!=Math.abs(y));
	rot = Math.round(rot/22.5);
	rot = rot!=16?rot:0;
	block.setPermutation(block.permutation.withState("dragonmounts2:rotation",rot));
});

system.beforeEvents.startup.subscribe(({blockComponentRegistry}) => {
	blockComponentRegistry.registerCustomComponent("dragonmounts2:dragon_egg", DragonEgg);
});
const DragonEgg = {
	onPlayerInteract({block,dimension,player},{params}) {
		blockUtilities.dragonEggPlayerInteract(block,dimension,player,params);
	},
	onRandomTick({block,dimension},{params}) {
		blockUtilities.dragonEggRandomTick(block,dimension,params);
	}
};