// 섹터 순위 — 시세(코인게코)·빗썸 원화마켓·바이낸스 선물 목록을 모으고, 섹터별 1군(3대장)·2군 순위를 계산한다.
// AI(예약 실행)는 코인별 뉴스 점수(coin_news)와 기본 점수(coin_base)만 넣고, 순위는 아래 규칙대로 코드가 정한다.
//   점수 = 품질 Q×0.6 + 규모 S×0.25 + 섹터 생존 점수×0.15 + 뉴스 N
//     Q: 기본 점수 5항목 합(0~100) · S: 시총 1억 달러=0 ~ 1,000억 달러=100 (로그)
//     N: 뉴스 영향(-10~+10)의 합, 반감기(단기 3일·보통 10일·구조적 45일)로 줄어듦, ±20 제한
//   후보: 시총 150위 안 · 24시간 거래대금이 시총의 0.1% 이상 · 기준 코인(BTC·ETH·BNB·XRP·SOL) 제외
//   1군(3대장): 2군 1등이 1군 꼴찌보다 3점 이상 앞선 상태가 2번 연속이면 교체 (뉴스 점수 +10 이상이면 바로 승격)
//   2군(마이너리그): 매 갱신 점수순

export const RULES = { cap: 150, liq: 0.001, margin: 3, need: 2, fast: 10, nmax: 20,
  hl: { short: 3, normal: 10, structural: 45 }, w: [0.6, 0.25, 0.15], keep: 12, warn: 8 };

