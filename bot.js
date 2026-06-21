'use strict';

// ──────────────────────────────────────────────
//  DEPENDENCY CHECK (informational only)
// ──────────────────────────────────────────────
// NOTE: Render (or any host) already runs "npm install" during the BUILD
// step via package.json's "build" script — dependencies are installed
// BEFORE this file ever runs. Re-running npm install here at startup was
// removed because it could itself fail/hang on some hosts (no registry
// access at runtime, read-only filesystem, etc.) and crash the whole bot
// with a confusing "Exited with status 1" error. If a module is truly
// missing, the require() calls below will throw a clear, readable error
// in the logs telling you exactly which package and how to fix it.
try {
  require.resolve('node-telegram-bot-api');
  require.resolve('axios');
  require.resolve('mongoose');
} catch (e) {
  console.error('❌ FATAL: Missing dependency —', e.message);
  console.error('👉 Fix: run "npm install" in this project folder, then restart.');
  process.exit(1);
}

// ──────────────────────────────────────────────
//  RENDER KEEP-ALIVE
// ──────────────────────────────────────────────
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('SMM Bot is alive! ✅');
}).listen(PORT, () => console.log(`🌐 Keep-alive server running on port ${PORT}`));

// ──────────────────────────────────────────────
//  DEPENDENCIES
// ──────────────────────────────────────────────
const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');
const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');

// Self-ping every 14 minutes to prevent Render free-tier sleep
const RENDER_URL = process.env.RENDER_URL || '';
setInterval(() => {
  if (!RENDER_URL) return;
  axios.get(RENDER_URL)
    .then(() => console.log('🔄 Self-ping OK'))
    .catch(e => console.log('⚠️ Self-ping err:', e.message));
}, 14 * 60 * 1000);

// ──────────────────────────────────────────────
//  MONGODB CONNECTION
// ──────────────────────────────────────────────
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://godranjeetyt789_db_user:godranjeetyt789_db_user@cluster0.e9ju33d.mongodb.net/test?appName=Cluster0';

const dbSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { strict: false });

const DBModel = mongoose.model('BotDB', dbSchema);

let _dbCache = null;

async function connectMongo() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ MongoDB Connected!');
}

connectMongo().catch(e => {
  console.error('❌ MongoDB connect error:', e.message);
});

// ──────────────────────────────────────────────
//  HARDCODED DEFAULTS (sirf fallback ke liye)
// ──────────────────────────────────────────────
const DEFAULTS = {
  TOKEN        : process.env.BOT_TOKEN  || '8722265017:AAFyh9oCUyuE8JvbUnrWQuO6e_TITkZNG8s',
  ADMIN        : parseInt(process.env.ADMIN_ID || '6106058051'),
  API_URL      : process.env.SMM_API_URL || 'https://vcsmm.in/api/v2',
  API_KEY      : process.env.SMM_API_KEY || 'ae0db3aac22daee333f748723ccebd4e',
  UPI_ID       : '7393028514@fam',
  UPI_NAME     : 'BINDU DEVI',
  FORCE_CHANNELS: (process.env.FORCE_CHANNELS || '@DARK_SMM_panel').split(',').map(c => c.trim()),
  MARGIN       : 20,
  REF_PCT      : 5,
  MIN_RECHARGE : 10,
  // Payment Gateway
  GATEWAY_URL  : process.env.GATEWAY_URL  || 'https://vcapi.vcstore.site/payment_api.php',
  GATEWAY_KEY  : process.env.GATEWAY_KEY  || 'PAYD1DA85183956FA763C951484',
  // Crypto (add your addresses here or set env vars)
  CRYPTO_BEP20     : process.env.CRYPTO_BEP20 || '',
  CRYPTO_TRC20     : process.env.CRYPTO_TRC20 || 'TN5eZootRzsgxthEckWoNxNHiEM5CuZb8y',
  CRYPTO_RATE      : process.env.CRYPTO_RATE  || 84,   // 1 USDT = ₹84
  TRONSCAN_API_KEY : process.env.TRONSCAN_API_KEY || 'cc38ada3-8934-4fcd-9c53-dc0e9f68ace0',
  USDT_TRC20_CONTRACT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  BOT_VERSION      : '22.0',
  LOGS_CHANNEL     : process.env.LOGS_CHANNEL || '', // e.g. @NexusLogs // Official USDT TRC-20 contract
};

// ──────────────────────────────────────────────
//  DATABASE
// ──────────────────────────────────────────────
const EMPTY_DB = {
  users:{}, payments:{}, orders:{}, tickets:{}, logs:[],
  customServices:{},
  apiServices:{},   // Admin-pinned real API services (by service ID)
  staff:{},         // Staff members { userId: { name, perms:[], addedAt } }
  settings:{
    apiUrl      : DEFAULTS.API_URL,
    apiKey      : DEFAULTS.API_KEY,
    upiId       : DEFAULTS.UPI_ID,
    upiName     : DEFAULTS.UPI_NAME,
    forceChannels: DEFAULTS.FORCE_CHANNELS,
    margin      : DEFAULTS.MARGIN,
    refPct      : DEFAULTS.REF_PCT,
    minRecharge : DEFAULTS.MIN_RECHARGE,
    welcomeMsg  : '',
    useCustomOnly: false,
    maintenanceMode: false,
    maintenanceMsg: '',
    cryptoRate  : DEFAULTS.CRYPTO_RATE,  // 1 USDT = ₹X
    botVersion  : DEFAULTS.BOT_VERSION,
    logsChannel : DEFAULTS.LOGS_CHANNEL,
  }
};

// Staff Permissions
const STAFF_PERMS = {
  VIEW_USERS      : 'view_users',
  MANAGE_USERS    : 'manage_users',
  VIEW_ORDERS     : 'view_orders',
  MANAGE_ORDERS   : 'manage_orders',
  VIEW_PAYMENTS   : 'view_payments',
  APPROVE_PAYMENTS: 'approve_payments',
  VIEW_TICKETS    : 'view_tickets',
  REPLY_TICKETS   : 'reply_tickets',
  VIEW_STATS      : 'view_stats',
  BROADCAST       : 'broadcast',
};
const ALL_PERMS = Object.values(STAFF_PERMS);

function mergeDefaults(data) {
  if (!data.customServices) data.customServices = {};
  if (!data.apiServices)    data.apiServices    = {};
  if (!data.staff)          data.staff          = {};
  if (!data.settings)       data.settings = { ...EMPTY_DB.settings };
  for (const k of Object.keys(EMPTY_DB.settings))
    if (data.settings[k] === undefined) data.settings[k] = EMPTY_DB.settings[k];
  if (!data.users)    data.users    = {};
  if (!data.payments) data.payments = {};
  if (!data.orders)   data.orders   = {};
  if (!data.tickets)  data.tickets  = {};
  if (!data.logs)     data.logs     = [];
  return data;
}

function loadDB() {
  // Return cache or empty DB synchronously — async save keeps it updated
  if (_dbCache) return _dbCache;
  _dbCache = JSON.parse(JSON.stringify(EMPTY_DB));
  // Trigger async load in background
  DBModel.findById('main').lean().then(doc => {
    if (doc && doc.data) {
      _dbCache = mergeDefaults(doc.data);
    }
  }).catch(e => console.error('DB load err:', e.message));
  return _dbCache;
}

function saveDB(db) {
  _dbCache = db;
  // Save to MongoDB asynchronously
  DBModel.findByIdAndUpdate(
    'main',
    { $set: { data: db } },
    { upsert: true, new: true }
  ).catch(e => console.error('DB save error:', e.message));
}

// Initial DB load from MongoDB on startup
async function initDB() {
  try {
    await connectMongo();
    const doc = await DBModel.findById('main').lean();
    if (doc && doc.data) {
      _dbCache = mergeDefaults(doc.data);
      console.log('📂 DB loaded from MongoDB. Users:', Object.keys(_dbCache.users||{}).length);
    } else {
      _dbCache = JSON.parse(JSON.stringify(EMPTY_DB));
      await DBModel.findByIdAndUpdate('main', { $set: { data: _dbCache } }, { upsert: true });
      console.log('📂 Fresh DB created in MongoDB.');
    }
  } catch(e) {
    console.error('initDB error:', e.message);
    _dbCache = JSON.parse(JSON.stringify(EMPTY_DB));
  }
}

// Live config — always read from DB
function cfg(db) {
  const s = db.settings;
  return {
    apiUrl      : s.apiUrl       || DEFAULTS.API_URL,
    apiKey      : s.apiKey       || DEFAULTS.API_KEY,
    upiId       : s.upiId        || DEFAULTS.UPI_ID,
    upiName     : s.upiName      || DEFAULTS.UPI_NAME,
    forceChannels: s.forceChannels || DEFAULTS.FORCE_CHANNELS,
    margin      : s.margin       ?? DEFAULTS.MARGIN,
    refPct      : s.refPct       ?? DEFAULTS.REF_PCT,
    minRecharge : s.minRecharge  ?? DEFAULTS.MIN_RECHARGE,
    useCustomOnly: !!s.useCustomOnly,
    maintenanceMode: !!s.maintenanceMode,
    maintenanceMsg: s.maintenanceMsg || '',
    welcomeMsg  : s.welcomeMsg   || '',
    cryptoRate  : s.cryptoRate   ?? DEFAULTS.CRYPTO_RATE,
    botVersion  : s.botVersion   || DEFAULTS.BOT_VERSION,
    logsChannel : s.logsChannel  || DEFAULTS.LOGS_CHANNEL,
  };
}

function isStaff(db, uid) {
  return !!db.staff[String(uid)];
}
function hasPerm(db, uid, perm) {
  if (uid === DEFAULTS.ADMIN) return true;
  const s = db.staff[String(uid)];
  if (!s) return false;
  return s.perms.includes(perm) || s.perms.includes('all');
}

function getUser(db, uid) {
  const id = String(uid);
  if (!db.users[id]) db.users[id] = {
    id, username:'', firstName:'',
    balance:0, totalSpent:0, totalRecharged:0,
    referralCode: genId(8), referredBy:null, referralEarnings:0,
    banned:false, joinedAt:Date.now(),
    paymentHistory:[], orderHistory:[], ticketHistory:[],
  };
  return db.users[id];
}

function log(db, entry) {
  db.logs.unshift({ ts:Date.now(), ...entry });
  if (db.logs.length > 500) db.logs.length = 500;
}

// ──────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────
function genId(n=12)         { return crypto.randomBytes(n).toString('hex').slice(0,n).toUpperCase(); }
function addMargin(r,margin) { return parseFloat((parseFloat(r)*(1+margin/100)).toFixed(4)); }
function calcCost(rate,qty)  { return parseFloat(((rate*qty)/1000).toFixed(2)); }
function sleep(ms)           { return new Promise(r=>setTimeout(r,ms)); }
function isURL(s)            { try { const u=new URL(s); return ['http:','https:'].includes(u.protocol); } catch{return false;} }
function chunkArr(arr,n)     { const r=[]; for(let i=0;i<arr.length;i+=n) r.push(arr.slice(i,i+n)); return r; }
// CRITICAL FIX: regular .slice(0,N) on strings counts UTF-16 code units, which can
// cut an emoji's surrogate pair in half (e.g. 100% Real, ✱, ⌈⌉ symbols in service
// names). A half-broken emoji is invalid UTF-8 and Telegram REJECTS the entire
// message with "400 Bad Request: inline keyboard button text must be encoded in
// UTF-8" — causing total silence (no response) on that button click.
// Array.from() splits by full Unicode code point, so emoji are never broken.
function safeSlice(str, maxLen) {
  if (!str) return '';
  str = String(str);
  const chars = Array.from(str);
  if (chars.length <= maxLen) return str;
  return chars.slice(0, maxLen).join('');
}
function isCustomSvc(id)     { return String(id).startsWith('CS'); }

function timeAgo(ts) {
  const m=Math.floor((Date.now()-ts)/60000);
  if (m<1)  return 'just now';
  if (m<60) return m+'m ago';
  const h=Math.floor(m/60);
  if (h<24) return h+'h ago';
  return Math.floor(h/24)+'d ago';
}
function statusEmoji(s) {
  return {pending:'⏳',inprogress:'🔄',processing:'🔄',completed:'✅',
    canceled:'❌',cancelled:'❌',partial:'⚠️',approved:'✅',
    rejected:'❌',open:'🟢',replied:'💬',closed:'🔴'}[s?.toLowerCase()]||'❓';
}
function upiQR(amount, upiId, upiName) {
  const d=`upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&cu=INR`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(d)}`;
}

function gatewayQR(amount, orderId) {
  // Encode the gateway payment page URL inside a QR code image
  const payUrl = `https://vcapi.vcstore.site/payment_api.php?api_key=${DEFAULTS.GATEWAY_KEY}&amount=${amount}&order_id=${orderId}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;
}

// ──────────────────────────────────────────────
//  SMM API — uses live settings from DB
// ──────────────────────────────────────────────
async function smmAPI(apiUrl, apiKey, params, retries=2) {
  for (let attempt=1; attempt<=retries; attempt++) {
    try {
      console.log(`[API] ${apiUrl} | action=${params.action} | attempt=${attempt}`);
      const r = await axios({
        method : 'POST',
        url    : apiUrl,
        data   : new URLSearchParams({ key: apiKey, ...params }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000, // 15s timeout (was 30s)
        validateStatus: () => true,
      });
      console.log(`[API] HTTP ${r.status} | Response:`, JSON.stringify(r.data).slice(0,200));
      if (r.status === 403) return { ok:false, error:'403 — Invalid API Key. Please contact admin.' };
      if (r.status === 404) return { ok:false, error:'404 — Wrong API URL. Please contact admin.' };
      if (r.status >= 500 && attempt < retries) {
        console.log(`[API] Server error ${r.status}, retrying in 2s...`);
        await sleep(2000); continue;
      }
      if (r.status >= 400) return { ok:false, error:`HTTP ${r.status} error from API` };
      const d = r.data;
      if (d && d.error) return { ok:false, error:String(d.error), data:d };
      return { ok:true, data:d };
    } catch(e) {
      console.error(`[API] Error (attempt ${attempt}):`, e.message);
      const isTimeout = e.code==='ECONNABORTED' || e.message?.includes('timeout');
      if (isTimeout && attempt < retries) {
        console.log('[API] Timeout, retrying...');
        await sleep(1500); continue;
      }
      if (isTimeout) return { ok:false, error:'⏱ API server is slow. Please try again in a moment.' };
      return { ok:false, error:e.message };
    }
  }
  return { ok:false, error:'API not responding. Please try again later.' };
}

// ──────────────────────────────────────────────
//  PAYMENT GATEWAY — vcapi.vcstore.site
//  GET ?api_key=KEY&amount=X&order_id=Y → JSON with UPI string
//  QR: encode gateway UPI string into QR image
// ──────────────────────────────────────────────
const GATEWAY_UPI = 'paytm.s1dw5n0@pty';
const GATEWAY_NAME = 'VC Payment Gateway';

function gatewayQrImageUrl(amount, orderId) {
  // Build UPI payment string using gateway's UPI ID
  const upiStr = `upi://pay?pa=${GATEWAY_UPI}&pn=${encodeURIComponent(GATEWAY_NAME)}&am=${amount}&tr=${encodeURIComponent(orderId)}&tn=${encodeURIComponent('NEXUS SMM')}&cu=INR`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(upiStr)}`;
}

async function checkGatewayOrder(orderId, amount) {
  try {
    const url = `${DEFAULTS.GATEWAY_URL}?api_key=${DEFAULTS.GATEWAY_KEY}&order_id=${encodeURIComponent(orderId)}&amount=${amount}&action=check`;
    console.log('[GATEWAY] Check URL:', url);
    const res = await axios.get(url, { timeout: 15000 });
    const d = res.data;
    console.log('[GATEWAY] Check response:', JSON.stringify(d));
    const statusRaw = (d?.status || d?.payment_status || '').toLowerCase();
    const isPaid = ['success','paid','completed','approved','captured'].includes(statusRaw);
    return { ok: true, isPaid, status: statusRaw, data: d };
  } catch (e) {
    console.error('[GATEWAY] Check error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ──────────────────────────────────────────────
//  CRYPTO AUTO MONITOR — TRC-20 USDT
// ──────────────────────────────────────────────
const seenTxHashes = new Set(); // In-memory seen txns

async function checkTrc20Deposits() {
  try {
    const addr = DEFAULTS.CRYPTO_TRC20;
    const apiKey = DEFAULTS.TRONSCAN_API_KEY;
    if (!addr || !apiKey) return;

    // Fetch recent TRC-20 transactions to our address
    const url = `https://apilist.tronscanapi.com/api/token_trc20/transfers?toAddress=${addr}&token=${DEFAULTS.USDT_TRC20_CONTRACT}&limit=20&start=0`;
    const res = await axios.get(url, {
      headers: { 'TRON-PRO-API-KEY': apiKey },
      timeout: 10000,
    });

    const txns = res.data?.token_transfers || [];
    const db = loadDB();
    const cryptoRate = db.settings?.cryptoRate || DEFAULTS.CRYPTO_RATE;

    for (const tx of txns) {
      const hash = tx.transaction_id;
      if (!hash || seenTxHashes.has(hash)) continue;

      // Check already processed in DB
      const alreadyDone = Object.values(db.payments).some(p => p.txHash === hash && p.status === 'approved');
      if (alreadyDone) { seenTxHashes.add(hash); continue; }

      // Only confirmed txns
      if (!tx.confirmed) continue;

      const amountUsdt = parseFloat(tx.quant) / 1_000_000; // USDT has 6 decimals
      if (amountUsdt < 0.5) { seenTxHashes.add(hash); continue; } // Skip dust

      const inrAmount = parseFloat((amountUsdt * cryptoRate).toFixed(2));

      // Find pending crypto deposit by matching amount (if user submitted TX hash)
      let matchedPid = null;
      let matchedUserId = null;
      for (const [pid, pay] of Object.entries(db.payments)) {
        if (pay.type === 'crypto' && pay.status === 'pending' && pay.txHash === hash) {
          matchedPid = pid;
          matchedUserId = pay.userId;
          break;
        }
      }

      // Auto credit
      const pid = matchedPid || ('TAUTO' + genId(8));
      const userId = matchedUserId;

      if (userId) {
        // User submitted TX hash — auto approve
        const pay = db.payments[pid];
        pay.status = 'approved';
        pay.amount = inrAmount;
        pay.usdtAmount = amountUsdt;
        pay.approvedAt = Date.now();
        const user = getUser(db, userId);
        user.balance += inrAmount;
        user.totalRecharged += inrAmount;
        log(db, { type: 'crypto_auto_approved', txHash: hash, usdt: amountUsdt, inr: inrAmount, userId });
        saveDB(db);
        seenTxHashes.add(hash);

        await bot.sendMessage(userId,
          `✅ <b>Crypto Deposit Confirmed!</b>\n\n` +
          `💵 ${amountUsdt} USDT → <b>₹${inrAmount}</b>\n` +
          `💳 New Balance: <b>₹${user.balance.toFixed(2)}</b>\n` +
          `🔗 TX: <code>${hash}</code>\n\n🙏 Thank you!`,
          { parse_mode: 'HTML' }
        ).catch(() => {});

        await bot.sendMessage(DEFAULTS.ADMIN,
          `₿ <b>Crypto Auto-Credit</b>\n\n` +
          `👤 ${user.firstName} [<code>${userId}</code>]\n` +
          `💵 ${amountUsdt} USDT = ₹${inrAmount}\n` +
          `🔗 <code>${hash}</code>`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      } else {
        // Unknown deposit — notify admin
        await bot.sendMessage(DEFAULTS.ADMIN,
          `₿ <b>Unknown Crypto Deposit!</b>\n\n` +
          `💵 ${amountUsdt} USDT = ₹${inrAmount}\n` +
          `🔗 TX: <code>${hash}</code>\n\n` +
          `No user has submitted this TX hash. Please check manually.`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
        seenTxHashes.add(hash);
      }
    }
  } catch (e) {
    console.error('[CRYPTO MONITOR]', e.message);
  }
}

// Run every 60 seconds
setInterval(checkTrc20Deposits, 60_000);
setTimeout(checkTrc20Deposits, 5000); // First run after 5s

// ── SERVICE CACHE (5 minute TTL) ──
let _svcCache = null;
let _svcCacheTs = 0;
const SVC_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAllServices(db, C, forceRefresh=false) {
  const customList = Object.values(db.customServices).filter(s=>s.active);
  const apiPinned  = Object.values(db.apiServices || {}).filter(s=>s.active);

  // Custom-only mode ON — sirf custom + pinned services dikhao
  if (C.useCustomOnly) return [...customList, ...apiPinned];

  // Pinned API services hain — unhe hi dikhao
  if (apiPinned.length > 0) return [...customList, ...apiPinned];

  // Cache check — 5 min TTL
  const now = Date.now();
  if (!forceRefresh && _svcCache && (now - _svcCacheTs) < SVC_CACHE_TTL) {
    console.log('[SERVICES] Returning cached services:', _svcCache.length);
    return [...customList, ..._svcCache];
  }

  // No pinned — fetch full API
  console.log('[SERVICES] Fetching fresh from API...');
  const res = await smmAPI(C.apiUrl, C.apiKey, { action:'services' });
  if (res.ok && Array.isArray(res.data) && res.data.length>0) {
    _svcCache = res.data;
    _svcCacheTs = now;
    console.log('[SERVICES] Cached', res.data.length, 'services');
    return [...customList, ...res.data];
  }

  // Fallback: use stale cache if available
  if (_svcCache && _svcCache.length > 0) {
    console.log('[SERVICES] API failed, using stale cache:', _svcCache.length);
    return [...customList, ..._svcCache];
  }

  // Last resort: sirf custom
  return customList;
}

// ──────────────────────────────────────────────
//  FORCE JOIN
// ──────────────────────────────────────────────
async function isChannelMember(bot, uid, channel) {
  if (uid === DEFAULTS.ADMIN) return true;
  if (!channel || channel === '0') return true;
  try {
    const m = await bot.getChatMember(channel, uid);
    // 'left' and 'kicked' mean NOT a member
    return ['member','administrator','creator','restricted'].includes(m.status);
  } catch(e) {
    console.log('Force join check error:', e.message);
    // If error contains "user not found" or similar, treat as NOT member
    // Only fail-open if it's a bot permission error (channel not found etc.)
    if (e.message && (e.message.includes('USER_ID_INVALID') || e.message.includes('Bad Request'))) {
      return false; // treat as not joined
    }
    return false; // strict: default to NOT member so join is enforced
  }
}

async function sendJoinPrompt(bot, uid, channel) {
  const link = channel.startsWith('@') ? `https://t.me/${channel.slice(1)}` : channel;
  await bot.sendMessage(uid,
    `🚫 <b>Access Restricted!</b>\n\n📢 You must join our official channel to use this bot.\n\n👇 Click the button below to join, then tap <b>✅ I Have Joined</b>:`,
    { parse_mode:'HTML', reply_markup:{ inline_keyboard:[
      [{ text:'📢 Join Channel Now', url:link }],
      [{ text:'✅ I Have Joined', callback_data:'check_join' }],
    ]}}
  );
}

// ──────────────────────────────────────────────
//  BOT INIT
// ──────────────────────────────────────────────
const bot = new TelegramBot(DEFAULTS.TOKEN, {
  polling: { interval:300, autoStart:true, params:{ timeout:10 } }
});

const STATE = {};
const COOL  = {};
function getState(uid)   { return STATE[String(uid)] || {}; }
function setState(uid,s) { STATE[String(uid)] = s; }
function clearState(uid) { delete STATE[String(uid)]; }
function coolOK(uid) {
  if (uid === DEFAULTS.ADMIN) return true; // admin ko cooldown nahi
  const now=Date.now(), last=COOL[String(uid)]||0;
  if (now-last<1500) return false;
  COOL[String(uid)]=now; return true;
}

// ──────────────────────────────────────────────
//  KEYBOARDS
// ──────────────────────────────────────────────
const MAIN = { reply_markup:{ keyboard:[
  ['💰 Wallet','🛒 New Order'],
  ['📦 My Orders','🔗 Referral'],
  ['📊 My Stats','🎧 Support'],
  ['ℹ️ Help'],
], resize_keyboard:true }};

const ADMIN_KB = { reply_markup:{ keyboard:[
  ['👥 Users','💳 Payments'],
  ['📦 Orders','📢 Broadcast'],
  ['🎟 Tickets','📋 Logs'],
  ['⚙️ Settings','🛠 Services Mgmt'],
  ['📊 Stats','👨‍💼 Staff Panel'],
  ['💾 Backup DB','♻️ Restore DB'],
  ['🔙 Main Menu'],
], resize_keyboard:true }};

const STAFF_KB = { reply_markup:{ keyboard:[
  ['👥 Users','💳 Payments'],
  ['📦 Orders','🎟 Tickets'],
  ['📊 Stats','🔙 Main Menu'],
], resize_keyboard:true }};

const CANCEL = { reply_markup:{ keyboard:[['❌ Cancel']], resize_keyboard:true }};

// ──────────────────────────────────────────────
//  SEND
// ──────────────────────────────────────────────
// Edits an existing message in place (e.g. on "Refresh") instead of sending
// a brand new one every time — avoids spamming the chat with duplicate cards.
// Falls back to sending a fresh message if editing isn't possible
// (message too old, deleted, or content unchanged).
async function editOrSend(cid, messageId, text, opts={}) {
  if (messageId) {
    try {
      if (text.length>4000) text=safeSlice(text,4000)+'...';
      await bot.editMessageText(text, { chat_id:cid, message_id:messageId, parse_mode:'HTML', ...opts });
      return;
    } catch(e) {
      if (!/message is not modified/i.test(e.message)) {
        console.log('[editOrSend] edit failed, sending fresh:', e.message);
      } else {
        return; // content identical — nothing to do
      }
    }
  }
  return send(cid, text, opts);
}

async function send(cid, text, opts={}) {
  try {
    if (text.length>4000) text=safeSlice(text,4000)+'...';
    return await bot.sendMessage(cid, text, { parse_mode:'HTML', ...opts });
  } catch(e) {
    console.error('send err:', e.message, '| cid:', cid);
    // ── LAST-RESORT FALLBACK ──
    // If the rich message (HTML/buttons/emoji) failed for ANY reason, the user
    // must still get something rather than total silence. Strip everything
    // risky (HTML tags, emoji, buttons) and try a bare-bones plain message.
    try {
      const plain = String(text)
        .replace(/<[^>]+>/g, '')                 // strip HTML tags
        .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '') // strip emoji
        .trim();
      return await bot.sendMessage(cid, plain || '⚠️ An error occurred displaying this message. Please try again.');
    } catch(e2) {
      console.error('send fallback ALSO failed:', e2.message, '| cid:', cid);
    }
  }
}
const adm = (t,o={}) => send(DEFAULTS.ADMIN, t, o);

