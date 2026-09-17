// A tiny event emitter for the browser (Node's EventEmitter isn't available there).

export class Emitter {
  constructor() {
    this._listeners = new Map();
  }

  on(type, listener) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(listener);
    return () => this.off(type, listener);
  }

  off(type, listener) {
    this._listeners.get(type)?.delete(listener);
  }

  emit(type, payload) {
    for (const listener of this._listeners.get(type) ?? []) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`listener for "${type}" failed`, err);
      }
    }
  }
}

// Thrown by session methods; `code` is the machine-readable reason
// ("mob_gone", "not_signed_in", ...) the UI can switch on.
export class SessionError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
