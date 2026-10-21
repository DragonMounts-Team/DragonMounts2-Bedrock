import { EquipmentSlot, Player, system, world } from "@minecraft/server";
import * as settings from "../data/settings.js";
import * as entityData from "../data/entity_data.js";
import {
  getDragonProjectileAbility,
  isAttackReady,
  getRiderAimDirection,
  launchDragonProjectile,
  stopDragonBreathAudio,
  startAttackCooldown,
  tickDragonCombat,
} from "./combat_utilities.js";
import {
  distanceBetween,
  getPersistentId,
  getSafeVelocity,
} from "./entity_utilities.js";
import * as formationOrder from "./formation_order.js";
import { spawnParticle } from "./particle_utilities.js";

const flightSystem = (() => {
  const FlightMode = entityData.FLIGHT_MODES;
  const MODE_PRIORITY = entityData.MODE_PRIORITY;
  const FLIGHT = "dragonmounts2:";
  const FIREBALL_POWER_RAMP_TICKS = 20;
  const ATTACK_INTERACTION_PROPERTY = "dragonmounts2:attack_interaction_id";
  const RIDER_ATTACK_MODES = ["breath", "fireball", "none"];
  const runtime = new WeakMap();
  const FLOCK_CACHE = new Map();
  const V_FLIGHT_DRAGON_CACHE = { tick: -1, dimensions: new Map() };

  function safe(action, fallback = undefined) {
    try {
      return action();
    } catch {
      return fallback;
    }
  }

  function riderHandsFree(rider) {
    return safe(() => {
      const slot = rider
        .getComponent("minecraft:equippable")
        ?.getEquipmentSlot(EquipmentSlot.Mainhand);
      const item = slot?.getItem();
      return !item || item.typeId === "minecraft:air";
    }, true);
  }

  function property(entity, name, fallback = undefined) {
    return safe(() => entity.getProperty(name), fallback) ?? fallback;
  }

  function setProperty(entity, name, value) {
    safe(() => entity.setProperty(name, value));
  }

  function dynamic(entity, name, fallback = undefined) {
    return safe(() => entity.getDynamicProperty(name), fallback) ?? fallback;
  }

  function setDynamic(entity, name, value) {
    safe(() => entity.setDynamicProperty(name, value));
  }

  function ridersOf(dragon) {
    return safe(() => dragon.getComponent("rideable")?.getRiders?.(), []) ?? [];
  }

  function recordTransition(state, kind, from, to, reason) {
    state.lastTransition = { tick: system.currentTick, kind, from, to, reason };
  }

  function setMovement(dragon, next, reason = "", force = false) {
    const state = data(dragon);
    const current = property(dragon, `${FLIGHT}movement_state`);
    if (current === next && !force) {
      if (next === "flying" && !state.flightControlsDetached) {
        safe(() => dragon.triggerEvent("dragonmounts2:on_flight_control_reset"));
        state.flightControlsDetached = true;
      }
      return false;
    }
                                                                               
                                                                     
    if (current === next) {
      setProperty(dragon, `${FLIGHT}movement_state`, next === "flying" ? "grounded" : "flying");
    }
    const event = next === "flying"
      ? "minecraft:on_flying"
      : next === "swimming"
        ? "minecraft:on_swimming"
        : "minecraft:on_grounded";
    safe(() => dragon.triggerEvent(event));
    setProperty(dragon, `${FLIGHT}movement_state`, next);
    state.flightControlsDetached = next === "flying";
    state.groundedTicks = 0;
    recordTransition(state, "movement", current ?? "unknown", next, reason);
    return true;
  }

  function setCombatIntent(dragon, intent) {
    if (!dragon?.isValid) return;
    data(dragon).combatIntent = intent;
  }

  function findPlayer(playerId) {
    return playerId ? getPlayerById(playerId) : null;
  }

  function getDimensionDragons(dimension) {
    if (!dimension?.id) return [];
    const currentTick = system.currentTick;
    if (V_FLIGHT_DRAGON_CACHE.tick !== currentTick) {
      V_FLIGHT_DRAGON_CACHE.tick = currentTick;
      V_FLIGHT_DRAGON_CACHE.dimensions.clear();
    }
    if (V_FLIGHT_DRAGON_CACHE.dimensions.has(dimension.id)) {
      return V_FLIGHT_DRAGON_CACHE.dimensions.get(dimension.id);
    }
    const dragons = safe(() => dimension.getEntities({ families: ["dragon"] }), [])
      .filter((dragon) => dragon?.isValid);
    V_FLIGHT_DRAGON_CACHE.dimensions.set(dimension.id, dragons);
    return dragons;
  }

  function updateCrystalHealing(dragon, state) {
    const crystalIsUnavailable = state.crystal &&
      (!state.crystal.isValid ||
        state.crystal.dimension.id !== dragon.dimension.id ||
        distanceBetween(state.crystal.location, dragon.location) > 32);
    if (
      crystalIsUnavailable ||
      system.currentTick >= state.nextCrystalScanTick
    ) {
      const crystals = safe(
        () => dragon.dimension.getEntities({
          type: "minecraft:ender_crystal",
          location: dragon.location,
          maxDistance: 32,
        }),
        [],
      );
      state.crystal = crystals.reduce((nearest, crystal) =>
        !nearest ||
          distanceBetween(crystal.location, dragon.location) <
            distanceBetween(nearest.location, dragon.location)
          ? crystal
          : nearest
      , null);
      state.nextCrystalScanTick = system.currentTick + 20;
    }
    if (!state.crystal?.isValid) {
      state.crystalTicks = 0;
      return;
    }

    state.crystalTicks += 1;
    const health = safe(() => dragon.getComponent("minecraft:health"), null);
    const currentHealth = Number(health?.currentValue);
    const maximumHealth = Number(health?.effectiveMax ?? health?.defaultValue);
    if (
      state.crystalTicks > 0 &&
      Number.isFinite(currentHealth) &&
      Number.isFinite(maximumHealth) &&
      currentHealth < maximumHealth
    ) {
      state.crystalTicks = -10;
      safe(() => health.setCurrentValue(Math.min(maximumHealth, currentHealth + 1)));
      safe(() => dragon.addEffect("strength", 300, {
        amplifier: 0,
        showParticles: false,
      }));
    }
  }

  function launchRiderFireball(dragon, rider, chargeTicks) {
    if (!dragon?.isValid || !rider?.isValid) {
      throw new Error("Dragon or rider is no longer available");
    }
    const direction = getRiderAimDirection(dragon, rider);
    const chargePower = Math.min(
      1,
      (chargeTicks - getDragonProjectileAbility(dragon).minChargeTicks) /
        FIREBALL_POWER_RAMP_TICKS,
    );
    launchDragonProjectile(dragon, direction, chargePower);
  }

  function cycleRiderAttackMode(dragon, player) {
    const tameable = safe(() => dragon?.getComponent("minecraft:tameable"));
    const ownerId = tameable?.tamedToPlayerId ||
      dynamic(dragon, `${FLIGHT}owner_identifier`);
    if (
      !dragon?.isValid ||
      !entityData.dragonTypeIds.has(dragon.typeId) ||
      !player?.isValid ||
      !ownerId ||
      player.id !== ownerId ||
      !ridersOf(dragon).some((rider) => rider.id === player.id)
    ) return false;
    const state = data(dragon);
    if (state.attackModeCycleQueued) return true;
    state.attackModeCycleQueued = true;
    system.runTimeout(() => {
      state.attackModeCycleQueued = false;
      const currentTameable = safe(() =>
        dragon?.getComponent("minecraft:tameable"),
      );
      const currentOwnerId = currentTameable?.tamedToPlayerId ||
        dynamic(dragon, `${FLIGHT}owner_identifier`);
      if (
        !dragon?.isValid ||
        !player?.isValid ||
        player.id !== currentOwnerId ||
        !ridersOf(dragon).some((rider) => rider.id === player.id)
      ) return;

      const currentMode = property(
        dragon,
        `${FLIGHT}rider_attack_mode`,
        "breath",
      );
      const currentIndex = RIDER_ATTACK_MODES.indexOf(currentMode);
      const nextMode =
        RIDER_ATTACK_MODES[(currentIndex + 1) % RIDER_ATTACK_MODES.length];
      try {
        dragon.setProperty(`${FLIGHT}rider_attack_mode`, nextMode);
        system.runTimeout(() => {
          if (
            dragon?.isValid &&
            property(dragon, `${FLIGHT}rider_attack_mode`) !== nextMode
          ) {
            console.warn(
              `[DragonMounts2] Rider attack mode did not update for ${dragon.typeId}: expected ${nextMode}, got ${property(dragon, `${FLIGHT}rider_attack_mode`, "unknown")}`,
            );
          }
        }, 1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[DragonMounts2] Failed to change rider attack mode: ${message}`,
        );
        return;
      }
      setProperty(dragon, `${FLIGHT}is_breathing`, false);
      stopDragonBreathAudio(dragon);
      state.fireballChargeTicks = 0;
      if (dragon.typeId === "dragonmounts2:fire_dragon") {
        setProperty(dragon, `${FLIGHT}is_fireball_charging`, false);
      }
      const modeName = nextMode === "none"
        ? "Attack: Off"
        : nextMode === "fireball"
          ? `Attack: ${getDragonProjectileAbility(dragon).name}`
          : "Attack: Breath";
      player.onScreenDisplay.setActionBar({ rawtext: [{ text: modeName }] });
    }, 1);
    return true;
  }

  function cleanupRiderAttackProxy(dragon) {
    const state = data(dragon);
    const savedId = dynamic(dragon, ATTACK_INTERACTION_PROPERTY);
    const target = state.attackInteraction?.isValid
      ? state.attackInteraction
      : savedId
        ? safe(() => dragon.dimension.getEntities({
          families: ["dragonmounts2_interaction_proxy"],
        }).find((entity) => entity.id === savedId))
        : null;
    if (target?.isValid) safe(() => target.remove());
    state.attackInteraction = null;
    if (savedId) {
      safe(() => dragon.setDynamicProperty(ATTACK_INTERACTION_PROPERTY, undefined));
    }
  }

  function sweepOrphanedAttackProxies() {
    for (const dimensionId of ["overworld", "nether", "the_end"]) {
      const dimension = safe(() => world.getDimension(dimensionId), null);
      if (!dimension) continue;
      const proxies = safe(
        () => dimension.getEntities({ families: ["dragonmounts2_interaction_proxy"] }),
        [],
      );
      if (!proxies.length) continue;
      const inUse = new Set();
      for (const dragon of safe(() => dimension.getEntities(dragonTypes), [])) {
        if (!dragon?.isValid) continue;
        const id = dynamic(dragon, ATTACK_INTERACTION_PROPERTY);
        if (id && ridersOf(dragon).length) inUse.add(id);
      }
      for (const proxy of proxies) {
        if (proxy?.isValid && !inUse.has(proxy.id)) safe(() => proxy.remove());
      }
    }
  }

  function updateRiderAttackProxy(dragon, rider) {
    const state = data(dragon);
    const ownerId = safe(
      () => dragon.getComponent("minecraft:tameable")?.tamedToPlayerId,
    ) || dynamic(dragon, `${FLIGHT}owner_identifier`);
    if (!rider?.isValid || rider.id !== ownerId || !riderHandsFree(rider)) {
                                                                                 
                                                 
      cleanupRiderAttackProxy(dragon);
      return;
    }
    let proxy = state.attackInteraction;
    if (!proxy?.isValid || proxy.dimension.id !== dragon.dimension.id) {
      cleanupRiderAttackProxy(dragon);
      proxy = null;
      try {
        proxy = dragon.dimension.spawnEntity(
          "dragonmounts2:attack_interaction",
          dragon.location,
        );
        state.attackInteraction = proxy;
        dragon.setDynamicProperty(ATTACK_INTERACTION_PROPERTY, proxy.id);
      } catch (error) {
        if (proxy?.isValid) proxy.remove();
        state.attackInteraction = null;
        const message = error instanceof Error ? error.message : String(error);
        const failure = `create rider interaction target: ${message}`;
        if (state.attackInteractionError !== failure) {
          console.warn(`[DragonMounts2] ${failure}`);
          state.attackInteractionError = failure;
        }
        return;
      }
    }
    const head = safe(() => rider.getHeadLocation(), rider.location);
    const view = safe(() => rider.getViewDirection(), null);
    if (!head || !view) return;
    try {
      proxy.teleport({
        x: head.x + view.x * 2.5,
        y: head.y + view.y * 2.5,
        z: head.z + view.z * 2.5,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = `position rider interaction target: ${message}`;
      if (state.attackInteractionError !== failure) {
        console.warn(`[DragonMounts2] ${failure}`);
        state.attackInteractionError = failure;
      }
      cleanupRiderAttackProxy(dragon);
      return;
    }
    state.attackInteractionError = null;
  }

  function resetRiderInputState(dragon, state) {
    state.jumpWasDown = false;
    state.firstJumpTick = -1;
    state.fireballChargeTicks = 0;
    setProperty(dragon, `${FLIGHT}is_fireball_charging`, false);
  }

  function noteModeChange(state, mode) {
    if (state.lastMode === mode) return;
    recordTransition(state, "mode", state.lastMode ?? "none", mode, "");
    state.lastMode = mode;
  }

  function updateRider(dragon, rider) {
    const state = data(dragon);
    const jumping = rider.isJumping === true;
    const wasJumping = state.jumpWasDown;
    const jumpStarted = jumping && !wasJumping;
    const jumpReleased = !jumping && wasJumping;
    state.jumpWasDown = jumping;
    if (property(dragon, `${FLIGHT}ai_breath_active`) === true) {
      setProperty(dragon, `${FLIGHT}ai_breath_active`, false);
    }
    const tameable = safe(() => dragon.getComponent("minecraft:tameable"));
    const canAttack = tameable?.isTamed === true && isTrusted(dragon) &&
      safe(() => dragon.hasComponent("minecraft:is_saddled")) === true;
    const attackMode = property(dragon, `${FLIGHT}rider_attack_mode`, "breath");
    const attackInputActive = jumping && canAttack &&
      (attackMode === "breath" || attackMode === "fireball");
    if (jumpStarted && dragon.isOnGround && !attackInputActive) {
                                                                                
                                            
      safe(() => dragon.applyImpulse({ x: 0, y: JAVA_JUMP_POWER, z: 0 }));
    }
    const projectileAbility = getDragonProjectileAbility(dragon);
    const canBreathe = canAttack &&
      attackMode === "breath" &&
      property(dragon, `${FLIGHT}age_variant`, "adult") !== "baby" &&
      !dragon.isInWater;
    const isFireDragon = dragon.typeId === "dragonmounts2:fire_dragon";
    const maximumChargeTicks =
      projectileAbility.minChargeTicks + FIREBALL_POWER_RAMP_TICKS;
    const wasBreathing =
      property(dragon, `${FLIGHT}is_breathing`, false) === true;
    if (!canBreathe) {
      setProperty(dragon, `${FLIGHT}is_breathing`, false);
    } else {
      state.fireballChargeTicks = 0;
      if (isFireDragon) setProperty(dragon, `${FLIGHT}is_fireball_charging`, false);
      setProperty(dragon, `${FLIGHT}is_breathing`, jumping);
    }
    if (wasBreathing && (!canBreathe || !jumping)) {
      stopDragonBreathAudio(dragon);
    }
    if (attackMode === "fireball" && canAttack) {
      if (jumping) {
        state.fireballChargeTicks = Math.min(
          maximumChargeTicks,
          state.fireballChargeTicks + 1,
        );
        if (isFireDragon) {
          setProperty(
            dragon,
            `${FLIGHT}is_fireball_charging`,
            state.fireballChargeTicks >= projectileAbility.minChargeTicks,
          );
        }
      } else {
        if (isFireDragon) {
          setProperty(dragon, `${FLIGHT}is_fireball_charging`, false);
        }
        const chargeTicks = state.fireballChargeTicks;
        state.fireballChargeTicks = 0;
        if (
          jumpReleased &&
          chargeTicks >= projectileAbility.minChargeTicks &&
          isAttackReady(dragon, "fireball")
        ) {
          try {
            launchRiderFireball(dragon, rider, chargeTicks);
            startAttackCooldown(
              dragon,
              "fireball",
              projectileAbility.cooldownTicks,
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[DragonMounts2] Rider projectile launch failed: ${message}`);
          }
        }
      }
    } else {
      state.fireballChargeTicks = 0;
      if (isFireDragon) setProperty(dragon, `${FLIGHT}is_fireball_charging`, false);
    }
    if (!canAttack) return;
    if (property(dragon, `${FLIGHT}movement_state`) !== "flying") return;
    const input = safe(() => rider.inputInfo?.getMovementVector?.());
    if (!input) return;
    const forwardInput = Number(input.y ?? input.z ?? 0);
    const strafeInput = Number(input.x ?? 0);
    if (!Number.isFinite(forwardInput) || !Number.isFinite(strafeInput)) return;
    rideAir(dragon, rider, strafeInput, forwardInput, settings.getPlayerDragonSpeed(rider), attackInputActive);
  }

  function describeDragon(dragon) {
    const state = data(dragon);
    const last = state.lastTransition;
    const lastText = last
      ? `${last.kind} ${last.from}>${last.to}${last.reason ? ` (${last.reason})` : ""} ${system.currentTick - last.tick}t ago`
      : "no transitions";
    const name = dragon.typeId.replace("dragonmounts2:", "").replace("_dragon", "");
    return `${name}: ${currentMode(dragon)}/${property(dragon, `${FLIGHT}movement_state`, "?")} [${lastText}]`;
  }

                                                                             
                                   
  function ownerSlotsLine(player) {
    const cached = FLOCK_CACHE.get(player.id);
    if (!cached || system.currentTick - cached.tick > 20) return null;
    const names = cached.members.map((dragon, index) =>
      `${index + 1}:${dragon?.isValid ? (dragon.nameTag || dragon.typeId.replace("dragonmounts2:", "").replace("_dragon", "")) : "-"}`);
    return `slots ${names.join(" ")}`;
  }

                                                                    
  function ownerDebugLine(player) {
    const fall = fallStates.get(player.id);
    if (!fall) return null;
    const record = CATCHER.get(player.id);
    const catcher = record?.dragonId
      ? getDimensionDragons(player.dimension).find((dragon) => dragon.id === record.dragonId)
      : null;
    const sinceRelease = fall.dismount
      ? system.currentTick - fall.dismount.tick
      : fall.fallStart ? system.currentTick - fall.fallStart : 0;
    const parts = [
      `${fall.motion}/${fall.intent}`,
      `catcher=${catcher ? catcher.typeId.replace("dragonmounts2:", "").replace("_dragon", "") : "-"}`,
      `release=${sinceRelease}t`,
      `fall=${fall.distance.toFixed(1)}`,
      `urgency=${(record?.urgency ?? 0).toFixed(2)}`,
      `closing=${(record?.closing ?? 0).toFixed(2)}`,
      `captured=${fall.telemetry ? `${fall.telemetry.capturedAfter}t` : "-"}`,
    ];
    return parts.join(" ");
  }

  function debugLines(player) {
    const lines = [];
    const ownerLine = ownerDebugLine(player);
    if (ownerLine) lines.push(ownerLine);
    const slots = ownerSlotsLine(player);
    if (slots) lines.push(slots);
    const mount = safe(() => player.getComponent("minecraft:riding")?.entityRidingOn, null);
    if (mount?.isValid && entityData.dragonTypeIds.has(mount.typeId)) {
      lines.push(describeDragon(mount));
    }
    for (const dragon of getDimensionDragons(player.dimension)) {
      if (lines.length >= 4) break;
      if (
        !dragon?.isValid || dragon.id === mount?.id ||
        !entityData.dragonTypeIds.has(dragon.typeId) ||
        !isDragonOwnedByPlayer(dragon, player.id) ||
        distanceBetween(dragon.location, player.location) > 64
      ) continue;
      if (currentMode(dragon) === FlightMode.GROUNDED && !data(dragon).lastTransition) continue;
      lines.push(describeDragon(dragon));
    }
    return lines;
  }
                                                                                
                                                                    
                                                                                
  const {
    LIFTOFF_THRESHOLD,
    NEAR_GROUND_FACTOR,
    JAVA_JUMP_POWER,
    JAVA_DRAGON_WIDTH,
    JAVA_DRAGON_HEIGHT,
    JUVENILE_SIZE,
    FLOCK_RADIUS,
    MAX_FLIGHT_RANK,
    FLIGHT_CRUISE_SPEED,
    FLIGHT_RESPONSE,
    DISMOUNT_SNEAK_GRACE,
    FORMATION_MAX_DRAGONS,
    RIDDEN_BASE_SPEED,
    RIDDEN_RESPONSE,
    RIDE_MOMENTUM_GAIN,
    RIDE_MOMENTUM_DECAY,
    RIDE_TURN_BLEED,
    RIDE_SPEED_LOW,
    RIDE_SPEED_HIGH,
    RIDE_DIVE_BONUS,
    RIDE_CLIMB_PENALTY,
    RIDE_ACCEL_RESPONSE,
    RIDE_BRAKE_RESPONSE,
    RIDE_MAX_SPEED,
    DISMOUNT_CATCH_TICKS,
    CATCH_MIN_FALL,
    CATCH_REACTION_CALM,
    CATCH_REACTION_URGENT,
    CATCH_CLOSING_CALM,
    CATCH_CLOSING_URGENT,
    CATCH_CLOSING_RAMP_TICKS,
    CATCH_CLOSING_RAMP_URGENT,
    CATCH_CAPTURE_RADIUS,
    CATCH_FAILSAFE_RADIUS,
    CATCH_FAILSAFE_FAILS,
    CATCH_TIMEOUT,
    CATCH_MIN_TICKS_FROM_RELEASE,
    CATCH_LAST_RIDDEN_BONUS,
    CATCH_RAY_DISTANCE,
    CATCH_URGENT_ETA,
    CATCH_CALM_ETA,
    CATCH_SAFETY_NET,
    GROUND_DISABLE_TICKS,
    GROUND_LEAVE_TICKS,
    GROUND_RAY_DISTANCE,
    GROUND_SLOW_SPEED,
    HOVER_GRACE_TICKS,
    LANE_CHANGE_RISE,
    LANE_CHANGE_EASE,
    FLIGHT_ROLL_GAIN,
    FLIGHT_ROLL_SMOOTHING,
    FLIGHT_ROLL_MAX,
    FLIGHT_ROLL_FULL_SPEED,
    MIGRATE_LEGACY_TRUST,
    BREAK_IN_RIDES_TO_TAME,
    BREAK_IN_SUCCESS_TICKS,
    BREAK_IN_MIN_TICKS,
    BREAK_IN_MAX_TICKS,
    BREAK_IN_CLIMB_TICKS,
    BREAK_IN_SWEEP_RADIUS,
    BREAK_IN_SWEEP_HEIGHT,
    BREAK_IN_SWEEP_SPEED,
    BREAK_IN_SWEEP_RATE,
    BREAK_IN_SWEEP_Z_RATE,
    BREAK_IN_TRUST_PROPERTY,
  } = entityData;
  const AERIAL_COMBAT_SPEED = 1.3;                                     
  const IDLE_LAND_SPEED = 1.6;                                                                        
  const LAND_COOLDOWN_TICKS = 120;
  const SEA_LEVEL = { overworld: 63, nether: 32, the_end: 64 };
  const fallStates = new Map();
  const CATCHER = new Map();                                                        

                                                
  function isTrusted(dragon) {
    if (property(dragon, BREAK_IN_TRUST_PROPERTY) === true) return true;
    if (MIGRATE_LEGACY_TRUST && dynamic(dragon, BREAK_IN_TRUST_PROPERTY) === true) {
      setProperty(dragon, BREAK_IN_TRUST_PROPERTY, true);
      return true;
    }
    return false;
  }

  function setTrusted(dragon, value) {
    if (!dragon?.isValid) return false;
    setProperty(dragon, BREAK_IN_TRUST_PROPERTY, value === true);
    setDynamic(dragon, BREAK_IN_TRUST_PROPERTY, value === true ? true : undefined);
    return true;
  }

  function isBaby(dragon) {
    return property(dragon, `${FLIGHT}age_variant`, "adult") === "baby";
  }

  function isSitting(dragon) {
    return property(dragon, `${FLIGHT}mob_state`) === "sitting";
  }

  function isTamed(dragon) {
    return safe(() => dragon.getComponent("minecraft:tameable")?.isTamed) === true;
  }

  function sizeOf(dragon) {
    const stage = property(dragon, `${FLIGHT}age_variant`, "adult");
    return stage === "juvenile" ? JUVENILE_SIZE : stage === "baby" ? 0.15 : 1;
  }

                                                                        
  function javaWidth(dragon) {
    return JAVA_DRAGON_WIDTH * sizeOf(dragon);
  }
  function javaHeight(dragon) {
    return JAVA_DRAGON_HEIGHT * sizeOf(dragon);
  }

                                        
                                                                               
                                                                    
                                                                             
                                                                              
                                                                     
  const ORDER_PROPERTY = `${FLIGHT}formation_order`;
  const MIRROR_PROPERTY = `${FLIGHT}flight_rank`;
  const MIGRATED_PROPERTY = `${FLIGHT}flight_rank_migrated`;
  const ORDER_CACHE = new Map();                            
  const SESSION_ORDER = new Map();                                           
  const SESSION_ORDER_MAX = 8;
  const VANILLA_DIMENSIONS = ["overworld", "nether", "the_end"];

  function pidOf(dragon) {
    return safe(() => getPersistentId(dragon), null);
  }

  function mirroredRank(dragon) {
    const rank = Math.floor(Number(dynamic(dragon, MIRROR_PROPERTY, 0)));
    return Number.isFinite(rank) && rank > 0 ? Math.min(rank, MAX_FLIGHT_RANK) : 0;
  }

  function ownedDragonsOf(owner, dimensions = null) {
    const found = [];
    const dims = dimensions ?? [owner.dimension];
    for (const dimension of dims) {
      for (const dragon of getDimensionDragons(dimension)) {
        if (entityData.dragonTypeIds.has(dragon.typeId) && isDragonOwnedByPlayer(dragon, owner.id)) {
          found.push(dragon);
        }
      }
    }
    return found;
  }

  function writeOrder(owner, list) {
    const raw = formationOrder.serialize(list);
    if (dynamic(owner, ORDER_PROPERTY) !== raw) setDynamic(owner, ORDER_PROPERTY, raw);
    ORDER_CACHE.set(owner.id, { raw, list });
    FLOCK_CACHE.clear();
                                                                             
    for (const dragon of ownedDragonsOf(owner)) mirrorRank(dragon, list);
  }

  function mirrorRank(dragon, list) {
    const pid = pidOf(dragon);
    if (!pid) return;
    const rank = formationOrder.rankOf(list, pid);
    if (mirroredRank(dragon) !== rank) setDynamic(dragon, MIRROR_PROPERTY, rank || undefined);
  }

                                                                               
                                                                   
  function migrateOrder(owner) {
    const dimensions = VANILLA_DIMENSIONS
      .map((id) => safe(() => world.getDimension(id), null))
      .filter(Boolean);
    const entries = [];
    for (const dragon of ownedDragonsOf(owner, dimensions)) {
      const pid = pidOf(dragon);
      if (!pid) continue;
      entries.push({ pid, rank: mirroredRank(dragon) });
      setDynamic(dragon, MIGRATED_PROPERTY, true);
    }
    const list = formationOrder.migrateLegacy(entries);
    writeOrder(owner, list);
    return list;
  }

                                                                                   
  function readOrder(owner) {
    if (!owner?.isValid) return [];
    const raw = dynamic(owner, ORDER_PROPERTY);
    if (typeof raw !== "string") return migrateOrder(owner);
    const cached = ORDER_CACHE.get(owner.id);
    if (cached && cached.raw === raw) return cached.list;
    const list = formationOrder.parse(raw);
    ORDER_CACHE.set(owner.id, { raw, list });
    return list;
  }

  function getOrder(owner) {
    return [...readOrder(owner)];
  }

                                                          
  function flightRank(dragon, owner = ownerOf(dragon)) {
    if (!owner) return 0;
    const pid = pidOf(dragon);
    return pid ? formationOrder.rankOf(readOrder(owner), pid) : 0;
  }

  function rankOfPid(owner, pid) {
    return formationOrder.rankOf(readOrder(owner), pid);
  }

                                                                  
  function placeRank(owner, pid, rank) {
    if (!owner?.isValid || !pid) return null;
    const list = readOrder(owner);
    const next = formationOrder.place(list, pid, rank, formationOrder.FORMATION_REASSIGN_MODE);
    if (!formationOrder.sameList(list, next)) writeOrder(owner, next);
    return formationOrder.rankOf(next, pid);
  }

  function cycleRank(owner, pid) {
    if (!owner?.isValid || !pid) return null;
    const list = readOrder(owner);
    const next = formationOrder.cycle(list, pid, formationOrder.FORMATION_REASSIGN_MODE);
    if (!formationOrder.sameList(list, next)) writeOrder(owner, next);
    return formationOrder.rankOf(next, pid);
  }

  function forgetDragon(ownerId, pid) {
    const owner = findPlayer(ownerId);
    if (!owner?.isValid || !pid) return false;
    const list = readOrder(owner);
    if (!list.includes(pid)) return false;
    writeOrder(owner, formationOrder.remove(list, pid));
    return true;
  }

                                                  
  function setFlightRank(dragon, rank) {
    const owner = ownerOf(dragon);
    return owner ? placeRank(owner, pidOf(dragon), rank) !== null : false;
  }

  function assignFlightRank(dragon, rank, ownerId) {
    const owner = findPlayer(ownerId);
    return owner ? placeRank(owner, pidOf(dragon), rank) : null;
  }

  function cycleFlightRank(dragon, player) {
    if (!dragon?.isValid || !player?.isValid) return null;
    if (!isDragonOwnedByPlayer(dragon, player.id)) return null;
    return cycleRank(player, pidOf(dragon));
  }

                                                                             
                                                                
  function syncDragonOrder(dragon, owner, state) {
    const now = system.currentTick;
    if (now < state.nextOrderSync) return;
    state.nextOrderSync = now + 100;
    const pid = pidOf(dragon);
    if (!pid) return;
    let list = readOrder(owner);
    if (dynamic(dragon, MIGRATED_PROPERTY) !== true) {
      setDynamic(dragon, MIGRATED_PROPERTY, true);
      const legacy = mirroredRank(dragon);
      if (legacy > 0 && !list.includes(pid)) {
        list = formationOrder.insertLegacy(list, pid, legacy);
        writeOrder(owner, list);
        return;
      }
    }
    mirrorRank(dragon, list);
  }

                                     
  function data(dragon) {
    let state = runtime.get(dragon);
    if (!state) {
      state = {
        jumpWasDown: false,
        fireballChargeTicks: 0,
                                                                          
        flightTicks: property(dragon, `${FLIGHT}movement_state`) === "flying" ? LIFTOFF_THRESHOLD + 1 : 0,
        combatIntent: null,
        attackInteraction: null,
        attackInteractionError: null,
        firstSeenTick: system.currentTick,
        ageTicks: 0,
        crystal: null,
        crystalTicks: 0,
        nextCrystalScanTick: 0,
        reconciled: false,
        nextReconcileTick: 0,
        lastMode: null,
        lastTransition: null,
        followActive: false,
        momentum: 0,
        catchStart: 0,
        diveTick: 0,
        addRiderFails: 0,
        lastSlotIndex: null,
        laneOffset: 0,
        nextOrderSync: 0,
        lastYaw: null,
        roll: 0,
        rollSent: 0,
        motion: null,
        restoreSitting: false,
        landTarget: null,
        nextLandScan: 0,
        autonomousTarget: null,
        autonomousLastPosition: null,
        autonomousStallTicks: 0,
        autonomousEscapeTarget: null,
        autonomousEscapeExpires: 0,
        breakIn: { riderId: null, rideTicks: 0, threshold: 0, climbTicks: 0, anchor: null, banked: 0, lastParticle: -Infinity },
      };
      runtime.set(dragon, state);
    }
    return state;
  }

                                                                                
                                                                                
                                                              
  function isNearGround(dragon, factor = NEAR_GROUND_FACTOR) {
    if (dragon.isOnGround) return true;
    const box = safe(() => dragon.getComponent("minecraft:collision_box"), null);
    const width = Number(box?.width) || 1.4;
    const height = Number(box?.height) || 2.75;
    const reach = height * factor + 0.05;
    const half = width * 0.45;
    const base = dragon.location;
    for (const [dx, dz] of [[0, 0], [half, half], [-half, half], [half, -half], [-half, -half]]) {
      const hit = safe(() => dragon.dimension.getBlockFromRay(
        { x: base.x + dx, y: base.y + 0.05, z: base.z + dz },
        { x: 0, y: -1, z: 0 },
        { maxDistance: reach, includeLiquidBlocks: false, includePassableBlocks: false },
      ));
      if (hit) return true;
    }
    return false;
  }

                                                          
  function wrapDegrees(value) {
    return ((((value % 360) + 540) % 360) - 180);
  }

  function rotlerp(current, target, maxDelta) {
    const delta = Math.max(-maxDelta, Math.min(maxDelta, wrapDegrees(target - current)));
    return current + delta;
  }

                                                                             
                                                                                
                                                                               
                                                               
  function moveControlFly(dragon, target, speedModifier, breathing = false, minSpeed = 0) {
    if (!dragon?.isValid || !target) return;
    const pos = dragon.location;
    const distX = target.x - pos.x;
    const distY = target.y - pos.y;
    const distZ = target.z - pos.z;
    const dist = Math.sqrt(distX * distX + distY * distY + distZ * distZ);
    if (dist * dist < 2.5e-7) return;
    const liftOff = dragon.isOnGround && !dragon.isInWater && distY > 0.5;
    const scale = dragon.isInWater ? 0.6 : 1;
    const cruise = Math.max(FLIGHT_CRUISE_SPEED * Math.min(1, Math.max(0.2, speedModifier / 2)), minSpeed) * scale;
    const speed = Math.min(cruise, Math.max(0.25, dist * 0.25));
    const intended = {
      x: (distX / dist) * speed,
      y: dragon.isOnGround && !liftOff ? 0 : (distY / dist) * speed,
      z: (distZ / dist) * speed,
    };
    const current = getSafeVelocity(dragon);
    safe(() => dragon.applyImpulse({
      x: (intended.x - current.x) * FLIGHT_RESPONSE,
      y: (intended.y - current.y) * FLIGHT_RESPONSE,
      z: (intended.z - current.z) * FLIGHT_RESPONSE,
    }));
                                                                   
    if (liftOff && current.y < 0.3) safe(() => dragon.applyImpulse({ x: 0, y: 0.45, z: 0 }));
    data(dragon).motion = intended;
  }

                                                                             
                                                                                 
                                                                                     
  function updateFlightRoll(dragon, state) {
    if (!dragon?.isValid) return;
    const rotation = safe(() => dragon.getRotation(), null);
    const flying = property(dragon, `${FLIGHT}movement_state`) === "flying";
    let target = 0;
    if (rotation && flying && state.lastYaw !== null) {
      const rate = wrapDegrees(rotation.y - state.lastYaw);
      const speed = Math.hypot(...Object.values(getSafeVelocity(dragon)));
      const factor = Math.min(1, speed / FLIGHT_ROLL_FULL_SPEED);
      target = Math.max(-FLIGHT_ROLL_MAX, Math.min(FLIGHT_ROLL_MAX, rate * FLIGHT_ROLL_GAIN * factor));
    }
    state.lastYaw = rotation ? rotation.y : null;
    state.roll += (target - state.roll) * FLIGHT_ROLL_SMOOTHING;
    if (Math.abs(state.roll) < 0.05) state.roll = 0;
    const rounded = Math.round(state.roll * 10) / 10;
    if (Math.abs(rounded - state.rollSent) >= 0.2 || (rounded === 0 && state.rollSent !== 0)) {
      state.rollSent = rounded;
      setProperty(dragon, `${FLIGHT}flight_roll`, rounded);
    }
  }

                                                                            
                                                                              
                                                                            
                                                                     
  function alignToMotion(dragon, state) {
    let motion = state.motion;
    state.motion = null;
    if (!dragon?.isValid) return;
    if (!motion) {
      const current = getSafeVelocity(dragon);
      if (!dragon.isOnGround && Math.hypot(current.x, current.y, current.z) > 0.15) motion = current;
    }
    const rotation = safe(() => dragon.getRotation(), { x: 0, y: 0 });
    const horizontal = motion ? Math.hypot(motion.x, motion.z) : 0;
    const speed = motion ? Math.hypot(motion.x, motion.y, motion.z) : 0;
    let yaw = rotation.y;
    if (horizontal > 0.05) {
      yaw = rotlerp(rotation.y, (-Math.atan2(motion.x, motion.z) * 180) / Math.PI, dragon.isOnGround ? 45 : 25);
    }
    let wantedPitch = 0;
    if (motion && speed > 0.05 && !dragon.isOnGround) {
      const angle = (-Math.atan2(motion.y, horizontal) * 180) / Math.PI;
      wantedPitch = Math.max(-60, Math.min(60, angle * Math.min(1, speed / 0.5)));
    }
    const pitch = rotation.x + Math.max(-12, Math.min(12, wantedPitch - rotation.x));
    safe(() => dragon.setRotation({ x: pitch, y: yaw, z: 0 }));
  }

  function flyTowardTarget(dragon, target, speedModifier) {
    moveControlFly(dragon, target, speedModifier);
  }

  function moveAutonomousFlight(dragon, target, state) {
    const now = system.currentTick;
    const position = dragon.location;
    const distanceToTarget = distanceBetween(position, target);
    const targetChanged = !state.autonomousTarget ||
      distanceBetween(state.autonomousTarget, target) > 3;
    if (targetChanged || distanceToTarget <= 1) {
      state.autonomousStallTicks = 0;
      state.autonomousEscapeTarget = null;
    } else if (
      state.autonomousLastPosition &&
      distanceBetween(position, state.autonomousLastPosition) < 0.08
    ) {
      state.autonomousStallTicks += 1;
    } else {
      state.autonomousStallTicks = 0;
    }
    state.autonomousTarget = { x: target.x, y: target.y, z: target.z };
    state.autonomousLastPosition = { x: position.x, y: position.y, z: position.z };

    if (state.autonomousStallTicks >= 12) {
      const dx = target.x - position.x;
      const dz = target.z - position.z;
      const horizontal = Math.hypot(dx, dz) || 1;
      state.autonomousEscapeTarget = {
        x: position.x + (dx / horizontal) * 4,
        y: position.y + 4,
        z: position.z + (dz / horizontal) * 4,
      };
      state.autonomousEscapeExpires = now + 40;
      state.autonomousStallTicks = 0;
    }

    if (state.autonomousEscapeTarget) {
      if (
        now >= state.autonomousEscapeExpires ||
        distanceBetween(position, state.autonomousEscapeTarget) <= 1
      ) {
        state.autonomousEscapeTarget = null;
      } else {
        moveControlFly(dragon, state.autonomousEscapeTarget, AERIAL_COMBAT_SPEED);
        return;
      }
    }

    const flightTarget = dragon.isOnGround && target.y <= position.y + 2
      ? { x: target.x, y: position.y + 4, z: target.z }
      : target;
    moveControlFly(dragon, flightTarget, AERIAL_COMBAT_SPEED);
  }

  function faceTarget(dragon, target, snap = false) {
    if (!target?.isValid) return;
    const velocity = getSafeVelocity(target);
    const distance = distanceBetween(dragon.location, target.location);
    const leadTicks = Math.min(6, distance / 4.8);
    const dx = target.location.x + velocity.x * leadTicks - dragon.location.x;
    const dz = target.location.z + velocity.z * leadTicks - dragon.location.z;
    const current = safe(() => dragon.getRotation(), { x: 0, y: 0, z: 0 });
    const yaw = (-Math.atan2(dx, dz) * 180) / Math.PI;
    safe(() => dragon.setRotation({
      x: current.x,
      y: snap ? yaw : current.y + wrapDegrees(yaw - current.y) * 0.55,
      z: 0,
    }));
  }

                            
  function ownerMount(owner) {
    return safe(() => owner?.getComponent("minecraft:riding")?.entityRidingOn, null);
  }

  function ownerIsFlying(owner) {
    if (owner?.isGliding) return true;
    const mount = ownerMount(owner);
    return mount?.isValid === true &&
      entityData.dragonTypeIds.has(mount.typeId) &&
      property(mount, `${FLIGHT}movement_state`) === "flying" &&
      isTamed(mount);
  }

                                                                               
                                                                               
                                                         
  function groundCandidate(player) {
    if (player.isOnGround || player.isInWater || player.isClimbing) return true;
    if (player.isGliding) return false;
    if (Math.abs(getSafeVelocity(player).y) >= GROUND_SLOW_SPEED) return false;
    const at = player.location;
    return Boolean(safe(() => player.dimension.getBlockFromRay(
      { x: at.x, y: at.y + 0.05, z: at.z },
      { x: 0, y: -1, z: 0 },
      { maxDistance: GROUND_RAY_DISTANCE + 0.05, includeLiquidBlocks: false, includePassableBlocks: false },
    )));
  }

  function motionStateOf(player, state, mount) {
    if (mount?.isValid === true) {
      return entityData.dragonTypeIds.has(mount.typeId) &&
        property(mount, `${FLIGHT}movement_state`) === "flying"
        ? "RIDING_FLYING_DRAGON"
        : "RIDING_OTHER";
    }
    if (player.isGliding) return "GLIDING";
    if (state.grounded) return "GROUNDED";
    if (player.isInWater) return "WATER";
    if (player.isClimbing) return "CLIMBING";
    if (state.distance > CATCH_MIN_FALL) return "FALLING";
    return "AIRBORNE_OTHER";
  }

                                                                      
                                                                          
  function followIntent(owner) {
    return fallStates.get(owner?.id)?.intent ?? "none";
  }

                                                                            
                                                   
  function onOwnerGrounded(owner, state) {
    state.dismount = null;
    state.distance = 0;
    state.fallStart = null;
    state.catchIntentSince = 0;
    SESSION_ORDER.delete(owner.id);
    CATCHER.delete(owner.id);
    FLOCK_CACHE.clear();
    for (const dragon of ownedDragonsOf(owner)) {
      const dragonState = data(dragon);
      if (dragonState.diveTick) safe(() => dragon.clearVelocity());
      dragonState.catchStart = 0;
      dragonState.diveTick = 0;
      dragonState.addRiderFails = 0;
      dragonState.laneOffset = 0;
      dragonState.lastSlotIndex = null;
      if (dragonState.followActive) stopFollow(dragon, "owner_grounded");
    }
  }

                                                                            
                                                                 
  function trackFalls() {
    const now = system.currentTick;
    const players = world.getAllPlayers();
    for (const player of players) {
      if (!player?.isValid) continue;
      const y = player.location.y;
      let state = fallStates.get(player.id);
      if (!state) {
        state = {
          lastY: y, distance: 0, dimension: player.dimension.id, mountId: null, dismount: null,
          groundTicks: 0, airTicks: 0, grounded: false, airSince: now, fallStart: null,
          intent: "none", motion: "AIRBORNE_OTHER", catchIntentSince: 0, telemetry: null,
        };
        fallStates.set(player.id, state);
      }
                                                                            
      const mount = ownerMount(player);
      const onDragon = mount?.isValid === true && entityData.dragonTypeIds.has(mount.typeId);
      if (state.mountId && !onDragon) {
        state.dismount = { dragonId: state.mountId, tick: now };
        state.airSince = now;
      }
      state.mountId = onDragon ? mount.id : null;

                                                                             
                                                                            
      const candidate = !mount && groundCandidate(player);
      if (candidate) {
        state.groundTicks += 1;
        state.airTicks = 0;
        state.dismount = null;
      } else {
        state.airTicks += 1;
        state.groundTicks = 0;
      }
      if (!state.grounded && state.groundTicks >= GROUND_DISABLE_TICKS) {
        state.grounded = true;
        onOwnerGrounded(player, state);
      } else if (state.grounded && (state.airTicks >= GROUND_LEAVE_TICKS || mount)) {
        state.grounded = false;
        state.airSince = now - state.airTicks;
      }
                                                                            
                           
      if (onDragon || player.isGliding) state.airSince = now;

                                                                             
      const teleported = state.lastY - y > 10;
      const reset = candidate || player.isFlying || teleported ||
        state.dimension !== player.dimension.id || Boolean(mount);
      if (reset) {
        state.distance = 0;
        state.fallStart = null;
      } else if (y < state.lastY) {
        if (state.distance === 0) state.fallStart = now;
        state.distance += state.lastY - y;
      }
      state.lastY = y;
      state.dimension = player.dimension.id;

      state.motion = motionStateOf(player, state, mount);
      let intent = "none";
      if (!state.grounded) {
        if (ownerIsFlying(player)) intent = "formation";
        else if (state.distance > CATCH_MIN_FALL && !mount) intent = "catch";
      }
      if (intent === "catch") {
        if (!state.catchIntentSince) state.catchIntentSince = now;
      } else {
        state.catchIntentSince = 0;
        CATCHER.delete(player.id);
      }
      state.intent = intent;
    }
    for (const id of fallStates.keys()) {
      if (!players.some((player) => player.id === id)) {
        fallStates.delete(id);
        FORMATION_HEADING.delete(id);
        SESSION_ORDER.delete(id);
        CATCHER.delete(id);
        ORDER_CACHE.delete(id);
      }
    }
  }

                                                                             
  function ownerGrounded(owner) {
    if (ownerMount(owner)) return false;
    return fallStates.get(owner?.id)?.grounded === true;
  }

  function fallDistanceOf(owner) {
    return fallStates.get(owner?.id)?.distance ?? 0;
  }

  function ownerOf(dragon) {
    const id = dynamic(dragon, `${FLIGHT}owner_identifier`) ||
      safe(() => dragon.getComponent("minecraft:tameable")?.tamedToPlayerId);
    const owner = findPlayer(id);
    return owner?.isValid && isDragonOwnedByPlayer(dragon, owner.id) ? owner : null;
  }

                                                 
  function hasController(dragon) {
    const riders = ridersOf(dragon);
    return riders.length > 0 && isTrusted(dragon) &&
      safe(() => dragon.hasComponent("minecraft:is_saddled")) === true;
  }

  function isVehicleless(dragon) {
    return !safe(() => dragon.getComponent("minecraft:riding")?.entityRidingOn);
  }

  function isVFlightEnabled(dragon) {
                                                                      
    return dynamic(dragon, `${FLIGHT}vflight_enabled`) === true;
  }

  function setVFlightEnabled(dragon, enabled) {
    if (!dragon?.isValid) return false;
    setDynamic(dragon, `${FLIGHT}vflight_enabled`, enabled ? true : undefined);
    if (!enabled) {
                                                                              
                                            
      const state = data(dragon);
      state.followActive = false;
      state.landTarget = null;
      safe(() => dragon.triggerEvent("dragonmounts2:on_vflight_disable"));
      FLOCK_CACHE.clear();
    }
    return true;
  }

  function isFormationFlightEnabled(owner) {
    return dynamic(owner, `${FLIGHT}formation_flight_enabled`) === true;
  }

  function setFormationFlightEnabled(owner, enabled) {
    if (!owner?.isValid) return false;
    setDynamic(owner, `${FLIGHT}formation_flight_enabled`, enabled ? true : undefined);
    FLOCK_CACHE.clear();
    return true;
  }

  function ownerAirborne(owner) {
    return owner?.isValid === true && !owner.isOnGround && !owner.isInWater &&
      !owner.isFlying && !ownerMount(owner);
  }

                                                                          
                                      
  function dismountInfo(dragon, owner) {
    const info = fallStates.get(owner?.id)?.dismount;
    if (!info || info.dragonId !== dragon.id) return null;
    if (system.currentTick - info.tick > DISMOUNT_CATCH_TICKS) return null;
    return ownerAirborne(owner) ? info : null;
  }

                                                                             
                          
  function inDismountGrace(owner) {
    const info = fallStates.get(owner?.id)?.dismount;
    return Boolean(info) && system.currentTick - info.tick <= DISMOUNT_SNEAK_GRACE;
  }

  function canUseFollow(dragon, owner, state) {
    if (!owner?.isValid || owner.dimension.id !== dragon.dimension.id) return false;
    if (dragon.isLeashed === true) return false;
    if (ridersOf(dragon).length > 0 || !isVehicleless(dragon)) return false;
                                                                
    if (!isTamed(dragon) || !isTrusted(dragon) || isBaby(dragon) || isSitting(dragon)) return false;
                                                                        
    const intent = followIntent(owner);
    if (intent === "none" || ownerGrounded(owner)) return false;
    let wants = false;
    if (intent === "formation") {
      if (!isFormationFlightEnabled(owner)) return false;
                                                             
      wants = flockOf(dragon, owner).some((member) => member && (member === dragon || member.id === dragon.id));
    } else if (intent === "catch") {
      wants = distanceBetween(dragon.location, owner.location) < entityData.OWNER_FOLLOW_RANGE &&
        eligibleDragons(dragon, owner).members.some((member) => member.id === dragon.id);
    }
    if (wants && property(dragon, `${FLIGHT}is_sleeping`) === true) wakeDragon(dragon);
    return wants;
  }

                                                                         
                                                                         
  function eligibleDragons(dragon, owner) {
    const now = system.currentTick;
    const key = `e:${owner.id}`;
    const cached = FLOCK_CACHE.get(key);
    if (cached && cached.tick === now && cached.dimension === dragon.dimension.id) return cached;
    if (FLOCK_CACHE.size > 32) FLOCK_CACHE.clear();
    const members = getDimensionDragons(dragon.dimension).filter((member) =>
      member?.isValid &&
      entityData.dragonTypeIds.has(member.typeId) &&
      member.isLeashed !== true &&
      !isBaby(member) &&
      ridersOf(member).length === 0 &&
      isVehicleless(member) &&
      isTamed(member) &&
      isTrusted(member) &&
      isDragonOwnedByPlayer(member, owner.id) &&
      Math.abs(member.location.x - owner.location.x) <= FLOCK_RADIUS &&
      Math.abs(member.location.y - owner.location.y) <= FLOCK_RADIUS &&
      Math.abs(member.location.z - owner.location.z) <= FLOCK_RADIUS
    );
    let main = null;
    let mainTick = -1;
    for (const member of members) {
      if (dynamic(member, `${FLIGHT}last_rider_id`) !== owner.id) continue;
      const rodeAt = Number(dynamic(member, `${FLIGHT}last_ridden_tick`, 0)) || 0;
      if (rodeAt > mainTick) {
        main = member;
        mainTick = rodeAt;
      }
    }
    const entry = { tick: now, dimension: dragon.dimension.id, members, main };
    FLOCK_CACHE.set(key, entry);
    return entry;
  }

                                                                               
                                                          
  function flockOf(dragon, owner) {
    const now = system.currentTick;
    const cached = FLOCK_CACHE.get(owner.id);
    if (cached && cached.tick === now && cached.dimension === dragon.dimension.id) return cached.members;
    if (FLOCK_CACHE.size > 32) FLOCK_CACHE.clear();
    const eligible = eligibleDragons(dragon, owner);
                                                                                  
                                                                            
                                                                         
    const gliding = !ownerMount(owner);
    const members = gliding
      ? eligible.members.filter((member) => property(member, `${FLIGHT}movement_state`) === "flying")
      : eligible.members;
    const main = eligible.main && members.some((member) => member.id === eligible.main.id)
      ? eligible.main
      : null;
    const byPid = new Map();
    for (const member of members) {
      const pid = pidOf(member);
      if (pid) byPid.set(pid, member);
    }
    const list = readOrder(owner);
    const mainPid = main ? pidOf(main) : null;
                                                                            
                                                                              
    const session = SESSION_ORDER.get(owner.id) ?? [];
    const joining = [...byPid.keys()]
      .filter((pid) => !list.includes(pid) && !session.includes(pid))
      .sort((a, b) => ((a === mainPid) !== (b === mainPid) ? (a === mainPid ? -1 : 1) : formationOrder.compareByAge(a, b)));
    if (joining.length) {
      session.push(...joining);
      while (session.length > SESSION_ORDER_MAX) session.shift();
      SESSION_ORDER.set(owner.id, session);
    }
    const slotPids = formationOrder.assignSlots([...byPid.keys()], list, mainPid, session, {
      compact: formationOrder.FORMATION_COMPACT,
      slots: FORMATION_MAX_DRAGONS,
    });
    const slots = slotPids.map((pid) => (pid ? byPid.get(pid) ?? null : null));
    FLOCK_CACHE.set(owner.id, { tick: now, dimension: dragon.dimension.id, members: slots });
    return slots;
  }

                                                                                    
                                                                                 
  function formationSlot(dragon, owner) {
    const flock = flockOf(dragon, owner);
    const found = flock.findIndex((member) => member && (member === dragon || member.id === dragon.id));
    const index = found < 0 ? 0 : found;
    const state = data(dragon);
                                                                             
                                                      
    if (state.lastSlotIndex !== null && state.lastSlotIndex !== index) {
      state.laneOffset = index < state.lastSlotIndex ? LANE_CHANGE_RISE : 0;
    }
    state.lastSlotIndex = index;
    const mount = ownerMount(owner);
    const leader = mount ?? owner;
    const velocity = getSafeVelocity(leader);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    let rawDir;
    if (speed > 0.2 && Math.hypot(velocity.x, velocity.z) > 0.1) {
      rawDir = { x: velocity.x / speed, y: velocity.y / speed, z: velocity.z / speed };
    } else {
      const yaw = (safe(() => leader.getRotation().y, 0) * Math.PI) / 180;
      rawDir = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };
    }
                                                                                
                                                                         
    const dir = smoothFormationHeading(owner.id, rawDir);
                                                                              
                                                                           
    const anchor = leader.location;
    const anchorLift = mount ? 0 : 0.5;
    const horizontal = Math.hypot(dir.x, dir.z) || 1;
    const right = { x: -dir.z / horizontal, z: dir.x / horizontal };
                                                                              
                                                                                
                                                                       
    const wing = Math.floor(index / 2) + 1;               
    const leftSide = index % 2 === 0;
                                                                                   
    let bodySize = Math.max(javaWidth(dragon), 2.0);                           
    if (mount && entityData.dragonTypeIds.has(mount.typeId)) {
      bodySize = Math.max(bodySize, javaWidth(mount));
    }
    for (const member of flock) {
      if (member?.isValid) bodySize = Math.max(bodySize, javaWidth(member));
    }
    const back = bodySize * (2.5 + 2.2 * (wing - 1));
    const side = wing * bodySize * 1.8 * (leftSide ? -1 : 1);
    const lane = state.laneOffset;
    state.laneOffset = Math.max(0, lane - LANE_CHANGE_EASE);
    return {
      x: anchor.x - dir.x * back + right.x * side,
      y: anchor.y + anchorLift - dir.y * back + lane,
      z: anchor.z - dir.z * back + right.z * side,
    };
  }

  const FORMATION_HEADING = new Map();                            
  function smoothFormationHeading(ownerId, target) {
    const now = system.currentTick;
    const cached = FORMATION_HEADING.get(ownerId);
    if (cached && cached.tick === now) return cached.dir;
    let dir = target;
    if (cached && now - cached.tick < 40) {
      const blend = 0.15;
      const mixed = {
        x: cached.dir.x + (target.x - cached.dir.x) * blend,
        y: cached.dir.y + (target.y - cached.dir.y) * blend,
        z: cached.dir.z + (target.z - cached.dir.z) * blend,
      };
      const length = Math.hypot(mixed.x, mixed.y, mixed.z) || 1;
      dir = { x: mixed.x / length, y: mixed.y / length, z: mixed.z / length };
    }
    FORMATION_HEADING.set(ownerId, { tick: now, dir });
    if (FORMATION_HEADING.size > 32) FORMATION_HEADING.delete(FORMATION_HEADING.keys().next().value);
    return dir;
  }

                                                                
  function lerp(from, to, t) {
    return from + (to - from) * t;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

                                                                             
  function seatPoint(dragon) {
    const at = dragon.location;
    return { x: at.x, y: at.y + javaHeight(dragon) * 0.8, z: at.z };
  }

                                                                             
                                                                             
                                                                           
                                            
  function catcherFor(owner, dragon) {
    const now = system.currentTick;
    let record = CATCHER.get(owner.id);
    if (record && record.tick === now) return record;
    const info = eligibleDragons(dragon, owner);
    const candidates = info.members.filter((member) =>
      distanceBetween(member.location, owner.location) < entityData.OWNER_FOLLOW_RANGE);
    const dismountId = fallStates.get(owner.id)?.dismount?.dragonId;
    const score = (member) => distanceBetween(member.location, owner.location) / 1.4 -
      (member.id === dismountId || member.id === info.main?.id ? CATCH_LAST_RIDDEN_BONUS : 0);
    const best = (list) => [...list].sort((a, b) => score(a) - score(b))[0] ?? null;
    let chosen = record ? candidates.find((member) => member.id === record.dragonId) ?? null : null;
    if (chosen && now - record.since >= CATCH_TIMEOUT) {
      chosen = best(candidates.filter((member) => member.id !== record.dragonId)) ?? chosen;
      record.since = now;
    }
    if (!chosen) chosen = best(candidates);
    if (!record || record.dragonId !== chosen?.id) {
      record = {
        dragonId: chosen?.id ?? null, since: now, tick: now, profileTick: -1,
        eta: 120, urgency: 0, reaction: CATCH_REACTION_CALM, closing: CATCH_CLOSING_CALM,
        netApplied: false, candidates: candidates.length,
      };
      CATCHER.set(owner.id, record);
    }
    record.tick = now;
    record.candidates = candidates.length;
    return record;
  }

                                                                             
                                                                              
                              
  function updateCatchProfile(owner, record) {
    const now = system.currentTick;
    if (record.profileTick === now) return record;
    record.profileTick = now;
    const v = Math.max(0, -getSafeVelocity(owner).y);
    const hit = safe(() => owner.dimension.getBlockFromRay(
      owner.location,
      { x: 0, y: -1, z: 0 },
      { maxDistance: CATCH_RAY_DISTANCE, includeLiquidBlocks: false, includePassableBlocks: false },
    ));
    const ground = hit?.block ? hit.block.location.y + 1 : null;
    const d = ground === null ? Infinity : Math.max(0, owner.location.y - ground);
                                                                
    record.eta = Number.isFinite(d) ? (-v + Math.sqrt(v * v + 0.16 * d)) / 0.08 : 120;
    record.urgency = clamp01((CATCH_CALM_ETA - record.eta) / (CATCH_CALM_ETA - CATCH_URGENT_ETA));
    record.reaction = Math.round(lerp(CATCH_REACTION_CALM, CATCH_REACTION_URGENT, record.urgency));
    record.closing = lerp(CATCH_CLOSING_CALM, CATCH_CLOSING_URGENT, record.urgency);
    return record;
  }

                                                                              
  function maybeSafetyNet(owner, record, dragon) {
    if (!CATCH_SAFETY_NET || record.netApplied || record.eta > 8) return;
    const info = eligibleDragons(dragon, owner);
    const near = info.members.some((member) => distanceBetween(member.location, owner.location) <= 6);
    if (near) return;
    record.netApplied = true;
    safe(() => owner.addEffect("slow_falling", 40, { showParticles: false }));
  }

  function catchOwner(dragon, owner, state) {
    if (!isTrusted(dragon) || !isTamed(dragon) || !isDragonOwnedByPlayer(dragon, owner?.id)) return false;
    const rideable = safe(() => dragon.getComponent("rideable"), null);
    if (!rideable?.addRider) return false;
    if (safe(() => rideable.addRider(owner), false)) {
      state.addRiderFails = 0;
      return true;
    }
    state.addRiderFails += 1;
                                                                              
                                                       
    if (state.addRiderFails >= CATCH_FAILSAFE_FAILS &&
        distanceBetween(seatPoint(dragon), owner.location) <= CATCH_FAILSAFE_RADIUS) {
      const rotation = safe(() => dragon.getRotation(), { x: 0, y: 0 });
      const yaw = (rotation.y * Math.PI) / 180;
      safe(() => owner.teleport({
        x: dragon.location.x - Math.sin(yaw) * 0.64,
        y: dragon.location.y + 2.7,
        z: dragon.location.z + Math.cos(yaw) * 0.64,
      }, { dimension: dragon.dimension, rotation, checkForBlocks: false }));
      const mounted = safe(() => rideable.addRider(owner), false) === true;
      if (mounted) state.addRiderFails = 0;
      return mounted;
    }
    return false;
  }

                                                                           
                                                                             
                                                            
  function diveAt(dragon, owner, aim, closing, state, urgency = 0) {
    const now = system.currentTick;
    if (!state.diveTick) state.diveTick = now;
    const rampTicks = lerp(CATCH_CLOSING_RAMP_TICKS, CATCH_CLOSING_RAMP_URGENT, urgency);
    const ramp = clamp01((now - state.diveTick + 1) / rampTicks);
    const pos = dragon.location;
    const dx = aim.x - pos.x;
    const dy = aim.y - pos.y;
    const dz = aim.z - pos.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const ownerVel = getSafeVelocity(owner);
    const speed = closing * ramp;
    const cur = getSafeVelocity(dragon);
    const tx = ownerVel.x + (dx / len) * speed;
    const ty = ownerVel.y + (dy / len) * speed;
    const tz = ownerVel.z + (dz / len) * speed;
    safe(() => dragon.applyImpulse({
      x: (tx - cur.x) * FLIGHT_RESPONSE,
      y: (ty - cur.y) * FLIGHT_RESPONSE,
      z: (tz - cur.z) * FLIGHT_RESPONSE,
    }));
    state.motion = { x: tx, y: ty, z: tz };
  }

  function startFollow(dragon, state) {
    if (state.followActive || !isTrusted(dragon) || isSitting(dragon)) return;
    state.followActive = true;
    safe(() => dragon.triggerEvent("dragonmounts2:on_vflight_enable"));
    recordTransition(state, "vflight", "off", "on", "started");
  }

  function stopFollow(dragon, reason = "ended") {
    const state = data(dragon);
    state.catchStart = 0;
    state.diveTick = 0;
    state.laneOffset = 0;
    state.lastSlotIndex = null;
    if (!state.followActive && property(dragon, `${FLIGHT}v_flight_enabled`) !== true) return;
    state.followActive = false;
    safe(() => dragon.triggerEvent("dragonmounts2:on_vflight_disable"));
    recordTransition(state, "vflight", "on", "off", reason);
    FLOCK_CACHE.clear();
  }

                                                                        
                                                       
  function holdFormation(dragon, owner, state) {
    const mount = ownerMount(owner);
    const slot = formationSlot(dragon, owner);
    const gap = distanceBetween(dragon.location, slot);
    const ownerVel = getSafeVelocity(mount ?? owner);
    if (gap > entityData.REJOIN_RANGE) {
      safe(() => dragon.teleport(slot, { dimension: dragon.dimension, rotation: dragon.getRotation() }));
      safe(() => dragon.applyImpulse({ x: ownerVel.x, y: ownerVel.y, z: ownerVel.z }));
      return;
    }
    const ownerSpeed = Math.hypot(ownerVel.x, ownerVel.y, ownerVel.z);
    if (dragon.isOnGround && slot.y - dragon.location.y > 0.5) {
      moveControlFly(dragon, slot, 14, false, ownerSpeed + 0.5);           
      return;
    }
    const k = Math.min(0.35, 0.12 + gap * 0.03);
    const cap = RIDDEN_BASE_SPEED;                                                           
    let pull = {
      x: (slot.x - dragon.location.x) * k,
      y: (slot.y - dragon.location.y) * k,
      z: (slot.z - dragon.location.z) * k,
    };
    const pullLength = Math.hypot(pull.x, pull.y, pull.z);
    if (pullLength > cap) {
      const f = cap / pullLength;
      pull = { x: pull.x * f, y: pull.y * f, z: pull.z * f };
    }
    const desired = { x: ownerVel.x + pull.x, y: ownerVel.y + pull.y, z: ownerVel.z + pull.z };
    const current = getSafeVelocity(dragon);
    safe(() => dragon.applyImpulse({
      x: (desired.x - current.x) * FLIGHT_RESPONSE,
      y: (desired.y - current.y) * FLIGHT_RESPONSE,
      z: (desired.z - current.z) * FLIGHT_RESPONSE,
    }));
                                                                  
    state.motion = desired;
  }

                                        
  function tickFollow(dragon, owner, state) {
    setMovement(dragon, dragon.isInWater ? "swimming" : "flying", "follow");
    const intent = followIntent(owner);
    if (intent === "formation") {
      state.diveTick = 0;
      holdFormation(dragon, owner, state);
      return;
    }
    if (intent !== "catch") {
      state.catchStart = 0;
      state.diveTick = 0;
      return;
    }

    const now = system.currentTick;
    const fall = fallStates.get(owner.id);
    const record = catcherFor(owner, dragon);
                                                                      
    if (record.dragonId !== dragon.id) {
      state.diveTick = 0;
      holdFormation(dragon, owner, state);
      return;
    }
    updateCatchProfile(owner, record);
    maybeSafetyNet(owner, record, dragon);
                                                                             
                            
    if (owner.isSneaking && !inDismountGrace(owner)) {
      state.diveTick = 0;
      holdFormation(dragon, owner, state);
      return;
    }
                                                                             
                                                                        
    const reacted = now - (fall?.catchIntentSince ?? now) >= record.reaction;
    const aim = { x: owner.location.x, y: owner.location.y - 2, z: owner.location.z };
    if (!reacted) {
      state.diveTick = 0;
      moveControlFly(dragon, aim, 2.0);
      return;
    }
                                                                          
                                    
    const sinceRelease = now - (fall?.dismount?.tick ?? fall?.fallStart ?? now);
    if (sinceRelease >= CATCH_MIN_TICKS_FROM_RELEASE &&
        distanceBetween(seatPoint(dragon), owner.location) <= CATCH_CAPTURE_RADIUS &&
        catchOwner(dragon, owner, state)) {
      if (fall) {
        fall.telemetry = {
          capturedAfter: now - (fall.dismount?.tick ?? fall.fallStart ?? now),
          urgency: record.urgency,
          closing: record.closing,
        };
      }
      state.diveTick = 0;
      CATCHER.delete(owner.id);
      return;
    }
    diveAt(dragon, owner, aim, record.closing, state, record.urgency);
  }

                                                   
  function findLandingSpot(dragon) {
    const origin = dragon.location;
    let best = null;
    for (const radius of [2, 4, 6, 8, 12, 16, 20, 24, 32]) {
      for (let i = 0; i < 8; i += 1) {
        const angle = (i * Math.PI) / 4;
        const x = Math.floor(origin.x + Math.cos(angle) * radius);
        const z = Math.floor(origin.z + Math.sin(angle) * radius);
        const top = safe(() => dragon.dimension.getTopmostBlock({ x, z }), null);
        if (!top || top.isLiquid || top.isAir) continue;
        const above = safe(() => top.above(), null);
        if (!above || !above.isAir) continue;
        const cost = Math.abs(x - origin.x) + Math.abs(top.y + 1 - origin.y) + Math.abs(z - origin.z);
        if (!best || cost < best.cost) best = { cost, x: x + 0.5, y: top.y + 1, z: z + 0.5 };
      }
      if (best) break;
    }
    return best;
  }

                                                                          
                                                                           
                                                                             
  function shouldFollowOwner(dragon, owner) {
    if (owner?.isValid !== true || owner.dimension.id !== dragon.dimension.id) return false;
    if (owner.isOnGround || ownerGrounded(owner)) return false;
    if (distanceBetween(owner.location, dragon.location) >= 20) return false;
    const airSince = fallStates.get(owner.id)?.airSince ?? system.currentTick;
    return system.currentTick - airSince < HOVER_GRACE_TICKS;
  }

  function idleLanding(dragon, owner, state, carryingOwner = false) {
    if (property(dragon, `${FLIGHT}movement_state`) !== "flying" || dragon.isInWater) {
      state.landTarget = null;
      state.nextLandScan = 0;
      return;
    }
    if (!carryingOwner && shouldFollowOwner(dragon, owner)) return;
    const now = system.currentTick;
    if (state.landTarget) {
      const reached = distanceBetween(dragon.location, state.landTarget) <= state.landTarget.closeEnough;
      if (reached || now > state.landTarget.expires) state.landTarget = null;
    }
    if (!state.landTarget && now >= state.nextLandScan) {
      state.nextLandScan = now + LAND_COOLDOWN_TICKS;
      const spot = findLandingSpot(dragon);
      if (spot) {
        state.landTarget = { x: spot.x, y: spot.y, z: spot.z, closeEnough: 1, expires: now + 400 };
      } else {
        const base = SEA_LEVEL[dragon.dimension.id.replace("minecraft:", "")] ?? 63;
        const dy = Math.floor(dragon.location.y) - base;
        const y = dy > 32 ? Math.floor(dragon.location.y) - 32 : dy < -32 ? Math.floor(dragon.location.y) + 32 : base;
        state.landTarget = { x: dragon.location.x, y, z: dragon.location.z, closeEnough: 8, expires: now + 400 };
      }
    }
    if (state.landTarget) moveControlFly(dragon, state.landTarget, IDLE_LAND_SPEED);
  }

                                                                  
  function updateFlyingFlag(dragon, state, behaviorFlying, riddenByPlayer) {
    if (dragon.isInWater) {
      state.flightTicks = 0;
      return;
    }
    if (isNearGround(dragon)) state.flightTicks = 0;
    else state.flightTicks += 1;
    state.flightTicks += 1;
    const ruleFlying = state.flightTicks > LIFTOFF_THRESHOLD && !isBaby(dragon);
    const flying = behaviorFlying || ruleFlying;
    setMovement(dragon, flying ? "flying" : "grounded", flying ? "airborne" : "near_ground");
  }

                                                                                  
  function tickBreakIn(dragon, rider) {
    const state = data(dragon);
    const bi = state.breakIn;
    if (isBaby(dragon)) {
      safe(() => dragon.getComponent("rideable")?.ejectRiders());
      bi.riderId = null;
      return false;
    }
    if (bi.riderId !== rider.id) {
      bi.riderId = rider.id;
      bi.rideTicks = 0;
      bi.climbTicks = 0;
      bi.anchor = { ...dragon.location };
      bi.threshold = BREAK_IN_MIN_TICKS + Math.floor(Math.random() * (BREAK_IN_MAX_TICKS - BREAK_IN_MIN_TICKS));
    }
                                                              
    if (isSitting(dragon)) {
      setProperty(dragon, `${FLIGHT}mob_state`, "standing");
      safe(() => dragon.triggerEvent("minecraft:on_stand"));
    }
    setMovement(dragon, "flying", "break_in");
    if (dragon.isOnGround) bi.climbTicks = 0;
    else if (bi.climbTicks < BREAK_IN_CLIMB_TICKS) bi.climbTicks += 1;
    const phase = state.ageTicks * BREAK_IN_SWEEP_RATE;
    moveControlFly(dragon, {
      x: bi.anchor.x + Math.sin(phase) * BREAK_IN_SWEEP_RADIUS,
      y: bi.anchor.y + (bi.climbTicks < BREAK_IN_CLIMB_TICKS ? BREAK_IN_SWEEP_HEIGHT : 0),
      z: bi.anchor.z + Math.cos(phase * BREAK_IN_SWEEP_Z_RATE) * BREAK_IN_SWEEP_RADIUS,
    }, BREAK_IN_SWEEP_SPEED);
    if (system.currentTick - bi.lastParticle >= 10) {
      spawnParticle(
        dragon.dimension,
        "minecraft:basic_smoke_particle",
        dragon.location,
      );
      bi.lastParticle = system.currentTick;
    }
    alignToMotion(dragon, state);
    updateFlightRoll(dragon, state);
    bi.rideTicks += 1;
    if (bi.rideTicks < bi.threshold) return true;

    const held = bi.rideTicks >= BREAK_IN_SUCCESS_TICKS;
    if (held) bi.banked += 1;
    if (held && bi.banked >= BREAK_IN_RIDES_TO_TAME) {
      safe(() => dragon.getComponent("minecraft:tameable")?.tame(rider));
      setTrusted(dragon, true);
      safe(() => dragon.triggerEvent("minecraft:on_tame"));
      bi.banked = 0;
    } else {
      const look = safe(() => dragon.getViewDirection(), { x: 0, y: 0, z: 0 });
      safe(() => dragon.getComponent("rideable")?.ejectRiders());
      safe(() => rider.applyImpulse({ x: -look.x * 0.4, y: 0.3 - look.y * 0.4, z: -look.z * 0.4 }));
    }
    bi.riderId = null;                                                      
    return true;
  }

                                                                               
  function rideAir(dragon, rider, strafe, forward, speedScale, suppressVertical) {
    const riderRotation = safe(() => rider.getRotation(), { x: 0, y: 0 });
    const moving = Math.abs(strafe) > 0.001 || Math.abs(forward) > 0.001;
    const rotation = safe(() => dragon.getRotation(), { x: 0, y: riderRotation.y });
    const aimLocked = property(dragon, `${FLIGHT}is_breathing`) === true;
    const heading = moving
      ? riderRotation.y + (Math.atan2(-strafe, forward) * 180) / Math.PI
      : riderRotation.y;
    let yaw;
    let pitch;
    if (aimLocked) {
      yaw = rotation.y + wrapDegrees(riderRotation.y - rotation.y) * 0.45;
      pitch = rotation.x + wrapDegrees(riderRotation.x - rotation.x) * 0.45;
    } else {
      yaw = rotation.y + wrapDegrees(heading - rotation.y) * (dragon.isOnGround ? 0.15 : 0.2);
      pitch = Math.max(-90, Math.min(90, riderRotation.x)) * 0.75;                                 
    }
    safe(() => dragon.setRotation({ x: pitch, y: yaw, z: 0 }));

                                                                             
                                                              
                                                                          
                                                                         
    const flight = data(dragon);
    const pitchDown = Math.max(-90, Math.min(90, riderRotation.x));
    const diving = aimLocked ? 0 : clamp01((pitchDown - 20) / 50);
    const climbing = aimLocked ? 0 : clamp01((-pitchDown - 20) / 50);
    if (moving && !dragon.isOnGround) {
      flight.momentum = Math.min(1, flight.momentum + RIDE_MOMENTUM_GAIN);
      if (Math.abs(wrapDegrees(heading - rotation.y)) > 60) {
        flight.momentum = Math.max(0, flight.momentum - RIDE_TURN_BLEED);
      }
    } else {
      flight.momentum = Math.max(0, flight.momentum - RIDE_MOMENTUM_DECAY);
    }
    const dynamic = lerp(RIDE_SPEED_LOW, RIDE_SPEED_HIGH, flight.momentum) *
      (1 + RIDE_DIVE_BONUS * diving) * (1 - RIDE_CLIMB_PENALTY * climbing);
    const speed = Math.min(RIDDEN_BASE_SPEED * speedScale * dynamic, RIDE_MAX_SPEED);
    const thrust = moving ? Math.max(Math.abs(strafe), Math.abs(forward)) : 0;
    const moveYaw = ((aimLocked ? heading : yaw) * Math.PI) / 180;
                                                                        
    const horizontal = thrust * speed;
    let vertical = 0;
    if (!aimLocked && moving) {
      vertical = Math.max(-0.5, Math.min(0.5, -Math.sin((riderRotation.x * Math.PI) / 180) * thrust));
    }
    if (!suppressVertical) {
      if (rider.isJumping) vertical += 0.5;
      else if (rider.isSneaking) vertical -= 0.5;
    }
    const target = {
      x: -Math.sin(moveYaw) * horizontal,
      y: dragon.isOnGround && vertical <= 0 ? 0 : vertical * speed,
      z: Math.cos(moveYaw) * horizontal,
    };
    const current = getSafeVelocity(dragon);
                                                                  
    const response = moving ? RIDE_ACCEL_RESPONSE : RIDE_BRAKE_RESPONSE;
    safe(() => dragon.applyImpulse({
      x: (target.x - current.x) * response,
      y: (target.y - current.y) * response,
      z: (target.z - current.z) * response,
    }));
  }

  function currentMode(dragon) {
    if (ridersOf(dragon).length) return FlightMode.RIDER;
    const state = data(dragon);
    if (state.followActive) return FlightMode.V_FLIGHT;
    if (state.combatIntent?.flightTarget) return FlightMode.AUTONOMOUS;
    return FlightMode.GROUNDED;
  }

                                                                         
                                                                     
  function reconcile(dragon, state) {
    const now = system.currentTick;
    if (state.reconciled && now < state.nextReconcileTick) return;
    state.reconciled = true;
    state.nextReconcileTick = now + 20;
    if (!state.followActive && property(dragon, `${FLIGHT}v_flight_enabled`) === true) {
      safe(() => dragon.triggerEvent("dragonmounts2:on_vflight_disable"));
    }
  }

                                                                 
                                                                             
  function tick(dragon, { trusted = false } = {}) {
    if (!dragon?.isValid) return FlightMode.GROUNDED;
    const riders = ridersOf(dragon);
    const state = data(dragon);
    state.ageTicks += 1;
    state.motion = null;
    updateCrystalHealing(dragon, state);
    reconcile(dragon, state);
    const owner = ownerOf(dragon);
    if (owner) syncDragonOrder(dragon, owner, state);
    let behaviorFlying = false;
    let mode = FlightMode.GROUNDED;

    if (riders.length > 0) {
      stopFollow(dragon, "rider");
      mode = FlightMode.RIDER;
      if (dragon.isInWater) {
        resetRiderInputState(dragon, state);
        setMovement(dragon, "swimming", "water");
        noteModeChange(state, mode);
        return mode;
      }
      if (riders[0] instanceof Player && trusted) {
        updateRiderAttackProxy(dragon, riders[0]);
        updateRider(dragon, riders[0]);
      } else cleanupRiderAttackProxy(dragon);
      if (!hasController(dragon)) {
        idleLanding(dragon, owner, state, true);
        alignToMotion(dragon, state);
      } else state.motion = null;
      updateFlyingFlag(dragon, state, false, true);
      updateFlightRoll(dragon, state);
      noteModeChange(state, mode);
      return mode;
    }

    cleanupRiderAttackProxy(dragon);
    resetRiderInputState(dragon, state);
    state.momentum = 0;
    if (isSitting(dragon)) {
      stopFollow(dragon, "sitting");
      safe(() => dragon.triggerEvent("minecraft:on_wander"));
      state.restoreSitting = false;
      state.combatIntent = null;
      state.autonomousTarget = null;
      state.autonomousLastPosition = null;
      state.autonomousStallTicks = 0;
      state.autonomousEscapeTarget = null;
      state.motion = null;
      if (property(dragon, `${FLIGHT}movement_state`) !== "grounded") {
        setMovement(dragon, "grounded", "sitting");
      }
      safe(() => dragon.clearVelocity());
      noteModeChange(state, mode);
      return mode;
    }
                                                                             
    if (state.restoreSitting && !state.followActive && dragon.isOnGround &&
        property(dragon, `${FLIGHT}movement_state`) !== "flying") {
      state.restoreSitting = false;
      syncMobState(dragon, "sitting", true);
    }
    const intent = state.combatIntent;

    if (canUseFollow(dragon, owner, state)) {
      startFollow(dragon, state);
      tickFollow(dragon, owner, state);
      behaviorFlying = true;
      mode = FlightMode.V_FLIGHT;
    } else {
      stopFollow(dragon);
      if (intent?.flightTarget && !dragon.isInWater) {
        mode = FlightMode.AUTONOMOUS;
        behaviorFlying = true;
        setMovement(dragon, "flying", "combat");
        if (!intent.holdPosition) {
          moveAutonomousFlight(dragon, intent.flightTarget, state);
        } else {
          state.autonomousTarget = null;
          state.autonomousLastPosition = null;
          state.autonomousStallTicks = 0;
          state.autonomousEscapeTarget = null;
        }
      } else if (!intent?.flightTarget) {
        state.autonomousTarget = null;
        state.autonomousLastPosition = null;
        state.autonomousStallTicks = 0;
        state.autonomousEscapeTarget = null;
        idleLanding(dragon, owner, state);
      }
      if (intent?.lookTarget) {
        faceTarget(dragon, intent.lookTarget, intent.holdPosition === true);
      }
    }

    if (intent?.lookTarget) state.motion = null;                                  
    else alignToMotion(dragon, state);
    if (dragon.isInWater) {
      setMovement(dragon, "swimming", "water");
    } else {
      updateFlyingFlag(dragon, state, behaviorFlying, false);
    }
    updateFlightRoll(dragon, state);
    noteModeChange(state, mode);
    return mode;
  }

  function normalizeAfterTeleport(dragon) {
    if (!dragon?.isValid) return;
    stopFollow(dragon, "teleport");
    const state = data(dragon);
    state.flightTicks = 0;
    state.landTarget = null;
    state.jumpWasDown = false;
    safe(() => dragon.clearVelocity());
    setMovement(dragon, "grounded");
  }

  function resolveActiveMode(dragon) {
    return dragon?.isValid ? currentMode(dragon) : FlightMode.GROUNDED;
  }

  function getDragonActivity(dragon) {
    if (!dragon?.isValid) return "idle";
    if (ridersOf(dragon).length) return "controlled";
    if (isSitting(dragon)) return "sitting";
    if (data(dragon).combatIntent) return "fight";
    if (property(dragon, `${FLIGHT}is_sleeping`) === true) return "sleeping";
    return "idle";
  }

  return Object.freeze({
    FlightMode,
    MODE_PRIORITY,
    flyTowardTarget,
    setCombatIntent,
    tick,
    setMovement,
    debugLines,
    stopFollow,
    tickBreakIn,
    isTrusted,
    setTrusted,
    flightRank,
    setFlightRank,
    cycleFlightRank,
    assignFlightRank,
    getOrder,
    rankOfPid,
    placeRank,
    cycleRank,
    forgetDragon,
    isVFlightEnabled,
    setVFlightEnabled,
    isFormationFlightEnabled,
    setFormationFlightEnabled,
    trackFalls,
    cycleRiderAttackMode,
    cleanupRiderAttackProxy,
    sweepOrphanedAttackProxies,
    normalizeAfterTeleport,
    resolveActiveMode,
    getDragonActivity,
    ownerIsFlying,
    isDragonOwnedByPlayer,
  });
})();

