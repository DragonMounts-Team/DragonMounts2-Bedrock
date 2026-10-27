import { system } from "@minecraft/server";

const intervalTasks = [];
let initialized = false;

function startTask({ name, interval, handler }) {
  const runTask = () => {
    try {
      handler();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] Scheduled task ${name} failed: ${message}`);
    }
  };

  system.run(runTask);
  system.runInterval(runTask, interval);
}

export function registerIntervalTask(name, interval, handler) {
  const task = { name, interval, handler };
  intervalTasks.push(task);
  // Registered after startup? Start it now instead of silently never running.
  if (initialized) startTask(task);
}

export function initializeScheduler() {
  if (initialized) return;
  initialized = true;
  for (const task of intervalTasks) startTask(task);
}
