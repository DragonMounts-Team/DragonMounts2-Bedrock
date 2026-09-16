const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const toolRoot = __dirname;
const configPath = path.join(toolRoot, "dragon-types.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const namespace = config.namespace;
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m"
};
function color(text, name) {
  return process.stdout.isTTY ? `${colors[name] || ""}${text}${colors.reset}` : text;
}
const dragonTemplatePath = path.resolve(toolRoot, config.templates.dragon);
const eggTemplatePath = path.resolve(toolRoot, config.templates.egg);
const entityRoot = path.resolve(toolRoot, config.output.entities);
const amuletRoot = path.resolve(toolRoot, config.output.amulets);
const resourceEntityRoot = path.resolve(toolRoot, config.output.resource_entities);
const resourceAmuletRoot = path.resolve(toolRoot, config.output.resource_amulets);
const itemTexturePath = path.resolve(toolRoot, config.output.resource_item_texture);
const itemDataPath = path.resolve(toolRoot, config.output.script_data);
const lootRoot = path.resolve(toolRoot, config.output.loot_tables || "../../loot_tables/entities");
const fluteRoot = path.resolve(toolRoot, config.output.flutes || "../../items/dragonmounts2_equipment/tools/dragon_flutes");
const resourceAttachableRoot = path.resolve(toolRoot, config.output.resource_attachables || "../../../DM2RP/attachables/dragonmounts2_generated");
const languageRoots = (config.output.languages || ["../../texts/en_US.lang", "../../texts/en_GB.lang"])
  .map((filePath) => path.resolve(toolRoot, filePath));
const templateDragonType = "fire_dragon";
const defaultBreathEntity = config.defaults?.breath_entity || "dragonmounts2:fire_dragonbreath";
function makeStarterAssets(materialName = "scales") {
  return [
    { name: materialName, kind: "item" },
    { name: "sword", kind: "tool" },
    { name: "pickaxe", kind: "tool" },
    { name: "axe", kind: "tool" },
    { name: "shovel", kind: "tool" },
    { name: "hoe", kind: "tool" },
    { name: "armor", kind: "armor" }
  ];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { all: false, assets: undefined, dryRun: false, help: false, type: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index].toLowerCase();
    const nextValue = (label) => {
      const value = args[++index];
      if (!value || value.startsWith("-")) throw new Error(`${label} requires a value`);
      return value;
    };
    if (arg === "--all" || arg === "-a") options.all = true;
    else if (arg === "--assets" || arg === "--equipment" || arg === "-e") options.assets = nextValue("--assets");
    else if (arg.startsWith("--assets=") || arg.startsWith("--equipment=")) options.assets = arg.split("=", 2)[1];
    else if (arg === "--dry-run" || arg === "-d") options.dryRun = true;
    else if (arg === "--help" || arg === "-h" || arg === "/?") options.help = true;
    else if (arg === "--type" || arg === "-t") options.type = nextValue("--type");
    else if (arg.startsWith("--type=")) options.type = arg.split("=", 2)[1];
    else if (arg === "--config") nextValue("--config");
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.assets && options.assets.toLowerCase() !== "all") {
    throw new Error("Equipment option must be all");
  }
  return options;
}

function printHelp() {
  console.log(color("Usage:", "cyan"));
  console.log("  generate.cmd                         Open the interactive wizard");
  console.log("  generate.cmd --type storm_dragon    Generate one configured dragon");
  console.log("  generate.cmd --all                   Generate all configured dragons");
  console.log("  generate.cmd --type storm_dragon --assets all");
  console.log("                                       Add all starter tools and armor");
  console.log("  Short forms: -t dragon_type -a -e all -d -h");
  console.log("  generate.cmd --dry-run               Preview without writing files");
  console.log("  generate.cmd --help                 Show this help");
}

function printBanner() {
  console.log(color("\n========================================", "cyan"));
  console.log(color("        Dragon Generator Menu", "cyan"));
  console.log(color("========================================", "cyan"));
  console.log(color("Use lowercase snake_case names like fire_dragon or blue_fire.", "dim"));
}

