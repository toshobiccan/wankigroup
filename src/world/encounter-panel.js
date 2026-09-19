import { reviewKeyAction } from '../ui/review-controls.js';
import { loadControls } from '../ui/control-settings.js';
// DOM-only (no PIXI). Owns the sheet shown below the world canvas during
// mob selection and combat. Knows nothing about players, decks, or DB --
// app.js passes in exactly what each method needs to render, and the only
// thing flowing back out is onGrade(). This keeps the panel testable and
// reusable on its own, and keeps app.js as the single place that
// understands the actual game flow.

const HEIGHTS = {
  hidden: 0,
  peek: 132,
  default: 320,
  expanded: 560,
  retracted: 40, // smaller than peek -- just enough to keep the handle visible during a hit
};

export class EncounterPanel {
  constructor({ mountElement, onGrade, onFight, onFlee, onReading }) {
    this.onReading = onReading;
    this.onGrade = onGrade; // (grade: "again"|"hard"|"good"|"easy") => void
    this.onFight = onFight; // () => void -- "Fight" button on the peek sheet
    this.onFlee = onFlee; // () => void -- "Flee" button on the peek sheet

    this.root = document.createElement("div");
    this.root.className = "encounter-sheet";
    this.root.style.height = "0px";

    this.handle = document.createElement("div");
    this.handle.className = "sheet-handle";
    this.root.appendChild(this.handle);

    this.content = document.createElement("div");
    this.content.className = "sheet-content";
    this.root.appendChild(this.content);

    this.lightbox = document.createElement("div");
    this.lightbox.className = "lightbox";
    this.lightbox.hidden = true;
    this.lightboxImg = document.createElement("img");
    this.lightboxImg.className = "lightbox-img";
    this.lightbox.appendChild(this.lightboxImg);
    this.lightbox.addEventListener("pointerdown", () => this._closeLightbox());

    mountElement.appendChild(this.root);
    mountElement.appendChild(this.lightbox);

    this._state = "hidden"; // "hidden" | "peek" | "default" | "expanded" | "retracted"
    this._preferredCombatHeight = "default"; // remembered default/expanded choice, per fight
    this._beforeRetractState = null;

    this.handle.addEventListener("pointerdown", (event) => this._onHandlePointerDown(event));
  }

  _setHeight(state) {
    this.onReading?.(["default","expanded"].includes(state) && this.content.querySelector(".sheet-card-content") !== null);
    this._state = state;
    this.root.style.height = `${HEIGHTS[state]}px`;
  }

  hide() {
    this._setHeight("hidden");
    this.content.replaceChildren();
  }

  retract() {
    this._beforeRetractState = this._state;
    this._setHeight("retracted");
  }

  restore() {
    this._setHeight(this._beforeRetractState || "default");
  }

  showPeek(mob) {
    this._preferredCombatHeight = "default"; // a fresh fight (if one starts) begins at default height
    const wrap = document.createElement("div");
    wrap.className = "sheet-peek";

    const portrait = document.createElement("img");
    portrait.className = "sheet-portrait";
    portrait.src = mob.portrait;
    portrait.alt = "";

    const text = document.createElement("div");
    text.className = "sheet-peek-text";

    const name = document.createElement("div");
    name.className = "sheet-peek-name";
    name.append(mob.name + " ");
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `Lv ${mob.level}`;
    name.appendChild(tag);

    const hp = document.createElement("div");
    hp.className = "sheet-peek-hp";
    hp.textContent = `${mob.hp} / ${mob.stats.hp} HP`;

    text.append(name, hp);
    wrap.append(portrait, text);

    const actions = document.createElement("div");
    actions.className = "sheet-peek-actions";
    const fightBtn = document.createElement("button");
    fightBtn.className = "btn-small";
    fightBtn.textContent = "Fight";
    fightBtn.addEventListener("click", () => this.onFight?.());
    const fleeBtn = document.createElement("button");
    fleeBtn.className = "btn-small btn-ghost";
    fleeBtn.textContent = "Flee";
    fleeBtn.addEventListener("click", () => this.onFlee?.());
    actions.append(fightBtn, fleeBtn);

    const outer = document.createElement("div");
    outer.className = "sheet-peek-outer";
    outer.append(wrap, actions);

    this.content.replaceChildren(outer);
    this._setHeight("peek");
  }

