import { world, system } from "@minecraft/server";

const breath = {
  "aether_dragon": "bj:air1breath",
  "storm_dragon": "bj:airbreath",
  "f_aether_dragon": "bj:air1breath",
  "f_storm_dragon": "bj:airbreath"
};

world.afterEvents.itemUse.subscribe(e => {
  const p = e.source;
  if (e.itemStack.typeId !== "bj:dg_whistle") return;

  const r = p.getComponent("minecraft:riding")?.entityRidingOn;
  if (!r) return;

  const t = breath[r.typeId.split(":")[1]];
  if (!t) return;

  const d = p.getViewDirection();
  const l = { x: p.location.x + d.x, y: p.location.y + 1.5 + d.y, z: p.location.z + d.z };
for (let i = 0; i < 1; i++) {
  const angleOffset = (i - 0.3) * 0.0; // Góc lệch để giãn đạn
  const dx = d.x * Math.cos(angleOffset) - d.z * Math.sin(angleOffset);
  const dz = d.x * Math.sin(angleOffset) + d.z * Math.cos(angleOffset);

const distance = 3.1; // khoảng cách 3 block trước mặt
const spawnPos = {
  x: p.location.x + d.x * distance,
  y: p.location.y + 0 + d.y * distance,
  z: p.location.z + d.z * distance
};

  const b = p.dimension.spawnEntity(t, spawnPos);
  if (!b) continue;

  system.runTimeout(() => {
    b.applyImpulse({ x: dx * 7.0, y: d.y * 7.0, z: dz * 7.0 });
  }, 0.1);
}

  p.playSound("dm2.dragon.airbreath", { location: p.location, volume: 0.8 });
  r.playAnimation("animation.dragon.shoot");
});