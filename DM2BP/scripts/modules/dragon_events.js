import { onAfterEntityHurt } from "../core/combat_events.js";
import { onPlayerLeave } from "../core/player_lifecycle.js";
import {
  handleDragonOwnerLeave,
  handleDragonHurt,
} from "../utilities/dragon_utilities.js";

onPlayerLeave(({ playerId }) => {
  handleDragonOwnerLeave(playerId);
});

onAfterEntityHurt(({ hurtEntity }) => {
  handleDragonHurt(hurtEntity);
});
