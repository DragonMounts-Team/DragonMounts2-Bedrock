# Dragon Entity Generator

This folder generates an integrated dragon setup from configurable templates. It creates the behavior-pack dragon and egg, a dragon amulet, script data registrations, flute registrations, optional custom items or armor, loot tables, language entries, and resource-pack dragon, amulet, item attachable, armor attachable, and item-texture entries. It uses only Node.js built-ins, so no package installation is needed.

## Configure a dragon

Edit `dragon-types.json` and add an entry like this:

```json
{
  "type": "storm_dragon",
  "variants": ["lightning", "thunder", "bronzed"],
  "default_variant": "lightning",
  "breath_entity": "dragonmounts2:fire_dragonbreath",
  "custom_assets": [
    { "name": "scales", "kind": "item", "loot_min": 1, "loot_max": 3 },
    {
      "name": "armor",
      "kind": "armor",
      "components": {
        "minecraft:fire_resistant": { "value": true }
      }
    }
  ],
  "custom_components": {},
  "custom_component_groups": {}
}
```

Configuration may also use `"custom_assets": "all"` to select the complete starter set without listing each asset.

`type` is the entity folder and identifier suffix. `variants` are the values used by `dragonmounts2:variant_type`. The generator creates one `minecraft:become_<variant>` event for every value and cycles random variant triggers through those events.

By default, new dragons use the fire entity and fire egg as templates. The generated dragon has one breath spawn entry, using `fire_dragonbreath` unless `breath_entity` is specified.

`custom_assets` uses the dragon name as a prefix. An asset named `scales` for `storm_dragon` creates `dragonmounts2:storm_dragon_scales`, its BP item, RP attachable, language entries, item texture key, and loot-table entry. An asset with `kind: "armor"` creates helmet, chestplate, leggings, and boots items with `minecraft:wearable` slots plus matching RP armor attachables cloned from the configured templates. `components` lets you add custom item abilities or other item components. `custom_components` and `custom_component_groups` are copied into the generated dragon entity for custom dragon abilities. Tool attachables use `geometry.spear` by default; set `geometry`, `render_controller`, or `attachable_template` on an asset when it needs a custom model.

## Commands

From this folder:

```powershell
# Interactive menu with structured options
./generate.ps1

# Preview one configured dragon without writing files
./generate.ps1 -Type storm_dragon -DryRun

# Generate one dragon and its egg
./generate.ps1 -Type storm_dragon

# Generate every dragon in dragon-types.json
./generate.ps1 -All

# Generate one dragon with every starter asset
./generate.ps1 -Type storm_dragon -Assets all -DryRun
```

The interactive menu also has a direct `Generate all dragons with all equipment` option. From Command Prompt, these equivalent forms are supported:

```bat
generate.cmd --type storm_dragon --assets all --dry-run
generate.cmd -t storm_dragon -e all -d
generate.cmd --type=storm_dragon --equipment=all --dry-run
```

The prompts show the required format: use lowercase `snake_case`, such as `fire_dragon`, `blue_fire`, or `variant_two`. For direct generation, use `--assets all` or `--equipment all`; this works with `--type` and `--dry-run`.

When generating one dragon interactively, the equipment menu shows `1) all`, `2) custom`, and `3) none`. Choose `1` or type `all`, then enter a material name such as `feather` to create `<dragon_name>_feather` instead of `<dragon_name>_scales`. Choose `2` or type `custom` to add suffixes after `<dragon_name>_`, such as `feather` or `staff`, one at a time. The review menu supports Generate, Edit, Undo draft, and Cancel; undo happens before any files are written. Every generated dragon is also added to all existing dragon flute definitions. Existing loot tables are left untouched when a dragon has no `custom_assets` entry.

The create-new wizard refuses names that already exist, including `fire_dragon`, configured dragons, and dragons generated in an earlier run. It returns to the main menu with an explanation. To intentionally regenerate an existing dragon, use `--type <dragon_name>`.

The interactive Command Prompt wizard asks for these values in order:

1. Dragon type and variants.
2. Breath entity ID and tooltip color.
3. Custom assets. Type `all` for the starter set, or add assets one at a time.
4. Loot inclusion and min/max counts for individually added assets.
5. Optional item component JSON for individually added assets.
6. Optional advanced dragon component and component-group JSON for custom abilities.
7. A review screen and confirmation before generation.

For the simple path, press Enter for the default breath, choose `1) all` or `3) none` for equipment, choose `n` for advanced abilities, and press Enter to confirm the review.

For configuration-driven generation, set `"material_name": "feather"` with `"custom_assets": "all"` to generate the custom material as `<dragon_name>_feather`.

For example, a component-group entry can be pasted as one line:

```json
{"dragonmounts2:custom_power":{"minecraft:damage_sensor":{"triggers":{"cause":"all","deals_damage":false}}}}
```

Use `--dry-run` while testing. It prints every behavior-pack and resource-pack file that would be generated without changing either pack.

Command Prompt also works:

```bat
generate.cmd --type storm_dragon
generate.cmd --all --dry-run
```

Direct Node usage:

```powershell
node generate.js --type storm_dragon
node generate.js --all
```

The generator writes files under the configured `output.entities` folder. Keep `--dry-run` enabled while editing the configuration so you can inspect the target paths first.

For a new dragon, add its `type` and `variants` to `dragon-types.json`, then run the interactive command or `--type`. The generator creates the matching amulet and updates `scripts/data/item_data.js` plus the RP item texture atlas automatically.