// Logs channel — order/payment events
async function sendLog(text, opts={}) {
  try {
    const db = loadDB();
    const ch = db.settings?.logsChannel || DEFAULTS.LOGS_CHANNEL;
    if (!ch || ch==='0') return;
    await bot.sendMessage(ch, text, { parse_mode:'HTML', ...opts });
  } catch(e) { console.log('[LOG CHANNEL]', e.message); }
}

// ──────────────────────────────────────────────
//  /start
// ──────────────────────────────────────────────
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const uid  = msg.from.id;
  const ref  = match[1]?.trim();
  const db   = loadDB();
  const C    = cfg(db);
  const user = getUser(db, uid);
  user.username  = msg.from.username  || '';
  user.firstName = msg.from.first_name || 'Friend';
  if (ref && !user.referredBy) {
    const referrer = Object.values(db.users).find(u=>u.referralCode===ref && u.id!==String(uid));
    if (referrer) { user.referredBy=referrer.id; log(db,{type:'referral',from:uid,to:referrer.id}); }
  }
  saveDB(db);

  // ── Maintenance Mode — block regular users, admin/staff bypass ──
  if (C.maintenanceMode && uid!==DEFAULTS.ADMIN && !isStaff(db,uid)) {
    return send(uid,
      C.maintenanceMsg ||
      '🚧 <b>Bot is under maintenance!</b>\n\nWe\'re fixing some things right now. Please check back in a little while.\n\n🙏 Sorry for the inconvenience.'
    );
  }

  for (const ch of (C.forceChannels || [])) {
    if (!ch || ch === '0') continue;
    const joined = await isChannelMember(bot, uid, ch);
    if (!joined) return sendJoinPrompt(bot, uid, ch);
  }
  const wMsg = C.welcomeMsg || `🚀 <b>Boost Your Social Media with Us!</b>\n━━━━━━━━━━━━━━━━━━━━\n🛒 <b>Order Services</b> - High-quality SMM services.\n💰 <b>Add Funds</b> - Easy UPI recharges.\n📦 <b>Track Orders</b> - Real-time order status.\n🔗 <b>Refer & Earn</b> - Get amazing commissions!\n🎧 <b>24/7 Support</b> - Always here to help.\n━━━━━━━━━━━━━━━━━━━━\n👇 <i>Use the buttons below to get started:</i>`;
  await send(uid, `🎉 <b>Welcome to NEXUS PANEL!</b> 🎉\n\n🌟 Hello <b>${user.firstName}</b>! 👋\n\n${wMsg}`, MAIN);
});

// ──────────────────────────────────────────────
//  /admin
// ──────────────────────────────────────────────
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id !== DEFAULTS.ADMIN) return;
  
  await send(msg.chat.id,
    `👨‍💻 <b>Welcome Back, Boss!</b> 👑\n\n⚡️ <b>NEXUS ADMIN PANEL v3.0</b> ⚡️\n━━━━━━━━━━━━━━━━━━━━\n🟢 <b>System Status:</b> Online & Running\n🛡 <b>Security:</b> Secured\n\n👇 <i>Use the buttons below to manage your SMM Panel:</i>`,
    ADMIN_KB
  );
});

// ──────────────────────────────────────────────
//  MAIN MESSAGE ROUTER
// ──────────────────────────────────────────────
bot.on('message', async (msg) => {
  try {
  if (!msg.text) return handleMedia(msg);
  const uid  = msg.from.id;
  const text = msg.text.trim();
  if (text.startsWith('/')) return;
  if (!coolOK(uid)) return;

  const db   = loadDB();
  const C    = cfg(db);
  const user = getUser(db, uid);
  user.username  = msg.from.username  || user.username;
  user.firstName = msg.from.first_name || user.firstName;
  saveDB(db);

  if (user.banned && uid!==DEFAULTS.ADMIN) return send(uid,'🚫 You have been banned from this bot.');

  // ── Maintenance Mode — block regular users, admin/staff bypass ──
  if (C.maintenanceMode && uid!==DEFAULTS.ADMIN && !isStaff(db,uid)) {
    return send(uid,
      C.maintenanceMsg ||
      '🚧 <b>Bot is under maintenance!</b>\n\nWe\'re fixing some things right now. Please check back in a little while.\n\n🙏 Sorry for the inconvenience.'
    );
  }

  // Admin keyboard buttons
  if (uid === DEFAULTS.ADMIN) {
    if (text==='🔙 Main Menu')    { clearState(uid); return send(uid,'🏠 Main Menu',MAIN); }
    if (text==='👥 Users')         return adminUsers(uid,db);
    if (text==='💳 Payments')      return adminPayments(uid,db,C);
    if (text==='📦 Orders')        return adminOrders(uid,db,C);
    if (text==='📢 Broadcast')     return adminBroadcast(uid);
    if (text==='🎟 Tickets')       return adminTickets(uid,db);
    if (text==='📋 Logs')          return adminLogs(uid,db);
    if (text==='⚙️ Settings')      return adminSettings(uid,db,C);
    if (text==='🛠 Services Mgmt') return adminServicesMenu(uid,db,C);
    if (text==='📊 Stats')         return adminStats(uid,db,C);
    if (text==='👨‍💼 Staff Panel')   return adminStaffPanel(uid,db);
    if (text==='💾 Backup DB')     return adminBackupDB(uid,db);
    if (text==='♻️ Restore DB')    return adminRestoreDB(uid);
  }

  // Staff keyboard buttons
  if (isStaff(db, uid)) {
    if (text==='🔙 Main Menu')    { clearState(uid); return send(uid,'👨\u200d💼 Staff Panel',STAFF_KB); }
    if (text==='👥 Users'        && hasPerm(db,uid,STAFF_PERMS.VIEW_USERS))    return adminUsers(uid,db);
    if (text==='💳 Payments'     && hasPerm(db,uid,STAFF_PERMS.VIEW_PAYMENTS)) return adminPayments(uid,db,C);
    if (text==='📦 Orders'       && hasPerm(db,uid,STAFF_PERMS.VIEW_ORDERS))   return adminOrders(uid,db,C);
    if (text==='🎟 Tickets'      && hasPerm(db,uid,STAFF_PERMS.VIEW_TICKETS))  return adminTickets(uid,db);
    if (text==='📊 Stats'        && hasPerm(db,uid,STAFF_PERMS.VIEW_STATS))    return adminStats(uid,db,C);
  }

  if (text==='❌ Cancel') { clearState(uid); return send(uid,'❌ Cancelled.',MAIN); }

  // Force join check (not for admin/staff)
  if (uid!==DEFAULTS.ADMIN && !isStaff(db,uid)) {
    for (const ch of (C.forceChannels || [])) {
      if (!ch || ch === '0') continue;
      const joined = await isChannelMember(bot, uid, ch);
      if (!joined) return sendJoinPrompt(bot, uid, ch);
    }
  }

  const state = getState(uid);
  if (state.step) return handleStep(msg, db, user, state, C);

  switch(text) {
    case '💰 Wallet':    return walletMenu(uid,db,user,C);
    case '🛒 New Order': return newOrder(uid,db,C);
    case '📦 My Orders': return myOrders(uid,db,user,C);
    case '🔗 Referral':  return referralMenu(uid,db,user,C);
    case '🎧 Support':   return supportMenu(uid);
    case '📊 My Stats':  return myStats(uid,db,user,C);
    case 'ℹ️ Help':      return helpMenu(uid,C);
    default:             return send(uid,'💡 Please use the menu buttons.',MAIN);
  }
  } catch (e) {
    console.error('[message handler] FATAL ERROR | text:', msg.text, '| uid:', msg.from?.id, '| error:', e.message);
    return send(msg.from.id,
      `❌ <b>Something went wrong.</b>\n\n<code>${e.message}</code>\n\n💡 Please tap 🏠 a menu button and try again. If this keeps happening, contact Support.`,
      MAIN
    ).catch(()=>{});
  }
});

// ──────────────────────────────────────────────
//  MEDIA — payment screenshot
// ──────────────────────────────────────────────
async function handleMedia(msg) {
  const uid   = msg.from.id;
  const state = getState(uid);

  // ── RESTORE DB from JSON file ──
  if (state.step === 'restore_db' && uid === DEFAULTS.ADMIN) {
    if (!msg.document) return send(uid, '❌ Please send a JSON file (as a document):', CANCEL);
    if (!msg.document.file_name?.endsWith('.json')) return send(uid, '❌ Only .json files are accepted:', CANCEL);
    try {
      await send(uid, '⏳ Reading file...');
      const fileLink = await bot.getFileLink(msg.document.file_id);
      const res = await axios.get(fileLink, { responseType: 'text', timeout: 15000 });
      let restored;
      try { restored = JSON.parse(res.data); } catch { return send(uid, '❌ Invalid JSON file. Please send a valid backup file.', ADMIN_KB); }

      // Validate structure
      if (!restored.users || !restored.settings) return send(uid, '❌ This is not a valid backup file.', ADMIN_KB);

      const userCount  = Object.keys(restored.users    || {}).length;
      const orderCount = Object.keys(restored.orders   || {}).length;
      const payCount   = Object.keys(restored.payments || {}).length;

      // Save to DB
      _dbCache = mergeDefaults(restored);
      await DBModel.findByIdAndUpdate('main', { $set: { data: restored } }, { upsert: true, new: true });

      clearState(uid);
      await send(uid,
        `✅ <b>Database Restored Successfully!</b>\n\n` +
        `👥 Users: ${userCount}\n` +
        `📦 Orders: ${orderCount}\n` +
        `💳 Payments: ${payCount}\n\n` +
        `🎉 All data has been restored!`,
        ADMIN_KB
      );
    } catch(e) {
      console.error('Restore error:', e.message);
      await send(uid, `❌ Restore failed: ${e.message}`, ADMIN_KB);
    }
    return;
  }
  if (state.step !== 'payment_screenshot') return;
  if (!msg.photo && !msg.document) return;

  const fileId = msg.photo ? msg.photo[msg.photo.length-1].file_id : msg.document.file_id;
  const db=loadDB(); const user=getUser(db,uid);
  const pid='PAY'+genId(8);
  db.payments[pid]={id:pid,userId:String(uid),amount:state.data.amount,utr:state.data.utr,screenshotFileId:fileId,status:'pending',createdAt:Date.now()};
  user.paymentHistory.push(pid);
  log(db,{type:'payment_request',userId:uid,paymentId:pid,amount:state.data.amount});
  saveDB(db); clearState(uid);

  await send(uid,
    `✅ <b>Payment Submitted!</b>\n\n🆔 <code>${pid}</code>\n💰 ₹${state.data.amount}\n🔖 UTR: <code>${state.data.utr}</code>\n\n⏳ Admin will verify shortly.`,
    MAIN
  );
  const payMsg = `💳 <b>New Payment Request</b>\n\n👤 ${user.firstName} (@${user.username||'N/A'}) [<code>${uid}</code>]\n🆔 <code>${pid}</code>\n💰 ₹${state.data.amount}\n🔖 UTR: <code>${state.data.utr}</code>`;
  const payBtns = {reply_markup:{inline_keyboard:[
    [{text:'✅ Approve',callback_data:`pay_ok_${pid}`},{text:'❌ Reject',callback_data:`pay_no_${pid}`}],
    [{text:'✏️ Custom Amount',callback_data:`pay_custom_${pid}`}],
  ]}};
  await adm(payMsg, payBtns);
  // Notify staff with approve_payments permission
  const db2n=loadDB();
  for (const [sid,sm] of Object.entries(db2n.staff||{})) {
    if (hasPerm(db2n,parseInt(sid),STAFF_PERMS.APPROVE_PAYMENTS)) {
      await send(parseInt(sid), payMsg, payBtns).catch(()=>{});
    }
  }
  try { await bot.forwardMessage(DEFAULTS.ADMIN,msg.chat.id,msg.message_id); } catch{}
}