export const dragonTypes = entityData.dragonTypes;
export function sweepOrphanedAttackProxies() {
  flightSystem.sweepOrphanedAttackProxies();
}
export function cycleRiderAttackMode(dragon, player) {
  return flightSystem.cycleRiderAttackMode(dragon, player);
}
const DRAGON_TYPES = entityData.dragonTypeIds;
const PLAYER_CACHE = { tick: -1, players: new Map() };
const DEBUG_PLAYERS = new Map();
const REPORTED_COMBAT_ERRORS = new WeakMap();
let lastMemoryCleanupTick = -Infinity;
const { FLIGHT_MODES, MODE_PRIORITY, DragonActivity } = entityData;

function safeExecute(callback) {
  try {
    return callback();
  } catch {
    return undefined;
  }
}

function refreshPlayerCache() {
  const currentTick = system.currentTick;
  if (PLAYER_CACHE.tick === currentTick) return;
  PLAYER_CACHE.tick = currentTick;
  PLAYER_CACHE.players.clear();
  for (const player of world.getAllPlayers()) {
    PLAYER_CACHE.players.set(player.id, player);
  }
}

function getPlayerById(playerId) {
  if (!playerId) return null;
  refreshPlayerCache();
  return PLAYER_CACHE.players.get(playerId) ?? null;
}

