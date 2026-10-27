                                                            
                                                                                 
                                                                                 
                                                                                   

                                                                                   
                                                       
export const BREATH_CONFIG = Object.freeze({
  ignitingBreath: true,
  smeltingBreath: true,
  destructiveBreath: true,
  quenchingBreath: true,
  frostyBreath: true,
  aetherExtinguishesFire: true,
});

                           
                                                                                           
                                                   
                                                                                     
                                                                                       
                                              
export const BREATH_KINDS = Object.freeze({
  fire: { drag: 0, exposeAir: false, exposeLiquid: false },
  nether: { drag: 0, exposeAir: false, exposeLiquid: false },
  ice: { drag: 0.075, exposeAir: false, exposeLiquid: true },
  water: { drag: 0.05, exposeAir: true, exposeLiquid: true },
  storm: { drag: 0, exposeAir: true, exposeLiquid: true },
  aether: { drag: 0.1, exposeAir: false, exposeLiquid: false },
  forest: { drag: 0, exposeAir: false, exposeLiquid: false },
  zombie: { drag: 0, exposeAir: false, exposeLiquid: false },
  ender: { drag: 0, exposeAir: false, exposeLiquid: false },
  dark: { drag: 0, exposeAir: false, exposeLiquid: false },
  wither: { drag: 0, exposeAir: false, exposeLiquid: false },
  sculk: { drag: 0.05, exposeAir: false, exposeLiquid: false },
  moonlight: { drag: 0, exposeAir: false, exposeLiquid: false },
  sunlight: { drag: 0, exposeAir: false, exposeLiquid: false },
});

                                                                                  
export const LIGHTNING_KINDS = Object.freeze(new Set(["storm", "moonlight", "sunlight"]));

                                                                       
export const LIGHTNING_PROFILES = Object.freeze({
  storm: { igniteSeconds: 5, wetDamageMultiplier: 1.5, color: { red: 1, green: 1, blue: 1 } },
  moonlight: { igniteSeconds: 5, wetDamageMultiplier: 1.5, color: { red: 0.35, green: 0.7, blue: 1 } },
  sunlight: { igniteSeconds: 5, wetDamageMultiplier: 1.5, color: { red: 1, green: 0.48, blue: 0.16 } },
});

                                                              
                                                                             
export const DRAGON_BREATHS = Object.freeze({
  "dragonmounts2:aether_dragon": { kind: "aether", damage: 0.7 },
  "dragonmounts2:dark_dragon": { kind: "dark", damage: 0.6 },
  "dragonmounts2:enchanted_dragon": { kind: "fire", damage: 0.7 },
  "dragonmounts2:ender_dragon": { kind: "ender", damage: 0.9 },
  "dragonmounts2:fire_dragon": { kind: "fire", damage: 0.7 },
  "dragonmounts2:forest_dragon": { kind: "forest", damage: 0.6 },
  "dragonmounts2:ice_dragon": { kind: "ice", damage: 0.7 },
  "dragonmounts2:light_dragon": { kind: "aether", damage: 0.7 },
  "dragonmounts2:moonlight_dragon": { kind: "moonlight", damage: 0.7 },
  "dragonmounts2:nether_dragon": { kind: "nether", damage: 0.9 },
  "dragonmounts2:sculk_dragon": { kind: "sculk", damage: 0.6 },
  "dragonmounts2:skeleton_dragon": { kind: "nether", damage: 0.7 },
  "dragonmounts2:storm_dragon": { kind: "storm", damage: 0.7 },
  "dragonmounts2:sunlight_dragon": { kind: "sunlight", damage: 0.7 },
  "dragonmounts2:terra_dragon": { kind: "fire", damage: 0.7 },
  "dragonmounts2:water_dragon": { kind: "water", damage: 0.7 },
  "dragonmounts2:wither_dragon": { kind: "wither", damage: 0.6 },
  "dragonmounts2:zombie_dragon": { kind: "zombie", damage: 0.6 },
});

                                                                                  
                                                                       
