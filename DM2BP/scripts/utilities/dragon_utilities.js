import { world, system, Player, ButtonState, InputButton } from "@minecraft/server";
import * as dragonArrays from "../arrays/dragon_arrays.js";

export const dragonTypes = { families: ["dragon"] };
const jumpData = new Map();
const movementInputState = new Map();
const CLEANUP_INTERVAL = 600;
const JUMP_BOOST_WINDOW_TICKS = 10;
const JUMP_BOOST_IMPULSE_Y = 0.95;
const BREATH_START_DELAY_TICKS = 8; // Delay before fire breath starts charging (prevent early activation)
let lastCleanup = 0;

const fallRescueData = new Map();
const FALL_RESCUE_MIN_FALL_HEIGHT = 2.5;
const FALL_RESCUE_MIN_FALL_TICKS = 4;
const FALL_RESCUE_DELAY_TICKS = 10;
const FALL_RESCUE_SEARCH_RADIUS = 56;
const FALL_RESCUE_MAX_RECENT_TICKS = 120;

const playerLookupCache = {
	tick: -1,
	map: new Map()
};
const hostileBreathTargets = new Map();

function getPlayerById(playerId) {
	if (!playerId) return null;
	if (playerLookupCache.tick !== system.currentTick) {
		playerLookupCache.tick = system.currentTick;
		playerLookupCache.map.clear();
		for (const player of world.getAllPlayers()) {
			playerLookupCache.map.set(player.id, player);
		}
	}
	return playerLookupCache.map.get(playerId) || null;
}

function isDragonEntity(entity) {
	if (!entity?.isValid) return false;
	if (dragonArrays.dragonTypesList?.includes(entity.typeId)) return true;
	return entity.getProperty?.("dragonmounts2:age_variant") !== undefined || entity.getProperty?.("dragonmounts2:mob_state") !== undefined;
}

function getDragonBreathKey(dragon) {
	return getPersistentId(dragon) || dragon?.id || null;
}

function rememberDragonHostility(dragon, attacker) {
	if (!dragon?.isValid || !attacker?.isValid || !(attacker instanceof Player)) return;
	const key = getDragonBreathKey(dragon);
	if (!key) return;
	hostileBreathTargets.set(key, {
		playerId: attacker.id,
		expiresTick: system.currentTick + AUTO_BREATH_HOSTILE_DURATION_TICKS
	});
}

function rememberOwnerAggression(player, attacker) {
	if (!player?.isValid || !attacker?.isValid || !(attacker instanceof Player)) return;
	for (const candidate of player.dimension.getEntities()) {
		if (!candidate?.isValid || candidate.id === player.id) continue;
		if (!isDragonEntity(candidate)) continue;
		const ownerIdentifier = candidate.getDynamicProperty("dragonmounts2:owner_identifier") || candidate.getComponent("minecraft:tameable")?.tamedToPlayerId;
		if (ownerIdentifier !== player.id) continue;
		rememberDragonHostility(candidate, attacker);
	}
}

function getEntityHealth(entity) {
	const healthComponent = entity?.getComponent?.("minecraft:health");
	return {
		currentValue: healthComponent?.currentValue ?? null,
		maxValue: healthComponent?.maxValue ?? null
	};
}

function stopAutonomousBreath(dragon) {
	if (!dragon?.isValid) return;
	if (dragon.getProperty("dragonmounts2:is_breathing") === true) {
		dragon.setProperty("dragonmounts2:is_breathing", false);
	}
	if (dragon.getProperty("dragonmounts2:breath_charge") !== 0.0) {
		dragon.setProperty("dragonmounts2:breath_charge", 0.0);
	}
}

function handleDragonBreathProjectile(dragon, rider = null) {
	if (!dragon?.isValid) return;
	// Manual breath system is the active logic. Autonomous breath is intentionally disabled.
}

function handleWildDragonBreath(dragon) {
	if (!dragon?.isValid) return;
	// Autonomous breath is disabled by design; this is kept as a noop for consistency.
	stopAutonomousBreath(dragon);
}

world.afterEvents.entityHurt.subscribe((event) => {
	const { hurtEntity, damageSource } = event;
	if (!hurtEntity?.isValid || !damageSource?.damagingEntity?.isValid) return;
	const attacker = damageSource.damagingEntity;
	if (!(attacker instanceof Player)) return;
	if (isDragonEntity(hurtEntity)) {
		rememberDragonHostility(hurtEntity, attacker);
		return;
	}
	if (hurtEntity instanceof Player) {
		rememberOwnerAggression(hurtEntity, attacker);
	}
});

function getSafeVelocity(entity) {
	return entity?.getVelocity ? entity.getVelocity() : { x: 0, y: 0, z: 0 };
}

function getPlayerMovementInput(player) {
	if (!player?.isValid) return { forward: false, back: false, left: false, right: false };
	return movementInputState.get(player.id) ?? { forward: false, back: false, left: false, right: false };
}

function applyMountedDirectionalMovement(dragon, player) {
	if (!dragon?.isValid || !player?.isValid) return;
	const input = getPlayerMovementInput(player);
	if (!input.forward && !input.back && !input.left && !input.right) return;

	const currentRotation = dragon.getRotation?.();
	const yaw = ((currentRotation?.y ?? 0) % 360 + 360) % 360;
	const yawRad = (yaw * Math.PI) / 180;
	const forward = { x: -Math.sin(yawRad), z: Math.cos(yawRad) };
	const right = { x: Math.cos(yawRad), z: Math.sin(yawRad) };

	let moveX = 0;
	let moveZ = 0;
	if (input.forward) { moveX += forward.x; moveZ += forward.z; }
	if (input.back) { moveX -= forward.x; moveZ -= forward.z; }
	if (input.left) { moveX -= right.x; moveZ -= right.z; }
	if (input.right) { moveX += right.x; moveZ += right.z; }

	const magnitude = Math.hypot(moveX, moveZ);
	if (magnitude < 0.001) return;

	const direction = { x: moveX / magnitude, z: moveZ / magnitude };
	const desiredYaw = ((Math.atan2(-direction.x, direction.z) * 180 / Math.PI) % 360 + 360) % 360;
	try {
		dragon.setRotation({ x: currentRotation?.x ?? 0, y: desiredYaw, z: 0 });
	} catch {}

	const movementState = dragon.getProperty?.("dragonmounts2:movement_state");
	const speed = movementState === "flying" ? 0.18 : 0.14;
	const velocity = getSafeVelocity(dragon);
	const nextVelocity = {
		x: direction.x * speed,
		y: velocity.y,
		z: direction.z * speed
	};
	try {
		dragon.clearVelocity?.();
		dragon.applyImpulse?.(nextVelocity);
	} catch {}
}

