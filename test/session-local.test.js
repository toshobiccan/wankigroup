import { describe, it, expect, vi } from "vitest";
import { LocalSession } from "../src/net/session-local.js";
import { SessionError } from "../src/net/emitter.js";
import fs from "node:fs";

const zones = {
  plains1: JSON.parse(fs.readFileSync(new URL("../data/zones/plains1.json", import.meta.url), "utf8")),
};

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

async function start(storage = memoryStorage()) {
  return new LocalSession({ storage, loadZone: async (id) => zones[id] }).start();
}

describe("LocalSession", () => {
  it("keeps displaced starter equipment available to equip again", async () => {
    const session = await start();
    const previous = session.player.equipment.armor;
    session.player.inventory.equipables.push({ id: "new-armor", name: "New Armor", kind: "equipable", slot: "armor", stats: {} });
    session.equipItem("new-armor");
    expect(session.player.inventory.equipables.some(item => item.id === previous.id)).toBe(true);
    session.equipItem(previous.id);
    expect(session.player.equipment.armor.id).toBe(previous.id);
  });
  it("loads an old save and fills in new fields", async () => {
    const storage = memoryStorage({ "cardslayer-player": JSON.stringify({ name: "Old", coins: 42, activeDeckId: "deck-1" }) });
    const session = await start(storage);
    expect(session.mode).toBe("local");
    expect(session.needsLogin).toBe(false);
    expect(session.player).toMatchObject({ name: "Old", coins: 42, stats: { hp: 100 } });
  });

  it("applies rewards through the shared rules and persists them", async () => {
    const storage = memoryStorage();
    const session = await start(storage);
    const onPlayer = vi.fn();
    session.on("player", onPlayer);
    const outcome = await session.importedDeck(10);
    expect(outcome.reward).toEqual({ xp: 60, coins: 100 });
    expect(onPlayer).toHaveBeenCalled();
    expect(JSON.parse(storage.data.get("cardslayer-player")).coins).toBe(100);
    await expect(session.claimQuest("win1")).rejects.toThrow(SessionError);
  });

  it("fights through a local Room with the same checks as the server", async () => {
    vi.useFakeTimers();
    const session = await start();
    const mobEvents = [];
    session.on("mob", (m) => mobEvents.push(m));

    const snapshot = await session.joinZone("plains1");
    expect(snapshot.roomId).toBe("plains1-local");
    await expect(session.engage("goblin_1")).rejects.toMatchObject({ code: "too_far" });

    session.moveTo({ x: 0.5, y: 0.75, tx: 0.5, ty: 0.75 });
    await session.engage("goblin_1");
    let result;
    do {
      result = await session.grade("easy");
    } while (!result.mobDefeated);
    expect(result.rewards).toEqual({ xp: 50, coins: 15 });
    expect(session.player.daily.battlesWon).toBe(1);
    expect(mobEvents.at(-1)).toMatchObject({ id: "goblin_1", dead: true });

    vi.advanceTimersByTime(5000);
    expect(mobEvents.at(-1)).toMatchObject({ id: "goblin_1", dead: false, hp: 40 });
    vi.useRealTimers();
  });

  it("chat broadcasts to the local room (yourself included, since offline has no one else)", async () => {
    const session = await start();
    const onChat = vi.fn();
    session.on("chat", onChat);
    await session.joinZone("plains1");

    await session.sendChat("  hello  ");
    expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ id: "local", text: "hello", role: "guest" }));

    await expect(session.sendChat("   ")).rejects.toThrow(SessionError);
  });
});