function getDragonFolderTypes() {
  const roots = [
    path.resolve(toolRoot, config.output.entities),
    path.resolve(toolRoot, config.output.resource_entities)
  ];

  const discovered = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (/^[a-z0-9]+(?:_[a-z0-9]+)*_dragon$/.test(name)) discovered.add(name);
    }
  }
  return [...discovered].sort();
}

function buildDiscoveredDragon(type) {
  const baseName = type.replace(/_dragon$/, "");
  return validateDragon({
    type,
    variants: [baseName],
    default_variant: baseName
  });
}

function getAllDragonsForGeneration() {
  const configured = config.dragons
    .filter((dragon) => dragon.enabled !== false)
    .map(validateDragon);
  const configuredTypes = new Set(configured.map((dragon) => dragon.type));
  const discovered = getDragonFolderTypes()
    .filter((type) => type !== "fire_dragon" && !configuredTypes.has(type))
    .map(buildDiscoveredDragon);
  return [...configured, ...discovered];
}

function printConfiguredDragons() {
  const dragons = config.dragons.filter((dragon) => dragon.enabled !== false);
  console.log("\nConfigured dragons:");
  if (dragons.length === 0) console.log("  - none");
  else dragons.forEach((dragon) => console.log(`  - ${dragon.type}: ${dragon.variants.join(", ")}`));
}

