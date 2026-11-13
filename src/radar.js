// 내러티브 레이더 — 해외에서 먼저 뜨는 코인·섹터를 모으고, 국내(업비트·빗썸) 상장 여부와 맞춰 본다.
// 사이트(AI 없음)가 cron 빈칸에서 한 번에 한 가지씩 모은다 (무료 요금제 CPU 10ms):
//   tr    코인게코 트렌딩(검색 관심 상위 15개 + 카테고리) — 2시간마다, 등장 횟수를 날짜별로 쌓음
//   cat   코인게코 카테고리(섹터) 시총·24시간 변화 — 8시간마다, 날짜별 시총으로 7일 변화 계산
//   ex_*  해외 거래소 현물 목록(코인마켓캡 공개 데이터: 바이낸스·코인베이스·OKX·바이비트) — 거래소마다 12시간
//   px    레이더에 올랐던 코인(최근 60일)의 지금 가격 — 12시간마다 (성적 확인용)
//   view  위 데이터 + 업비트·빗썸·바이낸스 선물 목록 + 시세(kv cp)를 합쳐 화면용 JSON(kv radar)을 미리 계산
// AI(예약 실행 '내러티브 레이더', 하루 1번)는 kv radar를 보고 왜 뜨는지 확인해 radar_notes(id, ts, json)에 쓴다.
//
// kv radar_st  = {tr|cat|ex_bn|…|px|view: {ok: 마지막 성공, at: 마지막 시도, code, n, err}, dirty: 새 데이터가 있어 view를 다시 계산해야 함}
// kv radar_tr  = {t, smp: {날짜: 표본 수}, seen: {코인게코 id: {s, n, k, p, c, m, v, r, f(처음 본 때), l(마지막), d: {날짜: 횟수}}}, cats: {이름: {g, c, l, d}}, cur: [id], ccur: [이름]}
// kv radar_cat = {t, cur: {id: [이름, 시총$, 24h%, 거래대금$, [상위 3 id]]}, h: {id: {날짜: 시총$}}}
// kv radar_ex  = {bn|cb|ok|by: {t, s: [심볼]}}
// kv radar_px  = {t, m: {코인게코 id: 가격$}}

import { kstDay } from "./extra.js";
import { marketIndex } from "./sectors.js";

const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
const UA = { "user-agent": "Mozilla/5.0 (compatible; AI-Coin-Research/1.0; +https://coin-desk.kwana1016.workers.dev)", accept: "application/json" };
const CG = "https://api.coingecko.com/api/v3";
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const sig = x => (x == null || !isFinite(x)) ? null : Number(Number(x).toPrecision(6));
const pct1 = x => (x == null || x === "" || !isFinite(Number(x))) ? null : Math.round(Number(x) * 10) / 10;
const put = (db, k, v, now) => db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES (?1, ?2, ?3)").bind(k, typeof v === "string" ? v : JSON.stringify(v), now);
const lastDays = (now, n) => Array.from({ length: n }, (_, i) => kstDay(now - i * DAY));

async function readHead(res, limit) {
  if (!res.body) return "";
  const reader = res.body.getReader(); const dec = new TextDecoder(); let out = "", n = 0;
  while (n < limit) { const { done, value } = await reader.read(); if (done) break; n += value.length; out += dec.decode(value, { stream: true }); }
  try { await reader.cancel(); } catch (e) {}
  return out;
}
// 코인게코는 Cloudflare 공용 IP에서 자주 429 — Worker 비밀값 CG_KEY(무료 Demo 키)가 있으면 붙인다
async function fetchText(env, url, limit) {
  const h = { ...UA };
  if (env.CG_KEY && url.startsWith(CG)) h["x-cg-demo-api-key"] = env.CG_KEY;
  const res = await fetch(url, { headers: h });
  if (!res.ok) { try { res.body && res.body.cancel(); } catch (e) {} return { code: res.status, t: "" }; }
  return { code: res.status, t: await readHead(res, limit) };
}
// "$578,647,688" · "$1.34T" · 숫자 → 달러 숫자
function money(x) {
  if (typeof x === "number") return isFinite(x) ? Math.round(x) : null;
  const m = /([0-9][0-9,]*\.?[0-9]*)\s*([KMBT])?/i.exec(String(x || "")); if (!m) return null;
  const v = Number(m[1].replace(/,/g, "")) * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || "").toUpperCase()] || 1);
  return isFinite(v) && v > 0 ? Math.round(v) : null;
}

