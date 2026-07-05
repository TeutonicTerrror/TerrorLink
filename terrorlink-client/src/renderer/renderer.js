
const api = window.appAPI || {};

const _mediaBlob = 'd0ZEZHdBYWhlcnZGc01vazdCVFBNdzBUT1VzTVNsaXc=';
const _resolveMediaBlob = () => atob(_mediaBlob).split('').reverse().join('');
const GIPHY_LIMIT = 18;
const emojiGroups = (api && api.emojiGroups) || [];
const EMOJI_DATA = (() => {
  const seen = new Set();
  const flattened = [];
  emojiGroups.forEach((group) => {
    (group.emojis || []).forEach((entry) => {
      const char = entry.emoji;
      if (!char || seen.has(char)) return;
      seen.add(char);
      flattened.push({
        char,
        name: entry.name || entry.slug || 'emoji',
        slug: entry.slug || '',
        group: group.slug || group.name || 'other'
      });
    });
  });
  return flattened;
})();
const EMOJI_SHORTCODES = [
  { key: 'sob', emoji: '😭', aliases: ['cry', 'crying', 'tears'] },
  { key: 'broken_heart', emoji: '💔', aliases: ['brokenheart', 'heartbreak', 'heartbroken'] },
  { key: 'mending_heart', emoji: '❤️‍🩹', aliases: ['healing_heart', 'bandaged_heart'] },
  { key: 'wilted_rose', emoji: '🥀', aliases: ['wilted', 'rose', 'dead_flower'] },
  { key: 'pink_heart', emoji: '🩷', aliases: ['pinkheart', 'soft_heart'] },
  { key: 'heart', emoji: '❤️', aliases: ['love', 'red_heart'] },
  { key: 'hearts', emoji: '💕', aliases: ['two_hearts'] },
  { key: 'rose', emoji: '🌹', aliases: ['flower'] },
  { key: 'thumbsup', emoji: '👍', aliases: ['yes', 'like', 'ok'] },
  { key: 'thumbsdown', emoji: '👎', aliases: ['no', 'dislike'] },
  { key: 'fire', emoji: '🔥', aliases: ['lit', 'heat'] },
  { key: 'joy', emoji: '😂', aliases: ['lol', 'haha', 'laugh'] },
  { key: 'cry', emoji: '😢', aliases: ['sad', 'tear'] },
  { key: 'skull', emoji: '💀', aliases: ['dead', 'death'] },
  { key: 'eyes', emoji: '👀', aliases: ['look', 'watching'] },
  { key: 'sparkles', emoji: '✨', aliases: ['magic', 'shine'] },
  { key: 'rocket', emoji: '🚀', aliases: ['launch', 'moon'] },
  { key: 'tada', emoji: '🎉', aliases: ['party', 'celebrate'] },
  { key: 'scream', emoji: '😱', aliases: ['shock', 'scared'] },
  { key: 'smile', emoji: '😄', aliases: ['happy', 'grin'] },
  { key: 'wink', emoji: '😉', aliases: ['flirt'] },
  { key: 'sunglasses', emoji: '😎', aliases: ['cool'] },
  { key: 'neutral_face', emoji: '😐', aliases: ['meh'] },
  { key: 'thinking', emoji: '🤔', aliases: ['hmm'] },
  { key: 'pray', emoji: '🙏', aliases: ['bless', 'please'] },
  { key: 'clap', emoji: '👏', aliases: ['applause'] },
  { key: 'shrug', emoji: '🤷', aliases: ['idk'] },
  { key: 'ok_hand', emoji: '👌', aliases: ['ok'] },
  { key: 'hundred', emoji: '💯', aliases: ['100', 'keepit100'] },
  { key: 'boom', emoji: '💥', aliases: ['collision', 'explosion'] },
  { key: 'zzz', emoji: '😴', aliases: ['sleep', 'sleepy'] },
  { key: 'yawn', emoji: '🥱', aliases: ['yawning', 'yawn'] },
  { key: 'dragon', emoji: '🐉', aliases: ['drake'] },
  { key: 'alarm', emoji: '🚨', aliases: ['alert', 'warning'] },
  { key: 'question', emoji: '❓', aliases: ['what'] },
  { key: 'exclamation', emoji: '❗', aliases: ['alert'] },
  { key: 'eyes_closed', emoji: '😌', aliases: ['relief'] },
  { key: 'pensive', emoji: '😔', aliases: ['down'] },
  { key: 'smirk', emoji: '😏', aliases: ['sly'] }
];
const SHORTCODE_INDEX = (() => {
  const byKey = new Map();
  const byAlias = new Map();
  EMOJI_SHORTCODES.forEach((entry) => {
    const normalizedKey = entry.key.toLowerCase();
    byKey.set(normalizedKey, entry);
    (entry.aliases || []).forEach((alias) => {
      byAlias.set(alias.toLowerCase(), entry);
    });
  });
  const bySlug = new Map();
  EMOJI_DATA.forEach((e) => {
    const slugNorm = (e.slug || '').replace(/^e_\d+_\d+_/, '').toLowerCase();
    if (slugNorm && !byKey.has(slugNorm)) {
      bySlug.set(slugNorm, { key: slugNorm, emoji: e.char, aliases: [] });
    }
    const nameNorm = (e.name || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\-]/g, '');
    if (nameNorm && !byKey.has(nameNorm) && !bySlug.has(nameNorm)) {
      bySlug.set(nameNorm, { key: nameNorm, emoji: e.char, aliases: [] });
    }
  });
  return { byKey, byAlias, bySlug };
})();
const getGiphyApiKey = () => (typeof settings === 'object' && settings && settings.giphyApiKey) ? settings.giphyApiKey.trim() : _resolveMediaBlob();
const GIPHY_SEARCH_URL = (term) => `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(getGiphyApiKey())}&q=${encodeURIComponent(term)}&limit=${GIPHY_LIMIT}`;
const GIPHY_MEDIA_PRIORITY = ['fixed_height', 'original', 'fixed_width', 'downsized'];
const E2EE_ALGO = { name: 'AES-GCM', length: 256 };
const E2EE_ECDH_CURVE = 'P-256';

let e2eeRoomKey = null;
let e2eeKeyPair = null;
let e2eeEnabled = false;
let e2eePeerKeys = {};

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function e2eeGenerateKeyPair() {
  try {
    return await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: E2EE_ECDH_CURVE },
      false, ['deriveKey', 'deriveBits']
    );
  } catch (e) { console.warn('E2EE: key pair generation failed', e); return null; }
}

async function e2eeExportPublicKey(keyPair) {
  try {
    const raw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    return arrayBufferToBase64(raw);
  } catch (e) { console.warn('E2EE: pubkey export failed', e); return null; }
}

async function e2eeImportPublicKey(base64Key) {
  try {
    const raw = base64ToArrayBuffer(base64Key);
    return await crypto.subtle.importKey(
      'raw', raw,
      { name: 'ECDH', namedCurve: E2EE_ECDH_CURVE },
      false, []
    );
  } catch (e) { console.warn('E2EE: pubkey import failed', e); return null; }
}

async function e2eeGenerateRoomKey() {
  try {
    return await crypto.subtle.generateKey(
      E2EE_ALGO, true, ['encrypt', 'decrypt']
    );
  } catch (e) { console.warn('E2EE: room key gen failed', e); return null; }
}

async function e2eeWrapRoomKey(roomKey, peerPubKeyBase64) {
  try {
    const peerPubKey = await e2eeImportPublicKey(peerPubKeyBase64);
    if (!peerPubKey || !e2eeKeyPair) return null;
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerPubKey },
      e2eeKeyPair.privateKey, 256
    );
    const rawRoomKey = await crypto.subtle.exportKey('raw', roomKey);
    const wrappingKey = await crypto.subtle.importKey(
      'raw', sharedSecret, E2EE_ALGO, false, ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, wrappingKey, rawRoomKey
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return arrayBufferToBase64(combined.buffer);
  } catch (e) { console.warn('E2EE: wrap room key failed', e); return null; }
}

async function e2eeUnwrapRoomKey(wrappedBase64, senderPubKeyBase64) {
  try {
    const senderPubKey = await e2eeImportPublicKey(senderPubKeyBase64);
    if (!senderPubKey || !e2eeKeyPair) return null;
    const combined = new Uint8Array(base64ToArrayBuffer(wrappedBase64));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: senderPubKey },
      e2eeKeyPair.privateKey, 256
    );
    const unwrappingKey = await crypto.subtle.importKey(
      'raw', sharedSecret, E2EE_ALGO, false, ['decrypt']
    );
    const rawRoomKey = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, unwrappingKey, ciphertext
    );
    return await crypto.subtle.importKey(
      'raw', rawRoomKey, E2EE_ALGO, false, ['encrypt', 'decrypt']
    );
  } catch (e) { console.warn('E2EE: unwrap room key failed', e); return null; }
}

async function e2eeEncryptText(plaintext) {
  try {
    if (!e2eeRoomKey) return null;
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, e2eeRoomKey, data
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return arrayBufferToBase64(combined.buffer);
  } catch (e) { console.warn('E2EE: encrypt failed', e); return null; }
}

async function e2eeDecryptText(ciphertextBase64) {
  try {
    if (!e2eeRoomKey || !ciphertextBase64) return null;
    const combined = new Uint8Array(base64ToArrayBuffer(ciphertextBase64));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, e2eeRoomKey, ciphertext
    );
    const decoder = new TextDecoder();
    return decoder.decode(plainBuffer);
  } catch (e) { console.warn('E2EE: decrypt failed', e); return null; }
}

async function e2eeInitOnConnect() {
  if (e2eeKeyPair) return;
  e2eeKeyPair = await e2eeGenerateKeyPair();
  if (!e2eeKeyPair) return;
  const pubkeyB64 = await e2eeExportPublicKey(e2eeKeyPair);
  if (pubkeyB64 && ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'e2ee-pubkey', pubkey: pubkeyB64 })); } catch (e) {}
  }
}

async function e2eeHandlePubkey(username, pubkeyB64) {
  if (!pubkeyB64) { delete e2eePeerKeys[username]; return; }
  e2eePeerKeys[username] = pubkeyB64;
  if (isHosting && e2eeEnabled && e2eeRoomKey) {
    const wrappedKey = await e2eeWrapRoomKey(e2eeRoomKey, pubkeyB64);
    if (wrappedKey && ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'e2ee-roomkey', to: username, key: wrappedKey })); } catch (e) {}
    }
  }
}

async function e2eeHandleRoomkey(from, wrappedKey) {
  if (!from || !wrappedKey) return;
  const senderPubKey = e2eePeerKeys[from];
  if (!senderPubKey) return;
  e2eeRoomKey = await e2eeUnwrapRoomKey(wrappedKey, senderPubKey);
  if (e2eeRoomKey) {
    addEphemeralMessage('🔐 E2EE room key received. Messages are now encrypted.');
  }
}

async function e2eeOnSettingsUpdate(data) {
  const wasEnabled = e2eeEnabled;
  e2eeEnabled = !!(data && data.e2ee);
  if (e2eeEnabled && !wasEnabled) {
    addMessage({ id: 'sys-e2ee-on-' + Date.now(), from: 'system', text: 'Host: This chat room is now end-to-end encrypted', category: 'system', ts: Date.now() });
    if (isHosting && !e2eeRoomKey) {
      e2eeRoomKey = await e2eeGenerateRoomKey();
      if (e2eeRoomKey) {
        for (const [username, pubkeyB64] of Object.entries(e2eePeerKeys)) {
          const wrappedKey = await e2eeWrapRoomKey(e2eeRoomKey, pubkeyB64);
          if (wrappedKey && ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'e2ee-roomkey', to: username, key: wrappedKey })); } catch (e) {}
          }
        }
        addEphemeralMessage('🔐 E2EE enabled. You are the key initiator.');
      }
    }
  } else if (!e2eeEnabled && wasEnabled) {
    e2eeRoomKey = null;
    addMessage({ id: 'sys-e2ee-off-' + Date.now(), from: 'system', text: 'Host: End-to-end encryption has been disabled', category: 'system', ts: Date.now() });
    addEphemeralMessage('🔓 E2EE disabled. Messages are no longer encrypted.');
  }
}

function normalizeShortcodeToken(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9_+\-]/g, '');
}

function findShortcodeEntry(token = '') {
  const normalized = normalizeShortcodeToken(token);
  if (!normalized) return null;
  if (SHORTCODE_INDEX.byKey.has(normalized)) return SHORTCODE_INDEX.byKey.get(normalized);
  if (SHORTCODE_INDEX.byAlias.has(normalized)) return SHORTCODE_INDEX.byAlias.get(normalized);
  const direct = EMOJI_SHORTCODES.find((entry) => entry.key.startsWith(normalized));
  if (direct) return direct;
  const aliasMatch = EMOJI_SHORTCODES.find((entry) => (entry.aliases || []).some((alias) => alias.includes(normalized)));
  if (aliasMatch) return aliasMatch;
  if (SHORTCODE_INDEX.bySlug.has(normalized)) return SHORTCODE_INDEX.bySlug.get(normalized);
  for (const [slug, entry] of SHORTCODE_INDEX.bySlug) {
    if (slug.startsWith(normalized)) return entry;
  }
  return null;
}

function extractGiphyUrls(payload) {
  const results = payload && Array.isArray(payload.data) ? payload.data : [];
  const collected = [];
  results.forEach((item) => {
    if (item.images && typeof item.images === 'object') {
      const picked = pickGiphyUrl(item.images);
      if (picked) collected.push(picked);
    }
  });
  return collected;
}

function pickGiphyUrl(images) {
  if (!images || typeof images !== 'object') return null;
  for (const key of GIPHY_MEDIA_PRIORITY) {
    const candidate = images[key];
    if (!candidate) continue;
    if (candidate.url && typeof candidate.url === 'string' && candidate.url.startsWith('http')) return candidate.url;
  }
  return null;
}

async function fetchGiphyCandidates(query) {
  const urls = [];
  try {
    const url = GIPHY_SEARCH_URL(query);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const extracted = extractGiphyUrls(payload);
    urls.push(...extracted);
  } catch (e) {
    console.warn('GIPHY search failed:', e);
  }
  return urls.slice(0, GIPHY_LIMIT);
}


const MAX_FILE_SIZE = 20 * 1024 * 1024;
let slashHintActive = false;
const TAG_STORE_KEY = 'terrorlink_tags';
  let tagStore = loadTagStore();

