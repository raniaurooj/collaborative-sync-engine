import * as Y from "yjs";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from "y-protocols/awareness";

const MSG_DOC = 0;
const MSG_AWARENESS = 1;
const MSG_STATE_VECTOR = 2;
const MAX_RECONNECT_DELAY = 15000;
const BASE_RECONNECT_DELAY = 500;

function withType(type, bytes) {
  const buf = new Uint8Array(bytes.length + 1);
  buf[0] = type;
  buf.set(bytes, 1);
  return buf;
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function randomColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export class YjsWebsocketProvider {
  constructor(doc, roomId, serverUrl = "ws://localhost:4000") {
    this.doc = doc;
    this.roomId = roomId;
    this.serverUrl = serverUrl;
    this.ws = null;
    this.isApplyingRemoteUpdate = false;
    this.onStatusChange = null;

    this.awareness = new Awareness(doc);

    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.intentionalClose = false;

    this._handleLocalUpdate = this._handleLocalUpdate.bind(this);
    this._handleAwarenessUpdate = this._handleAwarenessUpdate.bind(this);
  }

  async connect() {
    this.intentionalClose = false;
    await this._openSocket();
    this.doc.on("update", this._handleLocalUpdate);
    this.awareness.on("update", this._handleAwarenessUpdate);
  }

  async _openSocket() {
    const authRes = await fetch(`${this._httpBase()}/auth/guest`);
    const { token, name } = await authRes.json();

    this._setStatus(
      this.reconnectAttempt > 0 ? `reconnecting as ${name}...` : `authenticating as ${name}`
    );
    this.userName = name;

    this.ws = new WebSocket(this.serverUrl);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      const stateVector = Y.encodeStateVector(this.doc);
      this.ws.send(
        JSON.stringify({
          type: "auth",
          token,
          roomId: this.roomId,
          stateVector: toBase64(stateVector),
        })
      );
      this._setStatus(`connected as ${name}`);
      this.reconnectAttempt = 0;

      this.awareness.setLocalStateField("user", { name, color: randomColor(name) });
    };

    this.ws.onclose = (event) => {
      this._setStatus(`disconnected (${event.reason || "unknown"})`);
      if (!this.intentionalClose) this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._setStatus("connection error");
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === "string") return;

      const bytes = new Uint8Array(event.data);
      const type = bytes[0];
      const payload = bytes.subarray(1);

      if (type === MSG_DOC) {
        this.isApplyingRemoteUpdate = true;
        Y.applyUpdate(this.doc, payload);
        this.isApplyingRemoteUpdate = false;
      } else if (type === MSG_AWARENESS) {
        applyAwarenessUpdate(this.awareness, payload, this);
      } else if (type === MSG_STATE_VECTOR) {
        const diff = Y.encodeStateAsUpdate(this.doc, payload);
        if (diff.length > 2) { // trivial empty-diff guard, avoid a no-op send
          this.ws.send(withType(MSG_DOC, diff));
        }
      }
    };
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      BASE_RECONNECT_DELAY * 2 ** this.reconnectAttempt,
      MAX_RECONNECT_DELAY
    );
    const jitter = delay * 0.2 * Math.random();
    this.reconnectAttempt += 1;

    this._setStatus(`reconnecting in ${Math.round((delay + jitter) / 1000)}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._openSocket().catch(() => {
        this._scheduleReconnect();
      });
    }, delay + jitter);
  }

  _handleLocalUpdate(update) {
    if (this.isApplyingRemoteUpdate) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(withType(MSG_DOC, update));
    }
  }

  _handleAwarenessUpdate({ added, updated, removed }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const changedClients = added.concat(updated, removed);
    const update = encodeAwarenessUpdate(this.awareness, changedClients);
    this.ws.send(withType(MSG_AWARENESS, update));
  }

  _httpBase() {
    return this.serverUrl.replace(/^ws/, "http");
  }

  _setStatus(status) {
    this.status = status;
    if (this.onStatusChange) this.onStatusChange(status);
  }

  destroy() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.doc.off("update", this._handleLocalUpdate);
    this.awareness.off("update", this._handleAwarenessUpdate);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const update = encodeAwarenessUpdate(this.awareness, [this.doc.clientID], new Map());
      this.ws.send(withType(MSG_AWARENESS, update));
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}