export const V_FLIGHT_MAX_FOLLOWERS = 4;
const V_FLIGHT_BACK_GAP = 11;
const V_FLIGHT_SIDE_GAP = 9;
const V_FLIGHT_PREDICTION_TICKS = 4;
const V_FLIGHT_CRUISE_PAD = 0.08;
const V_FLIGHT_SPEED_MULTIPLIER = 0.76;
const V_FLIGHT_SLOT_SPEED_FACTORS = [0.96, 0.88, 0.94, 0.90];
const V_FLIGHT_CATCHUP_RANGE = 12;
const V_FLIGHT_CATCHUP_BONUS = 8;
const V_FLIGHT_MAX_SPEED = 7;
const V_FLIGHT_ARRIVE_RADIUS = 1.8;
const V_FLIGHT_HOVER_DEADZONE = 0.9;
const V_FLIGHT_SNAP_DISTANCE = 22;
const V_FLIGHT_STEERING_SMOOTH_BASE = 0.16;
const V_FLIGHT_STEERING_SMOOTH_CATCHUP = 0.72;
const V_FLIGHT_LEAD_TICKS = 6;
export function getOwnerVFlightDragons(dimension, ownerIdentifier) {
	if (!dimension || !ownerIdentifier) return [];
	const dragons = dimension.getEntities({ families: dragonTypes.families });
	return dragons.filter(d => {
		if (!d?.isValid) return false;
		if (d.getDynamicProperty("dragonmounts2:owner_identifier") !== ownerIdentifier) return false;
		return d.getProperty("dragonmounts2:v_flight_enabled") === true;
	});
}
export function assignFreeVFlightSlot(dimension, ownerIdentifier) {
	if (!dimension || !ownerIdentifier) return -1;
	const occupied = dimension.getEntities({ families: dragonTypes.families }).filter(d => {
		if (!d?.isValid) return false;
		if (d.getDynamicProperty("dragonmounts2:owner_identifier") !== ownerIdentifier) return false;
		if (d.getDynamicProperty("dragonmounts2:v_flight_slot") === undefined) return false;
		return true;
	});
	if (occupied.length >= V_FLIGHT_MAX_FOLLOWERS) return -1;
	const used = new Set(occupied.map(d => d.getDynamicProperty("dragonmounts2:v_flight_slot")));
	for (let slot = 0; slot < V_FLIGHT_MAX_FOLLOWERS; slot++) {
		if (!used.has(slot)) return slot;
	}
	return -1;
}

export function disableOwnerVFlightDragons(ownerIdentifier, dimension, keepDragon = null, reason = "manual") {
	if (!ownerIdentifier || !dimension) return;
	for (const candidate of dimension.getEntities({ families: dragonTypes.families })) {
		if (!candidate?.isValid || candidate === keepDragon) continue;
		if (candidate.getDynamicProperty("dragonmounts2:owner_identifier") !== ownerIdentifier) continue;
		if (!isVFlightRelevant(candidate)) continue;
		disableVFlight(candidate, reason);
	}
}

function disableOtherOwnerVFlightDragons(ownerIdentifier, dimension, keepDragon = null) {
	disableOwnerVFlightDragons(ownerIdentifier, dimension, keepDragon, "manual");
}

function isSolidOrLiquidBlock(block) {
	if (!block) return true;
	if (isLiquidBlock(block)) return true;
	return block.typeId !== "minecraft:air";
}

function isOpenVFlightWaypoint(dimension, pos) {
	if (!dimension || !pos) return false;
	const checks = [
		{ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) },
		{ x: Math.floor(pos.x), y: Math.floor(pos.y + 1), z: Math.floor(pos.z) },
		{ x: Math.floor(pos.x), y: Math.floor(pos.y + 2), z: Math.floor(pos.z) }
	];
	for (const chk of checks) {
		const block = dimension.getBlock(chk);
		if (isSolidOrLiquidBlock(block)) return false;
	}
	return true;
}

function isPathClearForVFlight(dimension, from, to) {
	if (!dimension || !from || !to) return false;
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const dz = to.z - from.z;
	const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
	const steps = Math.min(10, Math.max(3, Math.ceil(dist / 1.25)));
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const sample = {
			x: from.x + dx * t,
			y: from.y + dy * t,
			z: from.z + dz * t
		};
		if (!isOpenVFlightWaypoint(dimension, sample)) return false;
	}
	return true;
}

