const reportedParticleErrors = new Set();

export function spawnParticle(dimension, particleId, location, variables) {
  try {
    if (variables) {
      dimension.spawnParticle(particleId, location, variables);
    } else {
      dimension.spawnParticle(particleId, location);
    }
    return true;
  } catch (error) {
    if (!reportedParticleErrors.has(particleId)) {
      reportedParticleErrors.add(particleId);
      console.warn(
        `[DragonMounts2] Particle ${particleId} failed: ${error?.message ?? error}`,
      );
    }
    return false;
  }
}
