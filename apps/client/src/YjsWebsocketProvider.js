import * as Y from "yjs";

export class YjsWebsocketProvider {
  constructor(doc, roomId, serverUrl = "ws://localhost:4000") {
    this.doc = doc;
    this.roomId = roomId;
    this.serverUrl = serverUrl;
    this.ws = null;
    this.isApplyingRemoteUpdate = false;
    this.onStatusChange = null; 
    this._handleLocalUpdate = this._handleLocalUpdate.bind(this);
  }

  async connect() {
    const authRes = await fetch(`${this._httpBase()}/auth/guest`);
    const { token, name } = await authRes.json();

    this._setStatus(`authenticating as ${name}`);

    this.ws = new WebSocket(this.serverUrl);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ type: "auth", token, roomId: this.roomId }));
      this._setStatus(`connected as ${name}`);
      this.userName = name;
    };

    this.ws.onclose = (event) => {
      this._setStatus(`disconnected (${event.reason || "unknown"})`);
    };

    this.ws.onerror = () => {
      this._setStatus("connection error");
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === "string") return; 

      const update = new Uint8Array(event.data);
      this.isApplyingRemoteUpdate = true;
      Y.applyUpdate(this.doc, update);
      this.isApplyingRemoteUpdate = false;
    };

    this.doc.on("update", this._handleLocalUpdate);
  }

  _handleLocalUpdate(update) {
    if (this.isApplyingRemoteUpdate) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(update);
    }
  }

  _httpBase() {
    return this.serverUrl.replace(/^ws/, "http");
  }

  _setStatus(status) {
    this.status = status;
    if (this.onStatusChange) this.onStatusChange(status);
  }

  destroy() {
    this.doc.off("update", this._handleLocalUpdate);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}