function resolveVFlightObstacleTarget(dragon, controllingDragon, targetPos) {
	if (!dragon?.isValid || !controllingDragon?.isValid || !targetPos) return targetPos;
	const from = dragon.location;
	const dim = dragon.dimension;
	if (isPathClearForVFlight(dim, from, targetPos)) return targetPos;
	const rot = controllingDragon.getRotation();
	const yawRad = (rot.y * Math.PI) / 180;
	const forwardHoriz = { x: -Math.sin(yawRad), z: Math.cos(yawRad) };
	const right = { x: forwardHoriz.z, z: -forwardHoriz.x };
	const candidates = [
		{ x: 0, z: 0 },
		{ x: right.x * 2.4, z: right.z * 2.4 },
		{ x: -right.x * 2.4, z: -right.z * 2.4 },
		{ x: right.x * 4.2, z: right.z * 4.2 },
		{ x: -right.x * 4.2, z: -right.z * 4.2 },
		{ x: forwardHoriz.x * 2.2, z: forwardHoriz.z * 2.2 },
		{ x: -forwardHoriz.x * 2.2, z: -forwardHoriz.z * 2.2 },
		{ x: right.x * 2.2 + forwardHoriz.x * 1.8, z: right.z * 2.2 + forwardHoriz.z * 1.8 },
		{ x: -right.x * 2.2 + forwardHoriz.x * 1.8, z: -right.z * 2.2 + forwardHoriz.z * 1.8 }
	];
	let bestTarget = targetPos;
	let bestScore = Number.POSITIVE_INFINITY;
	for (const offset of candidates) {
		const candidate = {
			x: targetPos.x + offset.x,
			y: targetPos.y + 0.35,
			z: targetPos.z + offset.z
		};
		if (!isPathClearForVFlight(dim, from, candidate)) continue;
		const score = Math.abs(offset.x) + Math.abs(offset.z) + Math.hypot(candidate.x - targetPos.x, candidate.z - targetPos.z) * 0.4;
		if (score < bestScore) {
			bestScore = score;
			bestTarget = candidate;
		}
	}
	if (bestTarget !== targetPos) return bestTarget;
	const fallback = {
		x: targetPos.x - forwardHoriz.x * 2.8,
		y: targetPos.y + 0.35,
		z: targetPos.z - forwardHoriz.z * 2.8
	};
	return isPathClearForVFlight(dim, from, fallback) ? fallback : targetPos;
}
function computeVFlightSlotPosition(controllingDragon, slot) {
	const rot = controllingDragon.getRotation();
	const yawRad = (rot.y * Math.PI) / 180;
	const pitchRad = (rot.x * Math.PI) / 180;
	const forwardHoriz = { x: -Math.sin(yawRad), z: Math.cos(yawRad) };
	const right = { x: forwardHoriz.z, z: -forwardHoriz.x };

	const wingSign = slot % 2 === 0 ? 1 : -1;
	const echelon = Math.floor(slot / 2) + 1;
	const velocity = getSafeVelocity(controllingDragon);
	const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
	const leadAdvance = Math.min(speed * V_FLIGHT_PREDICTION_TICKS * 0.15, 6);
	const backDist = V_FLIGHT_BACK_GAP * echelon + Math.min(speed * 0.35, 4) * echelon;
	const sideDist = V_FLIGHT_SIDE_GAP * echelon + Math.min(speed * 0.18, 3) * echelon;
	const altitudeOffset = -0.8 + echelon * 0.45 + wingSign * 0.2 + Math.max(Math.min(velocity.y * 0.4, 0.8), -0.8);

	const leadLoc = controllingDragon.location;
	const predictedLead = {
		x: leadLoc.x + forwardHoriz.x * leadAdvance,
		y: leadLoc.y + Math.max(Math.min(velocity.y * V_FLIGHT_LEAD_TICKS * 0.08, 2), -2),
		z: leadLoc.z + forwardHoriz.z * leadAdvance
	};

	return {
		x: predictedLead.x - forwardHoriz.x * backDist + right.x * sideDist * wingSign,
		y: predictedLead.y + altitudeOffset,
		z: predictedLead.z - forwardHoriz.z * backDist + right.z * sideDist * wingSign
	};
}

function shouldSyncRotation(currentRotation, targetRotation) {
	if (!currentRotation || !targetRotation) return true;
	const yawDelta = Math.abs((((targetRotation.y - currentRotation.y) % 360) + 540) % 360 - 180);
	const pitchDelta = Math.abs(targetRotation.x - currentRotation.x);
	return yawDelta > 1 || pitchDelta > 2;
}

function isVFlightRelevant(dragon) {
	if (!dragon?.isValid) return false;
	if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true) return true;
	if (dragon.getDynamicProperty("dragonmounts2:v_flight_reserved") === true) return true;
	if (dragon.getDynamicProperty("dragonmounts2:v_flight_manual_disable") === true) return true;
	if (dragon.getDynamicProperty("dragonmounts2:v_flight_disable_blocked") === true) return true;
	return dragon.getDynamicProperty("dragonmounts2:v_flight_controller_pid") !== undefined;
}

function isInWater(entity) {
	return entity?.isInWater === true;
}

function isLiquidBlock(block) {
	if (!block) return false;
	return block.typeId.includes("water") || block.typeId.includes("lava");
}

