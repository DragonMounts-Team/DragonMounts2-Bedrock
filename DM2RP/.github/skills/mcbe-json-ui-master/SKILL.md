---
name: mcbe-json-ui-master
description: "Use for Minecraft Bedrock custom GUI, JSON UI, server forms, HUDs, chest menus, textures, attachables, GeoUI, and resource-pack UI work. Loads the relevant specialist guidance from the mcbejsonuimasterAI GitHub repository."
argument-hint: "Describe the GUI, target pack(s), and desired behavior"
---

# MCBE JSON UI Master

Use the upstream skill collection as on-demand guidance for this workspace's Bedrock resource packs. The source of truth is the current `main` branch of [mcbejsonuimasterAI](https://github.com/boredape874/mcbejsonuimasterAI), especially its [`skills/` directory](https://github.com/boredape874/mcbejsonuimasterAI/tree/main/skills).

## Workflow

1. Inspect the relevant local files in `DM2RP` and, when the feature crosses pack boundaries, `DM2BP`. Establish the existing UI format, namespaces, assets, and game/version constraints before proposing edits.
2. For a broad or mixed request, load the upstream [`mcbe-json-ui-master/SKILL.md`](https://raw.githubusercontent.com/boredape874/mcbejsonuimasterAI/main/skills/mcbe-json-ui-master/SKILL.md) and follow its routing table. For a focused request, load the matching specialist skill directly instead of the master router.
3. Fetch the selected skill's `SKILL.md` from `https://raw.githubusercontent.com/boredape874/mcbejsonuimasterAI/main/skills/<skill-name>/SKILL.md`. Follow its links only as needed; resolve skill-local references under that skill's directory and repository-level `docs/`, `data/`, or `tools/` paths from the repository root. Do not load the whole collection at once.
4. Apply the guidance to the existing pack structure and make the smallest coherent changes. Verify exact UI properties, bindings, texture paths, and version support from available project or upstream evidence; mark unknowns rather than guessing.
5. Separate static inspection or preview results from Minecraft runtime proof. Do not claim a GUI works in-game without relevant client testing and, where applicable, Content Log evidence.

## Boundaries

- Treat the upstream repository as guidance and tooling, not as permission to overwrite this project or install dependencies. Do not clone it, run its setup scripts, or install packages unless the user asks for that toolchain.
- Preserve existing DragonMounts2 conventions and coordinate UI changes across the behavior and resource packs when the feature requires it.
- Route custom UI design to the relevant upstream design, server-form, HUD, texture, or layout specialist; use the resource-pack and addon integration specialists when assets or behavior cross pack boundaries.