function readProperty(entity, propertyName, fallback = undefined) {
  return safeExecute(() => entity.getProperty(propertyName)) ?? fallback;
}

function writeProperty(entity, propertyName, value) {
  safeExecute(() => entity.setProperty(propertyName, value));
}

function readDynamicProperty(entity, propertyName, fallback = undefined) {
  return safeExecute(() => entity.getDynamicProperty(propertyName)) ?? fallback;
}

function writeDynamicProperty(entity, propertyName, value) {
  safeExecute(() => entity.setDynamicProperty(propertyName, value));
}

                                                                                
                                                                              
export function isBreakInTrusted(dragon) {
  return dragon?.isValid === true && flightSystem.isTrusted(dragon);
}

export function setBreakInTrusted(dragon, state) {
  return flightSystem.setTrusted(dragon, state === true);
}

export function getFlightRank(dragon) {
  return flightSystem.flightRank(dragon);
}

                                                  
                                                                   
export function getFormationOrder(player) {
  return flightSystem.getOrder(player);
}

                                                           
export function getFormationRank(player, pid) {
  return flightSystem.rankOfPid(player, pid);
}

                                                                            
                                                                     
export function setFormationRank(player, pid, rank) {
  return flightSystem.placeRank(player, pid, rank);
}

                                                             
export function cycleFormationRank(player, pid) {
  return flightSystem.cycleRank(player, pid);
}

                                                                         
export function forgetFormationDragon(ownerId, pid) {
  return flightSystem.forgetDragon(ownerId, pid);
}

