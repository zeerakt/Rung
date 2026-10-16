#!/usr/bin/env node
/**
 * Royal Rung (Court Piece) — Zero-Dependency Node.js Multiplayer Server for Oracle Cloud VM
 *
 * Features:
 *  - Uses only built-in Node.js modules (`node:http`, `node:crypto`, `node:fs`, `node:path`)
 *    so it runs immediately on any Oracle Cloud Ubuntu/Oracle Linux VM with Node 20+!
 *  - Implements RFC 6455 WebSocket handshake & framing natively + REST health/room endpoints
 *  - Authoritative server-side deck shuffle & Fog-of-War state redaction (anti-cheat)
 *  - Supports 1–4 human players per room with automatic Master Bot AI filling empty/disconnected seats
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RungRoomManager } from './roomManager.mjs';
import { SEATS } from '../src/engine/rungEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const manager = new RungRoomManager();
// Map of roomCode -> Set of client objects { socket, seat, playerName, token }
const roomClients = new Map();

/**
 * RFC 6455 WebSocket Frame Encoder (Server -> Client unmasked text frame)
 */
function encodeWsFrame(dataObj) {
  const json = typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj);
  const payload = Buffer.from(json, 'utf8');
  const len = payload.length;

  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + Text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/**
 * RFC 6455 WebSocket Frame Decoder (Client -> Server masked frame)
 */
function decodeWsFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const byte0 = buffer[offset];
    const byte1 = buffer[offset + 1];
    const opcode = byte0 & 0x0f;
    const isMasked = (byte1 & 0x80) !== 0;
    let payloadLen = byte1 & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }

    const maskLen = isMasked ? 4 : 0;
    const totalFrameLen = headerLen + maskLen + payloadLen;
    if (offset + totalFrameLen > buffer.length) break;

    if (opcode === 0x8) {
      // Connection close frame
      messages.push({ type: '__CLOSE__' });
      offset += totalFrameLen;
      break;
    }

    if (opcode === 0x9) {
      // Ping frame
      messages.push({ type: '__PING__' });
      offset += totalFrameLen;
      continue;
    }

    if (opcode === 0x1) {
      const payloadStart = offset + headerLen + maskLen;
      const payload = Buffer.alloc(payloadLen);
      if (isMasked) {
        const maskKey = buffer.subarray(offset + headerLen, offset + headerLen + 4);
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = buffer[payloadStart + i] ^ maskKey[i % 4];
        }
      } else {
        buffer.copy(payload, 0, payloadStart, payloadStart + payloadLen);
      }
      try {
        messages.push(JSON.parse(payload.toString('utf8')));
      } catch (e) {
        // Ignore malformed JSON
      }
    }
    offset += totalFrameLen;
  }

  return { messages, remaining: buffer.subarray(offset) };
}

function sendWs(socket, payload) {
  if (socket && !socket.destroyed && socket.writable) {
    socket.write(encodeWsFrame(payload));
  }
}

function broadcastRoomState(roomCode) {
  const payloads = manager.getRedactedPayloads(roomCode);
  const clients = roomClients.get(roomCode);
  if (!payloads || !clients) return;

  for (const client of clients) {
    const view = payloads[client.seat] || payloads.south;
    sendWs(client.socket, {
      type: 'ROOM_STATE',
      roomCode,
      seat: client.seat,
      token: client.token,
      state: view
    });
  }
}

function scheduleBotLoop(roomCode) {
  setTimeout(() => {
    const room = manager.getRoom(roomCode);
    if (!room) return;
    const res = manager.stepBotIfNeeded(roomCode);
    if (res) {
      broadcastRoomState(roomCode);
      scheduleBotLoop(roomCode);
    }
  }, 650);
}

const server = http.createServer((req, res) => {
  // CORS headers for GitHub Pages frontend -> Oracle VM backend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health' || url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'royal-rung-multiplayer',
        activeRooms: manager.rooms.size,
        uptimeSeconds: Math.round(process.uptime())
      })
    );
    return;
  }

  // Serve static index.html so the Oracle VM can also host the game directly if desired
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const indexPath = path.join(ROOT_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(indexPath));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n'
    ].join('\r\n')
  );

  let rxBuffer = Buffer.alloc(0);
  let clientRef = { socket, roomCode: null, seat: null, token: null };

  socket.on('data', chunk => {
    rxBuffer = Buffer.concat([rxBuffer, chunk]);
    const { messages, remaining } = decodeWsFrames(rxBuffer);
    rxBuffer = remaining;

    for (const msg of messages) {
      if (msg.type === '__CLOSE__') {
        socket.end();
        return;
      }
      if (msg.type === '__PING__') {
        socket.write(Buffer.from([0x8a, 0x00])); // Pong
        continue;
      }

      try {
        if (msg.type === 'CREATE_ROOM') {
          const { room, hostSeat, hostToken } = manager.createRoom({
            roomCode: msg.roomCode,
            variant: msg.variant || 'SINGLE_SAR',
            botDifficulty: msg.botDifficulty || 'master',
            hostName: msg.playerName || 'Host (South)',
            hostSeat: msg.preferredSeat || 'south'
          });
          clientRef.roomCode = room.roomCode;
          clientRef.seat = hostSeat;
          clientRef.token = hostToken;

          if (!roomClients.has(room.roomCode)) roomClients.set(room.roomCode, new Set());
          roomClients.get(room.roomCode).add(clientRef);

          broadcastRoomState(room.roomCode);
          scheduleBotLoop(room.roomCode);
        } else if (msg.type === 'JOIN_ROOM') {
          const { room, seat, token } = manager.joinRoom({
            roomCode: msg.roomCode,
            playerName: msg.playerName || 'Player',
            preferredSeat: msg.preferredSeat || null,
            reconnectToken: msg.token || null
          });
          clientRef.roomCode = room.roomCode;
          clientRef.seat = seat;
          clientRef.token = token;

          if (!roomClients.has(room.roomCode)) roomClients.set(room.roomCode, new Set());
          roomClients.get(room.roomCode).add(clientRef);

          broadcastRoomState(room.roomCode);
          scheduleBotLoop(room.roomCode);
        } else if (
          ['SELECT_TRUMP', 'REVEAL_HIDDEN_RUNG', 'PLAY_CARD', 'NEXT_HAND'].includes(msg.type)
        ) {
          if (!clientRef.roomCode || !clientRef.seat) {
            throw new Error('Join or create a room first');
          }
          manager.handleAction(clientRef.roomCode, clientRef.seat, msg);
          broadcastRoomState(clientRef.roomCode);
          scheduleBotLoop(clientRef.roomCode);
        }
      } catch (err) {
        sendWs(socket, { type: 'ERROR', message: err.message });
      }
    }
  });

  const cleanup = () => {
    if (clientRef.roomCode && roomClients.has(clientRef.roomCode)) {
      roomClients.get(clientRef.roomCode).delete(clientRef);
      const room = manager.getRoom(clientRef.roomCode);
      if (room && clientRef.seat && room.seats[clientRef.seat]) {
        room.seats[clientRef.seat].connected = false;
        broadcastRoomState(clientRef.roomCode);
      }
    }
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  server.listen(PORT, HOST, () => {
    console.log(`♠ Royal Rung Multiplayer Server listening on ws://${HOST}:${PORT}`);
  });
}

export { server, manager };
