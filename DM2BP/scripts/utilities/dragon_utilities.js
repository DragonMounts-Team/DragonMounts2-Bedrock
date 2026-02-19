import { world, system, Player } from "@minecraft/server";
import * as dragonArrays from "../arrays/dragon_arrays.js";

export const dragonTypes = { families: ["dragon"] };

export function dragonsMainComponents(dragon) {
	const dragonOnList = dragonArrays.dragonTypesList.includes(dragon.typeId);
	if (!dragonOnList) return;
	const isBreathing = dragon.getProperty("dragonmounts2:is_breathing");
	const rideable = dragon.getComponent("rideable");
	const tameable = dragon.getComponent("minecraft:tameable");
	if (dragon.hasComponent("minecraft:tameable")&&tameable.isTamed) {
		const ownerName = tameable.tamedToPlayer.name;
		const ownerIdentifier = tameable.tamedToPlayerId;
		dragon.setDynamicProperty("dragonmounts2:owner_name", ownerName);
		dragon.setDynamicProperty("dragonmounts2:owner_identifier", ownerIdentifier);
	}
	if (rideable) {
		const controllingSeat = rideable.controllingSeat;
		const riders = rideable.getRiders();
		if (riders) {
			const controllingRider = riders[controllingSeat];
			if (!controllingRider) return;
			if (controllingRider instanceof Player) {
				handleDragonBreath(dragon,controllingRider,isBreathing);
			}
		}
		else {
			if (isBreathing) return dragon.setProperty("dragonmounts2:is_breathing",false);
		}
	}
};

function handleDragonBreath(dragon,player,isBreathing) {
	if (player.isJumping&&!isBreathing) {
		const pitch = player.getRotation().x;
		if (pitch<-50&&dragon.isOnGround) return dragon.applyImpulse({x:0,y:0.5,z:0});
		else if (pitch<-50&&!dragon.isOnGround) return;
		else return dragon.setProperty("dragonmounts2:is_breathing",true);
	}
	else if (player.isJumping&&isBreathing) return;
	else if (!player.isJumping&&isBreathing) return dragon.setProperty("dragonmounts2:is_breathing",false);
};