export function setFlightRank(dragon, rank) {
  return flightSystem.setFlightRank(dragon, rank);
}

export function isVFlightEnabled(dragon) {
  return flightSystem.isVFlightEnabled(dragon);
}

export function setVFlightEnabled(dragon, enabled) {
  return flightSystem.setVFlightEnabled(dragon, enabled === true);
}

export function isFormationFlightEnabled(owner) {
  return flightSystem.isFormationFlightEnabled(owner);
}

export function setFormationFlightEnabled(owner, enabled) {
  return flightSystem.setFormationFlightEnabled(owner, enabled === true);
}

export function assignFlightRank(dragon, rank, ownerId) {
  return flightSystem.assignFlightRank(dragon, rank, ownerId);
}

export function cycleFlightRank(dragon, player) {
  return flightSystem.cycleFlightRank(dragon, player);
}

function isDragonOwnedByPlayer(dragon, playerId) {
  if (!dragon?.isValid || typeof playerId !== "string" || !playerId) {
    return false;
  }
  const tameable = safeExecute(() => dragon.getComponent("minecraft:tameable"));
  if (tameable?.isTamed !== true) return false;
  const tameOwnerId = tameable.tamedToPlayerId;
  if (typeof tameOwnerId === "string" && tameOwnerId) {
    return tameOwnerId === playerId;
  }
  return readDynamicProperty(dragon, "dragonmounts2:owner_identifier") === playerId;
}