async function promptInteractiveDragon(terminal) {
  const type = (await terminal.question("Enter a dragon type (example: fire_dragon): ")).trim();
  assertSafeName(type, "Dragon type");
  const existingTypes = new Set([
    ...config.dragons.map((dragon) => dragon.type),
    ...getDragonFolderTypes()
  ]);
  if (existingTypes.has(type)) {
    console.log(color(`Already exists: ${type}. Choose a new dragon type, or use --type ${type} to intentionally update it.`, "yellow"));
    return null;
  }

  const countText = (await terminal.question("Enter how many variants: ")).trim();
  const count = Number.parseInt(countText, 10);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Variant count must be a positive whole number");
  }

  const variants = [];
  for (let index = 1; index <= count; index += 1) {
    const variant = (await terminal.question(`Enter #${index} variant (example: blue_fire): `)).trim();
    assertSafeName(variant, "Variant");
    if (variants.includes(variant)) throw new Error(`Duplicate variant: ${variant}`);
    variants.push(variant);
  }

  const breathEntityInput = (await terminal.question("Breath entity ID (Enter for dragonmounts2:fire_dragonbreath): ")).trim();
  const breathEntity = breathEntityInput || defaultBreathEntity;
  if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(breathEntity)) {
    throw new Error("Breath entity must use namespace:id format");
  }

  const textColor = (await terminal.question("Tooltip color code (Enter for §f): ")).trim() || "§f";
  const customAssets = [];
  console.log(color("\nEquipment options:", "cyan"));
  console.log("  1) all - scales, sword, pickaxe, axe, shovel, hoe, and four armor pieces");
  console.log("  2) custom - choose asset names one at a time");
  console.log("  3) none - generate no custom equipment");
  const wantsCustomAssets = (await terminal.question("\nChoose equipment (1-3, or type all/custom/none): ")).trim().toLowerCase();
  if (["1", "all", "a"].includes(wantsCustomAssets)) {
    const materialInput = (await terminal.question("Material name (Enter for scales, example: feather): ")).trim().toLowerCase() || "scales";
    assertSafeName(materialInput, "Material name");
    customAssets.push(...makeStarterAssets(materialInput));
    console.log(color(`Added starter assets using ${materialInput}: material, tools, and four armor pieces.`, "green"));
  } else if (["2", "custom", "c", "y", "yes"].includes(wantsCustomAssets)) {
    console.log(`Enter asset suffixes after ${type}_ (example: scales, staff), or type all for the starter set.`);
    while (true) {
      const suffix = (await terminal.question(`${type}_`)).trim();
      if (!suffix) break;
      if (suffix === "all") {
        const materialInput = (await terminal.question("Material name (Enter for scales, example: feather): ")).trim().toLowerCase() || "scales";
        assertSafeName(materialInput, "Material name");
        customAssets.push(...makeStarterAssets(materialInput));
        console.log(color(`Added starter assets using ${materialInput}.`, "green"));
        break;
      }
      assertSafeName(suffix, "Asset suffix");
      const kind = (await terminal.question("Asset kind (item, armor, tool): ")).trim().toLowerCase() || "item";
      if (!["item", "armor", "tool"].includes(kind)) throw new Error("Asset kind must be item, armor, or tool");
      const loot = (await terminal.question("Include this asset in loot? (y/n, default y): ")).trim().toLowerCase();
      const asset = { name: suffix, kind, loot: !["n", "no"].includes(loot) };
      if (asset.loot) {
        const minimum = (await terminal.question("Minimum loot count (Enter for 1): ")).trim();
        const maximum = (await terminal.question("Maximum loot count (Enter for 3): ")).trim();
        asset.loot_min = minimum ? Number.parseInt(minimum, 10) : 1;
        asset.loot_max = maximum ? Number.parseInt(maximum, 10) : 3;
        if (!Number.isInteger(asset.loot_min) || !Number.isInteger(asset.loot_max) || asset.loot_min < 1 || asset.loot_max < asset.loot_min) {
          throw new Error("Loot counts must be whole numbers with max at least min");
        }
      }
      const itemComponents = (await terminal.question("Custom item components JSON (Enter for none): ")).trim();
      asset.components = parseOptionalJson(itemComponents, "Custom item components");
      customAssets.push(asset);
    }
  }

  let customComponents = {};
  let customComponentGroups = {};
  const wantsAbilities = (await terminal.question("Add advanced dragon abilities now? (y/n, default n): ")).trim().toLowerCase();
  if (["y", "yes"].includes(wantsAbilities)) {
    console.log("Paste one-line JSON objects for the components and component groups.");
    customComponents = parseOptionalJson(
      (await terminal.question("Dragon components JSON (Enter for none): ")).trim(),
      "Dragon components"
    );
    customComponentGroups = parseOptionalJson(
      (await terminal.question("Dragon component groups JSON (Enter for none): ")).trim(),
      "Dragon component groups"
    );
  }

  const dragon = validateDragon({
    type,
    variants,
    default_variant: variants[0],
    breath_entity: breathEntity,
    text_color: textColor,
    custom_assets: customAssets,
    custom_components: customComponents,
    custom_component_groups: customComponentGroups
  });
  console.log(color("\nReview:", "cyan"));
  console.log(`  Dragon: ${dragon.type}`);
  console.log(`  Variants: ${dragon.variants.join(", ")}`);
  console.log(`  Equipment: ${dragon.custom_assets.length ? dragon.custom_assets.map((asset) => asset.name).join(", ") : "none"}`);
  console.log(`  Breath: ${dragon.breath_entity}`);
  console.log("  1) Generate");
  console.log("  2) Edit (restart this draft)");
  console.log("  3) Undo draft");
  console.log("  4) Cancel");
  const confirm = (await terminal.question("\nChoose (1-4, Enter to generate): ")).trim().toLowerCase();
  if (["", "1", "y", "yes"].includes(confirm)) return dragon;
  if (["2", "edit", "e"].includes(confirm)) return promptInteractiveDragon(terminal);
  console.log(color(confirm === "3" ? "Draft undone." : "Generation cancelled.", "yellow"));
  return null;
}

async function promptInteractive() {
  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      printBanner();
      console.log("Options:");
      console.log("  1) Generate all configured dragons");
      console.log("  2) Generate all dragons with all equipment");
      console.log("  3) Create one new dragon");
      console.log("  4) Exit");

      const option = (await terminal.question("\nChoose an option (1-4): ")).trim();
      if (option === "1") {
        return getAllDragonsForGeneration();
      }
      if (option === "2") {
        return applyAssetOption(getAllDragonsForGeneration(), "all");
      }
      if (option === "3") {
        const dragon = await promptInteractiveDragon(terminal);
        if (dragon) return [dragon];
        console.log(color("Returning to the main menu.", "dim"));
        continue;
      }
      if (option === "4") {
        console.log("Exiting.");
        return [];
      }
      console.log("Invalid option. Please choose 1-4.");
    }
  } finally {
    terminal.close();
  }
}

