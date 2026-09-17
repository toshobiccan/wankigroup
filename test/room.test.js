import { describe, it, expect, beforeEach, vi } from "vitest";
import { Room } from "../src/game/room.js";
import { createDefaultPlayer } from "../src/game/player.js";
import { RESPAWN_DELAY_MS } from "../src/game/constants.js";

const zone = {
  id: "plains1",
  groundTopFrac: 0.7,
  groundBottomFrac: 0.8,
  spawnXFrac: 0.25,
  spawnYFrac: 0.75,
  capacity: 3,
  mobs: [
    {
      id: "goblin_1", name: "Goblin", level: 3, xFrac: 0.3, xpReward: 50, coinReward: 15,
      stats: { hp: 24, attackDamage: 6, magicDamage: 0, armor: 0, magicResist: 0, attackSpeed: 8, luck: 0 },
    },
  ],
};

function setup() {
  const store = new Map();
  const changed = [];
  const events = [];
  const room = new Room({
    id: "plains1-0001",
    zone,
    players: { get: (id) => store.get(id), changed: (id) => changed.push(id) },
    emit: (type, payload, target) => events.push({ type, payload, target }),
    random: () => 0.99, // never crit
    today: () => "2026-09-17",
  });
  const join = (id) => {
    store.set(id, createDefaultPlayer({ name: id }));
    return room.addPlayer(id);
  };
  return { room, store, changed, events, join };
}

describe("Room", () => {
  let ctx;
  beforeEach(() => {
    vi.useFakeTimers();
    ctx = setup();
  });

  it("puts new players at spawn and tells everyone else", () => {
    const { snapshot } = ctx.join("ann");
    expect(snapshot.you).toMatchObject({ id: "ann", x: 0.25, y: 0.75 });
    ctx.join("bob");
    expect(ctx.events.at(-1)).toMatchObject({ type: "playerJoined", target: { except: "bob" } });
    expect(ctx.room.snapshot("bob").players.map((p) => p.id)).toEqual(["ann"]);
  });

  it("refuses players beyond capacity", () => {
    ["a", "b", "c"].forEach((id) => ctx.join(id));
    expect(ctx.join("d")).toEqual({ ok: false, error: "room_full" });
  });

  it("clamps movement to the walkable band", () => {
    ctx.join("ann");
    ctx.room.move("ann", { x: 2, y: 0, tx: -1, ty: 1 });
    expect(ctx.room.snapshot("x").players[0]).toMatchObject({ x: 1, y: 0.7, tx: 0, ty: 0.8 });
    expect(ctx.room.move("ann", { x: NaN, y: 0, tx: 0, ty: 0 }).ok).toBe(false);
  });

  it("only engages mobs that are alive and in range", () => {
    ctx.join("ann");
    expect(ctx.room.engage("ann", "nope").error).toBe("unknown_mob");
    ctx.room.move("ann", { x: 0.9, y: 0.75, tx: 0.9, ty: 0.75 });
    expect(ctx.room.engage("ann", "goblin_1").error).toBe("too_far");
    ctx.room.move("ann", { x: 0.3, y: 0.75, tx: 0.3, ty: 0.75 });
    expect(ctx.room.engage("ann", "goblin_1")).toMatchObject({ ok: true, mob: { hp: 24, maxHp: 24 } });
  });

  it("shares mob HP, rewards every participant and respawns after the delay", () => {
    ctx.join("ann");
    ctx.join("bob");
    ctx.room.engage("ann", "goblin_1");
    ctx.room.engage("bob", "goblin_1");

    ctx.room.grade("ann", "good"); // 24 -> 12
    expect(ctx.events.at(-1)).toMatchObject({ type: "mobHit", payload: { hp: 12, byId: "ann" }, target: { except: "ann" } });

    const { result } = ctx.room.grade("bob", "good"); // 12 -> 0
    expect(result.mobDefeated).toBe(true);
    expect(result.rewards).toEqual({ xp: 50, coins: 15 });
    expect(ctx.events.find((e) => e.type === "combatEnded")).toMatchObject({ target: { to: "ann" }, payload: { rewards: { xp: 50, coins: 15 } } });
    expect(ctx.store.get("ann").coins).toBe(15);
    expect(ctx.store.get("bob").coins).toBe(15);
    expect(ctx.room.engage("ann", "goblin_1").error).toBe("mob_gone");

    vi.advanceTimersByTime(RESPAWN_DELAY_MS);
    expect(ctx.room.snapshot("ann").mobs[0]).toEqual({ id: "goblin_1", hp: 24, maxHp: 24, dead: false });
  });

  it("heals a mob back to full once nobody is fighting it", () => {
    ctx.join("ann");
    ctx.room.engage("ann", "goblin_1");
    ctx.room.grade("ann", "good");
    ctx.room.flee("ann");
    expect(ctx.room.snapshot("ann").mobs[0].hp).toBe(24);
  });

  it("sends a defeated player back to spawn with full HP", () => {
    ctx.join("ann");
    ctx.store.get("ann").hp = 1;
    ctx.room.move("ann", { x: 0.3, y: 0.75, tx: 0.3, ty: 0.75 });
    ctx.room.engage("ann", "goblin_1");
    ctx.store.get("ann").stats.attackSpeed = 1; // goblin swings first
    const { result } = ctx.room.grade("ann", "hard");
    expect(result.playerDefeated).toBe(true);
    expect(ctx.store.get("ann").hp).toBe(100);
    expect(ctx.room.snapshot("x").players[0]).toMatchObject({ x: 0.25, y: 0.75 });
  });

  it("cancels respawn timers on dispose", () => {
    ctx.join("ann");
    ctx.room.engage("ann", "goblin_1");
    ctx.room.grade("ann", "easy");
    ctx.room.grade("ann", "easy");
    ctx.room.dispose();
    const before = ctx.events.length;
    vi.advanceTimersByTime(RESPAWN_DELAY_MS * 2);
    expect(ctx.events.length).toBe(before);
  });
});