// ── 1) 트렌딩 ──
async function doTrending(env, now, db) {
  const r = await fetchText(env, CG + "/search/trending", 900000);
  if (!r.t) return { code: r.code };
  const j = parse(r.t, null);
  const coins = ((j && j.coins) || []).map(x => x && x.item).filter(x => x && x.id);
  if (coins.length < 5) return { code: r.code, n: coins.length, err: "코인 목록이 비었음" };
  const row = await db.prepare("SELECT v FROM kv WHERE k = 'radar_tr'").first();
  const tr = parse(row && row.v, {}); tr.seen = tr.seen || {}; tr.cats = tr.cats || {}; tr.smp = tr.smp || {};
  const day = kstDay(now); tr.smp[day] = (tr.smp[day] || 0) + 1;
  const cur = [];
  coins.forEach((x, i) => {
    const id = String(x.id), d = x.data || {};
    const s = tr.seen[id] || (tr.seen[id] = { f: now, d: {} });
    s.s = String(x.symbol || "").toUpperCase().slice(0, 20); s.n = String(x.name || "").slice(0, 60);
    s.k = Number(x.market_cap_rank) || null; s.p = sig(Number(d.price));
    s.c = pct1(d.price_change_percentage_24h && d.price_change_percentage_24h.usd);
    s.m = money(d.market_cap); s.v = money(d.total_volume); s.r = i + 1; s.l = now;
    s.d[day] = (s.d[day] || 0) + 1; cur.push(id);
  });
  const ccur = [];
  for (const c of (j.categories || [])) {
    const nm = String((c && c.name) || "").slice(0, 60); if (!nm) continue;
    const e = tr.cats[nm] || (tr.cats[nm] = { d: {} });
    e.g = c.slug || e.g || null; e.l = now; e.d[day] = (e.d[day] || 0) + 1;
    e.c = pct1(c.data && c.data.market_cap_change_percentage_24h && c.data.market_cap_change_percentage_24h.usd);
    ccur.push(nm);
  }
  // 정리: 9일 넘은 날짜 칸 · 15일 동안 안 보인 코인·카테고리
  const keep = new Set(lastDays(now, 9));
  for (const o of [tr.smp, ...Object.values(tr.seen).map(s => s.d), ...Object.values(tr.cats).map(c => c.d)]) for (const k of Object.keys(o)) if (!keep.has(k)) delete o[k];
  for (const [k, s] of Object.entries(tr.seen)) if (now - (s.l || 0) > 15 * DAY) delete tr.seen[k];
  for (const [k, c] of Object.entries(tr.cats)) if (now - (c.l || 0) > 15 * DAY) delete tr.cats[k];
  tr.cur = cur; tr.ccur = ccur; tr.t = now;
  await put(db, "radar_tr", tr, now).run();
  return { ok: true, code: r.code, n: cur.length };
}