export const BREATH_CLOUDS = Object.freeze({
  dark: { chance: 0.002, effect: "darkness", duration: 120, radius: 1.4, lifetime: 600, particle: "minecraft:basic_smoke_particle" },
  wither: { chance: 0.002, effect: "wither", duration: 120, radius: 1.4, lifetime: 600, particle: "minecraft:basic_smoke_particle" },
  forest: { chance: 0.008, effect: "poison", duration: 100, radius: 1.3, lifetime: 600, particle: "minecraft:happy_villager_particle" },
  zombie: { chance: 0.008, effect: "poison", duration: 100, radius: 1.3, lifetime: 600, particle: "minecraft:basic_smoke_particle" },
  ender: { chance: 0.008, effect: "instant_damage", duration: 1, radius: 1.6, lifetime: 750, particle: "minecraft:dragon_breath_trail" },
});

                                                                                         
export const FLAME_STYLE = Object.freeze({ sprite: "fire", style: "flame" });
export const BREATH_PARTICLE_STYLES = Object.freeze({
  "dragonmounts2:aether_dragon": { sprite: "air", style: "air" },
  "dragonmounts2:light_dragon": { sprite: "air", style: "air" },
  "dragonmounts2:dark_dragon": { sprite: "dark", style: "plain" },
  "dragonmounts2:ender_dragon": { sprite: "acid", style: "ender" },
  "dragonmounts2:forest_dragon": { sprite: "poison", style: "plain" },
  "dragonmounts2:ice_dragon": { sprite: "ice", style: "ice" },
  "dragonmounts2:moonlight_dragon": { sprite: "lightning_blue", style: "plain" },
  "dragonmounts2:nether_dragon": { sprite: "nether", style: "nether" },
  "dragonmounts2:sculk_dragon": { sprite: "dark", style: "plain" },
  "dragonmounts2:skeleton_dragon": { sprite: "soul", style: "plain" },
  "dragonmounts2:storm_dragon": { sprite: "lightning_white", style: "plain" },
  "dragonmounts2:sunlight_dragon": { sprite: "lightning_orange", style: "plain" },
  "dragonmounts2:water_dragon": { sprite: "hydro", style: "water" },
  "dragonmounts2:wither_dragon": { sprite: "wither", style: "plain" },
  "dragonmounts2:zombie_dragon": { sprite: "poison", style: "plain" },
});

                                                                               
                                                                           
                                                                                
                                        
const AIRFLOW_HARDNESS_EXACT = new Map([
  ["minecraft:web", 4],
  ["minecraft:cactus", 0.4],
  ["minecraft:chorus_plant", 0.4],
  ["minecraft:sponge", 0.6],
  ["minecraft:cocoa", 0.2],
  ["minecraft:snow_layer", 0.1],
  ["minecraft:moss_carpet", 0.1],
  ["minecraft:pale_moss_carpet", 0.1],
  ["minecraft:sand", 0.5],
  ["minecraft:red_sand", 0.5],
  ["minecraft:suspicious_sand", 0.25],
]);
const AIRFLOW_ZERO_HARDNESS_EXACT = new Set([
  "minecraft:short_grass", "minecraft:tallgrass", "minecraft:tall_grass",
  "minecraft:fern", "minecraft:large_fern", "minecraft:deadbush",
  "minecraft:vine", "minecraft:glow_lichen", "minecraft:double_plant",
  "minecraft:hanging_roots", "minecraft:brown_mushroom", "minecraft:red_mushroom",
  "minecraft:small_dripleaf_block", "minecraft:big_dripleaf",
  "minecraft:sweet_berry_bush", "minecraft:waterlily", "minecraft:reeds",
  "minecraft:nether_sprouts", "minecraft:nether_wart", "minecraft:crimson_roots",
  "minecraft:crimson_fungus", "minecraft:warped_roots", "minecraft:warped_fungus",
  "minecraft:twisting_vines", "minecraft:weeping_vines", "minecraft:cave_vines",
  "minecraft:cave_vines_body_with_berries", "minecraft:cave_vines_head_with_berries",
]);
const AIRFLOW_ZERO_HARDNESS_PATTERN =
  /(^minecraft:(yellow_flower|red_flower|wither_rose|rose_bush|peony|lilac|sunflower|cornflower|torchflower|pitcher_plant)$)|(_tulip$)|(sapling$)|(^minecraft:(wheat|carrots|potatoes|beetroot|melon_stem|pumpkin_stem|torchflower_crop|pitcher_crop)$)|(torch$)|(^minecraft:(spore_blossom|azalea|flowering_azalea|pink_petals)$)/;

                                                                                               
export function airflowDestroyDensity(typeId) {
  if (AIRFLOW_HARDNESS_EXACT.has(typeId)) {
    const hardness = AIRFLOW_HARDNESS_EXACT.get(typeId);
    return hardness * hardness * 400;
  }
  if (typeId.endsWith("_leaves") || typeId === "minecraft:leaves" || typeId === "minecraft:leaves2") {
    return 0.2 * 0.2 * 400;
  }
  if (typeId.endsWith("glass_pane")) return 0.3 * 0.3 * 400;
  if (typeId.endsWith("_concrete_powder")) return 0.5 * 0.5 * 400;
  if (AIRFLOW_ZERO_HARDNESS_EXACT.has(typeId) || AIRFLOW_ZERO_HARDNESS_PATTERN.test(typeId)) return 0;
  return null;
}

                                                                                 
                                                                               
const flammabilityCache = new Map();
export function blockFlammability(typeId) {
  let value = flammabilityCache.get(typeId);
  if (value === undefined) {
    value = computeBlockFlammability(typeId);
    flammabilityCache.set(typeId, value);
  }
  return value;
}