  showMessage({ text, actionLabel, onAction }) {
    const wrap = document.createElement("div");
    wrap.className = "sheet-message";

    const p = document.createElement("p");
    p.textContent = text;
    wrap.appendChild(p);

    if (actionLabel) {
      const btn = document.createElement("button");
      btn.className = "btn-small";
      btn.textContent = actionLabel;
      btn.addEventListener("click", onAction);
      wrap.appendChild(btn);
    }

    this.content.replaceChildren(wrap);
    this._setHeight("default");
  }

  // card.front/card.back are plain text today (anki-import.js strips HTML
  // and media on import), so this renders them as text, never innerHTML --
  // matching how the rest of this codebase (app.js's el() helper) already
  // treats card content. The <img> lookup below is real and wired up (any
  // future card that does contain an <img> gets a working zoom tap) but
  // finds nothing until a media-preserving import pipeline exists -- that's
  // a separate, not-yet-planned piece of work, not a bug in this one.
  _buildCardContent(card, mob, playerState, { revealed }) {
    const wrap = document.createElement("div");
    wrap.className = "sheet-combat";

    const hpRow = document.createElement("div");
    hpRow.className = "sheet-hp-row";
    const hpLabel = document.createElement("div");
    hpLabel.className = "sheet-hp-label";
    const hpLabelLeft = document.createElement("span");
    hpLabelLeft.textContent = "You";
    const hpLabelRight = document.createElement("span");
    hpLabelRight.textContent = `${playerState.hp} / ${playerState.maxHp} HP`;
    hpLabel.append(hpLabelLeft, hpLabelRight);
    const hpBar = document.createElement("div");
    hpBar.className = "sheet-hp-bar";
    const hpFill = document.createElement("div");
    hpFill.style.width = `${Math.max(0, (playerState.hp / playerState.maxHp) * 100)}%`;
    hpBar.appendChild(hpFill);
    hpRow.append(hpLabel, hpBar);
    wrap.appendChild(hpRow);

    const cardEl = document.createElement("div");
    cardEl.className = "sheet-card-content";
    const frontEl = document.createElement("div");
    frontEl.style.whiteSpace = "pre-line";
    frontEl.textContent = card.front;
    cardEl.appendChild(frontEl);

    if (revealed) {
      const backEl = document.createElement("div");
      backEl.className = "sheet-card-answer";
      backEl.style.whiteSpace = "pre-line";
      backEl.textContent = card.back || "—";
      cardEl.appendChild(backEl);
    }
    wrap.appendChild(cardEl);

    cardEl.querySelectorAll("img").forEach((img) => {
      img.addEventListener("click", () => this._openLightbox(img.src));
    });

    let submitted=false;
    if(Array.isArray(card.tutorialChoices) && card.tutorialChoices.length && !revealed){
      const actions=document.createElement('div');actions.className='answer-actions choice-actions';
      const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.className='quiz-feedback';
      for(const answer of card.tutorialChoices){
        const button=document.createElement('button');button.textContent=answer;button.type='button';
        button.onclick=()=>{if(submitted)return;if(answer!==card.back){feedback.textContent='Not quite. Try another answer.';button.disabled=true;return;}
          submitted=true;wrap.querySelectorAll('button').forEach(b=>b.disabled=true);this.onGrade?.('good');};
        actions.append(button);
      }wrap.append(actions,feedback);
    }else if (revealed) {
      const actions = document.createElement("div");
      actions.className = "answer-actions";
      const gradeButtons = []; // so a click on any one of them can disable all four before onGrade() fires
      for (const [grade, label, sub] of [
        ["again", "Again", "miss"],
        ["hard", "Hard", "hit"],
        ["good", "Good", "hit"],
        ["easy", "Easy", "crit!"],
      ]) {
        const btn = document.createElement("button");
        btn.className = `a-${grade}`;
        const labelText = document.createElement("span");
        labelText.textContent = label;
        const subText = document.createElement("small");
        subText.textContent = sub;
        btn.append(labelText, subText);
        // Disable all four grade buttons the moment any one is tapped -- retract()
        // only animates the sheet's CSS height over .25s, it doesn't stop the
        // buttons from staying clickable during that transition, so a fast
        // double-tap could otherwise fire onGrade() twice for one card. They get
        // naturally replaced/re-enabled next time showCard()/reveal() rebuilds
        // this content, so no re-enable logic is needed here.
        btn.addEventListener("click", () => {
          submitted=true;
          wrap.querySelectorAll("button").forEach((b) => { b.disabled = true; });
          this.onGrade?.(grade);
        });
        gradeButtons.push(btn);
        actions.appendChild(btn);
      }
      wrap.appendChild(actions);
    } else {
      const revealBtn = document.createElement("button");
      revealBtn.className = "btn-primary sheet-reveal-btn";
      revealBtn.textContent = "Show Answer";
      revealBtn.addEventListener("click", () => this.reveal(card, mob, playerState));
      wrap.appendChild(revealBtn);
    }

    const choices=[...wrap.querySelectorAll('.answer-actions button,.sheet-reveal-btn')];
    let selected=0;
    const highlight=()=>choices.forEach((button,i)=>button.classList.toggle('review-selected',i===selected));
    const move=delta=>{if(submitted)return;selected=(selected+delta+choices.length)%choices.length;highlight();};
    const back=()=>{if(submitted)return;if(revealed)this.showCard(card,mob,playerState);};
    const preferences=loadControls();
    if(preferences.mode!=='tap'){
      const pad=document.createElement('div');pad.className='review-controller';pad.setAttribute('aria-label','Review controls');
      for(const [label,title,act]of [['‹','Previous answer',()=>move(-1)],['›','Next answer',()=>move(1)],['B','Hide answer',back],['A','Confirm selected answer',()=>choices[selected]?.click()]]){
        const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',title);if(label==='B' && !revealed)b.disabled=true;b.onclick=()=>{if(preferences.haptics)navigator.vibrate?.(8);act();};pad.append(b);
      }wrap.append(pad);highlight();
    }
    wrap.tabIndex=-1;
    wrap.addEventListener('keydown',event=>{
      const action=reviewKeyAction(event,preferences.keys,submitted);
      if(!action)return;
      event.preventDefault();
      if(action==='previous')move(-1);
      else if(action==='next')move(1);
      else if(action==='confirm')choices[selected]?.click();
      else if(action==='cancel')back();
    });
    return wrap;
  }

