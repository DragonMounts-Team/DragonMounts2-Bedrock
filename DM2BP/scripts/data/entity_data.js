import * as dragonArrays from "../arrays/dragon_arrays.js";

export const dragonVariantDenyTypes = {};

export const dragonEggTypes = {
  "dragonmounts2:aether_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:aether_dragon_egg",
    deny: "dragonmounts2:aether_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:glowstone"],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:dark_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:dark_dragon_egg",
    deny: "dragonmounts2:dark_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:obsidian"],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:enchanted_dragon_egg": {
    hatch_method: "single",
    egg_type: "dragonmounts2:enchanted_dragon_egg",
    deny: "dragonmounts2:enchanted_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:bookshelf"],
        location: { x: 0, y: -1, z: 0 },
      },
    },
  },
  "dragonmounts2:ender_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:ender_dragon_egg",
    deny: "dragonmounts2:ender_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:end_stone"],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:fire_dragon_egg": {
    hatch_method: "ring",
    egg_type: "dragonmounts2:fire_dragon_egg",
    deny: "dragonmounts2:fire_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:fire"],
        xz_locations: [
          { x: -1, z: -1 },
          { x: 0, z: -1 },
          { x: 1, z: -1 },
          { x: -1, z: 0 },
          { x: 1, z: 0 },
          { x: -1, z: 1 },
          { x: 0, z: 1 },
          { x: 1, z: 1 },
        ],
        y_location: 0,
      },
      second_method: {
        blocks: ["minecraft:lava", "minecraft:flowing_lava"],
        xz_locations: [
          { x: -1, z: -1 },
          { x: 0, z: -1 },
          { x: 1, z: -1 },
          { x: -1, z: 0 },
          { x: 1, z: 0 },
          { x: -1, z: 1 },
          { x: 0, z: 1 },
          { x: 1, z: 1 },
        ],
        y_location: -1,
      },
    },
  },
  "dragonmounts2:forest_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:forest_dragon_egg",
    deny: "dragonmounts2:forest_dragon_egg",
    block_placement: {
      first_method: {
        blocks: [
          "minecraft:oak_leaves",
          "minecraft:spruce_leaves",
          "minecraft:birch_leaves",
          "minecraft:jungle_leaves",
          "minecraft:acacia_leaves",
          "minecraft:dark_oak_leaves",
          "minecraft:mangrove_leaves",
          "minecraft:cherry_leaves",
          "minecraft:pale_oak_leaves",
          "minecraft:azalea_leaves",
          "minecraft:azalea_leaves_flowered",
        ],
        tags: ["log"],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:ice_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:ice_dragon_egg",
    deny: "dragonmounts2:ice_dragon_egg",
    block_placement: {
      first_method: {
        blocks: [
          "minecraft:frosted_ice",
          "minecraft:ice",
          "minecraft:packed_ice",
          "minecraft:blue_ice",
          "minecraft:snow",
          "minecraft:powder_snow",
        ],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:light_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:light_dragon_egg",
    deny: "dragonmounts2:light_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:quartz_block"],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:moonlight_dragon_egg": {
    hatch_method: "single",
    egg_type: "dragonmounts2:moonlight_dragon_egg",
    deny: "dragonmounts2:moonlight_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:daylight_detector_inverted"],
        location: { x: 0, y: -1, z: 0 },
      },
    },
  },
  "dragonmounts2:nether_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:nether_dragon_egg",
    deny: "dragonmounts2:nether_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:magma"],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:sculk_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:sculk_dragon_egg",
    deny: "dragonmounts2:sculk_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:sculk"],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
      second_method: {
        blocks: ["minecraft:sculk_catalyst"],
        start_xz_locations: { x: 0, z: 0 },
        end_xz_locations: { x: 0, z: 0 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:skeleton_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:skeleton_dragon_egg",
    deny: "dragonmounts2:skeleton_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:bone_block"],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:storm_dragon_egg": {
    hatch_method: "single",
    egg_type: "dragonmounts2:storm_dragon_egg",
    deny: "dragonmounts2:storm_dragon_egg",
    block_placement: {
      first_method: {
        blocks: [
          "minecraft:lightning_rod",
          "minecraft:exposed_lightning_rod",
          "minecraft:weathered_lightning_rod",
          "minecraft:oxidized_lightning_rod",
          "minecraft:waxed_lightning_rod",
          "minecraft:waxed_exposed_lightning_rod",
          "minecraft:waxed_weathered_lightning_rod",
          "minecraft:waxed_oxidized_lightning_rod",
        ],
        location: { x: 0, y: -1, z: 0 },
      },
    },
  },
  "dragonmounts2:sunlight_dragon_egg": {
    hatch_method: "single",
    egg_type: "dragonmounts2:sunlight_dragon_egg",
    deny: "dragonmounts2:sunlight_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:daylight_detector"],
        location: { x: 0, y: -1, z: 0 },
      },
    },
  },
  "dragonmounts2:terra_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:terra_dragon_egg",
    deny: "dragonmounts2:terra_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:sand", "minecraft:red_sand"],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
  "dragonmounts2:water_dragon_egg": {
    hatch_method: "ring",
    egg_type: "dragonmounts2:water_dragon_egg",
    deny: ["dragonmounts2:water_dragon_egg", "dragonmounts2:ice_dragon_egg"],
    block_placement: {
      first_method: {
        blocks: ["minecraft:water", "minecraft:flowing_water"],
        xz_locations: [
          { x: -1, z: -1 },
          { x: 0, z: -1 },
          { x: 1, z: -1 },
          { x: -1, z: 0 },
          { x: 1, z: 0 },
          { x: -1, z: 1 },
          { x: 0, z: 1 },
          { x: 1, z: 1 },
        ],
        y_location: -1,
      },
    },
  },
  "dragonmounts2:wither_dragon_egg": {
    hatch_method: "ring",
    egg_type: "dragonmounts2:wither_dragon_egg",
    deny: "dragonmounts2:wither_dragon_egg",
    block_placement: {
      first_method: {
        blocks: ["minecraft:wither_rose"],
        xz_locations: [
          { x: -1, z: -1 },
          { x: 0, z: -1 },
          { x: 1, z: -1 },
          { x: -1, z: 0 },
          { x: 1, z: 0 },
          { x: -1, z: 1 },
          { x: 0, z: 1 },
          { x: 1, z: 1 },
        ],
        y_location: 0,
      },
    },
  },
  "dragonmounts2:zombie_dragon_egg": {
    hatch_method: "radius",
    egg_type: "dragonmounts2:zombie_dragon_egg",
    deny: "dragonmounts2:zombie_dragon_egg",
    block_placement: {
      first_method: {
        blocks: [
          "minecraft:mossy_cobblestone",
          "minecraft:nether_wart_block",
          "minecraft:soul_sand",
          "minecraft:soul_soil",
        ],
        start_xz_locations: { x: -1, z: -1 },
        end_xz_locations: { x: 1, z: 1 },
        y_location: -1,
      },
    },
  },
};

