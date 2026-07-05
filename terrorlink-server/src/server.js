
const fs = require('fs');
const path = require('path');
const os = require('os');

let SERVER_VERSION = '0.0.0';
try {
  SERVER_VERSION = String((require('./package.json') || {}).version || '0.0.0');
} catch (e) {}
const VERSION_MISMATCH_MESSAGE = 'Terror Link versions not compatible. Try updating your Terror Link';

const logDir = path.join(os.homedir(), 'TerrorLink Logs');
try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); } catch (e) {}
const logFile = path.join(logDir, 'server-errors.log');

function logError(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try { fs.appendFileSync(logFile, line); } catch (e) {}
  console.error(line.trim());
}

process.on('uncaughtException', (err) => {
  logError('[UNCAUGHT EXCEPTION] ' + (err && err.stack ? err.stack : err));
});
process.on('unhandledRejection', (reason, promise) => {
  logError('[UNHANDLED REJECTION] ' + (reason && reason.stack ? reason.stack : reason));
});

let express;
let WebSocket;
let cors;
let bodyParser;
let uuidv4;
try {
  express = require('express');
} catch (err) {
  console.error('\nMissing dependency: express');
  console.error('Please run "npm install" in the server folder to install dependencies.');
  console.error('Example (PowerShell):');
  console.error('  cd "C:\\path\\to\\terrorlink-server"');
  console.error('  npm install');
  console.error('');
  process.exit(1);
}
const http = require('http');
try { WebSocket = require('ws'); } catch (err) { console.error('\nMissing dependency: ws'); console.error('Please run "npm install" in the server folder'); process.exit(1); }
try { cors = require('cors'); } catch (err) { console.error('\nMissing dependency: cors'); console.error('Please run "npm install" in the server folder'); process.exit(1); }
try { bodyParser = require('body-parser'); } catch (err) { console.error('\nMissing dependency: body-parser'); console.error('Please run "npm install" in the server folder'); process.exit(1); }
try { ({ v4: uuidv4 } = require('uuid')); } catch (err) { console.error('\nMissing dependency: uuid'); console.error('Please run "npm install" in the server folder'); process.exit(1); }


let leoProfanity = null;
try {
  leoProfanity = require('leo-profanity');
  if (leoProfanity && typeof leoProfanity.clean === 'function') {
  }
} catch (err) {
  leoProfanity = null;
}

const MAX_USERNAME_LENGTH = 15;
const MAX_TEXT_LENGTH = 4000;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; 
const MAX_HISTORY = 500;
const MAX_CLIENT_ID = 80;
const MAX_REPLY_PREVIEW = 160;
const MAX_TOTAL_CONNECTIONS = 300;
const MAX_CONNECTIONS_PER_IP = 1;
const MAX_WS_MESSAGES_PER_10S = 120;
const MAX_API_POSTS_PER_MIN = 120;
const MAX_RAW_MESSAGE_BYTES = 24 * 1024 * 1024;
const eightBallAnswers = [
  'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes -- definitely.', 'You may rely on it.',
  'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.',
  'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
  "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'
];

const hostSettings = {
  allowEmbeds: true,
  allowAttachments: true,
  chatFilter: false,
  e2ee: false
};

function pickEightBallAnswer() {
  if (!eightBallAnswers.length) return 'Reply hazy, try again.';
  const idx = Math.floor(Math.random() * eightBallAnswers.length);
  return eightBallAnswers[idx] || 'Reply hazy, try again.';
}

function formatAfkDuration(since) {
  const ms = Date.now() - (since || 0);
  if (ms < 0) return '';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function filterProfanity(text) {
  if (!hostSettings.chatFilter) return text;
  if (!leoProfanity) {
    try {
      leoProfanity = require('leo-profanity');
      console.log('TerrorLink Chat - Loaded leo-profanity for filtering');
    } catch (e) {
      console.warn('TerrorLink Chat - Failed to load leo-profanity:', e.message);
      return text;
    }
  }
  try {
    if (typeof leoProfanity.clean === 'function') {
      const filtered = leoProfanity.clean(text, '█');
      if (filtered !== text) {
        console.log('TerrorLink Chat - Filtered profanity in message');
      }
      return filtered;
    }
    return text;
  } catch (e) {
    console.warn('TerrorLink Chat - Filter error:', e.message);
    return text;
  }
}

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: 'http://127.0.0.1:8080' }));
app.use(bodyParser.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  maxPayload: 25 * 1024 * 1024,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024
  }
});
const BROADCAST_CHUNK_SIZE = 8;
const defer = typeof setImmediate === 'function' ? setImmediate : (fn) => setTimeout(fn, 0);