function cleanupMemory() {
  const currentTick = system.currentTick;
  if (currentTick - lastMemoryCleanupTick < 20) return;
  lastMemoryCleanupTick = currentTick;
  for (const [playerId, value] of DEBUG_PLAYERS.entries()) {
    const player = getPlayerById(playerId);
    if (!player?.isValid || currentTick - (value.lastTick ?? 0) > 600) {
      DEBUG_PLAYERS.delete(playerId);
    }
  }
}

export function vectorLength(vector) {
  if (!vector) return 0;
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function rotationFromDirection(direction) {
  if (!direction) return null;
  const horizontal = Math.hypot(direction.x, direction.z);
  if (horizontal < 0.001) return null;
  const yaw = (-Math.atan2(direction.x, direction.z) * 180) / Math.PI;
  const pitch = (-Math.atan2(direction.y, horizontal) * 180) / Math.PI;
  return { x: pitch, y: ((yaw % 360) + 360) % 360, z: 0 };
}

export function shouldSyncRotation(currentRotation, targetRotation) {
  if (!currentRotation || !targetRotation) return true;
  const yawDelta = Math.abs(
    ((((targetRotation.y - currentRotation.y) % 360) + 540) % 360) - 180,
  );
  const pitchDelta = Math.abs(targetRotation.x - currentRotation.x);
  return yawDelta > 1 || pitchDelta > 2;
}

export function applyRotation(dragon, rotation) {
  if (!dragon?.isValid || !rotation) return;
  safeExecute(() => dragon.setRotation(rotation));
}

export function transitionMovementState(dragon, nextState, force = false) {
  if (!dragon?.isValid || !nextState) return false;
  return flightSystem.setMovement(dragon, nextState, "external", force);
}

function syncMobState(dragon, nextState, force = false) {
  if (!dragon?.isValid || !nextState) return false;
  const currentState =
    readProperty(dragon, "dragonmounts2:mob_state") ?? "standing";
  if (currentState === nextState && !force) return false;
  safeExecute(() => {
    if (nextState === "sitting") dragon.triggerEvent("minecraft:on_sit");
    else if (nextState === "standing")
      dragon.triggerEvent("minecraft:on_stand");
    else if (nextState === "wandering")
      dragon.triggerEvent("minecraft:on_wander");
  });
  writeProperty(dragon, "dragonmounts2:mob_state", nextState);
  return true;
}

function syncFollowState(dragon, shouldFollow, force = false) {
  if (!dragon?.isValid) return false;
  const currentState =
    readProperty(dragon, "dragonmounts2:is_following") === true;
  if (currentState === shouldFollow && !force) return false;
  writeProperty(dragon, "dragonmounts2:is_following", shouldFollow);
  safeExecute(() => {
    if (shouldFollow) dragon.triggerEvent("minecraft:on_follow");
    else if (readProperty(dragon, "dragonmounts2:mob_state") === "sitting")
      dragon.triggerEvent("minecraft:on_sit");
    else dragon.triggerEvent("minecraft:on_stand");
  });
  return true;
}

function updateSleepingState(dragon) {
  if (!dragon?.isValid) return;
  const rideable = dragon.getComponent("rideable");
  const riders = rideable?.getRiders?.() ?? [];
  const isSleeping = readProperty(dragon, "dragonmounts2:is_sleeping") === true;
  const tameable = dragon.getComponent("minecraft:tameable");
  const canSleep =
    (tameable?.isTamed !== true ||
      readProperty(dragon, "dragonmounts2:mob_state") === "sitting") &&
    readProperty(dragon, "dragonmounts2:movement_state") === "grounded" &&
    riders.length === 0 &&
    readProperty(dragon, "dragonmounts2:v_flight_enabled") !== true;

  if (isSleeping) {
    if (riders.length > 0 || !canSleep || Math.random() < 1 / 1200) {
      writeProperty(dragon, "dragonmounts2:is_sleeping", false);
      safeExecute(() => dragon.triggerEvent("dragonmounts2:on_wake"));
    }
    return;
  }

  if (canSleep && Math.random() < 1 / 1200) {
    writeProperty(dragon, "dragonmounts2:is_sleeping", true);
    safeExecute(() => {
      dragon.triggerEvent("dragonmounts2:on_sleep");
      dragon.clearVelocity();
    });
  }
}

function wakeDragon(dragon) {
  if (!dragon?.isValid) return;
  if (readProperty(dragon, "dragonmounts2:is_sleeping") !== true) return;
  writeProperty(dragon, "dragonmounts2:is_sleeping", false);
  safeExecute(() => dragon.triggerEvent("dragonmounts2:on_wake"));
}

function markPlayerRodeDragon(player, dragon) {
  if (!player?.isValid || !dragon?.isValid) return;
  safeExecute(() =>
    player.setDynamicProperty("dragonmounts2:last_ridden_dragon_id", dragon.id),
  );
}

                                                                          
export function restoreOwnedDragonFlightState(player) {
  if (!player?.isValid) return;
  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    const dimension = world.getDimension(dimensionId);
    for (const dragon of dimension.getEntities(dragonTypes)) {
      if (!dragon?.isValid) continue;
      const ownerName = readDynamicProperty(dragon, "dragonmounts2:owner_name");
      if (
        typeof ownerName !== "string" ||
        ownerName.toLowerCase() !== player.name.toLowerCase()
      ) continue;
      writeDynamicProperty(dragon, "dragonmounts2:owner_identifier", player.id);
    }
  }
}

