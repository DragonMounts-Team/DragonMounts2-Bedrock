const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const toolRoot = __dirname;
const configPath = path.join(toolRoot, "dragon-types.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const armorTooltipConfigPath = path.join(toolRoot, "armor-tooltips.json");
const armorTooltipConfig = JSON.parse(fs.readFileSync(armorTooltipConfigPath, "utf8"));
const namespace = config.namespace;
let runtimeOptions = { dryRun: false, diff: false, summary: false };
let generationSummary = { dragons: [], files: { generated: 0, updated: 0, wouldGenerate: 0, wouldUpdate: 0 }, issues: [] };
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
const renderControllerRoot = path.resolve(toolRoot, config.output.render_controllers);
const resourceAmuletRoot = path.resolve(toolRoot, config.output.resource_amulets);
const itemTexturePath = path.resolve(toolRoot, config.output.resource_item_texture);
const itemDataPath = path.resolve(toolRoot, config.output.script_data);
const lootRoot = path.resolve(toolRoot, config.output.loot_tables || "../../loot_tables/entities");
const fluteRoot = path.resolve(toolRoot, config.output.flutes || "../../items/dragonmounts2_equipment/tools/dragon_flutes");
const resourceAttachableRoot = path.resolve(toolRoot, config.output.resource_attachables);
const languageRoots = (config.output.languages || ["../../texts/en_US.lang", "../../texts/en_GB.lang"])
  .map((filePath) => path.resolve(toolRoot, filePath));
const languageSource = path.resolve(toolRoot, config.output.language_source || "../../texts/en_US.lang");
const armorTooltipLanguageRoots = (config.output.tooltip_languages || [languageSource])
  .map((filePath) => path.resolve(toolRoot, filePath));
const templateDragonType = "fire_dragon";
const defaultBreathEntity = config.defaults?.breath_entity || "dragonmounts2:fire_dragonbreath";
const equipmentFormatVersion = "1.26.50";
const supportedDragonModels = new Set([
  "bland", "horned_antlers", "normal", "scale_sharpened", "sculk", "skeleton",
  "spiked_horned", "tail_horned", "tail_scale_inclined", "winged_horned"
]);
const biomeTagSuggestions = [
  "badlands", "beach", "birch", "cold", "deep_ocean", "desert", "edge", "flower_forest",
  "forest", "frozen", "ice", "jungle", "lukewarm", "mangrove", "mesa", "mountain",
  "nether", "ocean", "overworld", "plains", "river", "savanna", "snow", "swamp", "taiga",
  "the_end", "warm", "windswept"
];
let activeCompletionMode = null;

function completeBiomeTag(line) {
  const separatorIndex = line.lastIndexOf(",");
  const prefix = separatorIndex >= 0 ? line.slice(0, separatorIndex + 1) : "";
  const partial = line.slice(separatorIndex + 1).trim().toLowerCase();
  const matches = biomeTagSuggestions
    .filter((tag) => tag.startsWith(partial))
    .map((tag) => `${prefix}${tag}`);
  return [matches, line];
}

function completeInput(line) {
  return activeCompletionMode === "biome_tag" ? completeBiomeTag(line) : [[], line];
}
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
  const options = {
    all: false,
    assets: undefined,
    audit: false,
    clean: false,
    cleanup: false,
    diff: false,
    dryRun: false,
    tooltips: false,
    help: false,
    list: false,
    menu: false,
    preview: false,
    repair: false,
    type: undefined,
    verbose: false
  };
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
    else if (arg === "--audit" || arg === "-c") options.audit = true;
    else if (arg === "--clean" || arg === "--cleanup") {
      options.clean = true;
      options.cleanup = true;
      options.audit = true;
      options.repair = true;
    }
    else if (arg === "--diff" || arg === "--preview") {
      options.diff = true;
      options.preview = true;
    }
    else if (arg === "--dry-run" || arg === "-d") options.dryRun = true;
    else if (arg === "--summary" || arg === "--report") options.summary = true;
      else if (arg === "--tooltips") options.tooltips = true;
    else if (arg === "--help" || arg === "-h" || arg === "/?") options.help = true;
    else if (arg === "--list" || arg === "-l") options.list = true;
    else if (arg === "--menu") options.menu = true;
    else if (arg === "--repair" || arg === "-r") options.repair = true;
    else if (arg === "--type" || arg === "-t") options.type = nextValue("--type");
    else if (arg.startsWith("--type=")) options.type = arg.split("=", 2)[1];
    else if (arg === "--verbose" || arg === "-v") options.verbose = true;
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
  console.log("  generate.cmd                         Open the interactive generator menu");
  console.log("  generate.cmd --list                 List configured dragon types");
  console.log("  generate.cmd --type fire_dragon     Generate a single dragon");
  console.log("  generate.cmd --all                  Generate all configured dragons");
  console.log("  generate.cmd --type fire_dragon --assets all");
  console.log("                                      Add starter equipment to the selected dragon");
  console.log("  generate.cmd --audit                Check for stale template mismatches and other generator issues");
  console.log("  generate.cmd --repair              Fix detected dragon template issues and regenerate affected files");
  console.log("  generate.cmd --clean               Audit + repair all dragons and clean stale generated output");
  console.log("  generate.cmd --diff                Show a file-by-file change preview without writing files");
  console.log("  generate.cmd --summary             Summarize what would change and what issues were detected");
  console.log("  generate.cmd --dry-run              Preview generation without writing files");
    console.log("  generate.cmd --tooltips              Generate armor tooltips in configured language files");
  console.log("  biome_variant_rules                 Route natural spawns with any_tags, all_tags, and exclude_tags");
  console.log("  generate.cmd --help                Show this help");
  console.log("");
  console.log("Short commands:");
  console.log("  -a = --all");
  console.log("  -c = --audit");
  console.log("  -d = --dry-run");
  console.log("  -e all = --assets all");
  console.log("  -h = --help");
  console.log("  --diff / --preview = show a generated diff preview");
  console.log("  --clean / --cleanup = audit + repair all dragons and clean stale output");
  console.log("  --summary / --report = show a concise change summary");
  console.log("  -l = --list");
  console.log("  -r = --repair");
  console.log("  -t = --type");
  console.log("  -v = --verbose");
}