// ──────────────────────────────────────────────
//  STEP HANDLER
// ──────────────────────────────────────────────
async function handleStep(msg, db, user, state, C) {
  const uid=msg.from.id, text=msg.text.trim();

  // ── GATEWAY PAYMENT FLOW ──
  if (state.step==='payment_amount_gw') {
    const amt = parseFloat(text);
    if (isNaN(amt) || amt < C.minRecharge)
      return send(uid, `❌ Minimum recharge amount is ₹${C.minRecharge}. Please enter a valid amount:`, CANCEL);

    const pid = 'GPAY' + genId(8);
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min expiry
    const db2 = loadDB(); const user2 = getUser(db2, uid);
    db2.payments[pid] = {
      id: pid, userId: String(uid), amount: amt,
      gwOrderId: pid, txnId: pid,
      status: 'pending', type: 'gateway',
      createdAt: Date.now(), expiresAt,
    };
    user2.paymentHistory.push(pid);
    log(db2, { type: 'gateway_payment_created', userId: uid, paymentId: pid, amount: amt });
    saveDB(db2); clearState(uid);

    const qrImageUrl = gatewayQrImageUrl(amt, pid);
    const expireStr = new Date(expiresAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});

    await bot.sendPhoto(uid, qrImageUrl, {
      caption:
        `💳 <b>Complete Your Payment</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 Amount: <b>₹${amt}</b>\n` +
        `🆔 Order ID: <code>${pid}</code>\n` +
        `⏰ Expires: <b>${expireStr}</b> (valid for 10 minutes)\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📲 <b>How to Pay:</b>\n` +
        `1. Scan the QR code above\n` +
        `2. Complete the UPI payment\n` +
        `3. Tap <b>✅ Check Payment Status</b> below\n\n` +
        `⚠️ Do not close this screen until payment is confirmed.`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: '✅ Check Payment Status', callback_data: `gw_check_${pid}` }],
      ]},
    });
    return;
  }

  // ── CRYPTO AMOUNT (Admin approve) ──
  if (state.step==='crypto_amt') {
    const amt = parseFloat(text);
    if (isNaN(amt) || amt <= 0) return send(uid,'❌ Enter a valid amount:',CANCEL);
    const db2 = loadDB();
    const pay = db2.payments[state.data.pid];
    if (!pay) return send(uid,'❌ Payment not found.',ADMIN_KB);
    pay.status = 'approved'; pay.amount = amt; pay.approvedAt = Date.now();
    const user2 = getUser(db2, pay.userId);
    user2.balance += amt; user2.totalRecharged += amt;
    log(db2,{type:'crypto_approved',paymentId:state.data.pid,amount:amt,admin:uid});
    saveDB(db2); clearState(uid);
    await send(pay.userId,
      `✅ <b>Crypto Deposit Approved!</b>\n\n` +
      `💰 ₹${amt} has been added to your wallet\n` +
      `💳 Balance: <b>₹${user2.balance.toFixed(2)}</b>\n\n🙏 Thank you!`,
      MAIN
    );
    return send(uid,`✅ ₹${amt} credit kar diya ${user2.firstName} ko.`, ADMIN_KB);
  }

  // ── CRYPTO TX HASH FLOW ──
  if (state.step==='crypto_txhash') {
    const txHash = text.trim();
    if (txHash.length < 20) return send(uid,'❌ Please send a valid TX hash (64 characters):',CANCEL);
    const pid = 'CRYPTO' + genId(8);
    const db2 = loadDB(); const user2 = getUser(db2, uid);
    db2.payments[pid] = {
      id: pid, userId: String(uid), amount: 0,
      txHash, status: 'pending', type: 'crypto', createdAt: Date.now(),
    };
    user2.paymentHistory.push(pid);
    log(db2,{type:'crypto_submitted',userId:uid,paymentId:pid,txHash});
    saveDB(db2); clearState(uid);
    await send(uid,
      `✅ <b>TX Hash Submitted!</b>\n\n` +
      `🔗 <code>${txHash}</code>\n\n` +
      `⏳ Admin will verify and credit your wallet shortly.\n` +
      `🆔 Payment ID: <code>${pid}</code>`,
      MAIN
    );
    await adm(
      `₿ <b>Crypto Deposit Request</b>\n\n` +
      `👤 ${user2.firstName} [<code>${uid}</code>]\n` +
      `🆔 <code>${pid}</code>\n` +
      `🔗 TX: <code>${txHash}</code>`,
      {reply_markup:{inline_keyboard:[
        [{text:'✅ Approve + Credit', callback_data:`crypto_approve_${pid}`}],
        [{text:'❌ Reject', callback_data:`crypto_reject_${pid}`}],
      ]}}
    );
    return;
  }

  // Payment (manual UPI flow)
  if (state.step==='payment_amount') {
    const amt=parseFloat(text);
    if (isNaN(amt)||amt<C.minRecharge) return send(uid,`❌ Minimum recharge is ₹${C.minRecharge}:`,CANCEL);
    try {
      await bot.sendPhoto(uid, upiQR(amt,C.upiId,C.upiName), {
        caption:`💳 UPI Payment\n\n💰 ₹${amt}\n🏦 UPI ID: <code>${C.upiId}</code>\n👤 ${C.upiName}\n\nPlease send your UTR Number 👇`,
        parse_mode:'HTML', reply_markup:CANCEL.reply_markup,
      });
    } catch { await send(uid,`💳 UPI: <code>${C.upiId}</code>\n₹${amt}\n\nSend UTR:`,CANCEL); }
    setState(uid,{step:'payment_utr',data:{amount:amt}});
    return;
  }
  if (state.step==='payment_utr') {
    if (!/^\d{10,25}$/.test(text.replace(/\s/g,''))) return send(uid,'❌ Please enter a valid UTR number (10-25 digits):',CANCEL);
    setState(uid,{step:'payment_screenshot',data:{...state.data,utr:text}});
    return send(uid,'📸 Please send your payment screenshot:',CANCEL);
  }

  // Order
  if (state.step==='order_link') {
    if (!isURL(text)) return send(uid,'❌ Please send a valid URL (https://...):',CANCEL);

    // ── Validate link type matches what this Telegram service needs ──
    const isPrivateTgLink = /t\.me\/(\+|joinchat\/)/i.test(text) || /telegram\.me\/(\+|joinchat\/)/i.test(text);
    const isTgLink = /t(elegram)?\.me\//i.test(text);
    if (state.data.linkReq==='public' && isPrivateTgLink) {
      return send(uid,
        `🚫 This is a <b>private</b> link. This service needs a <b>PUBLIC</b> link (e.g. <code>https://t.me/yourgroupname</code>).\n\nPlease send the public link:`,
        CANCEL
      );
    }
    if (state.data.linkReq==='private' && isTgLink && !isPrivateTgLink) {
      return send(uid,
        `🚫 This is a <b>public</b> link. This service needs your <b>PRIVATE invite link</b> (e.g. <code>https://t.me/+AbCdEf...</code>).\n\nPlease send the private invite link:`,
        CANCEL
      );
    }

    setState(uid,{step:'order_qty',data:{...state.data,link:text}});
    const rate=state.data.rate;
    return send(uid,`🔢 <b>Enter Quantity</b>\n📊 Min: ${state.data.min} | Max: ${state.data.max}\n💵 Rate: ₹${rate}/1K`,CANCEL);
  }
  if (state.step==='order_qty') {
    const qty=parseInt(text,10),mn=parseInt(state.data.min,10),mx=parseInt(state.data.max,10);
    if (isNaN(qty)) return send(uid,'❌ Please enter a valid number:',CANCEL);
    if (qty<mn||qty>mx) return send(uid,`❌ Quantity must be between ${mn} and ${mx}:`,CANCEL);
    return confirmOrder(uid,state.data,qty,db,C);
  }
  if (state.step==='order_confirm') {
    if (text==='✅ Confirm Order') return placeOrderFinal(uid,state.data,C);
    clearState(uid); return send(uid,'❌ Order cancelled.',MAIN);
  }

  // Support
  if (state.step==='ticket') {
    const db2=loadDB(),u2=getUser(db2,uid),tid='TKT'+genId(6);
    db2.tickets[tid]={id:tid,userId:String(uid),message:text,status:'open',replies:[],createdAt:Date.now()};
    u2.ticketHistory.push(tid); log(db2,{type:'ticket',userId:uid,ticketId:tid}); saveDB(db2); clearState(uid);
    await send(uid,`🎟 <b>Ticket Created!</b>\n🆔 <code>${tid}</code>\n\n⏳ Our team will reply shortly.`,MAIN);
    const tktMsg=`🎟 <b>New Support Ticket</b>\n👤 ${u2.firstName} (@${u2.username||'N/A'}) [<code>${uid}</code>]\n🆔 <code>${tid}</code>\n📝 ${text}`;
    const tktBtns={reply_markup:{inline_keyboard:[[{text:'✏️ Reply',callback_data:`tkt_reply_${tid}`},{text:'🔴 Close',callback_data:`tkt_close_${tid}`}]]}};
    await adm(tktMsg, tktBtns);
    // Notify staff with reply_tickets permission
    const db2n=loadDB();
    for (const [sid] of Object.entries(db2n.staff||{})) {
      if (hasPerm(db2n,parseInt(sid),STAFF_PERMS.REPLY_TICKETS)) {
        await send(parseInt(sid), tktMsg, tktBtns).catch(()=>{});
      }
    }
    return;
  }

  // Admin: user search
  if (state.step==='a_search_user') {
    const db2=loadDB(); clearState(uid);
    const q=text.toLowerCase();
    const results=Object.values(db2.users).filter(u=>u.id===text||u.username?.toLowerCase().includes(q)||u.firstName?.toLowerCase().includes(q)).slice(0,5);
    if (!results.length) return send(uid,'❌ No user found.',ADMIN_KB);
    let txt=`👥 <b>Search Results</b>\n\n`;
    for (const u of results) txt+=`🆔 <code>${u.id}</code> — ${u.firstName} (@${u.username||'N/A'})\n💳 ₹${u.balance.toFixed(2)} | ${u.banned?'🚫 Banned':'✅ Active'}\n\n`;
    return send(uid,txt,{reply_markup:{inline_keyboard:results.map(u=>[{text:`👤 ${u.firstName}`,callback_data:`a_view_uid_${u.id}`}])}});
  }
  if (state.step==='a_add_bal') {
    const amt=parseFloat(text); if(isNaN(amt)||amt<=0) return send(uid,'❌ Invalid amount.',ADMIN_KB);
    const db2=loadDB(),tgt=getUser(db2,state.data.uid);
    tgt.balance+=amt; log(db2,{type:'add_bal',admin:uid,target:state.data.uid,amount:amt}); saveDB(db2); clearState(uid);
    await send(uid,`✅ ₹${amt} added to user ${state.data.uid}`,ADMIN_KB);
    await send(state.data.uid,`💰 ₹${amt} has been added to your wallet!\n💳 Balance: ₹${tgt.balance.toFixed(2)}`);
    return;
  }
  if (state.step==='a_rem_bal') {
    const amt=parseFloat(text); if(isNaN(amt)||amt<=0) return send(uid,'❌ Invalid amount.',ADMIN_KB);
    const db2=loadDB(),tgt=getUser(db2,state.data.uid);
    tgt.balance=Math.max(0,tgt.balance-amt); log(db2,{type:'rem_bal',admin:uid,target:state.data.uid,amount:amt}); saveDB(db2); clearState(uid);
    await send(uid,`✅ ₹${amt} removed from user ${state.data.uid}`,ADMIN_KB);
    await send(state.data.uid,`⚠️ ₹${amt} has been deducted from your wallet.\n💳 Balance: ₹${tgt.balance.toFixed(2)}`);
    return;
  }
  if (state.step==='a_broadcast') {
    const db2=loadDB(),uids=Object.keys(db2.users); clearState(uid);
    let ok=0,fail=0;
    await send(uid,`📢 Sending to ${uids.length} users...`);
    for (const id of uids) { try{await send(id,`📢 <b>Announcement</b>\n\n${text}`);ok++;}catch{fail++;} await sleep(50); }
    log(db2,{type:'broadcast',admin:uid,sent:ok,failed:fail}); saveDB(db2);
    return send(uid,`✅ Broadcast Done!\n📤 Sent: ${ok}\n❌ Failed: ${fail}`,ADMIN_KB);
  }
  if (state.step==='a_tkt_reply') {
    const db2=loadDB(),tkt=db2.tickets[state.data.tid]; clearState(uid);
    if (!tkt) return send(uid,'❌ Ticket not found.',ADMIN_KB);
    tkt.replies.push({from:'admin',message:text,ts:Date.now()}); tkt.status='replied'; saveDB(db2);
    await send(uid,`✅ Reply sent for ticket ${state.data.tid}`,ADMIN_KB);
    await send(tkt.userId,`🎟 <b>Support Reply</b>\nTicket: <code>${state.data.tid}</code>\n\n💬 ${text}`);
    return;
  }
  if (state.step==='a_custom_pay') {
    const amt=parseFloat(text); if(isNaN(amt)||amt<=0) return send(uid,'❌ Invalid amount.',ADMIN_KB);
    clearState(uid); return approvePayment(state.data.pid,amt,uid);
  }
  // Staff add steps
  if (state.step==='staff_add_id') {
    const staffId=text.trim().replace('@','');
    // Try to find by username or treat as ID
    const db2=loadDB();
    const targetUser=Object.values(db2.users).find(u=>u.username===staffId||u.id===staffId);
    if (!targetUser) return send(uid,`❌ User not found. Ask them to /start the bot first.\n\nEnter their Telegram User ID:`,CANCEL);
    setState(uid,{step:'staff_set_perms',data:{staffId:targetUser.id,name:targetUser.firstName}});
    const permBtns=ALL_PERMS.map(p=>[{text:`☑️ ${p}`,callback_data:`sp_toggle_${targetUser.id}_${p}`}]);
    permBtns.push([{text:'✅ Save Staff Member',callback_data:`sp_save_${targetUser.id}`}]);
    return send(uid,
      `👤 <b>Setting up staff:</b> ${targetUser.firstName} [<code>${targetUser.id}</code>]\n\n📋 Select permissions (toggle on/off):\n\n<i>All currently OFF — tap to enable</i>`,
      {reply_markup:{inline_keyboard:permBtns}}
    );
  }

  // Settings steps — all saved to DB
  if (state.step==='a_set_apiurl') {
    if (!text.startsWith('http')) return send(uid,'❌ Valid URL (https://...):',CANCEL);
    const db2=loadDB(); db2.settings.apiUrl=text; saveDB(db2); clearState(uid);
    return send(uid,`✅ API URL saved:\n<code>${text}</code>`,ADMIN_KB);
  }
  if (state.step==='a_set_apikey') {
    const db2=loadDB(); db2.settings.apiKey=text; saveDB(db2); clearState(uid);
    return send(uid,`✅ API Key saved:\n<code>${text.slice(0,16)}...</code>`,ADMIN_KB);
  }
  if (state.step==='a_set_upi') {
    const db2=loadDB(); db2.settings.upiId=text; saveDB(db2); clearState(uid);
    return send(uid,`✅ UPI ID: <code>${text}</code>`,ADMIN_KB);
  }
  if (state.step==='a_set_upiname') {
    const db2=loadDB(); db2.settings.upiName=text; saveDB(db2); clearState(uid);
    return send(uid,`✅ UPI Name: ${text}`,ADMIN_KB);
  }
  if (state.step==='a_set_channel') {
    const db2=loadDB();
    if (!db2.settings.forceChannels) db2.settings.forceChannels = [];
    const ch = text.startsWith('@') ? text : (text==='0'?'0':'@'+text);
    if (ch==='0') { db2.settings.forceChannels=[]; }
    else if (!db2.settings.forceChannels.includes(ch)) { db2.settings.forceChannels.push(ch); }
    saveDB(db2); clearState(uid);
    return send(uid,`✅ Channel added: ${ch}\nTotal: ${db2.settings.forceChannels.length} channel(s)\n\nYou can add more from ⚙️ Settings → 📢 Channel.`,ADMIN_KB);
  }
  if (state.step==='a_set_margin') {
    const m=parseFloat(text); if(isNaN(m)||m<0||m>1000) return send(uid,'❌ Enter a value between 0 and 1000:',CANCEL);
    const db2=loadDB(); db2.settings.margin=m; saveDB(db2); clearState(uid);
    return send(uid,`✅ Margin set to: ${m}%`,ADMIN_KB);
  }
  if (state.step==='a_set_minrecharge') {
    const m=parseFloat(text); if(isNaN(m)||m<1) return send(uid,'❌ Enter a valid amount:',CANCEL);
    const db2=loadDB(); db2.settings.minRecharge=m; saveDB(db2); clearState(uid);
    return send(uid,`✅ Min Recharge set to: ₹${m}`,ADMIN_KB);
  }
  if (state.step==='a_set_cryptorate') {
    const r=parseFloat(text); if(isNaN(r)||r<1) return send(uid,'❌ Enter a valid rate (e.g. 85):',CANCEL);
    const db2=loadDB(); db2.settings.cryptoRate=r; saveDB(db2); clearState(uid);
    return send(uid,`✅ Crypto Rate set: 1 USDT = ₹${r}`,ADMIN_KB);
  }
  if (state.step==='a_set_version') {
    const v = text.trim().replace(/^v/i,'');
    if (!v) return send(uid,'❌ Enter a valid version (e.g. 4.1):',CANCEL);
    const db2=loadDB(); db2.settings.botVersion=v; saveDB(db2); clearState(uid);
    return send(uid,`✅ Bot Version set: v${v}`,ADMIN_KB);
  }
  if (state.step==='a_set_logschannel') {
    const ch = text.trim();
    const db2=loadDB();
    db2.settings.logsChannel = ch==='0' ? '' : ch;
    saveDB(db2); clearState(uid);
    return send(uid, ch==='0' ? '✅ Logs channel disabled.' : `✅ Logs channel set: ${ch}\n\n⚠️ Make sure the bot is an Admin in that channel!`, ADMIN_KB);
  }
  if (state.step==='a_welcome_msg') {
    const db2=loadDB(); db2.settings.welcomeMsg=text; saveDB(db2); clearState(uid);
    return send(uid,'✅ Welcome message updated!',ADMIN_KB);
  }
  if (state.step==='a_maintenance_msg') {
    const db2=loadDB(); clearState(uid);
    db2.settings.maintenanceMsg = text==='0' ? '' : text;
    saveDB(db2);
    return send(uid,'✅ Maintenance message saved! Bot is now in maintenance mode for users.',ADMIN_KB);
  }

  // Custom service add steps
  if (state.step==='cs_name') { setState(uid,{step:'cs_category',data:{...state.data,name:text}}); return send(uid,'📁 Category name (e.g. Instagram, YouTube):',CANCEL); }
  if (state.step==='cs_category') { setState(uid,{step:'cs_rate',data:{...state.data,category:text}}); return send(uid,'💵 Rate per 1000 (e.g. 5.5):',CANCEL); }
  if (state.step==='cs_rate') {
    const rate=parseFloat(text); if(isNaN(rate)||rate<=0) return send(uid,'❌ Enter a valid rate:',CANCEL);
    setState(uid,{step:'cs_min',data:{...state.data,rate}}); return send(uid,'📊 Minimum quantity:',CANCEL);
  }
  if (state.step==='cs_min') {
    const min=parseInt(text,10); if(isNaN(min)||min<1) return send(uid,'❌ Enter a valid minimum:',CANCEL);
    setState(uid,{step:'cs_max',data:{...state.data,min}}); return send(uid,'📊 Maximum quantity:',CANCEL);
  }
  if (state.step==='cs_max') {
    const max=parseInt(text,10); if(isNaN(max)||max<state.data.min) return send(uid,`❌ Must be greater than min (${state.data.min}):`,CANCEL);
    setState(uid,{step:'cs_desc',data:{...state.data,max}}); return send(uid,'📝 Description (or type "skip"):',CANCEL);
  }
  if (state.step==='cs_desc') {
    const db2=loadDB(); const C2=cfg(db2);
    const desc=text.toLowerCase()==='skip'?'':text;
    const sid='CS'+genId(6); const s=state.data;
    db2.customServices[sid]={service:sid,name:s.name,category:s.category,rate:s.rate,min:s.min,max:s.max,description:desc,active:true,isCustom:true,createdAt:Date.now()};
    saveDB(db2); clearState(uid);
    return send(uid,`✅ <b>Custom Service Added!</b>\n\n🆔 <code>${sid}</code>\n📌 ${s.name}\n📁 ${s.category}\n💵 ₹${s.rate}/1K → Sell: ₹${addMargin(s.rate,C2.margin)}/1K\n📊 Min:${s.min} Max:${s.max}`,ADMIN_KB);
  }

  // ── Pinned API Service add steps ──
  if (state.step==='as_add_id') {
    const sid=text.trim();
    const db2=loadDB(); const C2=cfg(db2);
    await send(uid,`🔍 Fetching service ID <code>${sid}</code> from API...\n⏳ Please wait...`);
    const res=await smmAPI(C2.apiUrl,C2.apiKey,{action:'services'});
    if (!res.ok||!Array.isArray(res.data)) {
      clearState(uid);
      return send(uid,`❌ <b>Could not connect to API!</b>\n\nError: <code>${res.error}</code>\n\n💡 Check your API Key/URL in ⚙️ Settings.`,ADMIN_KB);
    }
    const svc=res.data.find(s=>String(s.service)===String(sid));
    if (!svc) {
      clearState(uid);
      return send(uid,
        `❌ <b>Service ID ${sid} not found!</b>\n\nTotal services available: ${res.data.length}\n\n💡 Tips:\n• Use 🌐 Browse & Add API Services to browse IDs\n• Copy-paste the exact ID`,
        ADMIN_KB
      );
    }
    const rate=addMargin(svc.rate,C2.margin);
    setState(uid,{step:'as_confirm',data:{svc}});
    return send(uid,
      `🎯 <b>Service Found!</b>\n\n🆔 ID: <code>${svc.service}</code>\n📌 <b>${svc.name}</b>\n📁 Category: ${svc.category||'N/A'}\n💵 API Rate: ₹${svc.rate}/1K\n💰 User Rate (with margin): ₹${rate}/1K\n📊 Min: ${svc.min} | Max: ${svc.max}\n\nDo you want to add this service?`,
      {reply_markup:{keyboard:[['✅ Confirm Add','❌ Cancel']],resize_keyboard:true}}
    );
  }

  if (state.step==='as_confirm') {
    if (text!=='✅ Confirm Add') { clearState(uid); return send(uid,'❌ Cancelled.',ADMIN_KB); }
    const db2=loadDB();
    if (!db2.apiServices) db2.apiServices={};
    const svc=state.data.svc;
    db2.apiServices[String(svc.service)]={
      ...svc,
      service: String(svc.service),
      active: true,
      isPinnedAPI: true,
      addedAt: Date.now(),
    };
    saveDB(db2); clearState(uid);
    return send(uid,
      `✅ <b>API Service Pinned!</b>\n\n🆔 <code>${svc.service}</code> — ${svc.name}\n\n🛒 Users can now order this service and the order will go to the real API!\n💡 Manage via "View Pinned API Services"`,
      ADMIN_KB
    );
  }

  // ── Custom Service EDIT steps ──
  if (state.step==='cs_edit_name') {
    const db2=loadDB(); const sid=state.data.sid;
    if (!db2.customServices[sid]) { clearState(uid); return send(uid,'❌ Service not found.',ADMIN_KB); }
    db2.customServices[sid].name=text; saveDB(db2); clearState(uid);
    return send(uid,`✅ <b>Service name updated!</b>\n\n📌 New Name: ${text}`,ADMIN_KB);
  }
  if (state.step==='cs_edit_rate') {
    const rate=parseFloat(text);
    if (isNaN(rate)||rate<=0) return send(uid,'❌ Enter a valid rate (e.g. 5.5):',CANCEL);
    const db2=loadDB(); const sid=state.data.sid;
    if (!db2.customServices[sid]) { clearState(uid); return send(uid,'❌ Service not found.',ADMIN_KB); }
    db2.customServices[sid].rate=rate; saveDB(db2); clearState(uid);
    return send(uid,`✅ <b>Rate updated!</b>\n\n💵 New Rate: ₹${rate}/1K`,ADMIN_KB);
  }
  if (state.step==='cs_edit_min') {
    const min=parseInt(text,10);
    if (isNaN(min)||min<1) return send(uid,'❌ Enter a valid minimum quantity:',CANCEL);
    const db2=loadDB(); const sid=state.data.sid;
    if (!db2.customServices[sid]) { clearState(uid); return send(uid,'❌ Service not found.',ADMIN_KB); }
    db2.customServices[sid].min=min; saveDB(db2); clearState(uid);
    return send(uid,`✅ <b>Min quantity updated!</b>\n\n📊 New Min: ${min}`,ADMIN_KB);
  }
  if (state.step==='cs_edit_max') {
    const max=parseInt(text,10);
    if (isNaN(max)||max<1) return send(uid,'❌ Enter a valid maximum quantity:',CANCEL);
    const db2=loadDB(); const sid=state.data.sid;
    if (!db2.customServices[sid]) { clearState(uid); return send(uid,'❌ Service not found.',ADMIN_KB); }
    db2.customServices[sid].max=max; saveDB(db2); clearState(uid);
    return send(uid,`✅ <b>Max quantity updated!</b>\n\n📊 New Max: ${max}`,ADMIN_KB);
  }
  if (state.step==='cs_edit_desc') {
    const db2=loadDB(); const sid=state.data.sid;
    if (!db2.customServices[sid]) { clearState(uid); return send(uid,'❌ Service not found.',ADMIN_KB); }
    db2.customServices[sid].description=text.toLowerCase()==='skip'?'':text; saveDB(db2); clearState(uid);
    return send(uid,`✅ <b>Description updated!</b>`,ADMIN_KB);
  }
  if (state.step==='cs_edit_delivery') {
    const db2=loadDB(); const sid=state.data.sid;
    if (!db2.customServices[sid]) { clearState(uid); return send(uid,'❌ Service not found.',ADMIN_KB); }
    db2.customServices[sid].delivery=text; saveDB(db2); clearState(uid);
    return send(uid,`✅ <b>Delivery time updated!</b>\n\n⏱ ${text}`,ADMIN_KB);
  }

  // ── Pinned API Service EDIT steps ──
  if (state.step==='as_edit_name') {
    const db2=loadDB(); const sid=state.data.sid;
    if (!db2.apiServices||!db2.apiServices[sid]) { clearState(uid); return send(uid,'❌ Service not found.',ADMIN_KB); }
    db2.apiServices[sid].name=text; saveDB(db2); clearState(uid);
    return send(uid,`✅ <b>API Service name updated!</b>\n\n📌 New Name: ${text}`,ADMIN_KB);
  }
  if (state.step==='as_edit_delivery') {
    const db2=loadDB(); const sid=state.data.sid;
    if (!db2.apiServices||!db2.apiServices[sid]) { clearState(uid); return send(uid,'❌ Service not found.',ADMIN_KB); }
    db2.apiServices[sid].delivery=text; saveDB(db2); clearState(uid);
    return send(uid,`✅ <b>API Service delivery updated!</b>\n\n⏱ ${text}`,ADMIN_KB);
  }
}

