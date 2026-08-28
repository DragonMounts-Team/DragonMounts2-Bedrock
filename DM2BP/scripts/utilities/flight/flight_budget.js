import { system } from "@minecraft/server";

const MAX_FLIGHT_QUERIES_PER_TICK = 4000;
let budgetTick = -1;
let remainingQueries = MAX_FLIGHT_QUERIES_PER_TICK;

export function consumeFlightQuery() {
  if (budgetTick !== system.currentTick) {
    budgetTick = system.currentTick;
    remainingQueries = MAX_FLIGHT_QUERIES_PER_TICK;
  }
  if (remainingQueries <= 0) return false;
  remainingQueries--;
  return true;
}
