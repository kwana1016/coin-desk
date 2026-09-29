// ★5 뉴스 즉시 감지 (AI 없이 규칙으로) — Worker cron이 1분마다 RSS 2곳씩 돌아가며 확인한다.
// 확실한 것만: 제목이 엄격한 규칙에 맞고, 서로 다른 매체 2곳 이상이 3시간 안에 같은 사건을 보도했을 때만 사이트에 올린다.
// 올린 소식은 "AI 확인 전"으로 표시되고, 예약 실행(Claude)이 1시간 안에 기사를 열어 확인하거나 지운다.

export const FEEDS = [
  ["토큰포스트", "https://www.tokenpost.kr/rss"],
  ["블록미디어", "https://www.blockmedia.co.kr/feed"],
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["Cointelegraph", "https://cointelegraph.com/rss"],
  ["Decrypt", "https://decrypt.co/feed"],
  ["The Block", "https://www.theblock.co/rss.xml"],
];

const FRESH_MS = 3 * 3600e3;      // 발행 3시간 안 기사만
const KEEP_MS = 6 * 3600e3;       // 감지 기록 보관
const KRW_PER_USD = 1400;

// ── RSS 읽기 ──
async function readHead(res, limit = 150000) {
  if (!res.body) return "";
  const reader = res.body.getReader(); const dec = new TextDecoder(); let out = "", n = 0;
  while (n < limit) { const { done, value } = await reader.read(); if (done) break; n += value.length; out += dec.decode(value, { stream: true }); }
  try { await reader.cancel(); } catch (e) {}
  return out;
}
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", middot: "·", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—" };
export function clean(s) {
  return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m))
    .replace(/\s+/g, " ").trim();
}
export function parseItems(xml, max = 40) {
  const out = []; const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi; let m;
  while ((m = re.exec(xml)) && out.length < max) {
    const it = m[0];
    const tag = t => { const r = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "i").exec(it); return r ? clean(r[1]) : ""; };
    const title = tag("title");
    let link = tag("link"); if (!/^https?:/.test(link)) { const h = /<link[^>]*href="([^"]+)"/i.exec(it); link = h ? h[1] : ""; }
    if (!/^https?:/.test(link)) { const g = tag("guid"); link = /^https?:/.test(g) ? g : ""; }
    const pub = tag("pubDate") || tag("dc:date") || tag("published") || tag("updated");
    const ts = Date.parse(pub);
    try { const u = new URL(link); [...u.searchParams.keys()].filter(k => k.startsWith("utm_")).forEach(k => u.searchParams.delete(k)); link = u.toString(); } catch (e) {}
    if (title) out.push({ title, link, ts: isNaN(ts) ? null : ts });
  }
  return out;
}

// ── 규칙 ──
const EXCH = [["업비트", /upbit|업비트/i], ["빗썸", /bithumb|빗썸/i], ["코인원", /coinone|코인원/i], ["코빗", /korbit|코빗/i],
  ["바이낸스", /binance|바이낸스/i], ["코인베이스", /coinbase|코인베이스/i], ["OKX", /\bokx\b/i], ["바이비트", /bybit|바이비트/i],
  ["크라켄", /kraken|크라켄/i], ["비트겟", /bitget|비트겟/i], ["쿠코인", /kucoin|쿠코인/i], ["HTX", /\bhtx\b|huobi|후오비/i],
  ["게이트", /gate\.io|게이트아이오/i], ["크립토닷컴", /crypto\.com|크립토닷컴/i], ["하이퍼리퀴드", /hyperliquid|하이퍼리퀴드/i],
  ["비트파이넥스", /bitfinex|비트파이넥스/i], ["로빈후드", /robinhood|로빈후드/i], ["MEXC", /\bmexc\b/i]];
