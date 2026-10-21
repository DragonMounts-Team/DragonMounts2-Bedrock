import { BlockPermutation } from "@minecraft/server";
import {
  airflowDestroyDensity,
  BREATH_CONFIG,
  BREATH_SMELT_RESULTS,
  blockFlammability,
  FOREST_SPARED_FAMILIES,
  FOREST_SPARED_TYPES,
  FUNGAL_BLOCKS,
  FUNGAL_FLAMMABILITY,
  LIGHTNING_PROFILES,
  MELT_THRESHOLD,
  REPLACEABLE_BLOCKS,
  SOLID_IGNITION_THRESHOLD,
} from "../data/breath_data.js";
import { getWorldEnvironmentalEffectsEnabled } from "../data/settings.js";
import { spawnParticle } from "./particle_utilities.js";

                                                                                 
                                                                                     
                  
  
                                                                             
                                                                                     
                                                                 
                                                                        
                                                                                 
                                                                            

                                       
export const FACE_DOWN = 0;
export const FACE_UP = 1;
export const FACE_NORTH = 2;
export const FACE_SOUTH = 3;
export const FACE_WEST = 4;
export const FACE_EAST = 5;
export const FACE_OFFSETS = Object.freeze([
  [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0],
]);

                                                                                    
                                                                                  
export const MAX_FIRES_PER_TICK = 3;
export const MAX_SMELTS_PER_TICK = 4;
export const MAX_MELTS_PER_TICK = 6;
export const MAX_PUDDLES_PER_TICK = 6;
export const MAX_SNOW_PER_TICK = 10;
export const MAX_DESTROYS_PER_TICK = 12;
export const MAX_FIZZ_PER_TICK = 2;

export function newCounters() {
  return { fires: 0, smelts: 0, melts: 0, puddles: 0, snow: 0, destroys: 0, fizz: 0 };
}

                                                                               
const BLOCK_DECAY_FACTOR_PER_TICK = 0.9;
const BLOCK_RESET_EFFECT_THRESHOLD = 0.01;
const TICKS_BEFORE_DECAY_STARTS = 10;

export function createAffectedBlock(key, x, y, z, block) {
  return { key, x, y, z, block, faces: new Float32Array(6), idle: 0, touchedAt: -1 };
}

                                                                             
export function addHitDensity(record, face, increase) {
  const faces = record.faces;
  if (face < 0) {
    const share = increase / 6;
    for (let i = 0; i < 6; i++) faces[i] += share;
  } else {
    faces[face] += increase;
  }
  record.idle = 0;
}

export function maxDensity(record) {
  const faces = record.faces;
  let max = 0;
  for (let i = 0; i < 6; i++) if (faces[i] > max) max = faces[i];
  return max;
}

export function resetAffectedBlock(record) {
  record.faces.fill(0);
}

                                                                                              
export function decayAffectedBlock(record) {
  const faces = record.faces;
  let live = false;
  if (++record.idle < TICKS_BEFORE_DECAY_STARTS) {
    for (let i = 0; i < 6; i++) if (faces[i] >= BLOCK_RESET_EFFECT_THRESHOLD) return false;
    return true;
  }
  for (let i = 0; i < 6; i++) {
    faces[i] *= BLOCK_DECAY_FACTOR_PER_TICK;
    if (faces[i] < BLOCK_RESET_EFFECT_THRESHOLD) faces[i] = 0;
    else live = true;
  }
  return !live;
}

   
                                                                                            
                                                                                        
   