function applyAssetOption(dragons, assetOption) {
  if (!assetOption) return dragons;
  if (assetOption.toLowerCase() !== "all") throw new Error("--assets accepts only all");
  return dragons.map((dragon) => ({
    ...dragon,
    custom_assets: makeStarterAssets(dragon.material_name || "scales")
  }));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatJson(value, indent = 0) {
  const spacing = " ".repeat(indent);
  const childSpacing = " ".repeat(indent + 2);
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.every((entry) => entry === null || typeof entry !== "object")) {
      return `[ ${value.map((entry) => formatJson(entry, indent)).join(", ")} ]`;
    }
    return `[\n${value.map((entry) => `${childSpacing}${formatJson(entry, indent + 2)}`).join(",\n")}\n${spacing}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return "{ }";
  const formattedEntries = entries.map(([key, entry]) => `"${key}": ${formatJson(entry, indent + 2)}`);
  const isInline = entries.every(([, entry]) => entry === null || typeof entry !== "object" || (Array.isArray(entry)
    ? entry.every((item) => item === null || typeof item !== "object")
    : Object.values(entry).every((item) => item === null || typeof item !== "object")));
  if (isInline) return `{ ${formattedEntries.join(", ")} }`;
  return `{\n${formattedEntries.map((entry) => `${childSpacing}${entry}`).join(",\n")}\n${spacing}}`;
}

function writeJson(filePath, value, dryRun) {
  const exists = fs.existsSync(filePath);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${formatJson(value)}\n`);
  }
  const action = exists
    ? (dryRun ? "already exists (would update)" : "already exists, updated")
    : (dryRun ? "would generate" : "generated");
  console.log(`${action} ${path.relative(process.cwd(), filePath)}`);
}

function assertSafeName(value, label) {
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value)) {
    throw new Error(`${label} must use lowercase snake_case: ${value}`);
  }
}

function parseOptionalJson(value, label) {
  if (!value) return {};
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

function validateDragon(dragon) {
  assertSafeName(dragon.type, "Dragon type");
  if (!Array.isArray(dragon.variants) || dragon.variants.length === 0) {
    throw new Error(`${dragon.type} must define at least one variant`);
  }
  dragon.variants.forEach((variant) => assertSafeName(variant, "Variant"));
  const defaultVariant = dragon.default_variant || dragon.variants[0];
  if (!dragon.variants.includes(defaultVariant)) {
    throw new Error(`${dragon.type} default_variant is not in variants`);
  }
  const customAssets = dragon.custom_assets === "all"
    ? makeStarterAssets(dragon.material_name || "scales")
    : dragon.custom_assets || [];
  const materialName = dragon.material_name || "scales";
  assertSafeName(materialName, "Material name");
  if (!Array.isArray(customAssets)) throw new Error(`${dragon.type} custom_assets must be an array`);
  customAssets.forEach((asset) => {
    if (!asset || typeof asset !== "object") throw new Error(`${dragon.type} has an invalid custom asset`);
    assertSafeName(asset.name, "Custom asset name");
    if (!["item", "armor", "tool"].includes(asset.kind || "item")) {
      throw new Error(`${dragon.type} custom asset kind must be item, armor, or tool`);
    }
  });
  return { ...dragon, default_variant: defaultVariant, material_name: materialName, custom_assets: customAssets };
}

function transformStrings(value, dragonType) {
  if (typeof value === "string") {
    return value
      .replaceAll(`${namespace}:${templateDragonType}`, `${namespace}:${dragonType}`)
      .replaceAll(templateDragonType, dragonType);
  }
  if (Array.isArray(value)) return value.map((entry) => transformStrings(entry, dragonType));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      transformStrings(child, dragonType)
    ])
  );
}

function replaceVariantTriggers(value, variants, state = { index: 0 }) {
  if (typeof value === "string" && value === "minecraft:become_blaze") {
    const variant = variants[state.index % variants.length];
    state.index += 1;
    return `minecraft:become_${variant}`;
  }
  if (Array.isArray(value)) return value.map((entry) => replaceVariantTriggers(entry, variants, state));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      replaceVariantTriggers(child, variants, state)
    ])
  );
}

