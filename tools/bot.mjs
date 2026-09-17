#!/usr/bin/env node
// A fake player for testing multiplayer alone: signs in as a guest, joins a
// zone, wanders around and now and then fights the nearest goblin.
//
//   npm run bot                                   -> 1 bot against http://localhost:5173
//   npm run bot -- --count 3                      -> 3 bots
//   npm run bot -- --server https://cardslayer-production.up.railway.app --zone plains1
//
// Each bot is a normal guest account, so the server treats it like anyone else.

import WebSocket from "ws";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    server: { type: "string", default: "http://localhost:5173" },
    zone: { type: "string", default: "plains1" },
    count: { type: "string", default: "1" },
    name: { type: "string", default: "Bot" },
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => min + Math.random() * (max - min);

async function runBot(index) {
  const label = `${args.name}${index + 1}`;
  const res = await fetch(`${args.server}/api/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: label }),
  });
  const auth = await res.json();
  if (!res.ok) throw new Error(`${label}: guest sign-in failed: ${auth.error}`);

  const ws = new WebSocket(args.server.replace(/^http/, "ws") + "/ws");
  const pending = new Map();
  let rid = 0;
  const request = (type, payload = {}) =>
    new Promise((resolve, reject) => {
      const id = ++rid;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ type, rid: id, ...payload }));
    });

  let room = null;
  const mobs = new Map();
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "result") {
      const p = pending.get(msg.rid);
      pending.delete(msg.rid);
      if (msg.ok) p?.resolve(msg.data);
      else p?.reject(new Error(msg.error));
    } else if (msg.type === "mob") {
      mobs.set(msg.id, msg);
    } else if (msg.type === "playerJoined") {
      console.log(`${label}: ${msg.player.name} joined ${room?.roomId}`);
    }
  });

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ type: "hello", token: auth.token, protocol: 1 }));
  await sleep(300);

  const zone = await (await fetch(`${args.server}/data/zones/${args.zone}.json`)).json(); // mob positions
  room = await request("join", { zoneId: args.zone });
  for (const mob of room.mobs) mobs.set(mob.id, mob);
  console.log(`${label}: joined ${room.roomId} with ${room.players.length} other player(s)`);

  let x = room.you.x;
  const y = room.you.y;
  ws.on("close", () => {
    console.log(`${label}: disconnected`);
    process.exitCode = 1;
  });

  for (;;) {
    const alive = [...mobs.values()].filter((m) => !m.dead);
    if (alive.length && Math.random() < 0.35) {
      const target = alive[Math.floor(Math.random() * alive.length)];
      const zoneMob = zone.mobs?.find((m) => m.id === target.id);
      const standX = Math.max(0, (zoneMob?.xFrac ?? x) - 0.05);
      ws.send(JSON.stringify({ type: "move", x, y, tx: standX, ty: y }));
      await sleep(1500);
      x = standX;
      ws.send(JSON.stringify({ type: "move", x, y, tx: x, ty: y }));
      try {
        await request("engage", { mobId: target.id });
        console.log(`${label}: fighting ${target.id}`);
        for (let round = 0; round < 20; round++) {
          await sleep(rand(1200, 2500)); // "reading the card"
          const grade = ["again", "hard", "good", "good", "easy"][Math.floor(Math.random() * 5)];
          const { result } = await request("grade", { grade });
          if (result.mobDefeated) {
            console.log(`${label}: defeated ${target.id} (+${result.rewards.xp} XP, +${result.rewards.coins} coins)`);
            break;
          }
          if (result.playerDefeated) {
            console.log(`${label}: was defeated, back to spawn`);
            x = room.you.x;
            break;
          }
        }
      } catch (err) {
        console.log(`${label}: fight over (${err.message})`);
      }
    } else {
      const tx = rand(0.1, 0.9);
      ws.send(JSON.stringify({ type: "move", x, y, tx, ty: y }));
      await sleep(rand(1500, 4000));
      x = tx;
    }
  }
}

const count = Math.max(1, Number(args.count) || 1);
await Promise.all(Array.from({ length: count }, (_, i) => runBot(i).catch((err) => console.error(err.message))));
