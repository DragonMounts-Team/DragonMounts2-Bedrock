import { world, system } from "@minecraft/server";
import * as entityData from "../data/entity_data.js";

const methodCheckers = {
	ring: checkRingMethod,
	radius: checkRadiusMethod,
	single: checkSingleMethod
};

export function getDragonEggNestingBlock(dragonEgg) {
	if (!dragonEgg?.isValid) return;

	const dragonEggTypes = entityData.dragonEggTypes[dragonEgg.typeId];
	if (!dragonEggTypes) return;

	const eggDim = dragonEgg.dimension;
	if (!eggDim.isChunkLoaded(dragonEgg.location)) return;

	const eggNestingBlock = dragonEgg.getProperty("dragonmounts2:egg_nesting_block");
	const eggLoc = eggDim.getBlock(dragonEgg.location).center();
	const checker = methodCheckers[dragonEggTypes.hatch_method];
	if (!checker) return;

	const success = checker(dragonEgg, eggDim, eggLoc, dragonEggTypes.block_placement);

	if (success) {
		tryActivateEggNestBlock(dragonEgg, eggNestingBlock);
	} else {
		tryDeactivateEggNestBlock(dragonEgg, eggNestingBlock);
	}
}

export function getDragonEggConvertBlock(dragonEgg) {
	if (!dragonEgg?.isValid) return;

	const convertTypes = entityData.dragonEggTypes;
	if (!convertTypes) return;

	const eggNestingBlock = dragonEgg.getProperty("dragonmounts2:egg_nesting_block");
	const eggState = dragonEgg.getProperty("dragonmounts2:egg_state");

	if (eggNestingBlock === true || eggState !== "transformed") return;

	const eggDim = dragonEgg.dimension;
	if (!eggDim.isChunkLoaded(dragonEgg.location)) return;

	const currentTypeId = dragonEgg.typeId;
	const eggLoc = eggDim.getBlock(dragonEgg.location).center();

	for (const key in convertTypes) {
		const convertData = convertTypes[key];
		if (!convertData) continue;
		if (convertData.egg_type === currentTypeId) continue;
		if (convertData.deny === currentTypeId) continue;

		const checker = methodCheckers[convertData.hatch_method];
		if (!checker) continue;

		if (checker(dragonEgg, eggDim, eggLoc, convertData.block_placement)) {
			return convertDragonEgg(dragonEgg, convertData.egg_type);
		}
	}
}

function checkRingMethod(dragonEgg, eggDim, eggLoc, blockPlacement) {
	if (!blockPlacement.first_method) return false;
	if (checkLocations(eggDim, eggLoc, blockPlacement.first_method)) return true;
	return blockPlacement.second_method
		? checkLocations(eggDim, eggLoc, blockPlacement.second_method)
		: false;
}

function checkRadiusMethod(dragonEgg, eggDim, eggLoc, blockPlacement) {
	if (!blockPlacement.first_method) return false;
	if (checkRadiusArea(eggDim, eggLoc, blockPlacement.first_method)) return true;
	return blockPlacement.second_method
		? checkRadiusArea(eggDim, eggLoc, blockPlacement.second_method)
		: false;
}

function checkSingleMethod(dragonEgg, eggDim, eggLoc, blockPlacement) {
	if (!blockPlacement.first_method) return false;
	if (checkSingleLocation(eggDim, eggLoc, blockPlacement.first_method)) return true;
	return blockPlacement.second_method
		? checkSingleLocation(eggDim, eggLoc, blockPlacement.second_method)
		: false;
}

function checkLocations(eggDim, eggLoc, method) {
	if (!method.xz_locations) return false;
	for (const dxz of method.xz_locations) {
		const requiredBlock = eggDim.getBlock({
			x: eggLoc.x + dxz.x,
			y: eggLoc.y + method.y_location,
			z: eggLoc.z + dxz.z
		});
		if (!method.blocks.includes(requiredBlock.typeId)) return false;
	}
	return true;
}

function checkRadiusArea(eggDim, eggLoc, method) {
	const { start_xz_locations: start, end_xz_locations: end } = method;
	for (let x = start.x; x <= end.x; x++) {
		for (let z = start.z; z <= end.z; z++) {
			const requiredBlock = eggDim.getBlock({
				x: eggLoc.x + x,
				y: eggLoc.y + method.y_location,
				z: eggLoc.z + z
			});
			if (!method.blocks.includes(requiredBlock.typeId)) return false;
		}
	}
	return true;
}

function checkSingleLocation(eggDim, eggLoc, method) {
	const { location } = method;
	const requiredBlock = eggDim.getBlock({
		x: eggLoc.x + location.x,
		y: eggLoc.y + location.y,
		z: eggLoc.z + location.z
	});
	return method.blocks.includes(requiredBlock.typeId);
}

function convertDragonEgg(dragonEgg, newTypeId) {
	const dim = dragonEgg.dimension;
	const loc = dragonEgg.location;
	dragonEgg.remove();
	dim.spawnEntity(newTypeId, loc);
}

export function tryActivateEggNestBlock(dragonEgg, eggNestingBlock) {
	if (eggNestingBlock === true || !dragonEgg?.isValid) return;
	dragonEgg.setProperty("dragonmounts2:egg_nesting_block", true);
}

export function tryDeactivateEggNestBlock(dragonEgg, eggNestingBlock) {
	if (eggNestingBlock === false || !dragonEgg?.isValid) return;
	dragonEgg.setProperty("dragonmounts2:egg_nesting_block", false);
}