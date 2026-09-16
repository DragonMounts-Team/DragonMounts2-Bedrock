const fs = require("node:fs");
const path = require("node:path");

const behaviorPack = path.resolve(__dirname, "..");
const resourcePack = path.resolve(behaviorPack, "..", "DM2RP");
const entitiesRoot = path.join(behaviorPack, "entities");
const resourceEntitiesRoot = path.join(resourcePack, "entity", "dragons");
const fireFile = path.join(entitiesRoot, "fire_dragon", "fire_dragon.json");
const excluded = new Set(["fire_dragon", "ice_dragon"]);
const sharedTextureNames = new Set([
  "dragon_saddled",
  "dragon_chested",
  "dragon_none",
  "collar",
  "exploding",
  "beam"
]);
const javaVariantOrder = {
  aether_dragon: ["aethra", "wind", "breeze"],
  dark_dragon: ["bloodmoon", "demon", "imp", "underworld"],
  enchanted_dragon: ["enchanting", "shimmer", "sparkling"],
  ender_dragon: ["jean", "john", "shadow"],
  forest_dragon: ["cold", "jungle", "nature", "warm"],
  light_dragon: ["fallen", "prism", "radiant", "sunset"],
  moonlight_dragon: ["starlight", "eclipse", "constellation"],
  nether_dragon: ["magma", "volcanic", "soul_fire"],
  sculk_dragon: ["amethyst", "beta", "warden"],
  skeleton_dragon: ["normal", "stray", "bogged"],
  storm_dragon: ["lightning", "thunder", "bronzed"],
  sunlight_dragon: ["sunrise", "sunset", "aurora"],
  terra_dragon: ["valley", "mesa", "crystalline"],
  water_dragon: ["pond", "tidal", "brine"],
  wither_dragon: ["wither"],
  zombie_dragon: ["drowned", "husk", "zombie"]
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function removeBlueFireBreath(text) {
  const marker = '"spawn_entity": "dragonmounts2:blue_fire_dragonbreath"';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return text;
  const entryStart = text.lastIndexOf("\n            {", markerIndex);
  if (entryStart < 0) throw new Error("Could not locate blue-fire breath entry");

  let depth = 0;
  let inString = false;
  let escaped = false;
  let entryEnd = -1;
  for (let index = entryStart + 1; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      entryEnd = index + 1;
      break;
    }
  }
  if (entryEnd < 0) throw new Error("Could not parse blue-fire breath entry");
  if (text[entryEnd] === ",") entryEnd += 1;
  if (text[entryEnd] === "\n") entryEnd += 1;
  return text.slice(0, entryStart) + text.slice(entryEnd);
}

function findResourceEntity(name) {
  const pending = [resourceEntitiesRoot];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.name === `${name}.entity.json`) return candidate;
    }
  }
  throw new Error(`Missing resource entity for ${name}`);
}

function getVariants(name) {
  const description = readJson(findResourceEntity(name))["minecraft:client_entity"].description;
  const resourceVariants = Object.keys(description.textures).filter(
    (value) => !value.endsWith("_glow") && !sharedTextureNames.has(value)
  );
  return javaVariantOrder[name].filter((variant) => resourceVariants.includes(variant));
}

function transform(value, name, variants) {
  if (typeof value === "string") {
    const placeholders = [
      ["dragonmounts2:blue_fire_dragonbreath", "__FIRE_BLUE_BREATH__"],
      ["dragonmounts2:fire_dragonbreath", "__FIRE_BREATH__"],
      ["dragonmounts2:fire_dragon_death_cloud", "__FIRE_DEATH_CLOUD__"]
    ];
    let result = value;
    for (const [source, placeholder] of placeholders) result = result.replaceAll(source, placeholder);
    result = result.replaceAll("fire_dragon", name);
    result = result.replaceAll("blue_fire", variants[2] || variants[0]);
    result = result.replaceAll("blaze", variants[1] || variants[0]);
    result = result.replaceAll("flame", variants[0]);
    for (const [source, placeholder] of placeholders) {
      result = result.replaceAll(placeholder, source);
    }
    return result;
  }
  if (Array.isArray(value)) return value.map((entry) => transform(entry, name, variants));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      transform(key, name, variants),
      transform(child, name, variants)
    ])
  );
}