function computeBlockFlammability(typeId) {
  const name = typeId.replace("minecraft:", "");
  if (/^(crimson|warped)_/.test(name)) return 0;
  if (/(^|_)leaves$|^leaves2?$/.test(name)) return 60;
  if (/(_wool|_carpet)$|^wool$|^carpet$/.test(name)) return name.includes("moss") ? 0 : 60;
  if (/^(short_grass|tallgrass|tall_grass|fern|large_fern|deadbush|vine|double_plant|hay_block|dried_kelp_block|sweet_berry_bush|azalea|flowering_azalea|spore_blossom|hanging_roots|bamboo|scaffolding)$/.test(name)) return name === "dried_kelp_block" || name === "bamboo" ? 60 : 100;
  if (/^(yellow_flower|red_flower|wither_rose|rose_bush|peony|lilac|sunflower|cornflower|dandelion|poppy|allium|azure_bluet|oxeye_daisy|lily_of_the_valley)$|_tulip$|_orchid$/.test(name)) return 100;
  if (/(_log|_wood|_stem_block)$|^(log|log2|wood|bamboo_block)$|^stripped_.*(log|wood)$/.test(name)) return 5;
  if (/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|bamboo)_(planks|slab|stairs|fence|fence_gate)$|^(planks|wooden_slab|fence|fence_gate)$|^bamboo_mosaic/.test(name)) return 20;
  if (/^(bookshelf|chiseled_bookshelf|lectern|composter|beehive|bee_nest|loom|barrel)$/.test(name)) return 20;
  if (name === "tnt") return 100;
  if (name === "coal_block") return 5;
  return 0;
}

                                                                                         
                                             
export const FUNGAL_BLOCKS = Object.freeze(new Set([
  "minecraft:mycelium", "minecraft:brown_mushroom", "minecraft:red_mushroom",
  "minecraft:brown_mushroom_block", "minecraft:red_mushroom_block", "minecraft:mushroom_stem",
  "minecraft:crimson_fungus", "minecraft:warped_fungus", "minecraft:shroomlight",
  "minecraft:nether_wart_block", "minecraft:warped_wart_block",
]));
export const FUNGAL_FLAMMABILITY = 20;
                                                             
export const SOLID_IGNITION_THRESHOLD = 6;
export const MELT_THRESHOLD = 0.4;

                                                                              
export const BREATH_SMELT_RESULTS = new Map([
  ["minecraft:sand", "minecraft:glass"],
  ["minecraft:red_sand", "minecraft:glass"],
  ["minecraft:cobblestone", "minecraft:stone"],
  ["minecraft:stone", "minecraft:smooth_stone"],
  ["minecraft:stone_bricks", "minecraft:cracked_stone_bricks"],
  ["minecraft:cobbled_deepslate", "minecraft:deepslate"],
  ["minecraft:deepslate_bricks", "minecraft:cracked_deepslate_bricks"],
  ["minecraft:deepslate_tiles", "minecraft:cracked_deepslate_tiles"],
  ["minecraft:nether_brick", "minecraft:cracked_nether_bricks"],
  ["minecraft:polished_blackstone_bricks", "minecraft:cracked_polished_blackstone_bricks"],
  ["minecraft:sandstone", "minecraft:smooth_sandstone"],
  ["minecraft:red_sandstone", "minecraft:smooth_red_sandstone"],
  ["minecraft:quartz_block", "minecraft:smooth_quartz"],
  ["minecraft:basalt", "minecraft:smooth_basalt"],
  ["minecraft:clay", "minecraft:hardened_clay"],
  ["minecraft:wet_sponge", "minecraft:sponge"],
]);

                                                                                      
export const REPLACEABLE_BLOCKS = Object.freeze(new Set([
  "minecraft:short_grass", "minecraft:tallgrass", "minecraft:fern", "minecraft:deadbush",
  "minecraft:snow_layer", "minecraft:vine", "minecraft:glow_lichen", "minecraft:hanging_roots",
  "minecraft:crimson_roots", "minecraft:warped_roots", "minecraft:nether_sprouts",
  "minecraft:fire", "minecraft:soul_fire", "minecraft:light_block",
]));

                                                                                    
                                                                                   
export const FOREST_SPARED_TYPES = Object.freeze(new Set([
  "minecraft:villager", "minecraft:villager_v2", "minecraft:wandering_trader",
  "minecraft:iron_golem", "minecraft:snow_golem", "minecraft:copper_golem",
]));
export const FOREST_SPARED_FAMILIES = Object.freeze(["aquatic", "fish", "squid", "dolphin"]);

export function breathDefinitionFor(typeId) {
  const base = DRAGON_BREATHS[typeId];
  if (!base) return null;
  return { typeId, ...base, ...BREATH_KINDS[base.kind], cloud: BREATH_CLOUDS[base.kind] ?? null };
}
