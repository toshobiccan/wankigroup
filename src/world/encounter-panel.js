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
  // The real height while a card (or a combat message) is up comes from CSS
  // -- .in-combat .encounter-sheet { top: var(--combat-stage-height); height:
  // auto } -- fixed for the whole fight by world-scene.js's enterCombatStage(),
  // never resized per-card. This is just the fallback for the rare moment
  // that class isn't present yet (e.g. a "no active deck" message shown
  // before a fight has actually started).
  reading: 560,
};

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

    this._state = "hidden"; // "hidden" | "peek" | "reading"
  }

  _setHeight(state) {
    this.onReading?.(state === "reading" && this.content.querySelector(".sheet-card-content") !== null);
    this._state = state;
    // .in-combat's CSS fixes the sheet to the combat-stage layout (see
    // world-controls.css), but combat can already be running (the canvas
    // already shrunk to its stage) for a moment before the first card
    // actually loads -- the mob-select "peek" panel is still showing then.
    // Scope that CSS override to genuinely "reading" content only, or the
    // peek panel would get stretched to fill the whole stage-sized sheet
    // instead of staying its own compact size during that gap.
    this.root.classList.toggle("is-reading", state === "reading");
    this.root.style.height = `${HEIGHTS[state]}px`;
  }

  hide() {
    this._setHeight("hidden");
    this.content.replaceChildren();
  }

  showPeek(mob) {
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
    this._setHeight("reading");
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

    // Everything that can grow long (the card face) scrolls in here; the
    // grade buttons live in `footer` below, outside this scroller, so they're
    // always reachable in one tap regardless of how long the card is --
    // answering a well-known card should never need a scroll first.
    const scroll = document.createElement("div");
    scroll.className = "sheet-scroll";
    wrap.appendChild(scroll);

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
    scroll.appendChild(hpRow);

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
    scroll.appendChild(statusRow);

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
    const cardSlot = document.createElement("div");
    cardSlot.className = "sheet-card-slot";
    cardSlot.appendChild(cardEl);
    scroll.appendChild(cardSlot);

    // Grade buttons, the reveal button, and the review-controller pad all
    // stay outside `scroll` -- pinned, never scrolled away.
    const footer = document.createElement("div");
    footer.className = "sheet-footer";
    wrap.appendChild(footer);

    let submitted=false;
    if(Array.isArray(card.tutorialChoices) && card.tutorialChoices.length && !revealed){
      const actions=document.createElement('div');actions.className='answer-actions choice-actions';
      const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.className='quiz-feedback';
      for(const answer of card.tutorialChoices){
        const button=document.createElement('button');button.textContent=answer;button.type='button';
        button.onclick=()=>{if(submitted)return;if(answer!==card.back){feedback.textContent='Not quite. Try another answer.';button.disabled=true;return;}
          submitted=true;wrap.querySelectorAll('button').forEach(b=>b.disabled=true);this.onGrade?.('good');};
        actions.append(button);
      }footer.append(actions,feedback);
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
        // Disable all four grade buttons the moment any one is tapped -- the
        // next card replaces this content right away, but a fast double-tap
        // could otherwise fire onGrade() twice for the same card in the gap.
        // They get naturally replaced next time showCard()/reveal() rebuilds
        // this content, so no re-enable logic is needed here.
        btn.addEventListener("click", () => {
          submitted=true;
          wrap.querySelectorAll("button").forEach((b) => { b.disabled = true; });
          this.onGrade?.(grade);
        });
        gradeButtons.push(btn);
        actions.appendChild(btn);
      }
      footer.appendChild(actions);
    } else {
      const revealBtn = document.createElement("button");
      revealBtn.className = "btn-primary sheet-reveal-btn";
      revealBtn.textContent = "Show Answer";
      revealBtn.addEventListener("click", () => this.reveal(card, mob, playerState, media));
      footer.appendChild(revealBtn);
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
      }footer.append(pad);highlight();
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

  // media: optional Map<filename, objectURL> for this card's deck (app.js
  // builds it from DB.mediaForDeck's Blobs). Omitted, images just don't render.
  // The sheet's actual height is fixed for the whole fight (see HEIGHTS.reading's
  // comment) regardless of this card's own length -- .sheet-scroll inside
  // _buildCardContent handles anything that doesn't fit, so there's nothing
  // to measure or pick a size for here.
  showCard(card, mob, playerState, media) {
    this.content.replaceChildren(this._buildCardContent(card, mob, playerState, { revealed: false, media }));
    this._setHeight("reading");
    this.content.firstElementChild?.focus({preventScroll:true});
  }

  reveal(card, mob, playerState, media) {
    this.content.replaceChildren(this._buildCardContent(card, mob, playerState, { revealed: true, media }));
    this._setHeight("reading");
    this.content.firstElementChild?.focus({preventScroll:true});
  }

  _openLightbox(src) {
    this.lightboxImg.src = src;
    this.lightbox.hidden = false;
  }

  _closeLightbox() {
    this.lightbox.hidden = true;
  }
}