// Server-side heartbeat: ping all clients every 30s, terminate zombies that don't respond
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, 30000);

const clientsByName = new Map();
const clientsByIp = new Map();
const apiRateByIp = new Map();
const abuseStatsByUser = new Map();
const abuseStatsByIp = new Map();
const afkUsers = new Map();
const mentionRegex = /(^|[^A-Za-z0-9@])@([a-z0-9_][a-z0-9_\-]{0,31})(?=$|[^A-Za-z0-9@])/gi;
const history = [];
const pinnedMessageIds = new Set();
const broadcastQueue = [];
let broadcastScheduled = false;
const polls = new Map();
const e2eePubKeys = new Map();

function serializePoll(poll) {
  if (!poll || typeof poll !== 'object') return null;
  return {
    id: poll.id,
    from: poll.from,
    question: poll.question,
    options: Array.isArray(poll.options) ? poll.options.map(o => ({ text: o.text, votes: Number(o.votes) || 0 })) : []
  };
}

function clampText(text = '') {
  return String(text).slice(0, MAX_TEXT_LENGTH);
}

function sanitizeUsername(name = '') {
  return String(name).trim().slice(0, MAX_USERNAME_LENGTH);
}

function pushHistory(entry, category = 'message') {
  entry.category = category;
  if (entry && entry.id && pinnedMessageIds.has(entry.id)) {
    entry.pinned = true;
  }
  history.push(entry);
  while (history.length > MAX_HISTORY) {
    const removed = history.shift();
    if (removed && removed.id) pinnedMessageIds.delete(removed.id);
  }
  broadcast({ type: category, data: entry });
}

function makeEntry({ id, from, text = '', attachment = null, kind = 'text', clientId, replyTo = null }) {
  const entryId = (typeof id === 'string' && id.trim()) ? id.slice(0, MAX_CLIENT_ID) : uuidv4();
  const entry = {
    id: entryId,
    kind,
    from,
    text,
    attachment: attachment || undefined,
    ts: Date.now()
  };
  if (clientId && typeof clientId === 'string') {
    entry.clientId = clientId.slice(0, MAX_CLIENT_ID);
  }
  if (replyTo) {
    entry.replyTo = replyTo;
  }
  return entry;
}

function makeSystemEntry(username, status) {
  return {
    id: uuidv4(),
    kind: 'system',
    from: 'system',
    text: `${username} ${status === 'online' ? 'connected' : 'disconnected'}`,
    system: { user: username, status },
    ts: Date.now()
  };
}

function normalizeAttachment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '').toLowerCase();
  if (!['image', 'gif', 'file'].includes(kind)) return null;

  const attachment = { kind };
  if (raw.name) attachment.name = String(raw.name).slice(0, 80);

  if (raw.url) {
    const url = String(raw.url).trim();
    if (!/^https?:\/\//i.test(url)) return null;
    attachment.url = url.slice(0, 1024);
    return attachment;
  }

  if (typeof raw.data === 'string') {
    const data = raw.data.trim();
    if (!data.startsWith('data:')) return null;
    const bytes = Buffer.byteLength(data, 'utf8');
    if (bytes > MAX_ATTACHMENT_BYTES) return null;
    attachment.data = data;
    if (raw.mime && typeof raw.mime === 'string') {
      attachment.mime = raw.mime.slice(0, 120);
    }
    return attachment;
  }

  return null;
}

function normalizeReplyTo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const reply = {};
  if (raw.id && typeof raw.id === 'string') reply.id = raw.id.slice(0, MAX_CLIENT_ID);
  if (!reply.id) return null;
  if (raw.from && typeof raw.from === 'string') reply.from = sanitizeUsername(raw.from) || raw.from.trim().slice(0, MAX_USERNAME_LENGTH);
  if (raw.text && typeof raw.text === 'string') reply.text = clampText(raw.text).slice(0, MAX_REPLY_PREVIEW);
  return reply;
}

function sendTo(ws, payload) {
  try { ws.send(JSON.stringify(payload)); } catch (e) {}
}

