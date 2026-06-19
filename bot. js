'use strict';

// ──────────────────────────────────────────────
//  BOOTSTRAP — install deps synchronously first
// ──────────────────────────────────────────────
(function bootstrap() {
  const { execFileSync } = require('child_process');
  const path = require('path');
  const nm = path.join(__dirname, 'node_modules');
  const needed = ['node-telegram-bot-api', 'axios', 'mongoose'];

  // Check each package individually
  const missing = needed.filter(pkg => {
    try {
      // Force Node to look in local node_modules
      require.resolve(pkg, { paths: [__dirname] });
      return false;
    } catch (_) { return true; }
  });

  if (missing.length === 0) return; // all good

  console.log('📦 Installing packages:', missing.join(', '));
  try {
    execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['install', '--save', '--prefer-offline', ...missing],
      { cwd: __dirname, stdio: 'inherit' }
    );
    // Force Node.js to pick up newly installed modules
    try { if (process.mainModule) process.mainModule.paths.unshift(nm); } catch(_) {}
    console.log('✅ Done installing packages!');
  } catch (e) {
    console.error('❌ FATAL: Could not install npm packages.');
    console.error('Please run:  npm install  in the project folder.');
    process.exit(1);
  }
})();

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
  BOT_VERSION      : '14.0',
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
function isCustomSvc(id)     { return String(id).startsWith('CS'); }