function printBanner() {
  console.log(color("\n==================================================", "cyan"));
  console.log(color("                Dragon Generator Menu             ", "cyan"));
  console.log(color("==================================================", "cyan"));
  console.log(color("Use lowercase snake_case names like fire_dragon or blue_fire.", "dim"));
}

function listAvailableDragons() {
  const dragons = getAllDragonsForGeneration();
  console.log(color("\nAvailable dragons:", "cyan"));
  for (const dragon of dragons) {
    console.log(`  - ${dragon.type} (${dragon.variants.join(", ")})`);
  }
  console.log(color(`\nTotal: ${dragons.length}`, "green"));
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

function parseBiomeTagInput(value, label) {
  const tags = value.split(",").map((tag) => tag.trim()).filter(Boolean);
  tags.forEach((tag) => assertSafeName(tag, label));
  return [...new Set(tags)];
}

async function promptBiomeTags(terminal, question) {
  activeCompletionMode = "biome_tag";
  try {
    return await terminal.question(question);
  } finally {
    activeCompletionMode = null;
  }
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

  const biomeVariantRules = [];
  const wantsBiomeRules = (await terminal.question("Add biome-specific natural spawn rules? (y/n, default n): ")).trim().toLowerCase();
  if (["y", "yes"].includes(wantsBiomeRules)) {
    console.log("Enter one rule per variant in priority order. Leave variant blank when finished.");
    console.log("Use comma-separated tags, for example: frozen, ice, cold. Press Tab while typing for known tag suggestions.");
    while (true) {
      const variant = (await terminal.question("Biome rule variant (blank to finish): ")).trim();
      if (!variant) break;
      assertSafeName(variant, "Biome rule variant");
      if (!variants.includes(variant)) throw new Error(`Biome rule variant must be one of: ${variants.join(", ")}`);
      if (biomeVariantRules.some((rule) => rule.variant === variant)) throw new Error(`Duplicate biome rule for ${variant}`);
      const anyTags = parseBiomeTagInput(
        (await promptBiomeTags(terminal, "  Any tags (comma-separated, Tab for suggestions): ")).trim(),
        "Biome tag"
      );
      const allTags = parseBiomeTagInput(
        (await promptBiomeTags(terminal, "  All tags (comma-separated, Tab for suggestions): ")).trim(),
        "Biome tag"
      );
      const excludeTags = parseBiomeTagInput(
        (await promptBiomeTags(terminal, "  Exclude tags (comma-separated, Tab for suggestions): ")).trim(),
        "Biome tag"
      );
      if (!anyTags.length && !allTags.length && !excludeTags.length) {
        throw new Error(`Biome rule for ${variant} needs at least one tag`);
      }
      biomeVariantRules.push({ variant, any_tags: anyTags, all_tags: allTags, exclude_tags: excludeTags });
    }
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
    biome_variant_rules: biomeVariantRules,
    breath_entity: breathEntity,
    text_color: textColor,
    custom_assets: customAssets,
    custom_components: customComponents,
    custom_component_groups: customComponentGroups
  });
  console.log(color("\nReview:", "cyan"));
  console.log(`  Dragon: ${dragon.type}`);
  console.log(`  Variants: ${dragon.variants.join(", ")}`);
  console.log(`  Biome routing: ${dragon.biome_variant_rules.length ? dragon.biome_variant_rules.map((rule) => rule.variant).join(" -> ") : "none"}`);
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
  const terminal = readline.createInterface({ input: stdin, output: stdout, completer: completeInput });
  try {
    while (true) {
      printBanner();
      console.log("Options:");
      console.log("  1) List dragons");
      console.log("  2) Generate all configured dragons");
      console.log("  3) Generate all dragons with starter equipment");
      console.log("  4) Generate one dragon by name");
      console.log("  5) Create one new dragon");
      console.log("  6) Exit");

      const option = (await terminal.question("\nChoose an option (1-6): ")).trim();
      if (option === "1") {
        listAvailableDragons();
        await terminal.question("\nPress Enter to continue...");
        continue;
      }
      if (option === "2") {
        return getAllDragonsForGeneration();
      }
      if (option === "3") {
        return applyAssetOption(getAllDragonsForGeneration(), "all");
      }
      if (option === "4") {
        const dragonName = (await terminal.question("Dragon type to generate: ")).trim();
        const chosen = getAllDragonsForGeneration().filter((dragon) => dragon.type === dragonName);
        if (chosen.length === 0) {
          console.log(color(`No dragon named ${dragonName} was found.`, "red"));
          await terminal.question("\nPress Enter to continue...");
          continue;
        }
        return chosen;
      }
      if (option === "5") {
        const dragon = await promptInteractiveDragon(terminal);
        if (dragon) return [dragon];
        console.log(color("Returning to the main menu.", "dim"));
        continue;
      }
      if (option === "6") {
        console.log("Exiting.");
        return [];
      }
      console.log(color("Invalid option. Please choose 1-6.", "yellow"));
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
  const source = fs.readFileSync(filePath, "utf8");
  const withoutComments = source.replace(/\/\/.*$/gm, "");
  try {
    return JSON.parse(withoutComments);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function formatNumberWithPrecision(value, path = []) {
  if (typeof value !== "number" || !Number.isFinite(value)) return JSON.stringify(value);
  const parentKey = path[path.length - 1];
  const propertyName = path[path.length - 2];
  const rangeParent = path[path.length - 2] === "range" ? path[path.length - 3] : null;
  const floatProperties = new Set([
    "dragonmounts2:breath_charge",
    "dragonmounts2:breathing_sound",
    "dragonmounts2:death_ticks",
    "dragonmounts2:egg_hatch_time"
  ]);

  if (path.length >= 2 && floatProperties.has(propertyName) && parentKey === "default") {
    if (value === 0) return "0.00";
    if (value === 1) return "1.00";
    if (value === 2) return "2.00";
  }

  if (path.length >= 3 && rangeParent && floatProperties.has(rangeParent) && path[path.length - 2] === "range") {
    if (parentKey === 0 && value === 0) return "0.00";
    if (parentKey === 1 && value === 1) return "1.00";
    if (parentKey === 1 && value === 2) return "2.00";
    if (parentKey === 1 && value === 0.3) return "0.30";
  }

  if (path.length >= 2 && path[path.length - 2] === "dragonmounts2:egg_hatch_time") {
    if (parentKey === "default" && value === 0) return "0.000";
  }

  if (path.length >= 3 && path[path.length - 3] === "dragonmounts2:egg_hatch_time" && path[path.length - 2] === "range") {
    if (parentKey === 0 && value === 0) return "0.000";
    if (parentKey === 1 && value === 0.3) return "0.300";
  }

  return JSON.stringify(value);
}

function formatJson(value, indent = 0, path = []) {
  const spacing = " ".repeat(indent);
  const childSpacing = " ".repeat(indent + 2);
  if (value === null || typeof value !== "object") {
    if (typeof value === "number") return formatNumberWithPrecision(value, path);
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.every((entry) => entry === null || typeof entry !== "object")) {
      return `[ ${value.map((entry, index) => formatJson(entry, indent, [...path, index])).join(", ")} ]`;
    }
    return `[\n${value.map((entry, index) => `${childSpacing}${formatJson(entry, indent + 2, [...path, index])}`).join(",\n")}\n${spacing}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return "{ }";
  const formattedEntries = entries.map(([key, entry]) => `"${key}": ${formatJson(entry, indent + 2, [...path, key])}`);
  const isInline = entries.every(([, entry]) => entry === null || typeof entry !== "object" || (Array.isArray(entry)
    ? entry.every((item) => item === null || typeof item !== "object")
    : Object.values(entry).every((item) => item === null || typeof item !== "object")));
  if (isInline) return `{ ${formattedEntries.join(", ")} }`;
  return `{\n${formattedEntries.map((entry) => `${childSpacing}${entry}`).join(",\n")}\n${spacing}}`;
}

function renderDiffPreview(filePath, nextText) {
  if (!runtimeOptions.diff && !runtimeOptions.dryRun) return;
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(process.cwd(), absolutePath) || path.basename(absolutePath);
  const currentText = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
  if (currentText === nextText) return;

  const oldLines = currentText.split(/\r?\n/);
  const newLines = nextText.split(/\r?\n/);
  const maxLines = Math.max(oldLines.length, newLines.length);
  const diffLines = [];

  for (let index = 0; index < maxLines; index += 1) {
    const before = oldLines[index];
    const after = newLines[index];
    if (before === after) continue;
    if (before !== undefined) diffLines.push(`- ${before}`);
    if (after !== undefined) diffLines.push(`+ ${after}`);
  }

  console.log(color(`\nDiff preview for ${relativePath}:`, "cyan"));
  if (diffLines.length === 0) {
    console.log("  (no textual differences)");
    return;
  }
  console.log(diffLines.map((line) => `  ${line}`).join("\n"));
}

function recordSummaryAction(filePath, action) {
  if (!runtimeOptions.summary && !runtimeOptions.diff) return;
  const key = action.startsWith("would")
    ? (action.includes("update") ? "wouldUpdate" : "wouldGenerate")
    : (action.includes("update") ? "updated" : "generated");
  generationSummary.files[key] = (generationSummary.files[key] || 0) + 1;
  generationSummary.files[filePath] = action;
}

function writeTextAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, text, "utf8");
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

function printSummaryReport(selected) {
  if (!runtimeOptions.summary && !runtimeOptions.diff) return;

  const totalSelected = selected.length;
  const generatedCount = generationSummary.files.generated || 0;
  const updatedCount = generationSummary.files.updated || 0;
  const wouldGenerateCount = generationSummary.files.wouldGenerate || 0;
  const wouldUpdateCount = generationSummary.files.wouldUpdate || 0;
  const issueCount = generationSummary.issues.length;

  console.log(color("\nSummary report:", "cyan"));
  console.log(`  Dragons selected: ${totalSelected}`);
  console.log(`  Files generated: ${generatedCount}`);
  console.log(`  Files updated: ${updatedCount}`);
  console.log(`  Dry-run preview actions: ${wouldGenerateCount + wouldUpdateCount}`);
  console.log(`  Audit issues: ${issueCount}`);
  if (issueCount > 0) {
    for (const issue of generationSummary.issues.slice(0, 5)) {
      console.log(`    - ${issue}`);
    }
    if (generationSummary.issues.length > 5) console.log(`    - ... and ${generationSummary.issues.length - 5} more`);
  } else {
    console.log("    - no audit issues detected");
  }
}

function writeJson(filePath, value, dryRun) {
  const exists = fs.existsSync(filePath);
  const nextText = `${formatJson(value)}\n`;
  const currentText = exists ? fs.readFileSync(filePath, "utf8") : "";
  if (exists && currentText === nextText) {
    console.log(`unchanged ${path.relative(process.cwd(), filePath)}`);
    return false;
  }
  renderDiffPreview(filePath, nextText);
  if (!dryRun) {
    writeTextAtomic(filePath, nextText);
  }
  const action = exists
    ? (dryRun ? "already exists (would update)" : "already exists, updated")
    : (dryRun ? "would generate" : "generated");
  recordSummaryAction(filePath, action);
  console.log(`${action} ${path.relative(process.cwd(), filePath)}`);
  return true;
}

function assertSafeName(value, label) {
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value)) {
    throw new Error(`${label} must use lowercase snake_case: ${value}`);
  }
}

function validateBiomeRules(rules, variants, dragonType) {
  if (rules === undefined) return undefined;
  if (!Array.isArray(rules)) throw new Error(`${dragonType} biome_variant_rules must be an array`);

  const seenVariants = new Set();
  return rules.map((rule, index) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new Error(`${dragonType} biome rule #${index + 1} must be an object`);
    }
    const variant = rule.variant;
    assertSafeName(variant, `Biome rule #${index + 1} variant`);
    if (!variants.includes(variant)) {
      throw new Error(`${dragonType} biome rule variant is not listed in variants: ${variant}`);
    }
    if (seenVariants.has(variant)) throw new Error(`${dragonType} has duplicate biome rule for ${variant}`);
    seenVariants.add(variant);

    const normalized = { variant };
    for (const key of ["any_tags", "all_tags", "exclude_tags"]) {
      const tags = rule[key] || [];
      if (!Array.isArray(tags)) throw new Error(`${dragonType} biome rule ${variant} ${key} must be an array`);
      tags.forEach((tag) => assertSafeName(tag, `Biome tag in ${variant}`));
      normalized[key] = [...new Set(tags)];
    }
    if (!normalized.any_tags.length && !normalized.all_tags.length && !normalized.exclude_tags.length) {
      throw new Error(`${dragonType} biome rule ${variant} must define at least one tag`);
    }
    return normalized;
  });
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
  const biomeVariantRules = validateBiomeRules(dragon.biome_variant_rules, dragon.variants, dragon.type);
  const customAssets = dragon.custom_assets === "all"
    ? makeStarterAssets(dragon.material_name || "scales")
    : dragon.custom_assets || [];
  const materialName = dragon.material_name || "scales";
  const model = dragon.model || "normal";
  if (!supportedDragonModels.has(model)) throw new Error(`${dragon.type} has an unsupported model: ${model}`);
  assertSafeName(materialName, "Material name");
  if (!Array.isArray(customAssets)) throw new Error(`${dragon.type} custom_assets must be an array`);
  customAssets.forEach((asset) => {
    if (!asset || typeof asset !== "object") throw new Error(`${dragon.type} has an invalid custom asset`);
    assertSafeName(asset.name, "Custom asset name");
    if (!["item", "armor", "tool"].includes(asset.kind || "item")) {
      throw new Error(`${dragon.type} custom asset kind must be item, armor, or tool`);
    }
  });
  return {
    ...dragon,
    default_variant: defaultVariant,
    model,
    material_name: materialName,
    custom_assets: customAssets,
    ...(biomeVariantRules === undefined ? {} : { biome_variant_rules: biomeVariantRules })
  };
}

function normalizeRepeatedEggSuffix(value) {
  if (typeof value !== "string") return value;
  return value.replace(/((?:[a-z0-9_.:-]+:)?[a-z0-9_]+_dragon)(?:_egg)+/g, "$1_egg");
}

function transformStrings(value, dragonType) {
  if (typeof value === "string") {
    const transformed = value
      .replaceAll(`${namespace}:${templateDragonType}`, `${namespace}:${dragonType}`)
      .replaceAll(templateDragonType, dragonType);
    return normalizeRepeatedEggSuffix(transformed);
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

function normalizeBedrockEntitySchema(value) {
  if (Array.isArray(value)) return value.map(normalizeBedrockEntitySchema);
  if (!value || typeof value !== "object") return value;

  const normalized = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "play_sounds" && typeof child === "string") {
      normalized[key] = [child];
      continue;
    }
    if (key === "run_command") {
      normalized.queue_command = normalizeBedrockEntitySchema(child);
      continue;
    }
    normalized[key] = normalizeBedrockEntitySchema(child);
  }
  return normalized;
}

function replaceVariantTriggers(value, variants, defaultVariants = ["blaze", "flame", "blue_fire"]) {
  const variantLookup = new Map(defaultVariants.map((defaultVariant, index) => [defaultVariant, variants[index] || defaultVariant]));
  const triggerLookup = new Map(defaultVariants.map((defaultVariant, index) => [
    `minecraft:become_${defaultVariant}`,
    `minecraft:become_${variants[index] || defaultVariant}`
  ]));

  if (typeof value === "string") {
    if (triggerLookup.has(value)) return triggerLookup.get(value);
    if (variantLookup.has(value)) return variantLookup.get(value);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => replaceVariantTriggers(entry, variants, defaultVariants));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      replaceVariantTriggers(child, variants, defaultVariants)
    ])
  );
}

