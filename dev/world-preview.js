import { WorldScene } from "../src/world/world-scene.js";

const scene = new WorldScene({ mountElement: document.getElementById("stage") });
scene.loadZone("../data/zones/plains.json");