function setDragonVariantData(entity, dragon) {
  const definition = entity["minecraft:entity"];
  const properties = definition.description.properties;
  properties["dragonmounts2:variant_type"] = {
    type: "enum",
    values: dragon.variants,
    default: dragon.default_variant,
    client_sync: true
  };
  definition.components["minecraft:type_family"].family[0] = dragon.type;

  const breathGroup = definition.component_groups?.["dragonmounts2:dragon_breath"];
  const spawnEntity = breathGroup?.["minecraft:spawn_entity"];
  if (spawnEntity) {
    spawnEntity.entities = [
      {
        filters: {
          all_of: [
            { test: "bool_property", subject: "self", domain: "dragonmounts2:is_breathing", operator: "==" },
            { test: "float_property", subject: "self", domain: "dragonmounts2:breath_charge", operator: "==", value: 1.0 }
          ]
        },
        min_wait_time: 0,
        max_wait_time: 0,
        spawn_entity: dragon.breath_entity || defaultBreathEntity,
        spawn_event: "minecraft:entity_spawned",
        single_use: true,
        spawn_sound: "",
        num_to_spawn: 1
      }
    ];
  }

  for (const eventName of Object.keys(definition.events)) {
    if (eventName.startsWith("minecraft:become_")) delete definition.events[eventName];
  }
  for (const variant of dragon.variants) {
    definition.events[`minecraft:become_${variant}`] = {
      set_property: { "dragonmounts2:variant_type": variant }
    };
  }
  Object.assign(definition.components, dragon.custom_components || {});
  Object.assign(definition.component_groups ||= {}, dragon.custom_component_groups || {});
  return entity;
}

function makeDragon(dragon) {
  const template = replaceVariantTriggers(
    transformStrings(readJson(dragonTemplatePath), dragon.type),
    dragon.variants
  );
  const entity = setDragonVariantData(template, dragon);
  entity["minecraft:entity"].description.identifier = `${namespace}:${dragon.type}`;
  return entity;
}

function makeEgg(dragon) {
  const egg = transformStrings(readJson(eggTemplatePath), `${dragon.type}_egg`);
  egg["minecraft:entity"].description.identifier = `${namespace}:${dragon.type}_egg`;
  return egg;
}

function makeAmulet(dragon) {
  const amulet = transformStrings(readJson(path.resolve(toolRoot, config.templates.amulet)), dragon.type);
  const definition = amulet["minecraft:item"];
  definition.description.identifier = `${namespace}:${dragon.type.replace("_dragon", "")}_amulet`;
  definition.components["minecraft:icon"].textures.default = `${namespace}:${dragon.type.replace("_dragon", "")}_amulet`;
  definition.components["minecraft:icon"].textures.dyed = `${namespace}:${dragon.type.replace("_dragon", "")}_amulet_overlay`;
  definition.components["dragonmounts2:dragon_amulet"].dragon_types = [`${namespace}:${dragon.type}`];
  return amulet;
}

function makeResourceDragon(dragon) {
  const resource = transformStrings(
    readJson(path.resolve(toolRoot, config.templates.resource_dragon)),
    dragon.type
  );
  const description = resource["minecraft:client_entity"].description;
  description.identifier = `${namespace}:${dragon.type}`;
  description.spawn_egg.texture = `${namespace}:spawn_egg_${dragon.type}`;
  const textures = {};
  for (const variant of dragon.variants) {
    textures[variant] = `textures/entity/dragon/${dragon.type.replace("_dragon", "")}/${variant}/body`;
    textures[`${variant}_glow`] = `textures/entity/dragon/${dragon.type.replace("_dragon", "")}/${variant}/glow`;
  }
  for (const [key, value] of Object.entries(description.textures)) {
    if (!key.endsWith("_glow") && !["flame", "blaze", "blue_fire"].includes(key)) textures[key] = value;
  }
  description.textures = textures;
  const preAnimation = description.scripts.pre_animation;
  const variantLines = dragon.variants.map((variant, index) => `v.is_${variant} = v.variant_type=='${variant}';`);
  const indexExpression = dragon.variants
    .map((variant, index) => `v.is_${variant}?${index}`)
    .join(":") + ":0";
  const variantStart = preAnimation.findIndex((line) => line.includes("v.is_blaze ="));
  const variantEnd = preAnimation.findIndex((line) => line.includes("v.has_collar ="));
  if (variantStart >= 0 && variantEnd > variantStart) {
    preAnimation.splice(variantStart, variantEnd - variantStart, ...variantLines, `v.variant_type_index = ${indexExpression};`);
  }
  return resource;
}