export function toggleFlightDebug(player) {
  if (!player?.isValid) return false;
  if (DEBUG_PLAYERS.has(player.id)) {
    DEBUG_PLAYERS.delete(player.id);
    player.onScreenDisplay.setActionBar({
      rawtext: [{ translate: "tooltip.dragonmounts2:debug.off" }],
    });
    return false;
  }

  DEBUG_PLAYERS.set(player.id, {
    lastTick: system.currentTick,
    speedTotal: 0,
    sampleCount: 0,
  });
  player.onScreenDisplay.setActionBar({
    rawtext: [{ translate: "tooltip.dragonmounts2:debug.on" }],
  });
  return true;
}

export function tickFlightDebug() {
  cleanupMemory();
  for (const [playerId, state] of DEBUG_PLAYERS) {
    const player = getPlayerById(playerId);
    if (!player?.isValid) {
      DEBUG_PLAYERS.delete(playerId);
      continue;
    }
    const dragon = player.getComponent("minecraft:riding")?.entityRidingOn;
    if (dragon?.isValid) {
      const velocity = getSafeVelocity(dragon);
      const speed = Math.hypot(velocity.x, velocity.z) * 20;
      if (Number.isFinite(speed)) {
        state.speedTotal += speed;
        state.sampleCount++;
      }
    }
    if (system.currentTick - state.lastTick < 20) continue;
    const lines = [];
    if (state.sampleCount > 0) {
      lines.push(`Speed: ${(state.speedTotal / state.sampleCount).toFixed(2)} b/s`);
    }
    lines.push(...flightSystem.debugLines(player));
    if (lines.length === 0) lines.push("Flight debug: no dragons nearby");
    player.onScreenDisplay.setActionBar({
      rawtext: [{ text: lines.join("\n") }],
    });
    state.lastTick = system.currentTick;
    state.speedTotal = 0;
    state.sampleCount = 0;
  }
}