function makeBiomeRuleFilters(rule) {
  const filters = [];
  if (rule.all_tags.length) {
    filters.push(...rule.all_tags.map((tag) => ({ test: "has_biome_tag", value: tag })));
  }
  if (rule.any_tags.length) {
    filters.push({
      any_of: rule.any_tags.map((tag) => ({ test: "has_biome_tag", value: tag }))
    });
  }
  filters.push(...rule.exclude_tags.map((tag) => ({ test: "has_biome_tag", operator: "!=", value: tag })));
  return { all_of: filters };
}

function setBiomeVariantSpawnRules(definition, dragon) {
  if (!dragon.biome_variant_rules?.length) return;
  const spawnEvent = definition.events?.["minecraft:entity_spawned"];
  if (!spawnEvent?.sequence) throw new Error(`${dragon.type} template must define minecraft:entity_spawned sequence`);

  const biomeSequence = dragon.biome_variant_rules.map((rule) => ({
    filters: makeBiomeRuleFilters(rule),
    trigger: `minecraft:become_${rule.variant}`
  }));
  const randomVariantStep = spawnEvent.sequence.findIndex((step) =>
    Array.isArray(step.randomize) && step.randomize.some((entry) => entry.trigger?.startsWith("minecraft:become_"))
  );
  if (randomVariantStep < 0) throw new Error(`${dragon.type} template must define a random variant spawn step`);
  spawnEvent.sequence[randomVariantStep] = { sequence: biomeSequence };
}