// ──────────────────────────────────────────────
//  USER FEATURES
// ──────────────────────────────────────────────
async function walletMenu(uid,db,user,C) {
  await send(uid,
    `💰 <b>My Wallet</b>\n\n` +
    `💳 Balance: <b>₹${user.balance.toFixed(2)}</b>\n` +
    `📤 Total Recharged: ₹${user.totalRecharged.toFixed(2)}\n` +
    `📥 Total Spent: ₹${user.totalSpent.toFixed(2)}\n` +
    `🎁 Referral Earnings: ₹${user.referralEarnings.toFixed(2)}`,
    {reply_markup:{inline_keyboard:[
      [{text:'⚡ UPI (Auto)',    callback_data:'wallet_add'}],
      [{text:'🏦 UPI (Manual)', callback_data:'wallet_manual'}],
      [{text:'₿  Crypto',       callback_data:'wallet_crypto'}],
      [{text:'📋 Payment History', callback_data:'wallet_hist'}],
    ]}}
  );
}

async function newOrder(uid,db,C,page=0,editMsgId=null) {
  try {
    let loadMsgId=editMsgId;
    if (loadMsgId) {
      await editOrSend(uid,loadMsgId,'⏳ <b>Loading services...</b>\n\n<i>Please wait...</i>');
    } else {
      const loadMsg = await bot.sendMessage(uid,'⏳ <b>Loading services...</b>\n\n<i>Please wait...</i>',{parse_mode:'HTML'});
      loadMsgId = loadMsg.message_id;
    }
    const services=await getAllServices(db,C);

    if (!services.length)
      return editOrSend(uid,loadMsgId,'❌ <b>No services available.</b>\n\n🔧 Reasons:\n• API server down\n• Invalid API key\n\nPlease try again or contact Support.',{reply_markup:{inline_keyboard:[[{text:'🔄 Retry',callback_data:'new_order_retry'},{text:'🏠 Home',callback_data:'go_home'}]]}});

    const cats={};
    for (const s of services) { const c=s.category||'Other'; if(!cats[c]) cats[c]=[]; cats[c].push(s); }
    const catKeys=Object.keys(cats);
    const PAGE_SIZE=20;
    const totalPages=Math.ceil(catKeys.length/PAGE_SIZE);
    const pageCatKeys=catKeys.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);

    const catMap={}; catKeys.forEach((c,i)=>catMap[i]=c);
    const catData={}; catKeys.forEach((c,i)=>{ catData[i]=cats[c]; });
    setState(uid,{...getState(uid), catMap, catData, services, orderPage:page, orderMsgId:loadMsgId});

    const btns=pageCatKeys.map((c)=>{
      const i=catKeys.indexOf(c);
      return [{text:`📁 ${c} (${cats[c].length})`,callback_data:`ocat_${i}`}];
    });

    // Pagination buttons
    const navRow=[];
    if (page>0) navRow.push({text:'⬅️ Prev',callback_data:`ocat_page_${page-1}`});
    if (totalPages>1) navRow.push({text:`📄 ${page+1}/${totalPages}`,callback_data:'noop'});
    if (page<totalPages-1) navRow.push({text:'Next ➡️',callback_data:`ocat_page_${page+1}`});
    if (navRow.length) btns.push(navRow);
    btns.push([{text:'🔄 Refresh Services',callback_data:'new_order_retry'}]);

    await editOrSend(uid,loadMsgId,`🛒 <b>New Order</b>\n\n📂 Select a category:\n<i>${services.length} services in ${catKeys.length} categories</i>`,{reply_markup:{inline_keyboard:btns}});
  } catch(e) {
    console.error('[newOrder error]', e.message);
    return send(uid,`❌ Failed to load services.\n\n<code>${e.message}</code>\n\n💡 Please try again.`,{reply_markup:{inline_keyboard:[[{text:'🔄 Try Again',callback_data:'new_order_retry'},{text:'🏠 Home',callback_data:'go_home'}]]}});
  }
}

async function myStats(uid,db,user,C,editMsgId=null) {
  const orders = user.orderHistory.map(oid=>db.orders[oid]).filter(Boolean);
  const totalOrders   = orders.length;
  const completed     = orders.filter(o=>['completed'].includes(o.status?.toLowerCase())).length;
  const pending       = orders.filter(o=>['pending','inprogress','processing'].includes(o.status?.toLowerCase())).length;
  const cancelled     = orders.filter(o=>['canceled','cancelled'].includes(o.status?.toLowerCase())).length;
  const totalSpent    = user.totalSpent||0;
  const totalRecharged= user.totalRecharged||0;
  const refCount      = Object.values(db.users).filter(u=>u.referredBy===String(uid)).length;

  // Member since
  const joinDate = user.joinedAt ? new Date(user.joinedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : 'N/A';

  // Last order info
  const lastOrder = orders.length ? orders[orders.length-1] : null;
  const lastOrderStr = lastOrder
    ? `${safeSlice(lastOrder.serviceName,30)} (${timeAgo(lastOrder.createdAt)})`
    : 'None';

  // Success rate
  const successRate = totalOrders>0 ? ((completed/totalOrders)*100).toFixed(1) : '0.0';

  const txt =
    `📊 <b>My Stats</b>
` +
    `━━━━━━━━━━━━━━━━━━━━

` +
    `👤 <b>Profile</b>
` +
    `🆔 User ID: <code>${uid}</code>
` +
    `👋 Name: ${user.firstName||'N/A'}
` +
    `📅 Member Since: ${joinDate}

` +
    `💳 <b>Wallet</b>
` +
    `💰 Balance: <b>₹${(user.balance||0).toFixed(2)}</b>
` +
    `💸 Total Recharged: ₹${totalRecharged.toFixed(2)}
` +
    `🛍 Total Spent: ₹${totalSpent.toFixed(2)}

` +
    `📦 <b>Orders</b>
` +
    `📋 Total Orders: <b>${totalOrders}</b>
` +
    `✅ Completed: ${completed}
` +
    `⏳ Pending/Active: ${pending}
` +
    `❌ Cancelled: ${cancelled}
` +
    `🎯 Success Rate: ${successRate}%
` +
    `🕒 Last Order: ${lastOrderStr}

` +
    `🔗 <b>Referral</b>
` +
    `👥 Total Referrals: ${refCount}
` +
    `💵 Referral Earnings: ₹${(user.referralEarnings||0).toFixed(2)}
` +
    `🏷 My Code: <code>${user.referralCode||'N/A'}</code>`;

  const btns = {reply_markup:{inline_keyboard:[
    [{text:'💰 Add Funds',callback_data:'wallet_add'},{text:'📦 My Orders',callback_data:'orders_refresh'}],
    [{text:'🔄 Refresh Stats',callback_data:'mystats_refresh'}],
  ]}};

  await editOrSend(uid, editMsgId, txt, btns);
}

async function myOrders(uid,db,user,C,editMsgId=null) {
  if (!user.orderHistory.length) return send(uid,'📦 You have no orders yet.',MAIN);
  const recent=user.orderHistory.slice(-10).reverse();
  let txt='📦 <b>My Orders</b>\n\n';
  const refillBtns=[];
  for (const oid of recent) {
    const o=db.orders[oid]; if(!o) continue;
    // Show the SAME order ID as on the provider's website for real API orders.
    // Custom (manual) orders have no website equivalent, so show the bot's own ID.
    const displayId = (!o.isCustom && o.apiOrderId) ? o.apiOrderId : o.id;
    txt+=`🆔 <code>${displayId}</code>${o.isCustom?' 🔧':' 🌐'}`;
    txt+=`\n📌 ${safeSlice(o.serviceName,40)}\n🔢 ${o.quantity} | ₹${o.cost} | ${statusEmoji(o.status)} ${o.status}\n⏱ ${timeAgo(o.createdAt)}`;
    if (o.refillId) txt+=`\n✅ Refill submitted (ID: ${o.refillId})`;
    txt+='\n\n';

    // Eligible for refill: real API order, completed, not already submitted
    if (!o.isCustom && o.status==='completed' && !o.refillId && refillBtns.length<5) {
      refillBtns.push([{text:`🔁 Request Refill — ${displayId}`,callback_data:`req_refill_${o.id}`}]);
    }
  }
  const btns=[...refillBtns,[{text:'🔄 Refresh Status',callback_data:'orders_refresh'}]];
  await editOrSend(uid,editMsgId,txt,{reply_markup:{inline_keyboard:btns}});
}

async function referralMenu(uid,db,user,C) {
  const me=await bot.getMe();
  const link=`https://t.me/${me.username}?start=${user.referralCode}`;
  const cnt=Object.values(db.users).filter(u=>u.referredBy===String(uid)).length;
  await send(uid,`🔗 <b>Referral Program</b>\n\n🆔 Your Code: <code>${user.referralCode}</code>\n🌐 Your Link: <code>${link}</code>\n\n👥 Total Referrals: ${cnt}\n🎁 Commission: ${C.refPct}% per recharge\n💰 Total Earned: ₹${user.referralEarnings.toFixed(2)}`);
}

async function supportMenu(uid) {
  setState(uid,{step:'ticket',data:{}});
  await send(uid,'🎧 <b>Support</b>\n\nDescribe your issue and we will get back to you:',CANCEL);
}

async function helpMenu(uid,C) {
  await send(uid,`ℹ️ <b>Help Guide</b>\n\n<b>How to Order?</b>\nNew Order → Category → Service → Link → Quantity → Confirm\n\n<b>How to Recharge?</b>\nWallet → Add Funds → Pay via UPI → Send UTR → Screenshot\n\n<b>Referral Program?</b>\nShare your referral link → Earn ${C.refPct}% commission on every recharge\n\n<b>Need Support?</b>\nTap Support → Describe your issue\n\nMin Recharge: ₹${C.minRecharge}`);
}

// ──────────────────────────────────────────────
//  ORDER FLOW
// ──────────────────────────────────────────────
async function confirmOrder(uid,data,qty,db,C) {
  const cost=calcCost(data.rate,qty);
  const user=getUser(db,uid);
  setState(uid,{step:'order_confirm',data:{...data,qty,cost}});
  const ok=user.balance>=cost;
  await send(uid,
    `🛒 <b>Confirm Order</b>\n\n📌 ${data.svcName}\n🔗 <code>${data.link}</code>\n🔢 ${qty}\n💵 ₹${data.rate}/1K\n💰 Total: <b>₹${cost}</b>\n\n💳 Balance: ₹${user.balance.toFixed(2)}\n${ok?'✅ Sufficient balance':'❌ Insufficient balance — please recharge first'}`,
    {reply_markup:{keyboard:[['✅ Confirm Order'],['❌ Cancel']],resize_keyboard:true}}
  );
}

async function placeOrderFinal(uid,data,C) {
  const db2=loadDB(); const user=getUser(db2,uid);
  clearState(uid);
  if (user.balance<data.cost) return send(uid,`❌ Insufficient balance!\n💳 Available: ₹${user.balance.toFixed(2)}\n💰 Required: ₹${data.cost}`,MAIN);

  const custom=isCustomSvc(data.serviceId);
  let apiId;

  if (!custom) {
    // ── REAL API ORDER ──
    const res=await smmAPI(C.apiUrl, C.apiKey, {
      action   : 'add',
      service  : data.serviceId,
      link     : data.link,
      quantity : data.qty,
    });
    if (!res.ok || res.data?.error) {
      const err=res.data?.error||res.error||'Unknown';
      console.error('[ORDER FAIL]', err);
      return send(uid,`❌ <b>Order failed!</b>\n\nError: <code>${err}</code>\n\n💡 Please contact Support.`,MAIN);
    }
    apiId=String(res.data.order||res.data.id||res.data.orderId||genId(8));
    console.log(`[ORDER] API placed. apiId=${apiId}`);
  } else {
    apiId='LOCAL-'+genId(8);
  }

  const oid='ORD'+genId(8);
  user.balance    -= data.cost;
  user.totalSpent += data.cost;
  user.orderHistory.push(oid);
  db2.orders[oid]={
    id:oid,userId:String(uid),apiOrderId:apiId,
    serviceId:data.serviceId,serviceName:data.svcName,
    link:data.link,quantity:data.qty,cost:data.cost,
    status:custom?'processing':'pending',
    isCustom:!!custom,createdAt:Date.now(),updatedAt:Date.now(),
  };
  log(db2,{type:'order',userId:uid,orderId:oid,apiOrderId:apiId,cost:data.cost});
  saveDB(db2);

  await send(uid,
    `✅ <b>Order Placed!</b>\n\n🆔 Order ID: <code>${custom?oid:apiId}</code>\n📌 ${data.svcName}\n🔗 <code>${data.link}</code>\n🔢 Quantity: ${data.qty}\n💰 ₹${data.cost} deducted\n💳 Balance: ₹${user.balance.toFixed(2)}\n\n${statusEmoji(custom?'processing':'pending')} Status: <b>${custom?'Processing':'Processing'}</b>\n\n📲 You will be notified when status updates.`,
    MAIN
  );
  // Admin notification
  const orderNotifMsg = `📦 <b>NEW ORDER</b> ${custom?'🔧 CUSTOM':'🌐 API'}\n\n👤 ${user.firstName} (@${user.username||'N/A'}) [<code>${uid}</code>]\n━━━━━━━━━━━━━\n🛒 Order ID: <code>${custom?oid:apiId}</code>\n📌 ${data.svcName}\n🔗 <code>${data.link}</code>\n🔢 ${data.qty} | ₹${data.cost}\n📊 Status: ${custom?'Processing':'Processing'}\n━━━━━━━━━━━━━\n📅 ${new Date().toLocaleString('en-IN')}`;
  const orderBtns = {reply_markup:{inline_keyboard:[[{text:'✅ Mark Complete',callback_data:`o_done_${oid}`},{text:'❌ Cancel+Refund',callback_data:`o_cancel_${oid}`}]]}};
  await adm(orderNotifMsg, orderBtns);
  // Notify staff with manage_orders permission
  for (const [sid] of Object.entries(db2.staff||{})) {
    if (hasPerm(db2,parseInt(sid),STAFF_PERMS.MANAGE_ORDERS)) {
      await send(parseInt(sid), orderNotifMsg, orderBtns).catch(()=>{});
    }
  }
  // Logs channel
  await sendLog(
    `📦 <b>New Order</b>\n\n` +
    `👤 ${user.firstName} [<code>${uid}</code>]\n` +
    `🆔 <code>${oid}</code>\n` +
    `📌 ${data.svcName}\n` +
    `🔗 <code>${data.link}</code>\n` +
    `🔢 Qty: ${data.qty} | 💰 ₹${data.cost}\n` +
    `💳 Balance: ₹${user.balance.toFixed(2)}\n` +
    `📅 ${new Date().toLocaleString('en-IN')}`,
    {reply_markup:{inline_keyboard:[[{text:'🚀 Order Now',url:'https://t.me/SMM_PANEL_CHEEP_ROBOT'}]]}}
  );
}

// ──────────────────────────────────────────────
//  ADMIN FEATURES
// ──────────────────────────────────────────────
async function adminUsers(uid,db) {
  await send(uid,
    `👥 <b>Users Panel</b>\n\n👤 Total Users: ${Object.keys(db.users).length}\n🚫 Banned: ${Object.values(db.users).filter(u=>u.banned).length}\n\nEnter User ID, Username, or Name to search:`,
    {reply_markup:{keyboard:[['🔍 Search User','📊 All Users'],['❌ Cancel']],resize_keyboard:true}}
  );
  setState(uid,{step:'a_search_user',data:{}});
}
async function adminPayments(uid,db,C) {
  const pending=Object.values(db.payments).filter(p=>p.status==='pending');
  if (!pending.length) return send(uid,'💳 No pending payments.',ADMIN_KB);
  for (const p of pending.slice(0,5)) {
    const u=db.users[p.userId]||{};
    const userOrders=Object.values(db.orders).filter(o=>o.userId===p.userId);
    const userPayments=Object.values(db.payments).filter(pay=>pay.userId===p.userId);
    const approvedPays=userPayments.filter(pay=>pay.status==='approved');
    const rejectedPays=userPayments.filter(pay=>pay.status==='rejected');
    const completedOrds=userOrders.filter(o=>o.status==='completed').length;
    const totalSpent=userOrders.reduce((a,o)=>a+o.cost,0);
    const accountAge=u.joinedAt?Math.floor((Date.now()-u.joinedAt)/(1000*60*60*24)):0;
    const isNewUser=approvedPays.length===0;
    const riskEmoji=isNewUser?'🟡':approvedPays.length>=3?'🟢':'🔵';

    const txt=
      `💳 <b>Payment Request</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🆔 Payment ID: <code>${p.id}</code>\n` +
      `💰 Amount: <b>₹${p.amount}</b>\n` +
      `🔢 UTR: <code>${p.utr||'N/A'}</code>\n` +
      `🕐 Time: ${new Date(p.createdAt).toLocaleString('en-IN')}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>User Details</b>\n` +
      `🆔 ID: <code>${u.id||p.userId}</code>\n` +
      `👤 Name: ${u.firstName||'N/A'}\n` +
      `🏷 Username: @${u.username||'N/A'}\n` +
      `📱 <a href="tg://user?id=${p.userId}">Message User</a>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>Financial Info</b>\n` +
      `💵 Current Balance: ₹${(u.balance||0).toFixed(2)}\n` +
      `📤 Total Recharged: ₹${(u.totalRecharged||0).toFixed(2)}\n` +
      `📥 Total Spent: ₹${totalSpent.toFixed(2)}\n` +
      `🎁 Referral Earnings: ₹${(u.referralEarnings||0).toFixed(2)}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>History</b>\n` +
      `✅ Approved Payments: ${approvedPays.length}\n` +
      `❌ Rejected Payments: ${rejectedPays.length}\n` +
      `📦 Total Orders: ${userOrders.length}\n` +
      `✅ Completed Orders: ${completedOrds}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📅 Account Age: ${accountAge} days\n` +
      `👥 Referred By: ${u.referredBy?'✅ Yes':'❌ No (Direct)'}\n` +
      `🚫 Ban Status: ${u.banned?'🚫 Banned':'✅ Active'}\n` +
      `${riskEmoji} Risk: ${isNewUser?'🟡 New User':approvedPays.length>=3?'🟢 Trusted':'🔵 Regular'}`;

    await send(uid, txt, {reply_markup:{inline_keyboard:[
      [{text:'✅ Approve',callback_data:`pay_ok_${p.id}`},{text:'❌ Reject',callback_data:`pay_no_${p.id}`}],
      [{text:'💰 Custom Amount',callback_data:`pay_custom_${p.id}`}],
    ]}});
    if (p.screenshotFileId) await bot.sendPhoto(uid, p.screenshotFileId).catch(()=>{});
  }
}
async function adminOrders(uid,db,C) {
  const all=Object.values(db.orders).sort((a,b)=>b.createdAt-a.createdAt);
  if (!all.length) return send(uid,'📦 No orders.',ADMIN_KB);

  const pending=all.filter(o=>['pending','processing','inprogress'].includes((o.status||'').toLowerCase())).slice(0,15);
  const others=all.filter(o=>!['pending','processing','inprogress'].includes((o.status||'').toLowerCase())).slice(0,10);

  if (!pending.length)
    await send(uid,'✅ <b>No pending orders!</b> All caught up.');
  else {
    await send(uid,`⏳ <b>Pending Orders (${pending.length})</b>\n\n👇 Tap a button to update each order:`);
    for (const o of pending) {
      const displayId = (!o.isCustom && o.apiOrderId) ? o.apiOrderId : o.id;
      const txt=`${o.isCustom?'🔧':'🌐'} <b>Order ID:</b> <code>${displayId}</code>${(!o.isCustom&&o.apiOrderId)?`\n📋 Ref: <code>${o.id}</code>`:''}\n👤 <code>${o.userId}</code>\n📌 ${safeSlice(o.serviceName,40)}\n🔢 ${o.quantity} | ₹${o.cost} | ${timeAgo(o.createdAt)}`;
      await send(uid,txt,{reply_markup:{inline_keyboard:[[
        {text:'✅ Mark Complete',callback_data:`o_done_${o.id}`},
        {text:'❌ Cancel+Refund',callback_data:`o_cancel_${o.id}`},
      ],[
        {text:'🔄 Check API Status',callback_data:`o_check_${o.id}`},
      ]]}});
    }
  }

  if (others.length) {
    let txt='📜 <b>Recent History</b>\n\n';
    for (const o of others) {
      const displayId = (!o.isCustom && o.apiOrderId) ? o.apiOrderId : o.id;
      txt+=`${o.isCustom?'🔧':'🌐'} <code>${displayId}</code>\n📌 ${safeSlice(o.serviceName,35)}\n${statusEmoji(o.status)} ${o.status} | ₹${o.cost} | ${timeAgo(o.createdAt)}\n\n`;
    }
    await send(uid,txt,ADMIN_KB);
  } else {
    await send(uid,'━━━━━━━━━━━━━',ADMIN_KB);
  }
}
async function adminBroadcast(uid) {
  setState(uid,{step:'a_broadcast',data:{}});
  await send(uid,'📢 Enter your broadcast message:',CANCEL);
}
async function adminTickets(uid,db) {
  const open=Object.values(db.tickets).filter(t=>t.status!=='closed').slice(0,5);
  if (!open.length) return send(uid,'🎟 No open tickets.',ADMIN_KB);
  for (const t of open) {
    await send(uid,
      `🎟 <b>Support Ticket</b>\n\n🆔 <code>${t.id}</code>\n👤 User: <code>${t.userId}</code>\n📝 ${t.message}\n🔖 Status: ${statusEmoji(t.status)} ${t.status}\n📅 ${new Date(t.createdAt).toLocaleString()}`,
      {reply_markup:{inline_keyboard:[
        [{text:'✏️ Reply',callback_data:`tkt_reply_${t.id}`},{text:'🔴 Close',callback_data:`tkt_close_${t.id}`}],
      ]}}
    );
  }
}
async function adminLogs(uid,db) {
  let txt='📋 <b>Activity Logs</b>\n\n';
  for (const l of db.logs.slice(0,15))
    txt+=`• ${new Date(l.ts).toLocaleTimeString()} — ${l.type}${l.userId?' ['+l.userId+']':''}\n`;
  await send(uid,txt,ADMIN_KB);
}
async function adminStats(uid,db,C) {
  const users=Object.values(db.users),orders=Object.values(db.orders),payments=Object.values(db.payments);
  const rev=payments.filter(p=>p.status==='approved').reduce((a,p)=>a+(p.finalAmount||p.amount),0);
  const customSvcs=Object.values(db.customServices).filter(s=>s.active).length;
  const pinnedSvcs=Object.values(db.apiServices||{}).filter(s=>s.active).length;
  const pendingOrders=orders.filter(o=>['pending','processing','inprogress'].includes(o.status)).length;
  const staffCount=Object.keys(db.staff||{}).length;
  await send(uid,
    `📊 <b>Panel Statistics</b>\n\n👥 Total Users: ${users.length}\n💰 Total Revenue: ₹${rev.toFixed(2)}\n💳 Pending Payments: ${payments.filter(p=>p.status==='pending').length}\n⏳ Pending Orders: ${pendingOrders}\n📦 Total Orders: ${orders.length}\n✅ Completed: ${orders.filter(o=>o.status==='completed').length}\n❌ Cancelled: ${orders.filter(o=>['canceled','cancelled'].includes(o.status)).length}\n🔧 Custom Services: ${customSvcs}\n📌 Pinned API Services: ${pinnedSvcs}\n👨‍💼 Staff Members: ${staffCount}\n🌐 API URL: <code>${C.apiUrl}</code>\n📢 Force Channels: ${(C.forceChannels||[]).join(', ')||'❌ Not Set'}`,
    ADMIN_KB
  );
}
async function showChannelManager(uid, db, C) {
  const channels = (C.forceChannels||[]).filter(ch=>ch&&ch!=='0');
  let txt = `📢 <b>Force Join Channels</b>\n\n`;
  if (!channels.length) {
    txt += `❌ No channels have been set yet.\n\n`;
  } else {
    channels.forEach((ch,i) => { txt += `${i+1}. <code>${ch}</code>\n`; });
    txt += `\n<b>Total: ${channels.length} channel(s)</b>\n\n`;
  }
  txt += `➕ Add a new channel or ❌ remove one below:`;

  const btns = [];
  // Delete button for each channel
  channels.forEach(ch => {
    btns.push([{ text:`❌ Remove: ${ch}`, callback_data:`s_ch_del_${encodeURIComponent(ch)}` }]);
  });
  btns.push([{ text:'➕ Add New Channel', callback_data:'s_ch_add' }]);
  if (channels.length > 0) {
    btns.push([{ text:'🚫 Disable All Channels', callback_data:'s_ch_disable' }]);
  }
  btns.push([{ text:'🔙 Back to Settings', callback_data:'back_settings' }]);

  await send(uid, txt, { reply_markup:{ inline_keyboard: btns }});
}

async function adminSettings(uid,db,C) {
  await send(uid,
    `⚙️ <b>Settings</b>\n\n` +
    `🤖 Bot Version: <b>v${C.botVersion}</b>\n` +
    `🌐 API URL: <code>${C.apiUrl}</code>\n` +
    `🔑 API Key: <code>${C.apiKey.slice(0,16)}...</code>\n` +
    `🏦 UPI: <code>${C.upiId}</code>\n` +
    `👤 UPI Name: ${C.upiName}\n` +
    `📈 Margin: ${C.margin}%\n` +
    `💵 Min Recharge: ₹${C.minRecharge}\n` +
    `📢 Channels: ${(C.forceChannels||[]).join(', ')||'❌ Not Set'}\n` +
    `💱 USDT Rate: 1 USDT = ₹${C.cryptoRate}\n` +
    `📋 Logs Channel: ${C.logsChannel||'❌ Not set'}\n` +
    `🔧 Custom Only: ${C.useCustomOnly?'✅ ON':'❌ OFF'}\n` +
    `🚧 Maintenance Mode: ${C.maintenanceMode?'🔴 ON (bot paused for users)':'🟢 OFF (bot live)'}`,
    {reply_markup:{inline_keyboard:[
      [{text:`🤖 Version: v${C.botVersion}`, callback_data:'s_version'}],
      [{text:'🌐 API URL',callback_data:'s_apiurl'},{text:'🔑 API Key',callback_data:'s_apikey'}],
      [{text:'🏦 UPI ID',callback_data:'s_upi'},{text:'👤 UPI Name',callback_data:'s_upiname'}],
      [{text:'📈 Margin',callback_data:'s_margin'},{text:'💵 Min Recharge',callback_data:'s_minrecharge'}],
      [{text:'📢 Channel',callback_data:'s_channel'},{text:'💬 Welcome Msg',callback_data:'s_welcome'}],
      [{text:`💱 USDT Rate: ₹${C.cryptoRate}`,callback_data:'s_cryptorate'}],
      [{text:`📋 Logs Channel: ${C.logsChannel||'Not set'}`,callback_data:'s_logschannel'}],
      [{text:C.useCustomOnly?'🔧 Custom Only: ON ✅':'🔧 Custom Only: OFF ❌',callback_data:'s_toggle_custom'}],
      [{text:C.maintenanceMode?'🚧 Maintenance: ON 🔴 (tap to turn OFF)':'🚧 Maintenance: OFF 🟢 (tap to turn ON)',callback_data:'s_toggle_maintenance'}],
    ]}}
  );
}
async function adminServicesMenu(uid,db,C) {
  const customs=Object.values(db.customServices);
  const pinned=Object.values(db.apiServices||{});
  const activeCustom=customs.filter(s=>s.active).length;
  const activePinned=pinned.filter(s=>s.active).length;
  await send(uid,
    `🛠 <b>Services Management</b>\n\n📌 Pinned API Services: ${pinned.length} total (${activePinned} active)\n🔧 Custom Services: ${customs.length} total (${activeCustom} active)\n\n💡 <b>Browse API →</b> Select a category → Click a service → It gets added!\n🔧 <b>Custom Only mode:</b> ${C.useCustomOnly?'✅ ON':'❌ OFF'}`,
    {reply_markup:{inline_keyboard:[
      [{text:'🌐 Browse & Add API Services',callback_data:'asb_start'}],
      [{text:'🔢 Add Service by API ID',callback_data:'as_add_by_id'}],
      [{text:'📋 View/Manage Pinned Services',callback_data:'as_list'}],
      [{text:'➕ Add Custom Service',callback_data:'cs_add'}],
      [{text:'📋 View Custom Services',callback_data:'cs_list'}],
      [{text:'✏️ Edit Custom Service',callback_data:'cs_edit_menu'}],
      [{text:'🗑 Delete Custom Service',callback_data:'cs_delete_menu'}],
      [{text:'✏️ Edit API Service Name',callback_data:'as_edit_menu'}],
      [{text:'🔍 Test API Connection',callback_data:'cs_test_api'}],
      [{text:C.useCustomOnly?'🔧 Custom Only: ON ✅ (tap to disable)':'🔧 Custom Only: OFF ❌ (tap to enable)',callback_data:'s_toggle_custom'}],
    ]}}
  );
}

// Shows paginated service list for a category with Add/Remove buttons
async function showASBServicePage(uid, db, C, svcs, catName, catIdx, page, msgId) {
  const PAGE_SIZE = 8; // 8 services per page (fits in Telegram)
  const totalPages = Math.ceil(svcs.length / PAGE_SIZE);
  const slice = svcs.slice(page * PAGE_SIZE, (page+1) * PAGE_SIZE);
  const pinnedMap = db.apiServices || {};

  const btns = [];
  // Add All / Remove All at top
  const allAdded = svcs.every(s => !!pinnedMap[String(s.service)]);
  btns.push([
    {text: allAdded ? '❌ Remove ALL from this category' : '✅ Add ALL in this category',
     callback_data: allAdded ? `asb_remall_${catIdx}` : `asb_addall_${catIdx}`}
  ]);

  // Individual service rows
  for (const svc of slice) {
    const sid = String(svc.service);
    const isAdded = !!pinnedMap[sid];
    const userRate = addMargin(svc.rate, C.margin);
    btns.push([{
      text: `${isAdded ? '✅' : '➕'} ${safeSlice(svc.name,32)} | ₹${userRate}/1K`,
      callback_data: isAdded ? `asb_rem_${sid}` : `asb_add_${sid}`
    }]);
  }

  // Pagination nav
  const navRow = [];
  if (page > 0) navRow.push({text:`⬅️ Prev`, callback_data:`asb_svcp_${page-1}`});
  navRow.push({text:`${page+1}/${totalPages}`, callback_data:`asb_noop`});
  if (page < totalPages-1) navRow.push({text:`➡️ Next`, callback_data:`asb_svcp_${page+1}`});
  if (navRow.length > 1) btns.push(navRow);

  btns.push([{text:'🔙 Back to Categories', callback_data:`asb_start`}]);

  const addedCount = svcs.filter(s=>!!pinnedMap[String(s.service)]).length;
  const txt = `📁 <b>${catName}</b>\n\n📊 ${svcs.length} services | ✅ ${addedCount} added\n💡 ✅ = already added, ➕ = click to add\n📄 Page ${page+1}/${totalPages}:`;

  try {
    if (msgId) {
      await bot.editMessageText(txt, {
        chat_id: uid, message_id: msgId, parse_mode: 'HTML',
        reply_markup: {inline_keyboard: btns}
      });
    } else {
      await send(uid, txt, {reply_markup:{inline_keyboard:btns}});
    }
  } catch(e) {
    // editMessageText fails if message unchanged — that's fine
    if (!e.message?.includes('not modified')) {
      await send(uid, txt, {reply_markup:{inline_keyboard:btns}});
    }
  }
}
// Shows categories from API → admin selects → services list → click to add/remove
async function adminBrowseAPIStart(uid, db, C) {
  await send(uid, '⏳ Loading API services... Please wait.');
  const res = await smmAPI(C.apiUrl, C.apiKey, {action:'services'});
  if (!res.ok || !Array.isArray(res.data) || !res.data.length) {
    return send(uid,
      `❌ <b>API Error!</b>\n\nError: <code>${res.error||'Unknown'}</code>\n\n💡 Check Settings → API URL/Key\n🌐 URL: <code>${C.apiUrl}</code>`,
      ADMIN_KB
    );
  }
  // Cache all services in STATE
  const allSvcs = res.data;
  const cats = {};
  for (const s of allSvcs) {
    const c = s.category || 'Other';
    if (!cats[c]) cats[c] = [];
    cats[c].push(s);
  }
  const catKeys = Object.keys(cats);
  setState(uid, { ...getState(uid), asbAllSvcs: allSvcs, asbCats: cats, asbCatKeys: catKeys });

  // Show categories with pagination (10 per page)
  const PAGE = 0;
  const PAGE_SIZE = 10;
  const slice = catKeys.slice(PAGE * PAGE_SIZE, (PAGE+1) * PAGE_SIZE);
  const btns = slice.map((c, i) => [{
    text: `📁 ${c} (${cats[c].length})`,
    callback_data: `asb_cat_${PAGE * PAGE_SIZE + i}`
  }]);
  const navRow = [];
  if (catKeys.length > PAGE_SIZE) navRow.push({text:`➡️ Next Page (${Math.ceil(catKeys.length/PAGE_SIZE)} pages)`, callback_data:`asb_catp_1`});
  if (navRow.length) btns.push(navRow);
  btns.push([{text:'🔙 Back to Services Mgmt', callback_data:'asb_back'}]);

  await send(uid,
    `🌐 <b>Browse API Services</b>\n\n📊 Total: ${allSvcs.length} services | ${catKeys.length} categories\n\n📁 Select a category:`,
    {reply_markup:{inline_keyboard: btns}}
  );
}

// ──────────────────────────────────────────────
//  BACKUP & RESTORE
// ──────────────────────────────────────────────
async function adminBackupDB(uid, db) {
  try {
    await send(uid, '⏳ Creating backup...');
    const backupData = JSON.stringify(db, null, 2);
    const date = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    const time = new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}).replace(/:/g,'-').replace(' ','_');
    const filename = `nexus_backup_${date}_${time}.json`;

    // Write temp file
    const tmpPath = path.join('/tmp', filename);
    fs.writeFileSync(tmpPath, backupData);

    const userCount    = Object.keys(db.users    || {}).length;
    const orderCount   = Object.keys(db.orders   || {}).length;
    const paymentCount = Object.keys(db.payments || {}).length;
    const customCount  = Object.keys(db.customServices || {}).length;
    const pinnedCount  = Object.keys(db.apiServices    || {}).length;

    await bot.sendDocument(uid, tmpPath, {
      caption:
        `💾 <b>Database Backup</b>\n\n` +
        `📅 Date: ${new Date().toLocaleString('en-IN')}\n\n` +
        `👥 Users: ${userCount}\n` +
        `📦 Orders: ${orderCount}\n` +
        `💳 Payments: ${paymentCount}\n` +
        `🔧 Custom Services: ${customCount}\n` +
        `📌 Pinned API Services: ${pinnedCount}\n\n` +
        `✅ Keep this file safe!\n` +
        `♻️ To restore: tap <b>♻️ Restore DB</b> and send this file.`,
      parse_mode: 'HTML',
    });

    // Cleanup temp file
    try { fs.unlinkSync(tmpPath); } catch {}
  } catch(e) {
    console.error('Backup error:', e.message);
    await send(uid, `❌ Backup failed: ${e.message}`, ADMIN_KB);
  }
}