// ── 2) 카테고리(섹터) ──
// 생태계·투자사 포트폴리오·스테이블·래핑·지수처럼 '이야기'가 아닌 분류와, 시총 3,000억 달러가 넘는 너무 넓은 분류(L1 등)는 뺀다
const CAT_SKIP = /ecosystem|portfolio|holdings|stablecoin|wrapped|bridged|made-in|index|alleged|gmci|proof-of-|gold|silver|commodit|fan-token|hodler|airdrop|exchange-based|centralized-exchange|-usd|usd-|eur-|-eur|world-liberty|binance-alpha|coinbase-50/i;
async function doCats(env, now, db) {
  const r = await fetchText(env, CG + "/coins/categories", 3000000);
  if (!r.t) return { code: r.code };
  const list = parse(r.t, null);
  if (!Array.isArray(list) || list.length < 50) return { code: r.code, n: Array.isArray(list) ? list.length : 0, err: "카테고리 목록이 비었음" };
  const row = await db.prepare("SELECT v FROM kv WHERE k = 'radar_cat'").first();
  const cat = parse(row && row.v, {}); cat.h = cat.h || {};
  const day = kstDay(now), cur = {};
  for (const x of list) {
    const id = x && x.id, mc = Number(x && x.market_cap);
    if (!id || !(mc >= 2e7) || mc > 3e11 || CAT_SKIP.test(id)) continue;
    cur[id] = [String(x.name || id).slice(0, 60), Math.round(mc), pct1(x.market_cap_change_24h), Math.round(Number(x.volume_24h) || 0),
      (Array.isArray(x.top_3_coins_id) ? x.top_3_coins_id : []).slice(0, 3).map(s => String(s).slice(0, 40))];
    (cat.h[id] || (cat.h[id] = {}))[day] = Math.round(mc);
  }
  const keep = new Set(lastDays(now, 10));
  for (const [id, h] of Object.entries(cat.h)) { for (const k of Object.keys(h)) if (!keep.has(k)) delete h[k]; if (!Object.keys(h).length) delete cat.h[id]; }
  cat.cur = cur; cat.t = now;
  await put(db, "radar_cat", cat, now).run();
  return { ok: true, code: r.code, n: Object.keys(cur).length };
}

// ── 3) 해외 거래소 현물 목록 (코인마켓캡 공개 데이터 — 바이낸스 선물 목록 watchBinance와 같은 방식) ──
const EX = { bn: "binance", cb: "coinbase-exchange", ok: "okx", by: "bybit" };
async function doEx(key, env, now, db) {
  const r = await fetchText(env, `https://api.coinmarketcap.com/data-api/v3/exchange/market-pairs/latest?slug=${EX[key]}&category=spot&start=1&limit=1000`, 2500000);
  if (!r.t) return { code: r.code };
  const set = new Set(), re = /"baseSymbol":"([^"]{1,20})"/g; let m;
  while ((m = re.exec(r.t))) set.add(m[1].toUpperCase());
  if (set.size < 50) return { code: r.code, n: set.size, err: "목록이 너무 적음" };
  const row = await db.prepare("SELECT v FROM kv WHERE k = 'radar_ex'").first();
  const ex = parse(row && row.v, {}); ex[key] = { t: now, s: [...set] };
  await put(db, "radar_ex", ex, now).run();
  return { ok: true, code: r.code, n: set.size };
}

// ── 4) 레이더 성적용 가격 ──
async function doPx(env, now, db) {
  let ids = [];
  try {
    const { results } = await db.prepare("SELECT DISTINCT json_extract(j.value,'$.id') AS id FROM radar_notes r, json_each(r.json,'$.picks') j WHERE r.ts > ?1").bind(now - 60 * DAY).all();
    ids = (results || []).map(x => String(x.id || "")).filter(x => /^[a-z0-9][a-z0-9-]{0,60}$/.test(x));
  } catch (e) { return { ok: true, n: 0, err: "radar_notes 없음" }; }
  if (!ids.length) return { ok: true, n: 0 };
  ids = [...new Set(["bitcoin", ...ids])].slice(0, 120);
  const r = await fetchText(env, `${CG}/simple/price?ids=${ids.join(",")}&vs_currencies=usd`, 200000);
  if (!r.t) return { code: r.code };
  const j = parse(r.t, {}), m = {};
  for (const [id, v] of Object.entries(j || {})) if (v && Number(v.usd) > 0) m[id] = sig(Number(v.usd));
  if (!m.bitcoin) return { code: r.code, err: "가격이 비었음" };
  await put(db, "radar_px", { t: now, m }, now).run();
  return { ok: true, code: r.code, n: Object.keys(m).length };
}