function setDragonVariantData(entity, dragon) {
  const definition = entity["minecraft:entity"];
  const properties = definition.description.properties;
  properties["dragonmounts2:age_variant"] = {
    type: "enum",
    values: ["adult", "juvenile", "baby"],
    default: "adult",
    client_sync: true
  };
  properties["dragonmounts2:breath_charge"] = {
    type: "float",
    range: [0, 1],
    default: 0,
    client_sync: true
  };
  properties["dragonmounts2:breathing_sound"] = {
    type: "float",
    range: [0, 1],
    default: 0,
    client_sync: true
  };
  properties["dragonmounts2:death_ticks"] = {
    type: "float",
    range: [0, 2],
    default: 0,
    client_sync: true
  };
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
  setBiomeVariantSpawnRules(definition, dragon);
  Object.assign(definition.components, dragon.custom_components || {});
  Object.assign(definition.component_groups ||= {}, dragon.custom_component_groups || {});
  return entity;
}

function makeDragon(dragon) {
  const template = normalizeBedrockEntitySchema(replaceVariantTriggers(
    transformStrings(readJson(dragonTemplatePath), dragon.type),
    dragon.variants
  ));
  const entity = setDragonVariantData(template, dragon);
  entity["minecraft:entity"].description.identifier = `${namespace}:${dragon.type}`;
  return entity;
}