const MAJOR_EX = new Set(["업비트", "빗썸", "바이낸스", "코인베이스", "OKX", "바이비트", "크라켄"]);
const FIRMS = [["테더", /\btether\b|테더/i], ["서클", /\bcircle (internet|inc)|\bCRCL\b|서클/i], ["스트래티지", /microstrategy|\bstrategy (inc|corp)|\bMSTR\b|스트래티지/i], ["갤럭시", /galaxy digital|갤럭시 디지털/i]];
const PROTO = [["에이브", /\baave\b|에이브/i], ["유니스왑", /uniswap|유니스왑/i], ["리도", /\blido\b|리도/i], ["커브", /curve finance|커브 파이낸스/i],
  ["아이겐레이어", /eigenlayer|아이겐레이어/i], ["에테나", /ethena|에테나/i], ["펜들", /pendle|펜들/i], ["모포", /\bmorpho\b|모포/i],
  ["웜홀", /wormhole|웜홀/i], ["레이어제로", /layerzero|레이어제로/i], ["로닌", /\bronin\b|로닌/i], ["주피터", /jupiter|주피터/i],
  ["레이디움", /raydium|레이디움/i], ["컴파운드", /compound|컴파운드/i], ["메이커", /makerdao|\bsky protocol\b/i], ["세투스", /\bcetus\b|세투스/i],
  ["솔라나", /\bsolana\b|솔라나/i], ["이더리움", /\bethereum\b|이더리움/i], ["폴리곤", /\bpolygon\b|폴리곤/i], ["아비트럼", /arbitrum|아비트럼/i]];
const STABLE = [["USDT", /\busdt\b|\btether\b|테더/i], ["USDC", /\busdc\b|서클/i], ["USDE", /\busde\b/i], ["DAI", /\bdai\b/i], ["FDUSD", /\bfdusd\b/i], ["PYUSD", /\bpyusd\b/i], ["USD1", /\busd1\b/i]];

const EXCLUDE = /\b(anniversar|years? (after|ago|later)|a year after|recap|lessons?|how |why |what |could|might|would|rumou?r|predict|analysis|opinion|explain|guide|podcast|in review|so far|this year|since 20\d\d|in 20\d\d|total of|simulat|drill|fake|phishing|scam alert|warns? (of|about)|risk of|fears?|if )|\?|전망|가능성|루머|칼럼|분석|돌아보|년 전|주년|올해|누적|상반기|하반기|사칭|피싱|모의|훈련|우려|가짜|총정리|만약|시나리오|해설|인터뷰|기고/i;
const HACK = /\b(hack(ed|s)?|exploit(ed|s)?|breach(ed)?|drain(ed|s)?|stolen|heist)\b|해킹|탈취|도난|해커/i;
const HALT = /(suspend|halt|paus|freez|stop)\w*\s[\w\s,]{0,30}withdraw|withdrawals?\s(are\s)?(suspended|halted|paused|frozen|stopped)|출금\s?(을\s?)?(전면\s?|전체\s?|일시\s?)?(중단|정지|중지|동결)/i;
const ALL = /\ball\b|전면|모든|전체/i;
const MAINT = /maintenance|upgrade|hard ?fork|network|wallet maintenance|점검|업그레이드|하드포크|네트워크|정기/i;
const BANKRUPT = /bankrupt|chapter 11|insolven|파산|회생\s?(절차|신청)|지급\s?불능/i;
const REPEG = /regain|re-?peg|recover|restor|회복|복구/i;
const HACK_FOLLOW = /recover|freez|froze|help|assist|return|arrest|charg|sentenc|bount|launder|moved|moves|moving|sent to|deposited|deposit address|trace|회수|동결|도움|협력|체포|기소|반환|수사|세탁|이동|입금된|입금돼|추적/i;
const BANK_FOLLOW = /court|lawsuit|sue|estate|creditor|claim|distribut|repay|법원|소송|채권자|배상|분배|변제/i;
const DEPEG = /de-?peg|loses? (its )?(dollar )?peg|lost (its )?peg|below \$0\.9|디페그|페그\s?(이탈|붕괴)|페깅\s?(이탈|붕괴)/i;
const KREX = /(업비트|빗썸|\bupbit\b|\bbithumb\b)/i;
const LIST = /원화\s?마켓.{0,20}상장|상장.{0,20}원화|KRW.{0,15}(상장|마켓)|\b(lists|to list|will list|adds)\b.{0,60}\b(KRW|korean won|won market)/i;
const DELIST = /상장\s?폐지|거래\s?지원\s?종료|\bdelist/i;
const WARN = /유의\s?종목|투자\s?유의|유의\s?지정/i;

