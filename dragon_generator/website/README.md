# Dragon Mount's Generator Helper

Dragon Mount's Generator is a browser configuration studio for Dragon Mounts 2. It previews dragon equipment, saves the current draft in the browser, and exports a generator-ready configuration.

## Choose A Mode

### Open On GitHub

Use the hosted [Dragon Mount's Generator](https://dragonmounts-team.github.io/DragonMounts2-Bedrock/dragon_generator/website/) to open the editor directly in your browser. GitHub Pages can download configuration files and commands, but it cannot write files into this repository.

### GitHub Pages

The visual editor works on a static GitHub Pages site. It supports:

- Dragon, model, variant, breath, asset, and theme controls.
- Automatic tool texture previews and custom preview images.
- Browser-local draft saving.
- JSON and command downloads.

GitHub Pages cannot run Node.js or PowerShell. In this mode, **Generate files** downloads the JSON draft and a command text file. Run that command locally inside the `dragon_generator` folder to create the complete generated files.

### Local Browser Bridge

For one-click real generation, open a terminal in the `dragon_generator` folder and run:

```powershell
node website/server.js
```

Open the local page using the address printed by the server. Keep that terminal running while using **Generate files**.

### Direct Terminal

The generator can always be used without the website:

```powershell
cd path\to\DragonMounts2-uncompressed\dragon_generator
node generate.js --type storm_dragon --assets all --dry-run
node generate.js --type storm_dragon --assets all
```

The first command previews changes. The second writes the files.

## Website Helper

1. Pick a dragon type.
2. Adjust the model, variants, breath entity, and starter assets.
3. Use **Preview dry run** before changing files.
4. Use **Generate files** when the local bridge is running.
5. If using GitHub Pages, use the downloaded command file in a terminal instead.
6. Use **Download config** to save the current JSON draft.
7. Use **Download command** to save PowerShell, Node.js, and dry-run commands.

The draft is saved automatically in browser `localStorage`. It includes the selected dragon, model, variants, default variant, breath entity, asset selections, theme, and uploaded preview images up to 2 MB. **Reset draft** returns the visible form to the default Storm Dragon setup.

## Verify A Generation

To test that generation recreates missing files:

```powershell
Remove-Item .\DM2BP\entities\storm_dragon\storm_dragon.json
node generate.js --type storm_dragon --assets all
Test-Path .\DM2BP\entities\storm_dragon\storm_dragon.json
```

The final command should return `True`. Only remove generated output files. Do not remove templates, `generate.js`, `generate.ps1`, or `dragon-types.json`.

## Troubleshooting

**The Generate button downloads JSON instead of creating files**

The page cannot reach the local bridge. Start `node website/server.js` from `dragon_generator`, then reopen the local page. On GitHub Pages, downloading JSON and the command file is expected behavior.

**The preview image is broken**

Use the local bridge or publish the repository path that contains both `dragon_generator/website` and `DM2RP`. Refresh after publishing. Custom preview images must be PNG, JPG, or WebP and no larger than 2 MB.

**The draft did not return**

The draft is browser-specific. It will not move between browsers or computers. Use **Download config** to create a portable copy.

**A real generation reports an error**

Run the matching command with `--dry-run` in a terminal. The generator output will identify the missing template, invalid dragon type, or malformed configuration.

## Project Files

- `index.html` contains the editor layout.
- `app.js` contains browser state, persistence, preview logic, and downloads.
- `styles.css` and `theme.css` contain the visual system.
- `server.js` serves the website, textures, and local generator API.
- `../generate.js` is the source of truth for file generation.
