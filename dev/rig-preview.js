import * as PIXI from "../vendor/pixi.min.mjs";
import { RigActor } from "../src/sprites/rig-actor.js";

const stage = document.getElementById("stage");
const [rig, idle, run, attack] = await Promise.all([
  fetch("../data/rigs/humanoid.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/idle.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/run.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/attack.json").then((response) => response.json()),
]);

const app = new PIXI.Application();
await app.init({ resizeTo: stage, backgroundAlpha: 0, autoDensity: true, resolution: window.devicePixelRatio || 1 });
stage.appendChild(app.canvas);

const ground = new PIXI.Graphics().rect(-1000, 0, 2000, 5).fill(0x405827);
const actor = new RigActor({ rig, clips: { idle, run, attack } });
actor.setDisplayHeight(190);
actor.applyAppearance({ equipment: { helmet: "preview", cape: "preview", chestplate: "preview", weapon: "preview", book: "preview" } });
app.stage.addChild(ground, actor);

function layout() {
  ground.position.set(app.screen.width / 2, app.screen.height * 0.77);
  actor.position.set(app.screen.width / 2, ground.position.y);
}
layout();
app.renderer.on("resize", layout);
app.ticker.add((ticker) => actor.update(ticker.deltaMS));

for (const button of document.querySelectorAll("[data-clip]")) {
  button.addEventListener("click", () => {
    actor.playOnce(button.dataset.clip);
    document.querySelectorAll("[data-clip]").forEach((entry) => entry.classList.toggle("selected", entry === button));
  });
}

let facingLeft = false;
document.getElementById("facing").addEventListener("click", (event) => {
  facingLeft = !facingLeft;
  actor.faceLeft(facingLeft);
  event.currentTarget.textContent = facingLeft ? "Face right" : "Face left";
});

const equipment = { ...actor.appearance.equipment };
const slots = document.getElementById("slot-controls");
for (const slotId of Object.keys(rig.slots)) {
  const button = document.createElement("button");
  button.textContent = `Toggle ${slotId}`;
  button.classList.toggle("selected", Boolean(equipment[slotId]));
  button.addEventListener("click", () => {
    equipment[slotId] = equipment[slotId] ? null : "preview";
    actor.applyAppearance({ equipment });
    button.classList.toggle("selected", Boolean(equipment[slotId]));
  });
  slots.appendChild(button);
}