function findNearbyLandTarget(dragon, radius = 16, maxDepth = 12) {
	if (!dragon?.isValid) return null;
	const dim = dragon.dimension;
	const origin = dragon.location;
	const ox = Math.floor(origin.x);
	const oz = Math.floor(origin.z);
	const oy = Math.floor(origin.y);
	const velocity = getSafeVelocity(dragon);
	const horizSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
	const dirVelX = horizSpeed > 0.1 ? velocity.x / horizSpeed : 0;
	const dirVelZ = horizSpeed > 0.1 ? velocity.z / horizSpeed : 0;
	const offsets = [
		[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
		[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]
	];

	let bestTarget = null;
	let bestScore = -Infinity;

	for (let step = 0; step <= radius; step += 2) {
		for (const [dx, dz] of offsets) {
			const x = ox + dx * step;
			const z = oz + dz * step;
			for (let dy = -maxDepth; dy <= maxDepth; dy++) {
				const y = oy + dy;
				if (y > origin.y + 8) continue;
				const block = dim.getBlock({ x: x, y: y, z: z });
				const above = dim.getBlock({ x: x, y: y + 1, z: z });
				const above2 = dim.getBlock({ x: x, y: y + 2, z: z });
				if (!block || !above || !above2) continue;
				if (isLiquidBlock(block) || above.typeId !== "minecraft:air" || above2.typeId !== "minecraft:air") continue;

				const horizontalDist = Math.sqrt(Math.pow(x + 0.5 - origin.x, 2) + Math.pow(z + 0.5 - origin.z, 2));
				const heightDelta = y - oy;
				const heightScore = Math.max(0, heightDelta) * 2 - Math.abs(heightDelta) * 1.3;
				const headingBonus = horizSpeed > 0.1 && horizontalDist > 0.1 ? Math.max(0, ((x + 0.5 - origin.x) * dirVelX + (z + 0.5 - origin.z) * dirVelZ) / horizontalDist) : 0;
				const score = heightScore - horizontalDist * 2.2 + headingBonus * 10 + (horizontalDist < 4 ? 10 : 0);

				if (score > bestScore) {
					bestScore = score;
					bestTarget = { x: x + 0.5, y: y + 1.5, z: z + 0.5 };
				}
			}
		}
	}
	return bestTarget;
}
function rotationFromDirection(direction) {
	if (!direction) return null;
	const horiz = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
	if (horiz < 0.001) return null;
	const yaw = -Math.atan2(direction.x, direction.z) * 180 / Math.PI;
	const pitch = -Math.atan2(direction.y, horiz) * 180 / Math.PI;
	return {
		x: pitch,
		y: ((yaw % 360) + 360) % 360,
		z: 0
	};
}

function applyRotation(dragon, rotation) {
	if (!dragon?.isValid || !rotation) return;
	if (typeof dragon.setRotation === "function") {
		dragon.setRotation(rotation);
		return;
	}
	try {
		dragon.teleport(dragon.location, { dimension: dragon.dimension, rotation });
	} catch (e) {
  }
}
export function saveVFlightPreviousState(dragon) {
	if (!dragon?.isValid) return;
	dragon.setDynamicProperty("dragonmounts2:v_flight_prev_mob_state", dragon.getProperty("dragonmounts2:mob_state") || "standing");
	dragon.setDynamicProperty("dragonmounts2:v_flight_prev_is_following", dragon.getProperty("dragonmounts2:is_following") === true);
}

const elytraFollowTracking = new Map();

export function activateElytraFollow(dragon, playerId) {
	if (!dragon?.isValid || !playerId) return false;
	if (dragon.getProperty("dragonmounts2:elytra_follow_enabled") === true) return false;
	if (isVFlightRelevant(dragon)) return false;

	const dragonId = getPersistentId(dragon);
	
	elytraFollowTracking.set(dragonId, {
		playerId,
		activatedTick: system.currentTick
	});

	dragon.setDynamicProperty("dragonmounts2:elytra_follow_player_id", playerId);
	dragon.setDynamicProperty("dragonmounts2:elytra_prev_mob_state", dragon.getProperty("dragonmounts2:mob_state") || "standing");
	dragon.setDynamicProperty("dragonmounts2:elytra_prev_is_following", dragon.getProperty("dragonmounts2:is_following") === true);
	dragon.setProperty("dragonmounts2:is_following", false);
	try { dragon.triggerEvent("dragonmounts2:on_elytra_follow_enable"); } catch (e) { }
	dragon.setProperty("dragonmounts2:movement_state", "flying");
	try { dragon.triggerEvent("minecraft:on_flying"); } catch (e) { }
	dragon.clearVelocity();
	
	return true;
}

export function deactivateElytraFollow(dragon) {
	if (!dragon?.isValid) return false;
	if (dragon.getProperty("dragonmounts2:elytra_follow_enabled") !== true) return false;
	
	const dragonId = getPersistentId(dragon);
	elytraFollowTracking.delete(dragonId);
	try { dragon.triggerEvent("dragonmounts2:on_elytra_follow_disable"); } catch (e) { }
	dragon.setDynamicProperty("dragonmounts2:elytra_follow_player_id", undefined);
	dragon.clearVelocity();
	const prevMobState = dragon.getDynamicProperty("dragonmounts2:elytra_prev_mob_state");
	const prevIsFollowing = dragon.getDynamicProperty("dragonmounts2:elytra_prev_is_following") === true;
	dragon.setDynamicProperty("dragonmounts2:elytra_prev_mob_state", undefined);
	dragon.setDynamicProperty("dragonmounts2:elytra_prev_is_following", undefined);
	dragon.setProperty("dragonmounts2:movement_state", "grounded");
	try { dragon.triggerEvent("minecraft:on_grounded"); } catch (e) { }
	dragon.setProperty("dragonmounts2:is_following", prevIsFollowing);
	if (prevMobState === "sitting") {
		dragon.setProperty("dragonmounts2:mob_state", "sitting");
		try { dragon.triggerEvent("minecraft:on_sit"); } catch (e) { }
	}
	
	return true;
}

function setVFlightController(dragon, controllerDragon) {
	if (!dragon?.isValid) return;
	if (!controllerDragon?.isValid) {
		dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", undefined);
		return;
	}

	const pid = getPersistentId(controllerDragon);
	if (pid) dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", pid);
}

function isGrounded(dragon) {
	if (!dragon?.isValid) return false;
	if (dragon.isOnGround === true) return true;
	const loc = dragon.location;
	const dim = dragon.dimension;
	const footY = Math.floor(loc.y - 1.5);
	const block = dim.getBlock({ x: Math.floor(loc.x), y: footY, z: Math.floor(loc.z) });
	if (!block) return false;
	if (block.typeId === "minecraft:air") return false;
	if (isLiquidBlock(block)) return false;
	return loc.y - (footY + 1) < 1.5;
}

function updateVFlightLanding(dragon) {
	if (!dragon?.isValid) return false;
	if (dragon.getDynamicProperty("dragonmounts2:v_flight_landing") !== true) return false;

	let landTarget = findNearbyLandTarget(dragon, 16, 12);
	const inWater = dragon.isInWater;

	if (inWater && !landTarget) {
		dragon.setDynamicProperty("dragonmounts2:v_flight_landing", undefined);
		dragon.setDynamicProperty("dragonmounts2:v_flight_disable_blocked", undefined);
		dragon.setProperty("dragonmounts2:v_flight_enabled", false);
		dragon.triggerEvent("dragonmounts2:on_vflight_disable");
		dragon.triggerEvent("minecraft:on_swimming");
		restoreVFlightPreviousState(dragon);
		return true;
	}

	if (isGrounded(dragon)) {
		dragon.setDynamicProperty("dragonmounts2:v_flight_landing", undefined);
		dragon.setDynamicProperty("dragonmounts2:v_flight_disable_blocked", undefined);
		dragon.setProperty("dragonmounts2:v_flight_enabled", false);
		dragon.clearVelocity();
		dragon.triggerEvent("dragonmounts2:on_vflight_disable");
		dragon.triggerEvent("minecraft:on_grounded");
		restoreVFlightPreviousState(dragon);
		return true;
	}

	if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") {
		dragon.triggerEvent("minecraft:on_flying");
	}

	const currentVel = getSafeVelocity(dragon);
	const horizontalSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
	const glideSpeed = Math.max(Math.min(horizontalSpeed * 0.95 + 0.18, 1.2), 0.45);
	const forward = {
		x: currentVel.x === 0 && currentVel.z === 0 ? Math.sin((dragon.getRotation().y || 0) * Math.PI / 180) : currentVel.x / Math.max(horizontalSpeed, 0.001),
		y: 0,
		z: currentVel.x === 0 && currentVel.z === 0 ? -Math.cos((dragon.getRotation().y || 0) * Math.PI / 180) : currentVel.z / Math.max(horizontalSpeed, 0.001)
	};

	const lookRotation = rotationFromDirection(forward);
	if (lookRotation) applyRotation(dragon, lookRotation);

	let verticalSpeed = Math.max(currentVel.y - 0.16, -0.58);
	verticalSpeed = Math.min(verticalSpeed, -0.18);
	const desiredVel = {
		x: forward.x * glideSpeed,
		y: verticalSpeed,
		z: forward.z * glideSpeed
	};

	const loc = dragon.location;
	if (loc.y - Math.floor(loc.y) < 0.4 && currentVel.y <= 0.0) {
		dragon.setDynamicProperty("dragonmounts2:v_flight_landing", undefined);
		dragon.setDynamicProperty("dragonmounts2:v_flight_disable_blocked", undefined);
		dragon.setProperty("dragonmounts2:v_flight_enabled", false);
		dragon.triggerEvent("dragonmounts2:on_vflight_disable");
		restoreVFlightPreviousState(dragon);
		return true;
	}

	dragon.clearVelocity();
	dragon.applyImpulse(desiredVel);
	return true;
}

