import { system } from "@minecraft/server";

const intervalTasks = [];
let initialized = false;

export function registerIntervalTask(name, interval, handler) {
  intervalTasks.push({ name, interval, handler });
}

export function initializeScheduler() {
  if (initialized) return;
  initialized = true;

  for (const { name, interval, handler } of intervalTasks) {
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
}