function makeEgg(dragon) {
  const egg = normalizeBedrockEntitySchema(
    transformStrings(readJson(eggTemplatePath), `${dragon.type}_egg`)
  );
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
  const modelGeometry = `geometry.dragonmounts2.dragon.${dragon.model}`;
  description.geometry.dragon_default = modelGeometry;
  description.geometry.glow = modelGeometry;
  description.render_controllers = description.render_controllers.map((controller) => {
    if (typeof controller === "string") return controller;
    const [name, condition] = Object.entries(controller)[0];
    return { [name.replaceAll("fire_dragon", dragon.type)]: condition };
  });
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
  if (dragon.type !== templateDragonType) {
    const variantLines = dragon.variants.map((variant) => `v.is_${variant} = v.variant_type=='${variant}';`);
    const indexExpression = dragon.variants
      .map((variant, index) => `v.is_${variant}?${index}`)
      .join(":") + ":0";
    const variantStart = preAnimation.findIndex((line) => line.includes("v.is_blaze ="));
    const variantEnd = preAnimation.findIndex((line) => line.includes("v.has_collar ="));
    if (variantStart >= 0 && variantEnd > variantStart) {
      preAnimation.splice(variantStart, variantEnd - variantStart, ...variantLines, `v.variant_type_index = ${indexExpression};`);
    }
  }
  return resource;
}

function makeRenderControllers(dragon) {
  const template = readJson(path.resolve(toolRoot, config.templates.render_controllers));
  const generated = JSON.parse(JSON.stringify(template).replaceAll(templateDragonType, dragon.type));
  const baseTextures = dragon.variants.map((variant) => `Texture.${variant}`);
  const glowTextures = dragon.variants.map((variant) => `Texture.${variant}_glow`);

  const baseController = generated.render_controllers?.[`controller.render.dragonmounts2.${dragon.type}.base`];
  const deathController = generated.render_controllers?.[`controller.render.dragonmounts2.${dragon.type}.death_main_pass`];
  const glowController = generated.render_controllers?.[`controller.render.dragonmounts2.${dragon.type}.glow`];

  if (baseController?.arrays?.textures?.["Array.base"]) {
    baseController.arrays.textures["Array.base"] = baseTextures;
  }
  if (deathController?.arrays?.textures?.["Array.base"]) {
    deathController.arrays.textures["Array.base"] = baseTextures;
  }
  if (glowController?.arrays?.textures?.["Array.base"]) {
    glowController.arrays.textures["Array.base"] = glowTextures;
  }

  return generated;
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
  const descriptor = getAssetDescriptor(dragon, asset, piece);
  const starterTemplatePath = getStarterItemTemplatePath(asset, piece);
  if (starterTemplatePath && fs.existsSync(starterTemplatePath)) {
    const item = transformStrings(readJson(starterTemplatePath), dragon.type);
    item.format_version = equipmentFormatVersion;
    return item;
  }
  const itemName = descriptor.itemName;
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
  if (asset.kind === "tool") {
    const toolTemplatePath = path.join(resourceAttachableRoot, "tools", `${asset.name}s`, `fire_dragon_scale_${asset.name}.json`);
    if (!fs.existsSync(toolTemplatePath)) return null;
    const template = readJson(toolTemplatePath);
    const attachable = JSON.parse(JSON.stringify(template).replaceAll("fire_dragon_scale", itemName));
    attachable.format_version = equipmentFormatVersion;
    attachable["minecraft:attachable"].description.identifier = `${namespace}:${itemName}`;
    return attachable;
  }
  if (asset.kind !== "armor") return null;
  const configuredTemplate = asset.attachable_template;
  if (configuredTemplate) {
    const template = readJson(path.resolve(toolRoot, configuredTemplate));
    const attachable = JSON.parse(JSON.stringify(template)
      .replaceAll("fire_dragon_scale", itemName)
      .replaceAll("fire_classic", itemName));
    attachable.format_version = equipmentFormatVersion;
    return attachable;
  }

  if (asset.kind === "armor") {
    const templatePath = config.templates.resource_armor_attachables?.[piece];
    if (!templatePath) throw new Error(`Missing armor attachable template for ${piece}`);
    const template = readJson(path.resolve(toolRoot, templatePath));
    const attachable = JSON.parse(JSON.stringify(template)
      .replaceAll("fire_dragon_scale", itemName)
      .replaceAll("fire_classic", itemName));
    attachable.format_version = equipmentFormatVersion;
    attachable["minecraft:attachable"].description.identifier = `${namespace}:${itemName}`;
    return attachable;
  }

  throw new Error(`Missing armor attachable template for ${piece}`);
}

function getAssetDescriptor(dragon, asset, piece) {
  const equipmentRoot = path.resolve(toolRoot, config.output.equipment_items);
  if (asset.kind === "armor") {
    const base = `${dragon.type}_scale`;
    return {
      itemName: `${base}_${piece}`,
      itemRoot: path.join(equipmentRoot, "armors", "player", `${dragon.type}_scale_equipment`),
      attachableRoot: path.join(resourceAttachableRoot, "player", `${dragon.type}_scale_equipment`)
    };
  }
  if (asset.kind === "tool" && ["axe", "hoe", "pickaxe", "shovel", "sword"].includes(asset.name)) {
    const itemName = `${dragon.type}_scale_${asset.name}`;
    const weaponFolder = asset.name === "sword" ? "dragonmounts2_weapon_equipment" : "tools";
    return {
      itemName,
      itemRoot: path.join(equipmentRoot, weaponFolder, `${asset.name}s`),
      attachableRoot: path.join(resourceAttachableRoot, "tools", `${asset.name}s`)
    };
  }
  const itemName = `${dragon.type}_${asset.name}`;
  return {
    itemName,
    itemRoot: path.join(path.resolve(toolRoot, config.output.custom_items), asset.name === "scales" ? "scales" : ""),
    attachableRoot: resourceAttachableRoot
  };
}

