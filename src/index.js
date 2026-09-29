// AI 코인 리서치센터 — Cloudflare Worker
// 정적 파일(public/)은 Cloudflare가 먼저 내보내고, 나머지 요청은 여기서 처리한다.
// /api/* : D1에 저장된 리포트·주간 요약·긴급 소식을 JSON으로 돌려준다 (예약 실행이 D1에 직접 저장).
// 그 밖의 페이지 경로 : app.html 한 장을 돌려주고, 브라우저의 app.js가 API를 읽어 그린다.
// 1분마다(cron): 업비트 원화마켓 목록(5분마다)·가격 급변(5분마다)·뉴스 RSS(2곳씩 돌아가며)를 확인해 ★5 긴급 소식을 바로 저장한다.

import { watchNews, watchPrices } from "./newswatch.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30" };
const PAGES = [/^\/$/, /^\/index\.html$/, /^\/r\/[\w-]+(\.html)?$/, /^\/track(\.html)?$/, /^\/coin\/?$/, /^\/coin\/[\w-]+(\.html)?$/,
  /^\/weekly\/?$/, /^\/weekly\/[\w-]+(\.html)?$/, /^\/map(\.html)?$/, /^\/news\/?$/];

function json(body, status = 200) { return new Response(body, { status, headers: JSON_HEADERS }); }
// 저장된 JSON 문자열을 다시 파싱하지 않고 이어 붙인다 (CPU 절약)
function rowsToJson(rows, key = "r") {
  return "[" + rows.map(x => `{"id":${JSON.stringify(x.id)},"ts":${Number(x.ts)},"${key}":${x.json}}`).join(",") + "]";
}

