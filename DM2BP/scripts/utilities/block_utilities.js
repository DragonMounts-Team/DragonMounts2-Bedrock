import { world, system, Player } from "@minecraft/server";
import * as blockArrays from "../arrays/block_arrays.js";
import * as blockData from "../data/block_data.js";

export function dragonEggRandomTick(block,dimension,params) {
	const rule = params;
	dimension.spawnParticle(rule.particles.random_tick_particle,block.center());
};
export function dragonEggPlayerInteract(block,dimension,player,params) {
	const rule = params;
	block.setType(rule.block_transforms_into);
	dimension.playSound(rule.sounds.interact_sound,block.center());
	dimension.spawnEntity(rule.block_entity,{x:block.center().x,y:block.location.y,z:block.center().z});
	dimension.spawnParticle(rule.particles.interact_particle,block.center());
};