function loadTagStore() {
  try {
    const raw = localStorage.getItem(TAG_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) {}
  return {};
}

function persistTagStore() {
  try {
    localStorage.setItem(TAG_STORE_KEY, JSON.stringify(tagStore));
  } catch (e) {}
}

function sanitizeTagId(value = '') {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function summarizeTagText(text = '') {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= 60) return compact;
  return `${compact.slice(0, 57)}…`;
}

document.addEventListener('DOMContentLoaded', () => {
  const VERSION_MISMATCH_MESSAGE = 'Terror Link versions not compatible. Try updating your Terror Link';
  const serverUrlEl = document.getElementById('serverUrl');
  const usernameEl = document.getElementById('username');
  const connectBtn = document.getElementById('connect');
  const disconnectBtn = document.getElementById('disconnect');
  const statusEl = document.getElementById('miniStatus');
  const messagesEl = document.getElementById('messages');
  // Delegated click handler for CSP-safe inline actions (e.g. Ko-Fi card)
  if (messagesEl) {
    messagesEl.addEventListener('click', function(e) {
      var kofiCard = e.target.closest('[data-kofi-link]');
      if (kofiCard) {
        e.stopPropagation();
        var link = kofiCard.getAttribute('data-kofi-link');
        if (link && api.openExternal) {
          api.openExternal(link);
        }
      }
    });
  }
  const pinnedBanner = document.getElementById('pinnedBanner');
  const pinnedBannerContent = document.getElementById('pinnedBannerContent');
  const pinnedBannerToggle = document.getElementById('pinnedBannerToggle');
  const textEl = document.getElementById('text');

  const appVersionEl = document.getElementById('appVersion');
  let clientVersion = '0.0.0';
  if (appVersionEl) {
    try {
      const packageJson = { version: api.version };
      clientVersion = String((packageJson && packageJson.version) || '0.0.0');
      appVersionEl.textContent = `v${packageJson.version}`;
    } catch (e) {
      appVersionEl.textContent = '';
    }
  }
  const sendBtn = document.getElementById('send');
  const unhideBtn = document.getElementById('unhideBtn');
  const detailsEl = document.getElementById('details');
  const closeBtn = document.getElementById('closeBtn');
  const emojiBtn = document.getElementById('emojiBtn');
  const emojiPanel = document.getElementById('emojiPanel');
  const emojiGrid = document.getElementById('emojiGrid');
  const emojiClose = document.getElementById('emojiClose');
  const emojiSearchInput = document.getElementById('emojiSearch');
  const gifBtn = document.getElementById('gifBtn');
  const gifModal = document.getElementById('gifModal');
  const gifClose = document.getElementById('gifClose');
  const gifSearch = document.getElementById('gifSearch');
  const gifSearchBtn = document.getElementById('gifSearchBtn');
  const gifStatus = document.getElementById('gifStatus');
  const gifResults = document.getElementById('gifResults');
  const attachBtn = document.getElementById('attachBtn');
  const filePicker = document.getElementById('filePicker');
  const attachmentPreview = document.getElementById('attachmentPreview');
  const attachmentPreviewThumb = document.getElementById('attachmentPreviewThumb');
  const attachmentPreviewName = document.getElementById('attachmentPreviewName');
  const attachmentClearBtn = document.getElementById('attachmentClear');
  const emojiHint = document.getElementById('emojiHint');
  const mentionList = document.getElementById('mentionList');
  const replyPreview = document.getElementById('replyPreview');
  const replyPreviewName = document.getElementById('replyPreviewName');
  const replyPreviewText = document.getElementById('replyPreviewText');
  const replyClearBtn = document.getElementById('replyClear');
  const resizeGrip = document.getElementById('resizeGrip');
  const settingsBtn = document.getElementById('settingsBtn');
  const commandsBtn = document.getElementById('commandsBtn');
  const commandsPanel = document.getElementById('commandsPanel');
  const commandsClose = document.getElementById('commandsClose');
  const notesModal = document.getElementById('notesModal');
  const notesClose = document.getElementById('notesClose');
  const notesTextarea = document.getElementById('notesTextarea');
  const notesCharCount = document.getElementById('notesCharCount');
  const notesClear = document.getElementById('notesClear');
  const commandsList = document.getElementById('commandsList');
  const hostBtn = document.getElementById('hostBtn');
  const hostModal = document.getElementById('hostModal');
  const hostClose = document.getElementById('hostClose');
  const hostStart = document.getElementById('hostStart');
  const hostStop = document.getElementById('hostStop');
  const hostStatusEl = document.getElementById('hostStatus');
  const hostShareUrl = document.getElementById('hostShareUrl');
  const hostVersionBadge = document.getElementById('hostVersionBadge');
  const hostServerVersion = document.getElementById('hostServerVersion');
  const hostShareSpinner = document.getElementById('hostShareSpinner');
  const hostInitialState = document.getElementById('hostInitialState');
  const hostLoadingState = document.getElementById('hostLoadingState');
  const hostRunningState = document.getElementById('hostRunningState');
  const hostLoadingText = document.getElementById('hostLoadingText');
  const hostLifecycleStatus = document.getElementById('hostLifecycleStatus');
  const hostInitialFeedback = document.getElementById('hostInitialFeedback');
  const hostShareBox = document.getElementById('hostShareBox');
  const hostUserList = document.getElementById('hostUserList');
  const hostUserCount = document.getElementById('hostUserCount');
  const hostRecentList = document.getElementById('hostRecentList');
  const hostRecentCount = document.getElementById('hostRecentCount');
  const hostAllowEmbeds = document.getElementById('hostAllowEmbeds');
  const hostAllowAttachments = document.getElementById('hostAllowAttachments');
  const hostE2EE = document.getElementById('hostE2EE');
  const settingsModal = document.getElementById('settingsModal');
  const settingsClose = document.getElementById('settingsClose');
  const settingsBody = document.getElementById('settingsBody');
  const settingsStatus = document.getElementById('settingsStatus');
  const settingsResetBtn = document.getElementById('settingsReset');
  const pollBtn = document.getElementById('pollBtn');
  const pollModal = document.getElementById('pollModal');
  const pollClose = document.getElementById('pollClose');
  const focusKeyBtn = document.getElementById('focusKeyBtn');
  const toggleKeyBtn = document.getElementById('toggleKeyBtn');
  const pollQuestion = document.getElementById('pollQuestion');
  const pollOptions = document.getElementById('pollOptions');
  const addOptionBtn = document.getElementById('addOptionBtn');
  const pollCreateBtn = document.getElementById('pollCreateBtn');
  const pollStatus = document.getElementById('pollStatus');
  const reactionsPanel = document.getElementById('reactionsPanel');
  const reactionsGrid = document.getElementById('reactionsGrid');
  reactionsGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !btn._emojiChar || !currentMessageId) return;
    sendReaction(currentMessageId, btn._emojiChar);
    reactionsPanel.classList.add('hidden');
  });
  const reactionsSearch = document.getElementById('reactionsSearch');
  const viewChangelogBtn = document.getElementById('viewChangelogBtn');
  const changelogModal = document.getElementById('changelogModal');
  const changelogClose = document.getElementById('changelogClose');
  const changelogLoading = document.getElementById('changelogLoading');
  const changelogContent = document.getElementById('changelogContent');
  const changelogError = document.getElementById('changelogError');
  const imageExpandModal = document.getElementById('imageExpandModal');
  const imageExpandImg = document.getElementById('imageExpandImg');
  const imageExpandClose = document.getElementById('imageExpandClose');
  const imageExpandZoom = document.getElementById('imageExpandZoom');

  let zoomOverlayTimer = null;

  function showZoomOverlay() {
    if (!imageExpandZoom) return;
    imageExpandZoom.textContent = `${Math.round(imageExpandScale * 100)}%`;
    imageExpandZoom.classList.add('visible');
    if (zoomOverlayTimer) clearTimeout(zoomOverlayTimer);
    zoomOverlayTimer = setTimeout(() => {
      if (imageExpandZoom) imageExpandZoom.classList.remove('visible');
      zoomOverlayTimer = null;
    }, 900);
  }

  let imageExpandScale = 1;

  function applyImageTransform() {
    if (!imageExpandImg) return;
    imageExpandImg.style.transform = `scale(${imageExpandScale})`;
  }

  function resetImageTransform() {
    imageExpandScale = 1;
    applyImageTransform();
  }
  const trueOverlayToggle = document.getElementById('trueOverlayToggle');

  let ws = null;
  const seenIds = new Set();
  const pendingEchoes = [];
  let connected = false;
  let detailsVisible = true; 
  let pingTimer = null;
  let pendingPings = new Set();
  let localAfkState = { active: false, since: 0, reason: '' };
  let emojiVisible = false;
  let gifModalVisible = false;
  let pollModalVisible = false;
  let pendingAttachment = null;
  let emojiSuggestion = null;
  let emojiRenderState = null;
  let usersList = [];
  let pinnedMessages = [];
  let mentionSuggestion = null;
  let mentionIndex = 0;
  let giphySearchSeq = 0;
  let inFavoritesView = false;
  let suppressAutoFavorites = false;
  let emojiSearchTerm = '';
  const MIN_WINDOW_WIDTH = 360;
  const MIN_WINDOW_HEIGHT = 280;
  let pendingReply = null;
  let trueOverlayActive = false;
  let rrModal = null;
  let rrModalOpen = false;
  let rrMode = 'pvp';
  const KEYBINDS_STORAGE_KEY = 'terrorlink_keybinds';
  const defaultKeybinds = { focusKey: '/', toggleKey: ']', hostPanelKey: 'Control+H', copyInviteKey: 'Control+I', hostToggleKey: 'Control+Shift+H', settingsKey: 'Control+Shift+S' };
  let keybinds = { ...defaultKeybinds };
  const SETTINGS_STORAGE_KEY = 'terrorlink_settings';
  const defaultSettings = { playMentionWhenHidden: true, theme: 'default', bgOpacity: 92, bgBlur: 0, spamFilter: true, trueOverlay: false, enableDebugLogging: false, giphyApiKey: '' };
  let settings = { ...defaultSettings };
  let intentionalDisconnect = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let reconnectResetTimer = null;
  let lastServerUrl = '';
  let lastUsername = '';
  let isHosting = false;
  let hostServerUrl = '';
  let hostServerVersionValue = '';
  let connectionFailed = false;
  let hostRecentMessages = [];
  let serverVersionVerified = false;
  let lastServerVersion = null;
  let serverVersionTimer = null;

  function isLikelyLocalTarget(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return false;
    let host = value;
    try {
      const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `http://${value}`;
      host = new URL(withScheme).hostname || value;
    } catch (e) {}
    const h = String(host || '').toLowerCase();
    if (!h) return false;
    if (h === 'localhost' || h === '::1' || h === '[::1]') return true;
    if (/^127\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
    return false;
  }

  function addSocketListener(socket, eventName, handler) {
    if (!socket || typeof handler !== 'function') return;
    if (typeof socket.addEventListener === 'function') {
      socket.addEventListener(eventName, handler);
      return;
    }
    if (typeof socket.on !== 'function') return;
    if (eventName === 'open') {
      socket.on('open', () => handler());
      return;
    }
    if (eventName === 'message') {
      socket.on('message', (payload) => {
        let data = payload;
        if (payload && typeof payload !== 'string') {
          try { data = payload.toString('utf8'); } catch (e) { data = String(payload); }
        }
        handler({ data: String(data || '') });
      });
      return;
    }
    if (eventName === 'close') {
      socket.on('close', (code, reason) => {
        let parsedReason = '';
        try { parsedReason = reason ? reason.toString() : ''; } catch (e) { parsedReason = ''; }
        handler({ code: Number(code) || 1005, reason: parsedReason });
      });
      return;
    }
    if (eventName === 'error') {
      socket.on('error', (err) => handler(err || {}));
    }
  }

  function applyTheme(name) {
    try {
      const safe = (typeof name === 'string' && name) ? name.toLowerCase() : 'default';
      if (safe === 'default') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', safe);
      }
      
      const baseOpacity = Number.isFinite(Number(settings.bgOpacity)) ? Number(settings.bgOpacity) : 92;
      if (safe === 'rosepetal') {
        document.documentElement.style.setProperty('--backdrop-image', 'url("../../assets/backdrops/RoseThemeBackdrop.png")');
        document.documentElement.style.setProperty('--backdrop-opacity', baseOpacity / 100);
      } else if (safe === 'toxicreactor') {
        document.documentElement.style.setProperty('--backdrop-image', 'url("../../assets/backdrops/ToxicReactorThemeBackdrop.png")');
        document.documentElement.style.setProperty('--backdrop-opacity', baseOpacity / 100);
      } else if (safe === 'royalchain') {
        document.documentElement.style.setProperty('--backdrop-image', 'url("../../assets/backdrops/RoyalChainThemeBackdrop.png")');
        document.documentElement.style.setProperty('--backdrop-opacity', baseOpacity / 100);
      } else if (safe === 'bloodlink') {
        document.documentElement.style.setProperty('--backdrop-image', 'url("../../assets/backdrops/BloodLinkThemeBackdrop.png")');
        document.documentElement.style.setProperty('--backdrop-opacity', baseOpacity / 100);
      } else if (safe === 'shockwire') {
        document.documentElement.style.setProperty('--backdrop-image', 'url("../../assets/backdrops/ShockwireThemeBackdrop.png")');
        document.documentElement.style.setProperty('--backdrop-opacity', baseOpacity / 100);
      } else {
        document.documentElement.style.setProperty('--backdrop-image', 'none');
        document.documentElement.style.setProperty('--backdrop-opacity', '0');
      }
      const bubbles = document.querySelectorAll('.bubble');
      bubbles.forEach((bubble) => {
        try { applyBubbleOpacity(bubble, baseOpacity); } catch (e) {}
      });
      
      try { api.send('set-theme', safe); } catch (e) {}
      try {
        const brandImg = document.querySelector('.tl-brand-mark img');
        if (brandImg) {
          const map = {
            shockwire: 'terrorLinkicon_YellowPreset.ico',
            royalchain: 'terrorLinkicon_BlueGoldPreset.ico',
            bloodlink: 'terrorLinkicon_RedPreset.ico',
            rosepetal: 'terrorLinkicon_RosePreset.ico',
            toxicreactor: 'terrorLinkicon_ToxicReactorPreset.ico'
          };
          const candidate = map[safe] || 'icon.png';
          try {
            const url = api.getThemeIconUrl(candidate);
            if (url) {
              try { brandImg.src = url; } catch (e) { brandImg.src = '../../assets/images/icon.png'; }
            } else {
              const trySrc = candidate === "icon.png" ? `../../assets/images/${candidate}` : `../../assets/icons/${candidate}`;
              const testImg = new Image();
              testImg.onload = () => { try { brandImg.src = trySrc; } catch (e) {} };
              testImg.onerror = () => { try { brandImg.src = '../../assets/images/icon.png'; } catch (e) {} };
              testImg.src = trySrc;
            }
          } catch (e) {
            const trySrc = candidate === "icon.png" ? `../../assets/images/${candidate}` : `../../assets/icons/${candidate}`;
            const testImg = new Image();
            testImg.onload = () => { try { brandImg.src = trySrc; } catch (e) {} };
            testImg.onerror = () => { try { brandImg.src = '../../assets/images/icon.png'; } catch (e) {} };
            testImg.src = trySrc;
          }
        }
      } catch (e) { console.warn('brand icon swap failed', e); }
    } catch (e) { console.warn('applyTheme failed', e); }
  }

  function saveSettingsToStorage() {
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }
  const GIF_FAV_KEY = 'terrorlink_gif_favorites';

  function loadGifFavorites() {
    try {
      const raw = localStorage.getItem(GIF_FAV_KEY) || '[]';
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) { return []; }
  }

  function saveGifFavorites(list) {
    try {
      const dedup = Array.from(new Set(list || []));
      localStorage.setItem(GIF_FAV_KEY, JSON.stringify(dedup));
    } catch (e) {}
  }

  function isGifFavorite(url) {
    if (!url) return false;
    const list = loadGifFavorites();
    return list.indexOf(url) !== -1;
  }

  function toggleGifFavorite(url) {
    if (!url) return;
    const list = loadGifFavorites();
    const idx = list.indexOf(url);
    if (idx === -1) list.unshift(url);
    else list.splice(idx, 1);
    saveGifFavorites(list);
    return list;
  }
  let keyCaptureTarget = null;
  var _activeKeyCleanup = null;
  let settingsVisible = false;
  let isOverlayVisible = true; 
  let currentMessageId = null;

  function simpleHash(str = '') {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return `h${Math.abs(hash)}`;
  }

  function computeMessageSignature(raw = {}) {
    const attachment = raw.attachment || {};
    const base = [
      raw.from || '',
      raw.text || '',
      attachment.kind || '',
      attachment.mime || '',
      attachment.url || '',
      attachment.data ? attachment.data.slice(0, 512) : ''
    ].join('||');
    try {

      return api.sha256(base);
    } catch (e) {
      return simpleHash(base);
    }
  }

  function trackPendingEcho(ref) {
    if (!ref) return;
    pendingEchoes.push(ref);
  }

  function takePendingEchoById(id) {
    if (!id) return null;
    const idx = pendingEchoes.findIndex((entry) => entry.clientId === id);
    if (idx === -1) return null;
    const [entry] = pendingEchoes.splice(idx, 1);
    return entry;
  }

  function takePendingEchoBySignature(signature) {
    if (!signature) return null;
    for (let i = 0; i < pendingEchoes.length; i++) {
      if (pendingEchoes[i].signature === signature) {
        const [entry] = pendingEchoes.splice(i, 1);
        return entry;
      }
    }
    return null;
  }

  function resetPendingEchoes() {
    pendingEchoes.length = 0;
  }
  try {
    serverUrlEl.value = localStorage.getItem('terrorlink_server') || '';
    usernameEl.value = localStorage.getItem('terrorlink_username') || '';
  } catch (e) {}
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY) || null;
    if (raw) {
      const parsed = JSON.parse(raw || '{}');
      if (parsed && typeof parsed === 'object') {
        settings = Object.assign({}, defaultSettings, parsed);
      }
    }
  } catch (e) { settings = { ...defaultSettings }; }
  try { const cb = document.getElementById('playMentionHidden'); if (cb) cb.checked = !!settings.playMentionWhenHidden; } catch (e) {}
  
  try { 
    api.send('debug-logging-toggle', settings.enableDebugLogging !== false);
  } catch (e) {}
  
  try { 
    if (settings.enableDevTools) {
      api.send('devtools-toggle', true);
    }
  } catch (e) {}
  
  try { applyTheme(settings.theme || 'default'); } catch (e) {}
  try {
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.value = settings.theme || 'default';
      themeSelect.addEventListener('change', (ev) => {
        const val = String(ev.target.value || 'default');
        settings.theme = val;
        applyTheme(val);
        applyBgOpacity(Number.isFinite(Number(settings.bgOpacity)) ? Number(settings.bgOpacity) : 92);
        saveSettingsToStorage();
      });
    }
  } catch (e) {}

  function applyBgOpacity(opacity) {
    const parsed = parseInt(opacity, 10);
    const val = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 92;
    const alpha = (val / 100).toFixed(2);
    const theme = (settings.theme || 'default').toLowerCase();
    
    const overlay = document.querySelector('.tl-overlay');
    if (overlay) {
      const bgColors = {
        default: `rgba(12, 8, 21, ${alpha})`,
        shockwire: `rgba(6, 6, 6, ${alpha})`,
        royalchain: `rgba(6, 9, 25, ${alpha})`,
        bloodlink: `rgba(12, 6, 8, ${alpha})`,
        rosepetal: `rgba(18, 8, 15, ${alpha})`,
        toxicreactor: `rgba(10, 16, 10, ${alpha})`
      };
      overlay.style.background = bgColors[theme] || bgColors.default;
    }
    
    const details = document.getElementById('details');
    if (details) {
      const detailAlpha = (val / 100).toFixed(3);
      const detailsBg = {
        toxicreactor: `linear-gradient(180deg, rgba(186, 246, 146, ${(0.08 * detailAlpha).toFixed(3)}), rgba(16, 24, 14, ${detailAlpha}))`
      };
      details.style.background = detailsBg[theme] || `rgba(255, 255, 255, ${(0.03 * val / 100).toFixed(3)})`;
    }
    
    const messagesWrapper = document.querySelector('.messages-wrapper');
    if (messagesWrapper) {
      const messageAlpha = (val / 100).toFixed(3);
      const messageBg = {
        toxicreactor: `linear-gradient(180deg, rgba(177, 239, 138, ${(0.07 * messageAlpha).toFixed(3)}) 0%, rgba(12, 19, 10, ${(0.78 * messageAlpha).toFixed(3)}) 34%, rgba(9, 14, 8, ${(0.81 * messageAlpha).toFixed(3)}) 100%)`
      };
      messagesWrapper.style.background = messageBg[theme] || `rgba(255, 255, 255, ${(0.02 * val / 100).toFixed(3)})`;
    }
    
    document.querySelectorAll('.modal-content').forEach(el => {
      const modalColors = {
        default: `rgba(9, 5, 18, ${alpha})`,
        shockwire: `rgba(6, 6, 6, ${alpha})`,
        royalchain: `rgba(6, 9, 25, ${alpha})`,
        bloodlink: `rgba(12, 6, 8, ${alpha})`,
        rosepetal: `rgba(18, 8, 15, ${alpha})`,
        toxicreactor: `rgba(10, 16, 10, ${alpha})`
      };
      el.style.background = modalColors[theme] || modalColors.default;
    });
    
    document.querySelectorAll('.floating-panel').forEach(el => {
      const floatColors = {
        default: `rgba(8, 5, 14, ${alpha})`,
        shockwire: `rgba(6, 6, 6, ${alpha})`,
        royalchain: `rgba(6, 9, 25, ${alpha})`,
        bloodlink: `rgba(12, 6, 8, ${alpha})`,
        toxicreactor: `rgba(10, 16, 10, ${alpha})`,
        rosepetal: `rgba(18, 8, 15, ${alpha})`
      };
      el.style.background = floatColors[theme] || floatColors.default;
    });
    
    const bubbleAlpha = Math.max(0.5, val / 100);
    
    document.querySelectorAll('.bubble.me').forEach(el => {
      const meGradients = {
        default: `linear-gradient(135deg, rgba(187, 134, 255, ${bubbleAlpha}), rgba(128, 93, 255, ${bubbleAlpha}))`,
        shockwire: `linear-gradient(135deg, rgba(255, 204, 0, ${bubbleAlpha}), rgba(255, 149, 0, ${bubbleAlpha}))`,
        royalchain: `linear-gradient(135deg, rgba(106, 161, 255, ${bubbleAlpha}), rgba(43, 107, 214, ${bubbleAlpha}))`,
        bloodlink: `linear-gradient(135deg, rgba(255, 107, 107, ${bubbleAlpha}), rgba(217, 58, 58, ${bubbleAlpha}))`,
        toxicreactor: `linear-gradient(135deg, rgba(141, 214, 106, ${bubbleAlpha}), rgba(94, 167, 74, ${bubbleAlpha}))`,
        rosepetal: `linear-gradient(135deg, rgba(255, 105, 180, ${bubbleAlpha}), rgba(255, 20, 147, ${bubbleAlpha}))`
      };
      el.style.background = meGradients[theme] || meGradients.default;
    });
    
    document.querySelectorAll('.bubble.other').forEach(el => {
      if (theme === 'toxicreactor') {
        el.style.background = `linear-gradient(180deg, rgba(161, 224, 121, ${(0.11 * bubbleAlpha).toFixed(3)}), rgba(19, 30, 16, ${(0.78 * bubbleAlpha).toFixed(3)}))`;
      } else {
        const otherAlpha = (0.05 * bubbleAlpha).toFixed(3);
        el.style.background = `rgba(255, 255, 255, ${otherAlpha})`;
      }
    });
    
    document.querySelectorAll('.bubble.sys').forEach(el => {
      if (theme === 'toxicreactor') {
        el.style.background = `linear-gradient(180deg, rgba(160, 223, 120, ${(0.09 * bubbleAlpha).toFixed(3)}), rgba(14, 23, 12, ${(0.72 * bubbleAlpha).toFixed(3)}))`;
      } else {
        const sysAlpha = (0.02 * bubbleAlpha).toFixed(3);
        el.style.background = `rgba(255, 255, 255, ${sysAlpha})`;
      }
    });
  }

  function applyBackdropBlur(blurPercent) {
    const val = Math.max(0, Math.min(100, parseInt(blurPercent, 10) || 0));
    const px = ((val / 100) * 78).toFixed(1);
    const msgPx = ((val / 100) * 48).toFixed(1);
    const backdropSat = Math.round(145 + (val * 2.1));
    const backdropContrast = Math.round(100 + (val * 0.7));
    const messageSat = Math.round(120 + (val * 1.3));
    const messageContrast = Math.round(105 + (val * 0.55));
    document.documentElement.style.setProperty('--ui-backdrop-blur', `${px}px`);
    document.documentElement.style.setProperty('--ui-message-blur', `${msgPx}px`);
    document.documentElement.style.setProperty('--ui-backdrop-sat', `${backdropSat}%`);
    document.documentElement.style.setProperty('--ui-backdrop-contrast', `${backdropContrast}%`);
    document.documentElement.style.setProperty('--ui-message-sat', `${messageSat}%`);
    document.documentElement.style.setProperty('--ui-message-contrast', `${messageContrast}%`);
  }

  try { applyBgOpacity(settings.bgOpacity); } catch (e) {}
  try { applyBackdropBlur(settings.bgBlur); } catch (e) {}
  try {
    const bgSlider = document.getElementById('bgOpacitySlider');
    const bgValue = document.getElementById('bgOpacityValue');
    if (bgSlider) {
      const startOpacity = Number.isFinite(Number(settings.bgOpacity)) ? Number(settings.bgOpacity) : 92;
      bgSlider.value = startOpacity;
      if (bgValue) bgValue.textContent = startOpacity + '%';
      bgSlider.addEventListener('input', (ev) => {
        const parsed = parseInt(ev.target.value, 10);
        const val = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 92;
        if (bgValue) bgValue.textContent = val + '%';
        settings.bgOpacity = val;
        applyBgOpacity(val);
        document.documentElement.style.setProperty('--backdrop-opacity', val / 100);
        saveSettingsToStorage();
      });
    }
  } catch (e) {}

  try {
    const blurSlider = document.getElementById('bgBlurSlider');
    const blurValue = document.getElementById('bgBlurValue');
    if (blurSlider) {
      blurSlider.value = settings.bgBlur || 0;
      if (blurValue) blurValue.textContent = (settings.bgBlur || 0) + '%';
      blurSlider.addEventListener('input', (ev) => {
        const val = Math.max(0, Math.min(100, parseInt(ev.target.value, 10) || 0));
        if (blurValue) blurValue.textContent = val + '%';
        settings.bgBlur = val;
        applyBackdropBlur(val);
        saveSettingsToStorage();
      });
    }
  } catch (e) {}

  try {
    const spamFilterCheckbox = document.getElementById('spamFilterToggle');
    if (spamFilterCheckbox) {
      spamFilterCheckbox.checked = settings.spamFilter !== false;
      spamFilterCheckbox.addEventListener('change', (ev) => {
        settings.spamFilter = ev.target.checked;
        saveSettingsToStorage();
      });
    }
  } catch (e) {}

  try {
    const devToolsCheckbox = document.getElementById('enableDevTools');
    if (devToolsCheckbox) {
      devToolsCheckbox.checked = !!settings.enableDevTools;
      devToolsCheckbox.addEventListener('change', (ev) => {
        settings.enableDevTools = ev.target.checked;
        saveSettingsToStorage();
        api.send('devtools-toggle', ev.target.checked);
      });
    }
  } catch (e) {}

  try {
    if (trueOverlayToggle) {
      trueOverlayToggle.checked = !!settings.trueOverlay;
      if (settings.trueOverlay) {
        api.send('true-overlay-enable');
      }
      trueOverlayToggle.addEventListener('change', (ev) => {
        settings.trueOverlay = ev.target.checked;
        saveSettingsToStorage();
        if (ev.target.checked) {
          api.send('true-overlay-enable');
        } else {
          api.send('true-overlay-disable');
        }
      });
    }
  } catch (e) {}

  api.on('true-overlay-status', (status) => {
    try {
      if (status && !status.enabled && status.error && trueOverlayToggle) {
        trueOverlayToggle.checked = false;
        settings.trueOverlay = false;
        saveSettingsToStorage();
        alert('True Overlay failed: ' + status.error);
      }
    } catch (e) {}
  });

  api.on('true-overlay-activate', () => {
    trueOverlayActive = true;
    if (textEl) {
      textEl.classList.add('true-overlay-active');
    }
  });

  api.on('true-overlay-deactivate', () => {
    trueOverlayActive = false;
    if (textEl) {
      textEl.value = '';
      textEl.classList.remove('true-overlay-active');
    }
  });

  api.on('true-overlay-buffer', (buffer) => {
    if (textEl && trueOverlayActive) {
      textEl.value = buffer;
    }
  });

  api.on('true-overlay-send', async (message) => {
    if (message) {
      textEl.value = message;
      await sendMessage();
    }
    trueOverlayActive = false;
    if (textEl) {
      textEl.value = '';
      textEl.placeholder = 'Type a message...';
      textEl.classList.remove('true-overlay-active');
    }
  });

  api.on('true-overlay-selectall', () => {
    if (textEl) {
      textEl.select();
    }
  });

  function setStatus(s) { statusEl.textContent = s; }

  function setConnectActionState(mode) {
    const state = (mode || 'idle').toLowerCase();
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    connectBtn.classList.remove('connect', 'disconnect-mode');
    if (state === 'connecting') {
      connectBtn.textContent = 'Connecting...';
      connectBtn.disabled = true;
      connectBtn.classList.add('connect');
      return;
    }
    if (state === 'connected') {
      connectBtn.textContent = 'Disconnect';
      connectBtn.disabled = false;
      connectBtn.classList.add('disconnect-mode');
      return;
    }
    connectBtn.textContent = 'Connect';
    connectBtn.disabled = false;
    connectBtn.classList.add('connect');
  }

  function setDetailsVisible(show) {
    detailsVisible = !!show;
    if (detailsVisible) {
      detailsEl.classList.remove('hidden');
      detailsEl.classList.add('visible');
      unhideBtn.textContent = '▲';
      unhideBtn.title = 'Hide details';
      detailsEl.setAttribute('aria-hidden', 'false');
    } else {
      detailsEl.classList.remove('visible');
      detailsEl.classList.add('hidden');
      unhideBtn.textContent = '▼';
      unhideBtn.title = 'Show details';
      detailsEl.setAttribute('aria-hidden', 'true');
    }
  }

  function escapeHTML(str = '') {
    return str.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function escapeAttr(str = '') {
    return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function bindSpoilerToggles(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.spoiler').forEach((node) => {
      node.addEventListener('click', () => {
        node.classList.toggle('revealed');
      });
    });
  }

  function extractYouTubeId(url) {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  function buildYouTubeEmbed(videoId) {
    if (!videoId) return null;
    const wrapper = document.createElement('div');
    wrapper.className = 'youtube-embed';
    wrapper.dataset.videoId = videoId;

    const thumb = document.createElement('img');
    thumb.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    thumb.alt = 'YouTube video';
    thumb.loading = 'eager';
    thumb.decoding = 'async';

    const playBtn = document.createElement('div');
    playBtn.className = 'yt-play-btn';
    playBtn.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 68px; height: 48px; background: rgba(255,0,0,0.9); border-radius: 12px; display: flex; align-items: center; justify-content: center; pointer-events: none;';
    playBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';

    wrapper.appendChild(thumb);
    wrapper.appendChild(playBtn);

    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      api.openExternal(`https://www.youtube.com/watch?v=${videoId}`);
    });

    return wrapper;
  }

  function renderRichText(raw = '') {
    if (!raw) return '';
    let safe = escapeHTML(raw);
    const codeBlocks = [];
    safe = safe.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || '', code: code.trim() });
      return `\x00CODEBLOCK${idx}\x00`;
    });
    const inlineCodes = [];
    safe = safe.replace(/`([^`\n]+)`/g, (match, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(code);
      return `\x00INLINECODE${idx}\x00`;
    });
    
    safe = safe.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler">$1</span>');
    
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    safe = safe.replace(/__(.+?)__/g, '<u>$1</u>');
    
    safe = safe.replace(/~~(.+?)~~/g, '<s>$1</s>');
    
    safe = safe.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    safe = safe.replace(/(?<![a-zA-Z0-9])_([^_\n]+)_(?![a-zA-Z0-9])/g, '<em>$1</em>');
    
    safe = safe.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, text) => {
      const level = Math.min(hashes.length, 6);
      return `<h${level} class="md-heading">${text}</h${level}>`;
    });
    
    safe = safe.replace(/^&gt;\s*(.+)$/gm, '<blockquote class="md-quote">$1</blockquote>');
    safe = safe.replace(/<\/blockquote>\n?<blockquote class="md-quote">/g, '<br>');
    
    safe = safe.replace(/^(\*{3,}|-{3,}|_{3,})$/gm, '<hr class="md-hr">');
    
    safe = safe.replace(/^[-*]\s+(.+)$/gm, '<li class="md-li">$1</li>');
    safe = safe.replace(/((?:<li class="md-li">.*<\/li>\n?)+)/g, '<ul class="md-ul">$1</ul>');
    
    safe = safe.replace(/^\d+\.\s+(.+)$/gm, '<li class="md-li-ordered">$1</li>');
    safe = safe.replace(/((?:<li class="md-li-ordered">.*<\/li>\n?)+)/g, '<ol class="md-ol">$1</ol>');
    
    safe = safe.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/gi, (match, label, url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${label}</a>`);
    
    safe = safe.replace(/(?<!href="|">)(https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+)/gi, (match, url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${url}</a>`);
    
    inlineCodes.forEach((code, idx) => {
      safe = safe.replace(`\x00INLINECODE${idx}\x00`, `<code class="md-code">${code}</code>`);
    });
    
    codeBlocks.forEach((block, idx) => {
      const langClass = block.lang ? ` data-lang="${escapeAttr(block.lang)}"` : '';
      safe = safe.replace(`\x00CODEBLOCK${idx}\x00`, `<pre class="md-codeblock"${langClass}><code>${block.code}</code></pre>`);
    });
    
    safe = safe.replace(/\n/g, '<br>');
    safe = safe.replace(/(<\/(?:h[1-6]|blockquote|pre|ul|ol|li|hr)>)<br>/g, '$1');
    safe = safe.replace(/<br>(<(?:h[1-6]|blockquote|pre|ul|ol))/g, '$1');
    
    return safe;
  }

  function buildAttachmentElement(entry) {
    const { attachment } = entry || {};
    if (!attachment) return null;
    const wrapper = document.createElement('div');
    wrapper.className = 'attachment-card';
    const title = document.createElement('div');
    title.className = 'attachment-title';
    title.textContent = attachment.name || attachment.mime || attachment.kind || 'attachment';
    wrapper.appendChild(title);
    if (attachment.kind === 'gif' || attachment.kind === 'image') {
      const media = document.createElement('img');
      media.src = attachment.data || attachment.url || '';
      media.alt = attachment.name || attachment.kind;
      media.style.width = '100%';
      media.style.borderRadius = '12px';
      media.style.display = 'block';
      media.style.cursor = 'pointer';
      media.addEventListener('click', () => {
        if (imageExpandImg && imageExpandModal) {
          imageExpandImg.src = media.src;
          resetImageTransform();
          imageExpandModal.classList.remove('hidden');
          try { imageExpandImg.focus(); } catch (e) {}
        }
      });
      wrapper.appendChild(media);
    } else if (attachment.kind === 'video' || (attachment.mime && String(attachment.mime).toLowerCase().startsWith('video/'))) {
      const media = document.createElement('video');
      media.controls = true;
      media.preload = 'metadata';
      media.playsInline = true;
      media.src = attachment.data || attachment.url || '';
      media.style.width = '100%';
      media.style.borderRadius = '12px';
      media.style.display = 'block';
      media.style.background = 'transparent';
      if (attachment.poster) media.poster = attachment.poster;
      wrapper.appendChild(media);
    } else if ((attachment.mime && String(attachment.mime).toLowerCase().includes('pdf')) || (attachment.name && String(attachment.name).toLowerCase().endsWith('.pdf'))) {
      const container = document.createElement('div');
      container.className = 'pdf-embed-wrapper';
      const toolbar = document.createElement('div');
      toolbar.className = 'pdf-toolbar';
      const titleSpan = document.createElement('div');
      titleSpan.className = 'pdf-title';
      titleSpan.textContent = attachment.name || 'document.pdf';
      const dl = document.createElement('a');
      dl.className = 'file-download ghost-btn';
      dl.textContent = 'Download';
      dl.href = attachment.data || attachment.url || '#';
      dl.download = attachment.name || 'document.pdf';
      toolbar.appendChild(titleSpan);
      toolbar.appendChild(dl);
      const embed = document.createElement('embed');
      embed.type = 'application/pdf';
      embed.src = attachment.data || attachment.url || '';
      embed.className = 'pdf-embed';
      embed.style.width = '100%';
      embed.style.height = '380px';
      embed.style.border = '0';
      embed.style.borderRadius = '10px';
      container.appendChild(toolbar);
      container.appendChild(embed);
      wrapper.appendChild(container);
    } else {
      function fmtSize(bytes) {
        if (!bytes && bytes !== 0) return '';
        const b = Number(bytes) || 0;
        if (b < 1024) return b + ' B';
        const units = ['KB', 'MB', 'GB', 'TB'];
        let i = -1;
        let val = b;
        do {
          val = val / 1024;
          i++;
        } while (val >= 1024 && i < units.length - 1);
        return val.toFixed(val < 10 ? 1 : 0) + ' ' + units[i];
      }

      const fileDiv = document.createElement('div');
      fileDiv.className = 'file-attachment';

      const ext = (attachment.name || '').split('.').pop() || '';
      const thumb = document.createElement('div');
      thumb.className = 'file-thumb';
      thumb.textContent = (ext || 'FILE').slice(0, 4).toUpperCase();

      const info = document.createElement('div');
      info.className = 'file-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'file-name';
      nameEl.textContent = attachment.name || (attachment.url ? attachment.url.split('/').pop() : 'attachment');
      const metaEl = document.createElement('div');
      metaEl.className = 'file-meta';
      const sizeText = attachment.size ? fmtSize(attachment.size) : '';
      metaEl.textContent = [attachment.mime || '', sizeText].filter(Boolean).join(' • ');

      const dl = document.createElement('a');
      dl.className = 'file-download ghost-btn';
      dl.textContent = 'Download';
      dl.href = attachment.data || attachment.url || '#';
      dl.download = attachment.name || 'attachment';
      dl.style.marginLeft = '8px';

      info.appendChild(nameEl);
      info.appendChild(metaEl);
      fileDiv.appendChild(thumb);
      fileDiv.appendChild(info);
      fileDiv.appendChild(dl);
      wrapper.appendChild(fileDiv);
    }

    return wrapper;
  }

  function normalizeEmojiQuery(term = '') {
    const trimmed = term.trim().toLowerCase();
    if (!trimmed) return '';
    if (trimmed.startsWith(':')) return trimmed.replace(/^:+/, '').replace(/:+$/, '');
    return trimmed;
  }

  function filterEmojiList(term = '') {
    const normalized = normalizeEmojiQuery(term);
    if (!normalized) return EMOJI_DATA;
    return EMOJI_DATA.filter((entry) => {
      const matchChar = entry.char.toLowerCase().includes(normalized);
      const matchName = entry.name && entry.name.toLowerCase().includes(normalized);
      const matchSlug = entry.slug && entry.slug.toLowerCase().includes(normalized);
      return matchChar || matchName || matchSlug;
    });
  }

  function renderEmojiGrid(term = '') {
    if (!emojiGrid) return;
    const list = filterEmojiList(term) || [];
    emojiGrid.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'tl-sub';
      empty.textContent = 'No emoji found';
      emojiGrid.appendChild(empty);
      return;
    }

    const BUTTON_PX = 48;
    emojiGrid.style.display = 'grid';
    emojiGrid.style.gridTemplateColumns = `repeat(4, ${BUTTON_PX}px)`;
    emojiGrid.style.gridAutoRows = BUTTON_PX + 'px';
    emojiGrid.style.gap = '6px';
    emojiGrid.style.rowGap = '6px';
    emojiGrid.style.columnGap = '6px';
    emojiGrid.style.alignItems = 'center';
    emojiGrid.style.justifyContent = 'start';
    emojiGrid.style.width = '100%';
    emojiGrid.style.boxSizing = 'border-box';
    emojiGrid.style.overflowY = 'auto';
    emojiGrid.style.overflowX = 'hidden';

    const fragment = document.createDocumentFragment();
    list.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = entry.char;
      btn.title = entry.name || 'emoji';
      btn.style.width = BUTTON_PX + 'px';
      btn.style.height = BUTTON_PX + 'px';
      btn.style.fontSize = '22px';
      btn.style.lineHeight = '1';
      btn.style.padding = '0';
      btn.style.border = '0';
      btn.style.background = 'transparent';
      btn.style.cursor = 'pointer';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.margin = '0';
      btn.style.boxSizing = 'border-box';
      btn.style.borderRadius = '10px';
      btn.addEventListener('click', () => insertAtCursor(textEl, entry.char));
      fragment.appendChild(btn);
    });
    emojiGrid.appendChild(fragment);
  }

  function toggleEmojiPanel(force) {
    emojiVisible = typeof force === 'boolean' ? force : !emojiVisible;
    if (!emojiPanel) return;
    if (emojiVisible) {
      try {
        const rect = emojiBtn ? emojiBtn.getBoundingClientRect() : { left: 20, bottom: window.innerHeight - 80 };
        const BUTTON_PX = 48;
        const VISIBLE_COLS = 4;
        const GAP_PX = 6;
        const panelWidth = Math.max(180, BUTTON_PX * VISIBLE_COLS + GAP_PX * (VISIBLE_COLS - 1) + 20);
        emojiPanel.style.position = 'fixed';
        emojiPanel.style.bottom = 'auto';
        emojiPanel.style.right = 'auto';
        let top = rect.bottom + 6;
        const approxGridHeight = BUTTON_PX * 2 + GAP_PX; 
        const pad = 12;
        const panelHeight = pad + approxGridHeight + 40; 
        if (top + panelHeight > window.innerHeight) {
          top = Math.max(8, rect.top - panelHeight - 6);
        }
        emojiPanel.style.left = Math.max(8, rect.left - panelWidth) + 'px';
        emojiPanel.style.top = top + 'px';
        emojiPanel.style.width = panelWidth + 'px';
        emojiPanel.style.maxHeight = panelHeight + 'px';
        emojiPanel.style.overflow = 'hidden';
        try {
          const innerGridWidth = Math.max(80, panelWidth - 20);
          emojiGrid.style.width = innerGridWidth + 'px';
          emojiGrid.style.boxSizing = 'border-box';
          emojiGrid.style.overflowX = 'hidden';
        } catch (e) {}
      } catch (e) {}
      renderEmojiGrid(emojiSearchInput ? emojiSearchInput.value : '');
      emojiPanel.classList.remove('hidden');
      if (emojiSearchInput) {
        setTimeout(() => {
          emojiSearchInput.focus();
          emojiSearchInput.select();
        }, 0);
      }
    } else {
      emojiPanel.classList.add('hidden');
    }
  }

  function closeEmojiPanel() {
    emojiVisible = false;
    if (emojiPanel) emojiPanel.classList.add('hidden');
    if (emojiSearchInput) emojiSearchInput.blur();
  }

  function hideEmojiHint() {
    emojiSuggestion = null;
    slashHintActive = false;
    if (emojiHint) emojiHint.classList.add('hidden');
  }

  function showSlashHint(message) {
    if (!emojiHint) return false;
    const escaped = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    emojiHint.innerHTML = `<span class="hint-emoji">🏷️</span> ${escaped}`;
    emojiHint.classList.remove('hidden');
    slashHintActive = true;
    return true;
  }

  const eightBallAnswers = [
    'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes -- definitely.', 'You may rely on it.',
    'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.',
    'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
    "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'
  ];

  function maybeShowSlashHint(value) {
    const trimmed = String(value || '').trim();
    const lower = trimmed.toLowerCase();
    if (!lower.startsWith('/')) return false;
    return false;

    if (lower === '/tag') {
      message = 'save <id> <text> | delete <id> | list | <id>';
    } else if (/^\/tag\s+(help|\?)$/i.test(trimmed)) {
      message = 'Press Enter to view every /tag parameter';
    } else if (/^\/tag\s+(list|ls)$/i.test(trimmed)) {
      message = 'Press Enter to list up to 10 saved tags';
    } else if (/^\/tag\s+(delete|remove|del|rm)(\s+|$)/i.test(trimmed)) {
      if (/^\/tag\s+(delete|remove|del|rm)\s+\S+/i.test(trimmed)) message = 'Press Enter to delete this tag';
      else message = 'Now add an id: /tag delete [id]';
    } else if (/^\/tag\s+(save|set|add)(\s+|$)/i.test(trimmed)) {
      const remainder = trimmed.replace(/^\/tag\s+(save|set|add)\s*/i, '');
      if (!remainder) message = 'Now add an id: /tag save [id]';
      else {
        const parts = remainder.split(/\s+/);
        if (parts.length === 1) message = `Now add text: /tag save ${parts[0]} [message]`;
        else message = 'Press Enter to save this tag';
      }
    } else if (/^\/tag\s+use(\s+|$)/i.test(trimmed)) {
      if (/^\/tag\s+use\s+\S+/i.test(trimmed)) message = 'Press Enter to paste this tag into the composer';
      else message = 'Now add an id: /tag use [id]';
    } else {
      message = 'Press Enter to paste the saved text for this tag';
    }

    return showSlashHint(message);
  }

  function formatAfkDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return `${Math.floor(seconds)}s`;
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;    
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  function sendAfkStatus(activate, reason) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: 'afk', status: activate ? 'on' : 'off' };
    if (activate && reason) payload.reason = String(reason).slice(0, 200);
    try { ws.send(JSON.stringify(payload)); } catch (e) {}
  }

  function setLocalAfk(activate, reason) {
    localAfkState = { active: activate, since: activate ? Date.now() : 0, reason: activate ? (reason || '').trim() : '' };
    sendAfkStatus(activate, localAfkState.reason);
    if (activate) {
      let message = `You are now AFK`;
      if (localAfkState.reason) message += `: ${localAfkState.reason}`;
      addEphemeralMessage(message);
    } else {
      addEphemeralMessage('You are no longer AFK.');
    }
  }

  function initRouletteModal() {
    rrModal = document.getElementById('rrModal');
    if (!rrModal) return;
    const close = rrModal.querySelector('#rrClose');
    const btnPvp = rrModal.querySelector('#rrPvP');
    const btnPvAI = rrModal.querySelector('#rrPvAI');
    const start = rrModal.querySelector('#rrStart');
    const body = rrModal.querySelector('.modal-body');
    const overlay = rrModal;
    close && close.addEventListener('click', closeRouletteModal);
    btnPvp && btnPvp.addEventListener('click', () => setRrMode('pvp'));
    btnPvAI && btnPvAI.addEventListener('click', () => setRrMode('pvai'));
    start && start.addEventListener('click', () => executeRrGame());
    overlay && overlay.addEventListener('click', (e) => { if (e.target === overlay) closeRouletteModal(); });
  }

  function openRouletteModal(player1, player2) {
    if (!rrModal) initRouletteModal();
    if (!rrModal) return;
    rrModalOpen = true;
    rrModal.classList.remove('hidden');
    rrMode = 'pvp';
    rrModal.querySelector('#rrP1In').value = player1 || (usernameEl && usernameEl.value ? usernameEl.value : 'Player 1');
    rrModal.querySelector('#rrP2In').value = player2 || '';
    setRrMode('pvp');
    updateRrStatus('Ready to start Russian Roulette.');
  }

  function closeRouletteModal() {
    if (!rrModal) return;
    rrModalOpen = false;
    rrModal.classList.add('hidden');
  }

  function setRrMode(mode) {
    rrMode = mode;
    const row = rrModal.querySelector('#rrP2Row');
    const modeLabel = rrModal.querySelector('#rrModeLabel');
    if (mode === 'pvai') {
      row.style.opacity = '0.35';
      row.style.pointerEvents = 'none';
      modeLabel.textContent = 'Player vs Machine';
      rrModal.querySelector('#rrP2In').value = 'Machine';
    } else {
      row.style.opacity = '1';
      row.style.pointerEvents = 'auto';
      modeLabel.textContent = 'Player vs Player';
      const p2val = rrModal.querySelector('#rrP2In').value;
      if (p2val === 'Machine') rrModal.querySelector('#rrP2In').value = '';
    }
  }

  function updateRrStatus(text) {
    const status = rrModal.querySelector('#rrStatus');
    if (status) status.textContent = text;
  }

  function extractEmojiToken(value, cursor) {
    if (typeof cursor !== 'number') return null;
    const left = value.slice(0, cursor);
    const colonIndex = left.lastIndexOf(':');
    if (colonIndex === -1) return null;
    const fragment = left.slice(colonIndex);
    const match = fragment.match(/^:([a-z0-9_+\-]{1,32})(:?)$/i);
    if (!match) return null;
    const prevChar = colonIndex > 0 ? left.charAt(colonIndex - 1) : '';
    if (prevChar && /[A-Za-z0-9]/.test(prevChar)) return null;
    return { token: match[1], start: colonIndex, end: colonIndex + match[0].length };
  }

  function handleEmojiAutocomplete() {
    if (!textEl) return;
    if (textEl.selectionStart !== textEl.selectionEnd) {
      hideEmojiHint();
      return;
    }
    const tokenInfo = extractEmojiToken(textEl.value, textEl.selectionStart || 0);
    if (!tokenInfo) {
      if (!maybeShowSlashHint(textEl.value)) hideEmojiHint();
      handleMentionAutocomplete();
      return;
    }
    const entry = findShortcodeEntry(tokenInfo.token);
    if (!entry) {
      hideEmojiHint();
      return;
    }
    emojiSuggestion = { start: tokenInfo.start, end: tokenInfo.end, emoji: entry.emoji, code: entry.key };
    if (emojiHint) {
      emojiHint.innerHTML = `<span class="hint-emoji">${entry.emoji}</span> :${entry.key}: -- press Tab/Enter to insert`;
      emojiHint.classList.remove('hidden');
    }
  }

  function applyEmojiSuggestion() {
    if (!emojiSuggestion || !textEl) return false;
    const value = textEl.value;
    const start = emojiSuggestion.start;
    const end = emojiSuggestion.end;
    if (start > value.length || end > value.length || start < 0 || end < start) {
      hideEmojiHint();
      return false;
    }
    const before = value.slice(0, start);
    const after = value.slice(end);
    const nextChar = after.charAt(0);
    const needsSpace = nextChar && !/[\s.,!?)/]/.test(nextChar);
    const insertion = emojiSuggestion.emoji + (needsSpace ? ' ' : '');
    textEl.value = before + insertion + after;
    const newPos = before.length + emojiSuggestion.emoji.length + (needsSpace ? 1 : 0);
    textEl.setSelectionRange(newPos, newPos);
    hideEmojiHint();
    handleEmojiAutocomplete();
    return true;
  }

  function renderMentionList(matches = []) {
    if (!mentionList) return;
    mentionList.innerHTML = '';
    if (!matches || !matches.length) {
      mentionList.classList.add('hidden');
      return;
    }
    const frag = document.createDocumentFragment();
    matches.forEach((name, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost-btn';
      btn.textContent = name;
      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.textAlign = 'left';
      btn.style.marginBottom = '6px';
      if (idx === mentionIndex) {
        const outlineColor = getComputedStyle(document.documentElement).getPropertyValue('--reply-target-outline') || 'rgba(187,134,255,0.6)';
        btn.style.outline = '2px solid ' + outlineColor.trim();
      }
      btn.addEventListener('click', () => {
        if (!mentionSuggestion || !textEl) return;
        const start = mentionSuggestion.start;
        const end = mentionSuggestion.end;
        if (start < 0 || end < start) return;
        const before = textEl.value.slice(0, start);
        const after = textEl.value.slice(end);
        const insertion = `@${name} `;
        textEl.value = before + insertion + after;
        const pos = before.length + insertion.length;
        textEl.setSelectionRange(pos, pos);
        mentionSuggestion = null;
        renderMentionList([]);
        textEl.focus();
      });
      frag.appendChild(btn);
    });
    mentionList.appendChild(frag);
    mentionList.classList.remove('hidden');
  }

  function extractMentionToken(value, cursor) {
    if (typeof cursor !== 'number') return null;
    const left = value.slice(0, cursor);
    const atIndex = left.lastIndexOf('@');
    if (atIndex === -1) return null;
    const prevChar = atIndex > 0 ? left.charAt(atIndex - 1) : '';
    if (prevChar && /[A-Za-z0-9@]/.test(prevChar)) return null;
    const fragment = left.slice(atIndex);
    const match = fragment.match(/^@([A-Za-z0-9_\-]{0,32})$/);
    if (!match) return null;
    return { token: match[1] || '', start: atIndex, end: atIndex + match[0].length };
  }

  function handleMentionAutocomplete() {
    if (!textEl) return;
    if (textEl.selectionStart !== textEl.selectionEnd) {
      renderMentionList([]);
      mentionSuggestion = null;
      return;
    }
    const tokenInfo = extractMentionToken(textEl.value, textEl.selectionStart || 0);
    if (!tokenInfo) {
      renderMentionList([]);
      mentionSuggestion = null;
      return;
    }
    const token = (tokenInfo.token || '').toLowerCase();
    const matches = usersList.filter(u => (u || '').toLowerCase().startsWith(token)).slice(0, 8);
    if (!matches.length) {
      renderMentionList([]);
      mentionSuggestion = null;
      return;
    }
    mentionIndex = 0;
    mentionSuggestion = { start: tokenInfo.start, end: tokenInfo.end, token };
    renderMentionList(matches);
  }

  function applyMentionSelection() {
    if (!mentionSuggestion || !textEl) return false;
    const matches = usersList.filter(u => (u || '').toLowerCase().startsWith(mentionSuggestion.token)).slice(0, 8);
    if (!matches.length) return false;
    const idx = Math.max(0, Math.min(mentionIndex, matches.length - 1));
    const name = matches[idx];
    if (!name) return false;
    const start = mentionSuggestion.start;
    const end = mentionSuggestion.end;
    const before = textEl.value.slice(0, start);
    const after = textEl.value.slice(end);
    const insertion = `@${name} `;
    textEl.value = before + insertion + after;
    const pos = before.length + insertion.length;
    textEl.setSelectionRange(pos, pos);
    mentionSuggestion = null;
    renderMentionList([]);
    return true;
  }

  function openGifModal() {
    if (!gifModal) return;
    gifModalVisible = true;
    gifModal.classList.remove('hidden');
    gifSearch && gifSearch.focus();
    if (gifResults && !gifResults.childElementCount) {
      searchGiphy('');
    }
  }

  function closeGifModal() {
    gifModalVisible = false;
    if (gifModal) gifModal.classList.add('hidden');
  }

  async function renderFavoritesView() {
    if (!gifResults || !gifStatus) return;
    inFavoritesView = true;
    suppressAutoFavorites = true;
    if (gifSearch) gifSearch.style.display = 'none';
    if (gifSearchBtn) gifSearchBtn.style.display = 'none';
    gifStatus.textContent = '';
    gifResults.innerHTML = '';
    const titleEl = document.getElementById('gifModalTitle');
    if (titleEl) titleEl.textContent = 'GIPHY GIF (Favorites)';
    const favs = loadGifFavorites();
    if (!favs.length) {
      const empty = document.createElement('div');
      empty.className = 'tl-sub';
      empty.textContent = 'No favorites yet. Click the star on any GIF to add it here.';
      gifResults.appendChild(empty);
      return;
    }
    favs.forEach((url) => {
      const container = document.createElement('div');
      container.className = 'gif-item';
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'gif';
      img.addEventListener('click', () => {
        queueAttachment({ kind: 'gif', url, name: 'GIPHY GIF' });
        closeGifModal();
        textEl.focus();
      });
      const star = document.createElement('button');
      star.className = 'gif-star fav';
      star.setAttribute('aria-pressed', 'true');
      star.title = 'Unfavorite';
      star.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 .587l3.668 7.431L23.6 9.75l-5.8 5.657L19.336 24 12 19.897 4.664 24l1.536-8.593L.4 9.75l7.932-1.732L12 .587z"/></svg>';
      star.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleGifFavorite(url);
        renderFavoritesView();
      });
      container.appendChild(img);
      container.appendChild(star);
      gifResults.appendChild(container);
    });
  }

  async function searchGiphy(query) {
    if (!gifResults || !gifStatus) return;
    const raw = (query || (gifSearch && gifSearch.value) || '').trim();
    const showFavTile = !raw && !suppressAutoFavorites;
    const q = raw || 'reaction';
    gifStatus.textContent = 'Searching…';
    gifResults.innerHTML = '';
    if (showFavTile) {
      const favTile = document.createElement('div');
      favTile.className = 'gif-fav-tile';
      favTile.textContent = 'FAVORITES';
      favTile.title = 'View favorite GIFs';
      favTile.addEventListener('click', () => renderFavoritesView());
      gifResults.appendChild(favTile);
    }
    if (raw) suppressAutoFavorites = false;
    const seq = ++giphySearchSeq;
    try {
      const urls = await fetchGiphyCandidates(q);
      if (seq !== giphySearchSeq) return; 
      if (!urls.length) {
        gifStatus.textContent = 'No GIFs found.';
        return;
      }
      gifStatus.textContent = '';
      urls.forEach((url) => {
        const container = document.createElement('div');
        container.className = 'gif-item';
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'gif';
        img.addEventListener('click', () => {
          queueAttachment({ kind: 'gif', url, name: 'GIPHY GIF' });
          closeGifModal();
          textEl.focus();
        });
        const star = document.createElement('button');
        star.className = 'gif-star';
        const fav = isGifFavorite(url);
        if (fav) star.classList.add('fav');
        star.setAttribute('aria-pressed', fav ? 'true' : 'false');
        star.title = fav ? 'Unfavorite' : 'Favorite';
        star.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 .587l3.668 7.431L23.6 9.75l-5.8 5.657L19.336 24 12 19.897 4.664 24l1.536-8.593L.4 9.75l7.932-1.732L12 .587z"/></svg>';
        star.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const list = toggleGifFavorite(url);
          const nowFav = list.indexOf(url) !== -1;
          star.setAttribute('aria-pressed', nowFav ? 'true' : 'false');
          if (nowFav) {
            star.classList.add('fav');
            star.title = 'Unfavorite';
          } else {
            star.classList.remove('fav');
            star.title = 'Favorite';
          }
        });
        container.appendChild(img);
        container.appendChild(star);
        gifResults.appendChild(container);
      });
    } catch (err) {
      if (seq !== giphySearchSeq) return;
      console.warn('GIPHY search failed', err);
      const errMsg = (err && err.message) ? err.message : 'Try again in a moment.';
      gifStatus.textContent = `GIPHY search failed (${errMsg}).`;
    }
  }

  function handleFileSelection(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert('File too large (max 20MB).');
      return;
    }
    if (file.type === 'image/gif') {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        queueAttachment({ kind: 'gif', data: dataUrl, mime: file.type, name: file.name.slice(0, 80) });
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        queueAttachment({ kind: 'image', data: dataUrl, mime: file.type, name: file.name.slice(0, 80) });
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        queueAttachment({ kind: 'file', data: dataUrl, mime: file.type, name: file.name.slice(0, 80) });
      };
      reader.readAsDataURL(file);
    }
  }

  function queueAttachment(attachment) {
    pendingAttachment = attachment;
    if (!attachmentPreview) return;
    attachmentPreview.classList.remove('hidden');
    if (attachmentPreviewName) attachmentPreviewName.textContent = attachment.name || attachment.mime || attachment.kind || 'attachment';
    if (attachmentPreviewThumb) {
      if (attachment.kind === 'gif' || attachment.kind === 'image') {
        attachmentPreviewThumb.textContent = '';
        const img = document.createElement('img');
        img.src = attachment.data || attachment.url || '';
        img.alt = 'attachment';
        attachmentPreviewThumb.appendChild(img);
      } else {
        attachmentPreviewThumb.textContent = attachment.name ? attachment.name.split('.').pop().slice(0,4).toUpperCase() : 'FILE';
      }
    }
  }

  function clearAttachmentPreview() {
    pendingAttachment = null;
    if (attachmentPreview) attachmentPreview.classList.add('hidden');
    if (attachmentPreviewThumb) attachmentPreviewThumb.textContent = 'ATT';
    if (attachmentPreviewName) attachmentPreviewName.textContent = 'attachment';
  }

  function insertAtCursor(input, value) {
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const current = input.value;
    input.value = current.slice(0, start) + value + current.slice(end);
    const cursor = start + value.length;
    input.setSelectionRange(cursor, cursor);
    input.focus();
    handleEmojiAutocomplete();
  }

  let resizeAnchor = null;
  let resizeRafId = 0;
  let pendingResizeWidth = 0;
  let pendingResizeHeight = 0;
  let lastResizeWidth = 0;
  let lastResizeHeight = 0;
  const mentionDetectionRegex = /(^|[^A-Za-z0-9@])@([a-z0-9_][a-z0-9_\-]{0,31})(?=$|[^A-Za-z0-9@])/gi;
  let audioCtx = null;
  let lastMentionSound = 0;

  function stopResizeTracking() {
    if (!resizeAnchor) return;
    if (resizeRafId) {
      try { cancelAnimationFrame(resizeRafId); } catch (e) {}
      resizeRafId = 0;
    }
    if (pendingResizeWidth > 0 && pendingResizeHeight > 0) {
      if (pendingResizeWidth !== lastResizeWidth || pendingResizeHeight !== lastResizeHeight) {
        api.send('resize-window', { width: pendingResizeWidth, height: pendingResizeHeight });
        lastResizeWidth = pendingResizeWidth;
        lastResizeHeight = pendingResizeHeight;
      }
      pendingResizeWidth = 0;
      pendingResizeHeight = 0;
    }
    resizeAnchor = null;
    document.removeEventListener('mousemove', handleResizeDrag);
    document.removeEventListener('mouseup', stopResizeTracking);
    window.removeEventListener('blur', stopResizeTracking);
    document.body.classList.remove('is-resizing');
  }

  function extractMentionsFromText(text = '') {
    if (!text) return [];
    const mentions = [];
    let match;
    mentionDetectionRegex.lastIndex = 0;
    const usernames = usersList.map(u => u.toLowerCase());
    while ((match = mentionDetectionRegex.exec(text))) {
      const username = (match[2] || '').toLowerCase();
      if (usernames.includes(username)) {
        mentions.push(username);
      }
    }
    return mentions;
  }

  function decorateMentions(container) {
    if (!container) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node || !node.nodeValue) continue;
      mentionDetectionRegex.lastIndex = 0;
      if (mentionDetectionRegex.test(node.nodeValue)) {
        targets.push(node);
      }
    }
    const usernames = usersList.map(u => u.toLowerCase());
    targets.forEach((node) => {
      const text = node.nodeValue;
      mentionDetectionRegex.lastIndex = 0;
      let match;
      let cursor = 0;
      const frag = document.createDocumentFragment();
      while ((match = mentionDetectionRegex.exec(text))) {
        const prefix = match[1] || '';
        const username = match[2] || '';
        const mention = username ? `@${username}` : '';
        const isValidUser = usernames.includes(username.toLowerCase());
        const matchIndex = match.index;
        const prefixEnd = matchIndex + prefix.length;
        const mentionStart = prefixEnd;
        const mentionEnd = mentionStart + mention.length;
        const leading = text.slice(cursor, prefixEnd);
        if (leading) frag.appendChild(document.createTextNode(leading));
        if (mention) {
          if (isValidUser) {
            const span = document.createElement('span');
            span.className = 'mention-token';
            span.textContent = mention;
            frag.appendChild(span);
          } else {
            frag.appendChild(document.createTextNode(mention));
          }
        }
        cursor = mentionEnd;
      }
      const tail = text.slice(cursor);
      if (tail) frag.appendChild(document.createTextNode(tail));
      node.parentNode && node.parentNode.replaceChild(frag, node);
    });
  }

  function playMentionTone() {
    const now = Date.now();
    if (now - lastMentionSound < 350) return;
    lastMentionSound = now;
    try {
      const audio = new Audio('../../assets/sounds/notification.mp3');
      audio.volume = 0.5;  
      audio.play().catch(e => console.warn('Failed to play mention sound:', e));
    } catch (e) {
      console.warn('Error creating mention audio:', e);
    }
  }

  function summarizeMessageForReply(msg = {}) {
    if (msg.text && msg.text.trim()) return msg.text.trim().slice(0, 160);
    if (msg.attachment) {
      const kind = (msg.attachment.kind || 'attachment').toUpperCase();
      const name = msg.attachment.name || msg.attachment.mime || '';
      return `[${kind}] ${name}`.trim();
    }
    return '';
  }

  function setReplyPreview(data) {
    if (!replyPreview || !replyPreviewName || !replyPreviewText) return;
    if (!data) {
      replyPreview.classList.add('hidden');
      replyPreviewName.textContent = '';
      replyPreviewText.textContent = '';
      return;
    }
    replyPreview.classList.remove('hidden');
    replyPreviewName.textContent = data.from || 'user';
    replyPreviewText.textContent = data.text || '';
  }

  function clearReplyPreviewUI() {
    pendingReply = null;
    setReplyPreview(null);
  }

  function beginReplyToMessage(msg) {
    if (!msg) return;
    const refId = msg.id || msg.clientId;
    if (!refId) return;
    pendingReply = {
      id: refId,
      from: msg.from || 'anon',
      text: summarizeMessageForReply(msg)
    };
    setReplyPreview(pendingReply);
    if (textEl) textEl.focus();
  }

  function openPollModal() {
    if (!pollModal) return;
    pollModalVisible = true;
    pollModal.classList.remove('hidden');
    pollQuestion.focus();
    pollQuestion.value = '';
    pollOptions.innerHTML = '';
    addPollOption();
    addPollOption();
    pollStatus.textContent = '';
  }

  function closePollModal() {
    pollModalVisible = false;
    if (pollModal) pollModal.classList.add('hidden');
  }

  function addPollOption() {
    const input = document.createElement('input');
    input.className = 'input poll-option';
    input.placeholder = `Option ${pollOptions.children.length + 1}`;
    input.maxLength = 100;
    pollOptions.appendChild(input);
  }

  function createPoll() {
    const question = pollQuestion.value.trim();
    const options = Array.from(pollOptions.querySelectorAll('.poll-option')).map(inp => inp.value.trim()).filter(opt => opt);
    if (!question) {
      pollStatus.textContent = 'Question required.';
      return;
    }
    if (options.length < 2) {
      pollStatus.textContent = 'At least 2 options required.';
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pollStatus.textContent = 'Not connected.';
      return;
    }
    const payload = { type: 'poll', question, options };
    ws.send(JSON.stringify(payload));
    closePollModal();
  }

  function renderPoll(poll) {
    const container = document.createElement('div');
    container.className = 'poll-container';
    container.dataset.pollId = poll.id;
    const questionEl = document.createElement('div');
    questionEl.className = 'poll-question';
    questionEl.textContent = poll.question;
    container.appendChild(questionEl);
    const optionsEl = document.createElement('div');
    optionsEl.className = 'poll-options';
    
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);
    
    poll.options.forEach((opt, idx) => {
      const optEl = document.createElement('button');
      optEl.className = 'poll-option-btn';
      optEl.dataset.optionIndex = idx;
      
      const headerEl = document.createElement('div');
      headerEl.className = 'poll-option-header';
      
      const textEl = document.createElement('span');
      textEl.className = 'poll-option-text';
      textEl.textContent = opt.text;
      
      const countEl = document.createElement('span');
      countEl.className = 'poll-option-count';
      const percentage = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
      countEl.textContent = `${opt.votes} (${percentage}%)`;
      
      headerEl.appendChild(textEl);
      headerEl.appendChild(countEl);
      optEl.appendChild(headerEl);
      
      const progressEl = document.createElement('div');
      progressEl.className = 'poll-progress';
      const fillEl = document.createElement('div');
      fillEl.className = 'poll-progress-fill';
      fillEl.style.width = `${percentage}%`;
      progressEl.appendChild(fillEl);
      optEl.appendChild(progressEl);
      
      optEl.addEventListener('click', () => votePoll(poll.id, idx));
      optionsEl.appendChild(optEl);
    });
    container.appendChild(optionsEl);
    return container;
  }

  function updatePollDisplay(poll) {
    const container = document.querySelector(`[data-poll-id="${poll.id}"]`);
    if (!container) return;
    const optionsEl = container.querySelector('.poll-options');
    if (!optionsEl) return;
    optionsEl.innerHTML = '';
    
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);
    
    poll.options.forEach((opt, idx) => {
      const optEl = document.createElement('button');
      optEl.className = 'poll-option-btn';
      optEl.dataset.optionIndex = idx;
      
      const headerEl = document.createElement('div');
      headerEl.className = 'poll-option-header';
      
      const textEl = document.createElement('span');
      textEl.className = 'poll-option-text';
      textEl.textContent = opt.text;
      
      const countEl = document.createElement('span');
      countEl.className = 'poll-option-count';
      const percentage = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
      countEl.textContent = `${opt.votes} (${percentage}%)`;
      
      headerEl.appendChild(textEl);
      headerEl.appendChild(countEl);
      optEl.appendChild(headerEl);
      
      const progressEl = document.createElement('div');
      progressEl.className = 'poll-progress';
      const fillEl = document.createElement('div');
      fillEl.className = 'poll-progress-fill';
      fillEl.style.width = `${percentage}%`;
      progressEl.appendChild(fillEl);
      optEl.appendChild(progressEl);
      
      optEl.addEventListener('click', () => votePoll(poll.id, idx));
      optionsEl.appendChild(optEl);
    });
  }

  function votePoll(pollId, optionIndex) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: 'vote', pollId, optionIndex };
    ws.send(JSON.stringify(payload));
  }

  const _reactionBtnStyle = 'width:44px;height:44px;font-size:20px;line-height:1;padding:0;border:0;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;margin:0;box-sizing:border-box';
  const _cachedReactionBtns = [];
  let _reactionCacheReady = false;
  let _reactionCacheWarming = false;
  let _reactionCacheCursor = 0;
  let _reactionRenderToken = 0;

  function buildReactionButton(entry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = entry.char;
    btn.title = entry.name;
    btn.style.cssText = _reactionBtnStyle;
    btn._emojiChar = entry.char;
    btn._searchKey = (entry.char + '\n' + (entry.name || '') + '\n' + (entry.slug || '')).toLowerCase();
    return btn;
  }

  function scheduleReactionCacheWarmup() {
    if (_reactionCacheReady || _reactionCacheWarming) return;
    _reactionCacheWarming = true;

    const runBatch = (deadline) => {
      let builtInBatch = 0;
      while (_reactionCacheCursor < EMOJI_DATA.length) {
        if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 2 && builtInBatch >= 40) {
          break;
        }
        if (!deadline && builtInBatch >= 140) {
          break;
        }
        _cachedReactionBtns.push(buildReactionButton(EMOJI_DATA[_reactionCacheCursor]));
        _reactionCacheCursor += 1;
        builtInBatch += 1;
      }

      if (_reactionCacheCursor < EMOJI_DATA.length) {
        queueNext();
        return;
      }

      _reactionCacheReady = true;
      _reactionCacheWarming = false;
      if (!reactionsPanel.classList.contains('hidden')) {
        filterReactions(reactionsSearch.value || '');
      }
    };

    const queueNext = () => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(runBatch, { timeout: 120 });
      } else {
        setTimeout(() => runBatch(), 0);
      }
    };

    queueNext();
  }

  function filterReactions(term) {
    if (!_reactionCacheReady && !_reactionCacheWarming) {
      scheduleReactionCacheWarmup();
    }
    const normalized = normalizeEmojiQuery(term);
    const btns = normalized
      ? _cachedReactionBtns.filter(btn => btn._searchKey.includes(normalized))
      : _cachedReactionBtns;
    const token = ++_reactionRenderToken;
    const BATCH_SIZE = 96;
    let index = 0;
    reactionsGrid.textContent = '';
    const appendBatch = () => {
      if (token !== _reactionRenderToken) return;
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + BATCH_SIZE, btns.length);
      for (; index < end; index++) {
        fragment.appendChild(btns[index]);
      }
      reactionsGrid.appendChild(fragment);
      if (index < btns.length) {
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(appendBatch);
        } else {
          setTimeout(appendBatch, 0);
        }
      }
    };
    appendBatch();
  }

  function showReactionPanel(messageId, button) {
    if (!messageId || !reactionsPanel || !reactionsGrid) return;
    currentMessageId = messageId;
    const rect = button.getBoundingClientRect();
    const BUTTON_PX = 44;
    const VISIBLE_COLS = 4;
    const GAP_PX = 6;
    const totalEmojis = (typeof EMOJI_DATA !== 'undefined' ? EMOJI_DATA.length : 24);
    const possibleRows = Math.max(2, Math.ceil(totalEmojis / VISIBLE_COLS));
    const fullGridHeight = possibleRows * BUTTON_PX + (possibleRows - 1) * GAP_PX;
    const PREFERRED_ROWS = 2;
    const preferredGridHeight = PREFERRED_ROWS * BUTTON_PX + (PREFERRED_ROWS - 1) * GAP_PX;
    const panelWidth = Math.max(180, BUTTON_PX * VISIBLE_COLS + GAP_PX * (VISIBLE_COLS - 1) + 20);
    const headerEl = reactionsPanel.querySelector('.panel-header');
    const searchEl = reactionsPanel.querySelector('.emoji-search');
    const cs = window.getComputedStyle(reactionsPanel);
    const padTop = parseFloat(cs.paddingTop || '0') || 0;
    const padBottom = parseFloat(cs.paddingBottom || '0') || 0;
    const headerH = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;
    const searchH = searchEl ? Math.ceil(searchEl.getBoundingClientRect().height) : 0;
    const extra = 6; 
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 10);
    const spaceAbove = Math.max(0, rect.top - 10);
    const availableForGrid = Math.max(0, Math.max(spaceBelow, spaceAbove) - (padTop + padBottom + headerH + searchH + extra));
    const visibleGridHeight = Math.min(fullGridHeight, Math.max(preferredGridHeight, Math.min(preferredGridHeight, availableForGrid)));
    const finalGridHeight = Math.max(BUTTON_PX, visibleGridHeight);
    const panelHeight = padTop + headerH + searchH + finalGridHeight + padBottom + extra;
    let top = rect.bottom + 5;
    if (top + panelHeight > window.innerHeight && spaceAbove > spaceBelow) {
      top = rect.top - panelHeight - 5;
    } else if (top + panelHeight > window.innerHeight) {
      top = Math.max(10, window.innerHeight - panelHeight - 10);
    }

    reactionsPanel.style.position = 'fixed';
    reactionsPanel.style.bottom = 'auto';
    reactionsPanel.style.right = 'auto';
    reactionsPanel.style.left = Math.max(10, rect.left - panelWidth) + 'px';
    const NUDGE_UP_PX = 25; 
    let adjustedTop = Math.round(top - NUDGE_UP_PX);
    const minTop = 8;
    const maxTop = Math.max(minTop, window.innerHeight - panelHeight - 8);
    if (adjustedTop < minTop) adjustedTop = minTop;
    if (adjustedTop > maxTop) adjustedTop = maxTop;
    reactionsPanel.style.top = adjustedTop + 'px';
    reactionsPanel.style.width = panelWidth + 'px';
    reactionsPanel.style.maxHeight = panelHeight + 'px';
    reactionsGrid.style.display = 'grid';
    reactionsGrid.style.gridAutoFlow = 'row';
    reactionsGrid.style.gridAutoRows = BUTTON_PX + 'px';
    reactionsGrid.style.gridTemplateColumns = `repeat(${VISIBLE_COLS}, ${BUTTON_PX}px)`;
    reactionsGrid.style.gap = GAP_PX + 'px';
    reactionsGrid.style.rowGap = GAP_PX + 'px';
    reactionsGrid.style.columnGap = GAP_PX + 'px';
    reactionsGrid.style.alignItems = 'center';
    reactionsGrid.style.alignContent = 'start';
    reactionsGrid.style.justifyContent = 'start';
    reactionsGrid.style.boxSizing = 'border-box';
    reactionsGrid.style.width = (panelWidth - 20) + 'px';
    reactionsGrid.style.height = finalGridHeight + 'px';
    reactionsGrid.style.maxHeight = finalGridHeight + 'px';
    reactionsGrid.style.overflowY = 'auto';
    reactionsGrid.style.overflowX = 'hidden';
    reactionsPanel.classList.remove('hidden');
    reactionsPanel.style.overflow = 'hidden';
    reactionsSearch.value = '';
    if (!_reactionCacheReady) scheduleReactionCacheWarmup();
    filterReactions('');
    setTimeout(() => reactionsSearch.focus(), 0);
  }

  function sendReaction(messageId, emoji) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'react', messageId, emoji }));
  }

  scheduleReactionCacheWarmup();

  function buildReplyReference(reply) {
    if (!reply || !reply.id) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reply-reference';
    const author = document.createElement('div');
    author.className = 'reply-reference-author';
    author.textContent = reply.from ? `@${reply.from}` : 'Reply';
    const snippet = document.createElement('div');
    snippet.className = 'reply-reference-text';
    snippet.textContent = reply.text || 'View message';
    btn.appendChild(author);
    btn.appendChild(snippet);
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollToMessage(reply.id);
    });
    return btn;
  }

  function handleResizeDrag(event) {
    if (!resizeAnchor) return;
    const deltaX = event.screenX - resizeAnchor.x;
    const deltaY = event.screenY - resizeAnchor.y;
    const width = Math.max(MIN_WINDOW_WIDTH, Math.round(resizeAnchor.width + deltaX));
    const height = Math.max(MIN_WINDOW_HEIGHT, Math.round(resizeAnchor.height + deltaY));
    pendingResizeWidth = width;
    pendingResizeHeight = height;
    if (resizeRafId) return;
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = 0;
      if (!pendingResizeWidth || !pendingResizeHeight) return;
      if (pendingResizeWidth === lastResizeWidth && pendingResizeHeight === lastResizeHeight) return;
      api.send('resize-window', { width: pendingResizeWidth, height: pendingResizeHeight });
      lastResizeWidth = pendingResizeWidth;
      lastResizeHeight = pendingResizeHeight;
    });
  }

  function beginResizeDrag(event) {
    event.preventDefault();
    resizeAnchor = {
      x: event.screenX,
      y: event.screenY,
      width: window.innerWidth,
      height: window.innerHeight
    };
    lastResizeWidth = window.innerWidth;
    lastResizeHeight = window.innerHeight;
    pendingResizeWidth = 0;
    pendingResizeHeight = 0;
    document.body.classList.add('is-resizing');
    document.addEventListener('mousemove', handleResizeDrag);
    document.addEventListener('mouseup', stopResizeTracking);
    window.addEventListener('blur', stopResizeTracking);
  }

  function startPingLoop() {
    stopPingLoop();
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        } catch (e) {}
      }
    }, 30000);
  }

  function stopPingLoop() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }
  const spamTrackerByUser = new Map();
  const mentionSoundTracker = new Map();

  function normalizeEightBallMessage(msg) {
    if (!msg || !msg.text) return msg;
    const marker = '@@8BALL@@';
    const text = String(msg.text || '');
    if (!text.startsWith(marker)) return msg;
    const body = text.slice(marker.length).trim();
    let q = '';
    let a = '';
    let user = 'someone';
    try {
      const parsed = JSON.parse(body);
      q = (parsed && parsed.q) ? String(parsed.q) : '';
      a = (parsed && parsed.a) ? String(parsed.a) : '';
      user = (parsed && parsed.user) ? String(parsed.user) : 'someone';
    } catch (e) {
      a = body;
    }
    const formatted = `**__🎱8Ball__**\nQuestion asked by ${user}:\n${q || '[no question]'}\nAnswer:\n${a || 'Reply hazy, try again.'}`;
    return {
      ...msg,
      from: 'Magic8Ball',
      category: 'system',
      kind: 'text',
      text: formatted
    };
  }

function ensureRouletteStyles() {
  if (document.getElementById('rr-widget-styles')) return;
  const style = document.createElement('style');
  style.id = 'rr-widget-styles';
  style.textContent = `
    .rr-widget {
      font-family: 'DM Sans', system-ui, sans-serif;
      --rr-bg:        #271049;
      --rr-panel:     #2f155f;
      --rr-border:    rgba(179,115,255,0.28);
      --rr-text:      #e8dbff;
      --rr-muted:     #b4a6d8;
      --rr-hint:      #8f79bb;
      --rr-red:       #ff8dc2;
      --rr-red-lt:    rgba(255,141,194,0.23);
      --rr-amber:     #f2bc7a;
      --rr-amber-lt:  rgba(242,188,122,0.24);
      --rr-btn-bg:    #7f57dd;
      --rr-btn-fg:    #fff;
      --rr-btn-bd:    rgba(170,130,240,0.58);
      --rr-spin-bd:   #a47adf;
      --rr-add-bd:    #f8b0c6;
      --rr-add-bg:    rgba(248,176,198,0.12);
      --rr-life:      #ff80c8;
      --rr-life-dead: #3a2a58;
      --rr-cyl-bg:    #3b216e;
      --rr-cyl-bd:    #8666c6;
      --rr-ch-bg:     #56378c;
      --rr-ch-bd:     #9a77d7;
    }

    :root[data-theme='shockwire']    .rr-widget { --rr-bg:#0d0d00; --rr-panel:#1a1800; --rr-border:rgba(255,210,0,0.25); --rr-text:#fff5b0; --rr-muted:#b89e30; --rr-hint:#6a5a10; --rr-red:#ffd000; --rr-red-lt:rgba(255,208,0,0.18); --rr-amber:#ff9800; --rr-amber-lt:rgba(255,152,0,0.14); --rr-btn-bg:#e6b800; --rr-btn-fg:#0a0800; --rr-btn-bd:rgba(255,210,0,0.6); --rr-spin-bd:rgba(255,210,0,0.3); --rr-add-bd:rgba(255,152,0,0.45); --rr-add-bg:rgba(255,152,0,0.07); --rr-life:#ffd000; --rr-life-dead:#2a2500; --rr-cyl-bg:#1a1800; --rr-cyl-bd:rgba(255,210,0,0.3); --rr-ch-bg:#2e2a00; --rr-ch-bd:rgba(255,210,0,0.22); }
    :root[data-theme='royalchain']   .rr-widget { --rr-bg:#08071a; --rr-panel:#0f0d2e; --rr-border:rgba(212,172,80,0.35); --rr-text:#f5e4a8; --rr-muted:#c4a84c; --rr-hint:#7a6428; --rr-red:#d4ac40; --rr-red-lt:rgba(212,172,64,0.22); --rr-amber:#5090e8; --rr-amber-lt:rgba(80,144,232,0.14); --rr-btn-bg:#d4ac40; --rr-btn-fg:#06051a; --rr-btn-bd:rgba(212,172,64,0.65); --rr-spin-bd:rgba(212,172,64,0.4); --rr-add-bd:rgba(80,144,232,0.45); --rr-add-bg:rgba(80,144,232,0.08); --rr-life:#d4ac40; --rr-life-dead:#141030; --rr-cyl-bg:#0c0a22; --rr-cyl-bd:rgba(212,172,64,0.35); --rr-ch-bg:#18143a; --rr-ch-bd:rgba(212,172,64,0.25); }
    :root[data-theme='bloodlink']    .rr-widget { --rr-bg:#17070b; --rr-panel:#230a13; --rr-border:rgba(194,42,55,0.2); --rr-text:#FFD6DB; --rr-muted:#a14556; --rr-hint:#6d1f2a; --rr-red:#dd3a57; --rr-red-lt:rgba(221,58,87,0.18); --rr-amber:#c06f4b; --rr-amber-lt:rgba(192,111,75,0.14); --rr-btn-bg:#b53c50; --rr-btn-fg:#fff; --rr-btn-bd:rgba(195,66,90,0.45); --rr-spin-bd:rgba(195,66,90,0.26); --rr-add-bd:rgba(192,111,75,0.35); --rr-add-bg:rgba(192,111,75,0.08); --rr-life:#dd3a57; --rr-life-dead:#2f1822; --rr-cyl-bg:#2c141f; --rr-cyl-bd:rgba(194,42,55,0.27); --rr-ch-bg:#431c2b; --rr-ch-bd:rgba(194,42,55,0.2); }
    :root[data-theme='rosepetal']    .rr-widget { --rr-bg:#1a0a12; --rr-panel:#2b1020; --rr-border:rgba(255,120,180,0.22); --rr-text:#ffcce8; --rr-muted:#c47fa0; --rr-hint:#7a3a58; --rr-red:#ff6eb0; --rr-red-lt:rgba(255,110,176,0.2); --rr-amber:#d4a0c0; --rr-amber-lt:rgba(212,160,192,0.15); --rr-btn-bg:#cc3f7a; --rr-btn-fg:#fff; --rr-btn-bd:rgba(255,110,176,0.5); --rr-spin-bd:rgba(200,100,150,0.4); --rr-add-bd:rgba(212,160,192,0.45); --rr-add-bg:rgba(212,160,192,0.08); --rr-life:#ff6eb0; --rr-life-dead:#3a1428; --rr-cyl-bg:#2b1020; --rr-cyl-bd:rgba(255,120,180,0.3); --rr-ch-bg:#3d1830; --rr-ch-bd:rgba(255,120,180,0.22); }
    :root[data-theme='toxicreactor'] .rr-widget { --rr-bg:#0E1509; --rr-panel:#172010; --rr-border:rgba(136,215,77,0.15); --rr-text:#CFFF95; --rr-muted:#608040; --rr-hint:#304020; --rr-red:#88D74D; --rr-red-lt:rgba(136,215,77,0.12); --rr-amber:#C0D840; --rr-amber-lt:rgba(192,216,64,0.1); --rr-btn-bg:#88D74D; --rr-btn-fg:#042104; --rr-btn-bd:rgba(136,215,77,0.5); --rr-spin-bd:rgba(136,215,77,0.22); --rr-add-bd:rgba(192,216,64,0.38); --rr-add-bg:rgba(192,216,64,0.06); --rr-life:#88D74D; --rr-life-dead:#1C2810; --rr-cyl-bg:#172010; --rr-cyl-bd:rgba(136,215,77,0.25); --rr-ch-bg:#1E2A14; --rr-ch-bd:rgba(136,215,77,0.18); }


    .rr-widget .rr-card {
      background: var(--rr-bg);
      border-radius: 18px;
      border: 1px solid var(--rr-border);
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }


    .rr-widget .rr-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 10px;
      border-bottom: 0.5px solid var(--rr-border);
    }
    .rr-widget .rr-eyebrow {
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--rr-hint);
      font-weight: 400;
    }
    .rr-widget .rr-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--rr-text);
      letter-spacing: -0.3px;
    }


    .rr-widget .rr-arena {
      display: grid;
      grid-template-columns: 1fr 88px 1fr;
      align-items: stretch;
      border-bottom: 0.5px solid var(--rr-border);
    }
    .rr-widget .rr-player {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 14px 10px;
      transition: background 0.2s;
    }
    .rr-widget .rr-player.active  { background: rgba(180,30,30,0.04); }
    .rr-widget .rr-player.p1      { border-right: 0.5px solid var(--rr-border); }
    .rr-widget .rr-player.p2      { border-left:  0.5px solid var(--rr-border); }

    .rr-widget .rr-sym {
      width: 38px;
      height: 38px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1.5px solid transparent;
      transition: border-color 0.2s;
      flex-shrink: 0;
    }
    .rr-widget .rr-sym svg { width: 20px; height: 20px; display: block; }
    .rr-widget .rr-sym.s1  { background: #F0EEFF; border-color: #DDD8FF; }
    .rr-widget .rr-sym.s2  { background: #FFF0EE; border-color: var(--rr-red-lt); }
    .rr-widget .rr-sym.sai { background: var(--rr-panel); border-color: var(--rr-border); }
    .rr-widget .rr-player.active .rr-sym { border-color: rgba(180,30,30,0.3); }

    .rr-widget .rr-pname {
      font-size: 12px;
      font-weight: 500;
      color: var(--rr-text);
      max-width: 90px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
    }
    .rr-widget .rr-psub {
      font-size: 10px;
      color: var(--rr-hint);
      text-align: center;
      min-height: 13px;
      transition: color 0.15s;
    }
    .rr-widget .rr-player.active .rr-psub { color: var(--rr-red); font-weight: 500; }

    .rr-widget .rr-lives { display: flex; gap: 3px; }
    .rr-widget .rr-life {
      width: 7px; height: 13px;
      border-radius: 4px 4px 2px 2px;
      background: var(--rr-life);
      transition: background 0.3s;
      position: relative;
    }
    .rr-widget .rr-life::after {
      content: '';
      position: absolute;
      top: 2px; left: 50%;
      transform: translateX(-50%);
      width: 2px; height: 4px;
      border-radius: 1px;
      background: rgba(255,255,255,0.25);
    }
    .rr-widget .rr-life.dead { background: var(--rr-life-dead); }
    .rr-widget .rr-life.dead::after { display: none; }

    .rr-widget .rr-shots {
      font-family: 'DM Mono', monospace;
      font-size: 9px;
      color: var(--rr-hint);
      letter-spacing: 0.3px;
    }


    .rr-widget .rr-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 12px 0;
      background: var(--rr-panel);
    }
    .rr-widget .rr-rnd {
      font-family: 'DM Mono', monospace;
      font-size: 8px;
      letter-spacing: 1px;
      color: var(--rr-hint);
      text-transform: uppercase;
    }
    .rr-widget .rr-cyl-wrap { width: 66px; height: 66px; position: relative; }
    .rr-widget .rr-cyl {
      width: 66px; height: 66px;
      border-radius: 50%;
      background: var(--rr-cyl-bg);
      border: 1.5px solid var(--rr-cyl-bd);
      position: relative;
      transition: transform 0.72s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.07);
    }
    .rr-widget .rr-cyl.spinning { transition: transform 0.88s cubic-bezier(0.17,0.67,0.83,0.67); }
    .rr-widget .rr-chamber {
      position: absolute;
      width: 13px; height: 13px;
      border-radius: 50%;
      background: var(--rr-ch-bg);
      border: 0.5px solid var(--rr-ch-bd);
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.08);
      transition: all 0.3s;
    }
    .rr-widget .rr-chamber.loaded { background: var(--rr-red-lt); border-color: var(--rr-red); box-shadow: inset 0 1px 2px rgba(204,44,44,0.18); }
    .rr-widget .rr-chamber.fired { animation: rr-ch-fire 0.48s ease forwards; }
    @keyframes rr-ch-fire { 0% { background: #FF8060; border-color: #FF8060; box-shadow: 0 0 8px rgba(255,100,60,0.5); } 100% { background: #E0DEDA; border-color: #C8C6C2; } }
    .rr-widget .rr-cpin {
      position: absolute;
      width: 10px; height: 10px;
      border-radius: 50%;
      background: var(--rr-ch-bg);
      border: 1.5px solid var(--rr-ch-bd);
      top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 2;
    }
    .rr-widget .rr-cyl-count {
      font-family: 'DM Mono', monospace;
      font-size: 8px;
      color: var(--rr-hint);
      letter-spacing: 0.5px;
    }
    .rr-widget .rr-track { display:flex; gap:3px; }
    .rr-widget .rr-td { width:5px; height:5px; border-radius:50%; background:var(--rr-cyl-bg); border:0.5px solid var(--rr-ch-bd); transition:all 0.22s; }
    .rr-widget .rr-td.cur { border-color: var(--rr-muted); box-shadow: 0 0 0 1.5px rgba(0,0,0,0.07); }
    .rr-widget .rr-td.safe { background: var(--rr-ch-bd); }
    .rr-widget .rr-td.hit { background: var(--rr-red); border-color: var(--rr-red); }


    .rr-widget .rr-moves { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; padding:11px 14px 12px; border-bottom:0.5px solid var(--rr-border); }
    .rr-widget .rr-move {
      display:flex; flex-direction:column; align-items:center; gap:5px;
      padding:10px 7px 9px;
      border-radius:11px;
      border:1.5px solid var(--rr-spin-bd);
      background:var(--rr-bg);
      cursor:pointer;
      transition:all 0.13s ease;
      font-family:'DM Sans',system-ui,sans-serif;
      text-align:center;
    }
    .rr-widget .rr-move:hover:not(:disabled) { border-color:var(--rr-muted); background:var(--rr-panel); transform:translateY(-1px); }
    .rr-widget .rr-move:active:not(:disabled) { transform:scale(0.97); }
    .rr-widget .rr-move:disabled { opacity:0.3; cursor:not-allowed; pointer-events:none; }
    .rr-widget .rr-move svg { width:16px; height:16px; display:block; flex-shrink:0; }
    .rr-widget .rr-move-label { font-size:10px; font-weight:500; color:var(--rr-text); letter-spacing:-0.1px; line-height:1.3; }
    .rr-widget .rr-move.add-c { border-color:var(--rr-spin-bd); background:var(--rr-bg); }
    .rr-widget .rr-move.add-c:hover:not(:disabled) { border-color:var(--rr-muted); background:var(--rr-panel); }


    .rr-widget .rr-invite-banner {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      padding:10px 14px;
      margin-top:6px;
      border-radius:11px;
      border:1px solid var(--rr-border);
      background:var(--rr-panel);
    }
    .rr-widget .rr-invite-text {
      font-size:11px;
      color:var(--rr-muted);
      font-style:italic;
      flex:1;
    }
    .rr-widget .rr-btn.rr-join {
      font-family:'DM Sans', system-ui, sans-serif;
      font-size:11px;
      font-weight:500;
      padding:7px 14px;
      border-radius:8px;
      border:1.5px solid var(--rr-btn-bd);
      background:var(--rr-btn-bg);
      color:var(--rr-btn-fg);
      cursor:pointer;
      white-space:nowrap;
      flex-shrink:0;
    }
    .rr-widget .rr-btn.rr-join:disabled { opacity:0.35; cursor:not-allowed; pointer-events:none; }


    .rr-widget .rr-footer { padding:9px 14px 12px; }
    .rr-widget .rr-status { font-size:11px; color:var(--rr-muted); font-style:italic; min-height:15px; }


    .rr-widget .rr-flash { position:absolute; inset:0; border-radius:18px; background:rgba(200,50,30,0.16); pointer-events:none; opacity:0; z-index:10; }
    @keyframes rr-flash-go { 0% { opacity:1; } 100% { opacity:0; } }
    @keyframes rr-shake { 0%,100% { transform:translateX(0); } 20% { transform:translateX(-4px); } 40% { transform:translateX(4px); } 60% { transform:translateX(-3px); } 80% { transform:translateX(3px); } }


    .rr-widget .rr-result { display:none; flex-direction:column; align-items:center; padding:24px 20px 18px; gap:0; text-align:center; }
    .rr-widget .rr-result.vis { display:flex; }
    .rr-widget .rr-res-graphic { width:72px; height:72px; margin-bottom:12px; }
    .rr-widget .rr-res-graphic svg { width:100%; height:100%; animation:rr-res-pop 0.4s cubic-bezier(0.34,1.36,0.64,1) both; }
    @keyframes rr-res-pop { from { transform:scale(0.5); opacity:0; } to { transform:scale(1); opacity:1; } }
    .rr-widget .rr-res-title { font-size:18px; font-weight:500; color:var(--rr-text); letter-spacing:-0.4px; margin-bottom:5px; }
    .rr-widget .rr-res-sub { font-size:12px; color:var(--rr-muted); max-width:240px; line-height:1.6; margin-bottom:16px; }
    .rr-widget .rr-res-btns { display:flex; gap:6px; width:100%; }
    .rr-widget .rr-rbtn { font-family:'DM Sans',system-ui,sans-serif; font-size:12px; font-weight:500; padding:9px 0; border-radius:9px; border:none; cursor:pointer; flex:1; transition:opacity 0.12s; }
    .rr-widget .rr-rbtn:active { opacity:0.8; transform:scale(0.97); }
    .rr-widget .rr-rbtn.again { background:var(--rr-btn-bg); color:var(--rr-btn-fg); }
    .rr-widget .rr-rbtn.close { background:var(--rr-panel); color:var(--rr-muted); }
  `;
  document.head.appendChild(style);
}

function sfx(type) {
  try {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    if (!window._rrAudioCtx) {
      window._rrAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = window._rrAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const t   = ctx.currentTime;
    const sr  = ctx.sampleRate;

    const noise = (secs) => {
      const len = Math.floor(sr * secs);
      const buf = ctx.createBuffer(1, len, sr);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    };

    if (type === 'spin') {
      const clicks = 20;
      for (let i = 0; i < clicks; i++) {
        const frac = i / clicks;
        const delay = Math.pow(frac, 1.8) * 0.78;
        const src = ctx.createBufferSource();
        src.buffer = noise(0.02);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2800 + Math.random() * 2400;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.15 * (1 - frac * 0.5), t + delay);
        g.gain.linearRampToValueAtTime(0, t + delay + 0.016);
        src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ctx.destination);
        src.start(t + delay);
        src.stop(t + delay + 0.022);
      }
    } else if (type === 'click_empty') {
      const s1 = ctx.createBufferSource();
      s1.buffer = noise(0.025);
      const hp1 = ctx.createBiquadFilter(); hp1.type = 'highpass'; hp1.frequency.value = 4500;
      const lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass'; lp1.frequency.value = 11000;
      const g1 = ctx.createGain(); g1.gain.setValueAtTime(0.6, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
      s1.connect(hp1); hp1.connect(lp1); lp1.connect(g1); g1.connect(ctx.destination);
      s1.start(t); s1.stop(t + 0.026);

      const s2 = ctx.createBufferSource();
      s2.buffer = noise(0.035);
      const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 800; bp2.Q.value = 2.5;
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.1, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      s2.connect(bp2); bp2.connect(g2); g2.connect(ctx.destination);
      s2.start(t); s2.stop(t + 0.04);
    } else if (type === 'gunshot') {
      const crackBuf = ctx.createBuffer(1, Math.floor(sr * 0.05), sr);
      const cd = crackBuf.getChannelData(0);
      for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.004));
      const crackSrc = ctx.createBufferSource(); crackSrc.buffer = crackBuf;
      const crackHp = ctx.createBiquadFilter(); crackHp.type = 'highpass'; crackHp.frequency.value = 2200;
      const crackG = ctx.createGain(); crackG.gain.setValueAtTime(1.1, t); crackG.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      crackSrc.connect(crackHp); crackHp.connect(crackG); crackG.connect(ctx.destination); crackSrc.start(t);

      const boomLen = Math.floor(sr * 0.6);
      const boomBuf = ctx.createBuffer(1, boomLen, sr);
      const bd2 = boomBuf.getChannelData(0);
      for (let i = 0; i < boomLen; i++) {
        const atk = i < sr * 0.006 ? i / (sr * 0.006) : 1;
        bd2[i] = (Math.random() * 2 - 1) * atk * Math.exp(-i / (sr * 0.09));
      }
      const boomSrc = ctx.createBufferSource(); boomSrc.buffer = boomBuf;
      const lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass'; lp1.frequency.value = 300;
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 180;
      const boomG = ctx.createGain(); boomG.gain.setValueAtTime(2.4, t); boomG.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      boomSrc.connect(lp1); lp1.connect(lp2); lp2.connect(boomG); boomG.connect(ctx.destination); boomSrc.start(t);

      const barkLen = Math.floor(sr * 0.2);
      const barkBuf = ctx.createBuffer(1, barkLen, sr);
      const bkd = barkBuf.getChannelData(0);
      for (let i = 0; i < barkLen; i++) bkd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.022));
      const barkSrc = ctx.createBufferSource(); barkSrc.buffer = barkBuf;
      const barkBp = ctx.createBiquadFilter(); barkBp.type = 'bandpass'; barkBp.frequency.value = 800; barkBp.Q.value = 0.9;
      const barkG = ctx.createGain(); barkG.gain.setValueAtTime(0.75, t); barkG.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      barkSrc.connect(barkBp); barkBp.connect(barkG); barkG.connect(ctx.destination); barkSrc.start(t);

      const revLen = Math.floor(sr * 0.35);
      const revBuf = ctx.createBuffer(1, revLen, sr);
      const rv = revBuf.getChannelData(0);
      for (let i = 0; i < revLen; i++) rv[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.07));
      const revSrc = ctx.createBufferSource(); revSrc.buffer = revBuf;
      const revLp = ctx.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 650;
      const revG = ctx.createGain(); revG.gain.setValueAtTime(0, t); revG.gain.linearRampToValueAtTime(0.3, t + 0.028); revG.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      revSrc.connect(revLp); revLp.connect(revG); revG.connect(ctx.destination); revSrc.start(t);
    } else if (type === 'add_bullet') {
      const scrSrc = ctx.createBufferSource(); scrSrc.buffer = noise(0.07);
      const scrBp = ctx.createBiquadFilter(); scrBp.type = 'bandpass'; scrBp.frequency.value = 2200; scrBp.Q.value = 1.5;
      const scrG = ctx.createGain(); scrG.gain.setValueAtTime(0.22, t); scrG.gain.linearRampToValueAtTime(0.05, t + 0.06); scrG.gain.linearRampToValueAtTime(0, t + 0.07);
      scrSrc.connect(scrBp); scrBp.connect(scrG); scrG.connect(ctx.destination); scrSrc.start(t);

      const clkSrc = ctx.createBufferSource(); clkSrc.buffer = noise(0.015);
      const clkHp = ctx.createBiquadFilter(); clkHp.type = 'highpass'; clkHp.frequency.value = 3500;
      const clkG = ctx.createGain(); clkG.gain.setValueAtTime(0.45, t + 0.065); clkG.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
      clkSrc.connect(clkHp); clkHp.connect(clkG); clkG.connect(ctx.destination); clkSrc.start(t + 0.065);
    } else if (type === 'win') {
      [[392, 0, 0.25], [523, 0.18, 0.35], [659, 0.36, 0.5]].forEach(([freq, delay, dur]) => {
        const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(0.12, t + delay + 0.03); g.gain.setValueAtTime(0.12, t + delay + dur - 0.04); g.gain.linearRampToValueAtTime(0, t + delay + dur);
        o.start(t + delay); o.stop(t + delay + dur + 0.01);
      });
    } else if (type === 'lose') {
      [[196, 0, 0.3], [165, 0.22, 0.4], [131, 0.48, 0.55]].forEach(([freq, delay, dur]) => {
        const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(0.1, t + delay + 0.04); g.gain.setValueAtTime(0.1, t + delay + dur - 0.06); g.gain.linearRampToValueAtTime(0, t + delay + dur);
        o.start(t + delay); o.stop(t + delay + dur + 0.01);
      });
    } else if (type === 'ui_click') {
      const src = ctx.createBufferSource(); src.buffer = noise(0.012);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
      src.connect(hp); hp.connect(g); g.connect(ctx.destination); src.start(t);
    }
  } catch (e) {}
}

function handleRouletteAction(element, action, options = {}) {
  const game = element.closest('.rr-widget');
  if (!game) return;

  const statusEl = game.querySelector('.rr-status');
  const logEl = game.querySelector('.rr-log');
  const meta = game.querySelector('.rr-impl');
  const gameBody = game.querySelector('.rr-game-body');
  const resultEl = game.querySelector('.rr-result');

  if (!meta) return;
  rrDebug(game, 'action', { action, localUser: (usernameEl && usernameEl.value) ? usernameEl.value.trim() : '(no user)' });
  if (game.querySelector('.rr-result')?.classList.contains('vis')) return;

  const isInternalMove = options.allowNonParticipant === true;
  if (!isInternalMove && (meta.dataset.actionLock === 'true')) return;
  if (!isInternalMove && ['spin', 'pull', 'add'].includes(action)) {
    meta.dataset.actionLock = 'true';
  }

  let chamber = Number(meta.dataset.chamber) || 0;
  let shots = Number(meta.dataset.shots) || 0;
  let bullets = Number(meta.dataset.bullets) || 1;
  let p1Lives = Number(meta.dataset.p1lives) || 3;
  let p2Lives = Number(meta.dataset.p2lives) || 3;
  let p1Fired = Number(meta.dataset.p1fired) || 0;
  let p2Fired = Number(meta.dataset.p2fired) || 0;
  let round = Number(meta.dataset.round) || 1;
  let turn = meta.dataset.turn || 'p1';
  let p1 = meta.dataset.p1 || 'Player 1';
  let p2 = meta.dataset.p2 || 'Machine';
  const CHAMBERS = 6;
  const LIVES = 3;

  let cylinder = (meta.dataset.cylinder || '').split(',').map(v => v === 'true');
  if (cylinder.length !== CHAMBERS) {
    cylinder = Array(CHAMBERS).fill(false);
    cylinder[Math.floor(Math.random() * CHAMBERS)] = true;
  }
  bullets = cylinder.filter(Boolean).length;
  if (bullets === 0) {
    const emptySlot = Math.floor(Math.random() * CHAMBERS);
    cylinder[emptySlot] = true;
    bullets = 1;
  }
  bullets = Math.min(Math.max(1, bullets), CHAMBERS);
  meta.dataset.bullets = bullets;
  meta.dataset.cylinder = cylinder.join(',');

  const current = turn === 'p1' ? p1 : p2;
  const nextTurn = turn === 'p1' ? 'p2' : 'p1';
  const localUser = (usernameEl && usernameEl.value) ? usernameEl.value.trim().toLowerCase() : '';
  const p1Norm = p1.toLowerCase();
  const p2Norm = p2.toLowerCase();

  if (action !== 'join') {
    const isParticipant = localUser === p1Norm || (p2Norm !== 'machine' && localUser === p2Norm);
    if (!isParticipant && !options.allowNonParticipant) return;
    const turnOwner = (turn === 'p1' && localUser === p1Norm) || (turn === 'p2' && p2Norm !== 'machine' && localUser === p2Norm);
    if (!turnOwner && !options.allowNonParticipant) return;
  }

  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
  const appendLog = (msg) => {
    if (!logEl) return;
    logEl.textContent = msg;
  };

  const updateMeta = () => {
    meta.dataset.chamber = chamber;
    meta.dataset.shots = shots;
    meta.dataset.bullets = bullets;
    meta.dataset.p1lives = p1Lives;
    meta.dataset.p2lives = p2Lives;
    meta.dataset.p1fired = p1Fired;
    meta.dataset.p2fired = p2Fired;
    meta.dataset.round = round;
    meta.dataset.turn = turn;
    meta.dataset.cylinder = cylinder.join(',');
  };

  const renderLives = () => {
    ['p1','p2'].forEach(side => {
      const container = game.querySelector(`.rr-lives[data-side="${side}"]`);
      if (!container) return;
      container.innerHTML = '';
      const alive = side === 'p1' ? p1Lives : p2Lives;
      for (let i = 0; i < LIVES; i++) {
        const el = document.createElement('div');
        el.className = 'rr-life' + (i >= alive ? ' dead' : '');
        container.appendChild(el);
      }
    });
  };

  const updatePlayers = () => {
    game.querySelectorAll('.rr-player').forEach(el => {
      el.classList.toggle('active', el.dataset.side === turn);
    });
    const p1sub = game.querySelector('.rr-psub[data-side="p1"]');
    const p2sub = game.querySelector('.rr-psub[data-side="p2"]');
    if (p1sub) p1sub.textContent = turn === 'p1' ? 'your turn' : 'waiting';
    if (p2sub) p2sub.textContent = turn === 'p2' ? (p2 === 'Machine' ? 'thinking…' : 'your turn') : 'waiting';
    const rnd = game.querySelector('.rr-rnd');
    if (rnd) rnd.textContent = 'RD ' + round;
    const shotP1 = game.querySelector('.rr-shots[data-side="p1"]');
    const shotP2 = game.querySelector('.rr-shots[data-side="p2"]');
    if (shotP1) shotP1.textContent = p1Fired + ' fired';
    if (shotP2) shotP2.textContent = p2Fired + ' fired';
  };

  const renderCylinder = () => {
    const cylCount = game.querySelector('.rr-cyl-count');
    if (cylCount) cylCount.textContent = `${bullets} / ${CHAMBERS}`;
    const cylChambers = game.querySelectorAll('.rr-chamber');
    if (cylChambers.length === CHAMBERS) {
      cylChambers.forEach((el, index) => {
        el.classList.toggle('loaded', !!cylinder[index]);
      });
    }
  };

  const updateTrack = (isLive) => {
    const idx = shots % CHAMBERS;
    const dot = game.querySelector(`.rr-td[data-tdot="${idx}"]`);
    if (dot) {
      dot.classList.remove('cur');
      dot.classList.add(isLive ? 'hit' : 'safe');
    }
    const next = game.querySelector(`.rr-td[data-tdot="${(idx + 1) % CHAMBERS}"]`);
    if (next && !next.classList.contains('hit') && !next.classList.contains('safe')) {
      next.classList.add('cur');
    }
  };

  const lockButtons = (locked) => {
    game.querySelectorAll('.rr-btn').forEach(btn => { btn.disabled = locked; });
  };

  const showResult = (winnerSide) => {
    if (gameBody) gameBody.style.display = 'none';
    if (!resultEl) return;
    resultEl.classList.add('vis');
    const winner = winnerSide === 'p1' ? p1 : p2;
    const loser = winnerSide === 'p1' ? p2 : p1;
    const isMachine = p2 === 'Machine' && winnerSide === 'p2';
    const graphic = resultEl.querySelector('.rr-res-graphic');
    const title = resultEl.querySelector('.rr-res-title');
    const subtitle = resultEl.querySelector('.rr-res-sub');
    const trophyColor = (game ? getComputedStyle(game).getPropertyValue('--rr-amber') : '') || '#FFC042';
    const trophyAccent = (game ? getComputedStyle(game).getPropertyValue('--rr-red') : '') || '#E0A020';
    const SVG_WIN = `<svg viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="44" cy="44" r="40" fill="${trophyColor}22" stroke="${trophyAccent}33" stroke-width="1.2"/><polygon points="44,18 52,34 70,36 56,50 60,68 44,58 28,68 32,50 18,36 36,34" fill="${trophyAccent}"/></svg>`;
    const SVG_LOSE = `<svg viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="44" cy="44" r="40" fill="#FFF2F2" stroke="#F8C0C0" stroke-width="1.5"/><circle cx="44" cy="44" r="18" stroke="#CC3030" stroke-width="1.5" fill="none" opacity=".2"/><path d="M36 36l16 16M52 36L36 52" stroke="#CC3030" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    const SVG_MACHINE_WIN = `<svg viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="44" cy="44" r="40" fill="#F2F2F0" stroke="#D0CECA" stroke-width="1.5"/><rect x="28" y="32" width="32" height="22" rx="5" stroke="#555" stroke-width="1.5" fill="#E8E6E2"/><rect x="34" y="38" width="6" height="6" rx="1.5" fill="#555"/><rect x="48" y="38" width="6" height="6" rx="1.5" fill="#555"/><path d="M37 50h14" stroke="#555" stroke-width="1.5" stroke-linecap="round"/><path d="M44 32V28" stroke="#555" stroke-width="1.5" stroke-linecap="round"/><circle cx="44" cy="27" r="2" fill="#555"/><path d="M28 43H25M63 43H60" stroke="#555" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    if (graphic) graphic.innerHTML = isMachine ? SVG_MACHINE_WIN : (winnerSide === 'p1' ? SVG_WIN : SVG_LOSE);
    if (title) title.textContent = isMachine ? 'Machine wins' : `${winner} wins`;
    if (game) {
      game.dataset.winner = winner;
      game.dataset.gameOver = 'true';
      if (meta) meta.dataset.gameOver = 'true';
      if (game.dataset.gameId) {
        const resultData = {
          winner,
          loser,
          isMachineWin: isMachine,
          p1,
          p2,
          rounds: Number(meta?.dataset.round || 1),
          shots: Number(meta?.dataset.shots || 0),
          p1Fired: Number(meta?.dataset.p1fired || 0),
          p2Fired: Number(meta?.dataset.p2fired || 0)
        };
        applyRouletteResult({ gameId: game.dataset.gameId, ...resultData });
        sendRouletteResultState(game.dataset.gameId, resultData);
        sendRouletteUpdateState(game.dataset.gameId, { gameOver: true, winner });
      }
    }
    if (subtitle) {
      const LOSS_LINES = [
        `${loser} couldn't handle the heat.`,
        `${loser} pulled the wrong trigger.`,
        `${loser} had one bad day.`,
        `${loser} bet everything on an empty chamber.`,
        `${loser} should've spun.`,
        `${loser} found the bullet the hard way.`,
        `${loser} came in confident, left horizontal.`,
        `${loser} ran out of luck and excuses.`,
        `${loser} won't be making that mistake again.`,
        `${loser} met fate at chamber ${chamber + 1}.`,
        `${loser} thought the odds were in their favor.`,
        `${loser} picked the worst possible moment to stop spinning.`,
        `${loser} played with fire. The fire won.`,
        `${loser} always said they had nerves of steel. Incorrect.`,
        `${loser} will be remembered. Briefly.`,
        `${loser} demanded we play. Nobody demanded they win.`,
        `${loser} squeezed the trigger like it owed them money.`,
        `The cylinder disagreed with ${loser}'s life choices.`,
        `${loser} gambled on 1-in-6 odds. Math disagreed.`,
        `${loser} exits the table. Permanently.`,
      ];
      subtitle.textContent = LOSS_LINES[Math.floor(Math.random() * LOSS_LINES.length)];
    }
    sfx(winnerSide === 'p1' ? 'win' : 'lose');
  };

  const lock = (state) => {
    game.querySelectorAll('.rr-btn').forEach(b => { b.disabled = state; });
  };

  const pushStateUpdate = () => {
    const gameId = game.dataset.gameId;
    if (!gameId) return;
    const changed = {
      p1, p2, chamber, shots, bullets, round, turn,
      p1lives: p1Lives, p2lives: p2Lives,
      p1fired: p1Fired, p2fired: p2Fired,
      cylinder: cylinder.join(','),
      status: statusEl ? statusEl.textContent : '',
      log: logEl ? logEl.textContent : '',
      gameover: (meta.dataset.gameOver === 'true'),
      closed: (meta.dataset.closed === 'true')
    };
    sendRouletteUpdateState(gameId, changed);
  };

  if (action === 'join') {
    const joiner = (usernameEl && usernameEl.value) ? usernameEl.value.trim() : '';
    if (!joiner) { setStatus('Enter your username to join.'); return; }
    if (p2.toLowerCase() !== 'player 2') { setStatus('Slot not available.'); return; }
    if (joiner.toLowerCase() === p1.toLowerCase()) { setStatus('You are already Player 1.'); return; }
    p2 = joiner;
    meta.dataset.p2 = p2;
    setStatus(`${p2} joined as Player 2.`);
    appendLog(`> ${p2} joined`);
    updateMeta();
    refreshRouletteWidget(game);
    pushStateUpdate();
    return;
  }

  if (action === 'spin') {
    lock(true);
    sfx('spin');
    const cyl = game.querySelector('.rr-cyl');
    chamber = Math.floor(Math.random() * CHAMBERS);

    if (cyl) {
      const prevDeg = Number(cyl.dataset.totalDeg || 0);
      const addDeg = 1800 + Math.floor(Math.random() * 720);
      const nextDeg = prevDeg + addDeg;
      cyl.dataset.totalDeg = nextDeg;
      cyl.classList.add('spinning');
      requestAnimationFrame(() => {
        cyl.style.transform = `rotate(${nextDeg}deg)`;
      });
    }

    appendLog(`> ${current} spins cylinder`);
    setStatus('Spinning…');
    setTimeout(() => {
      if (cyl) cyl.classList.remove('spinning');
      setStatus('Cylinder spun -- pulling trigger.');
      meta.dataset.chamber = chamber;
      updateMeta();
      renderCylinder();
      refreshRouletteWidget(game);
      pushStateUpdate();
      setTimeout(() => handleRouletteAction(element, 'pull', { allowNonParticipant: true }), 380);
    }, 900);
    return;
  }

  if (action === 'add') {
    if (bullets >= CHAMBERS) {
      appendLog('> cannot add bullet: cylinder already full.');
      setStatus('Cylinder full');
      lock(false);
      return;
    }
    const emptyChambers = cylinder.reduce((acc, loaded, i) => { if (!loaded) acc.push(i); return acc; }, []);
    const insert = emptyChambers[Math.floor(Math.random() * emptyChambers.length)];
    cylinder[insert] = true;
    bullets = Math.min(Math.max(1, cylinder.filter(Boolean).length), CHAMBERS);
    meta.dataset.bullets = bullets;
    meta.dataset.cylinder = cylinder.join(',');
    sfx('add_bullet');
    appendLog(`> ${current} adds bullet (${bullets} / ${CHAMBERS})`);
    setStatus(`Bullet added -- now firing.`);
    renderLives();
    renderCylinder();
    updateMeta();
    lock(true);
    setTimeout(() => {
      refreshRouletteWidget(game);
      pushStateUpdate();
      handleRouletteAction(element, 'pull', { allowNonParticipant: true });
    }, 260);
    return;
  }

  if (action === 'pull') {
    lock(true);
    shots++;
    meta.dataset.shots = shots;
    appendLog(`> ${current} pulls trigger (chamber ${chamber + 1})`);

    const hasBullet = cylinder[chamber];
    if (hasBullet) {
      sfx('gunshot');
      appendLog('💥 BANG!');
      const BODYPARTS = ['shoulder', 'arm', 'leg', 'chest', 'hand', 'kneecap', 'ribcage', 'shin', 'collarbone', 'hip'];
      const bodypart = BODYPARTS[Math.floor(Math.random() * BODYPARTS.length)];
      const livesLeft = turn === 'p1' ? p1Lives - 1 : p2Lives - 1;
      const lifeWord = livesLeft === 1 ? 'life' : 'lives';
      if (statusEl) statusEl.textContent = `${current} took a bullet to the ${bodypart}. ${livesLeft} ${lifeWord} left.`;
      if (turn === 'p1') { p1Lives--; p1Fired++; } else { p2Lives--; p2Fired++; }
      cylinder[chamber] = false;
      bullets = Math.min(Math.max(1, cylinder.filter(Boolean).length), CHAMBERS);
      const flash = game.querySelector('.rr-flash');
      if (flash) { flash.style.animation = 'rr-flash-go .32s ease forwards'; setTimeout(() => { if (flash) flash.style.animation = ''; }, 380); }
      const cylEl = game.querySelector('.rr-cyl');
      if (cylEl) { cylEl.style.animation = 'rr-shake .28s ease'; setTimeout(() => { cylEl.style.animation = ''; }, 350); }
      if (cylEl) { cylEl.style.filter = 'brightness(2.2) saturate(0.3)'; setTimeout(() => { if (cylEl) cylEl.style.filter = ''; }, 420); }
      game.querySelectorAll('.rr-btn').forEach(btn => btn.disabled = true);
      updateTrack(true);
    } else {
      sfx('click_empty');
      appendLog('🔸 click');
      updateTrack(false);
      if (turn === 'p1') p1Fired++; else p2Fired++;
      setStatus(turn === 'p1' ? 'Click. Empty.' : (p2 === 'Machine' ? 'Click. Nothing.' : 'Click. Empty.'));
    }

    if (hasBullet) {
      if ((turn === 'p1' && p1Lives <= 0) || (turn === 'p2' && p2Lives <= 0)) {
        showResult(turn === 'p1' ? 'p2' : 'p1');
        return;
      }
    }

    chamber = (chamber + 1) % CHAMBERS;
    round++;
    turn = nextTurn;
    meta.dataset.chamber = chamber;
    meta.dataset.turn = turn;
    meta.dataset.p1lives = p1Lives;
    meta.dataset.p2lives = p2Lives;
    meta.dataset.p1fired = p1Fired;
    meta.dataset.p2fired = p2Fired;
    meta.dataset.cylinder = cylinder.join(',');
    meta.dataset.bullets = bullets;
    meta.dataset.round = round;

    renderLives();
    renderCylinder();
    updatePlayers();
    updateMeta();
    refreshRouletteWidget(game);
    pushStateUpdate();
    meta.dataset.actionLock = 'false';
    lock(false);

    const addBtn = game.querySelector('.rr-btn[data-action="add"]');
    if (addBtn) addBtn.disabled = bullets >= CHAMBERS;

    if (turn === 'p2' && p2 === 'Machine') {
      lock(true);
      setStatus('Machine is thinking…');
      setTimeout(() => {
        const freshShots   = Number(meta.dataset.shots)  || 0;
        const freshBullets = Number(meta.dataset.bullets)|| 1;
        const freshP1Lives = Number(meta.dataset.p1lives)|| 3;
        const freshP2Lives = Number(meta.dataset.p2lives)|| 3;
        const freshTurn    = meta.dataset.turn;

        if (freshTurn !== 'p2' || resultEl?.classList.contains('vis')) return;

        const shotsLeft = CHAMBERS - freshShots;
        const fireRisk  = shotsLeft > 0 ? freshBullets / shotsLeft : 1;
        const lifeAdv   = freshP2Lives - freshP1Lives;
        const canAdd    = freshBullets < CHAMBERS;
        let move;

        if (fireRisk >= 0.5) {
          move = 'spin';
        } else if (fireRisk >= 0.34) {
          move = Math.random() < 0.78 ? 'spin' : 'pull';
        } else if (canAdd) {
          if (lifeAdv > 0 && freshP1Lives === 1) move = Math.random() < 0.55 ? 'add' : 'pull';
          else if (lifeAdv < 0 && Math.random() < 0.35) move = 'add';
          else if (lifeAdv === 0 && Math.random() < 0.2) move = 'add';
          else move = Math.random() < 0.6 ? 'pull' : 'spin';
        } else {
          move = Math.random() < 0.6 ? 'pull' : 'spin';
        }

        const proxy = game.querySelector(`.rr-btn[data-action="${move}"]`);
        if (proxy) {
          proxy.disabled = false;
          handleRouletteAction(proxy, move, { allowNonParticipant: true });
        }
      }, 1300);
    }
  }
}

