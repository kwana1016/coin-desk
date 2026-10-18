// 섹터 순위판 부가 데이터 — 성적표(매일 가격 스냅숏)
// 각 함수는 cron 한 칸에서 한 가지만 하고, 데이터가 아직 신선하면 kv 한 번 읽고 끝낸다 (무료 요금제 CPU 10ms).

import { marketIndex, marketKey } from "./sectors.js";

const DAY = 86400e3;
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const sig = x => (x == null || !isFinite(x)) ? null : Number(Number(x).toPrecision(6));
// 한국 시각 날짜 (YYYYMMDD)
export const kstDay = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");

// ── 성적표: 매일 한국 시각 9시 이후 첫 칸에서 그날의 1군·2군과 가격을 한 번 저장한다 ──
// perf.json = {t, rank_at, btc, eth, c: {심볼: [리그(1·2), 섹터, 섹터 안 순위, 가격$]}}
// 화면은 스냅숏을 이어 붙여 '매일 동일 비중으로 다시 맞춘' 수익률을 계산한다 (1군 vs 2군 vs 전체 후보 vs 비트코인).
export async function snapPerf(env, now = Date.now()) {
  const db = env.DB;
  const day = kstDay(now);
  if (new Date(now + 9 * 3600e3).getUTCHours() < 9) return false;
  const have = await db.prepare("SELECT 1 AS x FROM perf WHERE day = ?1").bind(day).first();
  if (have) return false;
  const [rq, kq, bq] = await Promise.all([
    db.prepare("SELECT ts, json FROM rankings ORDER BY ts DESC LIMIT 1").all(),
    db.prepare("SELECT v FROM kv WHERE k = 'cp'").all(),
    db.prepare("SELECT sym, json_extract(json,'$.cg') AS cg, json_extract(json,'$.kr') AS kr FROM coin_base").all(),
  ]);
  const rk = (rq.results || [])[0], cpRow = (kq.results || [])[0];
  if (!rk || !cpRow) return false;
  const snap = parse(rk.json, null); const cp = parse(cpRow.v, {}); const m = cp.m || {};
  if (!snap || !snap.c) return false;
  const idx = marketIndex(m);
  const base = Object.fromEntries((bq.results || []).map(r => [r.sym, r]));
  const priceOf = (sym, b) => { const k = marketKey(idx, b || { sym }); return k ? sig(Number(m[k][2])) : null; };
  const c = {};
  for (const [sym, a] of Object.entries(snap.c)) {
    const lg = Number(a[2]);
    if (lg !== 1 && lg !== 2) continue;
    const px = priceOf(sym, base[sym]);
    if (px && px > 0) c[sym] = [lg, a[0], Number(a[1]) || 0, px];
  }
  const out = { t: now, cp_at: Number(cp.t) || null, rank_at: Number(rk.ts) || null, btc: priceOf("BTC"), eth: priceOf("ETH"), c };
  if (!out.btc || Object.keys(c).length < 20) return false;
  await db.prepare("INSERT OR IGNORE INTO perf (day, ts, json) VALUES (?1, ?2, ?3)").bind(day, now, JSON.stringify(out)).run();
  return true;
}

export async function apiPerf(db) {
  const { results } = await db.prepare("SELECT day, json FROM perf ORDER BY day DESC LIMIT 400").all();
  return "[" + (results || []).reverse().map(r => `{"day":${JSON.stringify(r.day)},"s":${r.json}}`).join(",") + "]";
}

