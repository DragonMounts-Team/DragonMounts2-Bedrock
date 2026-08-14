import { world, system, Dimension } from "@minecraft/server";

/**
 * Utility functions for world-related operations
 * Following 2.8.0 Script API patterns with proper component imports
 */

/**
 * Get all loaded dimensions from the world
 * @returns {Dimension[]} Array of loaded dimensions
 */
export function getAllDimensions() {
	return world.getDimensions();
}

/**
 * Get a specific dimension by ID
 * @param {string} dimensionId - The dimension ID (e.g., 'minecraft:overworld')
 * @returns {Dimension|null} The dimension or null if not loaded
 */
export function getDimensionById(dimensionId) {
	try {
		return world.getDimension(dimensionId);
	} catch {
		return null;
	}
}