function refreshRouletteWidget(game) {
  if (!game) return;
  const meta = game.querySelector('.rr-impl');
  if (!meta) return;
  rrDebug(game, 'refresh', { p2: meta.dataset.p2 || '?', isPvPWaiting: (meta.dataset.p2 || '').toLowerCase() === 'player 2', turn: meta.dataset.turn || '?' });
  const p1 = meta.dataset.p1 || 'Player 1';
  const p2 = meta.dataset.p2 || 'Machine';
  const p1Lives = Number(meta.dataset.p1lives) || 3;
  const p2Lives = Number(meta.dataset.p2lives) || 3;
  const p1Fired = Number(meta.dataset.p1fired) || 0;
  const p2Fired = Number(meta.dataset.p2fired) || 0;
  const shots = Number(meta.dataset.shots) || 0;
  const turn = meta.dataset.turn || 'p1';
  const chamber = Number(meta.dataset.chamber) || 0;
  const bullets = Number(meta.dataset.bullets) || 1;
  const cylinder = (meta.dataset.cylinder || '').split(',').map(v => v === 'true');

  const p1Elem = game.querySelector('.rr-player.p1 .rr-pname');
  const p2Elem = game.querySelector('.rr-player.p2 .rr-pname');
  if (p1Elem) p1Elem.textContent = p1;
  if (p2Elem) p2Elem.textContent = p2;

  const p1LivesEl = game.querySelector('.rr-lives[data-side="p1"]');
  const p2LivesEl = game.querySelector('.rr-lives[data-side="p2"]');
  if (p1LivesEl) {
    p1LivesEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('div');
      el.className = 'rr-life' + (i >= p1Lives ? ' dead' : '');
      p1LivesEl.appendChild(el);
    }
  }
  if (p2LivesEl) {
    p2LivesEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('div');
      el.className = 'rr-life' + (i >= p2Lives ? ' dead' : '');
      p2LivesEl.appendChild(el);
    }
  }

  const shotP1 = game.querySelector('.rr-shots[data-side="p1"]');
  const shotP2 = game.querySelector('.rr-shots[data-side="p2"]');
  if (shotP1) shotP1.textContent = p1Fired + ' fired';
  if (shotP2) shotP2.textContent = p2Fired + ' fired';

  game.querySelectorAll('.rr-player').forEach(el => {
    el.classList.toggle('active', el.dataset.side === turn);
  });
  const p1sub = game.querySelector('.rr-psub[data-side="p1"]');
  const p2sub = game.querySelector('.rr-psub[data-side="p2"]');
  if (p1sub) p1sub.textContent = turn === 'p1' ? 'your turn' : 'waiting';
  if (p2sub) p2sub.textContent = turn === 'p2' ? (p2 === 'Machine' ? 'thinking…' : 'your turn') : 'waiting';

  const rnd = game.querySelector('.rr-rnd');
  if (rnd) rnd.textContent = 'RD ' + (Number(meta.dataset.round) || 1);

  const cylCount = game.querySelector('.rr-cyl-count');
  if (cylCount) cylCount.textContent = `${bullets} / 6`;
  const chs = game.querySelectorAll('.rr-chamber');
  if (chs.length === 6) {
    chs.forEach((el, idx) => el.classList.toggle('loaded', !!cylinder[idx]));
  }

  const statusEl = game.querySelector('.rr-status');
  const trackDots = game.querySelectorAll('.rr-td');
  trackDots.forEach(d => { d.classList.remove('hit', 'safe', 'cur'); });
  const idx = shots % 6;
  const currentDot = game.querySelector(`.rr-td[data-tdot="${idx}"]`);
  if (currentDot) currentDot.classList.add('cur');

  const isGameOver = meta.dataset.gameOver === 'true';
  const isClosed = (meta.dataset.closed === 'true') || isGameOver;
  const gameBody = game.querySelector('.rr-game-body');
  const resultEl = game.querySelector('.rr-result');
  const winner = game.dataset.winner || p1;
  if (isClosed) {
    if (gameBody) gameBody.style.display = 'none';
    if (resultEl) resultEl.classList.add('vis');
    if (statusEl) {
      if (winner) statusEl.textContent = `${winner} won the Russian Roulette match.`;
      else statusEl.textContent = 'Russian Roulette match closed.';
    }
    const moveBtns = game.querySelectorAll('.rr-btn[data-action="spin"], .rr-btn[data-action="pull"], .rr-btn[data-action="add"]');
    moveBtns.forEach(btn => btn.disabled = true);
    const joinBtn = game.querySelector('.rr-btn.rr-join');
    if (joinBtn) joinBtn.style.display = 'none';
    return;
  }

  const localUser = (usernameEl && usernameEl.value) ? usernameEl.value.trim().toLowerCase() : '';
  const p1Norm = p1.toLowerCase();
  const p2Norm = p2.toLowerCase();
  const isTurnOwner = (turn === 'p1' && localUser === p1Norm) || (turn === 'p2' && localUser === p2Norm);

  const inviteBanner = game.querySelector('.rr-invite-banner');
  const inviteText = game.querySelector('.rr-invite-text');
  const joinBtn = game.querySelector('.rr-btn.rr-join');
  const moveBtns = game.querySelectorAll('.rr-btn[data-action="spin"], .rr-btn[data-action="pull"], .rr-btn[data-action="add"]');
  const isPvPWaiting = p2.toLowerCase() === 'player 2';
  const isMachineGame = p2.toLowerCase() === 'machine';

  if (inviteBanner) {
    if (isMachineGame || !isPvPWaiting) {
      inviteBanner.style.display = 'none';
    } else {
      inviteBanner.style.display = 'flex';
      if (inviteText) inviteText.textContent = `${p1} challenged you to Russian Roulette.`;
    }
  }

  if (isPvPWaiting) {
    const waitTimestamp = Number(meta.dataset.waitTimestamp || 0);
    if (waitTimestamp > 0 && Date.now() - waitTimestamp > 90000) {
      meta.dataset.gameOver = 'true';
      game.dataset.gameOver = 'true';
      if (statusEl) statusEl.textContent = 'No Player 2 joined -- game timed out.';
      moveBtns.forEach(btn => { btn.style.display = 'none'; });
      if (joinBtn) joinBtn.style.display = 'none';
      return;
    }
  }

  if (isPvPWaiting) {
    const waitTimestamp = Number(meta.dataset.waitTimestamp || 0);
    if (waitTimestamp > 0 && Date.now() - waitTimestamp > 90000) {
      meta.dataset.gameOver = 'true';
      game.dataset.gameOver = 'true';
      if (statusEl) statusEl.textContent = 'No Player 2 joined -- game timed out.';
      moveBtns.forEach(btn => { btn.style.display = 'none'; });
      if (joinBtn) joinBtn.style.display = 'none';
      return;
    }
  }

  if (isMachineGame || !isPvPWaiting) {
    moveBtns.forEach(btn => { btn.style.display = ''; btn.disabled = !isTurnOwner; });
    if (joinBtn) joinBtn.style.display = 'none';
    if (statusEl) {
      if (isMachineGame) {
        if (turn === 'p1') {
          statusEl.textContent = localUser === p1Norm ? 'Your turn' : `Spectating: ${p1}'s turn`;
        } else {
          statusEl.textContent = localUser === p1Norm ? 'Machine is thinking…' : `Spectating: Machine's turn`;
        }
      } else {
        if (!isTurnOwner) {
          statusEl.textContent = 'Waiting for opponent...';
        }
      }
    }
  } else {
    if (localUser === p1Norm) {
      if (statusEl) statusEl.textContent = 'Waiting for Player 2 to join.';
      moveBtns.forEach(btn => { btn.style.display = ''; btn.disabled = true; });
      if (joinBtn) joinBtn.style.display = 'none';
    } else {
      moveBtns.forEach(btn => { btn.style.display = 'none'; });
      if (joinBtn) {
        joinBtn.style.display = 'inline-flex';
        joinBtn.disabled = false;
      }
    }
  }
  if (isMachineGame || !isPvPWaiting) moveBtns.forEach(btn => btn.disabled = !isTurnOwner);
}

