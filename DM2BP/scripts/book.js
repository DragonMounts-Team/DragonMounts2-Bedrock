import { Player, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// -------------------- CONSTANTS --------------------
const GUIDEBOOK_ITEM = "dragonmounts2:guide_book";

// -------------------- DRAGONS LIST --------------------
const DRAGONS = [
    { name: "dracopedia.dragon.aether", tag: "aether", egg: "dragonmounts2:aether_dragon_egg" },
    { name: "dracopedia.dragon.dark", tag: "dark", egg: "dragonmounts2:dark_dragon_egg" },
    { name: "dracopedia.dragon.ender", tag: "ender", egg: "minecraft:dragon_egg" },
    { name: "dracopedia.dragon.enchant", tag: "enchant", egg: "dragonmounts2:enchant_dragon_egg" },
    { name: "dracopedia.dragon.fire", tag: "fire", egg: "dragonmounts2:fire_dragon_egg" },
    { name: "dracopedia.dragon.forest", tag: "forest", egg: "dragonmounts2:forest_dragon_egg" },
    { name: "dracopedia.dragon.ice", tag: "ice", egg: "dragonmounts2:ice_dragon_egg" },
    { name: "dracopedia.dragon.nether", tag: "nether", egg: "dragonmounts2:nether_dragon_egg" },
    { name: "dracopedia.dragon.sculk", tag: "sculk", egg: "dragonmounts2:sculk_dragon_egg" },
    { name: "dracopedia.dragon.skeleton", tag: "skeleton", egg: "dragonmounts2:skeleton_dragon_egg" },
    { name: "dracopedia.dragon.storm", tag: "storm", egg: "dragonmounts2:storm_dragon_egg" },
    { name: "dracopedia.dragon.sunlight", tag: "sunlight", egg: "dragonmounts2:sunlight_dragon_egg" },
    { name: "dracopedia.dragon.terra", tag: "terra", egg: "dragonmounts2:terra_dragon_egg" },
    { name: "dracopedia.dragon.water", tag: "water", egg: "dragonmounts2:water_dragon_egg" },
    { name: "dracopedia.dragon.wither", tag: "wither", egg: "dragonmounts2:wither_dragon_egg" },
    { name: "dracopedia.dragon.zombie", tag: "zombie", egg: "dragonmounts2:zombie_dragon_egg" }
];

// -------------------- ENTRIES --------------------
export const entries = {
    // MAIN MENU
    start: {
        category: null,
        linksTo: ["how_to_play", "credits", "dragons"]
    },

    // HOW TO PLAY → SUBPAGES
    how_to_play: {
        category: "start",
        linksTo: ["dragon_raising", "egg_conversion", "how_to_use_items"]
    },

    // SUBPAGES (under How to Play)
    dragon_raising: { category: "how_to_play", linksTo: [] },
    egg_conversion: { category: "how_to_play", linksTo: [] },
    how_to_use_items: { category: "how_to_play", linksTo: [] },

    credits: { category: "start", linksTo: [] },

    dragons: { category: "start", linksTo: DRAGONS.map(d => d.tag) },

    // dragon detail pages
    aether: { category: "dragons", linksTo: [] },
    dark: { category: "dragons", linksTo: [] },
    ender: { category: "dragons", linksTo: [] },
    enchant: { category: "dragons", linksTo: [] },
    fire: { category: "dragons", linksTo: [] },
    forest: { category: "dragons", linksTo: [] },
    ice: { category: "dragons", linksTo: [] },
    nether: { category: "dragons", linksTo: [] },
    sculk: { category: "dragons", linksTo: [] },
    skeleton: { category: "dragons", linksTo: [] },
    storm: { category: "dragons", linksTo: [] },
    sunlight: { category: "dragons", linksTo: [] },
    terra: { category: "dragons", linksTo: [] },
    water: { category: "dragons", linksTo: [] },
    wither: { category: "dragons", linksTo: [] },
    zombie: { category: "dragons", linksTo: [] }
};

// -------------------- OPEN GUIDEBOOK --------------------
export function openGuidebook(player) {
    openPage(player, "start");
}

// -------------------- PAGE HANDLER --------------------
function openPage(player, key) {
    const entry = entries[key];

    const form = new ActionFormData()
        .title(`dracopedia.title.${key}`)
        .body(`dracopedia.body.${key}`);

    entry.linksTo.forEach(link => {
        let icon;

        switch (link) {
            case "how_to_play":      icon = "textures/ui/guide_book.png"; break;
            case "credits":          icon = "textures/ui/credits.png"; break;
            case "dragons":          icon = "textures/ui/dragon.png"; break;
            case "dragon_raising":   icon = "textures/ui/heart.png"; break;
            case "egg_conversion":   icon = "textures/ui/dragon_egg.png"; break;
            case "how_to_use_items": icon = "textures/ui/hammer.png"; break;
            default:
                const dragon = DRAGONS.find(d => d.tag === link);
                icon = dragon ? `textures/ui/${dragon.tag}_egg.png` : undefined;
        }

        form.button(`dracopedia.button.${link}`, icon);
    });

    // back button
    if (entry.category) {
        form.button("dracopedia.button.back", "textures/ui/back.png");
    }

    form.show(player).then(res => {
        if (res.canceled) return;

        const i = res.selection;
        const count = entry.linksTo.length;

        if (i >= 0 && i < count) {
            openPage(player, entry.linksTo[i]);
        } else if (entry.category && i === count) {
            openPage(player, entry.category);
        }
    });
}

// -------------------- ITEM USE --------------------
world.afterEvents.itemUse.subscribe(({ itemStack, source }) => {
    if (!(source instanceof Player)) return;
    if (itemStack?.typeId === GUIDEBOOK_ITEM) openGuidebook(source);
});

// -------------------- GIVE BOOK ON FIRST JOIN --------------------
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (!initialSpawn) return;
    if (!player.hasTag("dragon_guidebook_received")) {
        player.addTag("dragon_guidebook_received");
        player.runCommandAsync(`give @s ${GUIDEBOOK_ITEM} 1`);
    }
});