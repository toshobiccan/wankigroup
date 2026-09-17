// Passwords, session tokens and the rules for names. Uses only Node's
// built-in crypto -- no third-party auth code to keep patched.

import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, saltB64, hashB64] = String(stored ?? "").split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(actual, expected);
}

// The token goes to the client once; only its SHA-256 is stored, so a leaked
// database can't be used to log in as anyone.
export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function validateDisplayName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 20) return { ok: false, error: "name_length" };
  if (!/^[\p{L}\p{N} _-]+$/u.test(name)) return { ok: false, error: "name_characters" };
  return { ok: true, value: name };
}

export function validateUsername(value) {
  const username = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { ok: false, error: "username_format" };
  return { ok: true, value: username };
}

export function validatePassword(value) {
  if (typeof value !== "string" || value.length < 8) return { ok: false, error: "password_too_short" };
  if (value.length > 200) return { ok: false, error: "password_too_long" };
  return { ok: true, value };
}