async function api(url, env) {
  const p = url.pathname.replace(/\/+$/, "");
  const db = env.DB;
  if (p === "/api/latest") {
    const { results } = await db.prepare("SELECT id, ts, json FROM reports ORDER BY ts DESC LIMIT 2").all();
    return json(rowsToJson(results));
  }
  let m = p.match(/^\/api\/report\/([\w-]+)$/);
  if (m) {
    const cur = await db.prepare("SELECT id, ts, json FROM reports WHERE id = ?1").bind(m[1]).first();
    if (!cur) return json('{"error":"not_found"}', 404);
    const prev = await db.prepare("SELECT id, ts, json FROM reports WHERE ts < ?1 ORDER BY ts DESC LIMIT 1").bind(cur.ts).first();
    return json(rowsToJson(prev ? [cur, prev] : [cur]));
  }
  if (p === "/api/archive") {
    const { results } = await db.prepare("SELECT id, ts, json_extract(json, '$.market.headline') AS h FROM reports ORDER BY ts DESC LIMIT 200").all();
    return json(JSON.stringify(results));
  }
  if (p === "/api/scores") {
    const { results } = await db.prepare(
      "SELECT r.id AS id, r.ts AS ts, j.value AS json FROM reports r, json_each(r.json, '$.track.items') j ORDER BY r.ts").all();
    return json(rowsToJson(results, "x"));
  }
  if (p === "/api/mentions") {
    const { results } = await db.prepare(
      `SELECT r.id AS id, r.ts AS ts, json_extract(j.value,'$.sym') AS s, json_extract(j.value,'$.name') AS n,
              json_extract(j.value,'$.rating') AS rt, json_extract(j.value,'$.stars') AS st, json_extract(j.value,'$.price') AS pr,
              json_extract(j.value,'$.chg24') AS c, json_extract(j.value,'$.position') AS pos
         FROM reports r, json_each(r.json, '$.picks') j
       UNION ALL
       SELECT r.id, r.ts, json_extract(j.value,'$.sym'), json_extract(j.value,'$.name'), '주의', 1, json_extract(j.value,'$.price'),
              json_extract(j.value,'$.chg24'), NULL
         FROM reports r, json_each(r.json, '$.cautions') j
       ORDER BY 2 DESC LIMIT 3000`).all();
    return json(JSON.stringify(results));
  }
  m = p.match(/^\/api\/coin\/([\w-]+)$/);
  if (m) {
    const sym = m[1].toUpperCase();
    const { results: ents } = await db.prepare(
      `SELECT r.id AS id, r.ts AS ts, j.value AS json FROM reports r, json_each(r.json, '$.picks') j WHERE json_extract(j.value,'$.sym') = ?1
       UNION ALL
       SELECT r.id, r.ts, json_set(j.value, '$.rating', '주의', '$.stars', 1, '$.comment', json_extract(j.value,'$.reason')) FROM reports r, json_each(r.json, '$.cautions') j WHERE json_extract(j.value,'$.sym') = ?1
       ORDER BY 2`).bind(sym).all();
    const { results: sc } = await db.prepare(
      "SELECT r.id AS id, r.ts AS ts, j.value AS json FROM reports r, json_each(r.json, '$.track.items') j WHERE json_extract(j.value,'$.sym') = ?1 ORDER BY r.ts").bind(sym).all();
    return json(`{"sym":${JSON.stringify(sym)},"entries":${rowsToJson(ents, "p")},"scores":${rowsToJson(sc, "x")}}`);
  }
  if (p === "/api/weekly") {
    const id = url.searchParams.get("id");
    const cur = id ? await db.prepare("SELECT id, ts, json FROM weekly WHERE id = ?1").bind(id).first()
                   : await db.prepare("SELECT id, ts, json FROM weekly ORDER BY ts DESC LIMIT 1").first();
    const { results: list } = await db.prepare("SELECT id, ts, json_extract(json,'$.label') AS label FROM weekly ORDER BY ts DESC LIMIT 60").all();
    return json(`{"current":${cur ? rowsToJson([cur], "w").slice(1, -1) : "null"},"list":${JSON.stringify(list)}}`);
  }
  if (p === "/api/alerts") {
    const since = Date.now() - 48 * 3600e3;
    const { results } = await db.prepare("SELECT id, ts, kind, json FROM alerts WHERE ts > ?1 AND kind NOT IN ('rejected', 'cand') ORDER BY ts DESC LIMIT 12").bind(since).all();
    return json("[" + results.map(x => `{"id":${JSON.stringify(x.id)},"ts":${Number(x.ts)},"kind":${JSON.stringify(x.kind)},"a":${x.json}}`).join(",") + "]");
  }
  if (p === "/api/health") {
    const r = await db.prepare(`SELECT (SELECT count(*) FROM reports) AS reports, (SELECT max(ts) FROM reports) AS last_report,
      (SELECT count(*) FROM weekly) AS weekly, (SELECT count(*) FROM alerts) AS alerts, (SELECT ts FROM kv WHERE k = 'upbit_krw') AS upbit_checked, (SELECT ts FROM kv WHERE k = 'px') AS price_checked,
      (SELECT v FROM kv WHERE k = 'rss_status') AS rss`).first();
    return json(`{"reports":${Number(r.reports)},"last_report":${r.last_report ?? "null"},"weekly":${Number(r.weekly)},"alerts":${Number(r.alerts)},"upbit_checked":${r.upbit_checked ?? "null"},"price_checked":${r.price_checked ?? "null"},"rss":${r.rss || "{}"}}`);
  }
  return json('{"error":"not_found"}', 404);
}