  showCard(card, mob, playerState) {
    this.content.replaceChildren(this._buildCardContent(card, mob, playerState, { revealed: false }));
    this._setHeight(this._preferredCombatHeight);
    this.content.firstElementChild?.focus({preventScroll:true});
  }

  reveal(card, mob, playerState) {
    this.content.replaceChildren(this._buildCardContent(card, mob, playerState, { revealed: true }));
    this.content.firstElementChild?.focus({preventScroll:true});
  }

  _openLightbox(src) {
    this.lightboxImg.src = src;
    this.lightbox.hidden = false;
  }

  _closeLightbox() {
    this.lightbox.hidden = true;
  }

  _onHandlePointerDown(event) {
    if (this._state !== "default" && this._state !== "expanded") return; // only draggable during combat, not peek/retracted
    const dragStartY = event.clientY;
    const dragStartHeight = HEIGHTS[this._state];
    let dragHeight = dragStartHeight; // tracks the intended target height, not the rendered one

    const onMove = (moveEvent) => {
      const delta = dragStartY - moveEvent.clientY; // dragging up increases height
      const nextHeight = Math.min(HEIGHTS.expanded, Math.max(HEIGHTS.default, dragStartHeight + delta));
      dragHeight = nextHeight;
      this.root.style.height = `${nextHeight}px`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // Use the tracked drag target rather than getBoundingClientRect(): .encounter-sheet
      // has `transition: height .25s ease` for the peek/default/expanded/hide state changes,
      // and that same transition fires on every pointermove's style.height write during a
      // drag, so the rendered box lags far behind the target height for the whole gesture.
      // Reading the live rect here would almost always read back near dragStartHeight and
      // snap the wrong way regardless of how far the handle was actually dragged.
      const midpoint = (HEIGHTS.default + HEIGHTS.expanded) / 2;
      this._preferredCombatHeight = dragHeight > midpoint ? "expanded" : "default";
      this._setHeight(this._preferredCombatHeight);
    this.content.firstElementChild?.focus({preventScroll:true});
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
}