function applyRouletteUpdate(update) {
  if (!update || !update.gameId || !update.state) {
    console.warn('[RR:applyUpdate] invalid update -- missing gameId or state', update);
    return;
  }
  const game = document.querySelector(`.rr-widget[data-game-id="${update.gameId}"]`);
  if (!game) {
    console.warn('[RR:applyUpdate] widget not found for gameId:', update.gameId, '-- all widget IDs:', Array.from(document.querySelectorAll('.rr-widget')).map(w => w.dataset.gameId));
    return;
  }
  rrDebug(game, 'applyUpdate', { gameId: update.gameId, stateKeys: Object.keys(update.state || {}).join(',') });

  if (update.state.closed === true || update.state.closed === 'true') {
    const wrapper = game.closest('[id^="msg-"]');
    if (wrapper) {
      wrapper.remove();
      return;
    }
    game.remove();
    return;
  }

  const meta = game.querySelector('.rr-impl');
  if (!meta) return;
  for (const [key, value] of Object.entries(update.state)) {
    if (value === undefined || value === null) continue;
    const lowKey = key.toLowerCase();
    meta.dataset[lowKey] = String(value);
    game.dataset[lowKey] = String(value);
  }
  if (update.state.gameOver === true || update.state.gameOver === 'true') {
    meta.dataset.gameOver = 'true';
    game.dataset.gameOver = 'true';
  }
  if (update.state.closed === true || update.state.closed === 'true') {
    meta.dataset.closed = 'true';
    game.dataset.closed = 'true';
  }
  refreshRouletteWidget(game);
}