function makeResourceAmulet(dragon) {
  const base = dragon.type.replace("_dragon", "");
  const amulet = transformStrings(
    readJson(path.resolve(toolRoot, config.templates.resource_amulet)),
    dragon.type
  );
  amulet["minecraft:attachable"].description.identifier = `${namespace}:${base}_amulet`;
  return JSON.parse(JSON.stringify(amulet).replaceAll("fire_amulet", `${base}_amulet`));
}

function makeCustomItem(dragon, asset, piece) {
  const base = `${dragon.type}_${asset.name}`;
  const itemName = piece ? `${base}_${piece}` : base;
  const item = {
    format_version: "1.26.50",
    "minecraft:item": {
      description: {
        identifier: `${namespace}:${itemName}`,
        menu_category: {
          category: asset.kind === "armor" ? "equipment" : "items",
          group: asset.group || (asset.kind === "armor"
            ? "dragonmounts2:itemGroup.name.dragonarmors"
            : asset.kind === "tool" ? "dragonmounts2:itemGroup.name.dragon_flutes" : "dragonmounts2:itemGroup.name.dragon_scales"),
          is_hidden_in_commands: false
        }
      },
      components: {
        "minecraft:display_name": { value: `item.${namespace}:${itemName}.name` },
        "minecraft:icon": { textures: { default: `${namespace}:${itemName}` } },
        "minecraft:max_stack_size": { value: asset.kind === "armor" ? 1 : 64 },
        "minecraft:rarity": asset.rarity || "common",
        "minecraft:tags": { tags: asset.tags || (asset.kind === "armor"
          ? ["minecraft:is_armor", "dragonmounts2:dragonarmors"]
          : asset.kind === "tool" ? ["dragonmounts2:dragon_tools"] : ["dragonmounts2:dragon_scales"]) }
      }
    }
  };
  if (asset.kind === "armor") {
    const slots = { helmet: "head", chestplate: "chest", leggings: "legs", boots: "feet" };
    item["minecraft:item"].components["minecraft:wearable"] = { slot: `slot.armor.${slots[piece]}` };
  }
  if (asset.kind === "tool") item["minecraft:item"].components["minecraft:hand_equipped"] = { value: true };
  Object.assign(item["minecraft:item"].components, asset.components || {});
  return item;
}

function makeResourceCustomAttachable(dragon, asset, piece, itemName) {
  const configuredTemplate = asset.attachable_template;
  if (configuredTemplate) {
    const template = readJson(path.resolve(toolRoot, configuredTemplate));
    return JSON.parse(JSON.stringify(template)
      .replaceAll("fire_dragon_scale", itemName)
      .replaceAll("fire_classic", itemName));
  }

  if (asset.kind === "armor") {
    const templatePath = config.templates.resource_armor_attachables?.[piece];
    if (!templatePath) throw new Error(`Missing armor attachable template for ${piece}`);
    const template = readJson(path.resolve(toolRoot, templatePath));
    const attachable = JSON.parse(JSON.stringify(template)
      .replaceAll("fire_dragon_scale", itemName)
      .replaceAll("fire_classic", itemName));
    attachable["minecraft:attachable"].description.identifier = `${namespace}:${itemName}`;
    attachable["minecraft:attachable"].description.textures.default = `textures/models/dragonmounts2_generated/${itemName}`;
    return attachable;
  }

  return {
    format_version: "1.10.0",
    "minecraft:attachable": {
      description: {
        identifier: `${namespace}:${itemName}`,
        materials: { default: "entity_alphatest", enchanted: "entity_alphatest_glint" },
        textures: {
          default: `textures/models/dragonmounts2_generated/${itemName}`,
          enchanted: "textures/misc/enchanted_item_glint"
        },
        geometry: { default: asset.geometry || "geometry.spear" },
        render_controllers: [asset.render_controller || "controller.render.item_default"]
      }
    }
  };
}

