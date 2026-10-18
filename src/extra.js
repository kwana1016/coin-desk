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
