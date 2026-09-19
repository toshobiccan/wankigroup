import { reviewKeyAction } from '../ui/review-controls.js';
import { loadControls } from '../ui/control-settings.js';
import { isUnseen, cardLabel } from '../game/srs.js';
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
  // Deliberately taller than any real screen -- _setHeight() clamps this down
  // via _maxSheetHeightPx() so the battle's top third always stays visible.
  // The sheet itself is translucent and blurred, and the combat camera zooms
  // in and frames the fighters near the top of that band (see world-scene.js's
  // COMBAT_ZOOM_BOOST), so even at "full" the fight stays visible and legible
  // behind the card.
  full: 9999,
  retracted: 40, // smaller than peek -- just enough to keep the handle visible during a hit
};

// A card with an image, or with enough text to need real room, gets the
// full-height treatment automatically -- reading and answering the card
// matters more here than seeing the fight behind it, and nobody should have
// to remember to drag the handle up before it's readable.
const LONG_TEXT_CHARS = 140;

export class EncounterPanel {
  constructor({ mountElement, onGrade, onFight, onFlee, onReading }) {
    this.mountElement = mountElement;
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

  // The battle must always keep at least its top quarter free of the reading
  // sheet, measured live off the actual view box -- this app's height chain
  // (nothing between .app's 100dvh and .view gives <main> a definite height)
  // leaves percentage-based CSS max-heights unable to resolve, so this can't
  // be done in CSS alone.
  //
  // The fraction is of the battle-viewable area specifically (the view minus
  // the deck-progress bar the sheet's `bottom` offset sits above), not the
  // whole view box -- that bar isn't battle, and counting it made the actual
  // visible peek noticeably short of a true quarter.
  _maxSheetHeightPx() {
    const view = this.mountElement.closest(".view") ?? this.mountElement.parentElement;
    const viewHeight = view?.getBoundingClientRect().height || window.innerHeight;
    const bottomOffset = parseFloat(getComputedStyle(this.root).bottom) || 0;
    const battleHeight = viewHeight - bottomOffset;
    return (battleHeight * 3) / 4;
  }

  _setHeight(state) {
    this.onReading?.(["default","expanded","full"].includes(state) && this.content.querySelector(".sheet-card-content") !== null);
    this._state = state;
    this.root.style.height = `${Math.min(HEIGHTS[state], this._maxSheetHeightPx())}px`;
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

  // card.front/card.back are either a plain string (legacy/premade cards) or
  // an array of { t: "text", v } / { t: "img", v: filename } parts (cards
  // imported since anki-import.js started preserving media). Either way this
  // builds real DOM nodes directly -- text as text nodes, images resolved
  // through `media` (filename -> object URL, built by app.js from the deck's
  // stored Blobs) -- never innerHTML, so imported field content is never
  // parsed as HTML.
  _renderCardField(container, value, media) {
    const parts = Array.isArray(value) ? value : [{ t: "text", v: value ?? "" }];
    for (const part of parts) {
      if (part.t === "img") {
        const src = media?.get(part.v);
        if (!src) continue; // media missing (e.g. deleted from storage) -- skip rather than show a broken icon
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.addEventListener("click", () => this._openLightbox(img.src));
        container.appendChild(img);
      } else if (part.v) {
        container.appendChild(document.createTextNode(part.v));
      }
    }
  }

  _buildCardContent(card, mob, playerState, { revealed, media }) {
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

    const statusRow = document.createElement("div");
    statusRow.className = "sheet-card-status";
    const statusTag = document.createElement("span");
    statusTag.className = `tag${isUnseen(card) ? " tag-new" : ""}`;
    statusTag.textContent = cardLabel(card);
    statusRow.appendChild(statusTag);
    const explainBtn = document.createElement("button");
    explainBtn.type = "button";
    explainBtn.className = "btn-small btn-ghost explain-btn";
    explainBtn.textContent = "✨ Explain";
    explainBtn.disabled = true;
    explainBtn.title = "Coming soon: an AI explanation of this card, for premium members.";
    statusRow.appendChild(explainBtn);
    wrap.appendChild(statusRow);

    const cardEl = document.createElement("div");
    cardEl.className = "sheet-card-content";
    const frontEl = document.createElement("div");
    frontEl.style.whiteSpace = "pre-line";
    this._renderCardField(frontEl, card.front, media);
    cardEl.appendChild(frontEl);

    if (revealed) {
      const backEl = document.createElement("div");
      backEl.className = "sheet-card-answer";
      backEl.style.whiteSpace = "pre-line";
      if (Array.isArray(card.back) ? card.back.some((p) => p.v) : card.back) {
        this._renderCardField(backEl, card.back, media);
      } else {
        backEl.textContent = "—";
      }
      cardEl.appendChild(backEl);
    }
    wrap.appendChild(cardEl);

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
      revealBtn.addEventListener("click", () => this.reveal(card, mob, playerState, media));
      wrap.appendChild(revealBtn);
    }

    const choices=[...wrap.querySelectorAll('.answer-actions button,.sheet-reveal-btn')];
    let selected=0;
    const highlight=()=>choices.forEach((button,i)=>button.classList.toggle('review-selected',i===selected));
    const move=delta=>{if(submitted)return;selected=(selected+delta+choices.length)%choices.length;highlight();};
    const back=()=>{if(submitted)return;if(revealed)this.showCard(card,mob,playerState,media);};
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

  // True if these parts (a card's front, or front+back) need the full-height
  // treatment: any image, or enough combined text that a cramped sheet would
  // get in the way of reading it.
  _needsFullView(...partsLists) {
    let chars = 0;
    for (const parts of partsLists) {
      for (const part of Array.isArray(parts) ? parts : [{ t: "text", v: parts ?? "" }]) {
        if (part.t === "img") return true;
        chars += part.v?.length ?? 0;
      }
    }
    return chars > LONG_TEXT_CHARS;
  }

  // media: optional Map<filename, objectURL> for this card's deck (app.js
  // builds it from DB.mediaForDeck's Blobs). Omitted, images just don't render.
  showCard(card, mob, playerState, media) {
    this.content.replaceChildren(this._buildCardContent(card, mob, playerState, { revealed: false, media }));
    this._setHeight(this._needsFullView(card.front) ? "full" : this._preferredCombatHeight);
    this.content.firstElementChild?.focus({preventScroll:true});
  }

  reveal(card, mob, playerState, media) {
    this.content.replaceChildren(this._buildCardContent(card, mob, playerState, { revealed: true, media }));
    // The back can turn a short question into a long or image-bearing answer
    // (or vice versa going "back" to the front) -- re-check every time either
    // side of the card changes what's on screen, don't just inherit showCard's height.
    this._setHeight(this._needsFullView(card.front, card.back) ? "full" : this._preferredCombatHeight);
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
    // Draggable during combat (default/expanded), and from an auto-expanded
    // "full" card so a long/image card never traps the handle -- not from
    // peek/retracted, which aren't combat reading states at all.
    if (!["default", "expanded", "full"].includes(this._state)) return;
    const dragStartY = event.clientY;
    // Clamped into the normal drag range even from "full" (an oversized
    // sentinel height, see HEIGHTS.full) -- otherwise the first pointermove
    // below would need an impossible multi-thousand-pixel drag to register.
    const dragStartHeight = Math.min(HEIGHTS.expanded, HEIGHTS[this._state]);
    let dragHeight = dragStartHeight; // tracks the intended target height, not the rendered one

    const onMove = (moveEvent) => {
      const delta = dragStartY - moveEvent.clientY; // dragging up increases height
      const nextHeight = Math.min(HEIGHTS.expanded, this._maxSheetHeightPx(), Math.max(HEIGHTS.default, dragStartHeight + delta));
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