function generate(name, fireEntity, fireText) {
  const variants = getVariants(name);
  const entity = transform(structuredClone(fireEntity), name, variants);
  const definition = entity["minecraft:entity"];
  definition.description.identifier = `dragonmounts2:${name}`;
  definition.description.properties["dragonmounts2:variant_type"] = {
    type: "enum",
    values: variants,
    default: variants[0],
    client_sync: true
  };
  definition.components["minecraft:type_family"].family[0] = name;

  const breathEntities =
    definition.component_groups["dragonmounts2:dragon_breath"]["minecraft:spawn_entity"].entities;
  breathEntities[0].filters.all_of = breathEntities[0].filters.all_of.filter(
    (filter) => filter.domain !== "dragonmounts2:variant_type"
  );
  definition.component_groups["dragonmounts2:dragon_breath"]["minecraft:spawn_entity"].entities =
    breathEntities.filter((entry) => entry.spawn_entity === "dragonmounts2:fire_dragonbreath");

  for (const eventName of Object.keys(definition.events)) {
    if (eventName.startsWith("minecraft:become_")) delete definition.events[eventName];
  }
  for (const variant of variants) {
    definition.events[`minecraft:become_${variant}`] = {
      set_property: { "dragonmounts2:variant_type": variant }
    };
  }

  const output = path.join(entitiesRoot, name, `${name}.json`);
  let formatted = removeBlueFireBreath(fireText);
  const protectedStrings = [
    ["dragonmounts2:fire_dragonbreath", "__FIRE_BREATH__"],
    ["dragonmounts2:fire_dragon_death_cloud", "__FIRE_DEATH_CLOUD__"]
  ];
  for (const [source, placeholder] of protectedStrings) {
    formatted = formatted.replaceAll(source, placeholder);
  }
  formatted = formatted.replaceAll("dragonmounts2:fire_dragon", `dragonmounts2:${name}`);
  formatted = formatted.replaceAll("flame", variants[0]);
  formatted = formatted.replaceAll("blaze", variants[1] || variants[0]);
  formatted = formatted.replaceAll("blue_fire", variants[2] || variants[0]);
  for (const [source, placeholder] of protectedStrings) {
    formatted = formatted.replaceAll(placeholder, source);
  }
  let becomeKeyIndex = 0;
  const becomeVariants = [variants[1] || variants[0], variants[0], variants[2] || variants[0]];
  formatted = formatted.replaceAll(`"minecraft:become_${variants[1] || variants[0]}":`, () => {
    const variant = becomeVariants[Math.min(becomeKeyIndex++, becomeVariants.length - 1)];
    return `"minecraft:become_${variant}":`;
  });
  let triggerIndex = 0;
  formatted = formatted.replaceAll(`"trigger": "minecraft:become_${variants[1] || variants[0]}"`, () => {
    const variant = variants[triggerIndex++ % variants.length];
    return `"trigger": "minecraft:become_${variant}"`;
  });
  fs.writeFileSync(output, formatted);
  console.log(`generated ${name}: ${variants.join(", ")}`);
}

const fireEntity = readJson(fireFile);
const fireText = fs.readFileSync(fireFile, "utf8");
for (const entry of fs.readdirSync(entitiesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || excluded.has(entry.name)) continue;
  const output = path.join(entitiesRoot, entry.name, `${entry.name}.json`);
  if (!fs.existsSync(output) || !entry.name.endsWith("_dragon")) continue;
  generate(entry.name, fireEntity, fireText);
}