export function startVFlight(dragon, ownerId, dimension, controllerDragon = null) {
	if (!dragon?.isValid) return false;
	if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true) return false;
	const slot = assignFreeVFlightSlot(dimension, ownerId);
	if (slot === -1) return false;
	disableOtherOwnerVFlightDragons(ownerId, dimension, dragon);
	saveVFlightPreviousState(dragon);
	dragon.setDynamicProperty("dragonmounts2:v_flight_slot", slot);
	dragon.setDynamicProperty("dragonmounts2:v_flight_disable_reason", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_manual_disable", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_reserved", true);
	if (controllerDragon?.isValid) setVFlightController(dragon, controllerDragon);
	dragon.triggerEvent("dragonmounts2:on_vflight_enable");
	if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") {
		dragon.setProperty("dragonmounts2:movement_state", "flying");
	}
	dragon.clearVelocity();
	dragon.applyImpulse({ x: 0, y: 1.25, z: 0 });
	return true;
}

function restoreVFlightPreviousState(dragon) {
	if (!dragon?.isValid) return;
	const prevMobState = dragon.getDynamicProperty("dragonmounts2:v_flight_prev_mob_state");
	const prevIsFollowing = dragon.getDynamicProperty("dragonmounts2:v_flight_prev_is_following");

	dragon.setProperty("dragonmounts2:v_flight_enabled", false);
	dragon.setDynamicProperty("dragonmounts2:v_flight_slot", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_activated", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_landing", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_disable_blocked", undefined);

	if (prevMobState === "sitting") {
		dragon.triggerEvent("minecraft:on_sit");
	} else if (prevMobState === "standing") {
		dragon.triggerEvent("minecraft:on_stand");
	}

	if (dragon.getProperty("dragonmounts2:movement_state") === "grounded") {
		dragon.setProperty("dragonmounts2:is_following", false);
		dragon.triggerEvent("minecraft:on_wander");
	} else if (prevIsFollowing) {
		dragon.triggerEvent("minecraft:on_follow");
	} else {
		dragon.triggerEvent("minecraft:on_wander");
	}

	dragon.setDynamicProperty("dragonmounts2:v_flight_prev_mob_state", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_prev_is_following", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_reserved", undefined);
}

export function disableVFlight(dragon, reason = null) {
	if (!dragon?.isValid) return;
	if (dragon.getProperty("dragonmounts2:v_flight_enabled") !== true) return;

	if (reason === "manual") {
		dragon.setDynamicProperty("dragonmounts2:v_flight_manual_disable", true);
		dragon.setDynamicProperty("dragonmounts2:v_flight_disable_reason", "manual");
	} else {
		dragon.setDynamicProperty("dragonmounts2:v_flight_manual_disable", undefined);
		dragon.setDynamicProperty("dragonmounts2:v_flight_disable_reason", reason || undefined);
	}

	if (!dragon.isInWater && !dragon.isOnGround) {
		dragon.setDynamicProperty("dragonmounts2:v_flight_landing", true);
		dragon.setDynamicProperty("dragonmounts2:v_flight_disable_blocked", true);
		dragon.setDynamicProperty("dragonmounts2:v_flight_slot", undefined);
		dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", undefined);
		dragon.setDynamicProperty("dragonmounts2:v_flight_activated", undefined);
		dragon.setDynamicProperty("dragonmounts2:v_flight_reserved", undefined);
		return;
	}

	dragon.triggerEvent("dragonmounts2:on_vflight_disable");
	restoreVFlightPreviousState(dragon);
	dragon.setDynamicProperty("dragonmounts2:v_flight_slot", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_activated", undefined);
	dragon.setDynamicProperty("dragonmounts2:v_flight_reserved", undefined);
}

function syncVFlightRotation(dragon, controllingDragon) {
	const rotation = controllingDragon.getRotation();
	if (!rotation) return;

	const currentRotation = dragon.getRotation?.();
	if (!shouldSyncRotation(currentRotation, rotation)) return;

	if (typeof dragon.setRotation === "function") {
		dragon.setRotation(rotation);
		return;
	}

	try {
		dragon.teleport(dragon.location, { dimension: dragon.dimension, rotation });
	} catch {
	}
}

function steerTowardVFlightSlot(dragon, targetPos, controllerSpeed) {
	const loc = dragon.location;
	const dx = targetPos.x - loc.x;
	const dy = targetPos.y - loc.y;
	const dz = targetPos.z - loc.z;
	const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

	if (dist > V_FLIGHT_SNAP_DISTANCE) {
		dragon.teleport(targetPos, { dimension: dragon.dimension });
		dragon.clearVelocity();
		return;
	}

	if (dist < V_FLIGHT_HOVER_DEADZONE && controllerSpeed < 0.08) {
		dragon.clearVelocity();
		return;
	}

	const slot = dragon.getDynamicProperty("dragonmounts2:v_flight_slot") ?? 0;
	const slotSpeedFactor = V_FLIGHT_SLOT_SPEED_FACTORS[slot] ?? 1.0;
	const baseSpeed = controllerSpeed * V_FLIGHT_SPEED_MULTIPLIER * slotSpeedFactor + V_FLIGHT_CRUISE_PAD;
	const overshoot = Math.max(0, dist - V_FLIGHT_ARRIVE_RADIUS);
	const catchUpBonus = Math.min(overshoot / V_FLIGHT_CATCHUP_RANGE, 1) * V_FLIGHT_CATCHUP_BONUS;
	let desiredSpeed = baseSpeed + catchUpBonus;
	if (dist < V_FLIGHT_ARRIVE_RADIUS) {
		desiredSpeed *= Math.max(dist / V_FLIGHT_ARRIVE_RADIUS, 0.18);
	}
	desiredSpeed = Math.min(desiredSpeed, V_FLIGHT_MAX_SPEED);
	if (desiredSpeed <= 0.01 || dist < 0.05) {
		dragon.clearVelocity();
		return;
	}

	const inv = desiredSpeed / dist;
	const desiredVel = { x: dx * inv, y: dy * inv, z: dz * inv };

	const smoothT = Math.min(dist / V_FLIGHT_CATCHUP_RANGE, 1);
	const steeringSmooth = V_FLIGHT_STEERING_SMOOTH_BASE +
		(V_FLIGHT_STEERING_SMOOTH_CATCHUP - V_FLIGHT_STEERING_SMOOTH_BASE) * smoothT;

	const currentVel = getSafeVelocity(dragon);
	const blended = {
		x: currentVel.x + (desiredVel.x - currentVel.x) * steeringSmooth,
		y: currentVel.y + (desiredVel.y - currentVel.y) * steeringSmooth,
		z: currentVel.z + (desiredVel.z - currentVel.z) * steeringSmooth
	};

	dragon.clearVelocity();
	dragon.applyImpulse(blended);
}
export function updateVFlightFollower(dragon) {
	if (!isVFlightRelevant(dragon)) return;
	if (updateVFlightLanding(dragon)) return;

	const ownerId = dragon.getDynamicProperty("dragonmounts2:owner_identifier");
	if (!ownerId) return;

	const owner = getPlayerById(ownerId);
	if (!owner?.isValid) return;
	if (owner.dimension.id !== dragon.dimension.id) return;

	const mountedDragon = owner.getComponent("minecraft:riding")?.entityRidingOn;
	let controllingDragon = null;

	if (mountedDragon?.isValid) {
		controllingDragon = mountedDragon;
		setVFlightController(dragon, mountedDragon);
	} else {
		const controllerPid = dragon.getDynamicProperty("dragonmounts2:v_flight_controller_pid");
		if (controllerPid) {
			controllingDragon = getDragonByPersistentId(dragon.dimension, controllerPid);
			if (!controllingDragon?.isValid) {
				dragon.setDynamicProperty("dragonmounts2:v_flight_controller_pid", undefined);
				controllingDragon = null;
			}
		}
	}

	if (!controllingDragon) {
		if (dragon.getProperty("dragonmounts2:v_flight_enabled") !== true) return;
		if (dragon.getProperty("dragonmounts2:movement_state") === "flying") {
			dragon.setDynamicProperty("dragonmounts2:v_flight_landing", true);
			updateVFlightLanding(dragon);
		}
		return;
}

	const controllerFlying = controllingDragon.getProperty("dragonmounts2:movement_state") === "flying";
	const isManuallyDisabled = dragon.getDynamicProperty("dragonmounts2:v_flight_manual_disable") === true;

	if (!controllerFlying) {
		if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true) {
			if (!isManuallyDisabled) {
				return;
			}
		}
		return;
}

	if (dragon.getProperty("dragonmounts2:v_flight_enabled") !== true) {
		if (isManuallyDisabled) return;
		if (dragon.getDynamicProperty("dragonmounts2:v_flight_disable_blocked") !== true) {
			startVFlight(dragon, ownerId, dragon.dimension, controllingDragon);
		}
	}

	if (dragon.getProperty("dragonmounts2:v_flight_enabled") !== true) return;

	const movementState = dragon.getProperty("dragonmounts2:movement_state");
	if (movementState !== "flying") {
		dragon.setProperty("dragonmounts2:movement_state", "flying");
	}

	syncVFlightRotation(dragon, controllingDragon);

	const inWater = isInWater(dragon) || isInWater(controllingDragon);
	if (inWater) {
		disableVFlight(dragon);
		return;
	}

	const controllerVelocity = getSafeVelocity(controllingDragon);
	const controllerSpeed = Math.sqrt(
		controllerVelocity.x * controllerVelocity.x +
		controllerVelocity.y * controllerVelocity.y +
		controllerVelocity.z * controllerVelocity.z
	);
	const slot = dragon.getDynamicProperty("dragonmounts2:v_flight_slot") ?? 0;
	const targetPos = computeVFlightSlotPosition(controllingDragon, slot);
	const resolvedTargetPos = resolveVFlightObstacleTarget(dragon, controllingDragon, targetPos);
	steerTowardVFlightSlot(dragon, resolvedTargetPos, controllerSpeed);
}
export function updateElytraFollow(dragon) {
	if (!dragon?.isValid) return;
	if (dragon.getProperty("dragonmounts2:elytra_follow_enabled") !== true) return;
	
	const dragonId = getPersistentId(dragon);
	const tracking = elytraFollowTracking.get(dragonId);
	if (!tracking) {
		deactivateElytraFollow(dragon);
		return;
	}

	const player = getPlayerById(tracking.playerId);
	if (!player?.isValid || !player.isGliding || player.dimension.id !== dragon.dimension.id) {
		deactivateElytraFollow(dragon);
		return;
	}

	if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") {
		dragon.setProperty("dragonmounts2:movement_state", "flying");
	}
	if (dragon.getProperty("dragonmounts2:is_following") === true) {
		dragon.setProperty("dragonmounts2:is_following", false);
	}
	const dragonLoc = dragon.location;
	const playerLoc = player.location;
	const dx = playerLoc.x - dragonLoc.x;
	const dy = playerLoc.y - dragonLoc.y;
	const dz = playerLoc.z - dragonLoc.z;
	const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
	if (dist > 100) {
		try {
			dragon.teleport(
				{ x: playerLoc.x, y: playerLoc.y + 5, z: playerLoc.z },
				{ dimension: dragon.dimension }
			);
		} catch (e) { }
		return;
	}
	if (dist < 2.5) {
		dragon.clearVelocity();
		return;
	}
	const playerVel = getSafeVelocity(player);
	const playerSpeed = Math.sqrt(playerVel.x * playerVel.x + playerVel.y * playerVel.y + playerVel.z * playerVel.z);
	let desiredSpeed = playerSpeed;
	const overshoot = Math.max(0, dist - 2.0);
	const catchupBonus = Math.min(overshoot / 12, 1) * 4.0;
	desiredSpeed = desiredSpeed + catchupBonus;
	if (dist < 3.5) {
		desiredSpeed *= Math.max(dist / 3.5, 0.1);
	}
	
	desiredSpeed = Math.min(desiredSpeed, 12);
	
	if (desiredSpeed <= 0.01 || dist < 0.1) {
		dragon.clearVelocity();
		return;
	}
	const inv = desiredSpeed / dist;
	const desiredVel = { x: dx * inv, y: dy * inv, z: dz * inv };
	const smoothBase = 0.12;
	const smoothCatchup = 0.35;
	const smoothT = Math.min(dist / 20, 1);
	const steeringSmooth = smoothBase + (smoothCatchup - smoothBase) * smoothT;
	const currentVel = getSafeVelocity(dragon);
	const blended = {
		x: currentVel.x + (desiredVel.x - currentVel.x) * steeringSmooth,
		y: currentVel.y + (desiredVel.y - currentVel.y) * steeringSmooth,
		z: currentVel.z + (desiredVel.z - currentVel.z) * steeringSmooth
	};
	dragon.clearVelocity();
	dragon.applyImpulse(blended);
	const currentRotation = dragon.getRotation?.();
	const lookDirection = { x: dx, y: dy, z: dz };
	const desiredRotation = rotationFromDirection(lookDirection);
	if (desiredRotation && shouldSyncRotation(currentRotation, desiredRotation)) {
		applyRotation(dragon, desiredRotation);
	}
}