function makeLootTable(dragon, sheared) {
  const assets = dragon.custom_assets.filter((asset) => asset.loot !== false);
  const entries = assets.map((asset) => ({
    type: "item",
    weight: asset.loot_weight || 1,
    name: `${namespace}:${dragon.type}_${asset.name}`,
    functions: [{
      function: "set_count",
      count: sheared ? { min: 1, max: 1 } : { min: asset.loot_min || 1, max: asset.loot_max || 3 }
    }]
  }));
  if (!sheared) entries.push({ type: "item", weight: 1, name: `${namespace}:raw_dragon_meat` });
  return { pools: [{ rolls: 1, entries: entries.length ? entries : [{ type: "item", name: `${namespace}:raw_dragon_meat` }] }] };
}

function writeCustomAssets(dragon, dryRun) {
  const outputRoot = path.resolve(toolRoot, config.output.custom_items || "../../items/dragonmounts2_generated");
  for (const asset of dragon.custom_assets) {
    const pieces = asset.kind === "armor" ? ["helmet", "chestplate", "leggings", "boots"] : [undefined];
    for (const piece of pieces) {
      const itemName = `${dragon.type}_${asset.name}${piece ? `_${piece}` : ""}`;
      writeJson(path.join(outputRoot, `${itemName}.json`), makeCustomItem(dragon, asset, piece), dryRun);
      addResourceItemTexture(dragon, dryRun, itemName);
      writeJson(
        path.join(resourceAttachableRoot, `${itemName}.json`),
        makeResourceCustomAttachable(dragon, asset, piece, itemName),
        dryRun
      );
      addLanguageEntries(itemName, dryRun);
    }
  }
}

function addLanguageEntries(itemName, dryRun) {
  const key = `item.${namespace}:${itemName}.name`;
  for (const languagePath of languageRoots) {
    const text = fs.existsSync(languagePath) ? fs.readFileSync(languagePath, "utf8") : "";
    if (text.split(/\r?\n/).some((line) => line.startsWith(`${key}=`))) continue;
    const next = `${text.replace(/\s*$/, "")}${text ? "\n" : ""}${key}=${itemName.replaceAll("_", " ")}\n`;
    if (!dryRun) {
      fs.mkdirSync(path.dirname(languagePath), { recursive: true });
      fs.writeFileSync(languagePath, next);
    }
    console.log(`${dryRun ? "would update" : "updated"} ${path.relative(process.cwd(), languagePath)}`);
  }
}

function writeDragonLoot(dragon, dryRun) {
  if (dragon.custom_assets.length === 0) return;
  writeJson(path.join(lootRoot, `${dragon.type}.json`), makeLootTable(dragon, false), dryRun);
  writeJson(path.join(lootRoot, `${dragon.type}_sheared.json`), makeLootTable(dragon, true), dryRun);
}

function addFluteDragonType(dragon, dryRun) {
  if (!fs.existsSync(fluteRoot)) return;
  for (const file of fs.readdirSync(fluteRoot).filter((entry) => entry.endsWith(".json"))) {
    const filePath = path.join(fluteRoot, file);
    const item = readJson(filePath);
    const flute = item["minecraft:item"]?.components?.["dragonmounts2:dragon_flute"];
    if (!flute) continue;
    if (flute.dragon_types.includes(`${namespace}:${dragon.type}`)) {
      console.log(`already registered ${namespace}:${dragon.type} in ${path.relative(process.cwd(), filePath)}`);
      continue;
    }
    flute.dragon_types.push(`${namespace}:${dragon.type}`);
    if (!dryRun) fs.writeFileSync(filePath, `${formatJson(item)}\n`);
    console.log(`${dryRun ? "would update" : "updated"} ${path.relative(process.cwd(), filePath)}`);
  }
}

