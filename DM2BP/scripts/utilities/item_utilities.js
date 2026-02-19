import { world, system, ItemStack, Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

export function dragonFluteHitEntity(attackingEntity,hitEntity,itemStack,params) {
	const rule = params;
	if (!(attackingEntity instanceof Player)) return;
	if (!hitEntity||!rule.dragon_types.includes(hitEntity.typeId)) return attackingEntity.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.selected_mobs}`}]});
	const healthComponent = hitEntity.getComponent("minecraft:health");
	const currentHealthValue = healthComponent.currentValue;
	healthComponent.setCurrentValue(currentHealthValue+1);
	if (!hitEntity.hasComponent("minecraft:is_tamed")) return attackingEntity.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.untamed}`}]});
	const ownerIdentifier = hitEntity.getDynamicProperty("dragonmounts2:owner_identifier");
	if (ownerIdentifier&&ownerIdentifier!=attackingEntity.id) return attackingEntity.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.not_owned}`}]});
	if (!ownerIdentifier) hitEntity.setDynamicProperty("dragonmounts2:owner_identifier",attackingEntity.id);
	system.run(()=>{
		const binding = getDragonFluteBinding(itemStack);
		const dragonFluteOwnerIdentifier = hitEntity.getDynamicProperty("dragonmounts2:dragon_flute_owner_identifier");
		const dragonFluteType = hitEntity.getDynamicProperty("dragonmounts2:dragon_flute_type");
		if (dragonFluteOwnerIdentifier&&dragonFluteOwnerIdentifier!=attackingEntity.id) return attackingEntity.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.bounded_other_owner}`}]});
		if (dragonFluteType&&dragonFluteType!=itemStack.typeId) return attackingEntity.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.bounded_other_flute}`}]});
		if (binding&&binding.ownerIdentifier==attackingEntity.id&&binding.dragonIdentifier==hitEntity.id) {
			unbindDragonFlute(attackingEntity,hitEntity,itemStack,rule);
			attackingEntity.onScreenDisplay.setActionBar({rawtext:[{text:"§e"},{translate:`${rule.translates.unbound}`}]});
			attackingEntity.dimension.playSound("random.break",attackingEntity.location);
		}
		else {
			bindDragonFlute(attackingEntity,hitEntity,itemStack,rule);
			attackingEntity.onScreenDisplay.setActionBar({rawtext:[{text:"§e"},{translate:`${rule.translates.bound}`}]});
			attackingEntity.dimension.playSound("random.levelup",attackingEntity.location);
		}
	});
};
export function dragonFluteUse(itemStack,source,params) {
	const rule = params;
	const cooldown = itemStack.getComponent("minecraft:cooldown");
	if (!(source instanceof Player)) return;
	if (cooldown.isCooldownCategory(cooldown.cooldownCategory)&&cooldown.getCooldownTicksRemaining(source)==2.00) return source.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.cooldown}`}]});
	const binding = getDragonFluteBinding(itemStack);
	if (binding&&binding.ownerIdentifier&&binding.ownerIdentifier!=source.id) return source.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.owned_by}`},{text:`${binding.ownerName}`}]});
	showDragonFluteUI(source,itemStack,rule);
	setDragonFluteCooldown(source);
};

//Testing testing tesctlexhwa
function bindDragonFlute(attackingEntity,hitEntity,itemStack,rule) {
	const mainhand = attackingEntity.getComponent("minecraft:equippable").getEquipmentSlot("Mainhand");
	const dyeable = itemStack.getComponent("minecraft:dyeable");
	const itemName = itemStack.nameTag;
	const dragonFluteItem = new ItemStack(itemStack.typeId);
	let dragonName = hitEntity.nameTag;
	if (!dragonName||dragonName.trim()=="") dragonName = "Unnamed";
	dragonFluteItem.setLore([
		//{rawtext:[{text:`${textColorType}`},{translate:`${textTranslateType}`}]},
		{rawtext:[{text:"§r§7"},{translate:`${rule.translates.bound_to}`}]},
		`§r§9 ${dragonName}`,
		`§r§8 ${hitEntity.id}`,
		{rawtext:[{text:"§r§7"},{translate:`${rule.translates.bound_to_owner}`}]},
		`§r§9 ${attackingEntity.name}`,
		`§r§8 ${attackingEntity.id}`
	]);
	dragonFluteItem.setDynamicProperty("dragonmounts2:owner_name", attackingEntity.name);
	dragonFluteItem.setDynamicProperty("dragonmounts2:owner_identifier", attackingEntity.id);
	dragonFluteItem.setDynamicProperty("dragonmounts2:dragon_name", dragonName);
	dragonFluteItem.setDynamicProperty("dragonmounts2:dragon_identifier", hitEntity.id);
	hitEntity.setDynamicProperty("dragonmounts2:dragon_flute_owner_identifier", attackingEntity.id);
	hitEntity.setDynamicProperty("dragonmounts2:dragon_flute_type", itemStack.typeId);
	const continueDyeable = dragonFluteItem.getComponent("minecraft:dyeable");
	continueDyeable.color = dyeable.color;
	dragonFluteItem.nameTag = itemName;
	mainhand.setItem(dragonFluteItem);
};
function unbindDragonFlute(attackingEntity,hitEntity,itemStack,rule) {
	const mainhand = attackingEntity.getComponent("minecraft:equippable").getEquipmentSlot("Mainhand");
	const dyeable = itemStack.getComponent("minecraft:dyeable");
	const dragonFluteItem = new ItemStack(itemStack.typeId);
	const continueDyeable = dragonFluteItem.getComponent("minecraft:dyeable");
	continueDyeable.color = dyeable.color;
	mainhand.setItem(dragonFluteItem);
	hitEntity.setDynamicProperty("dragonmounts2:dragon_flute_owner_identifier", "");
	hitEntity.setDynamicProperty("dragonmounts2:dragon_flute_type", "");
};

function getDragonFluteBinding(itemStack) {
	return {
		ownerName: itemStack.getDynamicProperty("dragonmounts2:owner_name"),
		ownerIdentifier: itemStack.getDynamicProperty("dragonmounts2:owner_identifier"),
		dragonName: itemStack.getDynamicProperty("dragonmounts2:dragon_name"),
		dragonIdentifier: itemStack.getDynamicProperty("dragonmounts2:dragon_identifier")
	};
};
function showDragonFluteUI(source,itemStack,rule) {
	const binding = getDragonFluteBinding(itemStack);
	if (!binding) return source.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.not_bound}`}]});
	const dragon = source.dimension.getEntities({}).find(e=>e.id==binding.dragonIdentifier);
	if (!dragon) return source.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.not_located}`}]});
	if (dragon.getDynamicProperty("dragonmounts2:owner_identifier")!=source.id) return source.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.not_owned}`}]});
	const dragonIsFollowing = dragon.getProperty("dragonmounts2:is_following");
	const dragonIsLocked = dragon.getProperty("dragonmounts2:is_locked");
	const dragonMobState = dragon.getProperty("dragonmounts2:mob_state");
	let dragonName = dragon.nameTag;
	if (!dragonName||dragonName.trim()=="") dragonName = "Unnamed";
	const dragon_flute = new ActionFormData();
	dragon_flute.title({translate:`${rule.translates.name}`});
	dragon_flute.body(
		{rawtext:[
			{translate:`${rule.translates.bound_to}`}, {translate:`${dragonName}`},
			{text:"\n"},
			{text:"\n"},
			{translate:`${rule.translates.select_command}`}
		]}
	);
	dragon_flute.button({translate:`${rule.translates.come_to_owner}`},"textures/ui/dragonmounts2/dragon_flute/come_to_owner");
	if (dragonMobState=="standing") dragon_flute.button({translate:`${rule.translates.sit}`},"textures/ui/dragonmounts2/dragon_flute/sit");
	else dragon_flute.button({translate:`${rule.translates.stand}`},"textures/ui/dragonmounts2/dragon_flute/stand");
	if (dragonIsFollowing==false) dragon_flute.button({translate:`${rule.translates.follow}`},"textures/ui/dragonmounts2/dragon_flute/follow");
	else dragon_flute.button({translate:`${rule.translates.wander}`},"textures/ui/dragonmounts2/dragon_flute/wander");
	if (dragonIsLocked==false) dragon_flute.button({translate:`${rule.translates.lock}`},"textures/ui/dragonmounts2/dragon_flute/lock");
	else dragon_flute.button({translate:`${rule.translates.unlock}`},"textures/ui/dragonmounts2/dragon_flute/unlock");
	dragon_flute.show(source).then((response) => {
		if (response.canceled) return;
		if (response.selection==0) {
			dragon.teleport(source.location,source.dimension);
			source.onScreenDisplay.setActionBar({rawtext:[{text:"§a"},{translate:`${rule.translates.came}`}]});
			source.dimension.playSound(rule.sounds.long,source.location);
		}
		if (response.selection==1) {
			if (dragonMobState=="standing") {
				source.onScreenDisplay.setActionBar({rawtext:[{text:"§a"},{translate:`${rule.translates.sitting}`}]});
				dragon.triggerEvent("minecraft:on_sit");
			}
			else {
				source.onScreenDisplay.setActionBar({rawtext:[{text:"§a"},{translate:`${rule.translates.standing}`}]});
				dragon.triggerEvent("minecraft:on_stand");
			}
			source.dimension.playSound(rule.sounds.short,source.location);
		}
		if (response.selection==2) {
			if (dragonIsFollowing==false) {
				if (dragonMobState=="sitting") return source.onScreenDisplay.setActionBar({rawtext:[{text:"§c"},{translate:`${rule.translates.follow_deny}`}]});
				source.onScreenDisplay.setActionBar({rawtext:[{text:"§a"},{translate:`${rule.translates.following}`}]});
				dragon.triggerEvent("minecraft:on_follow");
			}
			else {
				source.onScreenDisplay.setActionBar({rawtext:[{text:"§a"},{translate:`${rule.translates.wandering}`}]});
				dragon.triggerEvent("minecraft:on_wander");
			}
			source.dimension.playSound(rule.sounds.short,source.location);
		}
		if (response.selection==3) {
			if (dragonIsLocked==false) {
				source.onScreenDisplay.setActionBar({rawtext:[{text:"§a"},{translate:`${rule.translates.locked}`}]});
				dragon.triggerEvent("minecraft:on_lock");
			}
			else {
				source.onScreenDisplay.setActionBar({rawtext:[{text:"§a"},{translate:`${rule.translates.unlocked}`}]});
				dragon.triggerEvent("minecraft:on_unlock");
			}
			source.dimension.playSound(rule.sounds.long,source.location);
		}
	});
};
function setDragonFluteCooldown(source) {
};