function amountUsd(t) {
  let best = 0, m;
  const en = /\$\s?([\d][\d,]*(?:\.\d+)?)\s?(billion|bn|b|million|mn|m)\b/gi;
  while ((m = en.exec(t))) { const v = parseFloat(m[1].replace(/,/g, "")) * (/^b/i.test(m[2]) ? 1e9 : 1e6); best = Math.max(best, v); }
  const ko = /(\d[\d,]*(?:\.\d+)?)\s?억\s?(?:(\d[\d,]*)\s?만)?\s?달러/g;
  while ((m = ko.exec(t))) { const v = parseFloat(m[1].replace(/,/g, "")) * 1e8 + (m[2] ? parseFloat(m[2].replace(/,/g, "")) * 1e4 : 0); best = Math.max(best, v); }
  const kw = /(\d[\d,]*(?:\.\d+)?)\s?(조|억)\s?원/g;
  while ((m = kw.exec(t))) { const v = parseFloat(m[1].replace(/,/g, "")) * (m[2] === "조" ? 1e12 : 1e8) / KRW_PER_USD; best = Math.max(best, v); }
  return best;
}
const first = (list, t) => { for (const [name, re] of list) if (re.test(t)) return name; return ""; };
function coinSym(t) {
  const p = /\(([A-Z0-9]{2,10})\)/.exec(t); if (p) return p[1];
  const u = /\b([A-Z]{2,8})\b/.exec(t.replace(/\b(KRW|USD|USDT|ETF|SEC|CEO|AI|NFT|DEX|CEX|BTC 마켓)\b/g, "")); return u ? u[1] : "";
}

// 제목 → 사건 (없으면 null)
export function classify(title) {
  const t = title;
  if (!t || EXCLUDE.test(t)) return null;
  const ex = first(EXCH, t);
  if (KREX.test(t)) {
    const k = /빗썸|bithumb/i.test(t) ? "빗썸" : "업비트", s = coinSym(t);
    if (DELIST.test(t)) return s ? { type: "delist", ent: k + ":" + s, sym: s, score: 9 } : null;
    if (WARN.test(t) && !/해제/.test(t)) return s ? { type: "warning", ent: k + ":" + s, sym: s, score: 9 } : null;
    if (LIST.test(t) && !/폐지|종료|유의/.test(t)) return s ? { type: "listing", ent: k + ":" + s, sym: s, score: 9 } : null;
  }
  const stable = first(STABLE, t);
  if (stable && DEPEG.test(t) && !REPEG.test(t)) return { type: "depeg", ent: stable, sym: stable, score: (stable === "USDT" || stable === "USDC") ? 10 : 9 };
  const firm = ex || first(FIRMS, t);
  if (firm && BANKRUPT.test(t) && !BANK_FOLLOW.test(t)) return { type: "bankrupt", ent: firm, sym: "", score: 10 };
  if (HACK.test(t) && !HACK_FOLLOW.test(t)) {
    const amt = amountUsd(t);
    if (ex) return { type: "hack", ent: ex, sym: "", amt, score: (MAJOR_EX.has(ex) || amt >= 1e8) ? 10 : 9 };
    if (amt >= 1e8) return { type: "hack", ent: first(PROTO, t), sym: "", amt, score: amt >= 1e9 ? 10 : 9 };
    return null;
  }
  if (ex && HALT.test(t) && ALL.test(t) && !MAINT.test(t)) return { type: "halt", ent: ex, sym: "", score: MAJOR_EX.has(ex) ? 10 : 9 };
  return null;
}