function addScriptData(dragon, dryRun) {
  const text = fs.readFileSync(itemDataPath, "utf8");
  const base = dragon.type.replace("_dragon", "");
  const entries = {
    dragonAmuletTypes: {
      [`${namespace}:${dragon.type}`]: `${namespace}:${base}_amulet`
    },
    dragonAmuletDataBlockTypes: {
      [`${namespace}:${dragon.type}`]: {
        dragon_item: `${namespace}:${base}_amulet`,
        dragon_data: {
          variant_property: "dragonmounts2:variant_type",
          text_translate_type: `tooltip.dragonmounts2:${base}`,
          text_color_type: dragon.text_color || "§f"
        }
      }
    }
  };
  let next = text;
  for (const [exportName, entry] of Object.entries(entries)) {
    if (next.includes(`"${namespace}:${dragon.type}":`)) {
      console.log(`already registered ${namespace}:${dragon.type} in ${exportName}`);
      continue;
    }
    const exportStart = next.indexOf(`export const ${exportName} = {`);
    const close = next.indexOf("\n};", exportStart);
    if (exportStart < 0 || close < 0) throw new Error(`Could not update ${exportName}`);
    const key = Object.keys(entry)[0];
    const value = JSON.stringify(Object.values(entry)[0], null, 2).replace(/\n/g, "\n  ");
    next = `${next.slice(0, close)}\n  "${key}": ${value},${next.slice(close)}`;
  }
  if (!dryRun) fs.writeFileSync(itemDataPath, next);
  console.log(`${dryRun ? "would update" : "updated"} ${path.relative(process.cwd(), itemDataPath)}`);
}

function addResourceItemTexture(dragon, dryRun, itemBase = `${dragon.type.replace("_dragon", "")}_amulet`) {
  const key = `${namespace}:${itemBase}`;
  const text = fs.readFileSync(itemTexturePath, "utf8");
  if (text.includes(`"${key}"`)) return;
    if (text.includes(`"${key}"`)) {
      console.log(`already exists ${key} in ${path.relative(process.cwd(), itemTexturePath)}`);
      return;
    }
  const marker = "// ===== Miscellaneous =====";
  const texturePath = itemBase.endsWith("_amulet")
    ? `textures/items/dragonmounts2_equipment/tools/amulets/${itemBase.replace("_amulet", "_dragon_amulet")}`
    : `textures/items/dragonmounts2_generated/${itemBase}`;
  const entry = `"${key}":{"textures":"${texturePath}"},\n`;
  const next = text.replace(marker, `${entry}\n${marker}`);
  if (next === text) throw new Error("Could not update resource item_texture.json");
  if (!dryRun) fs.writeFileSync(itemTexturePath, next);
  console.log(`${dryRun ? "would update" : "updated"} ${path.relative(process.cwd(), itemTexturePath)}`);
}

function writeOutput(dragon, kind, value, dryRun) {
  const directory = path.join(entityRoot, dragon.type);
  const filePath = path.join(directory, `${dragon.type}${kind === "egg" ? "_egg" : ""}.json`);
  if (!dryRun) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, `${formatJson(value)}\n`);
  }
  console.log(`${dryRun ? "would generate" : "generated"} ${path.relative(process.cwd(), filePath)}`);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }
  const dragons = config.dragons.map(validateDragon);
  let selected;

  if (options.type) {
    selected = dragons.filter((dragon) => dragon.type === options.type);
    if (selected.length === 0 && getDragonFolderTypes().includes(options.type)) {
      selected = [buildDiscoveredDragon(options.type)];
    }
    if (selected.length === 0) throw new Error(`No dragon type configured or generated: ${options.type}`);
  } else if (options.all) {
    selected = getAllDragonsForGeneration();
  } else {
    selected = await promptInteractive();
  }

  if (selected.length === 0) {
    console.log("No dragons selected.");
    return;
  }

  selected = applyAssetOption(selected, options.assets);

  for (const dragon of selected) {
    writeOutput(dragon, "dragon", makeDragon(dragon), options.dryRun);
    writeOutput(dragon, "egg", makeEgg(dragon), options.dryRun);
    writeJson(path.join(amuletRoot, `${dragon.type.replace("_dragon", "")}_amulet.json`), makeAmulet(dragon), options.dryRun);
    writeJson(path.join(resourceEntityRoot, dragon.type, `${dragon.type}.entity.json`), makeResourceDragon(dragon), options.dryRun);
    writeJson(path.join(resourceAmuletRoot, `${dragon.type.replace("_dragon", "")}_amulet.json`), makeResourceAmulet(dragon), options.dryRun);
    writeCustomAssets(dragon, options.dryRun);
    writeDragonLoot(dragon, options.dryRun);
    addScriptData(dragon, options.dryRun);
    addResourceItemTexture(dragon, options.dryRun);
    addFluteDragonType(dragon, options.dryRun);
  }
  console.log("Done");
}

main().catch((error) => {
  console.error(color(`Error: ${error.message}`, "red"));
  process.exitCode = 1;
});