// ── 5) 화면용 계산 ──
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function sameName(a, b) {
  const x = norm(a), y = norm(b); if (!x || !y) return true;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const fa = String(a).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0], fb = String(b).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0];
  return !!fa && fa === fb && fa.length >= 3;
}
async function doView(env, now, db) {
  const [kq, bq] = await Promise.all([
    db.prepare("SELECT k, v FROM kv WHERE k IN ('radar_tr','radar_cat','radar_ex','cp','upbit_krw','bithumb_krw','bnf','sector_excluded')").all(),
    db.prepare("SELECT sym, sector, json_extract(json,'$.kr') AS kr, json_extract(json,'$.ko') AS ko FROM coin_base").all(),
  ]);
  const kv = Object.fromEntries((kq.results || []).map(r => [r.k, r.v]));
  const tr = parse(kv.radar_tr, {}), cat = parse(kv.radar_cat, {}), ex = parse(kv.radar_ex, {});
  const up = parse(kv.upbit_krw, {}), bt = new Set(parse(kv.bithumb_krw, [])), bf = new Set(parse(kv.bnf, []));
  const exs = Object.fromEntries(Object.keys(EX).map(k => [k, new Set((ex[k] && ex[k].s) || [])]));
  const cp = parse(kv.cp, {}), idx = marketIndex(cp.m || {});
  const exl = new Set(parse(kv.sector_excluded, []).map(e => Array.isArray(e) ? String(e[2] || "").toUpperCase() : "").filter(Boolean));
  const base = Object.fromEntries((bq.results || []).map(r => [r.sym, r]));
  // 국내·해외 상장 표시: up 1=업비트 원화(이름도 맞음) 2=심볼만 같은 다른 코인일 수 있음
  const flags = (sym, name) => {
    const b = base[sym]; let u = 0;
    for (const s of [sym, b && b.kr]) { if (!s) continue; const e = up["KRW-" + s]; if (e) { u = (s !== sym || sameName(name, e.e)) ? 1 : (u || 2); if (u === 1) break; } }
    const f = { up: u, bt: bt.has(sym) ? 1 : 0, bf: bf.has(sym) ? 1 : 0 };
    for (const k of Object.keys(EX)) f[k] = exs[k].has(sym) ? 1 : 0;
    return f;
  };
  const mkOf = (sym, mcap) => { const id = idx.bySym.get(sym); const a = id ? idx.m[id] : null; if (!a) return null;
    if (mcap > 0 && Number(a[3]) > 0 && (Number(a[3]) / mcap > 2.5 || mcap / Number(a[3]) > 2.5)) return null; return a; };
  const d7 = lastDays(now, 7), d7s = new Set(d7);
  const smp = tr.smp || {}, smp7 = d7.reduce((s, d) => s + (smp[d] || 0), 0), trackDays = Object.keys(smp).length;
  const cur = new Set(tr.cur || []);
  const hot = Object.entries(tr.seen || {}).filter(([, s]) => now - (s.l || 0) <= 7 * DAY).map(([id, s]) => {
    const h7 = d7.reduce((a, d) => a + ((s.d || {})[d] || 0), 0), dd = d7.filter(d => (s.d || {})[d]).length;
    const mk = mkOf(s.s, s.m), b = base[s.s], fl = flags(s.s, s.n);
    return { id, s: s.s, n: s.n, k: s.k, p: s.p, c24: s.c, m: s.m, v: s.v, now: cur.has(id) ? 1 : 0, r: cur.has(id) ? s.r : null, h7, d7: dd, f: s.f, l: s.l,
      c7: mk ? mk[6] : null, c30: mk ? mk[7] : null, ath: mk ? mk[9] : null, circ: mk ? mk[11] : null,
      sec: b ? b.sector : null, x: fl, ko: b ? b.ko : (fl.up === 1 && up["KRW-" + s.s] ? up["KRW-" + s.s].n : null), sc: dd * 3 + h7 + (cur.has(id) ? 2 : 0) };
  }).sort((a, b) => b.sc - a.sc || (a.r || 99) - (b.r || 99)).slice(0, 40);
  // 시총 300위 안 7일 급등 + 업비트 원화 미상장 (스테이블·래핑 등 제외 목록은 뺌)
  const hotSyms = new Set(hot.map(h => h.s));
  const gain = Object.entries(cp.m || {}).filter(([, a]) => a[0] >= 1 && a[0] <= 300 && Number(a[6]) >= 15 && Number(a[6]) < 1000 && Math.abs(Number(a[5]) || 0) < 1000 && Number(a[3]) >= 5e7 && Number(a[4]) >= Number(a[3]) * 0.02 && !exl.has(String(a[1]).toUpperCase()))
    .map(([key, a]) => { const sym = String(a[1]).toUpperCase(); return { key, s: sym, k: a[0], p: a[2], m: a[3], v: a[4], c24: a[5], c7: a[6], c30: a[7], ath: a[9], circ: a[11], sec: base[sym] ? base[sym].sector : null, ko: base[sym] ? base[sym].ko : null, tr: hotSyms.has(sym) ? 1 : 0, x: flags(sym, key.replace(/^[a-z]+:/, "").replace(/-/g, " ")) }; })
    .filter(g => g.x.up !== 1).sort((a, b) => b.c7 - a.c7).slice(0, 15);
  // 카테고리: 7일 변화(8시간마다 찍은 날짜별 시총, 7일 전 칸이 없으면 6·8일 전)
  const ago = n => kstDay(now - n * DAY), ccur = new Set(tr.ccur || []);
  const trc = {}; for (const [nm, c] of Object.entries(tr.cats || {})) { const dd = d7.filter(d => (c.d || {})[d]).length; if (dd && !CAT_SKIP.test(c.g || nm.toLowerCase().replace(/\s+/g, "-"))) trc[norm(nm)] = { nm, dd, now: ccur.has(nm) ? 1 : 0, c: c.c, g: c.g }; }
  const cats = Object.entries(cat.cur || {}).map(([id, a]) => {
    const h = (cat.h || {})[id] || {}, old = h[ago(7)] || h[ago(6)] || h[ago(8)];
    const t = trc[norm(a[0])] || null;
    return { id, n: a[0], m: a[1], c24: a[2], v: a[3], top: a[4], c7: old > 0 ? pct1((a[1] / old - 1) * 100) : null, tr: t ? t.dd : 0, trn: t ? t.now : 0 };
  });
  const pick = (key, k) => cats.filter(c => c[key] != null && c.m >= 5e7).sort((a, b) => b[key] - a[key]).slice(0, k);
  const catOut = new Map(); for (const c of [...pick("c7", 30), ...pick("c24", 30), ...cats.filter(c => c.tr)]) catOut.set(c.id, c);
  const down = new Map(); for (const c of [...cats.filter(c => c.c7 != null && c.m >= 5e7).sort((a, b) => a.c7 - b.c7).slice(0, 8), ...cats.filter(c => c.c24 != null && c.m >= 5e7).sort((a, b) => a.c24 - b.c24).slice(0, 8)]) if (!catOut.has(c.id)) down.set(c.id, c);
  // 지난 레이더 코인의 지금 국내 상장 여부 (레이더에 뜬 뒤 업비트·빗썸에 상장됐는지)
  const hx = {};
  try {
    const { results } = await db.prepare("SELECT DISTINCT json_extract(j.value,'$.sym') AS s, json_extract(j.value,'$.name') AS n FROM radar_notes r, json_each(r.json,'$.picks') j WHERE r.ts > ?1").bind(now - 60 * DAY).all();
    for (const x of results || []) { const s = String(x.s || "").toUpperCase(); if (s) hx[s] = flags(s, x.n || ""); }
  } catch (e) {}
  const view = { t: now, tr_at: tr.t || null, cat_at: cat.t || null, ex_at: Object.fromEntries(Object.keys(EX).map(k => [k, (ex[k] && ex[k].t) || null])), cp_at: cp.t || null,
    smp7, trackDays, hot, gain, cats: [...catOut.values(), ...down.values()], trc: Object.values(trc).sort((a, b) => b.now - a.now || b.dd - a.dd).slice(0, 12), hx };
  await put(db, "radar", view, now).run();
  return { ok: true, n: hot.length };
}