// ── 실제 수익 데이터 (DefiLlama) ──
// coin_base.json.ll = DefiLlama 프로토콜 이름(슬러그). 한 번에 10개 코인 × 3종류(수수료·매출·보유자 수익)를 받아 kv 'fees'에 쌓는다.
// kv 'fees' = {t, m: {심볼: [수수료30일, 수수료7일, 수수료1년, 매출30일, 매출1년, 보유자수익30일, 보유자수익1년, 종류(1=프로토콜 2=체인), 받은 시각]}}
// 6시간 지난 코인부터 차례로 갱신 (28·58분 칸, 무료 요금제 하위 요청 50개 안) — 응답 앞부분에서 맨 처음 나오는 합계만 읽는다.
const LL_TYPES = [["dailyFees", 0], ["dailyRevenue", 3], ["dailyHoldersRevenue", 5]];
async function llTotals(slug, dataType) {
  const r = await fetch(`https://api.llama.fi/summary/fees/${encodeURIComponent(slug)}?dataType=${dataType}&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`,
    { headers: { "user-agent": "Mozilla/5.0 (compatible; AI-Coin-Research/1.0)", accept: "application/json" } });
  if (!r.ok) { try { r.body && r.body.cancel(); } catch (e) {} return { code: r.status }; }
  let t = ""; const rd = r.body.getReader(); const dec = new TextDecoder();
  // 합계는 childProtocols 다음에 나온다 — "total24h"가 나오고 조금 더 읽을 때까지만 받는다
  let found = -1;
  while (t.length < 400000) {
    const { done, value } = await rd.read(); if (done) break; t += dec.decode(value, { stream: true });
    if (found < 0) found = t.indexOf('"total24h"'); if (found >= 0 && t.length > found + 600) break;
  }
  try { await rd.cancel(); } catch (e) {}
  const pt = (t.match(/"protocolType":"(\w+)"/) || [])[1] || null;
  if (found < 0) return { code: 200, none: true, pt };
  const seg = t.slice(found, found + 600);
  const g = k => { const m = seg.match(new RegExp('"' + k + '":(-?[0-9.eE+-]+|null)')); return m && m[1] !== "null" ? Number(m[1]) : null; };
  return { code: 200, d30: g("total30d"), d7: g("total7d"), y1: g("total1y"), pt };
}
export async function watchFees(env, now = Date.now()) {
  const db = env.DB;
  const [bq, fq] = await Promise.all([
    db.prepare("SELECT sym, json_extract(json,'$.ll') AS ll FROM coin_base WHERE json_extract(json,'$.ll') IS NOT NULL").all(),
    db.prepare("SELECT v FROM kv WHERE k = 'fees'").first(),
  ]);
  const cur = parse(fq && fq.v, { m: {} }); cur.m = cur.m || {};
  const due = (bq.results || []).filter(r => !cur.m[r.sym] || now - (cur.m[r.sym][8] || 0) > 6 * 3600e3)
    .sort((a, b) => ((cur.m[a.sym] || [])[8] || 0) - ((cur.m[b.sym] || [])[8] || 0)).slice(0, 10);
  if (!due.length) return false;
  const res = await Promise.all(due.map(async r => {
    const out = Array(9).fill(null); let pt = null, ok = false;
    for (const [dt, at] of LL_TYPES) {
      try {
        const x = await llTotals(r.ll, dt); pt = pt || x.pt;
        if (x.code === 200 && !x.none) { ok = true; if (at === 0) { out[0] = x.d30; out[1] = x.d7; out[2] = x.y1; } else { out[at] = x.d30; out[at + 1] = x.y1; } }
      } catch (e) {}
    }
    out[7] = pt === "chain" ? 2 : 1; out[8] = now;
    return [r.sym, ok ? out : null];
  }));
  for (const [sym, v] of res) { if (v) cur.m[sym] = v; else if (cur.m[sym]) cur.m[sym][8] = now; else cur.m[sym] = [null, null, null, null, null, null, null, 0, now]; }
  cur.t = now;
  await db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('fees', ?1, ?2)").bind(JSON.stringify(cur), now).run();
  return true;
}