export const dragonTypes = { families: ["dragon"] };
export const dragonTypeIds = new Set(dragonArrays.dragonTypesList);

export const BREAK_IN_TRUST_PROPERTY = "dragonmounts2:break_in_trust";
export const BREAK_IN_RIDES_TO_TAME = 5;
export const BREAK_IN_SUCCESS_TICKS = 60;
export const BREAK_IN_MIN_TICKS = 70;
export const BREAK_IN_MAX_TICKS = 160;
export const BREAK_IN_CLIMB_TICKS = 120;
export const BREAK_IN_SWEEP_RADIUS = 24;
export const BREAK_IN_SWEEP_HEIGHT = 40;
export const BREAK_IN_SWEEP_SPEED = 2;
export const BREAK_IN_SWEEP_RATE = 0.12;
export const BREAK_IN_SWEEP_Z_RATE = 0.6;

// ---- Java parity constants (NeoDragonMounts). See JAVA_FLIGHT_SPEC.md ----
// Liftoff: flightTicks advances by 2 per airborne tick, flying once > 10.
export const LIFTOFF_THRESHOLD = 10;
export const NEAR_GROUND_FACTOR = 0.25;
export const JAVA_JUMP_POWER = 0.42;
// Java adult hitbox (DMEntities sized(3.0, 2.5)); scaled by life stage.
export const JAVA_DRAGON_WIDTH = 3.0;
export const JAVA_DRAGON_HEIGHT = 2.5;
export const JUVENILE_SIZE = 0.8; // DragonLifeStage.JUVENILE average size
export const FORMATION_RANGE = 12;
export const REJOIN_RANGE = 64;
export const OWNER_FOLLOW_RANGE = 35;
export const FLOCK_RADIUS = 96;
export const MAX_FLIGHT_RANK = 4;
export const FORMATION_MAX_DRAGONS = 4;
// One cruise speed for ALL script-driven flight (ridden, formation, catch,
// break-in, landing) so nothing is faster than normal flight.
export const RIDDEN_BASE_SPEED = 0.9;
export const FLIGHT_CRUISE_SPEED = 0.9;
export const FLIGHT_RESPONSE = 0.45;
export const DISMOUNT_SNEAK_GRACE = 20;
// Catching: the dragon reacts after a short delay, then dives "slightly fast".
// Patch B: the catch scales with how close the ground is (see the adaptive
// catch profile in dragon_utilities.js). Reaction time runs from the moment the
// fall passes CATCH_MIN_FALL blocks; closing speed is relative to the owner.
export const CATCH_MIN_FALL = 4;
export const CATCH_REACTION_CALM = 14; // ticks, ground far away
export const CATCH_REACTION_URGENT = 5; // ticks, impact imminent
export const CATCH_CLOSING_CALM = 0.9; // blocks per tick relative to the owner
export const CATCH_CLOSING_URGENT = 2.2;
export const CATCH_CLOSING_RAMP_TICKS = 8; // calm; shortens to CATCH_CLOSING_RAMP_URGENT as impact nears
export const CATCH_CLOSING_RAMP_URGENT = 3;
export const CATCH_CAPTURE_RADIUS = 2.2;
export const CATCH_FAILSAFE_RADIUS = 1.5;
export const CATCH_FAILSAFE_FAILS = 3;
export const CATCH_TIMEOUT = 80;
export const CATCH_MIN_TICKS_FROM_RELEASE = 16; // never mount sooner than about 0.8 s after release
export const CATCH_LAST_RIDDEN_BONUS = 10; // ticks of ETA
export const CATCH_RAY_DISTANCE = 96;
export const CATCH_URGENT_ETA = 20; // ticks to impact at which urgency is 1
export const CATCH_CALM_ETA = 60; // ticks to impact at which urgency is 0
export const CATCH_SAFETY_NET = false; // slow_falling when no catcher can make it
// Everything (formation, elytra following, catching) stops once the owner has
// been standing on the ground this long, and resumes only after this many
// consecutive airborne ticks.
export const GROUND_DISABLE_TICKS = 5;
export const GROUND_LEAVE_TICKS = 2;
export const GROUND_RAY_DISTANCE = 0.35;
export const GROUND_SLOW_SPEED = 0.08;
// A dragon hovers near an airborne owner at most this long before landing.
export const HOVER_GRACE_TICKS = 60;
// Patch A: formation lane changes (no teleports; the dragon rises over the
// others, then eases back down).
export const LANE_CHANGE_RISE = 2.5;
export const LANE_CHANGE_EASE = 0.0625;
// Body roll (script driven; the client animation reads dragonmounts2:flight_roll).
// roll = clamp(yaw rate [deg/tick] * GAIN * speed factor), smoothed by SMOOTHING.
export const FLIGHT_ROLL_GAIN = 1.4;
export const FLIGHT_ROLL_SMOOTHING = 0.12;
export const FLIGHT_ROLL_MAX = 30;
export const FLIGHT_ROLL_FULL_SPEED = 0.6; // blocks/tick at which the roll reaches full gain
export const RIDDEN_RESPONSE = 0.45;
// Dynamic ridden flight: speed builds with sustained forward flight
// (momentum), dives are faster, climbs slower, sharp turns bleed speed, and
// acceleration is smoother than braking.
export const RIDE_MOMENTUM_GAIN = 1 / 60; // 3 s of steady flight to full momentum
export const RIDE_MOMENTUM_DECAY = 1 / 30; // 1.5 s to lose it when the controls are released
export const RIDE_TURN_BLEED = 0.02; // momentum lost per tick in a sharp turn
export const RIDE_SPEED_LOW = 0.8; // multiplier at zero momentum
export const RIDE_SPEED_HIGH = 1.3; // multiplier at full momentum
export const RIDE_DIVE_BONUS = 0.35;
export const RIDE_CLIMB_PENALTY = 0.2;
export const RIDE_ACCEL_RESPONSE = 0.22;
export const RIDE_BRAKE_RESPONSE = 0.38;
export const RIDE_MAX_SPEED = 1.9; // blocks per tick, keeps chunk loading ahead of the dragon
export const DISMOUNT_CATCH_TICKS = 200;
// Dragons trusted by the pre-parity pack only carry a dynamic property and
// cannot be told apart from properly broken-in ones. Off = they must be
// broken in again (or use /dragonmounts2:trust).
export const MIGRATE_LEGACY_TRUST = false;

export const FLIGHT_MODES = Object.freeze({
  GROUNDED: "grounded",
  AUTONOMOUS: "autonomous",
  V_FLIGHT: "v_flight",
  RIDER: "rider",
});

export const MODE_PRIORITY = Object.freeze({
  grounded: 0,
  autonomous: 10,
  v_flight: 30,
  rider: 40,
});

export const DragonActivity = Object.freeze({
  CORE: "core",
  IDLE: "idle",
  CONTROLLED: "controlled",
  SITTING: "sitting",
  SLEEPING: "sleeping",
  FIGHT: "fight",
  SWIMMING: "swimming",
});