// ── 할 일 고르기: 한 번에 하나, 실패하면 50분 뒤 다시 ──
const JOBS = [
  ["view", 0, doView], ["tr", 110 * MIN, doTrending], ["cat", 8 * HOUR, doCats],
  ...Object.keys(EX).map(k => ["ex_" + k, 12 * HOUR, (env, now, db) => doEx(k, env, now, db)]),
  ["px", 12 * HOUR, doPx],
];
export async function watchRadar(env, now = Date.now()) {
  const db = env.DB;
  const row = await db.prepare("SELECT v FROM kv WHERE k = 'radar_st'").first();
  const st = parse(row && row.v, {});
  // 새 데이터가 있으면 화면 계산 먼저, 아니면 할 때가 된 일 중 가장 많이 밀린 것(경과 ÷ 주기)
  const due = JOBS.filter(([k, ivl]) => {
    const s = st[k] || {};
    if (k === "view") return st.dirty === true && now - (s.at || 0) >= 2 * MIN;
    return now - (s.ok || 0) >= ivl && now - (s.at || 0) >= 50 * MIN;
  });
  if (!due.length) return false;
  const late = ([k, ivl]) => k === "view" ? Infinity : (now - ((st[k] || {}).ok || 0)) / ivl;
  const job = due.reduce((a, b) => late(b) > late(a) ? b : a);
  const [k, , fn] = job;
  let res;
  try { res = await fn(env, now, db); } catch (e) { res = { err: String((e && e.message) || e).slice(0, 120) }; }
  const s = { ...(st[k] || {}), at: now, code: res.code ?? null, n: res.n ?? null };
  if (res.err) s.err = res.err; else delete s.err;
  if (res.ok) { s.ok = now; if (k === "view") st.dirty = false; else if (k !== "px" || res.n) st.dirty = true; }
  st[k] = s;
  await put(db, "radar_st", st, now).run();
  return { job: k, ...res };
}

