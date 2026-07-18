#!/usr/bin/env node
/* BEAT DANCE multiplayer server — a dumb relay + clock for one 2-player room.
 * Host runs `npm start`; both players open http://<lan-or-tailscale-ip>:8123 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 8123;
const MAX_SONG_BYTES = 120 * 1024 * 1024;

let song = null; // { data: Buffer, mime: string, name: string }
const players = [null, null]; // ws slots

const send = (ws, obj) => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
};
const other = slot => players[1 - slot];
const roomMsg = () => ({
  type: "room",
  players: players.map(p => (p ? { name: p._name, ready: !!p._ready, diff: p._diff || null } : null)),
});
const broadcastRoom = () => players.forEach(p => send(p, roomMsg()));

function maybeStart() {
  if (players.every(p => p && p._ready)) {
    const at = Date.now() + 3000;
    players.forEach(p => {
      send(p, { type: "start", serverTime: at });
      p._ready = false;
      p._diff = null;
    });
    broadcastRoom();
  }
}

function networkAddresses() {
  const addrs = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === "IPv4" && !n.internal) addrs.push(n.address);
    }
  }
  return addrs;
}

/* ---------------- HTTP: static files + song relay ---------------- */
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (req.method === "GET" && url === "/info") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ port: PORT, addrs: networkAddresses() }));
    return;
  }
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    fs.readFile(path.join(__dirname, "index.html"), (err, data) => {
      if (err) { res.writeHead(500); res.end("cannot read index.html"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(data);
    });
    return;
  }
  if (req.method === "PUT" && url === "/song") {
    const chunks = [];
    let size = 0, aborted = false;
    req.on("data", c => {
      size += c.length;
      if (size > MAX_SONG_BYTES) {
        aborted = true;
        res.writeHead(413); res.end("song too large");
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      song = {
        data: Buffer.concat(chunks),
        mime: req.headers["content-type"] || "application/octet-stream",
        name: decodeURIComponent(req.headers["x-song-name"] || "song"),
      };
      res.writeHead(200); res.end("ok");
    });
    return;
  }
  if (req.method === "GET" && url === "/song") {
    if (!song) { res.writeHead(404); res.end("no song"); return; }
    res.writeHead(200, { "Content-Type": song.mime, "Content-Length": song.data.length, "Cache-Control": "no-store" });
    res.end(song.data);
    return;
  }
  res.writeHead(404); res.end("not found");
});

/* ---------------- WebSocket room ---------------- */
const wss = new WebSocket.Server({ server, path: "/ws" });
wss.on("connection", ws => {
  const slot = players.indexOf(null);
  if (slot === -1) {
    send(ws, { type: "room-full" });
    ws.close();
    return;
  }
  players[slot] = ws;
  ws._slot = slot;
  ws._name = "Player " + (slot + 1);
  ws._ready = false;
  ws._diff = null;
  send(ws, { type: "welcome", slot });
  broadcastRoom();

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    switch (msg.type) {
      case "ping":
        send(ws, { type: "pong", t0: msg.t0, serverTime: Date.now() });
        break;
      case "hello":
        ws._name = String(msg.name || "").slice(0, 24) || ws._name;
        broadcastRoom();
        break;
      case "pickDiff":
        ws._diff = String(msg.diff || "") || null;
        ws._ready = false;
        broadcastRoom();
        break;
      case "ready":
        ws._diff = String(msg.diff || "") || ws._diff;
        ws._ready = true;
        broadcastRoom();
        maybeStart();
        break;
      case "unready":
        ws._ready = false;
        broadcastRoom();
        break;
      default:
        // songMeta, judge, hold, finish, quit, … — relay verbatim to the peer
        send(other(slot), msg);
    }
  });

  ws.on("close", () => {
    players[slot] = null;
    const peer = other(slot);
    if (peer) { peer._ready = false; send(peer, { type: "opp-left" }); }
    if (!players[0] && !players[1]) song = null; // empty room: drop the song
    broadcastRoom();
  });
  ws.on("error", () => { /* close handler does the cleanup */ });
});

server.listen(PORT, () => {
  console.log(`BEAT DANCE server on port ${PORT}`);
  console.log(`  local:   http://localhost:${PORT}`);
  for (const a of networkAddresses()) console.log(`  network: http://${a}:${PORT}`);
  console.log("Share a network URL (LAN or Tailscale IP) with your opponent.");
});