function getDragonRiders(dragon) {
  return dragon?.getComponent("rideable")?.getRiders?.() ?? [];
}

function saveFlightSnapshot(dragon) {
  if (!dragon?.isValid) return;
  if (readProperty(dragon, "dragonmounts2:movement_state") !== "flying") return;
  const location = dragon.location;
  writeDynamicProperty(dragon, "dragonmounts2:flight_last_x", location.x);
  writeDynamicProperty(dragon, "dragonmounts2:flight_last_y", location.y);
  writeDynamicProperty(dragon, "dragonmounts2:flight_last_z", location.z);
  writeDynamicProperty(dragon, "dragonmounts2:flight_last_dimension", dragon.dimension.id);
}

export function normalizeDragonAfterTeleport(dragon) {
  if (!dragon?.isValid) return;
  flightSystem.normalizeAfterTeleport(dragon);
  const wasSitting = readProperty(dragon, "dragonmounts2:mob_state") === "sitting";
  const wasFollowing = readProperty(dragon, "dragonmounts2:is_following") === true;
  safeExecute(() => dragon.clearVelocity());
  transitionMovementState(dragon, "grounded", true);
  if (wasSitting) {
    syncFollowState(dragon, false, true);
    syncMobState(dragon, "sitting", true);
  } else if (wasFollowing) {
    syncFollowState(dragon, true, true);
    syncMobState(dragon, "standing", false);
  } else {
    syncFollowState(dragon, false, true);
    syncMobState(dragon, "standing", true);
  }
}