async function adminRestoreDB(uid) {
  setState(uid, { step: 'restore_db', data: {} });
  await send(uid,
    `♻️ <b>Restore Database</b>\n\n` +
    `📂 Send your previously downloaded backup JSON file.\n\n` +
    `⚠️ <b>Warning:</b> Restoring will <b>replace all current data!</b>\n\n` +
    `❌ Type "❌ Cancel" to abort.`,
    CANCEL
  );
}

// ──────────────────────────────────────────────
//  STAFF PANEL
// ──────────────────────────────────────────────
async function adminStaffPanel(uid,db) {
  const staffList=Object.entries(db.staff||{});
  let txt=`👨‍💼 <b>Staff Panel</b>\n\n`;
  txt+=`Total Staff: ${staffList.length}\n\n`;
  if (staffList.length) {
    for (const [sid,sm] of staffList)
      txt+=`👤 ${sm.name} [<code>${sid}</code>]\n🔐 Permissions: ${sm.perms.length===ALL_PERMS.length?'All':''+sm.perms.join(', ')}\n📅 Added: ${new Date(sm.addedAt).toLocaleDateString()}\n\n`;
  } else {
    txt+=`No staff members yet. Add one below!\n\n`;
  }
  const btns=[
    [{text:'➕ Add Staff Member',callback_data:'staff_add'}],
  ];
  if (staffList.length) {
    btns.push([{text:'✏️ Edit Staff Permissions',callback_data:'staff_edit_menu'}]);
    btns.push([{text:'🗑 Remove Staff Member',callback_data:'staff_remove_menu'}]);
  }
  await send(uid,txt,{reply_markup:{inline_keyboard:btns}});
}

// ──────────────────────────────────────────────
//  PAYMENT APPROVE/REJECT
// ──────────────────────────────────────────────
async function approvePayment(pid,customAmt,adminUid) {
  const db=loadDB(),pay=db.payments[pid];
  if (!pay) return send(adminUid,'❌ Payment not found.');
  if (pay.status!=='pending') return send(adminUid,'⚠️ Already processed.');
  const C=cfg(db);
  const amt=customAmt||pay.amount;
  pay.status='approved'; pay.approvedAt=Date.now(); pay.finalAmount=amt;
  const user=getUser(db,pay.userId); user.balance+=amt; user.totalRecharged+=amt;
  if (user.referredBy && db.users[user.referredBy]) {
    const ref=db.users[user.referredBy];
    const comm=parseFloat((amt*C.refPct/100).toFixed(2));
    ref.balance+=comm; ref.referralEarnings+=comm;
    await send(ref.id,`🎁 You earned ₹${comm} referral commission from ${user.firstName}'s recharge!`);
  }
  log(db,{type:'pay_approved',admin:adminUid,paymentId:pid,amount:amt,userId:pay.userId});
  saveDB(db);
  await send(adminUid,`✅ Payment ${pid} approved! ₹${amt} added.`,ADMIN_KB);
  await send(pay.userId,`✅ <b>Payment Approved!</b>\n\n🆔 ${pid}\n💰 ₹${amt} added to your wallet\n💳 Balance: ₹${user.balance.toFixed(2)}\n\nThank you! 🙏`);
}
async function rejectPayment(pid,adminUid) {
  const db=loadDB(),pay=db.payments[pid];
  if (!pay) return send(adminUid,'❌ Payment not found.');
  if (pay.status!=='pending') return send(adminUid,'⚠️ Already processed.');
  pay.status='rejected'; pay.rejectedAt=Date.now();
  log(db,{type:'pay_rejected',admin:adminUid,paymentId:pid}); saveDB(db);
  await send(adminUid,`❌ Payment ${pid} rejected.`,ADMIN_KB);
  await send(pay.userId,`❌ <b>Payment Rejected!</b>\n\n🆔 ${pid}\n💰 ₹${pay.amount}\n\nPlease contact Support for assistance.`);
}