function applyRouletteResult(result) {
  if (!result || !result.gameId) return;
  const game = document.querySelector(`.rr-widget[data-game-id="${result.gameId}"]`);
  if (!game) return;
  rrDebug(game, 'applyResult', { gameId: result.gameId, winner: result.winner, p1: result.p1, p2: result.p2 });
  const meta = game.querySelector('.rr-impl');
  if (meta) {
    meta.dataset.gameOver = 'true';
    if (result.winner) meta.dataset.winner = result.winner;
  }
  game.dataset.gameOver = 'true';
  if (result.winner) game.dataset.winner = result.winner;

  const p1 = result.p1 || (meta && meta.dataset.p1) || 'Player 1';
  const p2 = result.p2 || (meta && meta.dataset.p2) || 'Machine';
  const winner = result.winner || game.dataset.winner || p1;
  const loser = (winner === p1 ? p2 : p1) || '';
  const isMachineWin = result.isMachineWin || (winner === 'Machine');

  const gameBody = game.querySelector('.rr-game-body');
  if (gameBody) gameBody.style.display = 'none';
  const resultEl = game.querySelector('.rr-result');
  if (!resultEl) return;
  resultEl.classList.add('vis');

  const graphic = isMachineWin
    ? '<div style="width:76px;height:76px;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:76px;line-height:0.9;color:#ff8dc2">🤖</div>'
    : '<div style="width:76px;height:76px;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:76px;line-height:0.9;color:#f2bc7a">⭐</div>';

  const title = resultEl.querySelector('.rr-res-title');
  const sub = resultEl.querySelector('.rr-res-sub');
  const graphicEl = resultEl.querySelector('.rr-res-graphic');

  if (graphicEl) graphicEl.innerHTML = graphic;
  if (title) title.textContent = `${winner} wins`;
  if (sub) sub.textContent = `${loser} lost in Russian Roulette`;

  const inviteBanner = game.querySelector('.rr-invite-banner');
  if (inviteBanner) inviteBanner.style.display = 'none';
}

function rrDebug(game, stage, extra = {}) {
  const meta = game ? game.querySelector('.rr-impl') : null;
  const gameId = meta ? meta.dataset.gameId : '(no meta)';
  const localUser = (usernameEl && usernameEl.value) ? usernameEl.value.trim() : '(no user)';
  const RR_DEBUG = false;
  if (!RR_DEBUG) return;
  const p1 = meta ? meta.dataset.p1 : '?';
  const p2 = meta ? meta.dataset.p2 : '?';
  const turn = meta ? meta.dataset.turn : '?';
  const bullets = meta ? meta.dataset.bullets : '?';
  const cylinder = meta ? meta.dataset.cylinder : '?';
  const chamber = meta ? meta.dataset.chamber : '?';
  const p1lives = meta ? meta.dataset.p1lives : '?';
  const p2lives = meta ? meta.dataset.p2lives : '?';
  const gameOver = meta ? meta.dataset.gameOver : '?';
  const widgetInDom = game ? !!document.getElementById(game.id) : false;
  const widgetByGameId = gameId !== '(no meta)' ? !!document.querySelector(`.rr-widget[data-game-id="${gameId}"]`) : false;

  const tag = '%c[RR:'+stage+']';
  const style = 'background:#1a0a2e;color:#c97fff;font-weight:700;padding:2px 5px;border-radius:3px';
  const dim = 'color:#888';
  const val = 'color:#7fddff';
  const warn = 'color:#ffb347;font-weight:bold';
  const ok = 'color:#7fff9a';
  const err = 'color:#ff6b6b;font-weight:bold';

  console.groupCollapsed(`${tag}%c ${stage}`, style, 'color:#e0d0ff;font-weight:500');
  console.log('%cgameId       %c%s', dim, widgetByGameId ? ok : err, gameId);
  console.log('%clocalUser    %c%s', dim, val, localUser);
  console.log('%cp1           %c%s', dim, val, p1);
  console.log('%cp2           %c%s', dim, val, p2);
  console.log('%cturn         %c%s', dim, (turn === 'p1' || turn === 'p2') ? ok : val, turn);
  console.log('%cchamber      %c%s', dim, val, chamber);
  console.log('%cbullets      %c%s', dim, val, bullets);
  console.log('%ccylinder     %c%s', dim, val, cylinder);
  console.log('%cp1lives      %c%s', dim, val, p1lives);
  console.log('%cp2lives      %c%s', dim, val, p2lives);
  console.log('%cgameOver     %c%s', dim, gameOver === 'true' ? warn : ok, gameOver);
  console.log('%cwidgetInDOM  %c%s', dim, widgetInDom ? ok : err, widgetInDom);
  console.log('%cwidgetByGID  %c%s', dim, widgetByGameId ? ok : err, widgetByGameId);

  if (Object.keys(extra).length) {
    console.log('%c--- extra ---', 'color:#666');
    Object.entries(extra).forEach(([k,v]) => console.log('%c'+k+' %c'+String(v), dim, val));
  }

  const isParticipant = localUser.toLowerCase() === p1.toLowerCase() || (p2.toLowerCase() !== 'machine' && localUser.toLowerCase() === p2.toLowerCase());
  const isTurnOwner = (turn === 'p1' && localUser.toLowerCase() === p1.toLowerCase()) || (turn === 'p2' && p2.toLowerCase() !== 'machine' && localUser.toLowerCase() === p2.toLowerCase());
  console.log('%cisParticipant %c%s', dim, isParticipant ? ok : warn, isParticipant);
  console.log('%cisTurnOwner   %c%s', dim, isTurnOwner ? ok : warn, isTurnOwner);

  if (!widgetByGameId) console.warn('%c⚠ Widget NOT found by gameId -- state sync will silently fail', err);
  console.groupEnd();
}

function sendRouletteUpdateState(gameId, state) {
  if (!gameId || !state || !ws || ws.readyState !== WebSocket.OPEN) return;
  const payload = { type: 'message', text: `@@RR-UPDATE@@${JSON.stringify({ gameId, state })}` };
  try {
    ws.send(JSON.stringify(payload));
  } catch (e) {}
}

function sendRouletteResultState(gameId, result) {
  if (!gameId || !result || !ws || ws.readyState !== WebSocket.OPEN) return;
  const payload = { type: 'message', text: `@@RR-RESULT@@${JSON.stringify({ gameId, ...result })}` };
  try {
    ws.send(JSON.stringify(payload));
  } catch (e) {}
}