export function dragonsMainComponents(dragon) {
  if (!dragon?.isValid || !DRAGON_TYPES.has(dragon.typeId)) return;
  cleanupMemory();
  saveFlightSnapshot(dragon);
  updateSleepingState(dragon);

  const rideable = dragon.getComponent("rideable");
  const tameable = dragon.getComponent("minecraft:tameable");
  if (tameable?.isTamed) {
                                                          
    const owner = tameable.tamedToPlayer;
    const ownerName = owner?.name;
    const ownerId = owner?.id ?? tameable.tamedToPlayerId;
    if (ownerName && readDynamicProperty(dragon, "dragonmounts2:owner_name") !== ownerName) {
      writeDynamicProperty(dragon, "dragonmounts2:owner_name", ownerName);
    }
    if (ownerId && readDynamicProperty(dragon, "dragonmounts2:owner_identifier") !== ownerId) {
      writeDynamicProperty(dragon, "dragonmounts2:owner_identifier", ownerId);
    }
  }

  const riders = rideable ? getDragonRiders(dragon) : [];
  const rider = riders[0];
  const trusted = isBreakInTrusted(dragon);

                                                                              
                                                      
  if (rider instanceof Player && !(tameable?.isTamed === true && trusted)) {
    flightSystem.tickBreakIn(dragon, rider);
      return;
  }

  if (rider instanceof Player && trusted && safeExecute(() => dragon.hasComponent("minecraft:is_saddled")) === true) {
    writeDynamicProperty(dragon, "dragonmounts2:last_rider_id", rider.id);
    writeDynamicProperty(dragon, "dragonmounts2:last_ridden_tick", system.currentTick);
    markPlayerRodeDragon(rider, dragon);
  }

  flightSystem.tick(dragon, { trusted });
}

export function tickDragon(dragon) {
  if (!dragon || !DRAGON_TYPES.has(dragon.typeId)) return;
  if (!dragon.isValid) {
    flightSystem.cleanupRiderAttackProxy(dragon);
    return;
  }
  let combatIntent = null;
  try {
    combatIntent = tickDragonCombat(dragon);
    REPORTED_COMBAT_ERRORS.delete(dragon);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (REPORTED_COMBAT_ERRORS.get(dragon) !== message) {
      REPORTED_COMBAT_ERRORS.set(dragon, message);
      console.warn(`[DragonMounts2] Dragon combat update failed for ${dragon.typeId}: ${message}`);
    }
  }
  flightSystem.setCombatIntent(dragon, combatIntent);
  dragonsMainComponents(dragon);
}

                                                        
export const DragonFlightController = Object.freeze({
  MODE_PRIORITY: flightSystem.MODE_PRIORITY,
  FlightMode: flightSystem.FlightMode,
  DragonActivity,
  resolveActiveMode: flightSystem.resolveActiveMode,
  getActiveFlightMode: flightSystem.resolveActiveMode,
  getDragonActivity: flightSystem.getDragonActivity,
  tickDragon,
  cleanupRiderAttackProxy: flightSystem.cleanupRiderAttackProxy,
});

                                                                            
                                                            
export function tickFallRescue() {
  cleanupMemory();
  flightSystem.trackFalls();
}

export function handleDragonOwnerLeave(playerId) {
  DEBUG_PLAYERS.delete(playerId);
}

export function handleDragonHurt(hurtEntity) {
  if (!hurtEntity?.isValid || !DRAGON_TYPES.has(hurtEntity.typeId)) return;
  wakeDragon(hurtEntity);
}

function resolveActiveMode(dragon, context = {}) {
  return flightSystem.resolveActiveMode(dragon, context);
}
function getActiveFlightMode(dragon, context = {}) {
  return flightSystem.resolveActiveMode(dragon, context);
}
function getDragonActivity(dragon) {
  return flightSystem.getDragonActivity(dragon);
}

export {
  resolveActiveMode,
  getActiveFlightMode,
  getDragonActivity,
  DragonActivity,
  FLIGHT_MODES,
  MODE_PRIORITY,
};