function getClientIp(req) {
  const fwd = req && req.headers ? req.headers['x-forwarded-for'] : '';
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  const remote = req && req.socket ? req.socket.remoteAddress : '';
  return String(remote || 'unknown');
}

function isRateLimited(map, key, limit, windowMs) {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    map.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function decrementIpConnection(ip) {
  const current = clientsByIp.get(ip) || 0;
  if (current <= 1) clientsByIp.delete(ip);
  else clientsByIp.set(ip, current - 1);
}

function bumpCounter(map, key) {
  const k = String(key || 'unknown');
  const next = (map.get(k) || 0) + 1;
  map.set(k, next);
  return next;
}

function logAbuseEvent(kind, data = {}) {
  const ip = data.ip || 'unknown';
  const username = data.username || 'unknown';
  const detail = data.detail || 'n/a';
  const userHits = bumpCounter(abuseStatsByUser, username);
  const ipHits = bumpCounter(abuseStatsByIp, ip);
  const alertPill = '\x1b[30;103m ABUSE ALERT \x1b[0m';
  const kindPill = '\x1b[30;106m PAYLOAD WATCH \x1b[0m';
  const actionPill = '\x1b[30;102m MOD ACTION \x1b[0m';
  console.log(`${alertPill} ${kindPill} kind=${kind} user=${username} ip=${ip} detail=${detail} userHits=${userHits} ipHits=${ipHits}`);
  if (username && username !== 'unknown' && username !== '(pre-auth)') {
    console.log(`${actionPill} Kick candidate: ${username} (Host panel -> Connected Users)`);
  }
}

function broadcast(payload) {
  broadcastQueue.push(payload);
  if (!broadcastScheduled) {
    broadcastScheduled = true;
    defer(flushBroadcastQueue);
  }
}

function flushBroadcastQueue() {
  broadcastScheduled = false;
  if (!broadcastQueue.length) return;
  const chunk = broadcastQueue.splice(0, BROADCAST_CHUNK_SIZE);
  chunk.forEach((payload) => {
    const raw = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(raw); } catch (e) {}
      }
    });
  });
  if (broadcastQueue.length) {
    broadcastScheduled = true;
    defer(flushBroadcastQueue);
  }
}

function sendUserListToParent() {
  if (typeof process.send === 'function') {
    const users = Array.from(clientsByName.keys());
    try {
      process.send({ type: 'host-users', users });
    } catch (e) {
    }
  }
}

