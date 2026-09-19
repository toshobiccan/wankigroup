import { DEFAULT_HEAD, HAIR_STYLES, HeadBlink, normalizeHead } from "../sprites/character-head.js";
import { HeadRenderer, loadHeadAssets } from "../sprites/head-renderer.js";

const CHOICES = {
  hair: HAIR_STYLES,
  hairColor: [["#56351f", "Chestnut"], ["#272626", "Raven"], ["#965437", "Copper"], ["#c4a363", "Golden"], ["#ded8c4", "Silver"], ["#6b7389", "Dusk"]],
  eyeColor: [["#657780", "Storm"], ["#538967", "Forest"], ["#5382aa", "Ocean"], ["#866040", "Hazel"], ["#b99a48", "Amber"], ["#8972a6", "Violet"]],
  skinColor: [["#f1c69d", "Fair"], ["#dda568", "Warm"], ["#c08854", "Bronze"], ["#9f6846", "Umber"], ["#724b37", "Deep"], ["#bcbdac", "Ash"]],
  eyeShape: [["standard", "Classic"], ["lashes", "Lashes"]],
  mouth: [["neutral", "Calm"], ["smile", "Friendly"]],
};
const LABELS = { hair: "Hair", hairColor: "Hair & brows", eyeColor: "Eye color", skinColor: "Skin", eyeShape: "Eye shape", mouth: "Expression" };
let assetsPromise;
function assets() { return assetsPromise ??= loadHeadAssets().catch(error => { assetsPromise = null; throw error; }); }

export function mountCharacterCreator(mount, { appearance, firstTime = false, onSave, onSaved, onCancel }) {
  mount.innerHTML = `<div class="wardrobe-room">
    <header class="wardrobe-heading"><span class="wardrobe-kicker">${firstTime ? "A NEW ADVENTURE" : "THE WARDROBE"}</span><h2>${firstTime ? "Who are you?" : "A change of style"}</h2><p>${firstTime ? "Every adventure begins with you." : "Make yourself at home."}</p></header>
    <div class="wardrobe-mirror"><div class="wardrobe-mirror-inner"><canvas width="512" height="448" aria-label="Your character's face"></canvas></div><span class="mirror-ornament" aria-hidden="true">◆</span></div>
    <form class="wardrobe-panel"><fieldset disabled><legend class="sr-only">Your appearance</legend><div class="wardrobe-choices"></div>
    <p class="wardrobe-tip">Eyebrows follow your hair color.</p><div class="wardrobe-actions"><button type="submit" class="btn-primary wardrobe-save">${firstTime ? "Begin adventure" : "Save look"}</button><button type="button" class="btn-small wardrobe-cancel" ${firstTime ? "hidden" : ""}>Back</button></div>
    </fieldset><p class="wardrobe-status" role="status" aria-live="polite">Preparing your mirror…</p></form></div>`;
  let disposed = false, raf = 0, busy = false, state = normalizeHead(appearance);
  const root = mount.firstElementChild, form = root.querySelector("form"), fieldset = root.querySelector("fieldset"), status = root.querySelector('[role="status"]');
  const canvas = root.querySelector("canvas"), ctx = canvas.getContext("2d"), blink = new HeadBlink();
  const rows = new Map(); let renderer;
  const draw = frame => { renderer.draw(frame); ctx.clearRect(0, 0, 512, 448); ctx.drawImage(renderer.canvas, 40, 0, 400, 350, 0, 0, 512, 448); };
  const refresh = () => {
    for (const [key, row] of rows) {
      row.querySelector("output").textContent = CHOICES[key].find(([value]) => value === state[key])?.[1] ?? "Custom";
      if (key.endsWith("Color")) row.querySelector("i").style.backgroundColor = state[key];
    }
    renderer.setAppearance(state); draw("open");
  };
  for (const [key, options] of Object.entries(CHOICES)) {
    const row = document.createElement("div"); row.className = "wardrobe-choice";
    row.innerHTML = `<span class="wardrobe-label">${LABELS[key]}</span><div class="wardrobe-stepper"><button type="button" aria-label="Previous ${LABELS[key].toLowerCase()}">‹</button><span class="wardrobe-choice-value">${key.endsWith("Color") ? '<i aria-hidden="true"></i>' : ""}<output aria-live="polite"></output></span><button type="button" aria-label="Next ${LABELS[key].toLowerCase()}">›</button></div>`;
    row.querySelectorAll("button").forEach((button, index) => button.onclick = () => {
      const current = options.findIndex(([value]) => value === state[key]);
      state[key] = options[(Math.max(current, 0) + (index ? 1 : -1) + options.length) % options.length][0];
      refresh(); status.textContent = "";
    });
    root.querySelector(".wardrobe-choices").appendChild(row); rows.set(key, row);
  }
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || !renderer || disposed) return;
    busy = true; fieldset.disabled = true; status.textContent = "Saving your look…";
    try { await onSave({ ...state }); if (!disposed) onSaved?.(); }
    catch { if (!disposed) status.textContent = "Your look wasn't saved. Please try again."; }
    finally { busy = false; if (!disposed) fieldset.disabled = false; }
  };
  root.querySelector(".wardrobe-cancel").onclick = () => { if (!busy) onCancel(); };
  // Return immediately so navigating away while images load can cancel safely.
  const dispose = () => { disposed = true; cancelAnimationFrame(raf); };
  assets().then(resources => {
    if (disposed) return;
    renderer = new HeadRenderer(resources, state); refresh(); fieldset.disabled = false; status.textContent = "";
    let previous = performance.now(), lastFrame = "open";
    const tick = now => {
      if (disposed) return;
      const frame = blink.update(now - previous, state.autoBlink); previous = now;
      if (lastFrame !== frame) { draw(frame); lastFrame = frame; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }).catch(() => {
    if (disposed) return;
    status.textContent = "The mirror couldn't load. Please try again.";
    fieldset.disabled = false;
    root.querySelectorAll(".wardrobe-stepper button, .wardrobe-save").forEach(button => { button.disabled = true; });
    const back = root.querySelector(".wardrobe-cancel");
    back.hidden = false;
    back.textContent = firstTime ? "Try again" : "Back";
  });
  return dispose;
}

export async function renderCharacterAvatar(canvas, appearance) {
  const renderer = new HeadRenderer(await assets(), appearance ?? DEFAULT_HEAD);
  const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(renderer.canvas, 40, 0, 390, 370, 0, 0, canvas.width, canvas.height);
}
