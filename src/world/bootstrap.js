// Bridge from the ES-module world into app.js (a classic script). Everything
// app.js needs from src/ is published on window.Cardslayer, then a
// "cardslayer:ready" event tells app.js it can start.

import { WorldScene } from "./world-scene.js";
import { EncounterPanel } from "./encounter-panel.js";
import { resolveRound, applyLuckDropBonus } from "./combat.js";
import { EQUIP_SLOTS, createEquipable, createMaterial, makeMaterialStack, createClass, createBuff } from "../items.js";
import { createSession } from "../net/session.js";
import { questView } from "../game/progression.js";
import { XP_PER_LEVEL, START_ZONE_ID } from "../game/constants.js";

window.Cardslayer = window.Cardslayer || {};
Object.assign(window.Cardslayer, {
  WorldScene, EncounterPanel, resolveRound, applyLuckDropBonus,
  EQUIP_SLOTS, createEquipable, createMaterial, makeMaterialStack, createClass, createBuff,
  createSession,
  game: { questView, XP_PER_LEVEL, START_ZONE_ID },
  ready: true,
});
window.dispatchEvent(new Event("cardslayer:ready"));
