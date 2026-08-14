import { system, world, BlockPermutation, GameMode, Player, BlockRecordPlayerComponent, EquipmentSlot } from "@minecraft/server";
import * as itemArrays from "../arrays/item_arrays.js";

const activeDiscs = new Map();
function locationKey(loc) {
    return `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
}
function stopSoundForNearby(dim, center, sound) {
    try {
        for (const player of dim.getPlayers({ location: center, maxDistance: 64 })) {
            player.runCommand(`stopsound @s ${sound}`);
        }
    } catch (e) {}
}
function stopDiscAtLocation(key) {
    if (!activeDiscs.has(key)) return;
    const { timeoutId, sound, center, dim } = activeDiscs.get(key);
    system.clearRun(timeoutId);
    activeDiscs.delete(key);
    stopSoundForNearby(dim, center, sound);
}
function stopDiscDeferred(key) {
    if (!activeDiscs.has(key)) return;
    const { timeoutId, sound, center, dim } = activeDiscs.get(key);
    system.clearRun(timeoutId);
    activeDiscs.delete(key);
    system.run(() => stopSoundForNearby(dim, center, sound));
}
world.beforeEvents.playerInteractWithBlock.subscribe((data) => {
    const { block } = data;
    
    if (block.typeId !== "minecraft:jukebox") return;
    const key = locationKey(block.location);
    if (!activeDiscs.has(key)) return;
    stopDiscDeferred(key);
});
world.afterEvents.playerInteractWithBlock.subscribe(({ block }) => {
    if (block.typeId !== "minecraft:jukebox") return;
    const key = locationKey(block.location);
    if (activeDiscs.has(key)) return;
    const center = block.center();
    const dimension = block.dimension;
    system.runTimeout(() => {
        const record = block.getComponent(BlockRecordPlayerComponent.componentId);
        if (!record?.isPlaying()) return;
        const recordType = record.getRecord();
        if (!recordType) return;
        const disc = itemArrays.musicDiscTypePlaying[recordType.typeId];
        if (!disc) return;
        if (activeDiscs.has(key)) return;
        const timeoutId = system.runTimeout(() => {
            stopDiscAtLocation(key);
        }, disc.duration * 20);
        activeDiscs.set(key, { timeoutId, sound: disc.sound, center, dim: dimension });
    }, 1);
});
world.beforeEvents.playerBreakBlock.subscribe(({ block }) => {
    if (block.typeId !== "minecraft:jukebox") return;
    stopDiscDeferred(locationKey(block.location));
});