// ── API ──
export async function apiRadar(db, now = Date.now()) {
  const { results } = await db.prepare("SELECT k, v FROM kv WHERE k IN ('radar', 'radar_px', 'radar_st')").all();
  const kv = Object.fromEntries((results || []).map(r => [r.k, r.v]));
  let note = null, hist = [];
  try {
    note = await db.prepare("SELECT id, ts, json FROM radar_notes ORDER BY ts DESC LIMIT 1").first();
    hist = (await db.prepare(`SELECT r.id AS id, r.ts AS ts, json_extract(j.value,'$.id') AS cg, json_extract(j.value,'$.sym') AS s, json_extract(j.value,'$.name') AS n,
        json_extract(j.value,'$.price') AS p, json_extract(j.value,'$.theme') AS th, json_extract(j.value,'$.stage') AS sg, json_extract(r.json,'$.btc') AS btc
      FROM radar_notes r, json_each(r.json,'$.picks') j WHERE r.ts > ?1 ORDER BY r.ts DESC LIMIT 300`).bind(now - 60 * DAY).all()).results || [];
  } catch (e) {}
  return `{"view":${kv.radar || "null"},"px":${kv.radar_px || "null"},"st":${kv.radar_st || "null"},"note":${note ? `{"id":${JSON.stringify(note.id)},"ts":${Number(note.ts)},"a":${note.json}}` : "null"},"hist":${JSON.stringify(hist)}}`;
}