export function getDragonByPersistentId(dimension, pid) {
	if (!dimension || !pid) return null;
	const entities = dimension.getEntities(dragonTypes);
	for (const entity of entities) {
		if (entity?.isValid && getPersistentId(entity) === pid) return entity;
	}
	return null;
}

function resetPlayerFallRescue(playerId) {
	const data = fallRescueData.get(playerId);
	if (!data) return;
	data.rescueScheduled = false;
	data.rescueDragonPid = undefined;
	fallRescueData.set(playerId, data);
}

function markPlayerRodeDragon(player, dragon) {
	if (!player?.isValid || !dragon?.isValid) return;
	const data = getPlayerFallData(player);
	const pid = getPersistentId(dragon);
	data.recentDragonPid = pid;
	data.recentDragonTick = system.currentTick;
	fallRescueData.set(player.id, data);
}

function shouldTrackPlayerFall(player) {
	if (!player?.isValid) return false;
	if (player.isGliding) return false;
	if (player.isInWater) return false;
	if (player.getComponent("minecraft:riding")?.entityRidingOn) return false;
	return !player.isOnGround;
}

function isDragonInAirAbovePlayer(player, dragon) {
	if (!dragon?.isValid || !player?.isValid) return false;
	if (dragon.isOnGround) return false;
	try {
		const dy = dragon.location.y - player.location.y;
		return dy > 1.0;
	} catch (e) {
		return false;
	}
}