function getStarterItemTemplatePath(asset, piece) {
  const equipmentRoot = path.resolve(toolRoot, config.output.equipment_items);
  if (asset.kind === "armor") {
    return path.join(equipmentRoot, "armors", "player", "fire_dragon_scale_equipment", `fire_dragon_scale_${piece}.json`);
  }
  if (asset.kind === "tool" && ["axe", "hoe", "pickaxe", "shovel"].includes(asset.name)) {
    return path.join(equipmentRoot, "tools", `${asset.name}s`, `fire_dragon_scale_${asset.name}.json`);
  }
  if (asset.kind === "tool" && asset.name === "sword") {
    return path.join(equipmentRoot, "dragonmounts2_weapon_equipment", "swords", "fire_dragon_scale_sword.json");
  }
  if (asset.kind === "item" && asset.name === "scales") {
    return path.resolve(toolRoot, config.output.custom_items, "scales", "fire_dragon_scales.json");
  }
  return null;
}

function collectJsonFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectJsonFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(entryPath);
  }
  return files;
}

function normalizeEquipmentVersions(dryRun) {
  const equipmentRoots = [
    path.resolve(toolRoot, config.output.equipment_items || "../../items/dragonmounts2_equipment"),
    path.resolve(toolRoot, config.output.custom_items),
    path.resolve(toolRoot, config.output.resource_attachables),
    path.resolve(toolRoot, "../../../DM2RP/attachables/dragonmounts2_equipment")
  ];
  let changed = 0;
  for (const filePath of [...new Set(equipmentRoots.flatMap(collectJsonFiles))]) {
    const payload = readJson(filePath);
    if (!payload || typeof payload !== "object" || typeof payload.format_version !== "string") continue;
    if (payload.format_version === equipmentFormatVersion) continue;
    payload.format_version = equipmentFormatVersion;
    if (!dryRun) writeTextAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
    changed += 1;
    const action = dryRun ? "would upgrade" : "upgraded";
    recordSummaryAction(filePath, action);
    console.log(`${action} equipment format ${path.relative(process.cwd(), filePath)} -> ${equipmentFormatVersion}`);
  }
  if (changed === 0) console.log(`Equipment format versions already use ${equipmentFormatVersion}.`);
}

function makeLootTable(dragon, sheared) {
  const assets = dragon.custom_assets.filter((asset) => asset.loot !== false);
  const entries = assets.flatMap((asset) => {
    const pieces = asset.kind === "armor" ? ["helmet", "chestplate", "leggings", "boots"] : [undefined];
    return pieces.map((piece) => ({
      type: "item",
      weight: asset.loot_weight || 1,
      name: `${namespace}:${getAssetDescriptor(dragon, asset, piece).itemName}`,
      functions: [{
        function: "set_count",
        count: sheared ? { min: 1, max: 1 } : { min: asset.loot_min || 1, max: asset.loot_max || 3 }
      }]
    }));
  });
  if (!sheared) entries.push({ type: "item", weight: 1, name: `${namespace}:raw_dragon_meat` });
  return { pools: [{ rolls: 1, entries: entries.length ? entries : [{ type: "item", name: `${namespace}:raw_dragon_meat` }] }] };
}

function writeCustomAssets(dragon, dryRun) {
  for (const asset of dragon.custom_assets) {
    const pieces = asset.kind === "armor" ? ["helmet", "chestplate", "leggings", "boots"] : [undefined];
    for (const piece of pieces) {
      const descriptor = getAssetDescriptor(dragon, asset, piece);
      const itemName = descriptor.itemName;
      const itemPath = path.join(descriptor.itemRoot, `${itemName}.json`);
      writeJson(itemPath, makeCustomItem(dragon, asset, piece), dryRun);
      addResourceItemTexture(dragon, dryRun, itemName, asset);
      if (asset.kind === "armor" || asset.kind === "tool") {
        const attachable = makeResourceCustomAttachable(dragon, asset, piece, itemName);
        const attachablePath = path.join(descriptor.attachableRoot, `${itemName}.json`);
        if (attachable) {
          writeJson(attachablePath, attachable, dryRun);
        }
      }
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
      writeTextAtomic(languagePath, next);
    }
    const action = dryRun ? "would update" : "updated";
    recordSummaryAction(languagePath, action);
    console.log(`${action} ${path.relative(process.cwd(), languagePath)}`);
  }
}

function makeArmorTooltipValue(data) {
  const lines = [];
  const tiers = data.tiers || [{ set: "4-Piece Set:", description: data.description }];
  for (const tier of tiers) {
    lines.push(`§7${tier.set}§r`, `§f${tier.description}`);
  }
  if (data.cooldown !== undefined) lines.push(`§fCD:${data.cooldown}`);
  return `${lines.join("\\n")}\\n`;
}