function timeAgo(ts) {
  const m=Math.floor((Date.now()-ts)/60000);
  if (m<1)  return 'just now';
  if (m<60) return m+'m ago';
  const h=Math.floor(m/60);
  if (h<24) return h+'h ago';
  return Math.floor(h/24)+'d ago';
}
// Sanitize text for Telegram button labels (remove invalid UTF-16 surrogates)
function sanitizeBtn(str) {
  if (!str) return '';
  // Replace lone surrogates and non-printable chars; keep emojis and normal Unicode
  return str
    .replace(/[\uD800-\uDFFF]/g, '') // lone surrogates
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
    .trim()
    .slice(0, 60); // Telegram button text max practical length
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
async function send(cid, text, opts={}) {
  try {
    if (text.length>4000) text=text.slice(0,4000)+'...';
    return await bot.sendMessage(cid, text, { parse_mode:'HTML', ...opts });
  } catch(e) {
    console.error('send err:', e.message);
    // If inline keyboard button text encoding error — retry without inline keyboard
    if (e.message && e.message.includes('inline keyboard button text must be encoded')) {
      console.error('[send] UTF-8 button error — retrying without inline_keyboard');
      const safeOpts = { ...opts };
      if (safeOpts.reply_markup && safeOpts.reply_markup.inline_keyboard) {
        // Sanitize all button texts
        safeOpts.reply_markup = {
          ...safeOpts.reply_markup,
          inline_keyboard: safeOpts.reply_markup.inline_keyboard.map(row =>
            row.map(btn => ({ ...btn, text: sanitizeBtn(btn.text) || '•' }))
          )
        };
        try { return await bot.sendMessage(cid, text, { parse_mode:'HTML', ...safeOpts }); } catch(e2) { console.error('send retry err:', e2.message); }
      }
    }
  }
}
const adm = (t,o={}) => send(DEFAULTS.ADMIN, t, o);

// Logs channel — order/payment events
async function sendLog(text) {
  try {
    const db = loadDB();
    const ch = db.settings?.logsChannel || DEFAULTS.LOGS_CHANNEL;
    if (!ch || ch==='0') return;
    await bot.sendMessage(ch, text, { parse_mode:'HTML' });
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
//  /testapi — API debug
// ──────────────────────────────────────────────
bot.onText(/\/ping/, async (msg) => {
  const uid = msg.from.id;
  console.log(`[PING] from uid=${uid} at ${new Date().toLocaleTimeString()}`);
  return send(uid, `🟢 <b>Bot is alive!</b>\n\n⏱ Server time: ${new Date().toLocaleString()}\n🆔 Your ID: <code>${uid}</code>\n\nIf buttons aren't responding but this worked, the bot is running fine — try tapping 🛒 New Order again.`);
});

bot.onText(/\/testapi/, async (msg) => {
  if (msg.from.id !== DEFAULTS.ADMIN) return;
  const db=loadDB(); const C=cfg(db);
  await send(msg.chat.id, `🔍 Testing API...\n🌐 <code>${C.apiUrl}</code>`);
  const res = await smmAPI(C.apiUrl, C.apiKey, { action:'services' });
  if (res.ok && Array.isArray(res.data) && res.data.length>0) {
    const cats=[...new Set(res.data.map(s=>s.category||'Other'))];
    return send(msg.chat.id,
      `✅ <b>API Connected!</b>\n\n📊 Services: ${res.data.length} | Categories: ${cats.length}\n\n📁 Categories:\n${cats.slice(0,15).map(c=>`• ${c}`).join('\n')}\n\n💡 Go to 🛠 Services Mgmt → 🌐 Browse & Add API Services to add services by clicking!`,
      ADMIN_KB
    );
  }
  return send(msg.chat.id,
    `❌ <b>API Failed!</b>\n\nError: <code>${res.error||'Unknown'}</code>\n\n💡 Update API URL/Key in ⚙️ Settings`,
    ADMIN_KB
  );
});

// ──────────────────────────────────────────────
//  /testjoin — Test force join setup
// ──────────────────────────────────────────────
bot.onText(/\/testjoin/, async (msg) => {
  if (msg.from.id !== DEFAULTS.ADMIN) return;
  const db=loadDB(); const C=cfg(db);
  const channels = (C.forceChannels || []).filter(ch => ch && ch !== '0');
  if (!channels.length) return send(msg.chat.id,'⚠️ Force join is currently <b>disabled</b>.\n\nUse <code>/addchannel @yourchannel</code> to add a channel.',ADMIN_KB);
  const botInfo=await bot.getMe();
  let report = `📊 <b>Force Join Test Results</b>\n\n`;
  for (const ch of channels) {
    try {
      const botMember=await bot.getChatMember(ch, botInfo.id);
      const botIsAdmin=['administrator','creator'].includes(botMember.status);
      const adminMember=await bot.getChatMember(ch, DEFAULTS.ADMIN);
      report += `📢 <code>${ch}</code>\n🤖 Bot: ${botIsAdmin?'✅ Admin':'❌ NOT Admin'}\n👤 You: ${adminMember.status}\n\n`;
    } catch(e) {
      report += `📢 <code>${ch}</code>\n❌ Error: <code>${e.message}</code>\n\n`;
    }
  }
  report += `💡 Bot must be <b>Admin</b> in all channels for force join to work.`;
  await send(msg.chat.id, report, ADMIN_KB);
});

// ──────────────────────────────────────────────
//  /clearservices — Delete all pinned API services
// ──────────────────────────────────────────────
bot.onText(/\/clearservices/, async (msg) => {
  if (msg.from.id !== DEFAULTS.ADMIN) return;
  const db=loadDB();
  const count = Object.keys(db.apiServices||{}).length;
  if (!count) return send(msg.chat.id,'❌ No pinned API services to delete.',ADMIN_KB);
  db.apiServices = {};
  saveDB(db);
  return send(msg.chat.id,`✅ <b>${count} Pinned API Services deleted!</b>\n\nAll old services have been removed. Add new services from 🛠 Services Mgmt.`,ADMIN_KB);
});


// /channels — List all force join channels
bot.onText(/\/channels/, async (msg) => {
  if (msg.from.id !== DEFAULTS.ADMIN) return;
  const db=loadDB(); const C=cfg(db);
  const channels = (C.forceChannels || []).filter(ch => ch && ch !== '0');
  let text = `📢 <b>Force Join Channels</b>\n\n`;
  if (!channels.length) {
    text += `❌ No channels have been set.\n\n`;
  } else {
    channels.forEach((ch, i) => { text += `${i+1}. <code>${ch}</code>\n`; });
    text += `\nTotal: <b>${channels.length} channel(s)</b>\n\n`;
  }
  text += `📋 <b>Commands:</b>\n`;
  text += `• <code>/addchannel @username</code> — Add a channel\n`;
  text += `• <code>/removechannel @username</code> — Remove a channel\n`;
  text += `• <code>/disablejoin</code> — Disable all channels\n`;
  text += `• <code>/testjoin</code> — Test setup\n`;
  await send(msg.chat.id, text, ADMIN_KB);
});

// /addchannel — Add a force join channel
bot.onText(/\/addchannel(?:\s+(.+))?/, async (msg, match) => {
  if (msg.from.id !== DEFAULTS.ADMIN) return;
  const db=loadDB();
  const input=(match[1]||'').trim();
  if (!input) {
    return send(msg.chat.id,
      `📢 <b>Add a Force Join Channel</b>\n\nUsage: <code>/addchannel @yourchannel</code>\n\n⚠️ Make sure the bot is already an Admin in that channel!`,
      ADMIN_KB
    );
  }
  const channel = input.startsWith('@') ? input : '@' + input;
  if (!db.settings.forceChannels) db.settings.forceChannels = [];
  // Remove old string-type forceChannel if exists
  if (db.settings.forceChannel) { delete db.settings.forceChannel; }
  if (db.settings.forceChannels.includes(channel)) {
    return send(msg.chat.id, `⚠️ <code>${channel}</code> is already in the list!`, ADMIN_KB);
  }
  await send(msg.chat.id, `🔍 Verifying <code>${channel}</code>...`);
  try {
    const botInfo = await bot.getMe();
    const botMember = await bot.getChatMember(channel, botInfo.id);
    const isAdminInCh = ['administrator','creator'].includes(botMember.status);
    db.settings.forceChannels.push(channel);
    saveDB(db);
    if (isAdminInCh) {
      await send(msg.chat.id,
        `✅ <b>Channel Added Successfully!</b>\n\n📢 <code>${channel}</code>\n🤖 Bot: ✅ Admin\n\nTotal channels: <b>${db.settings.forceChannels.length}</b>\n\nAll users will be required to join this channel.`,
        ADMIN_KB
      );
    } else {
      await send(msg.chat.id,
        `⚠️ <b>Channel saved, but bot is NOT an Admin!</b>\n\n📢 <code>${channel}</code>\n🤖 Bot: ❌ NOT Admin\n\nForce join will not work until:\n1. Open <b>${channel}</b>\n2. Go to Administrators\n3. Add <b>@${botInfo.username}</b> as Admin\n\nVerify with <code>/testjoin</code>.`,
        ADMIN_KB
      );
    }
  } catch(e) {
    db.settings.forceChannels.push(channel);
    saveDB(db);
    await send(msg.chat.id,
      `⚠️ <b>Channel saved (with warning)</b>\n\n📢 <code>${channel}</code>\nError: <code>${e.message}</code>\n\nPlease make the bot an Admin in the channel and run <code>/testjoin</code>.`,
      ADMIN_KB
    );
  }
});

// /removechannel — Remove a force join channel
bot.onText(/\/removechannel(?:\s+(.+))?/, async (msg, match) => {
  if (msg.from.id !== DEFAULTS.ADMIN) return;
  const db=loadDB();
  const input=(match[1]||'').trim();
  if (!input) {
    const channels = (db.settings.forceChannels || []).filter(ch => ch && ch !== '0');
    let text = `📢 <b>Remove a Force Join Channel</b>\n\nUsage: <code>/removechannel @username</code>\n\n<b>Current channels:</b>\n`;
    if (!channels.length) text += `❌ No channels set.\n`;
    else channels.forEach((ch,i) => { text += `${i+1}. <code>${ch}</code>\n`; });
    return send(msg.chat.id, text, ADMIN_KB);
  }
  const channel = input.startsWith('@') ? input : '@' + input;
  const before = (db.settings.forceChannels || []).length;
  db.settings.forceChannels = (db.settings.forceChannels || []).filter(ch => ch !== channel);
  if (db.settings.forceChannels.length === before) {
    return send(msg.chat.id, `❌ <code>${channel}</code> was not found in the list.`, ADMIN_KB);
  }
  saveDB(db);
  await send(msg.chat.id,
    `✅ <b>Channel Removed!</b>\n\n📢 <code>${channel}</code> has been removed.\nRemaining channels: <b>${db.settings.forceChannels.length}</b>`,
    ADMIN_KB
  );
});

// /disablejoin — Disable all force join
bot.onText(/\/disablejoin/, async (msg) => {
  if (msg.from.id !== DEFAULTS.ADMIN) return;
  const db=loadDB();
  db.settings.forceChannels = [];
  if (db.settings.forceChannel) delete db.settings.forceChannel;
  saveDB(db);
  await send(msg.chat.id, `✅ Force join has been <b>disabled</b>.\nAll users can now use the bot freely.`, ADMIN_KB);
});

// /setchannel — Legacy support (redirects to /addchannel)
bot.onText(/\/setchannel(?:\s+(.+))?/, async (msg, match) => {
  if (msg.from.id !== DEFAULTS.ADMIN) return;
  const input=(match[1]||'').trim();
  if (!input || input === '0') {
    return send(msg.chat.id,
      `📢 <b>Updated Channel Commands:</b>\n\n• <code>/addchannel @ch</code> — Add a channel\n• <code>/removechannel @ch</code> — Remove a channel\n• <code>/channels</code> — View all channels\n• <code>/disablejoin</code> — Disable force join\n• <code>/testjoin</code> — Test setup`,
      ADMIN_KB
    );
  }
  // Forward to addchannel logic
  msg.text = `/addchannel ${input}`;
  match[1] = input;
  bot.emit('text', msg, [msg.text, input]);
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
    if (text==='🔙 Main Menu')    { clearState(uid); return send(uid,'🏠 Main Menu',MAIN); }
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
    const expireStr = new Date(expiresAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});

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
    return send(uid,`✅ Channel added: ${ch}\nTotal: ${db2.settings.forceChannels.length} channel(s)\n\nYou can add more using /addchannel.`,ADMIN_KB);
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
      return send(uid,`❌ <b>Could not connect to API!</b>\n\nError: <code>${res.error}</code>\n\n💡 Check your API Key/URL in Settings or try /testapi.`,ADMIN_KB);
    }
    const svc=res.data.find(s=>String(s.service)===String(sid));
    if (!svc) {
      clearState(uid);
      return send(uid,
        `❌ <b>Service ID ${sid} not found!</b>\n\nTotal services available: ${res.data.length}\n\n💡 Tips:\n• Use /testapi to browse IDs\n• Copy-paste the exact ID`,
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

async function newOrder(uid,db,C,page=0) {
  try {
    const loadMsg = await bot.sendMessage(uid,'⏳ <b>Loading services...</b>\n\n<i>Please wait...</i>',{parse_mode:'HTML'});
    const services=await getAllServices(db,C);
    try { await bot.deleteMessage(uid, loadMsg.message_id); } catch(_){}

    if (!services.length)
      return send(uid,'❌ <b>No services available.</b>\n\n🔧 Reasons:\n• API server down\n• Invalid API key\n\nPlease try again or contact Support.',{reply_markup:{inline_keyboard:[[{text:'🔄 Retry',callback_data:'new_order_retry'},{text:'🏠 Home',callback_data:'go_home'}]]}});

    const cats={};
    for (const s of services) { const c=s.category||'Other'; if(!cats[c]) cats[c]=[]; cats[c].push(s); }
    const catKeys=Object.keys(cats);
    const PAGE_SIZE=20;
    const totalPages=Math.ceil(catKeys.length/PAGE_SIZE);
    const pageCatKeys=catKeys.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);

    const catMap={}; catKeys.forEach((c,i)=>catMap[i]=c);
    const catData={}; catKeys.forEach((c,i)=>{ catData[i]=cats[c]; });
    setState(uid,{...getState(uid), catMap, catData, services, orderPage:page});

    const btns=pageCatKeys.map((c)=>{
      const i=catKeys.indexOf(c);
      return [{text:`📁 ${sanitizeBtn(c)} (${cats[c].length})`,callback_data:`ocat_${i}`}];
    });

    // Pagination buttons
    const navRow=[];
    if (page>0) navRow.push({text:'⬅️ Prev',callback_data:`ocat_page_${page-1}`});
    if (totalPages>1) navRow.push({text:`📄 ${page+1}/${totalPages}`,callback_data:'noop'});
    if (page<totalPages-1) navRow.push({text:'Next ➡️',callback_data:`ocat_page_${page+1}`});
    if (navRow.length) btns.push(navRow);
    btns.push([{text:'🔄 Refresh Services',callback_data:'new_order_retry'}]);

    await send(uid,`🛒 <b>New Order</b>\n\n📂 Select a category:\n<i>${services.length} services in ${catKeys.length} categories</i>`,{reply_markup:{inline_keyboard:btns}});
  } catch(e) {
    console.error('[newOrder error]', e.message);
    return send(uid,`❌ Failed to load services.\n\n<code>${e.message}</code>\n\n💡 Please try again.`,{reply_markup:{inline_keyboard:[[{text:'🔄 Try Again',callback_data:'new_order_retry'},{text:'🏠 Home',callback_data:'go_home'}]]}});
  }
}

async function myStats(uid,db,user,C) {
  const orders = user.orderHistory.map(oid=>db.orders[oid]).filter(Boolean);
  const totalOrders   = orders.length;
  const completed     = orders.filter(o=>['completed'].includes(o.status?.toLowerCase())).length;
  const pending       = orders.filter(o=>['pending','inprogress','processing'].includes(o.status?.toLowerCase())).length;
  const cancelled     = orders.filter(o=>['canceled','cancelled'].includes(o.status?.toLowerCase())).length;
  const totalSpent    = user.totalSpent||0;
  const totalRecharged= user.totalRecharged||0;
  const refCount      = Object.values(db.users).filter(u=>u.referredBy===String(uid)).length;

  // Member since
  const joinDate = user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : 'N/A';

  // Last order info
  const lastOrder = orders.length ? orders[orders.length-1] : null;
  const lastOrderStr = lastOrder
    ? `${lastOrder.serviceName?.slice(0,30)} (${timeAgo(lastOrder.createdAt)})`
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

  await send(uid, txt, btns);
}

async function myOrders(uid,db,user,C) {
  if (!user.orderHistory.length) return send(uid,'📦 You have no orders yet.',MAIN);
  const recent=user.orderHistory.slice(-10).reverse();
  let txt='📦 <b>My Orders</b>\n\n';
  for (const oid of recent) {
    const o=db.orders[oid]; if(!o) continue;
    txt+=`🆔 <code>${o.id}</code>${o.isCustom?' 🔧':' 🌐'}\n📌 ${o.serviceName.slice(0,40)}\n🔢 ${o.quantity} | ₹${o.cost} | ${statusEmoji(o.status)} ${o.status}\n⏱ ${timeAgo(o.createdAt)}\n\n`;
  }
  await send(uid,txt,{reply_markup:{inline_keyboard:[[{text:'🔄 Refresh Status',callback_data:'orders_refresh'}]]}});
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
    `✅ <b>Order Placed!</b>\n\n🆔 Order ID: <code>${oid}</code>\n📌 ${data.svcName}\n🔗 <code>${data.link}</code>\n🔢 Quantity: ${data.qty}\n💰 ₹${data.cost} deducted\n💳 Balance: ₹${user.balance.toFixed(2)}\n\n${statusEmoji(custom?'processing':'pending')} Status: <b>${custom?'Processing':'Processing'}</b>\n\n📲 You will be notified when status updates.`,
    MAIN
  );
  // Admin notification
  const orderNotifMsg = `📦 <b>NEW ORDER</b> ${custom?'🔧 CUSTOM':'🌐 API'}\n\n👤 ${user.firstName} (@${user.username||'N/A'}) [<code>${uid}</code>]\n━━━━━━━━━━━━━\n🛒 Order ID: <code>${oid}</code>\n📌 ${data.svcName}\n🔗 <code>${data.link}</code>\n🔢 ${data.qty} | ₹${data.cost}\n📊 Status: ${custom?'Processing':'Processing'}\n━━━━━━━━━━━━━\n📅 ${new Date().toLocaleString()}`;
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
    `📅 ${new Date().toLocaleString()}`
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
      `🕐 Time: ${new Date(p.createdAt).toLocaleString()}\n` +
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
  const orders=Object.values(db.orders).sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
  if (!orders.length) return send(uid,'📦 No orders.',ADMIN_KB);
  let txt='📦 <b>Recent Orders</b>\n\n';
  for (const o of orders)
    txt+=`${o.isCustom?'🔧':'🌐'} <code>${o.id}</code>\n📌 ${o.serviceName.slice(0,35)}\n${statusEmoji(o.status)} ${o.status} | ₹${o.cost} | ${timeAgo(o.createdAt)}\n\n`;
  await send(uid,txt,ADMIN_KB);
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
    `🔧 Custom Only: ${C.useCustomOnly?'✅ ON':'❌ OFF'}`,
    {reply_markup:{inline_keyboard:[
      [{text:`🤖 Version: v${C.botVersion}`, callback_data:'s_version'}],
      [{text:'🌐 API URL',callback_data:'s_apiurl'},{text:'🔑 API Key',callback_data:'s_apikey'}],
      [{text:'🏦 UPI ID',callback_data:'s_upi'},{text:'👤 UPI Name',callback_data:'s_upiname'}],
      [{text:'📈 Margin',callback_data:'s_margin'},{text:'💵 Min Recharge',callback_data:'s_minrecharge'}],
      [{text:'📢 Channel',callback_data:'s_channel'},{text:'💬 Welcome Msg',callback_data:'s_welcome'}],
      [{text:`💱 USDT Rate: ₹${C.cryptoRate}`,callback_data:'s_cryptorate'}],
      [{text:`📋 Logs Channel: ${C.logsChannel||'Not set'}`,callback_data:'s_logschannel'}],
      [{text:C.useCustomOnly?'🔧 Custom Only: ON ✅':'🔧 Custom Only: OFF ❌',callback_data:'s_toggle_custom'}],
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
      text: `${isAdded ? '✅' : '➕'} ${sanitizeBtn(svc.name).slice(0,32)} | ₹${userRate}/1K`,
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
    text: `📁 ${sanitizeBtn(c)} (${cats[c].length})`,
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
    const date = new Date().toLocaleDateString().replace(/\//g, '-');
    const time = new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}).replace(/:/g,'-').replace(' ','_');
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
        `📅 Date: ${new Date().toLocaleString()}\n\n` +
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
  console.log(`[CLICK] uid=${uid} | data=${data} | ${new Date().toLocaleTimeString()}`);
  // Answer callback immediately to prevent "loading" spinner
  await bot.answerCallbackQuery(q.id).catch(()=>{});
  try {
  const db=loadDB(); const C=cfg(db);

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
        `📅 <b>Time:</b> ${new Date().toLocaleString()}\n` +
        `🔖 <b>Method:</b> UPI Auto-Pay (Gateway)`
      );
      await sendLog(
        `💰 <b>New Deposit</b>\n\n` +
        `👤 ${user2.firstName} (@${user2.username||'N/A'}) [<code>${pay.userId}</code>]\n` +
        `🆔 <code>${pid}</code>\n💵 ₹${pay.amount}\n💳 Balance: ₹${user2.balance.toFixed(2)}\n` +
        `🔖 Method: UPI Auto-Pay\n` +
        `📅 ${new Date().toLocaleString()}`
      );
      return send(uid,
        `✅ <b>Payment Successful!</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 Order ID: <code>${pid}</code>\n` +
        `💰 Amount Paid: <b>₹${pay.amount}</b>\n` +
        `💳 New Balance: <b>₹${user2.balance.toFixed(2)}</b>\n` +
        `📅 Time: ${new Date().toLocaleString()}\n` +
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
    const expireStr = new Date(expiresAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});

    try {
   