wss.on('connection', function connection(ws, req) {
  ws.isAlive = true;
  ws.__lastSeen = Date.now();
  ws.on('pong', () => { ws.isAlive = true; ws.__lastSeen = Date.now(); });

  if (wss.clients.size > MAX_TOTAL_CONNECTIONS) {
    logAbuseEvent('connection-cap', {
      username: '(pre-auth)',
      ip: getClientIp(req),
      detail: `total=${wss.clients.size}/${MAX_TOTAL_CONNECTIONS}`
    });
    try { ws.close(1013, 'server busy'); } catch (e) {}
    return;
  }

  const clientIp = getClientIp(req);
  // Clean up zombie connections from this IP before checking the limit
  let aliveFromIp = 0;
  wss.clients.forEach((client) => {
    if (client.__clientIp === clientIp && client !== ws) {
      if (client.isAlive === false || client.readyState !== WebSocket.OPEN || (client.__lastSeen && Date.now() - client.__lastSeen > 90000)) {
        try { client.terminate(); } catch (e) {}
      } else {
        aliveFromIp++;
      }
    }
  });
  if (aliveFromIp >= MAX_CONNECTIONS_PER_IP) {
    logAbuseEvent('ip-connection-cap', {
      username: '(pre-auth)',
      ip: clientIp,
      detail: `perIp=${aliveFromIp}/${MAX_CONNECTIONS_PER_IP}`
    });
    sendTo(ws, { type: 'error', message: 'Only one active user per network is allowed on this server.' });
    try { ws.close(1008, 'ip limit'); } catch (e) {}
    return;
  }
  clientsByIp.set(clientIp, (clientsByIp.get(clientIp) || 0) + 1);
  ws.__clientIp = clientIp;
  ws.__messageRate = { startedAt: Date.now(), count: 0 };

  const params = new URLSearchParams(req.url.replace(/^.*\?/, ''));
  const requestedUsername = (params.get('username') || '').trim();
  const clientVersion = String((params.get('version') || '')).trim();
  const username = sanitizeUsername(requestedUsername);

  ws.on('close', (code, reason) => {
    decrementIpConnection(ws.__clientIp || 'unknown');
    const storedWs = clientsByName.get(username);
    if (storedWs !== ws) return;
    clientsByName.delete(username);
    const reasonStr = reason ? reason.toString() : '';
    const closeCodeDescriptions = {
      1000: "Normal closure (client or server intentionally closed)",
      1001: "Going away (page navigation, server shutdown, or browser tab closed)",
      1002: "Protocol error (malformed frame or protocol violation)",
      1003: "Unsupported data (received data type the endpoint cannot handle)",
      1005: "No status code present (connection closed without a code)",
      1006: "Abnormal closure (connection dropped without close handshake -- network issue, crash, or timeout)",
      1007: "Invalid payload data (message data was not consistent with its type)",
      1008: "Policy violation (message violated server policy)",
      1009: "Message too big (payload exceeded the maximum allowed size)",
      1010: "Missing extension (client expected a server extension that was not negotiated)",
      1011: "Internal error (server encountered an unexpected condition)",
      1012: "Service restart (server is restarting)",
      1013: "Try again later (server is temporarily unavailable)",
      1014: "Bad gateway (server acting as gateway received invalid response)",
      1015: "TLS handshake failure (SSL/TLS handshake failed)"
    };
    const codeDescription = closeCodeDescriptions[code] || "Unknown close code";
    const possibleReasons = [];
    if (code === 1006) {
      possibleReasons.push("Client lost internet connectivity");
      possibleReasons.push("Client app was force-closed or crashed");
      possibleReasons.push("Network timeout (no ping/pong response)");
      possibleReasons.push("Firewall or proxy terminated the connection");
      possibleReasons.push("Cloudflare or tunnel dropped the WebSocket");
    } else if (code === 1000) {
      possibleReasons.push("Client clicked disconnect");
      possibleReasons.push("Server initiated a clean shutdown");
      possibleReasons.push("Client navigated away or closed the window");
    } else if (code === 1001) {
      possibleReasons.push("Client browser/tab is closing");
      possibleReasons.push("Server is shutting down gracefully");
    } else if (code === 1002 || code === 1003) {
      possibleReasons.push("Cloudflare error page (502/503/530) replaced the WebSocket");
      possibleReasons.push("Incompatible proxy or middleware modified the connection");
    } else if (code === 1009) {
      possibleReasons.push("Client sent an attachment or message exceeding the size limit");
    } else if (code === 1011) {
      possibleReasons.push("Server-side exception during message processing");
    }
    console.log(`[DISCONNECT DEBUG] User: ${username} | Code: ${code} | Description: ${codeDescription}${reasonStr ? ' | Reason: ' + reasonStr : ''} | Area: server.js > wss.on(\"connection\") > ws.on(\"close\")`);
    if (possibleReasons.length > 0) {
      console.log(`[DISCONNECT DEBUG] Possible causes for ${username}: ${possibleReasons.join('; ')}`);
    }
    afkUsers.delete(username.toLowerCase());
    e2eePubKeys.delete(username);
    if (hostSettings.e2ee) {
      broadcast({ type: 'e2ee-pubkey', username, pubkey: null });
    }
    const systemOffline = makeSystemEntry(username, "offline");
    pushHistory(systemOffline, "system");
    broadcast({ type: "presence", data: { user: username, status: "offline" } });
    sendUserListToParent();
  });

  ws.on('error', (err) => {
    console.warn(`[DISCONNECT DEBUG] WebSocket error for ${username} (often precedes a close event) | Error: ${err && err.message ? err.message : err} | Area: server.js > wss.on(\"connection\") > ws.on(\"error\")`);
  });

  if (!username) {
    sendTo(ws, { type: 'error', message: 'Missing username query parameter' });
    ws.close();
    return;
  }
  if (requestedUsername.length > MAX_USERNAME_LENGTH) {
    sendTo(ws, { type: 'error', message: `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.` });
    ws.close();
    return;
  }
  if (!clientVersion || clientVersion !== SERVER_VERSION) {
    sendTo(ws, { type: 'error', message: VERSION_MISMATCH_MESSAGE });
    ws.close();
    return;
  }

  const prev = clientsByName.get(username);
  if (prev) {
    if (prev.readyState !== WebSocket.OPEN || prev.isAlive === false || (prev.__lastSeen && Date.now() - prev.__lastSeen > 90000)) {
      try { prev.terminate(); } catch (e) {}
      clientsByName.delete(username);
    } else {
      sendTo(ws, { type: 'error', message: 'Same user already exists within this server.' });
      ws.close();
      return;
    }
  }
  
  const usernameLower = username.toLowerCase();
  for (const [existingName, existingWs] of clientsByName.entries()) {
    if (existingName.toLowerCase() === usernameLower) {
      if (existingWs.readyState !== WebSocket.OPEN || existingWs.isAlive === false || (existingWs.__lastSeen && Date.now() - existingWs.__lastSeen > 90000)) {
        try { existingWs.terminate(); } catch (e) {}
        clientsByName.delete(existingName);
      } else {
        sendTo(ws, { type: 'error', message: 'Same user already exists within this server.' });
        ws.close();
        return;
      }
    }
  }

  clientsByName.set(username, ws);
  console.log(`TerrorLink Chat - Connected: ${username}`);
  
  setTimeout(sendUserListToParent, 100);

  sendTo(ws, ({ type: 'server-version', version: SERVER_VERSION }));
  const recent = history.slice(-MAX_HISTORY).map((entry) => {
    if (!entry || !entry.id) return entry;
    if (pinnedMessageIds.has(entry.id)) {
      return { ...entry, pinned: true };
    }
    if (entry.pinned) {
      const clone = { ...entry };
      delete clone.pinned;
      return clone;
    }
    return entry;
  });
  sendTo(ws, ({ type: 'history', data: recent }));
  
  sendTo(ws, ({ type: 'host-settings', data: hostSettings }));

  const systemOnline = makeSystemEntry(username, 'online');
  pushHistory(systemOnline, 'system');
  broadcast({ type: 'presence', data: { user: username, status: 'online' } });

  ws.on('message', function incoming(raw) {
    ws.__lastSeen = Date.now();
    const rawStr = typeof raw === 'string' ? raw : (raw && raw.toString ? raw.toString('utf8') : '');
    if (Buffer.byteLength(rawStr, 'utf8') > MAX_RAW_MESSAGE_BYTES) {
      logAbuseEvent('ws-oversized-payload', {
        username,
        ip: ws.__clientIp || 'unknown',
        detail: `bytes=${Buffer.byteLength(rawStr, 'utf8')} limit=${MAX_RAW_MESSAGE_BYTES}`
      });
      sendTo(ws, { type: 'error', message: 'Message too large.' });
      try { ws.close(1009, 'too large'); } catch (e) {}
      return;
    }
    const now = Date.now();
    const msgRate = ws.__messageRate || { startedAt: now, count: 0 };
    if (now - msgRate.startedAt >= 10 * 1000) {
      msgRate.startedAt = now;
      msgRate.count = 0;
    }
    msgRate.count += 1;
    ws.__messageRate = msgRate;
    if (msgRate.count > MAX_WS_MESSAGES_PER_10S) {
      logAbuseEvent('ws-rate-limit', {
        username,
        ip: ws.__clientIp || 'unknown',
        detail: `count=${msgRate.count} windowMs=10000 limit=${MAX_WS_MESSAGES_PER_10S}`
      });
      sendTo(ws, { type: 'error', message: 'Too many messages too quickly.' });
      return;
    }
    try {
      const msg = JSON.parse(rawStr);
      const msgType = (msg && msg.type) ? String(msg.type) : '';
      const clientId = typeof msg.clientId === 'string' ? msg.clientId.slice(0, MAX_CLIENT_ID) : undefined;
      if (typeof msg.text === 'string' && (msg.text.startsWith('@@RR-UPDATE@@') || msg.text.startsWith('@@RR-RESULT@@'))) {
        console.log(`[RR:server] \u2192 ${username} (msgType=${msgType}) payload=`, msg.text.slice(0, 180));
      }
      if (msgType === 'afk') {
        const status = String(msg.status || '').toLowerCase();
        if (status === 'on') {
          const rawReason = clampText(msg.reason || '').trim();
          const reason = rawReason ? filterProfanity(rawReason) : '';
          afkUsers.set(username.toLowerCase(), { since: Date.now(), reason });
          const systemText = reason ? `${username} is now AFK: ${reason}` : `${username} is now AFK`;
          const systemEntry = makeEntry({ from: 'system', text: systemText, kind: 'text' });
          pushHistory(systemEntry, 'system');
        } else if (status === 'off') {
          afkUsers.delete(username.toLowerCase());
          const systemEntry = makeEntry({ from: 'system', text: `${username} is no longer AFK`, kind: 'text' });
          pushHistory(systemEntry, 'system');
        } else {
          sendTo(ws, { type: 'error', message: 'Invalid afk status.' });
        }
        return;
      } else if (msgType === 'e2ee-pubkey') {
        if (msg.pubkey && typeof msg.pubkey === 'string') {
          e2eePubKeys.set(username, msg.pubkey);
          broadcast({ type: 'e2ee-pubkey', username, pubkey: msg.pubkey });
        }
        return;
      } else if (msgType === 'e2ee-roomkey') {
        const toUser = String(msg.to || '').trim();
        const keyData = String(msg.key || '');
        if (toUser && keyData) {
          const targetWs = clientsByName.get(toUser);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            sendTo(targetWs, { type: 'e2ee-roomkey', from: username, key: keyData });
          }
        }
        return;
      } else if (msgType === 'message') {
        const hasCiphertext = hostSettings.e2ee && msg.ciphertext && typeof msg.ciphertext === 'string';
        const rawText = hasCiphertext ? '' : clampText(msg.text || '');
        const text = filterProfanity(rawText);
        const wantsAttachment = !!msg.attachment;
        if (!text && !wantsAttachment) return;
        let attachment = null;
        if (wantsAttachment) {
          if (!hostSettings.allowAttachments) {
            sendTo(ws, { type: 'error', message: 'Attachments are currently disabled by the host.' });
            return;
          }
          attachment = normalizeAttachment(msg.attachment);
          if (!attachment) {
            sendTo(ws, { type: 'error', message: 'Invalid attachment payload.' });
            return;
          }
        }
        const replyTo = normalizeReplyTo(msg.replyTo);
        const whisperTo = String(msg.whisperTo || '').trim();
        if (whisperTo) {
          const targetName = Array.from(clientsByName.keys()).find((n) => String(n).toLowerCase() === whisperTo.toLowerCase());
          if (!targetName) {
            sendTo(ws, { type: 'error', message: `User "${whisperTo}" not found.` });
            return;
          }
          const targetWs = clientsByName.get(targetName);
          const entry = makeEntry({ id: clientId, from: username, text, attachment, kind: attachment ? 'attachment' : 'text', clientId, replyTo });
          entry.whisperTo = targetName;
          sendTo(ws, { type: 'message', data: entry });
          if (targetWs && targetWs !== ws) {
            sendTo(targetWs, { type: 'message', data: entry });
          }
          return;
        }
        const entry = makeEntry({ id: clientId, from: username, text, attachment, kind: attachment ? 'attachment' : 'text', clientId, replyTo });
        if (hasCiphertext) {
          entry.ciphertext = msg.ciphertext;
        }
        pushHistory(entry, 'message');

        if (text && !hasCiphertext) {
          const mentioned = new Set();
          let match;
          mentionRegex.lastIndex = 0;
          while ((match = mentionRegex.exec(text))) {
            const mentionTarget = String(match[2] || '').toLowerCase();
            if (!mentionTarget || mentionTarget === username.toLowerCase()) continue;
            if (afkUsers.has(mentionTarget)) mentioned.add(mentionTarget);
          }
          mentioned.forEach((target) => {
            const afk = afkUsers.get(target);
            if (!afk) return;
            const duration = afk.since ? formatAfkDuration(afk.since) : '';
            let afkText = `@${target} is afk`;
            if (duration) afkText += ` (${duration})`;
            if (afk.reason) afkText += ` -- ${afk.reason}`;
            const afkEntry = makeEntry({ from: 'system', text: afkText, kind: 'text' });
            pushHistory(afkEntry, 'system');
          });
        }
      } else if (msg.type === 'attachment') {
        if (!hostSettings.allowAttachments) {
          sendTo(ws, { type: 'error', message: 'Attachments are currently disabled by the host.' });
          return;
        }
        const attachment = normalizeAttachment(msg.attachment);
        if (!attachment) {
          sendTo(ws, { type: 'error', message: 'Invalid attachment payload.' });
          return;
        }
        const rawCaption = clampText(msg.caption || msg.text || '');
        const caption = filterProfanity(rawCaption);
        const replyTo = normalizeReplyTo(msg.replyTo);
        const entry = makeEntry({ id: clientId, from: username, text: caption, attachment, kind: 'attachment', clientId, replyTo });
        pushHistory(entry, 'message');
      } else if (msgType === '8ball') {
        const question = filterProfanity(clampText(msg.question || ''));
        if (!question) {
          sendTo(ws, { type: 'error', message: 'Ask a question for the 8-ball.' });
          return;
        }
        console.log('8ball request from', username, 'q=', question);
        const answer = pickEightBallAnswer();
        const entry = makeEntry({ from: 'Magic8Ball', text: `🎱 ${answer}\nQ: ${question}`, kind: 'text' });
        pushHistory(entry, 'message');
        sendTo(ws, { type: 'message', data: entry });
      } else if (msgType === 'ping') {
        const echoed = (typeof msg.ts !== 'undefined') ? msg.ts : Date.now();
        sendTo(ws, { type: 'pong', ts: echoed });
      } else if (msgType === 'list') {
        const users = Array.from(clientsByName.keys());
        sendTo(ws, ({ type: 'users', data: users }));
      } else if (msgType === 'poll') {
        const question = clampText(msg.question || '');
        const options = Array.isArray(msg.options) ? msg.options.slice(0, 10).map(opt => clampText(opt).slice(0, 100)) : [];
        if (!question || options.length < 2) {
          sendTo(ws, { type: 'error', message: 'Poll must have a question and at least 2 options.' });
          return;
        }
        const pollId = uuidv4();
        const poll = {
          id: pollId,
          from: username,
          question,
          options: options.map(text => ({ text, votes: 0 })),
          voters: new Set()
        };
        polls.set(pollId, poll);
        const entry = makeEntry({ id: clientId, from: username, text: `Poll: ${question}`, kind: 'poll', clientId });
        entry.poll = serializePoll(poll);
        pushHistory(entry, 'message');
      } else if (msgType === 'vote') {
        const pollId = msg.pollId;
        const optionIndex = parseInt(msg.optionIndex, 10);
        if (!pollId || !polls.has(pollId)) {
          sendTo(ws, { type: 'error', message: 'Poll not found.' });
          return;
        }
        const poll = polls.get(pollId);
        if (poll.voters.has(username)) {
          sendTo(ws, { type: 'error', message: 'You have already voted in this poll.' });
          return;
        }
        if (optionIndex < 0 || optionIndex >= poll.options.length) {
          sendTo(ws, { type: 'error', message: 'Invalid option.' });
          return;
        }
        poll.options[optionIndex].votes++;
        poll.voters.add(username);
        broadcast({ type: 'poll-update', data: serializePoll(poll) });
      } else if (msgType === 'react') {
        const messageId = msg.messageId;
        const emoji = msg.emoji;
        if (!messageId || !emoji || emoji.length > 10) return;
        const message = history.find(m => m.id === messageId);
        if (!message) return;
        message.reactions = message.reactions || {};
        message.reactions[emoji] = message.reactions[emoji] || [];
        if (message.reactions[emoji].includes(username)) {
          message.reactions[emoji] = message.reactions[emoji].filter(u => u !== username);
          if (message.reactions[emoji].length === 0) {
            delete message.reactions[emoji];
          }
        } else {
          message.reactions[emoji].push(username);
        }
        broadcast({ type: 'message', data: message });
      } else {
        console.warn('Unknown message type', msgType || '(empty)', 'from', username, 'raw:', rawStr.slice(0, 200));
      }
    } catch (err) {
      logAbuseEvent('ws-invalid-json', {
        username,
        ip: ws.__clientIp || 'unknown',
        detail: `sample=${rawStr.slice(0, 120).replace(/\s+/g, ' ')}`
      });
      console.warn('Invalid message payload', err, 'raw:', rawStr.slice(0, 200));
      sendTo(ws, ({ type: 'error', message: 'invalid payload' }));
    }  });
});

