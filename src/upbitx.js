// 업비트 원화마켓 코인 중 코인마켓캡 상위 300위 목록(kv cp)에 없는 코인의 시세를 따로 받는다 → kv cpx
// 13·43분 칸에서 순위 계산이 없을 때만 돈다 (무료 요금제 CPU 10ms — 목록 1쪽 + 시세 50개씩 몇 번).
//  1) 코인마켓캡 id 찾기: 301위부터 500개씩 한 쪽(page)을 받아 업비트 영문명과 이름이 맞는 코인을 찾는다 (kv cmc_ids)
//     이름이 맞는 코인은 바로 쓰고, 심볼만 맞는 코인은 모든 쪽을 다 본 뒤 시총이 가장 큰 것으로 정한다.
//  2) 시세: 찾은 id를 한 번에 quote/latest로 받아 cp와 같은 모양으로 kv cpx에 쓴다. watchMarket이 cp를 만들 때 합친다.
// kv cmc_ids = {page: 다음에 볼 쪽(PAGES 끝이면 쉬는 중), done: 마지막으로 다 본 시각, m: {업비트 심볼: [id, slug, 이름, 순위, 맞춘 방법(2=이름 1=심볼)]}, cand: {...}, miss: [못 찾은 심볼]}
// kv cpx = {t, m: {"x:slug": [순위, 업비트 심볼, 가격$, 시총$, 24h 거래대금$, 24h%, 7일%, 30일%, 4, 고점 대비%, null, 유통 비율]}}

const UA = { "user-agent": "Mozilla/5.0 (compatible; AI-Coin-Research/1.0; +https://coin-desk.kwana1016.workers.dev)", accept: "application/json" };
const DAY = 86400e3;
const PAGES = [301, 801, 1301, 1801, 2301, 2801];
const LIST = start => `https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?start=${start}&limit=500&sortBy=market_cap&sortType=desc&convert=USD&cryptoType=all&tagType=all&audited=false`;
const QUOTE = ids => `https://api.coinmarketcap.com/data-api/v3/cryptocurrency/quote/latest?id=${ids}&convertId=2781`;
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const sig = x => (x == null || !isFinite(x)) ? null : Number(Number(x).toPrecision(6));
const pct1 = x => (x == null || !isFinite(Number(x))) ? null : Math.round(Number(x) * 10) / 10;
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// 업비트는 같은 심볼이 이미 있으면 뒤에 2를 붙인다 (MET2 = 메테오라 MET, META2 = 메타다오 META)
const baseSym = s => /^[A-Z]{2,}2$/.test(s) ? s.slice(0, -1) : null;
const nameHit = (cmcName, slug, eng) => { const a = norm(cmcName), b = norm(eng), c = norm(slug); if (!b || b.length < 2) return false;
  return a === b || c === b || (b.length >= 4 && (a.includes(b) || b.includes(a) || c.includes(b))); };

async function getText(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) { try { r.body && r.body.cancel(); } catch (e) {} return { code: r.status, t: null }; }
  return { code: r.status, t: await r.text() };
}