// ──────────────────────────────────────────────
//  CALLBACK QUERY
// ──────────────────────────────────────────────
bot.on('callback_query', async (q) => {
  const uid=q.from.id, data=q.data;
  console.log(`[CLICK] uid=${uid} | data=${data} | ${new Date().toLocaleTimeString('en-IN')}`);
  // Answer callback immediately to prevent "loading" spinner
  await bot.answerCallbackQuery(q.id).catch(()=>{});
  try {
  const db=loadDB(); const C=cfg(db);

  // ── Maintenance Mode — block regular users, admin/staff bypass ──
  if (C.maintenanceMode && uid!==DEFAULTS.ADMIN && !isStaff(db,uid)) {
    return send(uid,
      C.maintenanceMsg ||
      '🚧 <b>Bot is under maintenance!</b>\n\nWe\'re fixing some things right now. Please check back in a little while.\n\n🙏 Sorry for the inconvenience.'
    );
  }

  if (data==='check_join') {
    const db2=loadDB(); const C2=cfg(db2);
    const channels=(C2.forceChannels||[]).filter(ch=>ch&&ch!=='0');
    let notJoinedCh=null;
    for (const ch of channels) {
      const joined=await isChannelMember(bot,uid,ch);
      if (!joined) { notJoinedCh=ch; break; }
    }
    if (!notJoinedCh) {
      // All channels joined
      const user=getUser(db2,uid);
      user.username  = q.from.username  || user.username;
      user.firstName = q.from.first_name || user.firstName;
      saveDB(db2);
      try { await bot.deleteMessage(uid, q.message.message_id); } catch{}
      return send(uid,
        `✅ <b>Verified Successfully!</b>\n\n🎉 Welcome, <b>${user.firstName}</b>!\n\nYou now have full access to NEXUS PANEL. 🚀\n\n👇 Use the menu below to get started:`,
        MAIN
      );
    }
    // Still not joined a channel
    const link = notJoinedCh.startsWith('@') ? `https://t.me/${notJoinedCh.slice(1)}` : notJoinedCh;
    try {
      await bot.editMessageText(
        `❌ <b>You haven't joined the channel yet!</b>\n\n⚠️ Please join <b>${notJoinedCh}</b> first, then tap the button below.\n\nYou cannot use the bot without joining.`,
        { chat_id:uid, message_id:q.message.message_id, parse_mode:'HTML',
          reply_markup:{ inline_keyboard:[
            [{ text:'📢 Join Channel Now', url:link }],
            [{ text:'✅ I Have Joined', callback_data:'check_join' }],
          ]}
        }
      );
    } catch{}
    return;
  }

  // Gateway payment status check
  if (data.startsWith('gw_check_')) {
    const pid = data.slice(9);
    const pay = db.payments[pid];
    if (!pay) return send(uid,'❌ Payment record not found.');
    if (pay.status === 'approved') return send(uid,`✅ <b>Already Credited!</b>\n\n💰 ₹${pay.amount} is already in your wallet.`);

    // ── Expiry check ──
    if (pay.expiresAt && Date.now() > pay.expiresAt) {
      pay.status = 'expired';
      saveDB(db);
      try { await bot.deleteMessage(uid, q.message.message_id); } catch{}
      return send(uid,
        `❌ <b>Payment Failed!</b>\n\n` +
        `💰 Amount: ₹${pay.amount}\n` +
        `🆔 Order ID: <code>${pid}</code>\n\n` +
        `⏰ QR code has expired and no payment was received.\n\n` +
        `Please try again by making a new recharge.`,
        {reply_markup:{inline_keyboard:[
          [{text:'💰 Try Again', callback_data:'wallet_add'}],
          [{text:'🎧 Contact Support', callback_data:'open_support'}],
        ]}}
      );
    }

    await send(uid,'⏳ Verifying your payment, please wait...');
    const checkId = pay.gwOrderId || pay.txnId;
    const chk = await checkGatewayOrder(checkId, pay.amount);

    // ── Payment confirmed ──
    if (chk.ok && chk.isPaid) {
      pay.status='approved'; pay.approvedAt=Date.now(); pay.finalAmount=pay.amount;
      const user2=getUser(db,pay.userId); user2.balance+=pay.amount; user2.totalRecharged+=pay.amount;
      if (user2.referredBy && db.users[user2.referredBy]) {
        const ref=db.users[user2.referredBy];
        const comm=parseFloat((pay.amount*C.refPct/100).toFixed(2));
        ref.balance+=comm; ref.referralEarnings+=comm;
        await send(ref.id,`🎁 You earned ₹${comm} referral commission from ${user2.firstName}'s recharge!`);
      }
      log(db,{type:'payment_approved',paymentId:pid,amount:pay.amount,userId:pay.userId});
      saveDB(db);
      // ── Delete the QR code message ──
      try { await bot.deleteMessage(uid, q.message.message_id); } catch{}
      // ── Admin notification with full details ──
      await adm(
        `💰 <b>New Deposit Received!</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>User:</b> ${user2.firstName} (@${user2.username||'N/A'})\n` +
        `🆔 <b>User ID:</b> <code>${uid}</code>\n` +
        `📱 <a href="tg://user?id=${uid}">Message User</a>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 <b>Order ID:</b> <code>${pid}</code>\n` +
        `💵 <b>Amount:</b> ₹${pay.amount}\n` +
        `💳 <b>New Balance:</b> ₹${user2.balance.toFixed(2)}\n` +
        `📤 <b>Total Recharged:</b> ₹${user2.totalRecharged.toFixed(2)}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📅 <b>Time:</b> ${new Date().toLocaleString('en-IN')}\n` +
        `🔖 <b>Method:</b> UPI Auto-Pay (Gateway)`
      );
      await sendLog(
        `💰 <b>New Deposit</b>\n\n` +
        `👤 ${user2.firstName} (@${user2.username||'N/A'}) [<code>${pay.userId}</code>]\n` +
        `🆔 <code>${pid}</code>\n💵 ₹${pay.amount}\n💳 Balance: ₹${user2.balance.toFixed(2)}\n` +
        `🔖 Method: UPI Auto-Pay\n` +
        `📅 ${new Date().toLocaleString('en-IN')}`
      );
      return send(uid,
        `✅ <b>Payment Successful!</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 Order ID: <code>${pid}</code>\n` +
        `💰 Amount Paid: <b>₹${pay.amount}</b>\n` +
        `💳 New Balance: <b>₹${user2.balance.toFixed(2)}</b>\n` +
        `📅 Time: ${new Date().toLocaleString('en-IN')}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🙏 Thank you for recharging!\n` +
        `You can now place orders from the menu below.`,
        MAIN
      );
    }

    // ── No payment received — delete QR and show Failed ──
    try { await bot.deleteMessage(uid, q.message.message_id); } catch{}
    return send(uid,
      `❌ <b>Payment Failed!</b>\n\n` +
      `💰 Amount: ₹${pay.amount}\n` +
      `🆔 Order ID: <code>${pid}</code>\n\n` +
      `⚠️ No payment was received for this order.\n` +
      `Please complete the payment first, then tap Check Payment.\n\n` +
      `If you already paid, please contact Support.`,
      {reply_markup:{inline_keyboard:[
        [{text:'💰 Try Again', callback_data:'wallet_add'}],
        [{text:'🎧 Contact Support', callback_data:'open_support'}],
      ]}}
    );
  }

  // New QR generate (only when user explicitly asks)
  if (data.startsWith('gw_newqr_') ) {
    const pid = data.slice(9);
    const db2 = loadDB();
    const pay = db2.payments[pid];
    if (!pay) return send(uid,'❌ Payment record not found.');
    if (pay.status === 'approved') return send(uid,'✅ This payment has already been approved!');

    // Expire old
    db2.payments[pid].status = 'expired';
    db2.payments[pid].expiresAt = Date.now() - 1;

    const newPid = 'GPAY' + genId(8);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    db2.payments[newPid] = {
      id: newPid, userId: String(uid), amount: pay.amount,
      gwOrderId: newPid, txnId: newPid,
      status: 'pending', type: 'gateway', retryCount: 0,
      createdAt: Date.now(), expiresAt,
    };
    getUser(db2, uid).paymentHistory.push(newPid);
    saveDB(db2);

    const qrImageUrl = gatewayQrImageUrl(pay.amount, newPid);
    const expireStr = new Date(expiresAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});

    try {
      await bot.sendPhoto(uid, qrImageUrl, {
        caption:
          `🆕 <b>New QR Code — Complete Your Payment</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 Amount: <b>₹${pay.amount}</b>\n` +
          `🆔 Order ID: <code>${newPid}</code>\n` +
          `⏰ Expires: <b>${expireStr}</b> (valid for 10 minutes)\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📲 Scan the QR and complete payment\n` +
          `✅ Tap <b>Check Payment Status</b> after paying`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [
          [{ text: '✅ Check Payment Status', callback_data: `gw_check_${newPid}` }],
        ]},
      });
    } catch {
      await send(uid,
        `🆕 New QR Code:\n💰 ₹${pay.amount}\n🆔 <code>${newPid}</code>\n⏰ Valid until ${expireStr}`,
        {reply_markup:{inline_keyboard:[[{text:'✅ Check Payment Status',callback_data:`gw_check_${newPid}`}]]}}
      );
    }
    return;
  }

  if (data==='wallet_add')     { setState(uid,{step:'payment_amount_gw',data:{}}); return send(uid,`⚡ UPI Auto-Pay — Enter amount (min ₹${C.minRecharge}):`,CANCEL); }
  if (data==='open_support')   { return supportMenu(uid); }
  if (data==='wallet_manual')  { setState(uid,{step:'payment_amount',data:{}}); return send(uid,`🏦 Manual UPI — Enter amount (min ₹${C.minRecharge}):`,CANCEL); }
  if (data==='wallet_crypto')  {
    const trc = DEFAULTS.CRYPTO_TRC20;
    const rate = DEFAULTS.CRYPTO_RATE;
    return send(uid,
      `₿ <b>Crypto Deposit — USDT TRC-20</b>\n\n` +
      `💱 Rate: <b>1 USDT = ₹${rate}</b>\n\n` +
      `🔴 <b>TRON Network (TRC-20) Address:</b>\n` +
      `<code>${trc}</code>\n\n` +
      `⚡ <b>Automatic</b> — Send payment and your wallet gets credited in 1-2 minutes!\n` +
      `📌 Min: $1 USDT\n` +
      `⚠️ Only use TRC-20 network!\n\n` +
      `Or submit your TX Hash below 👇`,
      {reply_markup:{inline_keyboard:[
        [{text:'📤 Submit TX Hash', callback_data:'crypto_submit'}],
        [{text:'🔙 Back', callback_data:'wallet_back'}],
      ]}}
    );
  }
  if (data==='crypto_submit') { setState(uid,{step:'crypto_txhash',data:{}}); return send(uid,'🔗 Please send your Transaction Hash (TX ID):',CANCEL); }
  if (data==='wallet_back')   { return walletMenu(uid,db,getUser(db,uid),C); }
  if (data==='wallet_hist') {
    const u=getUser(db,uid);
    if (!u.paymentHistory.length) return send(uid,'💳 No payment history found.');
    let txt='💳 <b>Payment History</b>\n\n';
    for (const pid of u.paymentHistory.slice(-10).reverse()) {
      const p=db.payments[pid]; if(!p) continue;
      txt+=`🆔 <code>${p.id}</code> ₹${p.finalAmount||p.amount} ${statusEmoji(p.status)} ${p.status}\n📅 ${new Date(p.createdAt).toLocaleString()}\n\n`;
    }
    return send(uid,txt);
  }

  if (data==='mystats_refresh') {
    return myStats(uid,db,getUser(db,uid),C,q.message.message_id);
  }

  // ── REFILL: User requests refill — INSTANT, self-service (like the provider website) ──
  if (data.startsWith('req_refill_')) {
    const oid=data.slice(11), o=db.orders[oid];
    if (!o) return send(uid,'❌ Order not found.');
    if (String(o.userId)!==String(uid)) return; // not their order
    if (o.isCustom) return send(uid,'ℹ️ Refill not available for this order type.');
    if (o.refillId) return send(uid,'✅ Refill already submitted for this order.');
    if (o.status!=='completed') return send(uid,'ℹ️ Refill is only available for completed orders.');

    await send(uid,'⏳ Requesting refill from provider...');
    try {
      const res=await smmAPI(C.apiUrl,C.apiKey,{action:'refill',order:o.apiOrderId});
      if (res.ok && res.data && (res.data.refill!=null || res.data[0]?.refill!=null)) {
        const refillId = res.data.refill ?? res.data[0]?.refill;
        o.refillId=refillId; o.refillApprovedAt=Date.now(); saveDB(db);
        await send(uid,`✅ <b>Refill Submitted!</b>\n\n🆔 Order: <code>${o.apiOrderId||oid}</code>\n🔁 Refill ID: <code>${refillId}</code>\n\nIt may take some time for the provider to process this.`,MAIN);
        await sendLog(`🔁 <b>Refill Requested</b>\n\n👤 ${user.firstName||''} [<code>${uid}</code>]\n🆔 Order: <code>${o.apiOrderId||oid}</code>\n🔁 Refill ID: <code>${refillId}</code>\n📌 ${safeSlice(o.serviceName,40)}`);
      } else {
        await send(uid,`❌ <b>Refill Failed</b>\n\n🆔 <code>${o.apiOrderId||oid}</code>\nReason: ${res.error||'Provider does not support refill for this order.'}\n\n💡 Contact support if you think this is wrong.`,MAIN);
      }
    } catch(e) {
      await send(uid,`❌ Refill error: ${e.message}\n\nPlease try again or contact Support.`,MAIN);
    }
    return;
  }


  if (data==='orders_refresh') {
    const u=getUser(db,uid);
    const apiOrds=u.orderHistory.map(oid=>db.orders[oid]).filter(o=>o&&!o.isCustom&&['pending','inprogress','processing'].includes(o.status));
    if (apiOrds.length) {
      const res=await smmAPI(C.apiUrl,C.apiKey,{action:'status',orders:apiOrds.map(o=>o.apiOrderId).join(',')});
      if (res.ok&&typeof res.data==='object') {
        for (const o of apiOrds) { const s=res.data[o.apiOrderId]; if(s?.status){o.status=s.status;o.updatedAt=Date.now();} }
        saveDB(db);
      }
    }
    return myOrders(uid,loadDB(),getUser(loadDB(),uid),C,q.message.message_id);
  }

  // ── New Order retry / home / noop / pagination ──
  if (data==='new_order_retry') {
    _svcCache=null; _svcCacheTs=0; // force refresh
    return newOrder(uid,db,C,0,q.message.message_id);
  }
  if (data==='go_home') { clearState(uid); return send(uid,'🏠 Main Menu',MAIN); }
  if (data==='noop') return; // page indicator button, do nothing

  if (data.startsWith('ocat_page_')) {
    const pg=parseInt(data.slice(10),10)||0;
    return newOrder(uid,db,C,pg,q.message.message_id);
  }

  if (data.startsWith('ocat_')) {
    if (data==='ocat_back') return newOrder(uid,db,C);
    const idx=parseInt(data.slice(5),10);
    try {
      const st=getState(uid);
      let svcsForCat=null;
      let catName=null;

      // First try: use STATE (fast, no API call)
      if (st.catMap && st.catMap[idx] && st.catData && st.catData[idx] && st.catData[idx].length) {
        catName=st.catMap[idx];
        svcsForCat=st.catData[idx].slice(0,20);
      }

      // Fallback: re-fetch from API
      if (!svcsForCat || !svcsForCat.length) {
        await send(uid,'⏳ Loading services, please wait...');
        const allSvcs=await getAllServices(db,C);
        if (!allSvcs.length) return send(uid,'❌ Could not load services. Please check API settings or try again.',MAIN);
        const catsObj={};
        for (const s of allSvcs) { const c=s.category||'Other'; if(!catsObj[c]) catsObj[c]=[]; catsObj[c].push(s); }
        const catKeysArr=Object.keys(catsObj);
        catName=catKeysArr[idx]||null;
        if (!catName) return newOrder(uid,db,C);
        svcsForCat=(catsObj[catName]||[]).slice(0,20);
        const catMapR={}; catKeysArr.forEach((c,i)=>catMapR[i]=c);
        const catDataR={}; catKeysArr.forEach((c,i)=>{ catDataR[i]=catsObj[c]; });
        setState(uid,{...st, catMap:catMapR, catData:catDataR});
      }

      if (!svcsForCat || !svcsForCat.length) return send(uid,'❌ No services found in this category. Please tap 🔙 Back and try again.',MAIN);

      const svcMap={};
      svcsForCat.forEach((s,i)=>svcMap[i]=s);
      setState(uid,{...getState(uid), svcMap, lastCatIdx:idx, lastCatName:catName});
      const btns=svcsForCat.map((s,i)=>[{text:`${safeSlice(s.name,40)} — ₹${addMargin(s.rate,C.margin)}/1K`,callback_data:`osvc_${i}`}]);
      btns.push([{text:'🔙 Back to Categories',callback_data:'ocat_back'}]);
      return send(uid,`📁 <b>${catName}</b>\n\n🔢 ${svcsForCat.length} services available:`,{reply_markup:{inline_keyboard:btns}});
    } catch(e) {
      console.error('[ocat_ error]', e.message);
      return send(uid,`❌ Failed to load category. Please tap 🛒 New Order and try again.\n<code>${e.message}</code>`,MAIN);
    }
  }

  if (data.startsWith('osvc_')) {
    const idx=parseInt(data.slice(5),10);
    try {
      const st=getState(uid);
      let svc=(st.svcMap&&st.svcMap[idx])||null;
      // If STATE lost (bot restart), re-fetch and rebuild svcMap
      if (!svc) {
        await send(uid,'⏳ Loading service...');
        const allSvcs2=await getAllServices(db,C);
        if (!allSvcs2.length) return send(uid,'❌ Could not load services. Please check API settings.',MAIN);
        const cats2={};
        for (const s of allSvcs2) { const c=s.category||'Other'; if(!cats2[c]) cats2[c]=[]; cats2[c].push(s); }
        const lastCat = st.lastCatName ||
          (st.lastCatIdx!=null ? Object.keys(cats2)[st.lastCatIdx] : null);
        if (lastCat && cats2[lastCat]) {
          const svcs2=cats2[lastCat].slice(0,20);
          svc=svcs2[idx]||null;
          const svcMap2={};
          svcs2.forEach((s,i)=>svcMap2[i]=s);
          setState(uid,{...getState(uid), svcMap:svcMap2});
        }
      }
      if (!svc) return send(uid,'⚠️ Service not found. Please tap 🛒 New Order and select again.',MAIN);
      const rate=addMargin(svc.rate,C.margin);
      const svcText = `${svc.category||''} ${svc.name||''}`.toLowerCase();
      const isTelegram = /telegram/.test(svcText);
      const needsPrivate = isTelegram && /private|invite/.test(svcText);
      const needsPublic  = isTelegram && !needsPrivate && /public/.test(svcText);
      const linkReq = needsPrivate ? 'private' : (needsPublic ? 'public' : (isTelegram ? 'unknown' : null));
      setState(uid,{...getState(uid), step:'order_link', data:{serviceId:String(svc.service),svcName:svc.name,rate,min:svc.min,max:svc.max,linkReq}});

      // ── Telegram link type warning — wrong type delivers nothing, no refund ──
      let telegramWarning = '';
      if (linkReq==='private') telegramWarning = `\n\n⚠️ <b>Note:</b> This service needs your <b>PRIVATE invite link</b> (e.g. <code>t.me/+AbCdEf...</code>). Public links won't deliver, and money can't be refunded once placed.`;
      else if (linkReq==='public') telegramWarning = `\n\n⚠️ <b>Note:</b> This service needs a <b>PUBLIC</b> link (not a private invite link). Private links won't deliver, and money can't be refunded once placed.`;
      else if (linkReq==='unknown') telegramWarning = `\n\n⚠️ <b>Note:</b> Check the service name above for PUBLIC or PRIVATE. Sending the wrong type means no delivery and no refund.`;

      return send(uid,
        `✅ <b>${svc.name}</b>\n\n` +
        `💵 Rate: ₹${rate}/1000\n` +
        `📊 Min: ${svc.min} | Max: ${svc.max}` +
        `${svc.delivery?'\n⏱ Delivery: '+svc.delivery:''}` +
        telegramWarning +
        `\n\n🔗 Send your link (e.g. https://instagram.com/yourpage):`,
        CANCEL
      );
    } catch(e) {
      console.error('[osvc_ error]', e.message);
      return send(uid,`❌ Failed to load service. Please tap 🛒 New Order and try again.\n<code>${e.message}</code>`,MAIN);
    }
  }

  if (data.startsWith('pay_ok_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.APPROVE_PAYMENTS)) return;
    return approvePayment(data.slice(7),null,uid);
  }
  if (data.startsWith('pay_no_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.APPROVE_PAYMENTS)) return;
    return rejectPayment(data.slice(7),uid);
  }
  if (data.startsWith('pay_custom_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.APPROVE_PAYMENTS)) return;
    setState(uid,{step:'a_custom_pay',data:{pid:data.slice(11)}});
    return send(uid,`💰 Enter custom amount for <code>${data.slice(11)}</code>:`,CANCEL);
  }

  if (data.startsWith('o_check_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.MANAGE_ORDERS)) return;
    const oid=data.slice(8),o=db.orders[oid]; if(!o) return send(uid,'❌ Order not found.');
    if (o.isCustom) return send(uid,'ℹ️ This is a custom (manual) order — no external API to check.');
    try {
      const res=await smmAPI(C.apiUrl,C.apiKey,{action:'status',order:o.apiOrderId});
      if (res.ok && res.data) {
        const s=res.data;
        if (s.status) { o.status=s.status.toLowerCase(); o.updatedAt=Date.now(); saveDB(db); }
        return send(uid,`📊 <b>API Status — ${oid}</b>\n\n🔖 Status: ${s.status||'unknown'}\n✅ Start Count: ${s.start_count??'N/A'}\n📈 Remains: ${s.remains??'N/A'}\n\n${s.status?'✅ Status updated in DB.':''}`,
          {reply_markup:{inline_keyboard:[[{text:'✅ Mark Complete',callback_data:`o_done_${oid}`},{text:'❌ Cancel+Refund',callback_data:`o_cancel_${oid}`}]]}});
      }
      return send(uid,`❌ Could not fetch status: ${res.error||'Unknown error'}`);
    } catch(e) {
      return send(uid,`❌ Error checking status: ${e.message}`);
    }
  }

  if (data.startsWith('o_done_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.MANAGE_ORDERS)) return;
    const oid=data.slice(7),o=db.orders[oid]; if(!o) return send(uid,'❌ Order not found.');
    o.status='completed'; o.updatedAt=Date.now(); saveDB(db);
    const displayId=(!o.isCustom&&o.apiOrderId)?o.apiOrderId:o.id;
    await send(uid,`✅ Order ${displayId} marked as completed.`,isStaff(db,uid)?STAFF_KB:ADMIN_KB);
    await send(o.userId,`✅ <b>Order Completed!</b>\n\n🆔 Order ID: <code>${displayId}</code>\n📌 ${o.serviceName}\n🔢 Quantity: ${o.quantity}\n\n✅ Your order has been successfully delivered!`);
    return;
  }
  if (data.startsWith('o_cancel_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.MANAGE_ORDERS)) return;
    const oid=data.slice(9),o=db.orders[oid]; if(!o) return send(uid,'❌ Order not found.');
    if(['canceled','cancelled','completed'].includes(o.status)) return send(uid,'⚠️ Already processed.');
    o.status='cancelled'; o.updatedAt=Date.now();
    const u=getUser(db,o.userId); u.balance+=o.cost; u.totalSpent=Math.max(0,u.totalSpent-o.cost);
    log(db,{type:'refund',orderId:o.id,userId:o.userId,amount:o.cost}); saveDB(db);
    const displayId=(!o.isCustom&&o.apiOrderId)?o.apiOrderId:o.id;
    await send(uid,`✅ Order ${displayId} cancelled and refunded.`,isStaff(db,uid)?STAFF_KB:ADMIN_KB);
    await send(o.userId,`❌ <b>Order Cancelled!</b>\n\n🆔 Order ID: <code>${displayId}</code>\n💰 ₹${o.cost} has been refunded to your wallet!\n💳 New Balance: ₹${u.balance.toFixed(2)}`);
    return;
  }

  // ── CRYPTO DEPOSIT APPROVE/REJECT ──
  if (data.startsWith('crypto_approve_')) {
    if (uid !== DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.MANAGE_PAYMENTS)) return;
    const pid = data.slice(15);
    const pay = db.payments[pid];
    if (!pay) return send(uid,'❌ Payment not found.');
    if (pay.status === 'approved') return send(uid,'⚠️ This payment has already been approved.');
    setState(uid,{step:'crypto_amt',data:{pid}});
    return send(uid,`💵 Enter amount to credit (TX: <code>${pay.txHash}</code>):`,CANCEL);
  }
  if (data.startsWith('crypto_reject_')) {
    if (uid !== DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.MANAGE_PAYMENTS)) return;
    const pid = data.slice(14);
    const pay = db.payments[pid];
    if (!pay) return send(uid,'❌ Payment not found.');
    pay.status = 'rejected'; saveDB(db);
    await send(pay.userId,`❌ <b>Crypto Deposit Rejected</b>\n\n🆔 <code>${pid}</code>\n\nPlease contact Support if you need assistance.`);
    return send(uid,'✅ Crypto deposit rejected successfully.',ADMIN_KB);
  }

  if (data.startsWith('tkt_reply_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.REPLY_TICKETS)) return;
    setState(uid,{step:'a_tkt_reply',data:{tid:data.slice(10)}});
    return send(uid,`✏️ Enter reply for ticket <code>${data.slice(10)}</code>:`,CANCEL);
  }

  if (data.startsWith('tkt_close_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.REPLY_TICKETS)) return;
    const tid=data.slice(10), tkt=db.tickets[tid];
    if(!tkt) return send(uid,'❌ Ticket not found.',isStaff(db,uid)?STAFF_KB:ADMIN_KB);
    if(tkt.status==='closed') return send(uid,'⚠️ Ticket is already closed.',isStaff(db,uid)?STAFF_KB:ADMIN_KB);
    tkt.status='closed'; tkt.closedAt=Date.now();
    log(db,{type:'ticket_closed',admin:uid,ticketId:tid}); saveDB(db);
    await send(uid,`🔴 <b>Ticket Closed!</b>\n\n🆔 <code>${tid}</code>`,isStaff(db,uid)?STAFF_KB:ADMIN_KB);
    await send(tkt.userId,`🔴 <b>Support Ticket Closed</b>\n\n🆔 <code>${tid}</code>\n\nYour issue has been resolved.\nIf you need further help, please open a new ticket. 🙏`);
    return;
  }

  if (data.startsWith('a_add_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.MANAGE_USERS)) return;
    setState(uid,{step:'a_add_bal',data:{uid:data.slice(6)}});
    return send(uid,'💰 Enter amount to add:',CANCEL);
  }
  if (data.startsWith('a_rem_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.MANAGE_USERS)) return;
    setState(uid,{step:'a_rem_bal',data:{uid:data.slice(6)}});
    return send(uid,'💰 Enter amount to remove:',CANCEL);
  }
  if (data.startsWith('a_ban_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.MANAGE_USERS)) return;
    const tgt=db.users[data.slice(6)]; if(!tgt) return send(uid,'❌ User not found.');
    tgt.banned=!tgt.banned; log(db,{type:tgt.banned?'ban':'unban',admin:uid,target:data.slice(6)}); saveDB(db);
    return send(uid,`${tgt.banned?'🚫 Banned':'✅ Unbanned'}: ${data.slice(6)}`,isStaff(db,uid)?STAFF_KB:ADMIN_KB);
  }
  if (data.startsWith('a_view_uid_')) {
    if(uid!==DEFAULTS.ADMIN && !hasPerm(db,uid,STAFF_PERMS.VIEW_USERS)) return;
    const tgt=db.users[data.slice(11)]; if(!tgt) return send(uid,'❌ User not found.',isStaff(db,uid)?STAFF_KB:ADMIN_KB);
    const canManage=uid===DEFAULTS.ADMIN||hasPerm(db,uid,STAFF_PERMS.MANAGE_USERS);

    const userOrders=Object.values(db.orders).filter(o=>o.userId===tgt.id);
    const userPayments=Object.values(db.payments).filter(p=>p.userId===tgt.id);
    const approvedPays=userPayments.filter(p=>p.status==='approved');
    const rejectedPays=userPayments.filter(p=>p.status==='rejected');
    const pendingPays=userPayments.filter(p=>p.status==='pending');
    const completedOrds=userOrders.filter(o=>o.status==='completed').length;
    const cancelledOrds=userOrders.filter(o=>['canceled','cancelled'].includes(o.status)).length;
    const pendingOrds=userOrders.filter(o=>['pending','processing','inprogress'].includes(o.status)).length;
    const accountAge=tgt.joinedAt?Math.floor((Date.now()-tgt.joinedAt)/(1000*60*60*24)):0;
    const isNewUser=approvedPays.length===0;
    const riskEmoji=isNewUser?'🟡':approvedPays.length>=3?'🟢':'🔵';
    const lastOrder=userOrders.sort((a,b)=>b.createdAt-a.createdAt)[0];
    const lastPay=approvedPays.sort((a,b)=>b.approvedAt-a.approvedAt)[0];

    const txt=
      `👤 <b>User Details</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🆔 ID: <code>${tgt.id}</code>\n` +
      `👤 Name: ${tgt.firstName||'N/A'}\n` +
      `🏷 Username: @${tgt.username||'N/A'}\n` +
      `📱 <a href="tg://user?id=${tgt.id}">Message User</a>\n` +
      `🚫 Status: ${tgt.banned?'🚫 Banned':'✅ Active'}\n` +
      `📅 Joined: ${new Date(tgt.joinedAt).toLocaleDateString('en-IN')} (${accountAge} days ago)\n` +
      `${riskEmoji} Risk: ${isNewUser?'🟡 New User':approvedPays.length>=3?'🟢 Trusted':'🔵 Regular'}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>Financial Info</b>\n` +
      `💵 Balance: ₹${tgt.balance.toFixed(2)}\n` +
      `📤 Total Recharged: ₹${tgt.totalRecharged.toFixed(2)}\n` +
      `📥 Total Spent: ₹${tgt.totalSpent.toFixed(2)}\n` +
      `🎁 Referral Earnings: ₹${tgt.referralEarnings.toFixed(2)}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>Payment History</b>\n` +
      `✅ Approved: ${approvedPays.length}\n` +
      `❌ Rejected: ${rejectedPays.length}\n` +
      `⏳ Pending: ${pendingPays.length}\n` +
      `🕐 Last Recharge: ${lastPay?new Date(lastPay.approvedAt).toLocaleDateString('en-IN'):'Never'}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Order History</b>\n` +
      `📦 Total: ${userOrders.length}\n` +
      `✅ Completed: ${completedOrds}\n` +
      `❌ Cancelled: ${cancelledOrds}\n` +
      `⏳ Active: ${pendingOrds}\n` +
      `🕐 Last Order: ${lastOrder?timeAgo(lastOrder.createdAt):'Never'}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👥 Referred By: ${tgt.referredBy?`<code>${tgt.referredBy}</code>`:'Direct Join'}\n` +
      `🔗 Referral Code: <code>${tgt.referralCode||'N/A'}</code>`;

    const btns=canManage?[
      [{text:'➕ Add Balance',callback_data:`a_add_${tgt.id}`},{text:'➖ Remove Balance',callback_data:`a_rem_${tgt.id}`}],
      [{text:tgt.banned?'✅ Unban':'🚫 Ban',callback_data:`a_ban_${tgt.id}`}],
    ]:[];
    return send(uid, txt, {reply_markup:{inline_keyboard:btns}});
  }

  // Settings
  if (data.startsWith('s_') && uid===DEFAULTS.ADMIN) {
    if (data==='s_apiurl')      { setState(uid,{step:'a_set_apiurl',data:{}}); return send(uid,'🌐 Enter new API URL (https://...):',CANCEL); }
    if (data==='s_apikey')      { setState(uid,{step:'a_set_apikey',data:{}}); return send(uid,'🔑 Enter new API Key:',CANCEL); }
    if (data==='s_upi')         { setState(uid,{step:'a_set_upi',data:{}}); return send(uid,'🏦 Enter new UPI ID:',CANCEL); }
    if (data==='s_upiname')     { setState(uid,{step:'a_set_upiname',data:{}}); return send(uid,'👤 Enter UPI Account Name:',CANCEL); }
    if (data==='s_channel')     { return showChannelManager(uid, db, C); }
    if (data==='s_ch_add')      { setState(uid,{step:'a_set_channel',data:{}}); return send(uid,'📢 Enter channel username (e.g. @mychannel):\n\n⚠️ <b>Important:</b> Make sure the bot is already an Admin in that channel!',CANCEL); }
    if (data==='s_ch_disable')  { db.settings.forceChannels=[]; saveDB(db); return send(uid,'✅ Force join has been disabled. All users can now use the bot freely.',ADMIN_KB); }
    if (data.startsWith('s_ch_del_')) { const chDel=decodeURIComponent(data.replace('s_ch_del_','')); db.settings.forceChannels=(db.settings.forceChannels||[]).filter(c=>c!==chDel); saveDB(db); return showChannelManager(uid,db,cfg(db)); }
    if (data==='s_margin')      { setState(uid,{step:'a_set_margin',data:{}}); return send(uid,'📈 Enter Margin % (0-1000):',CANCEL); }
    if (data==='s_minrecharge') { setState(uid,{step:'a_set_minrecharge',data:{}}); return send(uid,'💵 Enter Min Recharge ₹:',CANCEL); }
    if (data==='s_version')      { setState(uid,{step:'a_set_version',data:{}}); return send(uid,`🤖 Enter new bot version (current: v${C.botVersion}):\n\nExample: 4.1 or 5.0`,CANCEL); }
    if (data==='s_logschannel')  { setState(uid,{step:'a_set_logschannel',data:{}}); return send(uid,'📋 Enter logs channel username (e.g. @NexusLogs)\n\nType "0" to disable it:',CANCEL); }
    if (data==='s_cryptorate')   { setState(uid,{step:'a_set_cryptorate',data:{}}); return send(uid,`💱 Enter USDT rate in ₹ (current: ₹${C.cryptoRate}):\n\nExample: 85 (means 1 USDT = ₹85)`,CANCEL); }
    if (data==='s_welcome')     { setState(uid,{step:'a_welcome_msg',data:{}}); return send(uid,'💬 Enter new Welcome message:',CANCEL); }
    if (data==='s_toggle_custom') {
      db.settings.useCustomOnly=!db.settings.useCustomOnly; saveDB(db);
      return send(uid,`🔧 Custom Only Mode: ${db.settings.useCustomOnly?'✅ ON':'❌ OFF'}`,ADMIN_KB);
    }
    if (data==='s_toggle_maintenance') {
      db.settings.maintenanceMode=!db.settings.maintenanceMode; saveDB(db);
      if (db.settings.maintenanceMode) {
        setState(uid,{step:'a_maintenance_msg',data:{}});
        return send(uid,
          `🚧 <b>Maintenance Mode is now ON 🔴</b>\n\n` +
          `Normal users will see a maintenance message and won't be able to use the bot. You (admin/staff) can still use everything.\n\n` +
          `✏️ Type a custom maintenance message to show users, or send "0" to use the default:`,
          CANCEL
        );
      }
      return send(uid,'✅ <b>Maintenance Mode is now OFF 🟢</b>\n\nBot is live for all users again.',ADMIN_KB);
    }
  }

  if (data==='back_settings' && uid===DEFAULTS.ADMIN) {
    return adminSettings(uid, db, C);
  }

  // Custom services
  // Pinned API Services callbacks
  if (data==='as_add' && uid===DEFAULTS.ADMIN) {
    // Redirect to new browse system
    return adminBrowseAPIStart(uid, db, C);
  }
  if (data==='asb_noop') return; // pagination label button, do nothing
  if (data==='as_list' && uid===DEFAULTS.ADMIN) {
    const svcs=Object.values(db.apiServices||{});
    if (!svcs.length) return send(uid,'❌ No pinned API services yet.\n\n💡 Use "Add API Service by ID" to add one.',ADMIN_KB);
    let txt=`📌 <b>Pinned API Services (${svcs.length})</b>\n\n`;
    for (const s of svcs)
      txt+=`🆔 <code>${s.service}</code> — ${s.active?'✅':'❌'}\n📌 ${s.name}\n📁 ${s.category||'N/A'}\n💵 ₹${s.rate}/1K → User: ₹${addMargin(s.rate,C.margin)}/1K\n📊 Min:${s.min} Max:${s.max}\n\n`;
    const btns=svcs.slice(0,8).flatMap(s=>[
      [{text:`${s.active?'🔴 Disable':'🟢 Enable'} - ${safeSlice(s.name,18)}`,callback_data:`as_toggle_${s.service}`}],
      [{text:`🗑 Delete - ${safeSlice(s.name,20)}`,callback_data:`as_del_${s.service}`}],
    ]);
    return send(uid,txt,{reply_markup:{inline_keyboard:btns}});
  }
  if (data.startsWith('as_toggle_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(10);
    if (!db.apiServices||!db.apiServices[sid]) return send(uid,'❌ Service not found.');
    db.apiServices[sid].active=!db.apiServices[sid].active; saveDB(db);
    return send(uid,`✅ Service ${db.apiServices[sid].active?'✅ Enabled':'❌ Disabled'}: ${sid} — ${db.apiServices[sid].name}`,ADMIN_KB);
  }
  if (data.startsWith('as_del_') && uid===DEFAULTS.ADMIN) {
    const freshDb3=loadDB();
    const sid=data.slice(7);
    if (!freshDb3.apiServices||!freshDb3.apiServices[sid]) return send(uid,'❌ Service not found.',ADMIN_KB);
    const name=freshDb3.apiServices[sid].name;
    delete freshDb3.apiServices[sid]; saveDB(freshDb3);
    return send(uid,`✅ Pinned service deleted: ${name}`,ADMIN_KB);
  }

  if (data==='cs_add' && uid===DEFAULTS.ADMIN) { setState(uid,{step:'cs_name',data:{}}); return send(uid,'📌 Enter service name:',CANCEL); }
  if (data==='cs_list' && uid===DEFAULTS.ADMIN) {
    const svcs=Object.values(db.customServices);
    if (!svcs.length) return send(uid,'❌ No custom services yet.',ADMIN_KB);
    let txt=`🔧 <b>Custom Services (${svcs.length})</b>\n\n`;
    for (const s of svcs) txt+=`${s.active?'✅':'❌'} <code>${s.service}</code> — ${s.name}\n📁 ${s.category} | ₹${s.rate}/1K | ${s.min}-${s.max}\n\n`;
    return send(uid,txt,{reply_markup:{inline_keyboard:svcs.slice(0,5).map(s=>[{text:`${s.active?'🔴 Disable':'🟢 Enable'} ${safeSlice(s.name,20)}`,callback_data:`cs_toggle_${s.service}`}])}});
  }
  if (data.startsWith('cs_toggle_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(10); if(!db.customServices[sid]) return send(uid,'❌ Service not found.');
    db.customServices[sid].active=!db.customServices[sid].active; saveDB(db);
    return send(uid,`✅ ${db.customServices[sid].active?'Enabled':'Disabled'}: ${sid}`,ADMIN_KB);
  }
  if (data==='cs_delete_menu' && uid===DEFAULTS.ADMIN) {
    const freshDb=loadDB();
    const svcs=Object.values(freshDb.customServices||{});
    if (!svcs.length) return send(uid,'❌ No custom services found.',ADMIN_KB);
    return send(uid,'🗑 Select service to delete:',{reply_markup:{inline_keyboard:svcs.map(s=>[{text:`🗑 ${safeSlice(s.name,30)}`,callback_data:`cs_del_${s.service}`}])}});
  }
  if (data.startsWith('cs_del_') && uid===DEFAULTS.ADMIN) {
    const freshDb2=loadDB();
    const sid=data.slice(7);
    if(!freshDb2.customServices||!freshDb2.customServices[sid]) return send(uid,'❌ Service not found.',ADMIN_KB);
    const name=freshDb2.customServices[sid].name;
    delete freshDb2.customServices[sid];
    saveDB(freshDb2);
    return send(uid,`✅ Custom service deleted: ${name}`,ADMIN_KB);
  }

  // ── Custom Service EDIT callbacks ──
  if (data==='cs_edit_menu' && uid===DEFAULTS.ADMIN) {
    const svcs=Object.values(db.customServices);
    if (!svcs.length) return send(uid,'❌ No custom services found.',ADMIN_KB);
    return send(uid,'✏️ Select custom service to edit:',{reply_markup:{inline_keyboard:svcs.map(s=>[{text:`✏️ ${safeSlice(s.name,35)}`,callback_data:`cs_edit_${s.service}`}])}});
  }
  if (data.startsWith('cs_edit_') && !data.startsWith('cs_edit_menu') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(8);
    const svc=db.customServices[sid];
    if (!svc) return send(uid,'❌ Service not found.',ADMIN_KB);
    return send(uid,
      `✏️ <b>Edit Service</b>\n\n🆔 <code>${svc.service}</code>\n📌 Name: ${svc.name}\n📁 Category: ${svc.category}\n💵 Rate: ₹${svc.rate}/1K\n📊 Min: ${svc.min} | Max: ${svc.max}\n⏱ Delivery: ${svc.delivery||'Not set'}\n📝 Desc: ${svc.description||'None'}\n\nWhat do you want to edit?`,
      {reply_markup:{inline_keyboard:[
        [{text:'📌 Change Name',callback_data:`cse_name_${sid}`}],
        [{text:'💵 Change Rate',callback_data:`cse_rate_${sid}`}],
        [{text:'📊 Change Min Qty',callback_data:`cse_min_${sid}`}],
        [{text:'📊 Change Max Qty',callback_data:`cse_max_${sid}`}],
        [{text:'⏱ Change Delivery Time',callback_data:`cse_delivery_${sid}`}],
        [{text:'📝 Change Description',callback_data:`cse_desc_${sid}`}],
      ]}}
    );
  }
  if (data.startsWith('cse_name_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(9);
    setState(uid,{step:'cs_edit_name',data:{sid}});
    return send(uid,`📌 Enter new name for service <code>${sid}</code>:`,CANCEL);
  }
  if (data.startsWith('cse_rate_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(9);
    setState(uid,{step:'cs_edit_rate',data:{sid}});
    return send(uid,`💵 Enter new rate per 1000 for service <code>${sid}</code>:`,CANCEL);
  }
  if (data.startsWith('cse_min_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(8);
    setState(uid,{step:'cs_edit_min',data:{sid}});
    return send(uid,`📊 Enter new minimum quantity for service <code>${sid}</code>:`,CANCEL);
  }
  if (data.startsWith('cse_max_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(8);
    setState(uid,{step:'cs_edit_max',data:{sid}});
    return send(uid,`📊 Enter new maximum quantity for service <code>${sid}</code>:`,CANCEL);
  }
  if (data.startsWith('cse_delivery_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(13);
    setState(uid,{step:'cs_edit_delivery',data:{sid}});
    return send(uid,`⏱ Enter delivery time for service <code>${sid}</code> (e.g. "1-2 Hours", "Instant"):`,CANCEL);
  }
  if (data.startsWith('cse_desc_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(9);
    setState(uid,{step:'cs_edit_desc',data:{sid}});
    return send(uid,`📝 Enter new description (or type "skip"):`,CANCEL);
  }

  // ── Pinned API Service EDIT callbacks ──
  if (data==='as_edit_menu' && uid===DEFAULTS.ADMIN) {
    const svcs=Object.values(db.apiServices||{});
    if (!svcs.length) return send(uid,'❌ No pinned API services found.',ADMIN_KB);
    return send(uid,'✏️ Select API service to edit:',{reply_markup:{inline_keyboard:svcs.map(s=>[{text:`✏️ ${safeSlice(s.name,35)}`,callback_data:`ase_sel_${String(s.service).slice(0,30)}`}])}});
  }
  if (data.startsWith('ase_sel_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(8);
    const svc=(db.apiServices||{})[sid];
    if (!svc) return send(uid,'❌ Service not found.',ADMIN_KB);
    return send(uid,
      `✏️ <b>Edit API Service</b>\n\n🆔 <code>${svc.service}</code>\n📌 Name: ${svc.name}\n📁 Category: ${svc.category||'N/A'}\n💵 Rate: ₹${svc.rate}/1K\n⏱ Delivery: ${svc.delivery||'Not set'}\n\nWhat to edit?`,
      {reply_markup:{inline_keyboard:[
        [{text:'📌 Change Name',callback_data:`ase_name_${sid}`}],
        [{text:'⏱ Change Delivery Time',callback_data:`ase_delivery_${sid}`}],
      ]}}
    );
  }
  if (data.startsWith('ase_name_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(9);
    setState(uid,{step:'as_edit_name',data:{sid}});
    return send(uid,`📌 Enter new display name for API service <code>${sid}</code>:`,CANCEL);
  }
  if (data.startsWith('ase_delivery_') && uid===DEFAULTS.ADMIN) {
    const sid=data.slice(13);
    setState(uid,{step:'as_edit_delivery',data:{sid}});
    return send(uid,`⏱ Enter delivery time for API service <code>${sid}</code> (e.g. "1-2 Hours", "Instant", "24 Hours"):`,CANCEL);
  }
  if (data==='cs_test_api' && uid===DEFAULTS.ADMIN) {
    await send(uid,'🔍 Testing API connection...');
    const res=await smmAPI(C.apiUrl,C.apiKey,{action:'services'});
    if (res.ok&&Array.isArray(res.data)&&res.data.length>0) {
      const cats=[...new Set(res.data.map(s=>s.category||'Other'))];
      return send(uid,`✅ API Connected!\n📊 ${res.data.length} services | ${cats.length} categories\n\n${cats.slice(0,5).map(c=>`• ${c}`).join('\n')}`,ADMIN_KB);
    }
    return send(uid,`❌ API Connection Failed!\nError: <code>${res.error}</code>`,ADMIN_KB);
  }

  // ── Add API Service by ID directly ──
  if (data==='as_add_by_id' && uid===DEFAULTS.ADMIN) {
    setState(uid,{step:'as_add_id',data:{}});
    return send(uid,
      `🔢 <b>Add Service by API ID</b>\n\nEnter the Service ID (e.g. <code>1234</code>):\n\n💡 Copy the service ID from your API panel and paste it here.`,
      CANCEL
    );
  }

  // ── Browse & Add API Services (asb_) — NEW SYSTEM ──
  if (data==='asb_start' && uid===DEFAULTS.ADMIN) {
    return adminBrowseAPIStart(uid, db, C);
  }
  if (data==='asb_back' && uid===DEFAULTS.ADMIN) {
    return adminServicesMenu(uid, db, C);
  }

  // Category page navigation
  if (data.startsWith('asb_catp_') && uid===DEFAULTS.ADMIN) {
    const page = parseInt(data.slice(9), 10);
    const PAGE_SIZE = 10;
    const st = getState(uid);
    const catKeys = st.asbCatKeys || [];
    const cats = st.asbCats || {};
    if (!catKeys.length) return adminBrowseAPIStart(uid, db, C);
    const slice = catKeys.slice(page * PAGE_SIZE, (page+1) * PAGE_SIZE);
    if (!slice.length) return;
    const btns = slice.map((c, i) => [{
      text: `📁 ${c} (${cats[c].length})`,
      callback_data: `asb_cat_${page * PAGE_SIZE + i}`
    }]);
    const navRow = [];
    const totalPages = Math.ceil(catKeys.length / PAGE_SIZE);
    if (page > 0) navRow.push({text:`⬅️ Prev`, callback_data:`asb_catp_${page-1}`});
    if (page < totalPages-1) navRow.push({text:`➡️ Next`, callback_data:`asb_catp_${page+1}`});
    if (navRow.length) btns.push(navRow);
    btns.push([{text:'🔙 Back', callback_data:'asb_back'}]);
    const allSvcs = st.asbAllSvcs || [];
    try {
      await bot.editMessageText(
        `🌐 <b>Browse API Services</b>\n\n📊 Total: ${allSvcs.length} services | ${catKeys.length} categories\n📄 Page ${page+1}/${totalPages}\n\n📁 Select a category:`,
        {chat_id:uid, message_id:q.message.message_id, parse_mode:'HTML', reply_markup:{inline_keyboard:btns}}
      );
    } catch { await send(uid, `📄 Page ${page+1}/${totalPages} — Select category:`, {reply_markup:{inline_keyboard:btns}}); }
    return;
  }

  // Category selected → show services with Add/Remove buttons (paginated)
  if (data.startsWith('asb_cat_') && uid===DEFAULTS.ADMIN) {
    const catIdx = parseInt(data.slice(8), 10);
    let st = getState(uid);
    // If state lost, re-fetch
    if (!st.asbAllSvcs || !st.asbCatKeys) {
      await send(uid, '⏳ Reloading services...');
      const res2 = await smmAPI(C.apiUrl, C.apiKey, {action:'services'});
      if (!res2.ok || !Array.isArray(res2.data)) return send(uid,'❌ API error. Try again.',ADMIN_KB);
      const cats2 = {};
      for (const s of res2.data) { const c=s.category||'Other'; if(!cats2[c]) cats2[c]=[]; cats2[c].push(s); }
      st = {...st, asbAllSvcs:res2.data, asbCats:cats2, asbCatKeys:Object.keys(cats2)};
      setState(uid, st);
    }
    const catName = st.asbCatKeys[catIdx];
    if (!catName) return send(uid,'❌ Category not found.',ADMIN_KB);
    const svcs = (st.asbCats[catName] || []);
    setState(uid, {...st, asbCurrentCat: catName, asbCurrentCatIdx: catIdx, asbCurrentSvcs: svcs, asbSvcPage: 0});
    return showASBServicePage(uid, db, C, svcs, catName, catIdx, 0, q.message.message_id);
  }

  // Service page navigation
  if (data.startsWith('asb_svcp_') && uid===DEFAULTS.ADMIN) {
    const parts = data.slice(9).split('_');
    const page = parseInt(parts[0], 10);
    const st = getState(uid);
    const svcs = st.asbCurrentSvcs || [];
    const catName = st.asbCurrentCat || '';
    const catIdx = st.asbCurrentCatIdx || 0;
    setState(uid, {...st, asbSvcPage: page});
    return showASBServicePage(uid, db, C, svcs, catName, catIdx, page, q.message.message_id);
  }

  // Add single service
  if (data.startsWith('asb_add_') && uid===DEFAULTS.ADMIN) {
    const sid = data.slice(8);
    const st = getState(uid);
    const svcs = st.asbCurrentSvcs || [];
    const svc = svcs.find(s => String(s.service) === String(sid));
    if (!svc) return bot.answerCallbackQuery(q.id, {text:'❌ Service not found'}).catch(()=>{});
    if (!db.apiServices) db.apiServices = {};
    if (db.apiServices[String(svc.service)]) {
      return bot.answerCallbackQuery(q.id, {text:'⚠️ Already added!'}).catch(()=>{});
    }
    db.apiServices[String(svc.service)] = {...svc, service:String(svc.service), active:true, isPinnedAPI:true, addedAt:Date.now()};
    saveDB(db);
    await bot.answerCallbackQuery(q.id, {text:`✅ Added: ${safeSlice(svc.name,30)}`}).catch(()=>{});
    // Refresh the current page to show updated buttons
    const page = st.asbSvcPage || 0;
    const catName = st.asbCurrentCat || '';
    const catIdx = st.asbCurrentCatIdx || 0;
    return showASBServicePage(uid, loadDB(), C, svcs, catName, catIdx, page, q.message.message_id);
  }

  // Remove single service
  if (data.startsWith('asb_rem_') && uid===DEFAULTS.ADMIN) {
    const sid = data.slice(8);
    if (!db.apiServices || !db.apiServices[sid]) {
      return bot.answerCallbackQuery(q.id, {text:'⚠️ Not in list'}).catch(()=>{});
    }
    const name = db.apiServices[sid].name || sid;
    delete db.apiServices[sid];
    saveDB(db);
    await bot.answerCallbackQuery(q.id, {text:`❌ Removed: ${safeSlice(name,30)}`}).catch(()=>{});
    const st = getState(uid);
    const svcs = st.asbCurrentSvcs || [];
    const page = st.asbSvcPage || 0;
    const catName = st.asbCurrentCat || '';
    const catIdx = st.asbCurrentCatIdx || 0;
    return showASBServicePage(uid, loadDB(), C, svcs, catName, catIdx, page, q.message.message_id);
  }

  // Add ALL services in current category
  if (data.startsWith('asb_addall_') && uid===DEFAULTS.ADMIN) {
    const catIdxA = parseInt(data.slice(11), 10);
    const st = getState(uid);
    const svcs = st.asbCurrentSvcs || [];
    if (!db.apiServices) db.apiServices = {};
    let added = 0;
    for (const svc of svcs) {
      const key = String(svc.service);
      if (!db.apiServices[key]) {
        db.apiServices[key] = {...svc, service:key, active:true, isPinnedAPI:true, addedAt:Date.now()};
        added++;
      }
    }
    saveDB(db);
    await bot.answerCallbackQuery(q.id, {text:`✅ ${added} services added!`}).catch(()=>{});
    const page = st.asbSvcPage || 0;
    const catName = st.asbCurrentCat || '';
    return showASBServicePage(uid, loadDB(), C, svcs, catName, catIdxA, page, q.message.message_id);
  }

  // Remove ALL services in current category
  if (data.startsWith('asb_remall_') && uid===DEFAULTS.ADMIN) {
    const catIdxR = parseInt(data.slice(11), 10);
    const st = getState(uid);
    const svcs = st.asbCurrentSvcs || [];
    if (!db.apiServices) db.apiServices = {};
    let removed = 0;
    for (const svc of svcs) {
      const key = String(svc.service);
      if (db.apiServices[key]) { delete db.apiServices[key]; removed++; }
    }
    saveDB(db);
    await bot.answerCallbackQuery(q.id, {text:`❌ ${removed} services removed!`}).catch(()=>{});
    const page = st.asbSvcPage || 0;
    const catName = st.asbCurrentCat || '';
    return showASBServicePage(uid, loadDB(), C, svcs, catName, catIdxR, page, q.message.message_id);
  }

  // ── Staff Panel Callbacks ──
  if (uid!==DEFAULTS.ADMIN) return; // All below: Admin only

  if (data==='staff_add') {
    setState(uid,{step:'staff_add_id',data:{},pendingPerms:[]});
    return send(uid,`👨‍💼 <b>Add Staff Member</b>\n\nEnter the staff member's Telegram User ID or @username:\n\n💡 They must have started the bot first.`,CANCEL);
  }

  if (data.startsWith('sp_toggle_')) {
    const parts=data.slice(10).split('_');
    const staffId=parts[0]; const perm=parts.slice(1).join('_');
    const st=getState(uid);
    if (!st.pendingPerms) st.pendingPerms=[];
    if (st.pendingPerms.includes(perm)) st.pendingPerms=st.pendingPerms.filter(p=>p!==perm);
    else st.pendingPerms.push(perm);
    setState(uid,{...st});
    // Rebuild permission buttons showing current state
    const permBtns=ALL_PERMS.map(p=>[{
      text:`${st.pendingPerms.includes(p)?'✅':'☑️'} ${p}`,
      callback_data:`sp_toggle_${staffId}_${p}`
    }]);
    permBtns.push([{text:'💾 Save Staff Member',callback_data:`sp_save_${staffId}`}]);
    permBtns.push([{text:'🔑 Grant ALL Permissions',callback_data:`sp_all_${staffId}`}]);
    const targetUser=db.users[staffId];
    await bot.editMessageText(
      `👤 <b>Setting permissions for:</b> ${targetUser?.firstName||staffId} [<code>${staffId}</code>]\n\n🔐 Selected: ${st.pendingPerms.length} permission(s)\n${st.pendingPerms.map(p=>`• ${p}`).join('\n')||'None selected'}`,
      {chat_id:uid,message_id:q.message.message_id,parse_mode:'HTML',reply_markup:{inline_keyboard:permBtns}}
    ).catch(()=>{});
    return;
  }

  if (data.startsWith('sp_all_')) {
    const staffId=data.slice(7);
    const st=getState(uid);
    st.pendingPerms=[...ALL_PERMS];
    setState(uid,{...st});
    const permBtns=ALL_PERMS.map(p=>[{text:`✅ ${p}`,callback_data:`sp_toggle_${staffId}_${p}`}]);
    permBtns.push([{text:'💾 Save Staff Member',callback_data:`sp_save_${staffId}`}]);
    permBtns.push([{text:'🔑 Grant ALL Permissions',callback_data:`sp_all_${staffId}`}]);
    const targetUser=db.users[staffId];
    await bot.editMessageText(
      `👤 <b>Setting permissions for:</b> ${targetUser?.firstName||staffId} [<code>${staffId}</code>]\n\n🔐 ALL permissions granted!`,
      {chat_id:uid,message_id:q.message.message_id,parse_mode:'HTML',reply_markup:{inline_keyboard:permBtns}}
    ).catch(()=>{});
    return;
  }

  if (data.startsWith('sp_save_')) {
    const staffId=data.slice(8);
    const st=getState(uid);
    const perms=st.pendingPerms||[];
    const targetUser=db.users[staffId];
    if (!targetUser) return send(uid,'❌ User not found in database.',ADMIN_KB);
    if (!db.staff) db.staff={};
    db.staff[staffId]={
      id:staffId, name:targetUser.firstName||'Staff',
      username:targetUser.username||'',
      perms, addedAt:Date.now(), addedBy:uid,
    };
    saveDB(db); clearState(uid);
    await send(uid,
      `✅ <b>Staff Member Added!</b>\n\n👤 ${targetUser.firstName} [<code>${staffId}</code>]\n🔐 Permissions (${perms.length}):\n${perms.map(p=>`• ${p}`).join('\n')||'None'}`,
      ADMIN_KB
    );
    await send(parseInt(staffId),
      `🎉 <b>You have been added as Staff!</b>\n\n👑 Admin has granted you staff access to NEXUS PANEL.\n🔐 Your permissions:\n${perms.map(p=>`• ${p}`).join('\n')||'None'}\n\n👇 Use the menu below to get started:`,
      STAFF_KB
    ).catch(()=>{});
    return;
  }

  if (data==='staff_edit_menu') {
    const staffList=Object.entries(db.staff||{});
    if (!staffList.length) return send(uid,'❌ No staff members.',ADMIN_KB);
    return send(uid,'✏️ Select staff to edit:',{reply_markup:{inline_keyboard:staffList.map(([sid,sm])=>[{text:`👤 ${sm.name} (@${sm.username||sid})`,callback_data:`staff_edit_${sid}`}])}});
  }
  if (data.startsWith('staff_edit_')) {
    const staffId=data.slice(11);
    const sm=db.staff[staffId]; if(!sm) return send(uid,'❌ Staff not found.',ADMIN_KB);
    setState(uid,{step:'staff_add_id',data:{staffId},pendingPerms:[...sm.perms]});
    const permBtns=ALL_PERMS.map(p=>[{
      text:`${sm.perms.includes(p)?'✅':'☑️'} ${p}`,
      callback_data:`sp_toggle_${staffId}_${p}`
    }]);
    permBtns.push([{text:'💾 Save Changes',callback_data:`sp_save_${staffId}`}]);
    permBtns.push([{text:'🔑 Grant ALL',callback_data:`sp_all_${staffId}`}]);
    return send(uid,
      `✏️ <b>Edit Staff:</b> ${sm.name} [<code>${staffId}</code>]\n\nCurrent permissions: ${sm.perms.length}\nToggle to change:`,
      {reply_markup:{inline_keyboard:permBtns}}
    );
  }

  if (data==='staff_remove_menu') {
    const staffList=Object.entries(db.staff||{});
    if (!staffList.length) return send(uid,'❌ No staff members.',ADMIN_KB);
    return send(uid,'🗑 Select staff to remove:',{reply_markup:{inline_keyboard:staffList.map(([sid,sm])=>[{text:`🗑 ${sm.name} (@${sm.username||sid})`,callback_data:`staff_del_${sid}`}])}});
  }
  if (data.startsWith('staff_del_')) {
    const staffId=data.slice(10);
    const sm=db.staff[staffId]; if(!sm) return send(uid,'❌ Staff not found.',ADMIN_KB);
    delete db.staff[staffId]; saveDB(db);
    await send(uid,`✅ Staff member removed: ${sm.name}`,ADMIN_KB);
    await send(parseInt(staffId),`⚠️ Your staff access to NEXUS PANEL has been revoked by admin.`).catch(()=>{});
    return;
  }

  // ── FALLBACK: callback_data didn't match anything above ──
  // This happens if buttons are from an old/expired message after a bot update.
  console.warn('[callback] UNHANDLED callback_data:', data, '| from uid:', uid);
  return send(uid,
    '⚠️ <b>This button is outdated or expired.</b>\n\nThe bot was recently updated — please tap the menu button again (e.g. 🛒 New Order) to get a fresh, working version.',
    MAIN
  );

  } catch (e) {
    // ── GLOBAL SAFETY NET ──
    // Guarantees the user ALWAYS gets a response, even if something
    // completely unexpected breaks above. Prevents silent "no response" bugs.
    console.error('[callback_query] FATAL ERROR | data:', data, '| uid:', uid, '| error:', e.message);
    return send(uid,
      `❌ <b>Something went wrong.</b>\n\n<code>${e.message}</code>\n\n💡 Please try again. If this keeps happening, contact Support.`,
      MAIN
    ).catch(()=>{});
  }
});

// ──────────────────────────────────────────────
//  AUTO STATUS CHECKER
// ──────────────────────────────────────────────
setInterval(async () => {
  try {
    const db=loadDB(); const C=cfg(db);
    const active=Object.values(db.orders).filter(o=>
      ['pending','inprogress','processing'].includes(o.status) && !o.isCustom
    );
    if (!active.length) return;
    for (const chunk of chunkArr(active,100)) {
      const res=await smmAPI(C.apiUrl,C.apiKey,{action:'status',orders:chunk.map(o=>o.apiOrderId).join(',')});
      if (!res.ok||typeof res.data!=='object') continue;
      let changed=false;
      for (const o of chunk) {
        const s=res.data[o.apiOrderId]; if(!s) continue;
        const old=o.status;
        const newStatus=(s.status||o.status).toLowerCase();
        o.status=newStatus; o.updatedAt=Date.now();
        if (old!==o.status) {
          changed=true;
          if (newStatus==='completed') {
            await send(o.userId,
              `✅ <b>Order Completed!</b>\n\n🆔 Order ID: <code>${o.id}</code>\n📌 ${o.serviceName}\n🔢 Quantity: ${o.quantity}\n\n🎉 Your order has been delivered successfully!`
            );
          } else if (['canceled','cancelled'].includes(newStatus)) {
            const u=getUser(db,o.userId); u.balance+=o.cost; u.totalSpent=Math.max(0,u.totalSpent-o.cost);
            log(db,{type:'refund',orderId:o.id,userId:o.userId,amount:o.cost});
            await send(o.userId,
              `❌ <b>Order Cancelled!</b>\n\n🆔 Order ID: <code>${o.id}</code>\n📌 ${o.serviceName}\n💰 ₹${o.cost} has been refunded to your wallet!`
            );
          } else if (newStatus==='partial') {
            await send(o.userId,
              `⚠️ <b>Order Partially Completed</b>\n\n🆔 Order ID: <code>${o.id}</code>\n📌 ${o.serviceName}\n\nContact Support if you need help.`
            );
          } else if (['inprogress','processing'].includes(newStatus)) {
            await send(o.userId,
              `🔄 <b>Order In Progress</b>\n\n🆔 Order ID: <code>${o.id}</code>\n📌 ${o.serviceName}\n\n⏳ Your order is currently being processed...`
            );
          }
        }
      }
      if (changed) saveDB(db);
      await sleep(1000);
    }
  } catch(e) { console.error('AutoCheck err:', e.message); }
}, 5 * 60 * 1000);

// ──────────────────────────────────────────────
//  UTILITY
// ──────────────────────────────────────────────
function userInfoText(u) {
  return `👤 <b>User Info</b>\n\n🆔 <code>${u.id}</code>\n👤 ${u.firstName}\n🏷 @${u.username||'N/A'}\n💳 Balance: ₹${u.balance.toFixed(2)}\n📤 Total Recharged: ₹${u.totalRecharged.toFixed(2)}\n📥 Total Spent: ₹${u.totalSpent.toFixed(2)}\n🎁 Referral Earnings: ₹${u.referralEarnings.toFixed(2)}\n📦 Total Orders: ${u.orderHistory.length}\n🚫 Banned: ${u.banned?'Yes ⛔':'No ✅'}\n📅 Joined: ${new Date(u.joinedAt).toLocaleString()}`;
}

// ──────────────────────────────────────────────
//  START
// ──────────────────────────────────────────────
(async () => {
  await initDB();
  const me=await bot.getMe();
  const db=loadDB(); const C=cfg(db);
  console.log(`\n✅ Bot: @${me.username}`);
  console.log(`👤 Admin: ${DEFAULTS.ADMIN}`);
  console.log(`🌐 API: ${C.apiUrl}`);
  console.log(`🔑 Key: ${C.apiKey.slice(0,12)}...`);
  console.log(`📢 Channels: ${(C.forceChannels||[]).join(', ')}`);
  await adm(`🟢 <b>Bot LIVE! v${C.botVersion}</b>\n\n🌐 <code>${C.apiUrl}</code>\n🔑 <code>${C.apiKey.slice(0,12)}...</code>\n📢 ${(C.forceChannels||[]).join(', ')||'❌ Not Set'}\n📈 Margin: ${C.margin}%\n\n📋 Type /admin to open the Admin Panel.`);
})();

bot.on('polling_error', e => {
  console.error('Poll err:', e.message);
  if (e.message && e.message.includes('409')) {
    console.error('🚨🚨🚨 CRITICAL: 409 CONFLICT DETECTED! 🚨🚨🚨');
    console.error('🚨 ANOTHER COPY OF THIS BOT IS ALREADY RUNNING somewhere (old deploy, duplicate process, or another server).');
    console.error('🚨 Telegram only allows ONE process to receive updates at a time.');
    console.error('🚨 THIS IS THE #1 CAUSE of "button click → no response" bugs!');
    console.error('🚨 FIX: Stop ALL other running instances of this bot (check PM2/Railway/Render/VPS), then restart ONLY ONE.');
  }
});
process.on('unhandledRejection', e => console.error('Unhandled:', e?.message||e));
process.on('uncaughtException',  e => console.error('Uncaught:', e?.message||e));