function getNearestOwnedRescueDragon(player) {
	if (!player?.isValid) return null;
	const data = getPlayerFallData(player);
	if (!data.recentDragonPid || system.currentTick - data.recentDragonTick > FALL_RESCUE_MAX_RECENT_TICKS) return null;

	const dragon = getDragonByPersistentId(player.dimension, data.recentDragonPid);
	if (!dragon?.isValid) return null;
	if (dragon.getDynamicProperty("dragonmounts2:owner_identifier") !== player.id) return null;
	if (!isDragonInAirAbovePlayer(player, dragon)) return null;
	const rideable = dragon.getComponent("rideable");
	if (!rideable) return null;
	const riders = rideable.getRiders();
	if (riders && riders.length > 0) return null;
	if (dragon.getProperty("dragonmounts2:elytra_follow_enabled") === true) return null;
	if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true) return null;

	const dx = dragon.location.x - player.location.x;
	const dy = dragon.location.y - player.location.y;
	const dz = dragon.location.z - player.location.z;
	const distSq = dx * dx + dy * dy + dz * dz;
	if (distSq > FALL_RESCUE_SEARCH_RADIUS * FALL_RESCUE_SEARCH_RADIUS) return null;

	return dragon;
}

function getPlayerFallData(player) {
	let data = fallRescueData.get(player.id);
	if (!data) {
		data = {
			startTick: system.currentTick,
			startY: player.location.y,
			maxY: player.location.y,
			lastY: player.location.y,
			rescueScheduled: false,
			rescueDragonPid: undefined,
			recentDragonPid: undefined,
			recentDragonTick: 0,
			fallStartTick: 0,
			fallStartY: player.location.y
		};
		fallRescueData.set(player.id, data);
	}
	return data;
}

function predictPlayerRescuePosition(player, extraTicks = 0) {
	if (!player?.isValid) return null;
	const loc = player.location;
	const velocity = getSafeVelocity(player);
	const ticksAhead = Math.max(4, FALL_RESCUE_DELAY_TICKS + extraTicks);
	return {
		x: loc.x + velocity.x * ticksAhead,
		y: loc.y + velocity.y * ticksAhead,
		z: loc.z + velocity.z * ticksAhead
	};
}

function requestPlayerRescue(player, dragon) {
	const data = getPlayerFallData(player);
	if (data.rescueScheduled) return;
	const pid = getPersistentId(dragon);
	data.rescueScheduled = true;
	data.rescueDragonPid = pid;
	fallRescueData.set(player.id, data);

	system.runTimeout(() => {
		executePlayerRescue(player.id, pid);
	}, FALL_RESCUE_DELAY_TICKS);
}

function executePlayerRescue(playerId, dragonPid) {
	const player = getPlayerById(playerId);
	const data = fallRescueData.get(playerId);
	if (!player?.isValid || !data || data.rescueDragonPid !== dragonPid) {
		resetPlayerFallRescue(playerId);
		return;
	}
	if (player.isOnGround || player.isGliding || player.isInWater || player.getComponent("minecraft:riding")?.entityRidingOn) {
		resetPlayerFallRescue(playerId);
		return;
	}

	const dragon = getDragonByPersistentId(player.dimension, dragonPid);
	if (!dragon?.isValid) {
		resetPlayerFallRescue(playerId);
		return;
	}

	const rideable = dragon.getComponent("rideable");
	if (!rideable || (rideable.getRiders()?.length ?? 0) > 0) {
		resetPlayerFallRescue(playerId);
		return;
	}

	const playerLoc = player.location;
	const predictedTarget = predictPlayerRescuePosition(player, 8) ?? playerLoc;
	const verticalLead = Math.max(2.5, Math.min(7.5, Math.max(0, playerLoc.y - predictedTarget.y) * 0.5 + 2.5));
	const teleportPos = {
		x: predictedTarget.x,
		y: Math.max(predictedTarget.y + verticalLead, playerLoc.y + 3.0),
		z: predictedTarget.z
	};
	try {
		dragon.teleport(teleportPos, { dimension: dragon.dimension });
	} catch (e) {
	}
	if (dragon.getProperty("dragonmounts2:movement_state") !== "flying") {
		dragon.setProperty("dragonmounts2:movement_state", "flying");
	}
	try {
		dragon.triggerEvent("minecraft:on_flying");
	} catch (e) {
	}
	try {
		dragon.clearVelocity();
	} catch (e) {
	}

	try {
		dragon.runCommand(`ride @a[name=${player.name}] start_riding @s`);
	} catch (e) {
		player.runCommand(`ride @s start_riding @e[type=${dragon.typeId},c=1,sort=nearest]`);
	}

	resetPlayerFallRescue(playerId);
}