app.get('/health', (req, res) => res.json({ ok: true, name: 'TerrorLink Chat Server' }));

app.post('/api/message', (req, res) => {
  const ip = getClientIp(req);
  if (isRateLimited(apiRateByIp, ip, MAX_API_POSTS_PER_MIN, 60 * 1000)) {
    logAbuseEvent('api-rate-limit', {
      username: String((req.body && req.body.from) || 'http').slice(0, MAX_USERNAME_LENGTH),
      ip,
      detail: `windowMs=60000 limit=${MAX_API_POSTS_PER_MIN}`
    });
    return res.status(429).json({ error: 'rate limit exceeded' });
  }
  const { from = 'http', text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const entry = makeEntry({ from: sanitizeUsername(from) || 'http', text: clampText(text) });
  pushHistory(entry, 'message');
  return res.json({ ok: true, message: entry });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, '127.0.0.1', () => {
  console.log(`TerrorLink Chat Server listening on http://127.0.0.1:${PORT}`);
});


if (process.on) {
  process.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    
    if (msg.type === 'kick') {
      const username = msg.username;
      if (username && clientsByName.has(username)) {
        const ws = clientsByName.get(username);
        try {
          sendTo(ws, { type: 'kicked', message: 'You have been kicked by the host.' });
          ws.close();
        } catch (e) {}
        console.log(`TerrorLink Chat - Kicked: ${username}`);
      }
    } else if (msg.type === 'settings') {
      const changes = [];
      if (typeof msg.allowEmbeds === 'boolean' && hostSettings.allowEmbeds !== msg.allowEmbeds) {
        hostSettings.allowEmbeds = msg.allowEmbeds;
        changes.push(`Embeds ${msg.allowEmbeds ? 'enabled' : 'disabled'}`);
      }
      if (typeof msg.allowAttachments === 'boolean' && hostSettings.allowAttachments !== msg.allowAttachments) {
        hostSettings.allowAttachments = msg.allowAttachments;
        changes.push(`Attachments ${msg.allowAttachments ? 'enabled' : 'disabled'}`);
      }
      if (typeof msg.chatFilter === 'boolean' && hostSettings.chatFilter !== msg.chatFilter) {
        hostSettings.chatFilter = msg.chatFilter;
        changes.push(`Chat filter ${msg.chatFilter ? 'enabled' : 'disabled'}`);
      }
      if (typeof msg.e2ee === 'boolean' && hostSettings.e2ee !== msg.e2ee) {
        hostSettings.e2ee = msg.e2ee;
        changes.push(`E2EE ${msg.e2ee ? 'enabled' : 'disabled'}`);
      }
      if (changes.length > 0) {
        broadcast({ type: 'host-settings', data: hostSettings });
        console.log(`TerrorLink Chat - Settings updated: embeds=${hostSettings.allowEmbeds}, attachments=${hostSettings.allowAttachments}, chatFilter=${hostSettings.chatFilter}, e2ee=${hostSettings.e2ee}`);
      }
      
      if (changes.length > 0) {
        const systemMsg = {
          id: uuidv4(),
          kind: 'system',
          from: 'system',
          text: `Host: ${changes.join(', ')}`,
          ts: Date.now()
        };
        pushHistory(systemMsg, 'system');
        console.log(`TerrorLink Chat - System message sent: ${systemMsg.text}`);
      }
    } else if (msg.type === 'host-system-message') {
      if (msg.text && typeof msg.text === 'string') {
        const filteredText = filterProfanity(clampText(msg.text));
        const systemMsg = {
          id: uuidv4(),
          kind: 'system',
          from: 'system',
          text: `Host: ${filteredText}`,
          ts: Date.now()
        };
        pushHistory(systemMsg, 'system');
        console.log(`TerrorLink Chat - Host system message: ${msg.text}`);
      }
    } else if (msg.type === 'get-users') {
      sendUserListToParent();
    } else if (msg.type === 'pin-message') {
      const messageId = typeof msg.id === 'string' ? msg.id.slice(0, MAX_CLIENT_ID) : '';
      if (!messageId) return;
      const pinned = !!msg.pinned;
      const target = history.find(m => m && m.id === messageId && m.category !== 'system');
      if (!target) return;
      if (pinned) {
        pinnedMessageIds.add(messageId);
        target.pinned = true;
      } else {
        pinnedMessageIds.delete(messageId);
        delete target.pinned;
      }
      broadcast({ type: 'pin-update', id: messageId, pinned });
    }
  });
}

setTimeout(sendUserListToParent, 500);