function writeArmorTooltips(dryRun) {
  const pieces = ["helmet", "chestplate", "leggings", "boots"];
  const generatedMarker = "# ==== Generated Armor Tooltips ====";

  for (const languagePath of armorTooltipLanguageRoots) {
    const text = fs.existsSync(languagePath) ? fs.readFileSync(languagePath, "utf8") : "";
    const lines = text.split(/\r?\n/).filter((line) => {
      if (line.startsWith(generatedMarker)) return false;
      if (line.startsWith("tooltip.dragonmounts2:cooldown=") || line.startsWith("tooltip.dragonmounts2:seconds=")) return false;
      if (line.includes(".scale_set.lore.")) return false;
      return !new RegExp(`^tile\\.${namespace}:.*_dragon_scale_(helmet|chestplate|leggings|boots)\\.tooltip=`).test(line);
    });

    const entries = [generatedMarker];
    for (const [dragonType, data] of Object.entries(armorTooltipConfig)) {
      const baseName = dragonType.replace(/_dragon$/, "");
      const value = makeArmorTooltipValue(data);
      for (const piece of pieces) {
        entries.push(`tile.${namespace}:${baseName}_dragon_scale_${piece}.tooltip=${value}`);
      }
      entries.push("");
    }

    const next = `${lines.join("\n").replace(/\n+$/, "")}\n\n${entries.join("\n")}`;
    if (!dryRun) {
      fs.mkdirSync(path.dirname(languagePath), { recursive: true });
      writeTextAtomic(languagePath, next);
    }
    const action = dryRun ? "would update" : "updated";
    recordSummaryAction(languagePath, action);
    console.log(`${action} ${path.relative(process.cwd(), languagePath)}`);
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
    if (!dryRun) writeTextAtomic(filePath, `${formatJson(item)}\n`);
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
  if (!dryRun) writeTextAtomic(itemDataPath, next);
  const action = dryRun ? "would update" : "updated";
  recordSummaryAction(itemDataPath, action);
  console.log(`${action} ${path.relative(process.cwd(), itemDataPath)}`);
}

function getItemTexturePath(itemBase, asset) {
  if (itemBase.endsWith("_amulet")) {
    return `textures/items/dragonmounts2_equipment/tools/amulets/${itemBase.replace("_amulet", "_dragon_amulet")}`;
  }

  const toolMatch = itemBase.match(/^(.*)_(sword|pickaxe|axe|shovel|hoe)$/);
  if (asset?.kind === "tool" || toolMatch) {
    const [, prefix, tool] = toolMatch || itemBase.match(/^(.*)_(.+)$/);
    const textureName = prefix.endsWith("_scale") ? itemBase : `${prefix}_scale_${tool}`;
    return `textures/items/dragonmounts2_equipment/tools/${tool}s/${textureName}`;
  }

  const armorMatch = itemBase.match(/^(.*)_(?:armor|scale)_(helmet|chestplate|leggings|boots)$/);
  if (asset?.kind === "armor" || armorMatch) {
    const [, prefix, piece] = armorMatch || itemBase.match(/^(.*)_(.+)$/);
    const textureName = prefix.endsWith("_scale") ? itemBase : `${prefix}_scale_${piece}`;
    return `textures/items/dragonmounts2_equipment/armors/player/${prefix}_scale_equipment/${textureName}`;
  }

  return `textures/items/dragonmounts2_items/scales/${itemBase}`;
}

function addResourceItemTexture(dragon, dryRun, itemBase = `${dragon.type.replace("_dragon", "")}_amulet`, asset) {
  const key = `${namespace}:${itemBase}`;
  const json = readJson(itemTexturePath);
  if (!json.texture_data || typeof json.texture_data !== "object") {
    throw new Error(`${path.relative(process.cwd(), itemTexturePath)} is missing a texture_data object`);
  }
  const texturePath = getItemTexturePath(itemBase, asset);

  if (json.texture_data[key]?.textures === texturePath) {
    console.log(`already exists ${key} in ${path.relative(process.cwd(), itemTexturePath)}`);
    return;
  }

  json.texture_data[key] = { textures: texturePath };
  const next = `${JSON.stringify(json, null, 2)}\n`;
  if (!dryRun) writeTextAtomic(itemTexturePath, next);
  const action = dryRun ? "would update" : "updated";
  recordSummaryAction(itemTexturePath, action);
  console.log(`${action} ${path.relative(process.cwd(), itemTexturePath)}`);
}

function repairGeneratedItemTextures(dryRun) {
  const json = readJson(itemTexturePath);
  let changed = false;
  for (const [key, entry] of Object.entries(json.texture_data || {})) {
    if (!key.startsWith(`${namespace}:`) || !entry?.textures?.includes("dragonmounts2_items/")) continue;
    const itemBase = key.slice(namespace.length + 1);
    const texturePath = getItemTexturePath(itemBase);
    if (entry.textures !== texturePath) {
      entry.textures = texturePath;
      changed = true;
    }
  }
  if (!changed) return;
  if (!dryRun) writeTextAtomic(itemTexturePath, `${JSON.stringify(json, null, 2)}\n`);
  const action = dryRun ? "would repair" : "repaired";
  recordSummaryAction(itemTexturePath, action);
  console.log(`${action} ${path.relative(process.cwd(), itemTexturePath)}`);
}

function validateGeneratedPayload(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} did not produce a valid object`);
  }
  const root = payload["minecraft:entity"] || payload["minecraft:client_entity"] || payload["minecraft:item"] || payload["minecraft:attachable"];
  if (!root) {
    throw new Error(`${label} is missing a minecraft root object`);
  }
  if (!root.description || !root.description.identifier) {
    throw new Error(`${label} is missing description.identifier`);
  }
}

function validateGenerationInputs() {
  const required = [
    dragonTemplatePath,
    eggTemplatePath,
    path.resolve(toolRoot, config.templates.amulet),
    path.resolve(toolRoot, config.templates.resource_dragon),
    path.resolve(toolRoot, config.templates.render_controllers),
    path.resolve(toolRoot, config.templates.resource_amulet),
    itemTexturePath,
    itemDataPath
  ];
  for (const filePath of required) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing required file for generation: ${filePath}`);
    }
  }
  const outputRoots = [
    entityRoot,
    resourceEntityRoot,
    renderControllerRoot,
    resourceAmuletRoot,
    resourceAttachableRoot,
    path.resolve(toolRoot, config.output.equipment_items),
    path.resolve(toolRoot, config.output.custom_items)
  ];
  for (const directory of outputRoots) {
    if (!fs.existsSync(directory)) {
      throw new Error(`Missing configured output folder: ${directory}`);
    }
  }
}