const DAY = 86400e3;
const HOUR = 3600000;
const UA = { "user-agent": "Mozilla/5.0 (compatible; AI-Coin-Research/1.0; +https://coin-desk.kwana1016.workers.dev)", accept: "application/json" };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = x => Math.round(x * 10) / 10;
const sig = x => (x == null || !isFinite(x)) ? null : Number(Number(x).toPrecision(6));
const pct1 = x => (x == null || !isFinite(x)) ? null : Math.round(Number(x) * 10) / 10;
const ymd = ms => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
const kstId = ms => { const d = new Date(ms + 9 * 3600e3); const p = n => String(n).padStart(2, "0");
  return `k${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };

async function readHead(res, limit) {
  if (!res.body) return "";
  const reader = res.body.getReader(); const dec = new TextDecoder(); let out = "", n = 0;
  while (n < limit) { const { done, value } = await reader.read(); if (done) break; n += value.length; out += dec.decode(value, { stream: true }); }
  try { await reader.cancel(); } catch (e) {}
  return out;
}
const put = (db, k, v, now) => db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES (?1, ?2, ?3)").bind(k, typeof v === "string" ? v : JSON.stringify(v), now);

// ── 시세: 코인마켓캡 공개 데이터 상위 200개 → 막히면 코인게코 250개 → 그것도 막히면 코인로어 200개 ──
// 코인파프리카 무료 API는 Cloudflare 공용 IP에서 402, 코인게코는 가끔 429라 둘을 이어 쓴다.
// kv 'cp' = {t, src:"cmc"|"cg"|"cl", m: {id: [순위, 심볼, 가격$, 시총$, 24h거래대금$, 24h%, 7일%, 30일%, 출처(3=코인마켓캡 1=코인게코 2=코인로어), 고점대비%, null, 유통비율]}}
// kv 'ath' = {심볼: 역대 최고가$} — 코인게코가 될 때마다 채우고, 코인로어 때는 이것으로 고점 대비를 계산(새 고점이면 올림)
const CG_MARKETS = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=7d,30d";
const CL_TICKERS = "https://api.coinlore.net/api/tickers/?start=";
const CMC_LIST = "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?start=1&limit=200&sortBy=market_cap&sortType=desc&convert=USD&cryptoType=all&tagType=all&audited=false&aux=ath,cmc_rank,max_supply,circulating_supply,total_supply,self_reported_circulating_supply,self_reported_market_cap";
async function getJson(url, limit) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) { try { res.body && res.body.cancel(); } catch (e) {} return { code: res.status, j: null, bytes: 0 }; }
  let t = await readHead(res, limit);
  return { code: res.status, t, bytes: t.length };
}
export async function watchMarket(env, now = Date.now()) {
  const db = env.DB;
  const kq = await db.prepare("SELECT k, v FROM kv WHERE k IN ('cp', 'ath', 'weeks')").all();
  const kv = Object.fromEntries((kq.results || []).map(r => [r.k, r.v]));
  const ath = parse(kv.ath, {}); const prev = parse(kv.cp, {}).m || {};
  const prevBySym = {}; for (const a of Object.values(prev)) if (a && a[1] && !(a[1] in prevBySym)) prevBySym[a[1]] = a;
  const m = {}; const status = { at: now };
  let athChanged = false;
  // 1) 코인마켓캡 공개 데이터(웹사이트용 data-api) — 30일 변동·역대 최고가 포함
  try {
    const r = await getJson(CMC_LIST, 1500000); status.cmc = r.code;
    if (r.t) {
      const d = JSON.parse(r.t); const list = (d && d.data && d.data.cryptoCurrencyList) || [];
      if (Array.isArray(list) && list.length >= 100) for (const x of list) {
        const q = (x.quotes || []).find(z => z && z.name === "USD") || (x.quotes || [])[0] || {};
        const sym = String(x.symbol || "").toUpperCase(), price = Number(q.price) || 0;
        const mcap = Number(q.marketCap) > 0 ? Number(q.marketCap) : (Number(q.selfReportedMarketCap) || 0);
        if (!sym || !(price > 0)) continue;
        if (Number(x.ath) > 0 && !(ath[sym] >= Number(x.ath))) { ath[sym] = sig(Number(x.ath)); athChanged = true; }
        if (ath[sym] > 0 && price > ath[sym]) { ath[sym] = sig(price); athChanged = true; }
        const maxS = Number(x.maxSupply) > 0 ? Number(x.maxSupply) : Number(x.totalSupply) || 0;
        const cs = Number(x.circulatingSupply) > 0 ? Number(x.circulatingSupply) : Number(x.selfReportedCirculatingSupply) || 0;
        const circ = maxS > 0 && cs > 0 ? Math.min(1, cs / maxS) : null;
        m["cmc:" + (x.slug || x.id)] = [Number(x.cmcRank) || 0, sym, sig(price), Math.round(mcap), Math.round(Number(q.volume24h) || 0),
          pct1(q.percentChange24h), pct1(q.percentChange7d), pct1(q.percentChange30d), 3,
          ath[sym] > 0 ? pct1((price / ath[sym] - 1) * 100) : null, null, circ == null ? null : Math.round(circ * 1000) / 1000];
      }
    }
  } catch (e) { status.cmc = status.cmc || -1; }
  status.src = "cmc";
  // 2) 코인게코 (코인마켓캡이 막혔을 때)
  if (Object.keys(m).length < 100) try {
    const r = await getJson(CG_MARKETS, 900000); status.cg = r.code;
    if (r.t) {
      let t = r.t; if (!/\]\s*$/.test(t)) { const k = t.lastIndexOf('},{"id":"'); t = k > 0 ? t.slice(0, k + 1) + "]" : "[]"; }
      const list = JSON.parse(t);
      if (Array.isArray(list) && list.length >= 100) for (const x of list) {
        if (!x || !x.id) continue;
        const sym = String(x.symbol || "").toUpperCase(), price = Number(x.current_price) || 0, mcap = Number(x.market_cap) || 0;
        const maxS = Number(x.max_supply) > 0 ? Number(x.max_supply) : Number(x.total_supply) || 0;
        const circ = maxS > 0 && Number(x.circulating_supply) > 0 ? Math.min(1, Number(x.circulating_supply) / maxS) : null;
        if (Number(x.ath) > 0 && sym && (!(ath[sym] > 0) || Number(x.ath) > ath[sym] || Number(x.market_cap_rank) <= 300)) { if (ath[sym] !== Number(x.ath)) { ath[sym] = sig(Number(x.ath)); athChanged = true; } }
        m[x.id] = [Number(x.market_cap_rank) || 0, sym, sig(price), Math.round(mcap), Math.round(Number(x.total_volume) || 0),
          pct1(x.price_change_percentage_24h), pct1(x.price_change_percentage_7d_in_currency), pct1(x.price_change_percentage_30d_in_currency), 1,
          pct1(x.ath_change_percentage), null, circ == null ? null : Math.round(circ * 1000) / 1000];
      }
    }
    if (Object.keys(m).length >= 100) status.src = "cg";
  } catch (e) { status.cg = status.cg || -1; }
  // 3) 코인로어 (둘 다 막혔을 때)
  if (Object.keys(m).length < 100) {
    status.src = "cl";
    for (const start of [0, 100]) {
      try {
        const r = await getJson(CL_TICKERS + start + "&limit=100", 400000); status["cl" + start] = r.code;
        if (!r.t) continue;
        const d = JSON.parse(r.t); const list = (d && d.data) || [];
        for (const x of list) {
          const sym = String(x.symbol || "").toUpperCase(), price = Number(x.price_usd) || 0, mcap = Number(x.market_cap_usd) || 0;
          if (!sym || !(price > 0)) continue;
          if (ath[sym] > 0 && price > ath[sym]) { ath[sym] = sig(price); athChanged = true; }
          const fromAth = ath[sym] > 0 ? (price / ath[sym] - 1) * 100 : null;
          const maxS = Number(x.msupply) > 0 ? Number(x.msupply) : Number(x.tsupply) || 0;
          const circ = maxS > 0 && Number(x.csupply) > 0 ? Math.min(1, Number(x.csupply) / maxS) : null;
          const old = prevBySym[sym];
          m["cl:" + (x.nameid || x.id)] = [Number(x.rank) || 0, sym, sig(price), Math.round(mcap), Math.round(Number(x.volume24) || 0),
            pct1(x.percent_change_24h), pct1(x.percent_change_7d), old ? old[7] : null, 2, pct1(fromAth), null, circ == null ? null : Math.round(circ * 1000) / 1000];
        }
      } catch (e) { status["cl" + start] = status["cl" + start] || -1; }
    }
  }
  // 30일 변동이 없으면 업비트 주봉(최근 4주)으로 채운다 — 업비트 원화마켓 코인만
  const weeks = parse(kv.weeks, {}); let w4 = 0;
  for (const a of Object.values(m)) { if (a[7] != null) continue; const w = (weeks[a[1]] || {}).w;
    if (Array.isArray(w) && w.length >= 5 && w[4] && w[4][3] > 0 && w[0] && w[0][3] > 0) { a[7] = pct1((w[0][3] / w[4][3] - 1) * 100); w4++; } }
  status.w4 = w4;
  status.n = Object.keys(m).length; status.code = status.src === "cmc" ? status.cmc : status.src === "cg" ? status.cg : (status.cl0 || status.cg);
  if (status.n < 100) { await put(db, "cp_status", status, now).run(); return status; }
  const writes = [put(db, "cp", { t: now, src: status.src, m }, now), put(db, "cp_status", status, now)];
  if (athChanged) writes.push(put(db, "ath", ath, now));
  await db.batch(writes);
  return status;
}

// 시세 찾기: 코인게코 id → 심볼(시총 큰 것) 순서
export function marketIndex(m) {
  const bySym = new Map();
  for (const [id, a] of Object.entries(m || {})) { const s = String(a[1] || "").toUpperCase(); const cur = bySym.get(s); if (!cur || (Number(a[3]) || 0) > (Number(m[cur][3]) || 0)) bySym.set(s, id); }
  return { m: m || {}, bySym };
}
export function marketKey(idx, b) {
  if (b.cg && idx.m[b.cg]) return b.cg;
  for (const s of [b.sym, b.kr]) { if (!s) continue; const id = idx.bySym.get(String(s).toUpperCase()); if (id) return id; }
  return null;
}

// ── 초기 데이터 (public/sector_seed.json) — 버전이 바뀌었을 때 한 번만 넣는다 ──
// D1이 원본이라, 이미 있는 섹터·코인은 D1 값을 그대로 두고 새 항목(과 새로 생긴 필드)만 더한다.
export const SEED_VERSION = "2026-10-17a";
export async function maybeSeed(env, now = Date.now()) {
  const db = env.DB;
  const cur = await db.prepare("SELECT v FROM kv WHERE k = 'sector_seed_v'").first();
  if (cur && cur.v === SEED_VERSION) return false;
  const res = await env.ASSETS.fetch("https://assets.local/sector_seed.json");
  if (!res.ok) return false;
  const d = await res.json();
  if (d.version !== SEED_VERSION) return false;
  const st = [];
  for (const x of d.sectors || []) st.push(db.prepare("INSERT INTO sectors (id, ord, json) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET json = json_patch(excluded.json, sectors.json)").bind(x.id, x.ord, JSON.stringify(x)));
  for (const c of d.coins || []) st.push(db.prepare("INSERT INTO coin_base (sym, sector, json) VALUES (?1, ?2, ?3) ON CONFLICT(sym) DO UPDATE SET json = json_patch(excluded.json, coin_base.json)").bind(c.sym, c.sector, JSON.stringify(c)));
  const old = await db.prepare("SELECT v FROM kv WHERE k = 'sector_excluded'").first();
  const ex = (d.excluded || []).slice(), have = new Set(ex.map(e => e[0]));
  for (const e of parse(old && old.v, [])) if (Array.isArray(e) && !have.has(e[0])) { ex.push(e); have.add(e[0]); }
  st.push(put(db, "sector_excluded", ex, now));
  st.push(put(db, "sector_groups", d.groups || [], now));
  if (d.ath) { const oa = await db.prepare("SELECT v FROM kv WHERE k = 'ath'").first(); const a = parse(oa && oa.v, {});
    for (const [k, v] of Object.entries(d.ath)) if (!(a[k] >= v)) a[k] = v; st.push(put(db, "ath", a, now)); }
  st.push(db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('sector_seed_v', ?1, ?2)").bind(SEED_VERSION, now));
  st.push(db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('rank_req', ?1, ?2)").bind(String(now), now));
  await db.batch(st);
  return true;
}

// ── 빗썸 원화마켓 목록 (1시간마다) ──
export async function watchBithumb(env, now = Date.now()) {
  let syms = null, code = 0, warn = null;
  try {
    // isDetails=true면 유의 종목(market_warning: CAUTION)도 함께 온다
    const r = await fetch("https://api.bithumb.com/v1/market/all?isDetails=true", { headers: UA }); code = r.status;
    if (r.ok) { const a = await r.json(); if (Array.isArray(a)) {
      const krw = a.filter(x => String(x.market || "").startsWith("KRW-"));
      syms = krw.map(x => x.market.slice(4));
      warn = krw.filter(x => x.market_warning === "CAUTION" || (x.market_event && x.market_event.warning === true)).map(x => x.market.slice(4));
    } }
    else { try { r.body && r.body.cancel(); } catch (e) {} }
  } catch (e) {}
  if (!syms || syms.length < 50) {
    try {
      const r = await fetch("https://api.bithumb.com/public/ticker/ALL_KRW", { headers: UA }); code = r.status;
      if (r.ok) { const j = await r.json(); syms = Object.keys((j && j.data) || {}).filter(k => k !== "date"); }
    } catch (e) {}
  }
  if (!syms || syms.length < 50) { await put(env.DB, "bithumb_status", { code, at: now }, now).run(); return; }
  await env.DB.batch([put(env.DB, "bithumb_krw", syms, now), ...(warn ? [put(env.DB, "bithumb_warn", warn, now)] : [])]);
}

// ── 바이낸스 USDⓈ-M 무기한 선물 목록 (6시간마다) — fapi.binance.com은 Cloudflare 위치에서 403이라 코인게코 파생상품 정보로 받는다 ──
export async function watchBinance(env, now = Date.now()) {
  // 6시간마다 새로 받되, 실패하면 다음 시간에 다시 시도한다 (코인게코 → 코인마켓캡 순서)
  const last = await env.DB.prepare("SELECT ts FROM kv WHERE k = 'bnf'").first().catch(() => null);
  if (last && now - Number(last.ts) < 6 * HOUR - 10 * 60000) return;
  const ALIAS = { RAYSOL: "RAY", BEAMX: "BEAM", LUNA2: "LUNA" };
  const norm = x => { const s = x.toUpperCase().replace(/^1000+/, "").replace(/^1M(?=[A-Z])/, ""); return ALIAS[s] || s; };
  const tries = [
    ["cg", "https://api.coingecko.com/api/v3/derivatives/exchanges/binance_futures?include_tickers=unexpired",
      /"base":"([A-Za-z0-9]+)","target":"(USDT|USDC)"/g, m => m[1]],
    ["cmc", "https://api.coinmarketcap.com/data-api/v3/exchange/market-pairs/latest?slug=binance&category=perpetual&start=1&limit=1000",
      /"category":"([a-z]+)"[^{}]*?"baseSymbol":"([^"]+)"[^{}]*?"quoteSymbol":"(USDT|USDC)"/g, m => m[1] === "spot" ? null : m[2]],
  ];
  const st = { at: now };
  for (const [name, url, re, pick] of tries) {
    try {
      const r = await fetch(url, { headers: UA }); st[name] = r.status;
      if (!r.ok) { try { r.body && r.body.cancel(); } catch (e) {} continue; }
      const t = await readHead(r, 2500000); const set = new Set(); let mt;
      while ((mt = re.exec(t))) { const b = pick(mt); if (b) set.add(norm(b)); }
      if (set.size > 100) {
        await put(env.DB, "bnf", [...set], now).run();
        await put(env.DB, "bnf_status", { ...st, src: name, n: set.size, code: 200 }, now).run(); return;
      }
      st[name + "_n"] = set.size;
    } catch (e) { st[name + "_err"] = String(e).slice(0, 80); }
  }
  await put(env.DB, "bnf_status", st, now).run();
}

// 실제 수익 데이터(DefiLlama) → 품질 점수 두 항목의 데이터 점수 (각 0~20)
//   실사용·수익: 연환산 수수료 F — 100만 달러=4 · 1,000만=8 · 1억=12 · 10억=16 · 100억 달러=20
//   토큰 가치 포착: 보유자 몫 C = max(보유자 수익, 매출의 절반)을 시총으로 나눈 비율 — 1%=8 · 3%≈12 · 10%=16 · 30%≈20, 없으면 2
//   (30일 값을 1년으로 환산하되, 30일이 비었으면 1년 합계의 절반을 바닥으로 쓴다)
const NO_FEE_SECTORS = new Set(["pow", "privacy"]);
export function feeScore(f, mcap) {
  if (!f || (f[0] == null && f[3] == null && f[5] == null)) return null;
  const yr = (d30, y1) => Math.max(d30 != null ? d30 * 365 / 30 : 0, y1 != null ? y1 * 0.5 : 0);
  const F = yr(f[0], f[2]), R = yr(f[3], f[4]), H = yr(f[5], f[6]);
  const d0 = f[0] == null && f[2] == null ? null : (F > 0 ? clamp(4 * Math.log10(F / 1e6) + 4, 0, 20) : 0);
  const C = Math.max(H, R * 0.5);
  const d1 = !(mcap > 0) ? null : C > 0 ? clamp(8 + 8 * Math.log10(C / mcap / 0.01), 0, 20) : 2;
  return [d0 == null ? null : r1(d0), d1 == null ? null : r1(d1)];
}

// ── 순위 계산 (순수 함수: 테스트용으로 따로 둔다) ──
// coins: [{sym, sector, cp, q:[5], core, off}], news: [{sym, ts, impact, kind, t, u, pub}], cp: {id: arr}, sectors: {id: score}, prev: 직전 스냅숏
export function rankCore({ now, sectors, coins, news, cp, prev, warn, fees }) {
  const R = RULES;
  const nsum = {}, ntop = {};
  for (const x of news || []) {
    const hl = (R.hl[x.kind] || R.hl.normal) * DAY;
    const t0 = Number(x.pub) > 0 ? Number(x.pub) : Number(x.ts);
    const v = Number(x.impact) * Math.pow(0.5, Math.max(0, now - t0) / hl);
    if (!isFinite(v)) continue;
    nsum[x.sym] = (nsum[x.sym] || 0) + v;
    (ntop[x.sym] = ntop[x.sym] || []).push([x.t || "", x.u || "", r1(v), x.kind || "normal", t0]);
  }
  const pc = (prev && prev.c) || {}, ptrail = (prev && prev.trail) || {};
  const idx = marketIndex(cp);
  const pchal = sym => (pc[sym] && pc[sym][2] === 2) ? (pc[sym][7] || 0) : 0;
  const rows = {}, bySec = {};
  for (const b of coins) {
    if (b.off) continue;
    const mk0 = marketKey(idx, b), m0 = mk0 ? cp[mk0] : null;
    const q = Array.isArray(b.q) ? b.q.slice() : [];
    const qd = feeScore(fees && fees[b.sym], m0 ? Number(m0[3]) || 0 : 0);
    // 실제 수익 데이터가 있으면 '실사용·수익'과 '토큰 가치 포착'을 수동 점수와 반반 섞는다
    // PoW·프라이버시 코인은 화폐 성격이라 수수료로 가치를 재지 않는다 (데이터는 보여주기만)
    if (qd && q.length === 5 && !NO_FEE_SECTORS.has(b.sector)) { if (qd[0] != null) q[0] = Math.round(((Number(q[0]) || 0) + qd[0]) / 2); if (qd[1] != null) q[1] = Math.round(((Number(q[1]) || 0) + qd[1]) / 2); }
    const Q = q.reduce((s, x) => s + (Number(x) || 0), 0);
    // 업비트·빗썸 유의 종목이면 지정이 풀릴 때까지 뉴스 점수에서 8점을 뺀다
    const wv = warn ? (warn[b.kr || b.sym] || warn[b.sym] || null) : null;
    const N = clamp((nsum[b.sym] || 0) - (wv ? R.warn : 0), -R.nmax, R.nmax);
    const m = m0;
    const row = { sym: b.sym, sec: b.sector, Q, N: r1(N), S: 0, score: null, rank: null, el: false, why: "", pos: 0, lg: 0, chal: 0, warn: wv, qd: NO_FEE_SECTORS.has(b.sector) ? null : qd };
    rows[b.sym] = row;
    if (b.core) row.why = "core";
    if (!m) { row.why = row.why || "nodata"; continue; }
    const rank = Number(m[0]), mcap = Number(m[3]) || 0, vol = Number(m[4]) || 0;
    const S = mcap > 0 ? clamp((Math.log10(mcap) - 8) / 3 * 100, 0, 100) : 0;
    row.S = r1(S); row.rank = rank;
    row.score = r1(R.w[0] * Q + R.w[1] * S + R.w[2] * (Number(sectors[b.sector]) || 50) + N);
    if (b.core) continue;
    if (!(rank > 0 && rank <= R.cap)) { row.why = "rank"; continue; }
    if (!(mcap > 0 && vol / mcap >= R.liq)) { row.why = "liq"; continue; }
    row.el = true;
    (bySec[b.sector] = bySec[b.sector] || []).push(row);
  }
  const via = {};
  for (const [sec, arr] of Object.entries(bySec)) {
    arr.sort((a, b) => b.score - a.score || a.rank - b.rank);
    const maj = new Set(prev ? arr.filter(x => pc[x.sym] && pc[x.sym][0] === sec && pc[x.sym][2] === 1).map(x => x.sym) : arr.slice(0, 3).map(x => x.sym));
    for (const x of arr) { if (maj.size >= 3) break; if (!maj.has(x.sym)) { maj.add(x.sym); if (prev) via[x.sym] = "fill"; } }
    while (maj.size > 3) { const lo = arr.filter(x => maj.has(x.sym)).pop(); maj.delete(lo.sym); }
    // 도전: 2군 1등 vs 1군 꼴찌
    for (let g = 0; g < 3; g++) {
      const majors = arr.filter(x => maj.has(x.sym)); if (majors.length < 3) break;
      const weak = majors.reduce((a, b) => (b.score < a.score ? b : a));
      const cand = arr.find(x => !maj.has(x.sym)); if (!cand) break;
      if (cand.score - weak.score < R.margin) break;
      const streak = pchal(cand.sym) + 1;
      if (streak >= R.need || cand.N >= R.fast) { maj.delete(weak.sym); maj.add(cand.sym); via[cand.sym] = streak >= R.need ? "chal" : "fast"; continue; }
      break;
    }
    const majors = arr.filter(x => maj.has(x.sym)), minors = arr.filter(x => !maj.has(x.sym));
    const weak = majors.length >= 3 ? majors.reduce((a, b) => (b.score < a.score ? b : a)) : null;
    majors.forEach((x, i) => { x.pos = i + 1; x.lg = 1; x.chal = 0; });
    minors.forEach((x, i) => { x.pos = majors.length + i + 1; x.lg = 2; x.chal = (weak && x.score - weak.score >= R.margin) ? pchal(x.sym) + 1 : 0; });
  }
  // 스냅숏: c[sym] = [섹터, 순위, 리그(1·2, 0=후보 아님), 점수, 품질, 규모, 뉴스, 도전 횟수, 시총 순위, 후보 아닌 이유, 유의 거래소(없으면 null), 데이터 점수[실사용, 가치 포착](없으면 null)]
  const c = {}, trail = {}, moves = [], top = {};
  for (const x of Object.values(rows)) {
    c[x.sym] = [x.sec, x.pos, x.lg, x.score, x.Q, x.S, x.N, x.chal, x.rank, x.why, x.warn || null, x.qd || null];
    const t = (ptrail[x.sym] || []).concat([x.pos || 0]).slice(-RULES.keep);
    if (t.some(Boolean)) trail[x.sym] = t;
    const p = pc[x.sym];
    const pl = p ? p[2] : 0, pp = p ? p[1] : 0;
    if (pl === 2 && x.lg === 1) moves.push(["promo", x.sym, x.sec, pp, x.pos, via[x.sym] || ""]);
    else if (pl === 1 && x.lg === 2) moves.push(["demo", x.sym, x.sec, pp, x.pos, ""]);
    else if (prev && !pl && x.lg) moves.push(["in", x.sym, x.sec, 0, x.pos, x.lg === 1 ? (via[x.sym] || "") : ""]);
    else if (pl && !x.lg) moves.push(["out", x.sym, x.sec, pp, 0, x.why]);
    else if (pl && x.lg && p[0] === x.sec && pp !== x.pos) moves.push([pp > x.pos ? "up" : "down", x.sym, x.sec, pp, x.pos, ""]);
    if (x.warn && !(p && p[10])) moves.push(["warn", x.sym, x.sec, pp, x.pos, x.warn]);
    else if (!x.warn && p && p[10]) moves.push(["unwarn", x.sym, x.sec, pp, x.pos, p[10]]);
    const nt = (ntop[x.sym] || []).filter(n => Math.abs(n[2]) >= 0.3).sort((a, b) => Math.abs(b[2]) - Math.abs(a[2])).slice(0, 3);
    if (nt.length) top[x.sym] = nt;
  }
  return { v: 1, ts: now, id: kstId(now), c, trail, moves, news: top, rules: { cap: R.cap, liq: R.liq, margin: R.margin, need: R.need, fast: R.fast, w: R.w, hl: R.hl } };
}

export async function computeRanks(env, now = Date.now()) {
  const db = env.DB;
  const [sq, bq, nq, kq, pq, wq] = await Promise.all([
    db.prepare("SELECT id, json_extract(json,'$.score') AS score FROM sectors").all(),
    db.prepare("SELECT sym, sector, json_extract(json,'$.cg') AS cg, json_extract(json,'$.kr') AS kr, json_extract(json,'$.q') AS q, json_extract(json,'$.core') AS core, json_extract(json,'$.off') AS off FROM coin_base").all(),
    db.prepare("SELECT sym, ts, impact, kind, json_extract(json,'$.title') AS t, json_extract(json,'$.url') AS u, json_extract(json,'$.pub') AS pub FROM coin_news WHERE ts > ?1").bind(now - 240 * DAY).all(),
    db.prepare("SELECT v, ts FROM kv WHERE k = 'cp'").all(),
    db.prepare("SELECT json FROM rankings ORDER BY ts DESC LIMIT 1").all(),
    db.prepare("SELECT k, v FROM kv WHERE k IN ('upbit_krw', 'bithumb_warn', 'fees')").all(),
  ]);
  const cpRow = (kq.results || [])[0]; if (!cpRow) return null;
  const warn = {};
  let fees = null;
  for (const r of (wq.results || [])) {
    if (r.k === "fees") { fees = parse(r.v, {}).m || null; continue; }
    if (r.k === "upbit_krw") for (const [mkt, v] of Object.entries(parse(r.v, {}))) { if (v && v.w) { const k = mkt.replace(/^KRW-/, ""); warn[k] = warn[k] ? "업비트·" + warn[k] : "업비트"; } }
    else for (const sym of parse(r.v, [])) warn[sym] = warn[sym] ? warn[sym] + "·빗썸" : "빗썸";
  }
  const cp = parse(cpRow.v, {}).m || {};
  const sectors = Object.fromEntries((sq.results || []).map(r => [r.id, Number(r.score) || 50]));
  const coins = (bq.results || []).map(r => ({ sym: r.sym, sector: r.sector, cg: r.cg, kr: r.kr, q: parse(r.q, []), core: !!r.core, off: !!r.off }));
  const prevRow = (pq.results || [])[0];
  const snap = rankCore({ now, sectors, coins, news: nq.results || [], cp, prev: prevRow ? parse(prevRow.json, null) : null, warn, fees });
  snap.cp_at = Number(cpRow.ts) || null;
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO rankings (id, ts, json) VALUES (?1, ?2, ?3)").bind(snap.id, now, JSON.stringify(snap)),
    db.prepare("DELETE FROM rankings WHERE ts < ?1").bind(now - 60 * DAY),
    db.prepare("DELETE FROM kv WHERE k = 'rank_err'"),
  ]);
  return snap;
}

// 예약 실행이 순위 계산을 요청했거나(kv rank_req) 마지막 계산이 11시간 넘었으면 계산한다. 실패하면 1시간 동안 다시 시도하지 않는다.
export async function maybeRanks(env, now = Date.now()) {
  const st = await env.DB.prepare(`SELECT (SELECT ts FROM kv WHERE k = 'rank_req') AS req, (SELECT ts FROM kv WHERE k = 'cp') AS cpt,
    (SELECT max(ts) FROM rankings) AS last, (SELECT ts FROM kv WHERE k = 'rank_err') AS err`).first();
  if (!st || !st.cpt) return false;
  const last = Number(st.last || 0), req = Number(st.req || 0), err = Number(st.err || 0);
  if (!(req > last) && now - last < 11 * 3600e3) return false;
  if (err && now - err < 3600e3) return false;
  try { await computeRanks(env, now); }
  catch (e) { await put(env.DB, "rank_err", { at: now, msg: String(e && e.message || e).slice(0, 200) }, now).run(); }
  return true;
}

// 예약 실행이 뉴스 점수를 넣고 kv rank_req를 남긴 뒤 /api/rank-now 를 부르면 바로 계산해 이동 결과를 돌려준다.
// 요청이 없으면 아무것도 하지 않는다 (누가 불러도 무해).
export async function rankNow(env, now = Date.now()) {
  const st = await env.DB.prepare(`SELECT (SELECT ts FROM kv WHERE k = 'rank_req') AS req, (SELECT max(ts) FROM rankings) AS last, (SELECT ts FROM kv WHERE k = 'cp') AS cpt`).first();
  const req = Number((st && st.req) || 0), last = Number((st && st.last) || 0);
  if (!st || !st.cpt || !(req > last)) return { computed: false, last: last || null, req: req || null };
  const snap = await computeRanks(env, now);
  if (!snap) return { computed: false, last };
  return { computed: true, id: snap.id, ts: snap.ts, moves: snap.moves.filter(m => m[0] !== "up" && m[0] !== "down"), shifts: snap.moves.filter(m => m[0] === "up" || m[0] === "down").length };
}

// ── API 조각 (저장된 JSON을 다시 파싱하지 않고 이어 붙인다) ──
export async function apiSectors(db) {
  const [rq, kq, sq, bq] = await Promise.all([
    db.prepare("SELECT json FROM rankings ORDER BY ts DESC LIMIT 1").all(),
    db.prepare("SELECT k, v FROM kv WHERE k IN ('cp', 'upbit_krw', 'bithumb_krw', 'bnf', 'sector_excluded', 'sector_groups', 'mine', 'fees', 'fund', 'unlocks')").all(),
    db.prepare("SELECT json FROM sectors ORDER BY ord").all(),
    db.prepare("SELECT json FROM coin_base").all(),
  ]);
  const kv = Object.fromEntries((kq.results || []).map(r => [r.k, r.v]));
  const v = k => kv[k] || "null";
  const r = (rq.results || [])[0];
  return `{"rank":${r ? r.json : "null"},"sectors":[${(sq.results || []).map(x => x.json).join(",")}],"coins":[${(bq.results || []).map(x => x.json).join(",")}],` +
    `"kv":{"cp":${v("cp")},"upbit":${v("upbit_krw")},"bithumb":${v("bithumb_krw")},"bnf":${v("bnf")},"ex":${v("sector_excluded")},"groups":${v("sector_groups")},"mine":${v("mine")},"fees":${v("fees")},"fund":${v("fund")},"unlocks":${v("unlocks")}}}`;
}

export async function apiSectorCoin(db, sym) {
  const path = '$.c."' + sym.replace(/"/g, "") + '"';
  const [hq, nq] = await Promise.all([
    db.prepare("SELECT ts, json_extract(json, ?1) AS x FROM rankings ORDER BY ts DESC LIMIT 60").bind(path).all(),
    db.prepare("SELECT id, ts, impact, kind, json FROM coin_news WHERE sym = ?1 ORDER BY ts DESC LIMIT 20").bind(sym).all(),
  ]);
  const hist = (hq.results || []).filter(x => x.x).map(x => `[${Number(x.ts)},${x.x}]`).join(",");
  const news = (nq.results || []).map(x => `{"id":${JSON.stringify(x.id)},"ts":${Number(x.ts)},"impact":${Number(x.impact)},"kind":${JSON.stringify(x.kind)},"n":${x.json}}`).join(",");
  return `{"sym":${JSON.stringify(sym)},"hist":[${hist}],"news":[${news}]}`;
}