// ── 언락 일정 (코인마켓캡 공개 데이터) — 목록(약 1,300개)이 시총 순으로 정렬되지 않아, 매시간 8분 칸에서 100개씩 3쪽을 받아 이어 붙인다 ──
// 한 바퀴(약 5시간)를 다 돌면 12시간 쉬었다가 다시 돈다. 우리 코인(심볼·업비트 심볼)만 남기고, 같은 심볼이면 시총 순위가 높은 쪽을 쓴다.
// kv 'unlocks' = {t: 마지막으로 한 바퀴를 끝낸 시각, pass: 지금 바퀴 시작, next: 다음에 받을 시작 번호(0=쉬는 중), total, m: {심볼: [다음 언락 시각, 유통량 대비 %, 금액$, 아직 잠긴 비율 %(최대 공급 대비), 방식, 시총 순위, 받은 시각]}}
const CMC_UNLOCK = start => `https://api.coinmarketcap.com/data-api/v3/token-unlock/listing?start=${start}&limit=100&sort=cmc_rank&direction=asc&enableSmallUnlocks=true`;
export async function watchUnlocks(env, now = Date.now()) {
  const db = env.DB;
  const row = await db.prepare("SELECT v FROM kv WHERE k = 'unlocks'").first().catch(() => null);
  const cur = parse(row && row.v, {}); cur.m = cur.m || {};
  if (!cur.next && cur.t && now - cur.t < 12 * 3600e3) return false;
  if (!cur.next) { cur.next = 1; cur.pass = now; }
  const bq = await db.prepare("SELECT sym, json_extract(json,'$.kr') AS kr FROM coin_base").all();
  const want = new Map(); for (const r of (bq.results || [])) { want.set(r.sym.toUpperCase(), r.sym); if (r.kr) want.set(String(r.kr).toUpperCase(), r.sym); }
  let code = 0, got = 0, end = false, start = cur.next;
  for (let k = 0; k < 3; k++, start += 100) {
    let part = null;
    try {
      const r = await fetch(CMC_UNLOCK(start), { headers: { "user-agent": "Mozilla/5.0 (compatible; AI-Coin-Research/1.0)", accept: "application/json" } }); code = r.status;
      if (!r.ok) { try { r.body && r.body.cancel(); } catch (e) {} break; }
      const j = JSON.parse(await r.text()); part = (j && j.data && j.data.tokenUnlockList) || [];
      cur.total = Number(j && j.data && j.data.totalCount) || cur.total || 0;
    } catch (e) { break; }
    got += part.length;
    for (const x of part) {
      const sym = want.get(String(x.symbol || "").toUpperCase()); if (!sym) continue;
      const rk = Number(x.cmcRank) || 1e9, old = cur.m[sym];
      if (old && (old[6] || 0) >= cur.pass && (old[5] || 1e9) <= rk) continue; // 이번 바퀴에 이미 더 큰 코인으로 잡혔으면 그대로
      const nx = x.nextUnlocked || {}; const circ = Number(x.circulatingSupply) || Number(x.selfReportedCirculatingSupply) || 0;
      let date = Number(nx.date) || null; if (date && date < 1e12) date *= 1000;
      const amt = Number(nx.tokenAmount) || 0, maxS = Number(x.maxSupply) || Number(x.totalSupply) || 0;
      const d0 = (x.nextUnlockedDetail || [])[0] || {};
      cur.m[sym] = [date && date > now ? date : null, circ > 0 && amt > 0 ? Math.round(amt / circ * 1e4) / 100 : null, Math.round(Number(nx.tokenAmountUsd) || 0),
        maxS > 0 ? Math.round((Number(x.tokenLockedAmount) || 0) / maxS * 1000) / 10 : null, d0.vestingType || null, rk, now];
    }
    if (part.length < 100 || (cur.total && start + 100 > cur.total)) { end = true; break; }
  }
  if (end) { // 한 바퀴 끝: 이번 바퀴에 안 나온 코인은 지운다
    for (const [s, v] of Object.entries(cur.m)) if ((v[6] || 0) < cur.pass) delete cur.m[s];
    cur.t = now; cur.next = 0;
  } else if (got) cur.next = start;
  await db.batch([db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('unlocks', ?1, ?2)").bind(JSON.stringify(cur), now),
    db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('unlocks_status', ?1, ?2)").bind(JSON.stringify({ code, at: now, got, next: cur.next, total: cur.total || null, n: Object.keys(cur.m).length }), now)]);
  return true;
}