export function intersectedFace(ox, oy, oz, hx, hy, hz) {
  const EPS = 1e-7;
  const dx = hx - ox;
  const dy = hy - oy;
  const dz = hz - oz;
  let bestT = -Infinity;
  let face = -1;
  if (Math.abs(dx) > EPS) {
    const t = ((dx > 0 ? Math.floor(hx) : Math.ceil(hx)) - ox) / dx;
    if (t > bestT) { bestT = t; face = dx > 0 ? FACE_WEST : FACE_EAST; }
  }
  if (Math.abs(dy) > EPS) {
    const t = ((dy > 0 ? Math.floor(hy) : Math.ceil(hy)) - oy) / dy;
    if (t > bestT) { bestT = t; face = dy > 0 ? FACE_DOWN : FACE_UP; }
  }
  if (Math.abs(dz) > EPS) {
    const t = ((dz > 0 ? Math.floor(hz) : Math.ceil(hz)) - oz) / dz;
    if (t > bestT) { bestT = t; face = dz > 0 ? FACE_NORTH : FACE_SOUTH; }
  }
  return face;
}

                                                                                 
const WATER_BLOCKS = new Set(["minecraft:water", "minecraft:flowing_water"]);
const LAVA_BLOCKS = new Set(["minecraft:lava", "minecraft:flowing_lava"]);
const FIRE_BLOCKS = new Set(["minecraft:fire", "minecraft:soul_fire"]);
const MELTABLE_BLOCKS = new Set([
  "minecraft:ice", "minecraft:packed_ice", "minecraft:blue_ice", "minecraft:frosted_ice",
  "minecraft:snow", "minecraft:snow_layer", "minecraft:powder_snow",
]);
let flowingWater;

function state(block, name) {
  try {
    return block.permutation.getState(name);
  } catch {
    return undefined;
  }
}

function setState(block, name, value) {
  const states = block.permutation.getAllStates();
  if (!Object.prototype.hasOwnProperty.call(states, name) || states[name] === value) return false;
  block.setPermutation(block.permutation.withState(name, value));
  return true;
}

function isCandle(id) {
  return id.includes("candle");
}

function isCampfire(id) {
  return id === "minecraft:campfire" || id === "minecraft:soul_campfire";
}

function isLeaves(id) {
  return id.endsWith("_leaves") || id === "minecraft:leaves" || id === "minecraft:leaves2";
}

function isReplaceable(block) {
  return block.isAir || REPLACEABLE_BLOCKS.has(block.typeId);
}

                                                                                          
function extinguishLit(block) {
  const id = block.typeId;
  if (isCandle(id)) return state(block, "lit") === true && setState(block, "lit", false);
  if (isCampfire(id)) return state(block, "extinguished") === false && setState(block, "extinguished", true);
  return false;
}

                                                                 
function lightUnlit(block) {
  const id = block.typeId;
  if (isCandle(id)) return state(block, "lit") === false && setState(block, "lit", true);
  if (isCampfire(id)) return state(block, "extinguished") === true && setState(block, "extinguished", false);
  return false;
}