export async function watchMarketX(env, now = Date.now()) {
  const db = env.DB;
  const [kq, bq] = await Promise.all([
    db.prepare("SELECT k, v FROM kv WHERE k IN ('cp', 'upbit_krw', 'cmc_ids', 'sector_excluded', 'ath', 'tickers')").all(),
    db.prepare("SELECT sym, json_extract(json,'$.kr') AS kr FROM coin_base").all(),
  ]);
  const kv = Object.fromEntries((kq.results || []).map(r => [r.k, r.v]));
  const cp = parse(kv.cp, {}).m || {}, up = parse(kv.upbit_krw, {}), ath = parse(kv.ath, {});
  const ids = parse(kv.cmc_ids, {}); ids.m = ids.m || {}; ids.cand = ids.cand || {}; if (ids.page == null) ids.page = 0;
  const exSyms = new Set(parse(kv.sector_excluded, []).map(e => String(e[2] || "").toUpperCase()).filter(Boolean));
  // 300위 목록에 이미 있는 심볼 (cpx에서 합쳐진 x: 항목은 빼고) — 같은 심볼의 다른 코인일 수 있어 업비트 원화 가격과 비교한다
  const tk = (parse(kv.tickers, {}).m) || {}, usdt = tk.USDT ? Number(tk.USDT[0]) : 0;
  const top = new Map(); for (const [k, a] of Object.entries(cp)) { if (k.startsWith("x:")) continue; const sy = String(a[1] || "").toUpperCase(); (top.get(sy) || top.set(sy, []).get(sy)).push([k, a]); }
  for (const l of top.values()) l.sort((p, q) => Number(q[1][3]) - Number(p[1][3]));
  const sameCoin = (s, a) => { const krw = tk[s] ? Number(tk[s][0]) : 0; if (!(krw > 0 && usdt > 0 && Number(a[2]) > 0)) return true; const r = Number(a[2]) / (krw / usdt); return r > 0.6 && r < 1.6; };
  const collided = new Set(), fixTop = {};
  const covered = s => { for (const t of [s, baseSym(s)]) { if (!t || !top.has(t)) continue; const l = top.get(t);
      if (!up["KRW-" + s]) return true;
      const i = l.findIndex(([, a]) => sameCoin(s, a)); if (i === 0) return true;
      if (i > 0) { fixTop[s] = l[i][0]; return true; } // 같은 심볼 중 시총이 작은 쪽이 업비트 코인
      collided.add(s); return false; }
    return false; };
  const want = {};
  for (const [mkt, v] of Object.entries(up)) { const s = mkt.replace(/^KRW-/, ""); if (!exSyms.has(s) && !covered(s)) want[s] = (v && v.e) || ""; }
  for (const r of (bq.results || [])) { const s = String(r.kr || r.sym).toUpperCase(); if (!(s in want) && !covered(s) && !covered(String(r.sym).toUpperCase())) want[s] = ""; }
  const st = { at: now, want: Object.keys(want).length };

  // 1) id 찾기 — 못 찾은 코인이 있고, 지금 돌고 있거나 3일 지났거나 지난번에 찾아보지 않은 새 심볼이 있을 때
  const need = Object.keys(want).filter(s => !ids.m[s]);
  const miss = new Set(ids.miss || []);
  if (need.length && ids.page >= PAGES.length && (now - (ids.done || 0) > 3 * DAY || need.some(s => !miss.has(s)))) { ids.page = 0; ids.cand = {}; }
  if (need.length && ids.page < PAGES.length) {
    const r = await getText(LIST(PAGES[ids.page])); st.list = r.code;
    let list = [];
    if (r.t) { const d = parse(r.t, null); list = (d && d.data && d.data.cryptoCurrencyList) || []; }
    if (r.code === 200) {
      const needSet = new Set(need), byCmc = new Map();
      for (const s of need) { byCmc.set(s, s); const b = baseSym(s); if (b && !byCmc.has(b)) byCmc.set(b, s); }
      for (const x of list) {
        const cs = String(x.symbol || "").toUpperCase(), rk = Number(x.cmcRank) || 1e9;
        for (const s of [cs, cs + "2"]) {
          if (!needSet.has(s)) continue;
          if (s !== cs && baseSym(s) !== cs) continue;
          const hit = nameHit(x.name, x.slug, want[s]) ? 2 : (s === cs ? 1 : 0); if (!hit) continue;
          const c = ids.cand[s]; const row = [Number(x.id), String(x.slug || x.id), String(x.name || ""), rk, hit];
          if (!c || hit > c[4] || (hit === c[4] && rk < c[3])) ids.cand[s] = row;
          if (hit === 2 && !ids.m[s]) ids.m[s] = row; // 이름까지 맞으면 바로 쓴다
        }
      }
      ids.page++; st.got = list.length;
      if (ids.page >= PAGES.length || !list.length) { // 다 봤으면 심볼만 맞은 코인도 정한다
        for (const s of need) if (!ids.m[s] && ids.cand[s]) ids.m[s] = ids.cand[s];
        ids.miss = need.filter(s => !ids.m[s]); ids.done = now; ids.page = PAGES.length; ids.cand = {};
      }
    }
  }

  // 2) 시세 — 찾은 id 한꺼번에
  const use = Object.keys(want).filter(s => ids.m[s]);
  const m = {};
  if (use.length) {
    const idList = [...new Set(use.map(s => ids.m[s][0]))].slice(0, 400);
    // 한 번에 너무 많이 보내면 빈 응답이 오므로 50개씩 나눠 받는다 (요청 최대 8개)
    const byId = new Map(); st.quote = []; st.got = 0;
    for (let i = 0; i < idList.length; i += 50) {
      const r = await getText(QUOTE(idList.slice(i, i + 50).join(","))); st.quote.push(r.code);
      const d = r.t ? parse(r.t, null) : null;
      const arr = d && Array.isArray(d.data) ? d.data : d && d.data && typeof d.data === "object" ? Object.values(d.data) : [];
      for (const x of arr) if (x && x.id != null) byId.set(Number(x.id), x);
      if (!arr.length && r.t && !st.head) st.head = r.t.slice(0, 240);
    }
    st.got = byId.size;
    for (const s of use) {
      const x = byId.get(Number(ids.m[s][0])); if (!x) continue;
      const q = (x.quotes || []).find(z => z && z.name === "USD") || (x.quotes || [])[0] || {};
      const price = Number(q.price) || 0; if (!(price > 0)) continue;
      const cs = Number(x.circulatingSupply) > 0 ? Number(x.circulatingSupply) : Number(x.selfReportedCirculatingSupply) || 0;
      const mcap = Number(q.marketCap) > 0 ? Number(q.marketCap) : (cs > 0 ? cs * price : 0);
      const maxS = Number(x.maxSupply) > 0 ? Number(x.maxSupply) : Number(x.totalSupply) || 0;
      const circ = maxS > 0 && cs > 0 ? Math.min(1, cs / maxS) : null;
      m["x:" + (x.slug || x.id)] = [Number(x.rank) || Number(ids.m[s][3]) || 0, s, sig(price), Math.round(mcap), Math.round(Number(q.volume24h) || 0),
        pct1(q.percentChange24h), pct1(q.percentChange7d), pct1(q.percentChange30d), 4, ath[s] > 0 ? pct1((price / ath[s] - 1) * 100) : null, null,
        circ == null ? null : Math.round(circ * 1000) / 1000];
    }
    st.n = Object.keys(m).length;
  }
  st.miss = (ids.miss || []).length; st.page = ids.page;
  // 300위 안 다른 코인과 심볼이 겹치는 업비트 코인은 coin_base.cg에 이 시세 id를 적어 심볼로 잘못 찾지 않게 한다
  const fix = [];
  for (const [s2, k] of Object.entries(fixTop)) fix.push(db.prepare("UPDATE coin_base SET json = json_set(json, '$.cg', ?2) WHERE upper(coalesce(json_extract(json, '$.kr'), sym)) = ?1 AND coalesce(json_extract(json, '$.cg'), '') <> ?2").bind(s2, k));
  for (const [k, a] of Object.entries(m)) if (collided.has(a[1])) fix.push(db.prepare("UPDATE coin_base SET json = json_set(json, '$.cg', ?2) WHERE upper(coalesce(json_extract(json, '$.kr'), sym)) = ?1 AND coalesce(json_extract(json, '$.cg'), '') <> ?2").bind(a[1], k));
  st.fix = fix.length;
  const w = [...fix, db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('cmc_ids', ?1, ?2)").bind(JSON.stringify(ids), now),
    db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('cpx_status', ?1, ?2)").bind(JSON.stringify(st), now)];
  if (Object.keys(m).length) w.push(db.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('cpx', ?1, ?2)").bind(JSON.stringify({ t: now, m }), now));
  await db.batch(w);
  return true;
}