export function tickFallRescue() {
	for (const player of world.getAllPlayers()) {
		if (!player?.isValid) continue;
		const data = getPlayerFallData(player);
		if (!shouldTrackPlayerFall(player)) {
			resetPlayerFallRescue(player.id);
			continue;
		}

		const loc = player.location;
		data.maxY = Math.max(data.maxY, loc.y);
		const velocity = getSafeVelocity(player);
		const falling = velocity.y < -0.1 || loc.y < data.lastY - 0.02;
		const fallHeight = data.maxY - loc.y;
		const shouldRescue = falling && (fallHeight >= FALL_RESCUE_MIN_FALL_HEIGHT || velocity.y <= -0.6) && system.currentTick - data.startTick >= FALL_RESCUE_MIN_FALL_TICKS;
		if (shouldRescue) {
			const healthComp = player.getComponent("minecraft:health");
			const currentHealth = healthComp?.currentValue ?? 20;
			const projectedDamage = Math.max(0, Math.floor(fallHeight - 3));
			if (projectedDamage >= currentHealth) {
				const dragon = getNearestOwnedRescueDragon(player);
				if (dragon) {
					requestPlayerRescue(player, dragon);
				}
			}
		}
		data.lastY = loc.y;
		fallRescueData.set(player.id, data);
	}
}

export function getPersistentId(entity) {
	if (!entity?.isValid) return null;
	let pid = entity.getDynamicProperty("dragonmounts2:persistent_id");
	if (!pid) {
		pid = `${entity.typeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		entity.setDynamicProperty("dragonmounts2:persistent_id", pid);
	}
	return pid;
}
function shouldProcessDragon(dragon) {
	if (!dragon?.isValid) return false;
	if (dragon.getProperty("dragonmounts2:is_breathing") === true) return true;
	if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true) return true;
	if (dragon.getProperty("dragonmounts2:elytra_follow_enabled") === true) return true;
	const rideable = dragon.getComponent("rideable");
	if (rideable?.getRiders?.().length > 0) return true;
	return false;
}

export function dragonsMainComponents(dragon) {
	if (!dragon?.isValid) return;
	const dragonOnList = dragonArrays.dragonTypesList.includes(dragon.typeId);
	if (!dragonOnList) return;
	if (!shouldProcessDragon(dragon)) return;
	const isBreathing = dragon.getProperty("dragonmounts2:is_breathing");
	const rideable = dragon.getComponent("rideable");
	const tameable = dragon.getComponent("minecraft:tameable");

	if (tameable?.isTamed) {
		const ownerName = tameable.tamedToPlayer?.name ?? "Unknown";
		const ownerIdentifier = tameable.tamedToPlayerId ?? "";
		dragon.setDynamicProperty("dragonmounts2:owner_name", ownerName);
		dragon.setDynamicProperty("dragonmounts2:owner_identifier", ownerIdentifier);
	}
	if (!rideable) return;
	const riders = rideable.getRiders();
	if (!riders || riders.length === 0) {
		if (isBreathing) dragon.setProperty("dragonmounts2:is_breathing", false);
		if (dragon.getProperty("dragonmounts2:elytra_follow_enabled") === true) {
			updateElytraFollow(dragon);
			return;
		}
		const lastRiderId = dragon.getDynamicProperty("dragonmounts2:last_rider_id");
		const lastRiddenTick = dragon.getDynamicProperty("dragonmounts2:last_ridden_tick") || 0;
		const now = system.currentTick;

		if (lastRiderId && now - lastRiddenTick < 40) {
			const player = getPlayerById(lastRiderId);
			if (player?.isValid && player.dimension.id === dragon.dimension.id && player.isGliding) {
				if (activateElytraFollow(dragon, player.id)) {
					updateElytraFollow(dragon);
					return;
				}
			}
		}
		// Autonomous breath is intentionally disabled; the old manual breath system is the active behavior.
		handleDragonBreathProjectile(dragon, null);
		updateVFlightFollower(dragon);
		return;
	}

	const controllingSeat = rideable.controllingSeat;
	const controllingRider = riders[controllingSeat];
	if (!controllingRider || !(controllingRider instanceof Player)) return;
	dragon.setDynamicProperty("dragonmounts2:last_rider_id", controllingRider.id);
	dragon.setDynamicProperty("dragonmounts2:last_ridden_tick", system.currentTick);
	markPlayerRodeDragon(controllingRider, dragon);

	// Use the classic manual breath system. Autonomous breath is deferred and not active here.
	stopAutonomousBreath(dragon);
	handleDragonJumpInput(dragon, controllingRider, isBreathing);
	handleDragonBreathProjectile(dragon, controllingRider);
	applyMountedDirectionalMovement(dragon, controllingRider);
	cleanupOldJumpData();
}

function cleanupOldJumpData() {
	const now = system.currentTick;
	if (now - lastCleanup < CLEANUP_INTERVAL) return;
	lastCleanup = now;
	for (const [id, data] of jumpData.entries()) {
		if (now - data.lastJumpTick > CLEANUP_INTERVAL * 2) {
			jumpData.delete(id);
		}
	}
}

function handleDragonJumpInput(dragon, player, isBreathing) {
	const id = player.id;
	const currentTick = system.currentTick;
	let data = jumpData.get(id);
	if (!data) {
		data = {
			wasJumping: false,
			holdTime: 0,
			lastJumpTick: 0,
			pendingSingle: false
		};
	}
	const isJumping = player.isJumping;
	const doubleTapWindow = 10;
	const holdThreshold = 5;

	if (isJumping && !data.wasJumping) {
		const timeSinceLastJump = currentTick - data.lastJumpTick;
		if (timeSinceLastJump < doubleTapWindow) {
			if (dragon.isOnGround) dragon.applyImpulse({ x: 0, y: 0.75, z: 0 });
			data.pendingSingle = false;
		} else {
			data.pendingSingle = true;
		}
		data.lastJumpTick = currentTick;
	}

	if (isJumping) {
		data.holdTime++;
		if (data.holdTime === holdThreshold) {
			data.pendingSingle = false;
			if (!isBreathing) dragon.setProperty("dragonmounts2:is_breathing", true);
		}
		if (data.holdTime > holdThreshold) {
			if (!isBreathing) dragon.setProperty("dragonmounts2:is_breathing", true);
		}
	} else {
		if (isBreathing) dragon.setProperty("dragonmounts2:is_breathing", false);
		data.holdTime = 0;
	}

	if (data.pendingSingle && currentTick - data.lastJumpTick > holdThreshold && currentTick - data.lastJumpTick > doubleTapWindow) {
		data.pendingSingle = false;
	}
	data.wasJumping = isJumping;
	jumpData.set(id, data);
}