function fizz(ctx, block) {
  if (ctx.counters.fizz >= MAX_FIZZ_PER_TICK) return;
  ctx.counters.fizz += 1;
  const { x, y, z } = block.location;
  try {
    ctx.dimension.playSound("random.fizz", { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, { volume: 0.5 });
    spawnParticle(ctx.dimension, "minecraft:basic_smoke_particle", {
      x: x + 0.5,
      y: y + 1,
      z: z + 0.5,
    });
  } catch {
                      
  }
}

function quenchLava(ctx, block) {
  if (!BREATH_CONFIG.quenchingBreath) return false;
  const source = state(block, "liquid_depth");
  block.setType(source === undefined || source === 0 ? "minecraft:obsidian" : "minecraft:cobblestone");
  fizz(ctx, block);
  return true;
}

function placeFlowingWater(block) {
  try {
    flowingWater ??= BlockPermutation.resolve("minecraft:flowing_water", { liquid_depth: 1 });
    block.setPermutation(flowingWater);
  } catch {
    block.setType("minecraft:flowing_water");
  }
}

   
                                                                                           
                                                                                             
                                                                             
   
function spreadTemporaryWater(ctx, block) {
  if (ctx.counters.puddles >= MAX_PUDDLES_PER_TICK) return false;
  const { x, y, z } = block.location;
  for (const dy of [1, 0, -1]) {
    const candidate = dy === 0 ? block : ctx.at(x, y + dy, z);
    if (!candidate || candidate.isLiquid || !isReplaceable(candidate)) continue;
    const below = ctx.at(x, y + dy - 1, z);
    if (!below || !(below.isSolid || below.isLiquid)) continue;
    placeFlowingWater(candidate);
    ctx.counters.puddles += 1;
    return true;
  }
  return false;
}

                                                                                 
function ignitionThreshold(block) {
  const id = block.typeId;
  const flammability = blockFlammability(id);
  if (flammability > 0) return 15 / flammability;
  if (FUNGAL_BLOCKS.has(id)) return 15 / FUNGAL_FLAMMABILITY;
                                                                              
  if (block.isSolid) return SOLID_IGNITION_THRESHOLD;
  return Infinity;
}

                                                                                       
function meltBlock(ctx, record, block) {
  const id = block.typeId;
  if (!MELTABLE_BLOCKS.has(id)) return false;
  if (!BREATH_CONFIG.ignitingBreath && !BREATH_CONFIG.smeltingBreath) return false;
  if (maxDensity(record) < MELT_THRESHOLD) return false;
  if (ctx.counters.melts >= MAX_MELTS_PER_TICK) return false;
  ctx.counters.melts += 1;
  const height = id === "minecraft:snow_layer" ? state(block, "height") : undefined;
  if (typeof height === "number" && height > 0) setState(block, "height", height - 1);
  else block.setType("minecraft:air");
  fizz(ctx, block);
  spreadTemporaryWater(ctx, block);
  return true;
}

function burnBlock(ctx, block) {
  block.setType(ctx.env.fireBlockId());
  if (ctx.counters.fires === 1) {
    const { x, y, z } = block.location;
    try {
      ctx.dimension.playSound("fire.ignite", { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, {
        volume: 1,
        pitch: 0.8 + Math.random() * 0.4,
      });
    } catch {
                        
    }
  }
}

function affectFireBlock(ctx, record, nether) {
  const block = record.block;
  if (lightUnlit(block)) return true;
  if (meltBlock(ctx, record, block)) return true;
  const igniting = BREATH_CONFIG.ignitingBreath;
  const smelting = BREATH_CONFIG.smeltingBreath;
  if (!igniting && !smelting) return false;

  let consume = false;
  let max = 0;
  const skipChance = nether ? 0.1875 : 0.0625;
  const { x, y, z } = record;
  for (let face = 0; face < 6; face++) {
    const density = record.faces[face];
    if (density <= 0) continue;
    if (density > max) max = density;
    if (!igniting || density < ignitionThreshold(block)) continue;
    if (Math.random() < skipChance || ctx.counters.fires >= MAX_FIRES_PER_TICK) continue;
    const [ox, oy, oz] = FACE_OFFSETS[face];
    const side = ctx.at(x + ox, y + oy, z + oz);
    if (side?.isAir) {
      ctx.counters.fires += 1;
      consume = true;
      burnBlock(ctx, side);
    }
  }
  if (smelting && max > (nether ? 0.25 : 0.5)) {
    consume = true;
    const smelted = BREATH_SMELT_RESULTS.get(block.typeId);
    if (smelted && ctx.counters.smelts < MAX_SMELTS_PER_TICK) {
      ctx.counters.smelts += 1;
      block.setType(smelted);
    }
  }
  return consume;
}

                                                                                
const SNOW_LAYER_THRESHOLD = 0.02;
                                                                                         
                                                                                    
function isSnowSupport(block) {
  if (block.isAir || block.isLiquid || isReplaceable(block)) return false;
  if (FIRE_BLOCKS.has(block.typeId) || block.typeId === "minecraft:snow_layer") return false;
  return true;
}
function layerSnow(ctx, block) {
  const id = block.typeId;
  let target;
  if (isReplaceable(block)) target = block;
  else if (isSnowSupport(block)) target = ctx.at(block.location.x, block.location.y + 1, block.location.z);
  else return;
  if (!target) return;
                                                                          
  const { x, y, z } = target.location;
  const below = ctx.at(x, y - 1, z);
  if (!below || !isSnowSupport(below)) return;
  if (ctx.counters.snow >= MAX_SNOW_PER_TICK) return;
  if (target.typeId === "minecraft:snow_layer") {
    const height = state(target, "height");
    if (typeof height === "number" && height < 7) {
      setState(target, "height", height + 1);
      ctx.counters.snow += 1;
    }
  } else if (isReplaceable(target)) {
    target.setType("minecraft:snow_layer");
    ctx.counters.snow += 1;
  }
}

function affectIceBlock(ctx, record) {
  const block = record.block;
  const id = block.typeId;
  if (LAVA_BLOCKS.has(id)) {
    if (!quenchLava(ctx, block)) return false;
  } else if (id === "minecraft:water") {
    if (state(block, "liquid_depth") !== 0) return false;                            
    block.setType(BREATH_CONFIG.frostyBreath ? "minecraft:ice" : "minecraft:frosted_ice");
  } else if (extinguishLit(block)) {
              
  } else if (FIRE_BLOCKS.has(id)) {
    block.setType("minecraft:air");
  } else if (BREATH_CONFIG.frostyBreath && !block.isLiquid) {
                                                                     
    if (maxDensity(record) < SNOW_LAYER_THRESHOLD) return false;
    layerSnow(ctx, block);
  }
  return true;
}

                                                                                 
function affectWaterBlock(ctx, record) {
  const block = record.block;
  const id = block.typeId;
  if (LAVA_BLOCKS.has(id)) {
    if (!quenchLava(ctx, block)) return false;
  } else if (extinguishLit(block)) {
              
  } else if (FIRE_BLOCKS.has(id)) {
    block.setType("minecraft:air");
  } else if (id === "minecraft:farmland") {
    const moisture = state(block, "moisturized_amount");
    if (typeof moisture === "number") {
      if (moisture >= 7) return false;
      setState(block, "moisturized_amount", moisture + 1);
    }
  } else {
    spreadTemporaryWater(ctx, block);
  }
  return true;
}

                                                                                   
const STRIKE_INTERVAL = 20;
const STRIKE_CHANCE = 0.06;
const MIN_STRIKE_DISTANCE_SQ = 25;
function tryStrike(ctx, block) {
  const memo = ctx.memo;
  if (ctx.now < (memo.nextStrikeAt ?? 0) || Math.random() >= STRIKE_CHANCE) return;
  const { x, y, z } = block.location;
  const at = { x: x + 0.5, y: y + 1, z: z + 0.5 };
  const dragon = ctx.dragon.location;
  const dx = dragon.x - at.x;
  const dy = dragon.y - at.y;
  const dz = dragon.z - at.z;
                                                                    
  if (dx * dx + dy * dy + dz * dz < MIN_STRIKE_DISTANCE_SQ) return;
  memo.nextStrikeAt = ctx.now + STRIKE_INTERVAL;
  ctx.dimension.spawnEntity("minecraft:lightning_bolt", at);
}

                                                                                
const FAN_THRESHOLD = 0.3;
const FLARE_THRESHOLD = FAN_THRESHOLD * 3;

function canHoldFire(ctx, x, y, z) {
  const cell = ctx.at(x, y, z);
  if (!cell?.isAir) return false;
  if (ctx.at(x, y - 1, z)?.isSolid) return true;
  for (const [ox, oy, oz] of FACE_OFFSETS) {
    const neighbour = ctx.at(x + ox, y + oy, z + oz);
    if (neighbour && blockFlammability(neighbour.typeId) > 0) return true;
  }
  return false;
}

                                                                                    
function fanFlames(ctx, record) {
  const block = record.block;
  const max = maxDensity(record);
  if (max < FAN_THRESHOLD) return false;
  let changed = false;
  const age = state(block, "age");
  if (typeof age === "number" && age > 0) {
    setState(block, "age", 0);
    changed = true;
  }
  const fire = block.typeId;
  const { x, y, z } = record;
  const ignite = (px, py, pz) => {
    if (ctx.counters.fires >= MAX_FIRES_PER_TICK || !canHoldFire(ctx, px, py, pz)) return false;
    ctx.at(px, py, pz).setType(fire);
    ctx.counters.fires += 1;
    return true;
  };
  for (let face = 0; face < 6; face++) {
    if (record.faces[face] < FAN_THRESHOLD) continue;
    const [ox, oy, oz] = FACE_OFFSETS[face ^ 1];                               
    if (ignite(x + ox, y + oy, z + oz)) changed = true;
  }
  if (max >= FLARE_THRESHOLD) {
    for (let face = 0; face < 6; face++) {
      if (Math.random() < 0.5) continue;
      const [ox, oy, oz] = FACE_OFFSETS[face];
      if (ignite(x + ox, y + oy, z + oz)) changed = true;
    }
  }
  return changed;
}

function affectAetherBlock(ctx, record) {
  const block = record.block;
  const id = block.typeId;
  const extinguishes = BREATH_CONFIG.aetherExtinguishesFire;
  if (FIRE_BLOCKS.has(id)) {
    if (!extinguishes) return fanFlames(ctx, record);
    block.setType("minecraft:air");
    return true;
  }
  if (extinguishes && extinguishLit(block)) return true;
  if (!BREATH_CONFIG.destructiveBreath || ctx.counters.destroys >= MAX_DESTROYS_PER_TICK) return false;
  const threshold = airflowDestroyDensity(id);
  if (threshold === null || maxDensity(record) <= threshold) return false;
  ctx.counters.destroys += 1;
  const { x, y, z } = record;
  try {
    block.dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
  } catch {
    block.setType("minecraft:air");
  }
  return true;
}

                                                                                   
                                                                                               
                                                                                        
                                                                                 
function affectCloudBlock(def, ctx, record) {
  const block = record.block;
  const cloud = def.cloud;
  if (cloud && !block.isAir && Math.random() < cloud.chance) ctx.spawnCloud(block, cloud);
  if (def.kind === "forest") growPlant(ctx, record);
  return true;
}

const GROWTH_CHANCE = 0.35;
   
                                                                                           
                                                                                          
                         
   
function growPlant(ctx, record) {
  if (Math.random() >= GROWTH_CHANCE) return;
  const plant = ctx.at(record.x, record.y + 1, record.z);
  if (!plant || plant.isAir) return;
  let grown = false;
  const growth = state(plant, "growth");
  if (typeof growth === "number") {
    const max = plant.typeId === "minecraft:sweet_berry_bush" ? 3 : 7;
    grown = growth < max && setState(plant, "growth", growth + 1);
  } else if (state(plant, "age_bit") === 0) {
    grown = setState(plant, "age_bit", 1);
  }
  if (!grown) return;
  spawnParticle(ctx.dimension, "minecraft:crop_growth_emitter", {
    x: record.x + 0.5,
    y: record.y + 1.5,
    z: record.z + 0.5,
  });
}

                                                                                 
const SCULK_SPREAD_THRESHOLD = 2;
const SCULK_SPREAD_INTERVAL = 20;
const SCULK_SPREAD_CHANCE = 0.5;
const SCULK_CATALYST_CHANCE = 0.02;
const SCULK_VEIN_CHANCE = 0.08;

function affectSculkBlock(ctx, record, isSculkReplaceable) {
  if (!BREATH_CONFIG.destructiveBreath) return false;
  if (maxDensity(record) < SCULK_SPREAD_THRESHOLD) return false;
  const memo = ctx.memo;
  if (ctx.now < (memo.nextSpreadAt ?? 0) || Math.random() >= SCULK_SPREAD_CHANCE) return false;
  const block = record.block;
  if (!isSculkReplaceable(block)) return false;
  memo.nextSpreadAt = ctx.now + SCULK_SPREAD_INTERVAL;
  const catalyst = Math.random() < SCULK_CATALYST_CHANCE;
  block.setType(catalyst ? "minecraft:sculk_catalyst" : "minecraft:sculk");
  const { x, y, z } = record;
  spawnParticle(ctx.dimension, "minecraft:sculk_soul_particle", {
    x: x + 0.5,
    y: y + 1,
    z: z + 0.5,
  });
  if (!catalyst && Math.random() < SCULK_VEIN_CHANCE) {
    const above = ctx.at(x, y + 1, z);
    if (above?.isAir) {
      try {
                                                             
        above.setPermutation(BlockPermutation.resolve("minecraft:sculk_vein", { multi_face_direction_bits: 1 }));
      } catch {
                                                                                       
      }
    }
  }
  return true;
}

   
                                               
                                                                       
   
export function affectBlock(def, ctx, record, isSculkReplaceable) {
  if (!getWorldEnvironmentalEffectsEnabled()) return false;
  switch (def.kind) {
    case "fire": return affectFireBlock(ctx, record, false);
    case "nether": return affectFireBlock(ctx, record, true);
    case "ice": return affectIceBlock(ctx, record);
    case "water": return affectWaterBlock(ctx, record);
    case "storm":
      tryStrike(ctx, record.block);
      return affectWaterBlock(ctx, record);
    case "aether": return affectAetherBlock(ctx, record);
    case "forest":
    case "zombie":
    case "ender":
    case "dark":
    case "wither":
      return affectCloudBlock(def, ctx, record);
    case "sculk": return affectSculkBlock(ctx, record, isSculkReplaceable);
    default: return false;                                                       
  }
}

                                                                                 
function isForestTarget(target) {
  if (FOREST_SPARED_TYPES.has(target.typeId)) return false;
  return target.matches?.({ families: FOREST_SPARED_FAMILIES }) !== true;
}

function mergePoison(target, ticks) {
  const existing = target.getEffect?.("poison")?.duration ?? 0;
  target.addEffect("poison", Math.min(200, Math.max(1, existing + ticks)), { amplifier: 0 });
}

   
                                                                                           
                                                                                              
                                                               
   
export function affectEntity(def, ctx, target, density) {
  const env = ctx.env;
  let damage = def.damage * density;
  switch (def.kind) {
    case "fire":
                                                                                 
      target.setOnFire(4, true);
      if (env.inPowderSnow(target)) damage *= 2;
      else if (env.isWet(target)) damage *= 1.5;
      break;
    case "nether":
      target.setOnFire(8, true);
      if (env.inPowderSnow(target)) damage *= 2.5;
      else if (env.isWet(target)) damage *= 2;
      break;
    case "ice":
      if (env.onFire(target)) {
        target.extinguishFire();
        damage *= 2;
      }
      break;
    case "water": {
      if (target.matches?.({ families: ["aquatic"] }) === true) damage += 4;
      if (target.getComponent("minecraft:breathable")?.breathesWater === true || target.getEffect("water_breathing")) {
        damage *= 0.5;
      }
      if (env.onFire(target)) {
        target.extinguishFire();
        damage *= 1.5;
      }
      break;
    }
    case "storm":
    case "moonlight":
    case "sunlight": {
                                                                              
      const profile = LIGHTNING_PROFILES[def.kind];
      if (env.isWet(target)) damage *= profile.wetDamageMultiplier;
      target.setOnFire(profile.igniteSeconds, true);
      break;
    }
    case "aether":
                                                                                         
      if (env.onFire(target)) {
        if (BREATH_CONFIG.aetherExtinguishesFire) target.extinguishFire();
        else target.setOnFire(5, true);
      }
      break;
    case "forest":
      if (!isForestTarget(target)) return;
      break;
    case "wither":
      mergePoison(target, Math.round(4 * density));
      break;
    case "sculk":
      if (density > 0.2) target.addEffect("darkness", 80, { amplifier: 0 });
      break;
    default:
      break;                                                               
  }
  ctx.damage(target, damage);
}