// 같은 사건인지
function same(a, b) {
  if (a.type !== b.type) return false;
  if (a.ent && b.ent) return a.ent === b.ent;
  if (a.type === "hack" && a.amt && b.amt) { const r = a.amt / b.amt; return r > 0.6 && r < 1.6; }
  return false;
}

const LABEL = { hack: "해킹", halt: "출금 전면 중단", bankrupt: "파산", depeg: "스테이블코인 디페그", listing: "원화마켓 상장", delist: "상장폐지·거래지원 종료", warning: "유의 종목 지정" };
function impactOf(h) {
  switch (h.type) {
    case "hack": return "해킹 규모에 따라 관련 코인 급락과 시장 전체 투자심리 악화가 올 수 있어요.";
    case "halt": return "해당 거래소 자금 이동이 막혀요. 불안이 번지면 시장 전체 변동성이 커질 수 있어요.";
    case "bankrupt": return "관련 자산 급락과 연쇄 청산이 나올 수 있어요.";
    case "depeg": return `${h.sym} 신뢰가 흔들리면 시장 전체가 급변할 수 있어요.`;
    case "listing": return `${h.sym} 단기 급등락 가능. 추격 매수 주의.`;
    case "delist": return `${h.sym} 급락·거래 불가 위험.`;
    case "warning": return `${h.sym} 급락·상장폐지 심사로 이어질 수 있어요.`;
  }
  return "";
}
const kstDay = ms => { const d = new Date(ms + 9 * 3600e3); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
const isKo = s => /[가-힣]/.test(s);

export async function watchNews(env, minute, now = Date.now()) {
  const i = (minute * 2) % FEEDS.length, pick = [FEEDS[i], FEEDS[(i + 1) % FEEDS.length]];
  const fetched = await Promise.all(pick.map(async ([src, url]) => {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; AI-Coin-Research/1.0; +https://coin-desk.kwana1016.workers.dev)", accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5" }, cf: { cacheTtl: 30 } });
      if (!res.ok) { try { res.body && res.body.cancel(); } catch (e) {} return { src, code: res.status, items: [] }; }
      const xml = await readHead(res);
      return { src, code: res.status, bytes: xml.length, items: parseItems(xml) };
    } catch (e) { return { src, code: 0, err: String(e && e.message || e).slice(0, 80), items: [] }; }
  }));
  const rows = await env.DB.prepare("SELECT k, v FROM kv WHERE k IN ('rss_hits', 'rss_status')").all();
  const kv = Object.fromEntries((rows.results || []).map(r => [r.k, r.v]));
  let hits = []; try { hits = JSON.parse(kv.rss_hits || "[]"); } catch (e) {}
  let status = {}; try { status = JSON.parse(kv.rss_status || "{}"); } catch (e) {}
  hits = hits.filter(h => now - (h.pub || h.seen) < KEEP_MS);
  let added = 0;
  for (const f of fetched) {
    const newest = f.items.reduce((a, x) => Math.max(a, x.ts || 0), 0);
    status[f.src] = { code: f.code, n: f.items.length, newest: newest || null, at: now, ...(f.err ? { err: f.err } : {}) };
    for (const it of f.items) {
      if (!it.ts || now - it.ts > FRESH_MS || it.ts - now > 600e3) continue;
      if (hits.some(h => h.link === it.link || (h.src === f.src && h.title === it.title))) continue;
      const c = classify(it.title); if (!c) continue;
      hits.push({ src: f.src, title: it.title, link: it.link, pub: it.ts, seen: now, ...c }); added++;
    }
  }
  const stmts = [env.DB.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('rss_status', ?1, ?2)").bind(JSON.stringify(status), now)];
  if (added) {
    hits = hits.slice(-200);
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('rss_hits', ?1, ?2)").bind(JSON.stringify(hits), now));
    // 매체 2곳 이상이 같은 사건을 보도하면 사이트에 올린다
    const done = new Set();
    for (const h of hits) {
      const grp = hits.filter(x => same(x, h));
      const srcs = [...new Set(grp.map(x => x.src))];
      if (srcs.length < 2) continue;
      const g0 = grp.slice().sort((a, b) => a.pub - b.pub);
      const k0 = g0[0], key = k0.type + "-" + String(k0.ent || Math.round(Math.log10(k0.amt || 1) * 10)).replace(/[^\w가-힣:]/g, "");
      if (done.has(key)) continue; done.add(key);
      const id = `n-${key}-${kstDay(g0[0].pub)}`;
      const best = g0.find(x => isKo(x.title)) || g0[0];
      const score = Math.max(...grp.map(x => x.score));
      const a = { title: best.title, url: best.link, source: `${best.src} 외 ${srcs.length - 1}곳`, score, coins: h.sym ? [h.sym] : [],
        summary: `여러 매체가 같은 사건(${LABEL[h.type]})을 보도해 자동으로 올렸어요. AI가 기사 내용을 확인하기 전이에요.`,
        impact: impactOf(h), auto: true, verify: "AI 확인 전", event: h.type, first_pub: g0[0].pub,
        srcs: g0.slice(0, 5).map(x => ({ src: x.src, title: x.title, url: x.link, pub: x.pub })), ts: now };
      // 이미 올린 사건이면 보도 매체 목록만 갱신 (AI가 쓴 요약은 그대로)
      stmts.push(env.DB.prepare(`INSERT INTO alerts (id, ts, kind, json) VALUES (?1, ?2, 'auto_news', ?3)
        ON CONFLICT(id) DO UPDATE SET json = json_set(alerts.json, '$.srcs', json_extract(excluded.json, '$.srcs'), '$.source', json_extract(excluded.json, '$.source'))`).bind(id, now, JSON.stringify(a)));
    }
  }
  await env.DB.batch(stmts);
  return { fetched: fetched.map(f => [f.src, f.code, f.items.length]), added };
}

// ── 가격 급변 (5분마다) ──
const PX = ["BTC", "ETH", "XRP", "SOL", "DOGE", "ADA", "TRX", "LINK", "AVAX", "SUI", "XLM", "HBAR", "BCH", "DOT", "NEAR", "APT", "UNI", "AAVE", "ETC", "ONDO", "ENA", "PEPE", "SHIB", "ARB", "SEI", "TAO", "WLD", "POL", "USDT"];
const wonTxt = x => x >= 1e8 ? `${Math.floor(x / 1e8)}억 ${Math.round((x % 1e8) / 1e4).toLocaleString("ko-KR")}만원` : x >= 100 ? Math.round(x).toLocaleString("ko-KR") + "원" : x.toFixed(2) + "원";
export async function watchPrices(env, now = Date.now()) {
  const mk = await env.DB.prepare("SELECT v FROM kv WHERE k = 'upbit_krw'").first();
  let have = null; try { have = mk ? JSON.parse(mk.v) : null; } catch (e) {}
  const list = PX.filter(s => !have || have["KRW-" + s]);
  const res = await fetch("https://api.upbit.com/v1/ticker?markets=" + list.map(s => "KRW-" + s).join(","), { headers: { accept: "application/json" } });
  if (!res.ok) return;
  const arr = await res.json(); const p = {};
  for (const x of arr) if (x && typeof x.market === "string" && x.trade_price > 0) p[x.market.slice(4)] = x.trade_price;
  if (!p.BTC) return;
  const rows = await env.DB.prepare("SELECT k, v FROM kv WHERE k IN ('px', 'px_alerted')").all();
  const kv = Object.fromEntries((rows.results || []).map(r => [r.k, r.v]));
  let snaps = []; try { snaps = JSON.parse(kv.px || "[]"); } catch (e) {}
  let alerted = {}; try { alerted = JSON.parse(kv.px_alerted || "{}"); } catch (e) {}
  const base = snaps.filter(s => now - s.t >= 50 * 60e3 && now - s.t <= 75 * 60e3).sort((a, b) => a.t - b.t)[0];
  const stmts = [];
  if (base) {
    const ch = s => (p[s] && base.p[s]) ? p[s] / base.p[s] - 1 : null;
    const events = [];
    const b = ch("BTC");
    if (b != null && Math.abs(b) >= 0.04) events.push({ key: "btc-" + (b > 0 ? "up" : "dn"), score: Math.abs(b) >= 0.07 ? 10 : 9, coins: ["BTC"],
      title: `비트코인 1시간 ${(b * 100).toFixed(1)}% ${b > 0 ? "급등" : "급락"} (${wonTxt(p.BTC)})`, impact: b > 0 ? "시장 전체로 급등이 번질 수 있어요. 추격 매수 주의." : "알트코인 연쇄 하락과 청산이 이어질 수 있어요." });
    const alts = PX.filter(s => s !== "USDT" && s !== "BTC").map(ch).filter(v => v != null);
    const dn = alts.filter(v => v <= -0.05).length / (alts.length || 1), up = alts.filter(v => v >= 0.05).length / (alts.length || 1);
    if (alts.length >= 15 && dn >= 0.7) events.push({ key: "mkt-dn", score: 10, coins: [], title: `시장 전체 급락: 주요 코인 ${Math.round(dn * 100)}%가 1시간 새 -5% 넘게 하락`, impact: "큰 사건이 있었을 가능성이 높아요. 뉴스를 먼저 확인하세요." });
    if (alts.length >= 15 && up >= 0.7) events.push({ key: "mkt-up", score: 9, coins: [], title: `시장 전체 급등: 주요 코인 ${Math.round(up * 100)}%가 1시간 새 +5% 넘게 상승`, impact: "큰 호재가 있었을 가능성이 있어요. 추격 매수 주의." });
    const u = ch("USDT");
    if (u != null && Math.abs(u) >= 0.03) events.push({ key: "usdt", score: 9, coins: ["USDT"], title: `테더(USDT) 원화 가격 1시간 ${(u * 100).toFixed(1)}% 급변 (${wonTxt(p.USDT)})`, impact: "환율 급변이나 스테이블코인 문제일 수 있어요. 김치 프리미엄도 함께 흔들려요." });
    for (const e of events) {
      if (alerted[e.key] && now - alerted[e.key] < 3 * 3600e3) continue;
      alerted[e.key] = now;
      const a = { title: e.title, url: "https://upbit.com/exchange?code=CRIX.UPBIT.KRW-BTC", source: "업비트 시세(자동 감지)", score: e.score, coins: e.coins,
        summary: "1시간 전 시세와 비교해 자동으로 감지했어요. 원인 뉴스는 AI가 확인해 덧붙여요.", impact: e.impact, auto: true, ts: now };
      stmts.push(env.DB.prepare("INSERT OR IGNORE INTO alerts (id, ts, kind, json) VALUES (?1, ?2, 'price', ?3)").bind(`p-${e.key}-${now}`, now, JSON.stringify(a)));
    }
    if (events.length) stmts.push(env.DB.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('px_alerted', ?1, ?2)").bind(JSON.stringify(alerted), now));
  }
  snaps.push({ t: now, p }); snaps = snaps.filter(s => now - s.t <= 80 * 60e3);
  stmts.push(env.DB.prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES ('px', ?1, ?2)").bind(JSON.stringify(snaps), now));
  await env.DB.batch(stmts);
}