function normalizeRouletteMessage(msg) {
  if (!msg || !msg.text) return msg;
  const marker = '@@RR@@';
  const updateMarker = '@@RR-UPDATE@@';
  const text = String(msg.text || '');

  if (text.startsWith(updateMarker)) {
    const body = text.slice(updateMarker.length).trim();
    try {
      const parsed = JSON.parse(body);
      if (parsed && parsed.gameId) {
        return { ...msg, rrUpdate: parsed, text: '' };
      }
    } catch (e) {}
    return msg;
  }

  const resultMarker = '@@RR-RESULT@@';
  if (text.startsWith(resultMarker)) {
    const body = text.slice(resultMarker.length).trim();
    try {
      const parsed = JSON.parse(body);
      if (parsed && parsed.gameId) {
        return { ...msg, rrResult: parsed, text: '' };
      }
    } catch (e) {}
    return msg;
  }

  if (!text.startsWith(marker)) return msg;
  const body = text.slice(marker.length).trim();
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { return msg; }
  const p1 = parsed.p1 || 'Player 1';
  const p2 = parsed.p2 || 'Machine';
  const bullet = Number(parsed.bullet) || Math.floor(Math.random() * 6);
  const chamber = Number(parsed.chamber) || 0;
  const initial = parsed.initial || `${p1} vs ${p2 || 'Machine'}`;
  const seed = parsed.gameId || `rr-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

  ensureRouletteStyles();

  const SVG_P1 = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2C10 2 3.5 7.5 3.5 11.5a6.5 6.5 0 0 0 13 0C16.5 7.5 10 2 10 2z" fill="#7B68D4" opacity=".9"/></svg>`;
  const SVG_P2 = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="10,1.5 12.5,7 18.5,8 14,12.5 15.5,18.5 10,15.5 4.5,18.5 6,12.5 1.5,8 7.5,7" fill="#D46868" opacity=".9"/></svg>`;
  const SVG_AI = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="6.5" y="9" width="2.5" height="2.5" rx=".7" fill="currentColor"/><rect x="11" y="9" width="2.5" height="2.5" rx=".7" fill="currentColor"/><path d="M7.5 13.5h5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><path d="M10 6V3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="10" cy="3" r="1" fill="currentColor"/><path d="M3 10.5H1.5M18.5 10.5H17" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;

  const ICO_SPIN = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 8A5 5 0 1 1 8 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M8 3l2 1.8L8 6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICO_PULL = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.4"/><line x1="8" y1="3" x2="8" y2="1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="8" y1="15" x2="8" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="3" y1="8" x2="1" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="15" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  const ICO_ADD = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="3" width="4" height="8" rx="2" stroke="currentColor" stroke-width="1.4"/><line x1="8" y1="11" x2="8" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="11.5" y1="2" x2="14.5" y2="2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="13" y1=".5" x2="13" y2="3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

  const trackDots = Array.from({ length: 6 }, (_, i) => `<div class="rr-td${i === 0 ? ' cur' : ''}" data-tdot="${i}"></div>`).join('');
  const makeLives = () => Array.from({ length: 3 }, () => '<div class="rr-life"></div>').join('');

  const rrHtml = `
<div class="rr-widget game-widget" id="${seed}" data-game-id="${seed}">
  <div class="rr-card" style="position:relative">
    <div class="rr-flash"></div>
    <div class="rr-header">
      <div>
        <div class="rr-eyebrow">Russian Roulette</div>
        <div class="rr-title">${escapeHTML(initial)}</div>
      </div>
    </div>
    <div class="rr-game-body">
      <div class="rr-arena">
        <div class="rr-player p1 active" data-side="p1">
          <div class="rr-sym s1">${SVG_P1}</div>
          <div class="rr-pname">${escapeHTML(p1)}</div>
          <div class="rr-lives" data-side="p1">${makeLives()}</div>
          <div class="rr-psub" data-side="p1">your turn</div>
          <div class="rr-shots" data-side="p1">0 fired</div>
        </div>
        <div class="rr-center">
          <div class="rr-rnd">RD 1</div>
          <div class="rr-cyl-wrap">
            <div class="rr-cyl"><div class="rr-ch-dots"></div><div class="rr-cpin"></div></div>
          </div>
          <div class="rr-cyl-count">1 / 6</div>
          <div class="rr-track">${trackDots}</div>
        </div>
        <div class="rr-player p2" data-side="p2">
          <div class="rr-sym ${p2 === 'Machine' ? 'sai' : 's2'}">${p2 === 'Machine' ? SVG_AI : SVG_P2}</div>
          <div class="rr-pname">${escapeHTML(p2)}</div>
          <div class="rr-lives" data-side="p2">${makeLives()}</div>
          <div class="rr-psub" data-side="p2">waiting</div>
          <div class="rr-shots" data-side="p2">0 fired</div>
        </div>
      </div>
      <div class="rr-moves">
        <button class="rr-btn rr-move" data-action="spin">${ICO_SPIN}<div class="rr-move-label">Spin &amp; Pull Trigger</div></button>
        <button class="rr-btn rr-move" data-action="pull">${ICO_PULL}<div class="rr-move-label">Pull Trigger</div></button>
        <button class="rr-btn rr-move" data-action="add">${ICO_ADD}<div class="rr-move-label">Add Bullet &amp; Pull Trigger</div></button>
      </div>
      <div class="rr-footer">
        <div class="rr-status">Choose your move.</div>
        <div class="rr-log"></div>
      </div>
    </div>
    <div class="rr-result">
      <div class="rr-res-graphic"></div>
      <div class="rr-res-title"></div>
      <div class="rr-res-sub"></div>
      <div class="rr-res-btns">
        <button class="rr-rbtn close" style="flex:1">Close</button>
      </div>
    </div>
    <div class="rr-invite-banner" style="display:none">
      <span class="rr-invite-text"></span>
      <button class="rr-btn rr-join" data-action="join">Accept &amp; Join</button>
    </div>
    <div class="rr-impl" style="display:none"
      data-game-id="${seed}"
      data-owner="${escapeHTML(p1)}"
      data-p1="${escapeHTML(p1)}"
      data-p2="${escapeHTML(p2)}"
      data-cylinder="${Array(6).fill(false).map((v,i)=>i===bullet).join(',')}"
      data-chamber="${chamber}"
      data-bullets="1"
      data-shots="0"
      data-round="1"
      data-turn="p1"
      data-p1lives="3"
      data-p2lives="3"
      data-p1fired="0"
      data-p2fired="0"
      data-wait-timestamp="${Date.now()}"
    ></div>
  </div>
</div>
`;

  requestAnimationFrame(() => {
    const widget = document.getElementById(seed);
    if (!widget) return;
    const wrap = widget.querySelector('.rr-ch-dots');
    if (!wrap) return;
    const radius = 20;
    const dotSize = 13;
    const half = dotSize / 2;
    const initialCylinder = (Array.isArray && Array.isArray ? Array(6).fill(false) : Array(6).fill(false));
    initialCylinder[bullet] = true;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * 2 * Math.PI - Math.PI / 2;
      const dot = document.createElement('div');
      dot.className = 'rr-chamber' + (initialCylinder[i] ? ' loaded' : '');
      dot.style.cssText = `position:absolute;left:${Math.round(33 + radius * Math.cos(angle) - half)}px;top:${Math.round(33 + radius * Math.sin(angle) - half)}px`;
      wrap.appendChild(dot);
    }
    refreshRouletteWidget(widget);
  });

  return { ...msg, from: 'Roulette', category: 'system', kind: 'text', text: '', rrHtml };
}

function addMessage(rawMsg, scroll = true) {
    if (!rawMsg) return;
    if (rawMsg.text && rawMsg.text.trim() === 'TERRORCLIENT: PING') return;

    let normalized = normalizeEightBallMessage(rawMsg);
    normalized = normalizeRouletteMessage(normalized);

    if (normalized.rrUpdate) {
      applyRouletteUpdate(normalized.rrUpdate);
      return;
    }
    if (normalized.rrResult) {
      applyRouletteResult(normalized.rrResult);
      return;
    }
    const msgText = (normalized.text || '').trim();
    const msgFrom = (normalized.from || '').trim();
    const category = normalized.category || normalized.kind;
    const isSysEarly = category === 'system' || normalized.from === 'system' || normalized.type === 'info' || normalized.type === 'error';
    const isLocalEcho = !!rawMsg.__localEcho;
    const clientKey = (rawMsg.clientId && String(rawMsg.clientId).trim()) || '';

    const fromMeEarly = msgFrom && usernameEl.value && msgFrom === usernameEl.value;
    const isMagicEightBall = msgFrom === 'Magic8Ball';
    const hasReactions = rawMsg.reactions && typeof rawMsg.reactions === 'object' && Object.keys(rawMsg.reactions).length > 0;
    const canonicalIdEarly = (normalized.id && String(normalized.id).trim()) || '';
    const isReactionUpdate = hasReactions && canonicalIdEarly && document.getElementById(`msg-${canonicalIdEarly}`);

    const signature = rawMsg.__signature || computeMessageSignature(normalized);
    const spamFilterEnabled = settings.spamFilter !== false;
    const hasSpamContent = Boolean(msgText) || Boolean(normalized.attachment && (normalized.attachment.url || normalized.attachment.data));
    const spamKey = signature || msgText || (normalized.attachment ? JSON.stringify(normalized.attachment) : '');
    const shouldCheckDupe = spamFilterEnabled && hasSpamContent && msgFrom && !isSysEarly && !rawMsg.__ephemeral && !isMagicEightBall && !isReactionUpdate;
    const isServerAckOfOwn = !isLocalEcho && fromMeEarly && clientKey;

    if (shouldCheckDupe && !isServerAckOfOwn && spamKey) {
      let userSpamMap = spamTrackerByUser.get(msgFrom);
      if (!userSpamMap) {
        userSpamMap = new Map();
        spamTrackerByUser.set(msgFrom, userSpamMap);
      }
      const existingEntry = userSpamMap.get(spamKey);
      if (existingEntry) {
        existingEntry.dupeCount = (existingEntry.dupeCount || 1) + 1;
        const existingWrapper = document.getElementById(`msg-${existingEntry.id}`);
        if (existingWrapper) {
          const bubble = existingWrapper.querySelector('.bubble');
          if (bubble) {
            let dupeIndicator = bubble.querySelector('.dupe-indicator');
            if (!dupeIndicator) {
              dupeIndicator = document.createElement('div');
              dupeIndicator.className = 'dupe-indicator';
              bubble.appendChild(dupeIndicator);
            }
            dupeIndicator.textContent = `[x${existingEntry.dupeCount}]`;
            if (!rawMsg.replyTo) {
              const replyRef = bubble.querySelector('.reply-reference');
              if (replyRef) replyRef.remove();
              try { delete existingWrapper.dataset.replyTo; } catch (e) {}
            }
          }
          if (isLocalEcho && clientKey) {
            existingWrapper.dataset.dupeClientIds = (existingWrapper.dataset.dupeClientIds || '') + ',' + clientKey;
          }
          messagesEl.appendChild(existingWrapper);
        }
        if (scroll) messagesEl.scrollTop = messagesEl.scrollHeight;
        return;
      }
    }
    
    const canonicalId = canonicalIdEarly;
    const fallbackId = `tmp-${rawMsg.ts || Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const isSys = isSysEarly;
    const fromMe = fromMeEarly;
    const mentionTargets = normalized.text ? extractMentionsFromText(normalized.text) : [];
    const myHandle = (usernameEl.value || '').trim().toLowerCase();
    const mentionsMe = !!myHandle && mentionTargets.includes(myHandle);

    let pendingRef = null;
    if (!rawMsg.__localEcho) {
      if (clientKey) {
        pendingRef = takePendingEchoById(clientKey);
      }
      if (!pendingRef && fromMe && signature) {
        pendingRef = takePendingEchoBySignature(signature);
      }
    }

    const lookupKeys = [];
    if (canonicalId) lookupKeys.push(canonicalId);
    if (clientKey && clientKey !== canonicalId) lookupKeys.push(clientKey);
    let wrapper = null;
    for (const key of lookupKeys) {
      const node = document.getElementById(`msg-${key}`);
      if (node) {
        wrapper = node;
        break;
      }
    }
    if (!wrapper && pendingRef && pendingRef.domId) {
      wrapper = document.getElementById(pendingRef.domId);
    }
    if (!wrapper && signature && fromMe) {
      wrapper = messagesEl.querySelector(`[data-signature="${signature}"][data-from-me="true"][data-pending="true"]`);
    }
    if (!wrapper && clientKey && isServerAckOfOwn) {
      const dupeTarget = messagesEl.querySelector(`[data-dupe-client-ids*="${clientKey}"]`);
      if (dupeTarget) {
        return;
      }
    }
    let existingDupeCount = null;
    let existingDupeClientIds = null;
    if (wrapper) {
      const existingIndicator = wrapper.querySelector('.dupe-indicator');
      if (existingIndicator) {
        const match = existingIndicator.textContent.match(/\[x(\d+)\]/);
        if (match) existingDupeCount = parseInt(match[1], 10);
      }
      existingDupeClientIds = wrapper.dataset.dupeClientIds || null;
      wrapper.innerHTML = '';
    } else {
      wrapper = document.createElement('div');
    }

    const existingDomId = wrapper.id ? wrapper.id.replace(/^msg-/, '') : '';
    const finalDomId = canonicalId || clientKey || existingDomId || fallbackId;
    wrapper.id = `msg-${finalDomId}`;

    const dedupeTargets = [];
    if (canonicalId) dedupeTargets.push(canonicalId);
    if (clientKey && clientKey !== canonicalId) dedupeTargets.push(clientKey);
    if (finalDomId) dedupeTargets.push(finalDomId);
    let alreadySeen = dedupeTargets.some((key) => key && seenIds.has(key));
    dedupeTargets.forEach((key) => { if (key) seenIds.add(key); });

    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + (isSys ? 'sys' : (fromMe ? 'me' : 'other'));
    if (rawMsg.whisperTo) {
      bubble.classList.add('whisper');
      const whisperHeader = document.createElement('div');
      whisperHeader.className = 'whisper-header';
      whisperHeader.textContent = `${rawMsg.from || 'Unknown'} whispers to ${rawMsg.whisperTo}`;
      bubble.appendChild(whisperHeader);
    }

    const replyReference = rawMsg.replyTo ? buildReplyReference(rawMsg.replyTo) : null;

    if (!isSys) {
      const meta = document.createElement('div');
      meta.className = 'meta';
      const metaLabel = document.createElement('span');
      metaLabel.className = 'meta-text';
      metaLabel.textContent = `${rawMsg.from || 'anon'} • ${new Date(rawMsg.ts || Date.now()).toLocaleTimeString()}`;
      meta.appendChild(metaLabel);
      if (mentionsMe && !fromMe) {
        const pill = document.createElement('span');
        pill.className = 'mention-pill';
        pill.textContent = '@you';
        meta.appendChild(pill);
      }
      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.className = 'reply-btn';
      replyBtn.title = 'Reply to message';
      replyBtn.textContent = '↩';
      replyBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginReplyToMessage(rawMsg);
      });
      meta.appendChild(replyBtn);
      
      if (rawMsg.id && !meta.querySelector('.react-btn')) {
        const reactBtn = document.createElement('button');
        reactBtn.type = 'button';
        reactBtn.className = 'react-btn';
        reactBtn.title = 'React';
        reactBtn.textContent = '😊';
        reactBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          showReactionPanel(rawMsg.id, reactBtn);
        });
        meta.appendChild(reactBtn);
      }
      bubble.appendChild(meta);
    }

    if (replyReference) {
      bubble.appendChild(replyReference);
    }

    if (normalized.rrHtml) {
      const content = document.createElement('div');
      content.className = 'content';
      content.innerHTML = normalized.rrHtml;
      bubble.appendChild(content);
    } else if (normalized.__html) {
      const content = document.createElement('div');
      content.className = 'content';
      content.innerHTML = normalized.text || '';
      bubble.appendChild(content);
    } else if (normalized.text) {
      const content = document.createElement('div');
      content.className = 'content';
      content.innerHTML = renderRichText(normalized.text);
      bindSpoilerToggles(content);
      decorateMentions(content);
      bubble.appendChild(content);
      
      const ytMatch = normalized.text.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i);
      if (ytMatch) {
        const videoId = extractYouTubeId(normalized.text);
        if (videoId) {
          const ytEmbed = buildYouTubeEmbed(videoId);
          if (ytEmbed) bubble.appendChild(ytEmbed);
        }
      }
    } else if (isSys) {
      bubble.textContent = normalized.text || (normalized.system ? `${normalized.system.user || 'user'} ${normalized.system.status}` : 'system message');
    }

    if (rawMsg.attachment) {
      const node = buildAttachmentElement(rawMsg);
      if (node) bubble.appendChild(node);
    }

    if (rawMsg.poll) {
      const pollNode = renderPoll(rawMsg.poll);
      if (pollNode) bubble.appendChild(pollNode);
    }

    if (rawMsg.__ephemeral) {
      bubble.classList.add('ephemeral');
      const note = document.createElement('div');
      note.className = 'ephemeral-note';
      const noteText = document.createElement('span');
      noteText.textContent = 'Only you can see this message.';
      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'ephemeral-dismiss';
      dismissBtn.type = 'button';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrapper = bubble.closest('.message-wrapper');
        if (wrapper) wrapper.remove();
        else bubble.remove();
      });
      note.appendChild(noteText);
      note.appendChild(dismissBtn);
      bubble.appendChild(note);
    }

    const existingReactions = bubble.querySelector('.reactions');
    if (existingReactions) existingReactions.remove();
    if (rawMsg.reactions && typeof rawMsg.reactions === 'object') {
      const reactionsDiv = document.createElement('div');
      reactionsDiv.className = 'reactions';
      Object.entries(rawMsg.reactions).forEach(([emoji, users]) => {
        if (users && Array.isArray(users) && users.length > 0) {
          const reactionSpan = document.createElement('span');
          reactionSpan.className = 'reaction';
          reactionSpan.textContent = `${emoji} ${users.length}`;
          reactionSpan.addEventListener('click', () => sendReaction(rawMsg.id, emoji));
          reactionsDiv.appendChild(reactionSpan);
        }
      });
      bubble.appendChild(reactionsDiv);
    }

    if (mentionTargets.length) {
      bubble.dataset.mentions = mentionTargets.join(',');
      bubble.classList.add('has-mentions');
    }
    if (mentionsMe && !isSys) {
      bubble.classList.add('mention-hit');
    }
    if (!isSys && !rawMsg.__history) {
      if (mentionsMe) {
        const lastMentionFromUser = mentionSoundTracker.get(msgFrom);
        if (lastMentionFromUser !== msgText) {
          playMentionTone();
          mentionSoundTracker.set(msgFrom, msgText);
        }
      } else {
        if (mentionSoundTracker.has(msgFrom)) {
          mentionSoundTracker.delete(msgFrom);
        }
        if (settings && settings.playMentionWhenHidden) {
          try {
            if (!isOverlayVisible && (document.hidden || document.visibilityState === 'hidden' || !document.hasFocus())) {
              playMentionTone();
            }
          } catch (e) {}
        }
      }
    }
    if (rawMsg.replyTo && rawMsg.replyTo.id) {
      bubble.dataset.replyTo = rawMsg.replyTo.id;
    }
    if (rawMsg.pinned) {
      bubble.classList.add('pinned-message');
      if (!pinnedMessages.some(m => m.id === rawMsg.id)) {
        pinnedMessages.push({
          id: rawMsg.id,
          from: rawMsg.from || 'user',
          text: summarizeMessageForReply(rawMsg),
          ts: rawMsg.ts || Date.now()
        });
      }
      if (!hostPinnedMessages.some(m => m.id === rawMsg.id)) {
        hostPinnedMessages.push({
          id: rawMsg.id,
          from: rawMsg.from || 'user',
          text: summarizeMessageForReply(rawMsg),
          ts: rawMsg.ts || Date.now()
        });
      }
    }

    wrapper.dataset.clientId = clientKey || canonicalId || '';
    wrapper.dataset.signature = signature || '';
    wrapper.dataset.fromMe = fromMe ? 'true' : 'false';
    const acked = !!(clientKey || canonicalId || pendingRef);
    if (acked) {
      wrapper.dataset.pending = 'false';
    } else if (rawMsg.__localEcho) {
      wrapper.dataset.pending = 'true';
    }

    wrapper.appendChild(bubble);
    
    if (existingDupeCount && existingDupeCount > 1) {
      const dupeIndicator = document.createElement('div');
      dupeIndicator.className = 'dupe-indicator';
      dupeIndicator.textContent = `[x${existingDupeCount}]`;
      bubble.appendChild(dupeIndicator);
    }
    if (existingDupeClientIds) {
      wrapper.dataset.dupeClientIds = existingDupeClientIds;
    }
    
    if (!alreadySeen || !messagesEl.contains(wrapper)) {
      messagesEl.appendChild(wrapper);
      while (messagesEl.children.length > 120) messagesEl.removeChild(messagesEl.children[0]);
    }
    try { applyBubbleOpacity(bubble, Number.isFinite(Number(settings.bgOpacity)) ? Number(settings.bgOpacity) : 92); } catch (e) {}
    if (rawMsg.__pendingRef) {
      rawMsg.__pendingRef.domId = wrapper.id;
    }
    if (scroll) messagesEl.scrollTop = messagesEl.scrollHeight;

    if (!isSys && rawMsg.id && hostIsRunning) {
      const previewText = summarizeMessageForReply(rawMsg) || '';
      hostRecentMessages = hostRecentMessages.filter(m => m.id !== rawMsg.id);
      hostRecentMessages.unshift({
        id: rawMsg.id,
        from: rawMsg.from || 'user',
        text: previewText,
        ts: rawMsg.ts || Date.now()
      });
      if (hostRecentMessages.length > 60) {
        hostRecentMessages = hostRecentMessages.slice(0, 60);
      }
      updateHostRecentList();
    }

    const shouldTrack = spamFilterEnabled && spamKey && msgFrom && !isSys && !rawMsg.__ephemeral;
    const shouldTrackNow = shouldTrack && (isLocalEcho ? fromMe : !fromMe);
    if (shouldTrackNow && !isServerAckOfOwn) {
      let userSpamMap = spamTrackerByUser.get(msgFrom);
      if (!userSpamMap) {
        userSpamMap = new Map();
        spamTrackerByUser.set(msgFrom, userSpamMap);
      }
      userSpamMap.set(spamKey, {
        id: finalDomId,
        dupeCount: 1,
        attachment: !!(normalized.attachment && (normalized.attachment.url || normalized.attachment.data)),
        clientId: clientKey || ''
      });
      if (userSpamMap.size > 50) {
        const firstKey = userSpamMap.keys().next().value;
        userSpamMap.delete(firstKey);
      }
    }

    if (isServerAckOfOwn && fromMe) {
      const userSpamMap = spamTrackerByUser.get(msgFrom);
      if (userSpamMap) {
        const entry = userSpamMap.get(spamKey);
        if (entry) {
          entry.id = finalDomId;
        }
      }
    }
  }

  function applyBubbleOpacity(bubble, opacity) {
    const parsed = parseInt(opacity, 10);
    const val = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 92;
    const bubbleAlpha = Math.max(0.5, val / 100);
    const theme = (settings.theme || 'default').toLowerCase();
    
    if (bubble.classList.contains('me')) {
      const meGradients = {
        default: `linear-gradient(135deg, rgba(187, 134, 255, ${bubbleAlpha}), rgba(128, 93, 255, ${bubbleAlpha}))`,
        shockwire: `linear-gradient(135deg, rgba(255, 204, 0, ${bubbleAlpha}), rgba(255, 149, 0, ${bubbleAlpha}))`,
        royalchain: `linear-gradient(135deg, rgba(106, 161, 255, ${bubbleAlpha}), rgba(43, 107, 214, ${bubbleAlpha}))`,
        bloodlink: `linear-gradient(135deg, rgba(255, 107, 107, ${bubbleAlpha}), rgba(217, 58, 58, ${bubbleAlpha}))`,
        rosepetal: `linear-gradient(135deg, rgba(255, 105, 180, ${bubbleAlpha}), rgba(255, 20, 147, ${bubbleAlpha}))`,
        toxicreactor: `linear-gradient(135deg, rgba(141, 214, 106, ${bubbleAlpha}), rgba(94, 167, 74, ${bubbleAlpha}))`
      };
      bubble.style.background = meGradients[theme] || meGradients.default;
      bubble.style.border = '1px solid transparent';
      bubble.style.boxShadow = 'none';
    } else if (bubble.classList.contains('other')) {
      if (theme === 'toxicreactor') {
        bubble.style.background = `linear-gradient(180deg, rgba(161, 224, 121, ${(0.11 * bubbleAlpha).toFixed(3)}), rgba(19, 30, 16, ${(0.78 * bubbleAlpha).toFixed(3)}))`;
      } else {
        const otherAlpha = (0.05 * bubbleAlpha).toFixed(3);
        bubble.style.background = `rgba(255, 255, 255, ${otherAlpha})`;
      }
      bubble.style.border = '1px solid transparent';
      bubble.style.boxShadow = 'none';
    } else if (bubble.classList.contains('sys')) {
      if (theme === 'toxicreactor') {
        bubble.style.background = `linear-gradient(180deg, rgba(160, 223, 120, ${(0.09 * bubbleAlpha).toFixed(3)}), rgba(14, 23, 12, ${(0.72 * bubbleAlpha).toFixed(3)}))`;
      } else {
        const sysAlpha = (0.02 * bubbleAlpha).toFixed(3);
        bubble.style.background = `rgba(255, 255, 255, ${sysAlpha})`;
      }
      bubble.style.border = '1px solid transparent';
      bubble.style.boxShadow = 'none';
    }

    if (bubble.classList.contains('whisper')) {
      const whisperBorders = {
        default: `rgba(165, 180, 252, ${bubbleAlpha})`,
        shockwire: `rgba(255, 209, 64, ${bubbleAlpha})`,
        royalchain: `rgba(134, 183, 255, ${bubbleAlpha})`,
        bloodlink: `rgba(255, 179, 179, ${bubbleAlpha})`,
        toxicreactor: `rgba(74, 222, 128, ${bubbleAlpha})`,
        rosepetal: `rgba(244, 114, 182, ${bubbleAlpha})`
      };
      const color = whisperBorders[theme] || whisperBorders.default;
      bubble.style.border = `1px solid ${color}`;
      bubble.style.boxShadow = `0 0 0 1px ${color}`;
      const header = bubble.querySelector('.whisper-header');
      if (header) header.style.color = '#ffffff';
    }

    if (bubble.classList.contains('ephemeral')) {
      const ephemeralBorders = {
        default: `rgba(165, 180, 252, ${bubbleAlpha})`,
        shockwire: `rgba(255, 214, 77, ${bubbleAlpha})`,
        royalchain: `rgba(134, 183, 255, ${bubbleAlpha})`,
        bloodlink: `rgba(255, 179, 179, ${bubbleAlpha})`,
        toxicreactor: `rgba(74, 222, 128, ${bubbleAlpha})`,
        rosepetal: `rgba(251, 113, 133, ${bubbleAlpha})`
      };
      const color = ephemeralBorders[theme] || ephemeralBorders.default;
      bubble.style.border = `1px dashed ${color}`;
      bubble.style.boxShadow = `0 0 0 1px ${color}`;
      bubble.style.color = color;
    }
  }

  function addEphemeralMessage(text) {
    addMessage({
      id: `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from: 'system',
      text,
      category: 'system',
      ts: Date.now(),
      __ephemeral: true
    });
  }

  function clearMessages() {
    messagesEl.innerHTML = '';
    seenIds.clear();
    spamTrackerByUser.clear();
    mentionSoundTracker.clear();
    resetPendingEchoes();
    hideEmojiHint();
    clearReplyPreviewUI();
    pinnedMessages = [];
    hostPinnedMessages = [];
    hostRecentMessages = [];
    updatePinnedBanner();
    updateHostPinnedList();
    updateHostRecentList();
  }
  function connectSocket() {
    const url = serverUrlEl.value.trim();
    const name = usernameEl.value.trim();
    if (!url || !name) {
      alert('Enter server URL and username.');
      return;
    }
    if (name.length > 15) {
      alert('Username must be 15 characters or fewer.');
      return;
    }

    let wsTarget = url;
    if (!/^wss?:/i.test(wsTarget)) {
      if (/^https?:/i.test(wsTarget)) wsTarget = wsTarget.replace(/^http/i, 'ws');
      else wsTarget = `${isLikelyLocalTarget(wsTarget) ? 'ws' : 'wss'}://${wsTarget}`;
    }

    try {
      localStorage.setItem('terrorlink_server', url);
      localStorage.setItem('terrorlink_username', name);
    } catch (e) {}

    lastServerUrl = url;
    lastUsername = name;
    intentionalDisconnect = false;
    connectionFailed = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const sep = wsTarget.includes('?') ? '&' : '?';
    const wsUrl = `${wsTarget}${sep}username=${encodeURIComponent(name)}&version=${encodeURIComponent(clientVersion)}`;

    try {
      let created = false;
      if (/(loca\.lt|localtunnel\.me)/i.test(wsTarget)) {
        try {
          ws = new NodeWs(wsUrl, {
            perMessageDeflate: false,
            headers: {
              Origin: 'https://localtunnel.me',
              'bypass-tunnel-reminder': 'true'
            }
          });
          created = true;
        } catch (nodeWsErr) {
          try { void nodeWsErr; } catch (e) {}
        }
      }
      if (!created) ws = new WebSocket(wsUrl);
    } catch (err) {
      alert('Failed to create WebSocket: ' + err.message);
      return;
    }

    setStatus('connecting...');
    setConnectActionState('connecting');

    addSocketListener(ws, 'open', () => {
      connected = true;
      serverVersionVerified = false;
      setTimeout(() => e2eeInitOnConnect().catch(e => {}), 200);
      setStatus('connected');
      setConnectActionState('connected');
      setDetailsVisible(false);
      serverUrlEl.disabled = true;
      usernameEl.disabled = true;
      try { if (notesBtn) notesBtn.disabled = false; } catch (e) {}
      try { loadSessionNotes(); } catch (e) {}
      startPingLoop();
      try { ws.send(JSON.stringify({ type: 'list' })); } catch (e) {}
      if (reconnectResetTimer) {
        clearTimeout(reconnectResetTimer);
        reconnectResetTimer = null;
      }
      reconnectResetTimer = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) reconnectAttempts = 0;
      }, 10000);
      if (serverVersionTimer) {
        clearTimeout(serverVersionTimer);
        serverVersionTimer = null;
      }
      serverVersionTimer = setTimeout(() => {
        if (!serverVersionVerified && ws && ws.readyState === WebSocket.OPEN) {
          const reason = lastServerVersion ? `server v${lastServerVersion}` : 'no server version provided';
          addMessage({ id: 'sys-version-timeout-' + Date.now(), from: 'system', text: `Server did not report its version in time (${reason}). ${VERSION_MISMATCH_MESSAGE}`, category: 'system', ts: Date.now() });
          intentionalDisconnect = true;
          connectionFailed = true;
          try { ws.close(1000, `version mismatch (${reason})`); } catch (e) {}
        }
      }, 10000);
    });

    addSocketListener(ws, 'message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'server-version') {
          const serverVersion = String((msg && msg.version) || '').trim();
          lastServerVersion = serverVersion || null;
          serverVersionVerified = true;
          if (serverVersionTimer) {
            clearTimeout(serverVersionTimer);
            serverVersionTimer = null;
          }
          if (!serverVersion) {
            addMessage({ id: 'sys-version-mismatch-' + Date.now(), from: 'system', text: `${VERSION_MISMATCH_MESSAGE} (server did not send a version)`, category: 'system', ts: Date.now() });
            intentionalDisconnect = true;
            connectionFailed = true;
            try { ws.close(1000, 'version mismatch (no server version)'); } catch (e) {}
          } else if (serverVersion !== clientVersion) {
            addMessage({ id: 'sys-version-mismatch-' + Date.now(), from: 'system', text: `${VERSION_MISMATCH_MESSAGE} (client=${clientVersion} server=${serverVersion})`, category: 'system', ts: Date.now() });
            intentionalDisconnect = true;
            connectionFailed = true;
            try { ws.close(1000, `version mismatch (client=${clientVersion} server=${serverVersion})`); } catch (e) {}
          }
        } else if (msg.type === 'history') {
          clearMessages();
          (msg.data || []).forEach((m) => addMessage({ ...m, __history: true }, false));
          messagesEl.scrollTop = messagesEl.scrollHeight;
          updatePinnedBanner();
          updateHostPinnedList();
          updateHostRecentList();
        } else if (msg.type === 'e2ee-pubkey') {
          const pkData = msg;
          if (pkData.username && pkData.pubkey) {
            e2eeHandlePubkey(pkData.username, pkData.pubkey).catch(e => console.warn('E2EE pubkey error:', e));
          } else if (pkData.username && !pkData.pubkey) {
            delete e2eePeerKeys[pkData.username];
          }
        } else if (msg.type === 'e2ee-roomkey') {
          if (msg.from && msg.key) {
            e2eeHandleRoomkey(msg.from, msg.key).catch(e => console.warn('E2EE roomkey error:', e));
          }
        } else if (msg.type === 'message' || msg.type === 'system') {
          if (msg.data) {
            if (msg.data.ciphertext && e2eeEnabled && e2eeRoomKey) {
              (async () => {
                try {
                  const decrypted = await e2eeDecryptText(msg.data.ciphertext);
                  if (decrypted !== null) msg.data.text = decrypted;
                } catch (e) { console.warn('E2EE decrypt error:', e); }
                addMessage(msg.data);
              })();
            } else {
              addMessage(msg.data);
            }
          }
        } else if (msg.type === 'info' || msg.type === 'error') {
          addMessage({ id: 'sys-' + Date.now(), from: 'system', text: msg.message || JSON.stringify(msg), ts: Date.now() });
        } else if (msg.type === 'presence') {
          const info = msg.data || {};
          addMessage({
            id: `presence-${info.user || 'user'}-${Date.now()}`,
            from: 'system',
            text: `${info.user || 'user'} is ${info.status || 'online'}`,
            category: 'system',
            ts: Date.now()
          });
          try {
            const user = (info.user || '').toString();
            if (user) {
              if ((info.status || '') === 'online') {
                if (!usersList.includes(user)) usersList.push(user);
              } else if ((info.status || '') === 'offline') {
                usersList = usersList.filter(u => u !== user);
              }
              try { handleMentionAutocomplete(); } catch (e) {}
            }
          } catch (e) {}
        } else if (msg.type === 'users') {
          const users = Array.isArray(msg.data) ? msg.data.map(u => String(u)) : [];
          usersList = users;
          try { handleMentionAutocomplete(); } catch (e) {}
        } else if (msg.type === 'pin-update') {
          if (msg.id) {
            const msgWrapper = document.getElementById(`msg-${msg.id}`);
            if (msgWrapper) {
              const bubble = msgWrapper.querySelector('.bubble');
              if (bubble) {
                if (msg.pinned) {
                  bubble.classList.add('pinned-message');
                  if (!pinnedMessages.some(m => m.id === msg.id)) {
                    const meta = bubble.querySelector('.meta-text');
                    const content = bubble.querySelector('.content');
                    const fromMatch = meta ? meta.textContent.match(/^([^•]+)/) : null;
                    pinnedMessages.push({
                      id: msg.id,
                      from: fromMatch ? fromMatch[1].trim() : 'user',
                      text: content ? content.textContent : '',
                      ts: Date.now()
                    });
                  }
                  if (!hostPinnedMessages.some(m => m.id === msg.id)) {
                    const meta = bubble.querySelector('.meta-text');
                    const content = bubble.querySelector('.content');
                    const fromMatch = meta ? meta.textContent.match(/^([^•]+)/) : null;
                    hostPinnedMessages.push({
                      id: msg.id,
                      from: fromMatch ? fromMatch[1].trim() : 'user',
                      text: content ? content.textContent : '',
                      ts: Date.now()
                    });
                  }
                } else {
                  bubble.classList.remove('pinned-message');
                  pinnedMessages = pinnedMessages.filter(m => m.id !== msg.id);
                  hostPinnedMessages = hostPinnedMessages.filter(m => m.id !== msg.id);
                }
              }
            }
            updatePinnedBanner();
            updateHostPinnedList();
            updateHostRecentList();
          }
        } else if (msg.type === 'pong') {
          const now = Date.now();
          const sent = Number(msg.ts) || 0;
          if (!pendingPings.has(sent)) {
            return;
          }
          pendingPings.delete(sent);
          const latency = sent ? now - sent : null;
          if (latency === null || latency < 0) {
            addEphemeralMessage('Received pong (unknown latency).');
          } else {
            addEphemeralMessage(`Pong received: ${latency} ms`);
          }
        } else if (msg.type === 'poll-update') {
          updatePollDisplay(msg.data);
        } else if (msg.type === 'kicked') {
          addMessage({ id: 'sys-kicked-' + Date.now(), from: 'system', text: msg.message || 'You have been kicked by the host.', category: 'system', ts: Date.now() });
          intentionalDisconnect = true;
          disconnectSocket();
        } else if (msg.type === 'host-settings') {
          const data = msg.data || {};
          if (typeof data.allowEmbeds === 'boolean') {
            if (hostAllowEmbeds) hostAllowEmbeds.checked = data.allowEmbeds;
          }
          if (typeof data.allowAttachments === 'boolean') {
            if (hostAllowAttachments) hostAllowAttachments.checked = data.allowAttachments;
          }
          if (typeof data.chatFilter === 'boolean') {
            const hostChatFilter = document.getElementById('hostChatFilter');
            if (hostChatFilter) hostChatFilter.checked = data.chatFilter;
          }
          if (typeof data.e2ee === 'boolean') {
            const hostE2EE = document.getElementById('hostE2EE');
            if (hostE2EE) hostE2EE.checked = data.e2ee;
          }
          e2eeOnSettingsUpdate(data).catch(e => console.warn('E2EE settings update error:', e));
        } else {
          if (Array.isArray(msg)) msg.forEach(m => addMessage(m));
        }
      } catch (err) {
        void err;
      }
    });

    addSocketListener(ws, 'close', (event) => {
      if (reconnectResetTimer) {
        clearTimeout(reconnectResetTimer);
        reconnectResetTimer = null;
      }
      if (serverVersionTimer) {
        clearTimeout(serverVersionTimer);
        serverVersionTimer = null;
      }
      const closeCodeDescriptions = {
        1000: 'Normal closure (client or server intentionally closed)',
        1001: 'Going away (page navigation, server shutdown, or browser tab closed)',
        1002: 'Protocol error (malformed frame or protocol violation)',
        1003: 'Unsupported data (received data type the endpoint cannot handle)',
        1005: 'No status code present (connection closed without a code)',
        1006: 'Abnormal closure (connection dropped without close handshake -- network issue, crash, or timeout)',
        1007: 'Invalid payload data',
        1008: 'Policy violation',
        1009: 'Message too big (payload exceeded maximum allowed size)',
        1010: 'Missing extension',
        1011: 'Internal error (server encountered unexpected condition)',
        1012: 'Service restart',
        1013: 'Try again later (server temporarily unavailable)',
        1014: 'Bad gateway',
        1015: 'TLS handshake failure'
      };
      const codeDescription = closeCodeDescriptions[event.code] || 'Unknown close code';
      const possibleReasons = [];
      const closeReason = String(event.reason || '').trim();
      if (intentionalDisconnect) {
        possibleReasons.push('User clicked disconnect or was kicked');
      } else {
        if (closeReason) {
          possibleReasons.push(`Close reason: ${closeReason}`);
        }
        if (event.code === 1006) {
          possibleReasons.push('Server crashed or became unreachable');
          possibleReasons.push('Internet connection was lost');
          possibleReasons.push('Ping timeout (no pong response within interval)');
          possibleReasons.push('Cloudflare tunnel or proxy dropped the WebSocket');
          possibleReasons.push('Firewall or antivirus blocked the connection');
        } else if (event.code === 1000) {
          possibleReasons.push('Server shut down gracefully');
          possibleReasons.push('Host stopped the server');
        } else if (event.code === 1001) {
          possibleReasons.push('Server is going away or restarting');
        } else if (event.code === 1002 || event.code === 1003) {
          possibleReasons.push('Cloudflare error page (502/503/530) replaced the WebSocket');
          possibleReasons.push('Proxy or CDN interfered with the connection');
        } else if (event.code === 1009) {
          possibleReasons.push('Sent a message or attachment that exceeded the server size limit');
        }
      }
      const _dcBadge = 'background:#e74c3c;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold';
      const _dcLabel = 'background:#2c3e50;color:#ecf0f1;padding:2px 6px;border-radius:3px;margin-left:2px';
      const _dcValue = 'background:#34495e;color:#1abc9c;padding:2px 6px;border-radius:3px;margin-left:1px';
      const _dcArea = 'background:#8e44ad;color:#fff;padding:2px 6px;border-radius:3px;margin-left:2px;font-style:italic';
      const stackLine = (new Error().stack || '').split('\n')[2] || '';
      console.log(
        `%cDISCONNECT%c Code %c${event.code}%c Desc %c${codeDescription}${event.reason ? `%c Reason %c${event.reason}` : ''}%c Server %c${lastServerUrl || 'unknown'}%c User %c${lastUsername || 'unknown'}%c Area %c${'renderer.js > connectSocket() > ws close'}%c Stack %c${stackLine}`,
        _dcBadge, _dcLabel, _dcValue, _dcLabel, _dcValue,
        ...(event.reason ? [_dcLabel, _dcValue] : []),
        _dcLabel, _dcValue, _dcLabel, _dcValue, _dcLabel, _dcArea,
        _dcLabel, _dcValue
      );
      if (possibleReasons.length > 0) {
        const _dcCause = 'background:#e67e22;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold';
        const _dcCauseText = 'background:#2c3e50;color:#f39c12;padding:2px 6px;border-radius:3px;margin-left:2px';
        const causesText = possibleReasons.map(r => `• ${r}`).join('\n');
        console.log(`%cPOSSIBLE CAUSES%c\n${causesText}`, _dcCause, _dcCauseText);
      }
      
      connected = false;
      setStatus('offline');
      setConnectActionState('idle');
      serverUrlEl.disabled = false;
      usernameEl.disabled = false;
      stopPingLoop();
        clearAttachmentPreview();
        clearReplyPreviewUI();
        resetPendingEchoes();
        clearMessages();
        try {
          const notesBtnEl = document.getElementById('notesBtn');
          if (notesBtnEl) notesBtnEl.disabled = true;
          const commandsPanelEl = document.getElementById('commandsPanel');
          if (commandsPanelEl) commandsPanelEl.classList.add('hidden');
          const notesModalEl = document.getElementById('notesModal');
          if (notesModalEl) notesModalEl.classList.add('hidden');
        } catch (e) {}
        
      const isConnectedToOwnServer = isHosting && lastServerUrl && hostServerUrl && lastServerUrl.includes(hostServerUrl.replace('wss://', ''));
      const isLocalTunnelTarget = /(loca\.lt|localtunnel\.me)/i.test(lastServerUrl || '');
      const isTunnelTarget = /trycloudflare\.com/i.test(lastServerUrl || '');
      const shutdownDetected = !intentionalDisconnect && (
        event.code === 1001 ||
        event.code === 1012 ||
        ((event.code === 1006 || event.code === 1013) && isTunnelTarget) ||
        /shutdown|stopp|restart|going away/i.test(String(event.reason || ''))
      );
      
      const wasNeverConnected = connectionFailed && !connected;
      
      const reasonText = closeReason ? ` (${closeReason})` : '';
      const shouldReconnect = !intentionalDisconnect && 
                              !wasNeverConnected &&
                              lastServerUrl && 
                              lastUsername && 
                              event.code !== 1000 && 
                              event.code !== 1001 &&
                              event.code !== 1002 &&
                              event.code !== 1003;
      
      if (shouldReconnect) {
        addMessage({ id: 'sys-disconnected', from: 'system', text: shutdownDetected ? `Server Shutdown -- attempting to reconnect...${reasonText}` : `Connection lost -- attempting to reconnect...${reasonText}`, category: 'system', ts: Date.now() });
        attemptReconnect();
      } else if (wasNeverConnected) {
        if (isHosting && isLocalTunnelTarget && !intentionalDisconnect && reconnectAttempts < 3) {
          addMessage({ id: 'sys-localtunnel-retry-' + Date.now(), from: 'system', text: 'LocalTunnel handshake failed before opening. Retrying tunnel connection...', category: 'system', ts: Date.now() });
          attemptReconnect();
          return;
        }
        addMessage({ id: 'sys-conn-failed', from: 'system', text: `Failed to connect -- server may not exist or is unreachable.${reasonText}`, category: 'system', ts: Date.now() });
      } else {
        console.log(
          `%cDISCONNECT%c Not reconnecting%c intentional=${intentionalDisconnect}%c ownServer=${!!isConnectedToOwnServer}%c Area %c${'renderer.js > connectSocket() > close handler'}`,
          'background:#e74c3c;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
          'background:#2c3e50;color:#e74c3c;padding:2px 6px;border-radius:3px;margin-left:2px',
          'background:#34495e;color:#1abc9c;padding:2px 6px;border-radius:3px;margin-left:1px',
          'background:#34495e;color:#1abc9c;padding:2px 6px;border-radius:3px;margin-left:1px',
          'background:#2c3e50;color:#ecf0f1;padding:2px 6px;border-radius:3px;margin-left:2px',
          'background:#8e44ad;color:#fff;padding:2px 6px;border-radius:3px;margin-left:1px;font-style:italic'
        );
        addMessage({ id: 'sys-disconnected', from: 'system', text: shutdownDetected ? `Server Shutdown -- messages are hidden until you reconnect.${reasonText}` : `Disconnected -- messages are hidden until you reconnect.${reasonText}`, category: 'system', ts: Date.now() });
      }
      ws = null;
    });

    addSocketListener(ws, 'error', (e) => {
      const errorMsg = e && e.message ? e.message : String(e || 'Unknown error');
      const errorStack = (new Error().stack || '').split('\n')[2] || '';
      console.log(
        `%cWS ERROR%c ${errorMsg}%c Server %c${lastServerUrl || 'unknown'}%c Area %c${'renderer.js > connectSocket() > ws error'}%c Stack %c${errorStack}`,
        'background:#c0392b;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
        'background:#2c3e50;color:#e74c3c;padding:2px 6px;border-radius:3px;margin-left:2px',
        'background:#2c3e50;color:#ecf0f1;padding:2px 6px;border-radius:3px;margin-left:2px',
        'background:#34495e;color:#1abc9c;padding:2px 6px;border-radius:3px;margin-left:1px',
        'background:#2c3e50;color:#ecf0f1;padding:2px 6px;border-radius:3px;margin-left:2px',
        'background:#8e44ad;color:#fff;padding:2px 6px;border-radius:3px;margin-left:1px;font-style:italic',
        'background:#2c3e50;color:#ecf0f1;padding:2px 6px;border-radius:3px;margin-left:2px',
        'background:#34495e;color:#1abc9c;padding:2px 6px;border-radius:3px;margin-left:1px'
      );
      connectionFailed = true;
      setStatus('offline');
      setConnectActionState('idle');
      serverUrlEl.disabled = false;
      usernameEl.disabled = false;
      stopPingLoop();
      clearAttachmentPreview();
      clearReplyPreviewUI();
      resetPendingEchoes();
    });
  }

  function disconnectSocket() {
    intentionalDisconnect = true;
    if (reconnectResetTimer) {
      clearTimeout(reconnectResetTimer);
      reconnectResetTimer = null;
    }
    if (serverVersionTimer) {
      clearTimeout(serverVersionTimer);
      serverVersionTimer = null;
    }
    console.log(
      `%cDISCONNECT%c Manual disconnect by user%c Area %c${'renderer.js > disconnectSocket()'}`,
      'background:#e74c3c;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
      'background:#2c3e50;color:#e74c3c;padding:2px 6px;border-radius:3px;margin-left:2px',
      'background:#2c3e50;color:#ecf0f1;padding:2px 6px;border-radius:3px;margin-left:2px',
      'background:#8e44ad;color:#fff;padding:2px 6px;border-radius:3px;margin-left:1px;font-style:italic'
    );
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) try { ws.close(); } catch (e) {}
    ws = null;
    connected = false;
    setStatus('offline');
    setConnectActionState('idle');
    serverUrlEl.disabled = false;
    usernameEl.disabled = false;
    stopPingLoop();
    clearAttachmentPreview();
    clearReplyPreviewUI();
    resetPendingEchoes();
    clearMessages();
    try {
      const notesBtnEl = document.getElementById('notesBtn');
      if (notesBtnEl) notesBtnEl.disabled = true;
      const commandsPanelEl = document.getElementById('commandsPanel');
      if (commandsPanelEl) commandsPanelEl.classList.add('hidden');
      const notesModalEl = document.getElementById('notesModal');
      if (notesModalEl) notesModalEl.classList.add('hidden');
    } catch (e) {}
    addMessage({ id: 'sys-disconnected', from: 'system', text: 'Disconnected -- messages are hidden until you reconnect.', category: 'system', ts: Date.now() });
  }

  function attemptReconnect() {
    if (intentionalDisconnect || !lastServerUrl || !lastUsername) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts++;
    const maxAttempts = 5;
    
    if (reconnectAttempts > maxAttempts) {
      addMessage({ id: 'sys-reconnect-failed', from: 'system', text: `Failed to reconnect after ${maxAttempts} attempts. Click Connect to try again.`, category: 'system', ts: Date.now() });
      intentionalDisconnect = true;
      reconnectAttempts = 0;
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
    setStatus(`reconnecting (${reconnectAttempts}/${maxAttempts})...`);
    reconnectTimer = setTimeout(() => {
      if (intentionalDisconnect) return;
      addMessage({ id: 'sys-reconnect-attempt-' + Date.now(), from: 'system', text: `Reconnection attempt ${reconnectAttempts} of ${maxAttempts}...`, category: 'system', ts: Date.now() });
      serverUrlEl.value = lastServerUrl;
      usernameEl.value = lastUsername;
      connectBtn.click();
    }, delay);
  }

  function handleSlashCommandInput(inputText) {
    if (!inputText || inputText[0] !== '/') return { handled: false };
    const trimmed = inputText.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('/afk')) {
      const reason = trimmed.slice(4).trim();
      setLocalAfk(true, reason);
      return { handled: true };
    }

    if (lower === '/ping' || lower.startsWith('/ping ')) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        addEphemeralMessage('Cannot ping: not connected.');
        return { handled: true, clearInput: true };
      }
      const pingTs = Date.now();
      try {
        ws.send(JSON.stringify({ type: 'ping', ts: pingTs }));
        pendingPings.add(pingTs);
        addEphemeralMessage('Ping request sent. Waiting for pong...');
      } catch (e) {
        addEphemeralMessage('Ping request failed.');
      }
      return { handled: true, clearInput: true };
    }

    if (lower.startsWith('/commands')) {
      openCommandsPanel();
      return { handled: true, clearInput: true };
    }

    if (lower.startsWith('/notes')) {
      openNotesModal();
      return { handled: true, clearInput: true };
    }

    if (lower === '/w' || lower.startsWith('/w ')) {
      const rest = trimmed.slice(2).trim();
      const firstSpace = rest.indexOf(' ');
      if (firstSpace === -1) {
        addEphemeralMessage('Usage: /w <user> <message>');
        return { handled: true, clearInput: false };
      }
      const target = rest.slice(0, firstSpace).trim();
      const messageText = rest.slice(firstSpace + 1).trim();
      if (!target || !messageText) {
        addEphemeralMessage('Usage: /w <user> <message>');
        return { handled: true, clearInput: false };
      }
      return { handled: true, sendText: messageText, clearInput: true, whisperTo: target };
    }

    if (lower.startsWith('/rr')) {
      const who = (usernameEl && usernameEl.value) ? usernameEl.value.trim() : 'Player 1';
      const lowerWho = who.toLowerCase();
      const existingOwn = Array.from(document.querySelectorAll('.rr-widget')).find(widget => {
        const meta = widget.querySelector('.rr-impl');
        if (!meta) return false;
        if (meta.dataset.gameOver === 'true') return false;
        return (meta.dataset.owner || '').toLowerCase() === lowerWho;
      });
      if (existingOwn) {
        addEphemeralMessage('Finish your current game before starting another.');
        return { handled: true, clearInput: true };
      }
      const existingJoinable = Array.from(document.querySelectorAll('.rr-widget')).find(widget => {
        const meta = widget.querySelector('.rr-impl');
        if (!meta) return false;
        if (meta.dataset.gameOver === 'true') return false;
        return (meta.dataset.p1 || '').toLowerCase() === lowerWho;
      });
      if (existingJoinable) {
        addEphemeralMessage('Already participating in a game.');
        return { handled: true, clearInput: true };
      }
      const arg = trimmed.slice(3).trim();
      const isPvP = arg === '2';
      const gameId = `rr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        p1: who,
        p2: isPvP ? 'Player 2' : 'Machine',
        bullet: Math.floor(Math.random() * 6),
        chamber: 0,
        gameId
      };
      const payloadText = `@@RR@@${JSON.stringify(payload)}`;
      return { handled: true, sendText: payloadText, clearInput: true };
    }

    if (lower.startsWith('/kofi')) {
      var maskId = 'kofi-card-' + Date.now() + '-mask';
      var card = '<div data-kofi-link="https://ko-fi.com/teutonic" style="cursor:pointer;display:flex;align-items:center;gap:14px;background:var(--panel-soft-bg, rgba(255,255,255,0.03));border:1px solid var(--panel-border, rgba(255,255,255,0.12));border-radius:14px;padding:14px 16px;max-width:340px;margin:0 auto;">' +
        '<svg width="48" height="38" viewBox="0 0 241 194" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><svg width="241" height="194" viewBox="0 0 241 194" fill="none" xmlns="http://www.w3.org/2000/svg"> <mask id="' + maskId + '" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="-1" y="0" width="242" height="194"> <path d="M240.469 0.958984H-0.00585938V193.918H240.469V0.958984Z" fill="white"/> </mask> <g mask="url(#' + maskId + ')"> <path d="M96.1344 193.911C61.1312 193.911 32.6597 178.256 15.9721 149.829C1.19788 124.912 -0.00585938 97.9229 -0.00585938 67.7662C-0.00585938 49.8876 5.37293 34.3215 15.5413 22.7466C24.8861 12.1157 38.1271 5.22907 52.8317 3.35378C70.2858 1.14271 91.9848 0.958984 114.545 0.958984C151.259 0.958984 161.63 1.4088 176.075 2.85328C195.29 4.76026 211.458 11.932 222.824 23.5955C234.368 35.4428 240.469 51.2624 240.469 69.3627V72.9994C240.469 103.885 219.821 129.733 191.046 136.759C188.898 141.827 186.237 146.871 183.089 151.837L183.006 151.964C172.869 167.632 149.042 193.918 103.401 193.918H96.1281L96.1344 193.911Z" fill="white"/> <path d="M174.568 17.9772C160.927 16.6151 151.38 16.1589 114.552 16.1589C90.908 16.1589 70.9008 16.387 54.7644 18.4334C33.3949 21.164 15.2058 37.5285 15.2058 67.7674C15.2058 98.0066 16.796 121.422 29.0741 142.107C42.9425 165.751 66.1302 178.707 96.1412 178.707H103.414C140.242 178.707 160.25 159.156 170.253 143.698C174.574 136.874 177.754 130.058 179.801 123.234C205.947 120.96 225.27 99.3624 225.27 72.9941V69.3577C225.27 40.9432 206.631 21.164 174.574 17.9772H174.568Z" fill="white"/> <path d="M15.1975 67.7674C15.1975 37.5285 33.3866 21.164 54.7559 18.4334C70.8987 16.387 90.906 16.1589 114.544 16.1589C151.372 16.1589 160.919 16.6151 174.559 17.9772C206.617 21.1576 225.255 40.937 225.255 69.3577V72.9941C225.255 99.3687 205.932 120.966 179.786 123.234C177.74 130.058 174.559 136.874 170.238 143.698C160.235 159.156 140.228 178.707 103.4 178.707H96.1264C66.1155 178.707 42.9277 165.751 29.0595 142.107C16.7814 121.422 15.1912 98.4563 15.1912 67.7674" fill="#202020"/> <path d="M32.2469 67.9899C32.2469 97.3168 34.0654 116.184 43.6127 133.689C54.5225 153.924 74.3018 161.653 96.8117 161.653H103.857C133.411 161.653 147.736 147.329 155.693 134.829C159.558 128.462 162.966 121.417 164.784 112.547L166.147 106.864H174.332C192.521 106.864 208.208 92.09 208.208 73.2166V69.8082C208.208 48.6669 195.024 37.5228 172.058 34.7987C159.102 33.6646 151.372 33.2084 114.538 33.2084C89.7602 33.2084 72.0272 33.4364 58.6152 35.4828C39.7483 38.2134 32.2407 48.8951 32.2407 67.9899" fill="white"/> <path d="M166.158 83.6801C166.158 86.4107 168.204 88.4572 171.841 88.4572C183.435 88.4572 189.802 81.8619 189.802 70.9523C189.802 60.0427 183.435 53.2195 171.841 53.2195C168.204 53.2195 166.158 55.2657 166.158 57.9963V83.6866V83.6801Z" fill="#202020"/> <path d="M54.5321 82.3198C54.5321 95.732 62.0332 107.326 71.5807 116.424C77.9478 122.562 87.9515 128.93 94.7685 133.022C96.8147 134.157 98.8611 134.841 101.136 134.841C103.866 134.841 106.134 134.157 107.959 133.022C114.782 128.93 124.779 122.562 130.919 116.424C140.694 107.332 148.195 95.7383 148.195 82.3198C148.195 67.7673 137.286 54.8115 121.599 54.8115C112.28 54.8115 105.912 59.5882 101.136 66.1772C96.8147 59.582 90.2259 54.8115 80.9001 54.8115C64.9855 54.8115 54.5256 67.7673 54.5256 82.3198" fill="#FF5A16"/> </g> </svg></svg>' +
        '<div style="display:flex;flex-direction:column;gap:4px;">' +
        '<span style="font-weight:700;font-size:14px;color:var(--accent, #b18bff);">Support TerrorLink</span>' +
        '<span style="font-size:12px;color:var(--text-muted,#888);">Buy the dev a coffee \u2615</span>' +
        '<span style="cursor:pointer;font-size:11px;color:var(--accent, #b18bff);text-decoration:none;margin-top:2px;font-weight:500;">ko-fi.com/teutonic \u2197</span>' +
        '</div></div>';
      addMessage({ id: 'kofi-' + Date.now(), from: 'system', text: card, category: 'system', __ephemeral: true, __html: true, ts: Date.now() });
      return { handled: true };
    }
    if (lower.startsWith('/8ball')) {
      const question = trimmed.slice(6).trim();
      if (!question) {
        addEphemeralMessage('Usage: /8ball <question>');
        return { handled: true, clearInput: false };
      }
      const answer = eightBallAnswers[Math.floor(Math.random() * eightBallAnswers.length)] || 'Reply hazy, try again.';
      const marker = '@@8BALL@@';
      const payload = {
        q: question,
        a: answer,
        user: (usernameEl && usernameEl.value) ? usernameEl.value : 'someone'
      };
      const payloadText = `${marker}${JSON.stringify(payload)}`;
      return { handled: true, sendText: payloadText };
    }

    if (!lower.startsWith('/tag')) return { handled: false };
    const remainder = trimmed.slice(4).trim();
    if (!remainder) {
      addEphemeralMessage('Usage: /tag save <id> <text> | /tag delete <id> | /tag list | /tag <id>');
      return { handled: true, clearInput: false };
    }

    const firstSpace = remainder.indexOf(' ');
    const firstToken = (firstSpace === -1 ? remainder : remainder.slice(0, firstSpace)).toLowerCase();
    const afterFirst = firstSpace === -1 ? '' : remainder.slice(firstSpace + 1).trim();

    if (['save', 'set', 'add'].includes(firstToken)) {
      if (!afterFirst) {
        addEphemeralMessage('Usage: /tag save <id> <text>');
        return { handled: true, clearInput: false };
      }
      const secondSpace = afterFirst.indexOf(' ');
      if (secondSpace === -1) {
        addEphemeralMessage('Provide message text to save.');
        return { handled: true, clearInput: false };
      }
      const rawId = afterFirst.slice(0, secondSpace).trim();
      const messageText = afterFirst.slice(secondSpace + 1).trim();
      const tagId = sanitizeTagId(rawId);
      if (!tagId) {
        addEphemeralMessage('Tag id must use letters, numbers, dashes or underscores.');
        return { handled: true, clearInput: false };
      }
      if (!messageText) {
        addEphemeralMessage('Message text cannot be empty.');
        return { handled: true, clearInput: false };
      }
      tagStore[tagId] = messageText;
      persistTagStore();
      addEphemeralMessage(`Saved tag "${tagId}" (${summarizeTagText(messageText) || 'empty'}).`);
      return { handled: true };
    }

    if (['delete', 'remove', 'del', 'rm'].includes(firstToken)) {
      const targetId = sanitizeTagId(afterFirst);
      if (!targetId) {
        addEphemeralMessage('Usage: /tag delete <id>');
        return { handled: true, clearInput: false };
      }
      if (tagStore[targetId]) {
        delete tagStore[targetId];
        persistTagStore();
        addEphemeralMessage(`Deleted tag "${targetId}".`);
      } else {
        addEphemeralMessage(`Tag "${targetId}" was not found.`);
        return { handled: true, clearInput: false };
      }
      return { handled: true };
    }

    if (['list', 'ls'].includes(firstToken)) {
      const entries = Object.entries(tagStore);
      if (!entries.length) {
        addEphemeralMessage('No tags saved yet. Use /tag save <id> <text> to add one.');
      } else {
        const lines = entries.slice(0, 10).map(([id, text]) => `• ${id} -- ${summarizeTagText(text)}`);
        let msg = `Saved tags:\n${lines.join('\n')}`;
        if (entries.length > 10) msg += `\n… and ${entries.length - 10} more.`;
        addEphemeralMessage(msg);
      }
      return { handled: true };
    }

    if (['help', '?'].includes(firstToken)) {
      addEphemeralMessage('Tag commands:\n/tag save <id> <text>\n/tag delete <id>\n/tag list\n/tag <id>');
      return { handled: true };
    }

    if (['use', 'send'].includes(firstToken)) {
      const targetId = sanitizeTagId(afterFirst);
      if (!targetId) {
        addEphemeralMessage('Usage: /tag use <id>');
        return { handled: true, clearInput: false };
      }
      const storedValue = tagStore[targetId];
      if (!storedValue) {
        addEphemeralMessage(`Tag "${targetId}" was not found.`);
        return { handled: true, clearInput: false };
      }
      addEphemeralMessage(`Inserted tag "${targetId}" -- edit if needed, then press Enter to send.`);
      return { handled: true, clearInput: false, insertText: storedValue };
    }

    const defaultId = sanitizeTagId(remainder);
    if (!defaultId) {
      addEphemeralMessage('Provide a tag id (e.g. /tag intro).');
      return { handled: true, clearInput: false };
    }
    const storedValue = tagStore[defaultId];
    if (!storedValue) {
      addEphemeralMessage(`Tag "${defaultId}" was not found.`);
      return { handled: true, clearInput: false };
    }
    addEphemeralMessage(`Inserted tag "${defaultId}" -- edit if needed, then press Enter to send.`);
    return { handled: true, clearInput: false, insertText: storedValue };
  }

  async function sendMessage(overrideText = null, options = {}) {
    const { skipCommands = false } = options;
    const inputSource = overrideText !== null ? overrideText : textEl.value;
    let txt = (inputSource || '').trim();
    if (!txt && !pendingAttachment) return;

    let literalSlash = false;
    if (!skipCommands && /^\/\/tag\b/i.test(txt)) {
      literalSlash = true;
      txt = txt.replace(/^\//, '');
      if (overrideText === null) {
        textEl.value = textEl.value.replace(/^(\s*)\/\/tag/i, '$1/tag');
      }
    }

    if (!skipCommands && localAfkState.active && txt) {
      setLocalAfk(false, '');
    }

    if (!skipCommands && !literalSlash && txt.startsWith('/')) {
      const commandResult = handleSlashCommandInput(txt);
      if (commandResult.handled) {
        if (commandResult.insertText && overrideText === null) {
          textEl.value = commandResult.insertText;
          try {
            const caretPos = textEl.value.length;
            textEl.setSelectionRange(caretPos, caretPos);
          } catch (e) {}
          textEl.focus();
        } else if (overrideText === null && commandResult.clearInput !== false) {
          textEl.value = '';
          textEl.style.height = 'auto';
        }
        hideEmojiHint();
        renderMentionList([]);
        mentionSuggestion = null;
        if (commandResult.insertText) {
          return;
        }
        if (commandResult.sendText) {
          const sendOptions = { skipCommands: true };
          if (commandResult.whisperTo) sendOptions.whisperTo = commandResult.whisperTo;
          await sendMessage(commandResult.sendText, sendOptions);
        }
        return;
      }
    }
    if (!txt && !pendingAttachment) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert('Not connected.');
      return;
    }
    const tenorRegex = /https:\/\/tenor\.com\/view\/[^\/]+-\d+/;
    const match = txt.match(tenorRegex);
    if (match && txt === match[0]) {
      const dataUrl = await scrapeTenorUrl(txt);
      if (dataUrl) {
        queueAttachment({ kind: 'gif', data: dataUrl, mime: 'image/gif', name: 'tenor.gif' });
        if (overrideText === null) {
          textEl.value = '';
          textEl.style.height = 'auto';
        }
      } else {
        alert('Failed to load Tenor GIF.');
        return;
      }
    }

    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const attachmentCopy = pendingAttachment ? { ...pendingAttachment } : null;
    let e2eeCiphertext = null;
    if (e2eeEnabled && e2eeRoomKey && txt) {
      try {
        e2eeCiphertext = await e2eeEncryptText(txt);
      } catch (e) { console.warn('E2EE encrypt error:', e); }
    }
    const payload = { type: 'message', text: e2eeCiphertext ? '' : txt, clientId };
    if (e2eeCiphertext) payload.ciphertext = e2eeCiphertext;
    if (attachmentCopy) payload.attachment = attachmentCopy;
    if (options.whisperTo) {
      payload.whisperTo = String(options.whisperTo).trim();
    }
    const replyCopy = pendingReply ? { ...pendingReply } : null;
    if (replyCopy) payload.replyTo = replyCopy;
    const localEntry = {
      id: clientId,
      clientId,
      from: usernameEl.value || 'me',
      text: txt,
      attachment: attachmentCopy,
      ts: Date.now(),
      replyTo: replyCopy || undefined
    };
    if (options.whisperTo) {
      localEntry.whisperTo = String(options.whisperTo).trim();
    }
    const signature = computeMessageSignature(localEntry);
    localEntry.__signature = signature;
    const pendingRef = { clientId, signature, domId: null };
    localEntry.__pendingRef = pendingRef;
    localEntry.__localEcho = true;
    try {
      const payloadStr = JSON.stringify(payload);
      const payloadSize = new Blob([payloadStr]).size;
      
      if (payloadSize > 1024 * 1024) {
        const maxWait = 5000;
        const startWait = Date.now();
        const checkBuffer = () => {
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            return;
          }
          const buffered = Number.isFinite(Number(ws.bufferedAmount)) ? Number(ws.bufferedAmount) : 0;
          if (buffered === 0 || Date.now() - startWait > maxWait) {
            try { ws.send(payloadStr); } catch (e) { return; }
            trackPendingEcho(pendingRef);
            addMessage(localEntry);
          } else {
            setTimeout(checkBuffer, 50);
          }
        };
        checkBuffer();
      } else {
        try { ws.send(payloadStr); } catch (e) { return; }
        trackPendingEcho(pendingRef);
        addMessage(localEntry);
      }
      if (overrideText === null) {
        textEl.value = '';
        textEl.style.height = 'auto';  
      }
      textEl.focus();
      hideEmojiHint();
      renderMentionList([]);
      if (replyCopy) clearReplyPreviewUI();
      setStatus('sending...');
      setTimeout(() => setStatus(ws && ws.readyState === WebSocket.OPEN ? 'connected' : 'offline'), 700);
    } catch (e) {
      alert('Send failed.');
      return;
    }
    if (pendingAttachment) clearAttachmentPreview();
  }

  connectBtn.addEventListener('click', () => {
    if (connected) {
      disconnectSocket();
      return;
    }
    connectSocket();
  });
  disconnectBtn.addEventListener('click', disconnectSocket);
  sendBtn.addEventListener('click', () => sendMessage());
  textEl.addEventListener('keydown', (e) => {
    const baseTabOrEnter = (e.key === 'Tab' || e.key === 'Enter') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (baseTabOrEnter && (emojiSuggestion || mentionSuggestion)) {
      e.preventDefault();
      if (emojiSuggestion && applyEmojiSuggestion()) return;
      if (mentionSuggestion && applyMentionSelection()) return;
    }
    if (mentionSuggestion && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const matches = usersList.filter(u => (u || '').toLowerCase().startsWith(mentionSuggestion.token)).slice(0, 8);
      if (!matches.length) return;
      if (e.key === 'ArrowDown') mentionIndex = Math.min(mentionIndex + 1, matches.length - 1);
      if (e.key === 'ArrowUp') mentionIndex = Math.max(mentionIndex - 1, 0);
      renderMentionList(matches);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  function autoResizeTextarea() {
    textEl.style.height = 'auto';
    const maxH = 60;
    const newH = Math.min(textEl.scrollHeight, maxH);
    textEl.style.height = newH + 'px';
    if (textEl.scrollHeight > maxH) {
      textEl.classList.add('has-overflow');
    } else {
      textEl.classList.remove('has-overflow');
    }
  }
  textEl.addEventListener('input', autoResizeTextarea);
  
  textEl.addEventListener('input', handleEmojiAutocomplete);
  textEl.addEventListener('click', handleEmojiAutocomplete);
  textEl.addEventListener('focus', handleEmojiAutocomplete);
  textEl.addEventListener('blur', () => {
    hideEmojiHint();
    renderMentionList([]);
    mentionSuggestion = null;
  });

  textEl.addEventListener('paste', (e) => {
    try {
      const items = (e.clipboardData || window.clipboardData) && (e.clipboardData || window.clipboardData).items;
      if (!items || !items.length) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it) continue;
        const type = (it.type || '').toLowerCase();
        if (type.startsWith('image/')) {
          e.preventDefault();
          const file = it.getAsFile();
          if (!file) return;
          if (file.size > MAX_FILE_SIZE) { alert('Image too large (max 20MB).'); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            const ext = (file.name && file.name.split('.').pop()) || (file.type && file.type.split('/')[1]) || 'png';
            const name = `clipboard.${ext}`;
            queueAttachment({ kind: 'image', data: dataUrl, mime: file.type || 'image/png', name });
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    } catch (err) {
      console.warn('paste image failed', err);
    }
  });


  emojiBtn && emojiBtn.addEventListener('click', () => toggleEmojiPanel());
  emojiClose && emojiClose.addEventListener('click', closeEmojiPanel);
  emojiSearchInput && emojiSearchInput.addEventListener('input', (e) => {
    emojiSearchTerm = e.target.value;
    renderEmojiGrid(emojiSearchTerm);
  });
  reactionsSearch && reactionsSearch.addEventListener('input', (e) => {
    filterReactions(e.target.value);
  });
  document.addEventListener('click', (e) => {
    if (!emojiVisible || !emojiPanel) return;
    if (emojiPanel.contains(e.target) || e.target === emojiBtn) return;
    closeEmojiPanel();
  });

  document.addEventListener('click', (e) => {
    if (!reactionsPanel || reactionsPanel.classList.contains('hidden')) return;
    if (!reactionsPanel.contains(e.target)) {
      reactionsPanel.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!commandsPanelVisible || !commandsPanel) return;
    if (commandsPanel.contains(e.target) || e.target === commandsBtn) return;
    closeCommandsPanel();
  });

  gifBtn && gifBtn.addEventListener('click', () => openGifModal());
  gifClose && gifClose.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inFavoritesView) {
      inFavoritesView = false;
      suppressAutoFavorites = true;
      if (gifSearch) gifSearch.style.display = '';
      if (gifSearchBtn) gifSearchBtn.style.display = '';
      const titleEl = document.getElementById('gifModalTitle');
      if (titleEl) titleEl.textContent = 'Tenor GIF Search';
      searchGiphy('reaction');
      return;
    }
    closeGifModal();
  });
  gifModal && gifModal.addEventListener('click', (e) => {
    if (e.target === gifModal) closeGifModal();
  });
  gifSearchBtn && gifSearchBtn.addEventListener('click', () => searchGiphy());
  
  let gifSearchDebounce = null;
  gifSearch && gifSearch.addEventListener('input', () => {
    if (gifSearchDebounce) clearTimeout(gifSearchDebounce);
    gifSearchDebounce = setTimeout(() => {
      searchGiphy();
    }, 500);
  });
  
  gifSearch && gifSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (gifSearchDebounce) clearTimeout(gifSearchDebounce);
      searchGiphy();
    }
  });

  pollBtn && pollBtn.addEventListener('click', () => openPollModal());
  pollClose && pollClose.addEventListener('click', closePollModal);
  pollModal && pollModal.addEventListener('click', (e) => {
    if (e.target === pollModal) closePollModal();
  });
  addOptionBtn && addOptionBtn.addEventListener('click', addPollOption);
  pollCreateBtn && pollCreateBtn.addEventListener('click', createPoll);
  pollQuestion && pollQuestion.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createPoll();
    }
  });

  messagesEl && messagesEl.addEventListener('click', (e) => {
    const btn = (e.target && e.target.closest) ? e.target.closest('.rr-btn') : null;
    if (btn) {
      handleRouletteAction(btn, btn.dataset.action);
      return;
    }
    const close = (e.target && e.target.closest) ? e.target.closest('.rr-rbtn.close') : null;
    if (close) {
      const widget = close.closest('.rr-widget');
      if (widget) {
        const meta = widget.querySelector('.rr-impl');
        const winner = (meta && meta.dataset.winner) || widget.dataset.winner || '';
        if (meta) {
          meta.dataset.gameOver = 'true';
          meta.dataset.winner = winner;
        }
        widget.dataset.gameOver = 'true';
        const statusEl = widget.querySelector('.rr-status');
        if (statusEl) {
          if (winner) {
            statusEl.textContent = `${winner} won the Russian Roulette match.`;
          } else {
            statusEl.textContent = 'Russian Roulette match closed.';
          }
        }
        const gameBody = widget.querySelector('.rr-game-body');
        if (gameBody) {
          gameBody.style.display = 'none';
        }
        const resultEl = widget.querySelector('.rr-result');
        if (resultEl) {
          resultEl.classList.add('vis');
        }
        if (meta) {
          meta.dataset.closed = 'true';
        }
        widget.dataset.closed = 'true';
        const gameId = widget && widget.dataset.gameId;
        if (gameId) {
          sendRouletteUpdateState(gameId, { gameOver: true, winner, closed: true });
        }
        const wrapper = widget.closest('[id^="msg-"]');
        if (wrapper) {
          wrapper.remove();
        } else {
          widget.remove();
        }
      }
    }
  });

  initRouletteModal();

  attachBtn && attachBtn.addEventListener('click', () => filePicker && filePicker.click());
  filePicker && filePicker.addEventListener('change', (e) => {
    const [file] = e.target.files || [];
    handleFileSelection(file);
    filePicker.value = '';
  });
  attachmentClearBtn && attachmentClearBtn.addEventListener('click', () => clearAttachmentPreview());
  replyClearBtn && replyClearBtn.addEventListener('click', () => clearReplyPreviewUI());
  resizeGrip && resizeGrip.addEventListener('mousedown', beginResizeDrag);

  unhideBtn.addEventListener('click', () => setDetailsVisible(!detailsVisible));
  closeBtn.addEventListener('click', () => {
    api.send('minimize-to-tray');
  });

  api.on('focus-chat', () => {
    try {
      if (!textEl) return;
      const active = document.activeElement;
      if (active === textEl) return;

      textEl.focus();
      const cursor = typeof textEl.selectionStart === 'number' ? textEl.selectionStart : textEl.value.length;
      textEl.setSelectionRange(cursor, cursor);
    } catch (e) {}
  });

  api.on('overlay-visibility', (visible) => {
    isOverlayVisible = !!visible;
  });

  api.on('open-settings', () => {
    try {
      showShortcutToast('Settings');
      openSettingsMenu();
    } catch (e) {}
  });

  window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    if (e.key === 'Escape') {
      if (gifModalVisible) {
        e.preventDefault();
        closeGifModal();
        return;
      }
      if (emojiVisible) {
        e.preventDefault();
        closeEmojiPanel();
        return;
      }
      if (pollModalVisible) {
        e.preventDefault();
        closePollModal();
        return;
      }
      if (reactionsPanel && !reactionsPanel.classList.contains('hidden')) {
        e.preventDefault();
        reactionsPanel.classList.add('hidden');
        return;
      }

      if (commandsPanelVisible) {
        e.preventDefault();
        closeCommandsPanel();
        return;
      }
      if (notesModal && !notesModal.classList.contains('hidden')) {
        e.preventDefault();
        notesModal.classList.add('hidden');
        return;
      }

    }
    const isChatFocused = textEl && (active === textEl || (typeof textEl.contains === 'function' && textEl.contains(active)));
    if (isChatFocused) return;

    if (eventMatchesKeybind(e, keybinds.focusKey) && textEl) {
      e.preventDefault();
      if (commandsPanelVisible) closeCommandsPanel();
      if (emojiVisible) closeEmojiPanel();
      if (gifModalVisible) closeGifModal();
      if (pollModalVisible) closePollModal();
      if (notesModal && !notesModal.classList.contains('hidden')) notesModal.classList.add('hidden');
      if (detailsVisible === false) setDetailsVisible(true);
      if (active !== textEl) {
        textEl.focus();
        const cursor = typeof textEl.selectionStart === 'number' ? textEl.selectionStart : textEl.value.length;
        textEl.setSelectionRange(cursor, cursor);
      }
      showShortcutToast('Focus');
      return;
    }
    if (isTyping) return;
    if (eventMatchesKeybind(e, keybinds.toggleKey)) {
      e.preventDefault();
      api.send('toggle-window');
      showShortcutToast('Toggle');
      return;
    }
  });

  window.tl = { addMessage, connectSocket, disconnectSocket, setDetailsVisible };

  setDetailsVisible(true);
  setReplyPreview(null);
  setConnectActionState('idle');

  const SETTINGS_SCHEMA = [
    {
      section: 'General',
      settings: [
        {
          key: 'theme',
          type: 'select',
          label: 'Theme',
          description: 'Choose the UI theme. This affects colors, accents and message bubbles.',
          options: [
            { value: 'default', label: 'Default' },
            { value: 'shockwire', label: 'ShockWire' },
            { value: 'royalchain', label: 'RoyalChain' },
            { value: 'bloodlink', label: 'BloodLink' },
            { value: 'rosepetal', label: 'RosePetal' },
            { value: 'toxicreactor', label: 'ToxicReactor' }
          ],
          onChange: (val) => {
            settings.theme = val;
            applyTheme(val);
            applyBgOpacity(settings.bgOpacity);
            saveSettingsToStorage();
          }
        },
        {
          key: 'bgOpacity',
          type: 'range',
          label: 'Background Opacity',
          description: 'Lower values make the overlay more transparent so you can see through it.',
          min: 0, max: 100, step: 1,
          displayValue: (v) => `${v}%`,
          onChange: (val) => {
            settings.bgOpacity = val;
            applyBgOpacity(val);
            document.documentElement.style.setProperty('--backdrop-opacity', val / 100);
            saveSettingsToStorage();
          }
        },
        {
          key: 'bgBlur',
          type: 'range',
          label: 'Background Blur',
          description: 'Adds blur distortion behind the UI.',
          min: 0, max: 100, step: 1,
          displayValue: (v) => `${v}%`,
          onChange: (val) => {
            settings.bgBlur = val;
            applyBackdropBlur(val);
            saveSettingsToStorage();
          }
        }
      ]
    },
    {
      section: 'Chat',
      settings: [
        {
          key: 'playMentionWhenHidden',
          type: 'toggle',
          label: 'Play mention tone when hidden',
          description: 'When enabled, every incoming message will play the mention alert tone while the overlay is hidden.',
          onChange: (val) => { settings.playMentionWhenHidden = val; saveSettingsToStorage(); }
        },
        {
          key: 'spamFilter',
          type: 'toggle',
          label: 'Spam filter',
          description: 'Collapse duplicate messages into a single message with a counter.',
          onChange: (val) => { settings.spamFilter = val; saveSettingsToStorage(); }
        }
      ]
    },
    {
      section: 'Advanced',
      settings: [
        {
          key: 'enableDebugLogging',
          type: 'toggle',
          label: 'Enable Debug Logging',
          description: 'Write diagnostic logs to a temporary file for troubleshooting. Restart required to apply changes.',
          onChange: (val) => { settings.enableDebugLogging = val; saveSettingsToStorage(); api.send('debug-logging-toggle', val); }
        },
        {
          key: 'enableDevTools',
          type: 'toggle',
          label: 'Enable Developer Tools',
          description: 'Allow opening DevTools with Ctrl+Shift+I for debugging.',
          onChange: (val) => { settings.enableDevTools = val; saveSettingsToStorage(); api.send('devtools-toggle', val); }
        },
        {
          key: 'trueOverlay',
          type: 'toggle',
          label: 'True Overlay Mode (BETA)',
          description: 'Type without stealing focus from games. Uses keyboard hooks to capture input.',
          onChange: (val) => {
            settings.trueOverlay = val;
            saveSettingsToStorage();
            if (val) api.send('true-overlay-enable');
            else api.send('true-overlay-disable');
          }
        },
        {
          key: 'giphyApiKey',
          type: 'text',
          label: 'GIPHY API Key',
          description: 'Use your own GIPHY API key for GIF search. Leave blank to use the built-in public key. Get one at developers.giphy.com',
          placeholder: 'Leave blank for default key',
          maxlength: 64,
          onChange: (val) => { settings.giphyApiKey = val; saveSettingsToStorage(); }
        }
      ]
    },
    {
      section: 'Keybinds',
      settings: [
        {
          key: 'focusKey',
          type: 'keybind',
          label: 'Focus chat key',
          description: 'Focuses the chat input.',
          onChange: (val) => { keybinds.focusKey = val; saveKeybinds(); }
        },
        {
          key: 'toggleKey',
          type: 'keybind',
          label: 'Toggle overlay key',
          description: 'Toggles the overlay window.',
          onChange: (val) => { keybinds.toggleKey = val; saveKeybinds(); }
        },
        {
          key: 'hostPanelKey',
          type: 'keybind',
          label: 'Open host panel key',
          description: 'Opens the host panel modal.',
          onChange: (val) => { keybinds.hostPanelKey = val; saveKeybinds(); }
        },
        {
          key: 'copyInviteKey',
          type: 'keybind',
          label: 'Copy invite link key',
          description: 'Copies the current host invite link.',
          onChange: (val) => { keybinds.copyInviteKey = val; saveKeybinds(); }
        },
        {
          key: 'hostToggleKey',
          type: 'keybind',
          label: 'Start/stop host key',
          description: 'Starts or stops the server directly.',
          onChange: (val) => { keybinds.hostToggleKey = val; saveKeybinds(); }
        },
        {
          key: 'settingsKey',
          type: 'keybind',
          label: 'Open settings key',
          description: 'Opens the settings menu.',
          onChange: (val) => { keybinds.settingsKey = val; saveKeybinds(); }
        },
        
      ]
    }
  ];

  function createSettingControl(setting, currentValue) {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('div');
    label.className = 'settings-label';
    const title = document.createElement('div');
    title.className = 'settings-label-title';
    title.textContent = setting.label;
    const desc = document.createElement('div');
    desc.className = 'settings-label-desc';
    desc.textContent = setting.description || '';
    label.appendChild(title);
    label.appendChild(desc);

    const control = document.createElement('div');
    control.className = 'settings-control';

    if (setting.type === 'toggle') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!currentValue;
      checkbox.addEventListener('change', (e) => {
        setting.onChange(!!e.target.checked);
        showSettingsSaved();
      });
      control.appendChild(checkbox);
    } else if (setting.type === 'select') {
      const select = document.createElement('select');
      select.className = 'input';
      setting.options.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        select.appendChild(o);
      });
      select.value = currentValue;
      select.addEventListener('change', (e) => {
        const val = e.target.value;
        setting.onChange(val);
        showSettingsSaved();
      });
      control.appendChild(select);
    } else if (setting.type === 'range') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = setting.min;
      input.max = setting.max;
      input.step = setting.step || 1;
      input.value = currentValue;
      const valueLabel = document.createElement('span');
      valueLabel.className = 'settings-value-label';
      valueLabel.textContent = setting.displayValue ? setting.displayValue(currentValue) : currentValue;
      input.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        valueLabel.textContent = setting.displayValue ? setting.displayValue(val) : String(val);
        setting.onChange(val);
        showSettingsSaved();
      });
      control.appendChild(input);
      control.appendChild(valueLabel);
    } else if (setting.type === 'keybind') {
      const controlLabel = setting.label;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn keybind-btn keybind-label';
      btn.textContent = String(currentValue || '').trim() || '?';
      btn.title = `${controlLabel}: ${btn.textContent}`;
      btn.addEventListener('click', () => {
        btn.textContent = 'Press key... (Esc to cancel)';
        // Clean up any previous capture before starting a new one
        if (_activeKeyCleanup) { _activeKeyCleanup(); _activeKeyCleanup = null; }
        function doneCapturing() {
          if (_keyCapTimer) { clearTimeout(_keyCapTimer); _keyCapTimer = null; }
          window.removeEventListener('keydown', onKey, { capture: true });
          _activeKeyCleanup = null;
        }
        var _keyCapTimer = null;
        _activeKeyCleanup = function() { doneCapturing(); };
        function onKey(e) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === 'Escape') {
            doneCapturing();
            finishCapture(btn, null, null);
            return;
          }
          var modifierKeys = {Control:1,Shift:1,Alt:1,Meta:1};
          var isModifierOnly = modifierKeys[e.key];
          if (isModifierOnly) {
            var disp = formatKeyEvent(e);
            btn.textContent = disp + '...';
            if (_keyCapTimer) clearTimeout(_keyCapTimer);
            _keyCapTimer = setTimeout(function() {
              _keyCapTimer = null;
              doneCapturing();
              finishCapture(btn, disp, disp);
            }, 500);
            return;
          }
          if (_keyCapTimer) { clearTimeout(_keyCapTimer); _keyCapTimer = null; }
          var value = formatKeyEvent(e);
          doneCapturing();
          finishCapture(btn, value, value);
        }
        window.addEventListener('keydown', onKey, { capture: true, once: false });
        function finishCapture(button, value, saveValue) {
          if (saveValue !== null && saveValue !== undefined) {
            // Space alone = disable the keybind
            if (saveValue === 'Space' || saveValue === ' ') {
              button.textContent = 'Disabled';
              button.title = controlLabel + ': Disabled';
              setting.onChange('');
              showSettingsSaved();
            } else {
              var disp = saveValue || '';
              button.textContent = disp || '?';
              button.title = controlLabel + ': ' + (disp || '?');
              setting.onChange(saveValue);
              showSettingsSaved();
            }
          } else {
            button.textContent = currentValue;
            button.title = `${controlLabel}: ${currentValue}`;
          }
        }
      });
      control.appendChild(btn);
    } else if (setting.type === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input';
      input.value = String(currentValue || '');
      input.placeholder = setting.placeholder || '';
      input.spellcheck = false;
      if (setting.maxlength) input.maxLength = setting.maxlength;
      input.addEventListener('change', () => {
        setting.onChange(input.value.trim());
        showSettingsSaved();
      });
      control.appendChild(input);
    }

    row.appendChild(label);
    row.appendChild(control);
    return row;
  }

  function renderSettingsUI() {
    if (!settingsBody) return;
    settingsBody.innerHTML = '';
    SETTINGS_SCHEMA.forEach((section) => {
      const header = document.createElement('div');
      header.style.fontSize = '14px';
      header.style.fontWeight = '700';
      header.style.color = 'var(--text-primary)';
      header.style.marginTop = '12px';
      header.textContent = section.section;
      settingsBody.appendChild(header);

      section.settings.forEach((setting) => {
        const currentValue = setting.type === 'keybind'
          ? keybinds[setting.key]
          : settings[setting.key];
        const control = createSettingControl(setting, currentValue);
        settingsBody.appendChild(control);
      });
    });
  }

  function showSettingsSaved() {
    if (!settingsStatus) return;
    settingsStatus.textContent = 'Saved';
    setTimeout(() => { if (settingsStatus) settingsStatus.textContent = ''; }, 1200);
  }

  function loadKeybindsFromStorage() {
    try {
      const raw = localStorage.getItem(KEYBINDS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          keybinds = { ...defaultKeybinds, ...parsed };
        }
      }
    } catch (e) {
      keybinds = { ...defaultKeybinds };
    }
    try {
      Object.keys(keybinds || {}).forEach((k) => {
        try {
          const v = String(keybinds[k] || '').trim();
          if (!v) {
            // Explicitly empty — keep as disabled (don't fill from defaults)
            keybinds[k] = '';
            return;
          }
          const canon = canonicalizeKeybind(v);
          if (canon) keybinds[k] = canon; else keybinds[k] = '';
        } catch (e) {}
      });
    } catch (e) {}
    try { api.send('update-keybinds', keybinds); } catch (e) {}

    try {
      const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (rawSettings) {
        const parsedSettings = JSON.parse(rawSettings);
        if (parsedSettings && typeof parsedSettings === 'object') settings = { ...defaultSettings, ...parsedSettings };
      }
    } catch (e) { settings = { ...defaultSettings }; }
  }

  function saveKeybinds() {
    try {
      const out = Object.assign({}, keybinds);
      Object.keys(out).forEach((k) => {
        try {
          const v = String(out[k] || '').trim();
          if (!v) { out[k] = ''; return; }
          out[k] = canonicalizeKeybind(v) || '';
        } catch (e) { out[k] = String(out[k] || ''); }
      });
      localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(out));
      keybinds = Object.assign({}, out);
    } catch (e) {}
    saveSettingsToStorage();
    showSettingsSaved();
  }

  function openSettingsMenu() {
    if (!settingsModal) return;
    settingsModal.classList.remove('hidden');
    settingsVisible = true;
    loadKeybindsFromStorage();
    renderSettingsUI();
  }

  function closeSettingsMenu() {
    if (!settingsModal) return;
    settingsModal.classList.add('hidden');
    settingsVisible = false;
    saveSettingsToStorage();
  }

  const kofiBtnEl = document.getElementById("kofiBtn");
  if (kofiBtnEl) kofiBtnEl.addEventListener("click", () => { api.openExternal("https://ko-fi.com/teutonic"); });
    if (settingsBtn) settingsBtn.addEventListener('click', () => {
    openSettingsMenu();
  });
  if (settingsClose) settingsClose.addEventListener('click', () => {
    closeSettingsMenu();
  });

  function saveKeybinds() {
    try {
      localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(keybinds));
    } catch (e) {}
    if (settingsStatus) {
      settingsStatus.textContent = 'Saved';
      setTimeout(() => { settingsStatus.textContent = ''; }, 1200);
    }
    try { api.send('update-keybinds', keybinds); } catch (e) {}
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function formatKeyEvent(e) {
    if (!e) return '';
    const parts = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.metaKey) parts.push('Meta');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    let k = e.key || '';
    if (k === ' ') k = 'Space';
    if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') {
      if (!parts.length) return k;
      return parts.join('+');
    }
    const keyDisplay = (typeof k === 'string' && k.length === 1) ? k.toUpperCase() : k;
    if (!parts.length) return keyDisplay;
    return parts.concat([keyDisplay]).join('+');
  }

  function parseKeybindString(str) {
    if (!str) return null;
    const parts = str.split('+').map(p => p.trim());
    const out = { ctrl: false, alt: false, shift: false, meta: false, key: null };
    parts.forEach((p) => {
      if (!p) return;
      const up = p.toLowerCase();
      if (up === 'control' || up === 'ctrl') out.ctrl = true;
      else if (up === 'alt') out.alt = true;
      else if (up === 'shift') out.shift = true;
      else if (up === 'meta' || up === 'cmd' || up === 'command') out.meta = true;
      else out.key = p;
    });
    return out;
  }

  function canonicalizeKeybind(str) {
    if (!str) return '';
    const parsed = parseKeybindString(String(str || ''));
    if (!parsed || !parsed.key) return '';
    const parts = [];
    if (parsed.ctrl) parts.push('Control');
    if (parsed.meta) parts.push('Meta');
    if (parsed.alt) parts.push('Alt');
    if (parsed.shift) parts.push('Shift');
    const k = parsed.key === 'Space' ? 'Space' : (typeof parsed.key === 'string' && parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
    parts.push(k);
    return parts.join('+');
  }

  function eventMatchesKeybind(e, bindStr) {
    if (!bindStr) return false;
    const parsed = parseKeybindString(bindStr);
    if (!parsed) return false;
    if (!!e.ctrlKey !== parsed.ctrl) return false;
    if (!!e.altKey !== parsed.alt) return false;
    if (!!e.shiftKey !== parsed.shift) return false;
    if (!!e.metaKey !== parsed.meta) return false;
    if (!parsed.key) return false;
    const keyName = parsed.key === 'Space' ? ' ' : parsed.key;
    return (e.key === keyName || e.key.toLowerCase() === String(parsed.key).toLowerCase());
  }

  function beginCapture(targetBtn, field) {
    if (!targetBtn) return;
    keyCaptureTarget = field;
    targetBtn.textContent = 'Press key... (Esc to cancel)';
    function onKey(e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
      if (e.key === 'Escape') {
        if (window._keyCapTimerV2) { clearTimeout(window._keyCapTimerV2); window._keyCapTimerV2 = null; }
        finishCapture(targetBtn, null, false);
        window.removeEventListener('keydown', onKey, true);
        return;
      }
      var isModifier = (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta');
      if (isModifier) {
        var disp = formatKeyEvent(e);
        try { targetBtn.textContent = disp + '...'; } catch (err) {}
        if (window._keyCapTimerV2) clearTimeout(window._keyCapTimerV2);
        window._keyCapTimerV2 = setTimeout(function() {
          window._keyCapTimerV2 = null;
          finishCapture(targetBtn, disp, true);
          window.removeEventListener('keydown', onKey, true);
        }, 500);
        return;
      }
      if (window._keyCapTimerV2) { clearTimeout(window._keyCapTimerV2); window._keyCapTimerV2 = null; }
      if (window._keyCapTimerV2) { clearTimeout(window._keyCapTimerV2); window._keyCapTimerV2 = null; }
      var value = formatKeyEvent(e);
      finishCapture(targetBtn, value, true);
      window.removeEventListener('keydown', onKey, true);
    }
    window.addEventListener('keydown', onKey, true);
  }

  function finishCapture(targetBtn, value, save) {
    try {
      if (save && value) {
        const parsed = parseKeybindString(value) || {};
        if (parsed.key === 'Space' && !parsed.ctrl && !parsed.alt && !parsed.shift && !parsed.meta) {
          keybinds[keyCaptureTarget] = '';
          if (targetBtn) {
            targetBtn.textContent = 'Disabled';
            targetBtn.title = `${keyCaptureTarget === 'focusKey' ? 'Focus chat' : 'Toggle overlay'}: Disabled`;
          }
        } else {
          const canon = canonicalizeKeybind(value);
          keybinds[keyCaptureTarget] = canon || value;
          if (targetBtn) {
            targetBtn.textContent = String(keybinds[keyCaptureTarget] || '');
            targetBtn.title = `${keyCaptureTarget === 'focusKey' ? 'Focus chat' : 'Toggle overlay'}: ${String(keybinds[keyCaptureTarget] || '')}`;
          }
        }
        saveKeybinds();
      } else {
        if (targetBtn) {
          const field = keyCaptureTarget;
          const value = String(keybinds[field] || defaultKeybinds[field]);
          targetBtn.textContent = value;
          targetBtn.title = `${field === 'focusKey' ? 'Focus chat' : 'Toggle overlay'}: ${value}`;
        }
      }
    } catch (e) {}
    keyCaptureTarget = null;
  }

  if (settingsBtn) settingsBtn.addEventListener('click', () => {
    openSettingsMenu();
  });
  if (settingsClose) settingsClose.addEventListener('click', () => {
    closeSettingsMenu();
  });

  function renderChangelogMarkdown(text) {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    const lines = html.split('\n');
    const processedLines = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      if (/^__[^_]+__$/.test(line.trim())) {
        if (inList) { processedLines.push('</ul>'); inList = false; }
        line = line.replace(/^__([^_]+)__$/, '<h3 class="changelog-header">$1</h3>');
        processedLines.push(line);
        continue;
      }
      
      if (/^={3,}$/.test(line.trim())) {
        if (inList) { processedLines.push('</ul>'); inList = false; }
        processedLines.push('<hr class="changelog-hr">');
        continue;
      }
      
      if (line.trim().startsWith('&gt;')) {
        if (inList) { processedLines.push('</ul>'); inList = false; }
        let content = line.trim().slice(4).trim();
        content = processInlineMarkdown(content);
        processedLines.push(`<blockquote class="changelog-quote">${content}</blockquote>`);
        continue;
      }
      
      const listMatch = line.match(/^(\s*)-\s*(.+)$/);
      if (listMatch) {
        const indent = listMatch[1].length;
        let content = listMatch[2];
        content = processInlineMarkdown(content);
        
        if (!inList) {
          processedLines.push('<ul class="changelog-list">');
          inList = true;
        }
        const indentClass = indent >= 3 ? ' class="changelog-subitem"' : '';
        processedLines.push(`<li${indentClass}>${content}</li>`);
        continue;
      }
      
      if (inList && line.trim() !== '') {
        processedLines.push('</ul>');
        inList = false;
      }
      
      if (line.trim() === '') {
        processedLines.push('<br>');
      } else {
        line = processInlineMarkdown(line);
        processedLines.push(`<p class="changelog-text">${line}</p>`);
      }
    }
    
    if (inList) processedLines.push('</ul>');
    
    return processedLines.join('\n');
  }
  
  function processInlineMarkdown(text) {
    text = escapeHTML(text || '');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(?:^|[\s(])_([^_]+)_(?:[\s).,!?]|$)/g, ' <em>$1</em> ');
    text = text.replace(/(?:^|[\s(])\*([^*]+)\*(?:[\s).,!?]|$)/g, ' <em>$1</em> ');
    text = text.replace(/`([^`]+)`/g, '<code class="changelog-code">$1</code>');
    return text.trim();
  }

  async function fetchChangelog() {
    if (!changelogModal) return;
    
    if (changelogLoading) changelogLoading.style.display = 'block';
    if (changelogContent) changelogContent.style.display = 'none';
    if (changelogError) changelogError.style.display = 'none';
    
    try {
      let currentVersion = '';
      try {
        const packageJson = { version: api.version };
        currentVersion = packageJson.version || '';
      } catch (e) {
        currentVersion = '';
      }
      
      if (!currentVersion) {
        throw new Error('Could not determine app version');
      }
      
      const apiUrl = `https://api.github.com/repos/TeutonicTerrror/TerrorLink/releases/tags/${currentVersion}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'TerrorLink-Client'
        },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`No release found for v${currentVersion}`);
        }
        throw new Error(`GitHub API error (${response.status})`);
      }
      
      const releaseData = await response.json();
      const releaseNotes = releaseData.body || 'No release notes available.';
      const releaseName = releaseData.name || `v${currentVersion}`;
      const safeReleaseName = escapeHTML(releaseName);
      const publishedAt = releaseData.published_at ? new Date(releaseData.published_at).toLocaleDateString() : '';
      
      const renderedNotes = renderChangelogMarkdown(releaseNotes);
      
      let headerHtml = `<div class="changelog-title">${safeReleaseName}`;
      if (publishedAt) {
        headerHtml += ` <span class="changelog-date">(${publishedAt})</span>`;
      }
      headerHtml += `</div><hr class="changelog-hr">`;
      
      if (changelogLoading) changelogLoading.style.display = 'none';
      if (changelogContent) {
        changelogContent.innerHTML = headerHtml + renderedNotes;
        changelogContent.style.display = 'block';
      }
    } catch (err) {
      console.error('Failed to load changelog:', err);
      if (changelogLoading) changelogLoading.style.display = 'none';
      if (changelogError) {
        changelogError.textContent = `Failed to load changelog: ${err.message}`;
        changelogError.style.display = 'block';
      }
    }
  }

  if (viewChangelogBtn) viewChangelogBtn.addEventListener('click', () => {
    if (!changelogModal) return;
    changelogModal.classList.remove('hidden');
    fetchChangelog();
  });

  if (changelogClose) changelogClose.addEventListener('click', () => {
    if (!changelogModal) return;
    changelogModal.classList.add('hidden');
  });

  if (imageExpandClose) imageExpandClose.addEventListener('click', () => {
    if (!imageExpandModal) return;
    imageExpandModal.classList.add('hidden');
  });

  if (imageExpandModal) imageExpandModal.addEventListener('click', (e) => {
    if (e.target === imageExpandModal) {
      imageExpandModal.classList.add('hidden');
    }
  });

  if (imageExpandImg) {
    imageExpandImg.addEventListener('wheel', (e) => {
      if (!imageExpandModal || imageExpandModal.classList.contains('hidden')) return;
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.1 : 0.9;
      const nextScale = Math.max(0.5, Math.min(4, imageExpandScale * factor));
      if (nextScale === imageExpandScale) return;

      imageExpandScale = nextScale;
      applyImageTransform();
      showZoomOverlay();
    });

    document.addEventListener('keydown', (e) => {
      if (!imageExpandModal || imageExpandModal.classList.contains('hidden')) return;
      if (e.key === '+' || e.key === '=') {
        imageExpandScale = Math.min(4, imageExpandScale + 0.1);
        applyImageTransform();
        showZoomOverlay();
      } else if (e.key === '-' || e.key === '_') {
        imageExpandScale = Math.max(0.5, imageExpandScale - 0.1);
        applyImageTransform();
        showZoomOverlay();
      }
    });

    imageExpandImg.addEventListener('dblclick', () => {
      resetImageTransform();
      showZoomOverlay();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && imageExpandModal && !imageExpandModal.classList.contains('hidden')) {
      imageExpandModal.classList.add('hidden');
    }
  });

  const NOTES_MAX_LENGTH = 5000;
  
  function getNotesStorageKey() {
    const url = (serverUrlEl && serverUrlEl.value || '').trim();
    const user = (usernameEl && usernameEl.value || '').trim();
    if (!url || !user) return null;
    return "terrorlink_notes_" + encodeURIComponent(url) + "_" + encodeURIComponent(user);
  }
  
  function loadSessionNotes() {
    const key = getNotesStorageKey();
    if (!key) { if (notesTextarea) notesTextarea.value = ''; return; }
    try {
      const saved = localStorage.getItem(key) || '';
      if (notesTextarea) notesTextarea.value = saved;
    } catch (e) { if (notesTextarea) notesTextarea.value = ''; }
    updateNotesCharCount();
  }
  
  function saveSessionNotes(val) {
    const key = getNotesStorageKey();
    if (key) {
      try { localStorage.setItem(key, val); } catch (e) {}
    }
  }
  function updateNotesCharCount() {
    if (notesCharCount) {
      const len = (notesTextarea && notesTextarea.value) ? notesTextarea.value.length : 0;
      notesCharCount.textContent = `${len} / ${NOTES_MAX_LENGTH}`;
    }
  }
  
  function clearSessionNotes() {
    if (notesTextarea) notesTextarea.value = '';
    const key = getNotesStorageKey();
    if (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    }
    updateNotesCharCount();
  }
  
  function applyNotesOpacity() {
    const bgOpacity = Number.isFinite(Number(settings.bgOpacity)) ? Number(settings.bgOpacity) : 92;
    const notesOpacity = Math.max(75, bgOpacity) / 100;
    document.documentElement.style.setProperty('--notes-opacity', notesOpacity);
  }

  const COMMANDS_DATA = [
    { slug: '/rr', usage: '/rr', desc: 'Start Russian Roulette vs the Machine.', insert: '/rr' },
    { slug: '/rr 2', usage: '/rr 2', desc: 'Start PvP Russian Roulette and wait for player 2.', insert: '/rr 2' },
    { slug: '/8ball', usage: '/8ball <question>', desc: 'Ask the Magic 8-Ball a yes/no question.', insert: '/8ball ' },
    { slug: '/kofi', usage: '/kofi', desc: 'Sends a Ko-Fi donation card so you can support the developer!', insert: '/kofi' },
    { slug: '/afk', usage: '/afk [reason]', desc: 'Set AFK status with optional reason.', insert: '/afk ' },
    { slug: '/tag', usage: '/tag <id>', desc: 'Paste a saved tag into the composer.', insert: '/tag ' },
    { slug: '/tag save', usage: '/tag save <id> <text>', desc: 'Save a reusable message snippet.', insert: '/tag save ' },
    { slug: '/tag delete', usage: '/tag delete <id>', desc: 'Delete a saved tag by id.', insert: '/tag delete ' },
    { slug: '/tag list', usage: '/tag list', desc: 'List all saved tags.', insert: '/tag list' },
    { slug: '/ping', usage: '/ping', desc: 'Check latency to server.', insert: '/ping' },
    { slug: '/w', usage: '/w <user> <message>', desc: 'Send a private whisper to another user.', insert: '/w ' },
    { slug: '/notes', usage: '/notes', desc: 'Open session notes modal.', insert: '/notes' }
  ];

  let commandsPanelVisible = false;

  function buildCommandsList() {
    console.log('[commands] buildCommandsList called, COMMANDS_DATA=', COMMANDS_DATA);
    if (!commandsList) return;
    commandsList.style.display = 'grid';
    commandsList.style.gridTemplateColumns = 'repeat(3, minmax(180px, 1fr))';
    commandsList.style.gap = '10px';
    commandsList.style.padding = '10px';
    commandsList.style.overflowY = 'auto';
    commandsList.style.maxHeight = 'calc(100vh - 170px)';
    commandsList.style.width = '100%';

    if (window.innerWidth < 840) {
      commandsList.style.gridTemplateColumns = 'repeat(2, minmax(160px, 1fr))';
    }
    if (window.innerWidth < 620) {
      commandsList.style.gridTemplateColumns = 'repeat(1, minmax(120px, 1fr))';
    }

    commandsList.innerHTML = '<div class="command-desc" style="padding:12px;color:var(--text-muted);font-size:12px">Loading commands...</div>';

    const fragment = document.createDocumentFragment();
    COMMANDS_DATA.forEach((cmd) => {
      const item = document.createElement('div');
      item.className = 'command-item';
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.border = '1px solid var(--border)';
      item.style.borderRadius = '8px';
      item.style.padding = '8px';
      item.style.background = 'var(--panel-bg)';
      item.style.cursor = 'pointer';

      const top = document.createElement('div');
      top.style.display = 'flex';
      top.style.justifyContent = 'space-between';
      top.style.alignItems = 'center';
      top.style.gap = '8px';

      const slug = document.createElement('span');
      slug.className = 'command-slug';
      slug.textContent = cmd.slug;
      slug.style.fontWeight = '600';
      slug.style.fontSize = '13px';
      slug.style.flex = '1';
      slug.style.overflow = 'visible';
      slug.style.textOverflow = 'clip';
      slug.style.whiteSpace = 'normal';
      slug.style.wordBreak = 'break-word';
      slug.style.minHeight = '18px';

      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.className = 'command-use-btn';
      useBtn.textContent = 'Use';
      useBtn.style.fontSize = '10px';
      useBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cmd.slug === '/notes') {
          openNotesModal();
          return;
        }
        if (textEl) {
          textEl.value = cmd.insert;
          textEl.focus();
          try { textEl.setSelectionRange(textEl.value.length, textEl.value.length); } catch (err) {}
          hideEmojiHint();
          renderMentionList([]);
          mentionSuggestion = null;
          addEphemeralMessage(`Inserted command ${cmd.slug}.`);
        }
        closeCommandsPanel();
      });

      top.appendChild(slug);
      top.appendChild(useBtn);

      const details = document.createElement('div');
      details.className = 'command-details';
      details.style.display = 'block';
      details.style.marginTop = '6px';
      details.style.fontSize = '11px';
      details.style.color = 'var(--text-muted)';
      details.style.lineHeight = '1.3';
      details.innerHTML = `<strong>Usage:</strong> ${cmd.usage}<br /><strong>Description:</strong> ${cmd.desc}`;

      item.appendChild(top);
      item.appendChild(details);
      fragment.appendChild(item);
    });

    commandsList.innerHTML = '';
    if (fragment.childNodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'command-desc';
      empty.textContent = 'No slash commands available.';
      commandsList.appendChild(empty);
    } else {
      commandsList.appendChild(fragment);
    }
  }

  function openNotesModal() {
    closeCommandsPanel();
    applyNotesOpacity();
    if (notesModal) notesModal.classList.remove('hidden');
    if (notesTextarea) notesTextarea.focus();
    addEphemeralMessage('Opened session notes.');
  }

  function openCommandsPanel() {
    if (!commandsPanel) return;
    buildCommandsList();
    commandsPanelVisible = true;
    commandsPanel.classList.remove('hidden');

    if (commandsPanel.style.position !== 'fixed') {
      commandsPanel.style.position = 'fixed';
    }

    if (commandsPanel.classList.contains('modal')) {
      commandsPanel.style.inset = '0';
      commandsPanel.style.zIndex = 1000;
      commandsPanel.style.background = 'var(--modal-overlay)';
      commandsPanel.style.display = 'flex';
      commandsPanel.style.alignItems = 'center';
      commandsPanel.style.justifyContent = 'center';
      commandsPanel.style.backdropFilter = 'blur(10px)';
    }

    if (commandsList) {
      commandsList.style.maxHeight = 'calc(80vh - 116px)';
      commandsList.style.overflowY = 'auto';
    }
  }

  function closeCommandsPanel() {
    commandsPanelVisible = false;
    if (!commandsPanel) return;
    commandsPanel.classList.add('hidden');
  }

  if (commandsBtn) {
    commandsBtn.style.width = '34px';
    commandsBtn.style.height = '34px';
    commandsBtn.style.display = 'flex';
    commandsBtn.style.alignItems = 'center';
    commandsBtn.style.justifyContent = 'center';
    commandsBtn.style.cursor = 'pointer';
    const icon = commandsBtn.querySelector('svg');
    if (icon) icon.style.pointerEvents = 'none';
    const iconPaths = commandsBtn.querySelectorAll('svg path');
    iconPaths.forEach(path => { path.style.pointerEvents = 'none'; });
    commandsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (commandsPanelVisible) {
        closeCommandsPanel();
      } else {
        openCommandsPanel();
      }
    });
  }

  if (commandsClose) commandsClose.addEventListener('click', (e) => {
    e.preventDefault();
    closeCommandsPanel();
  });

  if (notesClose) notesClose.addEventListener('click', () => {
    if (!notesModal) return;
    notesModal.classList.add('hidden');
  });
  
  if (notesTextarea) {
    notesTextarea.maxLength = NOTES_MAX_LENGTH;
    notesTextarea.addEventListener('input', () => {
      saveSessionNotes(notesTextarea.value);
      updateNotesCharCount();
    });
  }
  
  if (notesClear) notesClear.addEventListener('click', () => {
    if (confirm('Clear all notes? This cannot be undone.')) {
      clearSessionNotes();
    }
  });
  
 
  updateNotesCharCount();

  try {
    const cb = document.getElementById('playMentionHidden');
    if (cb) {
      cb.addEventListener('change', (e) => {
        try {
          settings.playMentionWhenHidden = !!e.target.checked;
          try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch (err) {}
          if (settingsStatus) { settingsStatus.textContent = 'Saved'; setTimeout(() => { settingsStatus.textContent = ''; }, 1000); }
        } catch (err) {}
      });
    }
  } catch (e) {}
  function appendHostLog(line) {
    try {
      const text = String(line || '').trim();
      if (!text) return;
      const wssMatch = text.match(/wss:\/\/[^\s)"']+/i);
      if (/^\[error\]/i.test(text)) {
        const msg = text.replace(/^\[error\]\s*/i, '');
        if (/cloudflared/i.test(msg) && (/quick tunnel provider error|socket|spawn error|exited/i.test(msg))) {
          console.error('%c[host:error]%c Cloudflare socket failed (Cloudflare error)', 'color:#ff7b7b;font-weight:700;', 'color:#ffdede;');
        }
        console.error('%c[host:error]%c ' + msg, 'color:#ff7b7b;font-weight:700;', 'color:#ffdede;');
        const cloudflaredTunnelFailure = /cloudflared/i.test(msg) && /(failed to run the datagram handler|failed to serve tunnel connection|control stream encountered a failure while serving|ERR .*failed)/i.test(msg);
        if (cloudflaredTunnelFailure) {
          if (hostShareUrl) hostShareUrl.textContent = '--';
          isHosting = false;
          hostServerUrl = '';
          try { setHostStatus('error', false); } catch (e) {}
          try { setHostLifecycleText('error', false); } catch (e) {}
        }
        return;
      }
      if (/^\[host\]\s*WSS Link:/i.test(text)) {
        const url = wssMatch ? wssMatch[0] : text.replace(/^\[host\]\s*WSS Link:\s*/i, '').trim();
        console.log('%c[host:share]%c WSS link:', 'color:#67e8f9;font-weight:700;', 'color:#d5f8ff;', url);
        return;
      }
      if (/^\[host\]\s*Server bundle in use:/i.test(text)) {
        console.log('%c[host:bundle]%c ' + text.replace(/^\[host\]\s*/i, ''), 'color:#a5b4fc;font-weight:700;', 'color:#e0e7ff;');
        return;
      }
      console.log('%c[host]%c ' + text, 'color:#93c5fd;font-weight:700;', 'color:#e2e8f0;');
    } catch (e) {
      try { console.log('[host-log]', line); } catch (err) { void err; }
      void e;
    }
  }


  let hostIsRunning = false;
  let hostConnectedUsers = [];
  let hostPinnedMessages = [];
  let hostFxTimer = null;
  let hostLifecycleReadyTimer = null;
  let lastHostFailureStatus = '';
  let hostLinkReady = false;
  let pendingHostInviteCopy = false;
  let lastRefreshRequest = 0;

  function triggerHostFx(kind) {
    if (!hostModal) return;
    const cls = kind === 'start' ? 'host-fx-start' : 'host-fx-stop';
    hostModal.classList.remove('host-fx-start', 'host-fx-stop');
    try { void hostModal.offsetWidth; } catch (e) {}
    hostModal.classList.add(cls);
    if (hostFxTimer) {
      clearTimeout(hostFxTimer);
      hostFxTimer = null;
    }
    hostFxTimer = setTimeout(() => {
      hostFxTimer = null;
      try { hostModal.classList.remove(cls); } catch (e) {}
    }, kind === 'start' ? 900 : 700);
  }

  function updateHostRecentList() {
    if (hostRecentCount) hostRecentCount.textContent = hostRecentMessages.length;
    if (!hostRecentList) return;

    if (!hostIsRunning) {
      hostRecentList.innerHTML = '<div class="host-message-empty">Start hosting to manage pins</div>';
      return;
    }

    if (hostRecentMessages.length === 0) {
      hostRecentList.innerHTML = '<div class="host-message-empty">No messages yet</div>';
      return;
    }

    hostRecentList.innerHTML = hostRecentMessages.map(msg => {
      const isPinned = hostPinnedMessages.some(m => m.id === msg.id);
      return `
      <div class="host-message-item" data-msg-id="${escapeHTML(msg.id)}">
        <div class="host-message-meta">${escapeHTML(msg.from)} • ${new Date(msg.ts || Date.now()).toLocaleTimeString()}</div>
        <div class="host-message-text">${escapeHTML(msg.text || '[attachment]')}</div>
        <div class="host-message-actions">
          <button class="host-pin-btn ${isPinned ? 'is-pinned' : ''}" data-pin-id="${escapeHTML(msg.id)}" data-pin-state="${isPinned ? 'on' : 'off'}">${isPinned ? 'Unpin' : 'Pin'}</button>
        </div>
      </div>
    `;
    }).join('');

    hostRecentList.querySelectorAll('.host-pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const msgId = e.target.dataset.pinId;
        if (!msgId) return;
        const msg = hostRecentMessages.find(m => m.id === msgId);
        if (!msg) return;
        if (e.target.dataset.pinState === 'on') {
          unpinMessage(msgId);
        } else {
          pinMessage(msg);
        }
      });
    });
  }
  
  function updatePinnedBanner() {
    if (!pinnedBanner || !pinnedBannerContent) return;
    
    if (pinnedMessages.length === 0) {
      pinnedBanner.classList.add('hidden');
      return;
    }
    
    pinnedBanner.classList.remove('hidden');
    if (pinnedBannerToggle) {
      const collapsed = pinnedBannerContent.classList.contains('collapsed');
      pinnedBannerToggle.title = collapsed ? 'Expand' : 'Collapse';
      pinnedBannerToggle.textContent = collapsed ? 'Expand' : 'Collapse';
      pinnedBanner.classList.toggle('collapsed', collapsed);
    }
    pinnedBannerContent.innerHTML = pinnedMessages.map(msg => `
      <div class="pinned-banner-item" data-pin-id="${escapeHTML(msg.id)}" title="Click to jump to message">
        <div class="pinned-banner-meta">${escapeHTML(msg.from)} • ${new Date(msg.ts).toLocaleTimeString()}</div>
        <div class="pinned-banner-text">${escapeHTML(msg.text || '')}</div>
      </div>
    `).join('');
    
    pinnedBannerContent.querySelectorAll('.pinned-banner-item').forEach(item => {
      item.addEventListener('click', () => {
        const msgId = item.dataset.pinId;
        const msgEl = document.getElementById(`msg-${msgId}`);
        if (msgEl) {
          msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          msgEl.classList.add('reply-target');
          setTimeout(() => msgEl.classList.remove('reply-target'), 2000);
        }
      });
    });
  }
  
  if (pinnedBannerToggle) {
    pinnedBannerToggle.addEventListener('click', () => {
      pinnedBannerContent.classList.toggle('collapsed');
      pinnedBannerToggle.classList.toggle('collapsed');
      const collapsed = pinnedBannerContent.classList.contains('collapsed');
      pinnedBannerToggle.title = collapsed ? 'Expand' : 'Collapse';
      pinnedBannerToggle.textContent = collapsed ? 'Expand' : 'Collapse';
      if (pinnedBanner) pinnedBanner.classList.toggle('collapsed', collapsed);
    });
  }
  
  function setHostPanelState(state) {
    if (hostInitialState) hostInitialState.classList.toggle('hidden', state !== 'initial');
    if (hostLoadingState) hostLoadingState.classList.toggle('hidden', state !== 'loading');
    if (hostRunningState) hostRunningState.classList.toggle('hidden', state !== 'running');
  }
  
  function updateHostUserList(users) {
    hostConnectedUsers = users || [];
    if (hostUserCount) hostUserCount.textContent = hostConnectedUsers.length;
    if (!hostUserList) return;
    
    if (hostConnectedUsers.length === 0) {
      hostUserList.innerHTML = '<div class="host-user-empty">No users connected</div>';
      return;
    }
    
    hostUserList.innerHTML = hostConnectedUsers.map(user => `
      <div class="host-user-item" data-username="${escapeHTML(user)}">
        <span class="host-user-name">${escapeHTML(user)}</span>
        <button class="host-user-kick" data-kick="${escapeHTML(user)}">Kick</button>
      </div>
    `).join('');
    
    hostUserList.querySelectorAll('.host-user-kick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const username = e.target.dataset.kick;
        if (username) {
          api.send('host-kick-user', username);
        }
      });
    });
  }

  function updateHostPinnedList() {
    const hostPinnedList = document.getElementById('hostPinnedList');
    const hostPinnedCount = document.getElementById('hostPinnedCount');
    if (hostPinnedCount) hostPinnedCount.textContent = hostPinnedMessages.length;
    if (!hostPinnedList) return;
    
    if (hostPinnedMessages.length === 0) {
      hostPinnedList.innerHTML = '<div class="host-message-empty">No pinned messages</div>';
      return;
    }
    
    hostPinnedList.innerHTML = hostPinnedMessages.map(msg => `
      <div class="host-message-item" data-pin-id="${escapeHTML(msg.id)}">
        <div class="host-message-meta">${escapeHTML(msg.from)} • ${new Date(msg.ts || Date.now()).toLocaleTimeString()}</div>
        <div class="host-message-text">${escapeHTML(msg.text || '')}</div>
        <div class="host-message-actions">
          <button class="host-pin-btn is-pinned host-pinned-unpin" data-unpin="${escapeHTML(msg.id)}">Unpin</button>
        </div>
      </div>
    `).join('');
    
    hostPinnedList.querySelectorAll('.host-pinned-unpin').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const msgId = e.target.dataset.unpin;
        if (msgId) {
          unpinMessage(msgId);
        }
      });
    });
  }

  function pinMessage(msg) {
    if (!msg || !msg.id) return;
    if (hostPinnedMessages.some(m => m.id === msg.id)) return;
    hostPinnedMessages.push({
      id: msg.id,
      from: msg.from,
      text: msg.text,
      ts: msg.ts
    });
    if (!pinnedMessages.some(m => m.id === msg.id)) {
      pinnedMessages.push({
        id: msg.id,
        from: msg.from,
        text: msg.text,
        ts: msg.ts
      });
      updatePinnedBanner();
    }
    updateHostPinnedList();
    updateHostRecentList();
    const msgEl = document.getElementById(`msg-${msg.id}`);
    if (msgEl) {
      const bubble = msgEl.querySelector('.bubble');
      if (bubble) bubble.classList.add('pinned-message');
    }
    if (hostIsRunning) {
      api.send('host-pin-message', { id: msg.id, pinned: true });
    }
  }

  function unpinMessage(msgId) {
    hostPinnedMessages = hostPinnedMessages.filter(m => m.id !== msgId);
    pinnedMessages = pinnedMessages.filter(m => m.id !== msgId);
    updatePinnedBanner();
    updateHostPinnedList();
    updateHostRecentList();
    const msgEl = document.getElementById(`msg-${msgId}`);
    if (msgEl) {
      const bubble = msgEl.querySelector('.bubble');
      if (bubble) bubble.classList.remove('pinned-message');
    }
    if (hostIsRunning) {
      api.send('host-pin-message', { id: msgId, pinned: false });
    }
  }

  function setHostServerVersionDisplay(version, running) {
    const raw = String(version || '').trim();
    const valid = !!running && !!raw && raw.toLowerCase() !== 'unknown';
    if (hostServerVersion) hostServerVersion.textContent = valid ? raw : '';
    if (hostVersionBadge) hostVersionBadge.classList.toggle('hidden', !valid);
  }

  function setHostStatus(s, running) {
    hostIsRunning = running;
    if (hostStatusEl) hostStatusEl.textContent = s || 'unknown';
    if (!running) hostServerVersionValue = '';
    setHostServerVersionDisplay(hostServerVersionValue, running);
  }


  function setHostLifecycleText(statusText, running) {
    const t = String(statusText || '').toLowerCase();
    let text = 'Receiving host link...';
    if (running && (t.includes('tunnel ready') || t === 'running')) text = 'Host link ready.';
    else if (t.includes('stopping')) text = 'Stopping host...';
    else if (t.includes('error') || t.includes('failed') || t.includes('unavailable')) text = 'Host failed to start.';
    else if (t.includes('starting') || t.includes('server ready') || t.includes('cloudflared') || t.includes('localtunnel')) text = 'Receiving host link...';
    else if (t.includes('stopped')) text = 'Host is stopped.';
    else if (!running) text = 'Host is stopped.';
    if (hostLifecycleReadyTimer) {
      clearTimeout(hostLifecycleReadyTimer);
      hostLifecycleReadyTimer = null;
    }
    if (hostLoadingText) hostLoadingText.textContent = text;
    if (hostLifecycleStatus) hostLifecycleStatus.textContent = text;
    if (text === 'Host link ready.' && hostLifecycleStatus) {
      hostLifecycleReadyTimer = setTimeout(() => {
        hostLifecycleReadyTimer = null;
        if (hostLifecycleStatus) hostLifecycleStatus.textContent = '';
      }, 3000);
    }
  }
  function isConnectedToOwnServer() {
    if (!hostIsRunning || !ws || !connected) return false;
    try {
      const connectedUrl = serverUrlEl.value.trim().toLowerCase();
      return connectedUrl.includes('127.0.0.1') || connectedUrl.includes('localhost');
    } catch (e) {
      return false;
    }
  }

  function openHostPanel() {
    if (!hostModal) return;
    hostModal.classList.remove('hidden');
    try {
      if (hostStart && typeof hostStart.focus === 'function') hostStart.focus();
    } catch (e) {}
  }

  function closeHostPanel() {
    if (!hostModal) return;
    hostModal.classList.add('hidden');
  }

  function isHostPanelOpen() {
    return !!(hostModal && !hostModal.classList.contains('hidden'));
  }

  async function copyHostInviteLink() {
    if (!hostShareUrl) return false;
    const text = hostShareUrl.textContent ? hostShareUrl.textContent.trim() : '';
    if (!text || text === '--' || text.toLowerCase().includes('loading')) return false;

    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {}
    if (!copied) {
      copied = api.copyText(text);
    }

    if (copied && hostShareBox) {
      hostShareBox.classList.add('copied');
      const hint = hostShareBox.querySelector('.host-share-hint');
      if (hint) hint.textContent = 'Copied!';
      setTimeout(() => {
        hostShareBox.classList.remove('copied');
        if (hint) hint.textContent = 'Click to copy';
      }, 2000);
    }

    return copied;
  }

  function closeHostPanelIfOpen() {
    if (!hostModal) return;
    hostModal.classList.add('hidden');
  }

  function toggleHostPanelFromShortcut() {
    if (isHostPanelOpen()) closeHostPanelIfOpen();
    else openHostPanel();
  }

  function toggleHostServerFromShortcut() {
    if (hostIsRunning) {
      pendingHostInviteCopy = false;
      if (hostStop) hostStop.click();
      else api.send('host-stop');
      return;
    }
    pendingHostInviteCopy = true;
    setHostPanelState('loading');
    setHostStatus('starting...', false);
    setHostLifecycleText('starting', false);
    if (hostStart) hostStart.click();
    else api.send('host-start');
  }

  function refreshClientConnection() {
    const url = serverUrlEl ? serverUrlEl.value.trim() : '';
    const name = usernameEl ? usernameEl.value.trim() : '';
    if (!url || !name) return;
    try {
      disconnectSocket();
    } catch (e) {}
    setTimeout(() => {
      try { connectSocket(); } catch (e) {}
    }, 100);
  }

  function showShortcutToast(text) {
    try {
      if (!text) return;
      let el = document.getElementById('tl-shortcut-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'tl-shortcut-toast';
        el.style.position = 'fixed';
        el.style.right = '18px';
        el.style.top = '18px';
        el.style.zIndex = 99999;
        el.style.padding = '8px 12px';
        el.style.background = 'rgba(0,0,0,0.7)';
        el.style.color = '#fff';
        el.style.borderRadius = '6px';
        el.style.fontSize = '13px';
        el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4)';
        el.style.pointerEvents = 'none';
        el.style.transition = 'opacity 180ms ease';
        el.style.opacity = '0';
        document.body.appendChild(el);
      }
      el.textContent = String(text || '');
      // Reset to 0 first (handles rapid re-shows), then force reflow for transition
      el.style.opacity = '0';
      void el.offsetHeight;
      el.style.opacity = '1';
      if (el._timer) clearTimeout(el._timer);
      if (el._cleanupTimer) { clearTimeout(el._cleanupTimer); el._cleanupTimer = null; }
      el._timer = setTimeout(() => {
        try {
          el.style.opacity = '0';
          // Remove from DOM after fade-out transition completes (180ms + buffer)
          el._cleanupTimer = setTimeout(() => {
            try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
            el._cleanupTimer = null;
          }, 220);
        } catch (e) {}
      }, 1200);
    } catch (e) {}
  }

  if (hostBtn) hostBtn.addEventListener('click', () => {
    openHostPanel();
  });
  if (hostClose) hostClose.addEventListener('click', () => { closeHostPanel(); });
  if (hostModal) {
    hostModal.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const targetTag = String((e.target && e.target.tagName) || '').toLowerCase();
      if (targetTag === 'textarea' || targetTag === 'input') return;
      if (hostStart) {
        e.preventDefault();
        hostStart.click();
      }
    });
  }

  if (hostStart) hostStart.addEventListener('click', () => {
    try {
      if (pendingHostInviteCopy !== true) pendingHostInviteCopy = false;
      setHostPanelState('loading');
      setHostStatus('starting...', false);
      setHostLifecycleText('starting', false);
      api.send('host-start');
    } catch (e) { 
      appendHostLog('[client] start request failed: ' + (e && e.message)); 
      setHostStatus('error', false);
      setHostLifecycleText('error', false);
      setHostPanelState('initial');
    }
  });

  try {
    window.forceHost = (provider = 'localtunnel') => {
      const normalized = String(provider || '').trim().toLowerCase();
      if (normalized === 'localhost') {
        return 'Rejected: localhost provider is disabled. Use forceHost("localtunnel") or forceHost("cloudflared").';
      }
      const mode = normalized === 'cloudflared' ? 'cloudflared' : 'localtunnel';
      const status = mode === 'cloudflared' ? 'starting cloudflared (debug)...' : 'starting localtunnel (debug)...';
      const payload = { forceTunnel: mode };
      if (hostIsRunning) {
        try { api.send('host-stop'); } catch (e) {}
        setTimeout(() => {
          try {
            setHostPanelState('loading');
            setHostStatus(status, false);
            setHostLifecycleText('starting', false);
            api.send('host-start', payload);
          } catch (e) {}
        }, 450);
        return `Restarting host with ${mode}.`;
      }
      try {
        setHostPanelState('loading');
        setHostStatus(status, false);
        setHostLifecycleText('starting', false);
      } catch (e) {}
      api.send('host-start', payload);
      return `Starting host with ${mode}.`;
    };
    window.tlDebugUseLocalTunnel = (restart = false) => {
      if (restart) {
        return window.forceHost('localtunnel');
      }
      return window.forceHost('localtunnel');
    };
  } catch (e) {}

  if (hostStop) hostStop.addEventListener('click', () => {
    try {
      pendingHostInviteCopy = false;
      setHostStatus('stopping...', false);
      setHostLifecycleText('stopping', false);
      setHostPanelState('initial');
      if (hostShareUrl) hostShareUrl.textContent = '--';
      api.send('host-stop');
    } catch (e) { appendHostLog('[client] stop request failed: ' + (e && e.message)); }
  });
  
  if (hostShareBox) hostShareBox.addEventListener('click', async () => {
    try {
      await copyHostInviteLink();
    } catch (e) { console.warn('copy failed', e); }
  });
  
  if (hostAllowEmbeds) hostAllowEmbeds.addEventListener('change', (e) => {
    api.send('host-settings', { allowEmbeds: e.target.checked });
  });
  if (hostAllowAttachments) hostAllowAttachments.addEventListener('change', (e) => {
    api.send('host-settings', { allowAttachments: e.target.checked });
  });
  const hostChatFilter = document.getElementById('hostChatFilter');
  if (hostChatFilter) hostChatFilter.addEventListener('change', (e) => {
    api.send('host-settings', { chatFilter: e.target.checked });
  });
  if (hostE2EE) hostE2EE.addEventListener('change', (e) => {
    api.send('host-settings', { e2ee: e.target.checked });
  });
  
  const hostSystemMessage = document.getElementById('hostSystemMessage');
  const hostSendSystemMessage = document.getElementById('hostSendSystemMessage');
  if (hostSendSystemMessage && hostSystemMessage) {
    hostSendSystemMessage.addEventListener('click', () => {
      const text = hostSystemMessage.value.trim();
      if (text) {
        api.send('host-system-message', text);
        hostSystemMessage.value = '';
      }
    });
    hostSystemMessage.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = hostSystemMessage.value.trim();
        if (text) {
          api.send('host-system-message', text);
          hostSystemMessage.value = '';
        }
      }
    });
  }

  api.on('host-log', (data) => appendHostLog(String(data || '')));
  api.on('host-status', (data) => {
    const running = !!(data && data.running);
    const statusText = String((data && data.status) || 'unknown');
    if (!running) {
      pendingHostInviteCopy = false;
      isHosting = false;
      hostServerUrl = '';
      if (hostShareUrl) hostShareUrl.textContent = '--';
    }
    setHostStatus(statusText, running);
    setHostLifecycleText(statusText, running);
    if (/error/i.test(statusText)) {
      console.error('%c[host:status]%c ' + statusText, 'color:#fca5a5;font-weight:700;', 'color:#fee2e2;');
    } else if (running) {
      console.log('%c[host:status]%c ' + statusText, 'color:#86efac;font-weight:700;', 'color:#dcfce7;');
    } else {
      console.log('%c[host:status]%c ' + statusText, 'color:#93c5fd;font-weight:700;', 'color:#dbeafe;');
    }
  });
  api.on('host-share', (url) => {
    try {
      if (hostShareUrl) hostShareUrl.textContent = url || '--';
      if (url && url !== '--') {
        isHosting = true;
        hostServerUrl = url;
        setHostPanelState('running');
        setHostStatus('running', true);
        setHostLifecycleText('running', true);
        console.log('%c[host:share]%c active WSS link:', 'color:#67e8f9;font-weight:700;', 'color:#d5f8ff;', url);
        if (pendingHostInviteCopy) {
          pendingHostInviteCopy = false;
          copyHostInviteLink();
        }
      }
    } catch (e) {}
  });
  api.on('host-server-version', (version) => {
    try {
      hostServerVersionValue = String(version || '').trim();
      setHostServerVersionDisplay(hostServerVersionValue, hostIsRunning);
    } catch (e) {}
  });

  api.on('trigger-host-start', () => {
    if (hostStart) hostStart.click();
  });
  api.on('trigger-host-stop', () => {
    if (hostStop) hostStop.click();
  });
  api.on('toggle-host-panel', () => {
    showShortcutToast('Host Panel');
    toggleHostPanelFromShortcut();
  });
  api.on('toggle-host-server-shortcut', () => {
    showShortcutToast(hostIsRunning ? 'Host Stop' : 'Host Start');
    toggleHostServerFromShortcut();
  });
  api.on('copy-host-invite', async () => { const ok = await copyHostInviteLink(); showShortcutToast(ok ? 'Invite copied' : 'No invite'); });
  api.on('refresh-client', () => {
    try {
      const now = Date.now();
      const COOLDOWN = 4000;
      if (now - (lastRefreshRequest || 0) < COOLDOWN) return;
      lastRefreshRequest = now;
      refreshClientConnection();
    } catch (e) {}
  });

  api.on('host-error', (err) => {
    try { 
      isHosting = false;
      hostServerUrl = '';
      hostServerVersionValue = '';
      setHostServerVersionDisplay('', false);
      setHostStatus('error', false); 
      setHostLifecycleText('error', false);
      setHostPanelState('initial');
    } catch (e) {}
    try { console.error('[host-error]', err); } catch (e) {}
  });
  api.on('host-users', (users) => {
    console.log('%c[host:users]%c connected users:', 'color:#86efac;font-weight:700;', 'color:#dcfce7;', users || []);
    try { updateHostUserList(users); } catch (e) { console.error('[host-users] Error:', e); }
  });

  if (focusKeyBtn) focusKeyBtn.addEventListener('click', (e) => beginCapture(focusKeyBtn, 'focusKey'));
  if (toggleKeyBtn) toggleKeyBtn.addEventListener('click', (e) => beginCapture(toggleKeyBtn, 'toggleKey'));
    if (settingsResetBtn) settingsResetBtn.addEventListener('click', () => {
    keybinds = { ...defaultKeybinds };
    if (focusKeyBtn) { focusKeyBtn.textContent = keybinds.focusKey; focusKeyBtn.title = `Focus chat: ${keybinds.focusKey}`; }
    if (toggleKeyBtn) { toggleKeyBtn.textContent = keybinds.toggleKey; toggleKeyBtn.title = `Toggle overlay: ${keybinds.toggleKey}`; }
      settings = { ...defaultSettings };
      try { const cb = document.getElementById('playMentionHidden'); if (cb) cb.checked = !!settings.playMentionWhenHidden; } catch (e) {}
      try { const spamFilter = document.getElementById('spamFilterToggle'); if (spamFilter) spamFilter.checked = settings.spamFilter !== false; } catch (e) {}
      try { const debugLogging = document.getElementById('enableDebugLogging'); if (debugLogging) { debugLogging.checked = settings.enableDebugLogging !== false; api.send('debug-logging-toggle', settings.enableDebugLogging !== false); } } catch (e) {}
      try { const devTools = document.getElementById('enableDevTools'); if (devTools) { devTools.checked = !!settings.enableDevTools; api.send('devtools-toggle', !!settings.enableDevTools); } } catch (e) {}
      try { if (trueOverlayToggle) { trueOverlayToggle.checked = false; api.send('true-overlay-disable'); } } catch (e) {}
      try { const themeSelect = document.getElementById('themeSelect'); if (themeSelect) { themeSelect.value = settings.theme || 'default'; } } catch (e) {}
      try { applyTheme(settings.theme || 'default'); } catch (e) {}
      try { 
        const bgSlider = document.getElementById('bgOpacitySlider');
        const bgValue = document.getElementById('bgOpacityValue');
        const resetOpacity = Number.isFinite(Number(settings.bgOpacity)) ? Number(settings.bgOpacity) : 92;
        if (bgSlider) bgSlider.value = resetOpacity;
        if (bgValue) bgValue.textContent = resetOpacity + '%';
        applyBgOpacity(resetOpacity);
      } catch (e) {}
      try {
        const blurSlider = document.getElementById('bgBlurSlider');
        const blurValue = document.getElementById('bgBlurValue');
        if (blurSlider) blurSlider.value = settings.bgBlur || 0;
        if (blurValue) blurValue.textContent = (settings.bgBlur || 0) + '%';
        applyBackdropBlur(settings.bgBlur || 0);
      } catch (e) {}
      try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
      saveKeybinds();
      try { renderSettingsUI(); } catch (e) {}
  });

  loadKeybindsFromStorage();

  window.addEventListener('beforeunload', () => {
    intentionalDisconnect = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });
});