// 업비트 원화마켓 신규 상장·유의 종목 감지 (결정론적, AI 판단 없음)
async function watchUpbit(env) {
  const res = await fetch("https://api.upbit.com/v1/market/all?isDetails=true", { headers: { accept: "application/json" } });
  if (!res.ok) return;
  const all = await res.json();
  const krw = all.filter(x => typeof x.market === "string" && x.market.startsWith("KRW-"));
  if (krw.length < 50) return; // 비정상 응답 방어
  const cur = {};
  for (const x of krw) {
    const ev = x.market_event || {};
    const warn = ev.warning === true || x.market_warning === "CAUTION";
    cur[x.market] = { n: x.korean_name || x.market, w: warn ? 1 : 0 };
  }
  const prevRow = await env.DB.prepare("SELECT v FROM kv WHERE k = 'upbit_krw'").first();
  const now = Date.now();
  // 뉴스로 먼저 올라간 같은 코인 상장·유의·폐지 소식이 있으면 다시 올리지 않는다
  const { results: recent } = await env.DB.prepare("SELECT id FROM alerts WHERE kind = 'auto_news' AND ts > ?1").bind(now - 24 * 3600e3).all();
  const already = (type, sym) => (recent || []).some(r => r.id.startsWith(`n-${type}-업비트:${sym}-`));
  const stmts = [];
  if (prevRow) {
    const prev = JSON.parse(prevRow.v);
    for (const [mkt, v] of Object.entries(cur)) {
      const sym = mkt.slice(4);
      if (!prev[mkt] && !already("listing", sym)) {
        const a = { title: `업비트 원화마켓 신규 상장: ${v.n}(${sym})`, url: "https://upbit.com/service_center/notice", source: "업비트 마켓 목록(자동 감지)",
          score: 9, coins: [sym], summary: `업비트 원화마켓 목록에 ${v.n}(${sym})이 새로 생겼어요. 상장 직후에는 가격 변동이 매우 커요.`,
          impact: `${sym} 단기 급등락 가능. 추격 매수 주의.`, auto: true, ts: now };
        stmts.push(env.DB.prepare("INSERT OR IGNORE INTO alerts (id, ts, kind, json) VALUES (?1, ?2, 'listing', ?3)").bind(`u-list-${sym}-${now}`, now, JSON.stringify(a)));
      } else if (prev[mkt] && v.w && !prev[mkt].w && !already("warning", sym)) {
        const a = { title: `업비트 유의 종목 지정: ${v.n}(${sym})`, url: "https://upbit.com/service_center/notice", source: "업비트 마켓 목록(자동 감지)",
          score: 9, coins: [sym], summary: `업비트가 ${v.n}(${sym})을 유의 종목(투자 주의)으로 지정했어요. 상장폐지 심사로 이어질 수 있어요.`,
          impact: `${sym} 급락·거래 지원 종료 위험.`, auto: true, ts: now };
        stmts.push(env.DB.prepare("INSERT OR IGNORE INTO alerts (id, ts, kind, json) VALUES (?1, ?2, 'warning', ?3)").bind(`u-warn-${sym}-${now}`, now, JSON.stringify(a)));
      }
    }
    for (const mkt of Object.keys(prev)) {
      if (!cur[mkt] && !already("delist", mkt.slice(4))) {
        const sym = mkt.slice(4);
        const a = { title: `업비트 원화마켓에서 사라짐: ${prev[mkt].n}(${sym})`, url: "https://upbit.com/service_center/notice", source: "업비트 마켓 목록(자동 감지)",
          score: 9, coins: [sym], summary: `업비트 원화마켓 목록에서 ${prev[mkt].n}(${sym})이 빠졌어요. 거래 지원 종료일 수 있어요.`,
          impact: `${sym} 원화마켓 거래 불가.`, auto: true, ts: now };
        stmts.push(env.DB.prepare("INSERT OR IGNORE INTO alerts (id, ts, kind, json) VALUES (?1, ?2, 'delist', ?3)").bind(`u-del-${sym}-${now}`, now, JSON.stringify(a)));
      }
    }
  }
  stmts.push(env.DB.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('upbit_krw', ?1, ?2)").bind(JSON.stringify(cur), now));
  await env.DB.batch(stmts);
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(url, env); }
      catch (e) { return json(JSON.stringify({ error: "server", message: String(e && e.message || e).slice(0, 200) }), 500); }
    }
    // 정적 파일에 없는 경로: 페이지 주소면 app.html(200), 아니면 app.html(404) — 화면은 app.js가 그린다
    const ok = PAGES.some(re => re.test(url.pathname));
    const r = await env.ASSETS.fetch(new Request(new URL("/app.html", url.origin), request));
    const h = new Headers(r.headers); h.set("cache-control", "public, max-age=60");
    return new Response(r.body, { status: ok ? 200 : 404, headers: h });
  },
  // 한 번에 한 가지 일만 해서 무료 요금제 CPU 한도(10ms) 안에 들어가게 한다
  async scheduled(event, env, ctx) {
    const min = new Date(event.scheduledTime || Date.now()).getUTCMinutes();
    const job = min % 5 === 0 ? watchUpbit(env) : min % 5 === 2 ? watchPrices(env) : watchNews(env, min);
    ctx.waitUntil(job.catch(e => console.error("cron", min, e)));
  },
};
