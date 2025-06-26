import { world, system } from "@minecraft/server";

const breath = {
  "aether_dragon": "bj:air1breath1",
  "nether_dragon": "bj:netherbreath1",
  "ice_dragon": "bj:icebreath1",
  "moonlight_dragon": "bj:icebreath1",
  "water_dragon": "bj:waterbreath1",
  "sunlight_dragon": "bj:firebreath1",
  "storm_dragon": "bj:airbreath1",
  "forest_dragon": "bj:poisonbreath1",
  "zombie_dragon": "bj:poisonbreath1",
  "wither_dragon": "bj:witherbreath1",
  "enchant_dragon": "bj:firebreath1",
  "phantom_dragon": "bj:airbreath1",
  "fire_dragon": "bj:firebreath1",
  "ender_dragon": "bj:enderbreath1",
  "terra_dragon": "bj:firebreath1",
  "dark_dragon": "bj:firebreath1",
  "f_aether_dragon": "bj:air1breath1",
  "f_nether_dragon": "bj:netherbreath1",
  "f_water_dragon": "bj:waterbreath1",
  "f_moonlight_dragon": "bj:icebreath1",
  "f_dark_dragon": "bj:firebreath1",
  "f_ice_dragon": "bj:icebreath1",
  "f_forest_dragon": "bj:poisonbreath1",
  "f_sunlight_dragon": "bj:firebreath1",
  "f_fire_dragon": "bj:firebreath1",
  "f_terra_dragon": "bj:firebreath1",
  "f_storm_dragon": "bj:airbreath1",
  "f_enchant_dragon": "bj:firebreath1",
  "m_ender_dragon": "bj:enderbreath1",
  "r_fire_dragon": "bj:firebreath1",
  "f_phantom_dragon": "bj:airbreath1"
};

world.afterEvents.itemUse.subscribe(e => {
  const p = e.source;
  if (e.itemStack.typeId !== "bj:dg_wand") return;

  const r = p.getComponent("minecraft:riding")?.entityRidingOn;
  if (!r) return;

  const t = breath[r.typeId.split(":")[1]];
  if (!t) return;

  const d = p.getViewDirection();
  const l = { x: p.location.x + d.x, y: p.location.y + 1.5 + d.y, z: p.location.z + d.z };
for (let i = 0; i < 2; i++) {
  const angleOffset = (i - 0.3) * 0.0; // Góc lệch để giãn đạn
  const dx = d.x * Math.cos(angleOffset) - d.z * Math.sin(angleOffset);
  const dz = d.x * Math.sin(angleOffset) + d.z * Math.cos(angleOffset);

const distance = 4.1; // khoảng cách 3 block trước mặt
const spawnPos = {
  x: p.location.x + d.x * distance,
  y: p.location.y + 0 + d.y * distance,
  z: p.location.z + d.z * distance
};

  const b = p.dimension.spawnEntity(t, spawnPos);
  if (!b) continue;

  system.runTimeout(() => {
    b.applyImpulse({ x: dx * 4.0, y: d.y * 4.0, z: dz * 4.0 });
  }, 0.1);
}

  p.playSound("bj.dragon.firebreath", { location: p.location, volume: 1 });
  r.playAnimation("animation.dragon.shoot");
});