function getDragonAuditIssues(dragon) {
  const issues = [];
  const resourcePath = path.join(resourceEntityRoot, dragon.type, `${dragon.type}.entity.json`);
  const renderPath = path.join(renderControllerRoot, `${dragon.type}.render_controllers.json`);

  if (fs.existsSync(resourcePath)) {
    const resource = readJson(resourcePath);
    const controllers = resource["minecraft:client_entity"]?.description?.render_controllers || [];
    const staleControllerRefs = controllers.filter((controller) => {
      if (typeof controller === "string") return controller.includes("fire_dragon");
      const name = Object.keys(controller)[0];
      return name.includes("fire_dragon");
    });
    if (dragon.type !== templateDragonType && staleControllerRefs.length > 0) {
      issues.push("resource entity still references fire_dragon render-controllers");
    }
  } else {
    issues.push("missing resource entity file");
  }

  if (fs.existsSync(renderPath)) {
    const render = readJson(renderPath);
    const keys = Object.keys(render.render_controllers || {});
    const staleKeys = keys.filter((key) => key.includes("fire_dragon"));
    if (dragon.type !== templateDragonType && staleKeys.length > 0) {
      issues.push("render-controller file still contains fire_dragon template names");
    }

    const expectedBase = dragon.variants.map((variant) => `Texture.${variant}`);
    const expectedGlow = dragon.variants.map((variant) => `Texture.${variant}_glow`);
    const baseController = render.render_controllers?.[`controller.render.dragonmounts2.${dragon.type}.base`];
    const glowController = render.render_controllers?.[`controller.render.dragonmounts2.${dragon.type}.glow`];
    const baseTextures = baseController?.arrays?.textures?.["Array.base"] || [];
    const glowTextures = glowController?.arrays?.textures?.["Array.base"] || [];

    if (baseTextures.length !== expectedBase.length || expectedBase.some((name) => !baseTextures.includes(name))) {
      issues.push(`base texture array mismatch for ${dragon.type} (${baseTextures.join(", ") || "empty"})`);
    }
    if (glowTextures.length !== expectedGlow.length || expectedGlow.some((name) => !glowTextures.includes(name))) {
      issues.push(`glow texture array mismatch for ${dragon.type} (${glowTextures.join(", ") || "empty"})`);
    }
  } else {
    issues.push("missing render-controller file");
  }

  const dragonEntityPath = path.join(entityRoot, dragon.type, `${dragon.type}.json`);
  if (!fs.existsSync(dragonEntityPath)) issues.push("missing BP dragon entity file");
  const eggEntityPath = path.join(entityRoot, dragon.type, `${dragon.type}_egg.json`);
  if (!fs.existsSync(eggEntityPath)) issues.push("missing BP egg entity file");

  return issues;
}

function runAudit(selected, dryRun) {
  const findings = [];
  for (const dragon of selected) {
    const issues = getDragonAuditIssues(dragon);
    if (issues.length === 0) {
      findings.push({ dragon: dragon.type, ok: true, issues: [] });
      continue;
    }
    findings.push({ dragon: dragon.type, ok: false, issues });
  }

  const okCount = findings.filter((entry) => entry.ok).length;
  const errorCount = findings.filter((entry) => !entry.ok).length;

  generationSummary.issues = findings.flatMap((entry) => (entry.ok ? [] : entry.issues.map((issue) => `${entry.dragon}: ${issue}`)));

  if (errorCount === 0) {
    console.log(color(`Audit passed: ${okCount} dragon(s) checked with no issues.`, "green"));
    return;
  }

  console.log(color(`Audit found ${errorCount} dragon(s) with issues.`, "yellow"));
  for (const entry of findings) {
    if (entry.ok) continue;
    console.log(`  - ${entry.dragon}:`);
    for (const issue of entry.issues) console.log(`      • ${issue}`);
  }

  if (dryRun) {
    console.log(color("Dry run: no files were changed. Use --repair to fix the issues automatically.", "cyan"));
  }
}

function writeOutput(dragon, kind, value, dryRun) {
  const filePath = path.join(entityRoot, dragon.type, `${dragon.type}${kind === "egg" ? "_egg" : ""}.json`);
  writeJson(filePath, value, dryRun);
}

async function main() {
  const options = parseArgs();
  runtimeOptions = options;
  generationSummary = { dragons: [], files: { generated: 0, updated: 0, wouldGenerate: 0, wouldUpdate: 0 }, issues: [] };
  if (options.diff) options.dryRun = true;
  if (options.help) {
    printHelp();
    return;
  }
  if (options.list) {
    listAvailableDragons();
    return;
  }
  if (options.tooltips) {
    writeArmorTooltips(options.dryRun);
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
  } else if (options.menu) {
    selected = await promptInteractive();
  } else {
    selected = await promptInteractive();
  }

  if (selected.length === 0) {
    console.log("No dragons selected.");
    return;
  }

  generationSummary.dragons = selected.map((dragon) => dragon.type);
  validateGenerationInputs();
  normalizeEquipmentVersions(options.dryRun);
  selected = applyAssetOption(selected, options.assets);
  repairGeneratedItemTextures(options.dryRun);

  if (options.audit) {
    runAudit(selected, options.dryRun);
    if (!options.repair) return;
  }

  for (const dragon of selected) {
    const dragonEntity = makeDragon(dragon);
    const eggEntity = makeEgg(dragon);
    validateGeneratedPayload(dragonEntity, `${dragon.type} dragon entity`);
    validateGeneratedPayload(eggEntity, `${dragon.type} egg entity`);
    writeOutput(dragon, "dragon", dragonEntity, options.dryRun);
    writeOutput(dragon, "egg", eggEntity, options.dryRun);
    writeJson(path.join(amuletRoot, `${dragon.type.replace("_dragon", "")}_amulet.json`), makeAmulet(dragon), options.dryRun);
    writeJson(path.join(resourceEntityRoot, dragon.type, `${dragon.type}.entity.json`), makeResourceDragon(dragon), options.dryRun);
    writeJson(path.join(renderControllerRoot, `${dragon.type}.render_controllers.json`), makeRenderControllers(dragon), options.dryRun);
    writeJson(path.join(resourceAmuletRoot, `${dragon.type}_amulet.json`), makeResourceAmulet(dragon), options.dryRun);
    writeCustomAssets(dragon, options.dryRun);
    writeDragonLoot(dragon, options.dryRun);
    addScriptData(dragon, options.dryRun);
    addResourceItemTexture(dragon, options.dryRun);
    addFluteDragonType(dragon, options.dryRun);
    if (options.verbose) {
      console.log(color(`Checked ${dragon.type}: resource entity + render controller + textures reconciled.`, "cyan"));
    }
  }
  printSummaryReport(selected);
  console.log("Done");
}

main().catch((error) => {
  console.error(color(`Error: ${error.message}`, "red"));
  process.exitCode = 1;
});
