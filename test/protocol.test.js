import { describe, it, expect } from "vitest";
import { parseClientMessage, CLIENT_MESSAGES, SERVER_EVENTS } from "../src/net/protocol.js";
import { CHAT_MAX_LENGTH } from "../src/game/constants.js";

describe("parseClientMessage chat", () => {
  it("accepts a normal message", () => {
    const result = parseClientMessage(JSON.stringify({ type: "chat", rid: 1, text: "hi there" }));
    expect(result).toEqual({ ok: true, message: { type: "chat", rid: 1, text: "hi there" } });
  });

  it("rejects an empty string", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "" })).ok).toBe(false);
  });

  it("rejects a message over CHAT_MAX_LENGTH", () => {
    const tooLong = "x".repeat(CHAT_MAX_LENGTH + 1);
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: tooLong })).ok).toBe(false);
  });

  it("accepts exactly CHAT_MAX_LENGTH characters", () => {
    const atLimit = "x".repeat(CHAT_MAX_LENGTH);
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: atLimit })).ok).toBe(true);
  });

  it("rejects a non-string text field", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: 5 })).ok).toBe(false);
  });

  it("registers chat in the message/event tables", () => {
    expect(CLIENT_MESSAGES.chat).toBe("chat");
    expect(SERVER_EVENTS).toContain("chat");
  });
});
