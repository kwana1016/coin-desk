/* AI 코인 리서치센터 — 공개 사이트 화면 (브라우저에서 /api/* 를 읽어 그린다) */
(function () {
  "use strict";
  const SITE = window.SITE || {};
  const HZ = [["24h", "24시간"], ["3d", "3일"], ["7d", "7일"]];
  const HZN = Object.fromEntries(HZ);
  const ORDER = { "강력관심": 0, "관심": 1, "중립": 2, "주의": 3 };
  const RSTAR = { "강력관심": 5, "관심": 4, "중립": 3, "주의": 1 };
  const WD = "일월화수목금토";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => (typeof u === "string" && /^https?:\/\//.test(u)) ? u : "";
  const n = x => (x == null || x === "" || isNaN(Number(x))) ? null : Number(x);

  // ── 형식 ──
  function won(x) { x = n(x); if (x == null) return "-"; if (x >= 100) return Math.round(x).toLocaleString("ko-KR") + "원";
    if (x >= 1) return x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "원"; return x.toFixed(4) + "원"; }
  function wonShort(x) { x = n(x); if (x == null || x < 1e8) return won(x); const eok = Math.floor(x / 1e8), man = Math.round((x - eok * 1e8) / 1e4);
    return `${eok}억${man ? " " + man.toLocaleString("ko-KR") + "만" : ""}원`; }
  function pct(x, d = 1) { x = n(x); if (x == null) return "-"; const v = x * 100; return (v > 0 ? "+" : "") + v.toFixed(d) + "%"; }
  const cls = x => { x = n(x); return x == null ? "" : (x > 0 ? "rise" : (x < 0 ? "fall" : "")); };
  const chg = (x, suf = "") => `<span class="chg ${cls(x)}">${pct(x)}${suf}</span>`;
  const coinStars = p => { const k = n(p.stars); return (k != null && k >= 1 && k <= 5) ? Math.round(k) : (RSTAR[p.rating] || 3); };
  const newsStars = x => { const k = n(x.stars); if (k != null && k >= 1 && k <= 5) return Math.round(k); const s = n(x.score); return s == null ? 1 : Math.max(1, Math.min(5, Math.ceil(s / 2))); };
  const stars = (k, label) => `<span class="stars" role="img" aria-label="${esc(label || ("별 " + k + "개"))}">${"★".repeat(k)}${k < 5 ? `<span class="off">${"☆".repeat(5 - k)}</span>` : ""}</span>`;
  const rt = r => `<span class="rt rt-${esc(r)}">${esc(r)}</span>`;
  function kp(ms) { const d = new Date(ms + 9 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), w: d.getUTCDay() }; }
  const kst = ms => { const p = kp(ms); return `${p.m}/${p.d}(${WD[p.w]}) ${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`; };
  const kstDate = ms => { const p = kp(ms); return `${p.m}/${p.d}`; };
  const hzName = h => HZN[h || "24h"] || h;

  // 뉴스 발행 시각 (pub_ts가 없으면 "MM/DD HH:MM"을 리포트 연도로 해석)
  function newsTs(x, reportTs) {
    const t = n(x.pub_ts); if (t) return t;
    const m = /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(x.time || ""); if (!m) return null;
    const y = kp(reportTs || Date.now()).y;
    let ts = Date.UTC(y, +m[1] - 1, +m[2], +m[3] - 9, +m[4]);
    if (reportTs && ts > reportTs + 86400e3) ts = Date.UTC(y - 1, +m[1] - 1, +m[2], +m[3] - 9, +m[4]);
    return ts;
  }
  function ago(ts) {
    if (!ts) return null; const s = (Date.now() - ts) / 1000;
    if (s < 0) return { t: "방금", c: "fresh" };
    if (s < 3600) return { t: `${Math.max(1, Math.round(s / 60))}분 전`, c: "fresh" };
    if (s < 6 * 3600) return { t: `${Math.round(s / 3600)}시간 전`, c: "recent" };
    if (s < 24 * 3600) return { t: `${Math.round(s / 3600)}시간 전`, c: "today" };
    if (s < 48 * 3600) return { t: "어제", c: "old" };
    return { t: `${Math.round(s / 86400)}일 전`, c: "old" };
  }

  async function get(path) { const r = await fetch(path, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(path + " " + r.status); return r.json(); }

  // ── 카드 조각 ──
  function ladder(lv, price) {
    price = n(price); if (!lv || n(lv.stop) == null || n(lv.target1) == null || price == null) return "";
    const stop = n(lv.stop), t1 = n(lv.target1), t2 = n(lv.target2), zl = n(lv.entry_low) ?? price, zh = n(lv.entry_high) ?? price;
    const vals = [stop, zl, zh, t1, t2, price].filter(v => v != null); const lo = Math.min(...vals) * 0.99, hi = Math.max(...vals) * 1.01, P = v => (v - lo) / (hi - lo) * 100;
    let segs = `<div class="seg s-loss" style="left:0;width:${P(zl).toFixed(2)}%"></div><div class="seg s-gain" style="left:${P(zh).toFixed(2)}%;width:${Math.max(0, P(t1) - P(zh)).toFixed(2)}%"></div>`;
    if (t2 != null) segs += `<div class="seg s-gain2" style="left:${P(t1).toFixed(2)}%;width:${Math.max(0, P(t2) - P(t1)).toFixed(2)}%"></div>`;
    segs += `<div class="seg s-zone" style="left:${P(zl).toFixed(2)}%;width:${Math.max(1.2, P(zh) - P(zl)).toFixed(2)}%"></div>`;
    const ticks = `<div class="tk stop" style="left:${P(stop).toFixed(2)}%"></div><div class="tk tgt" style="left:${P(t1).toFixed(2)}%"></div>` + (t2 != null ? `<div class="tk tgt" style="left:${P(t2).toFixed(2)}%"></div>` : "");
    return `<div class="ladder"><div class="ladder-title"><span>기술적 참고 레벨</span><span>왼쪽 이탈 기준 · 가운데 관심 가격대 · 오른쪽 저항</span></div>
      <div class="lrail" role="img" aria-label="${esc(`이탈 기준 ${won(stop)}, 관심 가격대 ${won(zl)}~${won(zh)}, 현재 ${won(price)}, 저항 ${won(t1)}`)}">${segs}${ticks}<div class="now" style="left:${Math.min(96, Math.max(4, P(price))).toFixed(2)}%"><span>지금</span><i></i></div></div>
      <div class="lvals"><div class="lv l-stop"><b>이탈 기준</b><span class="num">${won(stop)}</span><small>${pct(lv.stop_pct)}</small></div>
      <div class="lv l-zone"><b>관심 가격대</b><span class="num">${won(zl)}~</span><small>${won(zh)}</small></div>
      <div class="lv l-tgt"><b>저항 1·2</b><span class="num">${won(t1)}${t2 != null ? " · " + won(t2) : ""}</span><small>${pct(lv.t1_pct)}${lv.t2_pct != null ? " · " + pct(lv.t2_pct) : ""}</small></div></div>
      ${n(lv.rr) != null ? `<div class="lfoot">위아래 폭 비율 ${n(lv.rr).toFixed(1)} · 지난 주봉으로 계산한 참고값이에요</div>` : ""}</div>`;
  }
  function metrics(p) { const m = p.metrics || {}; const it = [["1주", m.chg_1w, 1], ["4주", m.chg_4w, 1], ["52주 고점 대비", m.from_hi52, 1], ["주간 변동폭", m.wk_range, 0]].filter(x => x[1] != null);
    return it.length ? `<div class="mgrid">${it.map(([k, v, s]) => `<div class="m"><b>${k}</b><span class="${s ? cls(v) : ""}">${s ? pct(v) : Math.round(n(v) * 100) + "%"}</span></div>`).join("")}</div>` : ""; }
  function card(p, anchor = true) {
    const k = coinStars(p);
    const reasons = (p.reasons || []).map(r => `<li>${esc(r)}</li>`).join("");
    const scen = (p.bull || p.bear) ? `<div class="scen">${p.bull ? `<div class="bull"><b>오르는 경우</b>${esc(p.bull)}</div>` : ""}${p.bear ? `<div class="bear"><b>내리는 경우</b>${esc(p.bear)}</div>` : ""}</div>` : "";
    let more = ""; if (p.invalidation) more += `<div><div class="mini-h">이 판단이 틀리는 조건</div>${esc(p.invalidation)}</div>`;
    if (p.checklist && p.checklist.length) more += `<div><div class="mini-h">확인할 것</div><ul>${p.checklist.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
    if (p.related && p.related.length) more += `<div class="related"><div class="mini-h">관련 뉴스</div>${p.related.slice(0, 3).map(x => { const s = newsStars(x); return `<div>${stars(s, "중요도 별 " + s + "개")}<span>${esc(x.title)}</span></div>`; }).join("")}</div>`;
    const tags = (p.position ? `<span class="tag">${esc(p.position)}</span>` : "") + (p.__new ? `<span class="tag new">새 코인</span>` : "");
    return `<article class="card"${anchor ? ` id="c-${esc(p.sym)}"` : ""}>
      <div class="c-head"><div class="c-id"><div class="c-name"><a href="/coin/${esc(p.sym)}">${esc(p.name || p.sym)}</a><span class="sym">${esc(p.sym)}</span></div>${tags ? `<div class="c-tags">${tags}</div>` : ""}</div><div class="c-verdict">${rt(p.rating)}${stars(k, "별 " + k + "개 (5점 만점)")}</div></div>
      <div class="c-price"><span class="p num">${won(p.price)}</span>${chg(p.chg24, " 24h")}</div>
      ${p.what ? `<p class="c-what">${esc(p.what)}</p>` : ""}
      ${p.since_last ? `<div class="since"><b>지난 리포트 이후</b>${esc(p.since_last)}</div>` : ""}
      ${p.comment ? `<p class="c-comment">${esc(p.comment)}</p>` : ""}
      ${metrics(p)}${reasons ? `<ul class="reasons">${reasons}</ul>` : ""}${ladder(p.levels, p.price)}${scen}
      ${p.counter ? `<div class="counter"><b>반대 의견</b>${esc(p.counter)}</div>` : ""}
      ${more ? `<details class="more"><summary>틀리는 조건 · 확인할 것 · 관련 뉴스</summary><div class="more-body">${more}</div></details>` : ""}</article>`;
  }
  function folded(p) { const k = coinStars(p);
    return `<details class="fold" id="c-${esc(p.sym)}"><summary><span class="f-name"><b>${esc(p.name || p.sym)}</b><span class="num tiny muted">${esc(p.sym)}</span>${p.__new ? `<span class="tag new">새 코인</span>` : ""}</span>
      <span class="f-right">${rt(p.rating)}${stars(k)}</span><span class="f-line"><span class="num">${won(p.price)}</span>${chg(p.chg24)}<span>${esc(p.comment || "")}</span></span></summary>${card(Object.assign({}, p, { __new: false }), false)}</details>`; }
  function glance(picks, cz) {
    const row = (p, caution) => { const k = caution ? 1 : coinStars(p); const rest = [];
      if (!caution && p.position) rest.push(esc(p.position)); if (p.__new) rest.push(`<span class="tag new">새 코인</span>`);
      const w = (p.metrics || {}).chg_1w; if (w != null) rest.push(`1주 <span class="num ${cls(w)}">${pct(w)}</span>`);
      if (caution && p.reason) { const r = String(p.reason); rest.push(esc(r.length > 46 ? r.slice(0, 46) + "…" : r)); }
      return `<a class="g-row" href="#c-${esc(p.sym)}"><span class="g-name"><b>${esc(p.name || p.sym)}</b><span class="sym">${esc(p.sym)}</span></span>
        <span class="g-price">${p.price != null ? `<span class="num">${wonShort(p.price)}</span>${chg(p.chg24)}` : ""}</span>${rt(caution ? "주의" : p.rating)}
        <span class="g-sub">${stars(k)} ${rest.join(" · ")}</span></a>`; };
    const strong = picks.filter(p => p.rating === "강력관심" || p.rating === "관심"), rest = picks.filter(p => !(p.rating === "강력관심" || p.rating === "관심"));
    let o = ""; if (strong.length) o += `<div class="g-group">관심</div>` + strong.map(p => row(p)).join("");
    if (rest.length) o += `<div class="g-group">지켜볼 코인</div>` + rest.map(p => row(p)).join("");
    if (cz.length) o += `<div class="g-group">주의</div>` + cz.map(c => row(c, true)).join("");
    return `<div class="glance">${o}</div>`;
  }
  function marketHtml(m) {
    let tiles = ""; if (m.btc) tiles += `<div class="stat"><b>비트코인</b><div class="v num">${wonShort(m.btc.price)}</div><div>${chg(m.btc.chg, " 24h")}</div><span class="tiny muted">시세: 업비트</span></div>`;
    if (m.fng && n(m.fng.value) != null) { const v = n(m.fng.value); tiles += `<div class="stat fng"><div class="fng-top"><b>공포탐욕 지수</b><span class="small muted">${esc(m.fng.label || "")}${m.fng.prev != null ? " · 전일 " + esc(m.fng.prev) : ""}</span></div>
      <div class="v num">${Math.round(v)}</div><div class="fng-bar" role="img" aria-label="공포탐욕 ${Math.round(v)} / 100"><i></i><i></i><i></i><i></i><i></i><span class="fng-mark" style="left:${Math.max(0, Math.min(100, v))}%"></span></div>
      <div class="fng-scale"><span>극단적 공포</span><span>중립</span><span>극단적 탐욕</span></div><a class="tiny" href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener">Data: alternative.me</a></div>`; }
    const watch = (m.watch || []).map(w => `<li>${esc(w)}</li>`).join("");
    const note = (m.summary || watch) ? `<div class="panel mkt-note"><h3>시장 요약</h3>${m.summary ? `<p>${esc(m.summary)}</p>` : ""}${watch ? `<div class="mini-h">이번에 지켜볼 것</div><ul class="watch">${watch}</ul>` : ""}</div>` : "";
    return (tiles || note) ? `<section class="section"><div class="mkt">${tiles}</div>${note}</section>` : "";
  }
  function newsHtml(list, reportTs) {
    if (!list.length) return "";
    const items = list.map((x, i) => Object.assign({}, x, { __i: i, __ts: newsTs(x, reportTs) }));
    const fresh = x => { const a = ago(x.__ts); return a ? `<span class="age age-${a.c}" data-ts="${x.__ts}">${a.t}</span>` : ""; };
    const meta = x => { const tone = x.tone || "중립"; const coins = (x.coins && x.coins.length) ? x.coins.join(", ") : "시장 전체";
      return `<div class="nmeta">${fresh(x)}<span class="tone tone-${esc(tone)}">${esc(tone)}</span>${x.category ? `<span class="tag cat">${esc(x.category)}</span>` : ""}<span>${esc(coins)} · ${esc(x.source || "")}</span></div>`; };
    const body = x => `${(x.summary || x.note) ? `<p class="nsum">${esc(x.summary || x.note)}</p>` : ""}${x.impact ? `<div class="nimpact"><b>영향</b>${esc(x.impact)}</div>` : ""}${x.priced_in ? `<div class="priced">가격 반영: ${esc(x.priced_in)}</div>` : ""}`;
    const title = (x, c) => { const u = safeUrl(x.url); return u ? `<a class="${c}" href="${esc(u)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : `<span class="${c}">${esc(x.title)}</span>`; };
    const top = x => { const k = newsStars(x); return `<article class="ntop"><div class="nscore"><span class="n">${x.score != null ? esc(x.score) : "-"}</span>${stars(k, `중요도 ${x.score}점, 별 ${k}개`)}<small>/10</small></div><div class="nbody">${title(x, "ntitle")}${meta(x)}${body(x)}</div></article>`; };
    const row = x => { const k = newsStars(x); return `<details class="nrow"><summary>${stars(k, "중요도 별 " + k + "개")}<span class="t">${esc(x.title)}</span>${meta(x)}</summary><div class="nrow-body">${body(x)}${safeUrl(x.url) ? title(x, "small") : ""}</div></details>`; };
    const byScore = items;
    const byTime = items.slice().sort((a, b) => (b.__ts || 0) - (a.__ts || 0));
    const view = mode => mode === "time"
      ? `<div class="nlist">${byTime.map(row).join("")}</div>`
      : `<div class="news">${byScore.slice(0, 3).map(top).join("")}</div>${byScore.length > 3 ? `<div class="nlist">${byScore.slice(3).map(row).join("")}</div>` : ""}`;
    const nFresh = items.filter(x => x.__ts && Date.now() - x.__ts < 6 * 3600e3).length;
    setTimeout(() => {
      const box = $("news-body"); if (!box) return;
      document.querySelectorAll("#news-sort button").forEach(b => b.addEventListener("click", () => {
        document.querySelectorAll("#news-sort button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        box.innerHTML = view(b.dataset.m);
      }));
    }, 0);
    return `<section class="section" id="news"><div class="sec-head"><h2>뉴스 ${list.length}건</h2><span class="sub">${nFresh ? `최근 6시간 안 ${nFresh}건 · ` : ""}발행 시각은 지금 기준</span></div>
      <div class="lvl" id="news-sort" role="group" aria-label="뉴스 정렬"><button type="button" data-m="score" aria-pressed="true">중요도순</button><button type="button" data-m="time" aria-pressed="false">최신순</button></div>
      <div id="news-body" class="section">${view("score")}</div></section>`;
  }
  function alertTag(a) {
    const k = a.kind;
    if (k === "auto_news") return a.checked === true ? "자동 감지 · AI 확인됨" : `자동 감지 · ${a.source || "여러 매체"} 보도 · AI 확인 전`;
    if (k === "price") return "자동 감지 · 업비트 시세";
    if (k === "listing" || k === "warning" || k === "delist") return "자동 감지 · 업비트 목록";
    return a.auto ? "자동 감지" : "AI 판단";
  }
  function alertsHtml(list) {
    if (!list.length) return "";
    return `<section class="alert" role="alert"><b>★5 긴급 소식</b>${list.slice(0, 4).map(a => { const u = safeUrl(a.url); const t = u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(a.title)}</a>` : esc(a.title);
      const ag = ago(a.ts);
      return `<div>${t}<div class="small muted">${ag ? `<span class="age age-${ag.c}" data-ts="${a.ts}">${ag.t}</span> ` : ""}${esc(alertTag(a))}${a.summary || a.impact ? " · " + esc(a.impact || a.summary) : ""}</div></div>`; }).join("")}</section>`;
  }
  function mergeAlerts(apiRows, reportAlerts) {
    const out = [], seen = new Set();
    [...apiRows.map(x => Object.assign({ ts: x.ts, kind: x.kind, __id: x.id }, x.a)), ...(reportAlerts || [])].forEach(a => {
      const k = a.__id || (a.url + "|" + a.title); if (seen.has(k) || seen.has(a.url + "|" + a.title)) return; seen.add(k); seen.add(a.url + "|" + a.title);
      if (!a.ts || Date.now() - a.ts < 24 * 3600e3) out.push(a); });
    return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }
  // 최신 리포트 화면: 1분마다 긴급 소식을 다시 읽어 바로 보여준다 (+ 브라우저 알림)
  let alertTimer = null;
  function watchAlerts(reportAlerts, first) {
    if (alertTimer) clearInterval(alertTimer);
    const known = new Set(first.map(a => a.__id || a.url));
    const canNotify = "Notification" in window;
    const btn = $("notify-btn");
    const on = () => { try { return canNotify && Notification.permission === "granted" && localStorage.getItem("notify") === "1"; } catch (e) { return false; } };
    const paint = () => { if (!btn) return; btn.hidden = !canNotify || Notification.permission === "denied"; btn.textContent = on() ? "긴급 알림 켜짐 (이 창이 열려 있을 때)" : "긴급 소식 브라우저 알림 받기"; btn.setAttribute("aria-pressed", String(on())); };
    if (btn) { paint(); btn.onclick = async () => {
      try { if (on()) { localStorage.setItem("notify", "0"); } else { const r = await Notification.requestPermission(); localStorage.setItem("notify", r === "granted" ? "1" : "0"); } } catch (e) {}
      paint(); }; }
    alertTimer = setInterval(async () => {
      try {
        const rows = await get("/api/alerts?t=" + Math.floor(Date.now() / 60000));
        const list = mergeAlerts(rows, reportAlerts);
        const box = $("alerts-box"); if (!box) { clearInterval(alertTimer); return; }
        box.innerHTML = alertsHtml(list);
        for (const a of list) { const k = a.__id || a.url; if (known.has(k)) continue; known.add(k);
          if (on()) { try { new Notification("★5 긴급 소식", { body: a.title, tag: k }); } catch (e) {} } }
      } catch (e) {}
    }, 60000);
  }
  function briefHtml(r) {
    const pts = ((r.brief || {}).points || []).filter(Boolean).slice(0, 3); if (!pts.length) return "";
    return `<section class="brief"><div class="sec-head"><h2>60초 브리핑</h2><span class="sub">오늘 꼭 알아야 할 3가지</span></div><ol>${pts.map(x => `<li><span>${esc(x)}</span></li>`).join("")}</ol></section>`;
  }
  function trackTable(items) {
    if (!items.length) return "";
    return `<div class="tbl"><table><thead><tr><th>코인</th><th>등급</th><th>별점</th><th>코멘트 시점</th><th>기간</th><th>수익률</th><th>BTC 대비</th><th>결과</th></tr></thead><tbody>${items.map(x =>
      `<tr><td><a href="/coin/${esc(x.sym)}">${esc(x.sym)}</a></td><td>${esc(x.rating || "")}</td><td>${x.stars ? stars(x.stars) : "-"}</td><td>${esc(x.from || "-")}</td><td><span class="hz">${esc(hzName(x.h))}</span></td><td class="num ${cls(x.ret)}">${pct(x.ret)}</td><td class="num ${cls(x.vs_btc)}">${pct(x.vs_btc)}</td><td class="${x.hit ? "rise" : "fall"}">${x.hit ? "적중" : "빗나감"}</td></tr>`).join("")}</tbody></table></div>`;
  }

  // ── 선 차트 (단일 계열, SVG) ──
  function lineChart(points, fmtY, zero, label) {
    if (points.length < 2) return "";
    const W = 420, H = 210, L = 62, R = 10, T = 14, B = 26;
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    let lo = Math.min(...ys), hi = Math.max(...ys); if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const X = v => L + (v - x0) / ((x1 - x0) || 1) * (W - L - R), Y = v => T + (hi - v) / ((hi - lo) || 1) * (H - T - B);
    let grid = ""; for (let i = 0; i < 4; i++) { const v = lo + (hi - lo) * i / 3, y = Y(v); grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axis" x="${L - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end">${esc(fmtY(v))}</text>`; }
    if (zero && lo < 0 && hi > 0) grid += `<line class="zero" x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`;
    const xl = `<text class="axis" x="${L}" y="${H - 6}" text-anchor="start">${kstDate(x0)}</text><text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${kstDate(x1)}</text>`;
    const path = points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
    const by = zero ? Y(Math.max(lo, Math.min(0, hi))) : H - B;
    const area = `M${X(xs[0]).toFixed(1)},${by.toFixed(1)} ` + path.replace("M", "L") + ` L${X(xs[xs.length - 1]).toFixed(1)},${by.toFixed(1)} Z`;
    const dots = points.length <= 40 ? points.map(p => `<circle class="dot" cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="4"/>`).join("") : "";
    const data = points.map(p => ({ x: +X(p[0]).toFixed(1), y: +Y(p[1]).toFixed(1), t: p[2] }));
    const id = "ch" + Math.random().toString(36).slice(2, 8);
    setTimeout(() => wireChart(id, data), 0);
    return `<div class="chart" id="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${xl}<path class="area" d="${area}"/><path class="line" d="${path}"/>${dots}<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}"/><circle class="hl" cx="0" cy="0" r="5"/><rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${H}"/></svg><div class="tip"></div></div>`;
  }
  function wireChart(id, pts) {
    const box = $(id); if (!box) return; const svg = box.querySelector("svg"), tip = box.querySelector(".tip"), xh = svg.querySelector(".xh"), hl = svg.querySelector(".hl"), vb = svg.viewBox.baseVal;
    const show = i => { const p = pts[i], r = svg.getBoundingClientRect(), sx = r.width / vb.width, sy = r.height / vb.height;
      xh.setAttribute("x1", p.x); xh.setAttribute("x2", p.x); xh.style.opacity = 1; hl.setAttribute("cx", p.x); hl.setAttribute("cy", p.y); hl.style.opacity = 1;
      tip.textContent = p.t; const bw = box.clientWidth, tw = tip.offsetWidth; const left = Math.max(tw / 2, Math.min(bw - tw / 2, p.x * sx)); tip.style.left = left + "px"; tip.style.top = (p.y * sy - 10) + "px"; tip.style.opacity = 1; };
    const hide = () => { xh.style.opacity = 0; hl.style.opacity = 0; tip.style.opacity = 0; };
    const near = ev => { const r = svg.getBoundingClientRect(); const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * vb.width; let b = 0, d = 1e9; pts.forEach((p, i) => { const k = Math.abs(p.x - cx); if (k < d) { d = k; b = i; } }); return b; };
    const hit = svg.querySelector(".hit"); hit.addEventListener("mousemove", e => show(near(e))); hit.addEventListener("mouseleave", hide);
    hit.addEventListener("touchstart", e => show(near(e)), { passive: true }); hit.addEventListener("touchmove", e => show(near(e)), { passive: true });
  }
  const agg = items => { if (!items.length) return null; const hits = items.filter(x => x.hit).length; return { n: items.length, hits, rate: hits / items.length, avg: items.reduce((s, x) => s + (n(x.vs_btc) || 0), 0) / items.length }; };

  // ── 페이지 ──
  const main = () => $("main");
  function setTitle(t, desc) { document.title = t ? `${t} · ${SITE.title || "AI 코인 리서치센터"}` : (SITE.title || "AI 코인 리서치센터"); }
  function nav(active) {
    const items = [["latest", "/", "최신 리포트"], ["weekly", "/weekly/", "주간 요약"], ["track", "/track", "성적표"], ["coins", "/coin/", "코인별"], ["sectors", "/sectors", "섹터 순위"], ["money", "/money", "돈 버는 코인"], ["map", "/map", "생태계 지도"]];
    $("nav").innerHTML = items.map(([k, h, l]) => `<a href="${h}"${k === active ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  }
  function openHash() { const h = decodeURIComponent(location.hash.slice(1)); if (!h) return; const el = document.getElementById(h); if (el) { if (el.tagName === "DETAILS") el.open = true; el.scrollIntoView({ block: "start" }); } }

  async function reportPage(id) {
    nav(id ? "" : "latest");
    const [rows, archive, alerts] = await Promise.all([get(id ? `/api/report/${encodeURIComponent(id)}` : "/api/latest"), get("/api/archive").catch(() => []), id ? Promise.resolve([]) : get("/api/alerts").catch(() => [])]);
    if (!rows.length) { main().innerHTML = `<div class="empty">아직 리포트가 없어요.</div>`; return; }
    const r = rows[0].r, rid = rows[0].id, prev = rows[1] ? rows[1].r : null; const m = r.market || {};
    const prevSyms = new Set([...((prev && prev.picks) || []), ...((prev && prev.cautions) || [])].map(x => x.sym));
    const picks = (r.picks || []).map(p => Object.assign({}, p, { __new: !!prev && !prevSyms.has(p.sym) })).sort((a, b) => (ORDER[a.rating] ?? 9) - (ORDER[b.rating] ?? 9));
    const cz = (r.cautions || []).map(c => Object.assign({}, c, { __new: !!prev && !prevSyms.has(c.sym) }));
    const nNew = picks.filter(p => p.__new).length, nPos = new Set(picks.map(p => p.position).filter(Boolean)).size;
    const strong = picks.filter(p => p.rating === "강력관심" || p.rating === "관심"), rest = picks.filter(p => !(p.rating === "강력관심" || p.rating === "관심"));
    const al = mergeAlerts(alerts, r.alerts);
    const tk = r.track || {};
    setTitle(id ? `${kst(r.ts)} 리포트` : "", m.headline);
    main().innerHTML = `<header class="head"><div class="head-top"><div class="eyebrow">${esc(SITE.title || "AI 코인 리서치센터")} · 코인 코멘트</div>${m.regime ? `<span class="chip regime-${esc(m.regime)}">${esc(m.regime)}</span>` : ""}</div>
      <h1>${esc(m.headline || "코인 코멘트")}</h1><div class="stamp">${kst(r.ts)} 작성 · 코인 ${picks.length}개${prev ? ` · 새 코인 ${nNew}개` : ""}${nPos ? ` · 분야 ${nPos}곳` : ""}</div></header>
      ${id && archive[0] && archive[0].id !== rid ? `<div class="notice">지난 리포트예요. <a href="/">최신 리포트 보기</a></div>` : ""}
      ${id ? alertsHtml(al) : `<div id="alerts-box">${alertsHtml(al)}</div><div class="row"><button type="button" class="btn sm" id="notify-btn" hidden></button></div>`}${briefHtml(r)}
      <section class="section" id="glance"><div class="sec-head"><h2>한눈에 보기</h2><span class="sub">누르면 해당 코인으로 이동</span></div>${glance(picks, cz)}
      <p class="legend">별점 ★5 강력관심 · ★4 관심 · ★3 관심(약)·중립(좋은 편) · ★2 중립 · ★1 주의. 등락 색은 업비트처럼 상승 빨강, 하락 파랑이에요.</p></section>
      ${marketHtml(m)}
      <section class="section" id="picks"><div class="sec-head"><h2>관심 코인 ${strong.length}개</h2><span class="sub">운용부</span></div><div class="cards">${strong.length ? strong.map(p => card(p)).join("") : `<div class="empty">이번 리포트에는 관심 코인이 없어요.</div>`}</div></section>
      ${rest.length ? `<section class="section"><div class="sec-head"><h2>지켜볼 코인 ${rest.length}개</h2><span class="sub">눌러서 펼치기</span></div><div class="cards">${rest.map(folded).join("")}</div></section>` : ""}
      ${cz.length ? `<section class="section"><div class="sec-head"><h2>주의 코인</h2><span class="sub">리스크관리부</span></div><div class="cz">${cz.map(c => `<div class="cz-item" id="c-${esc(c.sym)}"><div class="cz-top"><span class="row"><a href="/coin/${esc(c.sym)}">${esc(c.name || c.sym)}</a><span class="num tiny muted">${esc(c.sym)}</span>${rt("주의")}</span>${c.price != null ? `<span class="row"><span class="num small">${won(c.price)}</span>${chg(c.chg24)}</span>` : ""}</div><p>${esc(c.reason || "")}</p></div>`).join("")}</div></section>` : ""}
      ${newsHtml(r.news || [], r.ts)}
      ${(tk.summary || (tk.items && tk.items.length)) ? `<section class="section"><div class="sec-head"><h2>이번에 채점한 코멘트</h2><a class="small" href="/track">전체 성적표</a></div><p class="small" style="margin:0">${esc(tk.summary || "")}</p>${tk.items && tk.items.length ? `<div class="panel">${trackTable(tk.items)}</div>` : ""}</section>` : ""}
      ${archive.length > 1 ? `<section class="section"><h2>지난 리포트</h2><div class="archive">${archive.slice(0, 30).map(a => `<a href="/r/${esc(a.id)}"${a.id === rid ? ' aria-current="page"' : ""}>${kst(a.ts)}</a>`).join("")}</div></section>` : ""}`;
    if (!id) watchAlerts(r.alerts, al); else if (alertTimer) clearInterval(alertTimer);
    openHash();
  }

  async function trackPage() {
    nav("track"); setTitle("코멘트 성적표");
    const rows = await get("/api/scores"); const seen = new Set(); const S = [];
    rows.forEach(x => { const it = x.x || {}; if (!it.sym || it.ret == null) return; const h = it.h || "24h"; const k = it.sym + "|" + (it.from_id || it.from) + "|" + h; if (seen.has(k)) return; seen.add(k); S.push(Object.assign({}, it, { h, scored_ts: x.ts })); });
    const intro = `<div class="stamp">관심·주의 코멘트가 24시간·3일·7일 뒤 비트코인보다 잘했는지 채점해요. 관심류는 BTC보다 더 오르면, 주의는 BTC보다 못하면 적중이에요.</div>`;
    if (!S.length) { main().innerHTML = `<header class="head"><div class="eyebrow">회고부</div><h1>코멘트 성적표</h1>${intro}</header><div class="empty">아직 채점된 코멘트가 없어요.<br>코멘트를 쓰고 하루가 지나면 첫 결과가 올라와요.</div>`; return; }
    const tiles = HZ.map(([h, l]) => { const a = agg(S.filter(x => x.h === h)); return a ? `<div class="tile"><b>${l} 뒤</b><div class="v num">${Math.round(a.rate * 100)}%</div><div class="s">${a.hits}/${a.n} 적중 · BTC 대비 <span class="${cls(a.avg)}">${pct(a.avg)}</span></div></div>` : `<div class="tile"><b>${l} 뒤</b><div class="v num muted">-</div><div class="s">아직 채점 전</div></div>`; }).join("");
    const table = `<div class="tbl"><table><thead><tr><th>별점</th>${HZ.map(([, l]) => `<th>${l} 뒤</th>`).join("")}</tr></thead><tbody>${[5, 4, 3, 2, 1].map(k => `<tr><td>${stars(k)}</td>${HZ.map(([h]) => { const g = agg(S.filter(x => x.stars === k && x.h === h)); return `<td class="num">${g ? `${Math.round(g.rate * 100)}% <span class="muted">(${g.hits}/${g.n})</span>` : "-"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;
    const day = S.filter(x => x.h === "24h");
    const bars = [5, 4, 3, 2, 1].map(k => { const g = agg(day.filter(x => x.stars === k)); return g ? `<div class="bar-row"><span>${stars(k)}</span><div class="bar-track" role="img" aria-label="적중률 ${Math.round(g.rate * 100)}%"><div class="bar-fill" style="width:${(g.rate * 100).toFixed(1)}%"></div><span class="bar-half"></span></div><span class="num">${Math.round(g.rate * 100)}% <span class="muted">(${g.hits}/${g.n})</span></span></div>` : `<div class="bar-row"><span>${stars(k)}</span><div class="bar-track"><span class="bar-half"></span></div><span class="muted small">표본 없음</span></div>`; }).join("");
    const batches = {}; day.forEach(x => (batches[x.scored_ts] = batches[x.scored_ts] || []).push(x));
    let cum = 0; const pts = Object.keys(batches).map(Number).sort((a, b) => a - b).map(ts => { const add = batches[ts].reduce((s, x) => s + (n(x.vs_btc) || 0), 0); cum += add; return [ts, cum * 100, `${kst(ts)} · ${batches[ts].length}건, 이번 ${(add * 100).toFixed(1)}%p → 누적 ${(cum * 100).toFixed(1)}%p`]; });
    const chart = pts.length >= 2 ? lineChart(pts, v => (v > 0 ? "+" : "") + v.toFixed(0) + "%p", true, "24시간 기준 BTC 대비 초과수익 누적") : "";
    const recent = S.slice().sort((a, b) => b.scored_ts - a.scored_ts).slice(0, 40);
    main().innerHTML = `<header class="head"><div class="eyebrow">회고부</div><h1>코멘트 성적표</h1>${intro}</header>
      <section class="tiles">${tiles}</section>
      <section class="panel section"><h2>별점별 적중률 (24시간)</h2><div class="bars">${bars}</div><p class="legend">가운데 세로선이 50%예요. 별이 많을수록 적중률도 높아야 별점을 믿을 수 있어요. 표본이 적을 때는 참고만 하세요.</p></section>
      <section class="panel section"><h2>기간별로 보면</h2>${table}<p class="legend">짧게는 맞고 길게는 틀리는지, 그 반대인지 볼 수 있어요.</p></section>
      ${chart ? `<section class="panel section"><h2>BTC 대비 초과수익 누적 (24시간)</h2>${chart}<p class="legend">채점된 코멘트의 BTC 대비 수익률(%p)을 차례로 더한 값이에요.</p></section>` : ""}
      <section class="panel section"><h2>최근 채점 ${recent.length}건</h2>${trackTable(recent)}</section>`;
  }

  async function coinPage(sym) {
    nav("coins");
    const d = await get(`/api/coin/${encodeURIComponent(sym)}`);
    const E = d.entries.map(x => Object.assign({ id: x.id, ts: x.ts }, x.p)).sort((a, b) => a.ts - b.ts);
    if (!E.length) { setTitle(sym); main().innerHTML = `<header class="head"><div class="eyebrow">코인별 기록</div><h1>${esc(sym)}</h1></header><div class="empty">아직 이 코인의 코멘트가 없어요.</div>`; return; }
    const last = E[E.length - 1]; const name = last.name || sym; setTitle(`${name}(${sym})`);
    const res = {}; d.scores.forEach(x => { const it = x.x || {}; if (it.ret == null) return; (res[it.from_id] = res[it.from_id] || []).push(Object.assign({}, it, { h: it.h || "24h" })); });
    const pts = E.filter(c => n(c.price) != null).map(c => [c.ts, n(c.price), `${kst(c.ts)} · ${won(c.price)} · ${c.rating} ★${coinStars(c)}`]);
    const chart = pts.length >= 2 ? lineChart(pts, v => won(v).replace("원", ""), false, `${name} 코멘트 시점 가격`) : "";
    const a = agg(Object.values(res).flat().filter(x => x.h === "24h"));
    const pos = (E.slice().reverse().find(c => c.position) || {}).position || "";
    const tl = E.slice().reverse().map(c => { const rr = (res[c.id] || []).sort((x, y) => HZ.findIndex(z => z[0] === x.h) - HZ.findIndex(z => z[0] === y.h));
      return `<div class="tl"><div class="tl-top"><a class="small" href="/r/${esc(c.id)}#c-${esc(sym)}">${kst(c.ts)}</a><span class="row">${rt(c.rating)}${stars(coinStars(c))}</span></div>
        <div class="row"><span class="num small">${won(c.price)}</span>${chg(c.chg24, " 24h")}</div>${c.comment ? `<p>${esc(c.comment)}</p>` : ""}
        ${(c.reasons || []).length ? `<ul class="reasons">${c.reasons.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${rr.map(x => `<div class="res"><span class="hz">${esc(hzName(x.h))} 뒤</span>${chg(x.ret)}<span>BTC 대비 <span class="num ${cls(x.vs_btc)}">${pct(x.vs_btc)}</span></span><b class="${x.hit ? "rise" : "fall"}">${x.hit ? "적중" : "빗나감"}</b></div>`).join("")}</div>`; }).join("");
    main().innerHTML = `<header class="head"><div class="eyebrow">코인별 기록${pos ? " · " + esc(pos) : ""}</div><h1>${esc(name)} <span class="muted num" style="font-size:15px">${esc(sym)}</span></h1>
      <div class="stamp">이 코인이 받은 코멘트와 별점, 24시간·3일·7일 뒤 결과를 시간순으로 모았어요.</div></header>
      <section class="tiles"><div class="tile"><b>최근 별점</b><div class="v">${stars(coinStars(last))}</div><div class="s">${esc(last.rating)} · ${kst(last.ts)}</div></div>
      <div class="tile"><b>코멘트 횟수</b><div class="v num">${E.length}번</div><div class="s">처음 ${kst(E[0].ts)}</div></div>
      <div class="tile"><b>채점 결과</b><div class="v num">${a ? Math.round(a.rate * 100) + "%" : "-"}</div><div class="s">${a ? `${a.hits}/${a.n} 적중 (24시간)` : "아직 채점 전"}</div></div></section>
      ${chart ? `<section class="panel section"><h2>코멘트 시점 가격</h2>${chart}<p class="legend">점 하나가 코멘트 하나예요.</p></section>` : ""}
      <section class="section"><h2>코멘트 기록</h2><div class="timeline">${tl}</div></section>`;
  }

  async function coinsPage() {
    nav("coins"); setTitle("코인별 기록");
    const [ms, sc] = await Promise.all([get("/api/mentions"), get("/api/scores").catch(() => [])]);
    const by = {}; ms.forEach(x => { const c = by[x.s] = by[x.s] || { sym: x.s, n: 0, last: null }; c.n++; if (!c.last || x.ts > c.last.ts) c.last = x; });
    const hits = {}; sc.forEach(x => { const it = x.x || {}; if ((it.h || "24h") !== "24h" || it.ret == null) return; (hits[it.sym] = hits[it.sym] || []).push(it); });
    const rows = Object.values(by).sort((a, b) => b.last.ts - a.last.ts || (b.last.st || 0) - (a.last.st || 0));
    main().innerHTML = `<header class="head"><div class="eyebrow">코인별 기록</div><h1>코멘트한 코인 ${rows.length}개</h1><div class="stamp">코인 이름을 누르면 코멘트 기록과 결과를 볼 수 있어요. 최근 코멘트 순이에요.</div></header>
      <section class="panel"><div class="tbl"><table><thead><tr><th>코인</th><th>최근 별점</th><th>등급</th><th>코멘트</th><th>적중 (24시간)</th><th>최근</th></tr></thead><tbody>${rows.map(c => { const g = agg(hits[c.sym] || []); const k = Math.round(n(c.last.st) || RSTAR[c.last.rt] || 3);
        return `<tr><td><a href="/coin/${esc(c.sym)}">${esc(c.last.n || c.sym)}</a> <span class="muted num tiny">${esc(c.sym)}</span></td><td>${stars(k)}</td><td>${rt(c.last.rt)}</td><td class="num">${c.n}번</td><td class="num">${g ? `${Math.round(g.rate * 100)}% (${g.hits}/${g.n})` : "-"}</td><td class="num">${kst(c.last.ts)}</td></tr>`; }).join("")}</tbody></table></div></section>`;
  }

  async function weeklyPage(id) {
    nav("weekly");
    const d = await get("/api/weekly" + (id ? `?id=${encodeURIComponent(id)}` : ""));
    if (!d.current) { setTitle("주간 요약"); main().innerHTML = `<header class="head"><div class="eyebrow">주간 요약</div><h1>주간 요약</h1></header><div class="empty">첫 주간 요약은 일요일 밤에 올라와요.</div>`; return; }
    const w = d.current.w, wid = d.current.id; setTitle(`주간 요약 ${w.label || ""}`);
    const counts = w.counts || {};
    const tiles = [["reports", "리포트"], ["coins", "다룬 코인"], ["news", "다룬 뉴스"]].filter(([k]) => counts[k] != null).map(([k, l]) => `<div class="tile"><b>${l}</b><div class="v num">${esc(counts[k])}</div></div>`).join("");
    const trk = HZ.map(([h, l]) => { const t = (w.track || {})[h]; return t && t.n ? `<div class="tile"><b>${l} 뒤 적중률</b><div class="v num">${Math.round(n(t.rate) * 100)}%</div><div class="s">${esc(t.hits)}/${esc(t.n)} · BTC 대비 <span class="${cls(t.avg)}">${pct(t.avg)}</span></div></div>` : ""; }).join("");
    const top = (w.top || []).map((c, i) => { const k = Math.round(n(c.avg_stars) || 3); return `<div class="rank-row"><span class="no">${i + 1}</span><span class="nm"><b><a href="/coin/${esc(c.sym)}">${esc(c.name || c.sym)}</a> <span class="num tiny muted">${esc(c.sym)}</span></b><span>${esc(c.note || "")}</span></span><span class="row" style="justify-content:flex-end">${stars(k)}<span class="tiny muted">${esc(c.count)}번</span>${c.chg_week != null ? chg(c.chg_week) : ""}</span></div>`; }).join("");
    const secs = w.sectors || []; const mx = Math.max(1, ...secs.map(s => n(s.count) || 0));
    const sectors = secs.slice(0, 8).map(s => `<div class="bar-row"><span class="small">${esc(s.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${((n(s.count) || 0) / mx * 100).toFixed(0)}%"></div></div><span class="num small">${esc(s.count)}번</span></div>`).join("");
    const cal = (w.next_week || []).map(x => `<div class="cal-row"><span class="d">${esc(x.date)}</span><span>${esc(x.event)}${x.coins && x.coins.length ? " · " + esc(x.coins.join(", ")) : ""}</span></div>`).join("");
    const nxt = (w.watch_next || []).map(x => `<li>${esc(x)}</li>`).join(""), les = (w.lessons || []).map(x => `<li>${esc(x)}</li>`).join("");
    main().innerHTML = `<header class="head"><div class="eyebrow">주간 요약 · ${esc(w.label || "")}</div><h1>${esc(w.headline || "이번 주 코인 요약")}</h1><div class="stamp">${kst(w.ts)} 작성</div></header>
      ${w.summary ? `<section class="brief"><p style="margin:0">${esc(w.summary)}</p></section>` : ""}
      ${tiles ? `<section class="tiles">${tiles}</section>` : ""}
      ${top ? `<section class="panel section"><h2>이번 주 가장 주목한 코인</h2><div class="rank">${top}</div><p class="legend">리포트에 나온 횟수와 평균 별점, 처음 코멘트한 때부터의 가격 변화예요.</p></section>` : ""}
      ${sectors ? `<section class="panel section"><h2>많이 다룬 분야</h2><div class="bars">${sectors}</div></section>` : ""}
      ${trk ? `<section class="section"><h2>이번 주 성적</h2><div class="tiles">${trk}</div></section>` : ""}
      ${w.link_story ? `<div class="story"><b>LINK 스토리 · ${esc(w.link_story.verdict || "")}</b><span>${esc(w.link_story.text || "")}</span></div>` : ""}
      ${cal ? `<section class="panel section"><h2>다음 주 일정</h2><div class="cal">${cal}</div></section>` : ""}
      ${nxt ? `<section class="panel section"><h2>다음 주에 지켜볼 것</h2><ul class="watch">${nxt}</ul></section>` : ""}
      ${les ? `<section class="panel section"><h2>이번 주 교훈</h2><ul class="watch">${les}</ul></section>` : ""}
      ${d.list.length > 1 ? `<section class="section"><h2>지난 주간 요약</h2><div class="archive">${d.list.map(x => `<a href="/weekly/${esc(x.id)}"${x.id === wid ? ' aria-current="page"' : ""}>${esc(x.label || x.id)}</a>`).join("")}</div></section>` : ""}`;
  }

  async function mapPage() {
    nav("map"); setTitle("코인 생태계 지도");
    const [eco, ms] = await Promise.all([get("/ecosystem.json"), get("/api/mentions").catch(() => [])]);
    const latest = {}; ms.forEach(x => { if (!latest[x.s] || x.ts > latest[x.s].ts) latest[x.s] = x; });
    const lv = eco.levels || {};
    const layers = (eco.layers || []).map((L, i) => {
      const chips = (L.sectors || []).map(s => { const f = (s.leaders || [])[0]; if (!f) return ""; return latest[f.sym] ? `<a href="/coin/${esc(f.sym)}">${esc(f.name || f.sym)}</a>` : `<span>${esc(f.name || f.sym)}</span>`; }).join("");
      const secs = (L.sectors || []).map(s => `<div class="sector"><h3>${esc(s.name)}</h3><div class="w2">웹2로 치면 · ${esc(s.web2)}</div><div class="leaders">${(s.leaders || []).map((c, j) => { const l = latest[c.sym];
        const nm = l ? `<a href="/coin/${esc(c.sym)}">${esc(c.name || c.sym)}</a>` : `<b>${esc(c.name || c.sym)}</b>`;
        return `<div class="leader"><span class="rk">${j + 1}</span><span>${nm} <span class="num tiny muted">${esc(c.sym)}</span>${l ? rt(l.rt) : ""}</span><span class="why">${esc(c.why)}</span></div>`; }).join("")}</div>
        <div class="drivers need-3"><span><b>움직이는 재료</b> ${esc(s.drivers)}</span><span><b>주의할 점</b> ${esc(s.risk)}</span></div></div>`).join("");
      return `<section class="layer"><div class="layer-head"><h2>${i + 1}층 · ${esc(L.name)}</h2><span class="w2">웹2로 치면 ${esc(L.web2)}</span></div><p class="layer-desc">${esc(L.desc)}</p><div class="chips1 only-1">${chips}</div><div class="sectors need-2">${secs}</div></section>`; }).join("");
    const flows = (eco.flows || []).map(f => `<div class="flow"><b>${esc(f.from)}</b><span class="arrow">→</span><b>${esc(f.to)}</b><span class="tag">${esc(f.what)}</span><span class="fx">${esc(f.why)}</span></div>`).join("");
    const keys = Object.keys(lv).sort();
    main().innerHTML = `<header class="head"><div class="eyebrow">생태계 지도</div><h1>코인 세계를 6층 건물로 보면</h1><div class="stamp">분야마다 우리가 아는 서비스(웹2)에 빗대고, 대표 코인과 이유를 붙였어요.</div></header>
      <div class="section"><div class="lvl" role="group" aria-label="난이도">${keys.map(k => `<button type="button" data-l="${k}">${esc(lv[k].name)}</button>`).join("")}</div>${keys.map(k => `<p class="lvl-desc stamp" data-l="${k}">${esc(lv[k].desc)}</p>`).join("")}</div>
      <div id="map" class="map stack lv-1">${layers}<section class="layer need-3"><div class="layer-head"><h2>분야끼리 이렇게 연결돼요</h2></div><div class="flows">${flows}</div></section></div>
      <p class="legend">${esc(eco.note || "")} 등급 표시는 최근 리포트 기준이에요. 기준일 ${esc(eco.updated || "")}.</p>`;
    const set = l => { $("map").className = "map stack lv-" + l; document.querySelectorAll(".lvl button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.l === l))); document.querySelectorAll(".lvl-desc").forEach(p => p.hidden = p.dataset.l !== l); try { localStorage.setItem("mapLevel", l); } catch (e) {} };
    document.querySelectorAll(".lvl button").forEach(b => b.addEventListener("click", () => set(b.dataset.l)));
    let s = "1"; try { s = localStorage.getItem("mapLevel") || "1"; } catch (e) {} if (/^[123]$/.test(location.hash.slice(1))) s = location.hash.slice(1); set(s);
  }

  // ── 섹터 순위판 ──
  // 순위는 Worker가 규칙대로 계산(점수 = 품질×0.6 + 규모×0.25 + 섹터 생존×0.15 + 뉴스), 뉴스 점수는 하루 3번 AI가 넣어요.
  const QN = ["실사용·수익", "토큰 가치 포착", "경쟁우위", "공급 건전성", "생존 이력"];
  const GRADE = s => s >= 80 ? ["A", "핵심"] : s >= 65 ? ["B", "성장"] : s >= 50 ? ["C", "순환"] : ["D", "회피"];
  const SPARTS = [["실수익", 25], ["사용 추세", 20], ["기관 채택", 15], ["규제 내구성", 15], ["대체 불가능성", 15], ["사이클 생존", 10]];
  const SPS = ["실수익", "사용 추세", "기관 채택", "규제 내구성", "대체 불가", "사이클 생존"]; // 막대 위 짧은 이름
  const WHY = { rank: "시총 150위 밖(업비트 원화·바이낸스 300위 안 아님)", liq: "거래량 부족", nodata: "시세 없음", core: "기준 코인" };
  const MOVE = { promo: "1군 승격", demo: "2군 강등", in: "후보 진입", out: "후보 제외", up: "순위 상승", down: "순위 하락", warn: "유의 종목 지정", unwarn: "유의 해제" };
  const VIA = { chal: "2번 연속 3점 이상 앞섬", fast: "큰 뉴스로 바로 승격", fill: "빈자리 채움", act: "150위 안 후보가 모자라 임시로 채움" };
  const pp = x => { x = n(x); return x == null ? "-" : (x > 0 ? "+" : "") + x.toFixed(Math.abs(x) >= 100 ? 0 : 1) + "%"; };
  const ppc = x => { x = n(x); return x == null ? "" : x > 0 ? "rise" : x < 0 ? "fall" : ""; };
  const ppChip = (x, suf = "") => n(x) == null ? `<span class="chg">-</span>` : `<span class="chg ${ppc(x)}">${pp(x)}${suf}</span>`;
  function usd(x) { x = n(x); if (x == null) return "-"; if (x >= 1000) return "$" + Math.round(x).toLocaleString("en-US"); if (x >= 1) return "$" + x.toFixed(2);
    return "$" + Number(x.toPrecision(3)).toString(); }
  function capKo(x) { x = n(x); if (!x) return "-"; if (x >= 1e12) return (x / 1e12).toFixed(2) + "조 달러"; const e = x / 1e8; return (e >= 10 ? Math.round(e).toLocaleString("ko-KR") : e.toFixed(1)) + "억 달러"; }
  function flagsOf(mk) {
    const f = []; if (!mk) return f; const d7 = n(mk[6]), d30 = n(mk[7]), ath = n(mk[9]);
    if ((d30 != null && d30 >= 40) || (d7 != null && d7 >= 25)) f.push("hot");
    if ((ath != null && ath <= -90) || (d30 != null && d30 <= -30)) f.push("deep");
    return f;
  }
  const FLAG = { hot: ["과열", "최근 30일 +40% 이상 또는 7일 +25% 이상"], deep: ["과대낙폭", "고점 대비 -90% 이하 또는 최근 30일 -30% 이하"], warn: ["유의", "국내 거래소 유의 종목 — 지정이 풀릴 때까지 점수 -8"],
    fhi: ["펀딩↑", "바이낸스 선물 펀딩비가 연 30% 이상(롱이 내는 비용) — 선물로 오래 들고 있으면 비용이 커요"], fneg: ["펀딩↓", "펀딩비가 음수 — 숏이 몰려 롱이 펀딩비를 받아요"],
    unl: ["언락", "2주 안에 유통량의 1% 이상이 풀려요"] };
  // DefiLlama 수익 데이터 → 화면용 숫자. f = [수수료30일, 수수료7일, 수수료1년, 매출30일, 매출1년, 보유자수익30일, 보유자수익1년, 종류, 받은 시각]
  function feeInfo(f, mk) {
    if (!f || (f[0] == null && f[3] == null && f[5] == null)) return null;
    const yr = (d30, y1) => Math.max(d30 != null ? d30 * 365 / 30 : 0, y1 != null ? y1 * 0.5 : 0);
    const mcap = mk ? n(mk[3]) : null;
    const F = yr(f[0], f[2]), R = yr(f[3], f[4]), H = yr(f[5], f[6]);
    const trend = f[0] > 0 && f[1] != null ? ((f[1] / 7) / (f[0] / 30) - 1) * 100 : null;
    return { f30: f[0], f7: f[1], r30: f[3], h30: f[5], F, R, H, chain: f[7] === 2, at: f[8], trend,
      mult: mcap && H > 0 ? mcap / H : null, multR: mcap && R > 0 ? mcap / R : null };
  }
  const krUsd = x => { x = n(x); if (x == null) return "-"; if (x <= 0) return "0"; if (x >= 1e8) return (x / 1e8).toFixed(x >= 1e10 ? 0 : 1) + "억 달러"; if (x >= 1e4) return Math.round(x / 1e4).toLocaleString("ko-KR") + "만 달러"; return "$" + Math.round(x).toLocaleString("en-US"); };
  const xMult = x => x == null ? "-" : x >= 1000 ? Math.round(x).toLocaleString("en-US") + "배" : x >= 100 ? Math.round(x) + "배" : x.toFixed(1) + "배";
  function moneySection(M, secName) {
    const list = Object.values(M.coins).filter(c => c.fz && c.fz.H > 0 && c.lg).sort((a, b) => b.fz.H - a.fz.H).slice(0, 12);
    if (!list.length) return `<details class="panel exl"><summary>돈 버는 코인 — DefiLlama 수익 데이터를 받는 중이에요</summary><div class="small muted" style="margin-top:8px">30분마다 코인 10개씩 받아서 몇 시간 안에 채워져요.</div></details>`;
    const dsh = c => c.fz.sh30 != null && c.fz.sh7 != null ? c.fz.sh7 - c.fz.sh30 : null;
    return `<section class="section"><div class="sec-head"><h2>돈 버는 코인</h2><span class="sub">토큰 보유자에게 돌아가는 수익 순 · DefiLlama${M.feesAt ? " · " + kst(M.feesAt) : ""}</span></div>
      <div class="panel"><div class="tbl"><table class="money"><thead><tr><th>코인</th><th>보유자 수익<br>30일</th><th>시총 ÷ 연<br>보유자 수익</th><th>수수료<br>1주 추세</th><th>섹터<br>점유율</th></tr></thead><tbody>${list.map(c => `<tr>
        <td class="mn"><a href="/rank/${encodeURIComponent(c.sym)}">${esc(c.b.ko || c.sym)}</a><span class="tiny muted">${esc(secName[c.sec] || c.sec)}${c.lg === 1 ? " · 1군" : ""}</span></td>
        <td class="num">${krUsd(c.fz.h30)}</td><td class="num">${xMult(c.fz.mult)}</td>
        <td class="num ${ppc(c.fz.trend)}">${pp(c.fz.trend)}</td>
        <td class="num">${c.fz.sh30 != null ? c.fz.sh30.toFixed(0) + "%" : "-"}${dsh(c) != null && Math.abs(dsh(c)) >= 1 ? ` <span class="tiny ${ppc(dsh(c))}">${dsh(c) > 0 ? "▲" : "▼"}${Math.abs(dsh(c)).toFixed(0)}p</span>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="legend">보유자 수익 = 바이백·소각·분배로 토큰 보유자에게 간 몫. 시총 ÷ 연 보유자 수익은 주식의 PER처럼 낮을수록 수익 대비 싸다는 뜻이에요(30일 값을 1년으로 환산). 수수료 1주 추세 = 최근 7일 하루 평균이 30일 하루 평균보다 몇 % 많은지. 섹터 점유율 = 섹터 안 코인들 수수료 합에서 차지하는 몫(30일), ▲▼는 최근 7일 점유율과의 차이예요.</p></div></section>`;
  }
  // 바이낸스 선물 펀딩비: f = [1회 펀딩비 %, 미결제약정 $] — 연환산은 8시간마다 낸다고 보고 계산 (일부 코인은 4시간·1시간 주기라 더 클 수 있음)
  function fundInfo(f) { if (!f || f[0] == null) return null; return { rate: f[0], yr: f[0] * 3 * 365, oi: f[1] }; }
  function fundFlag(f) { const x = fundInfo(f); return !x ? [] : x.yr >= 30 ? ["fhi"] : x.yr <= -15 ? ["fneg"] : []; }
  // 언락: u = [다음 언락 시각, 유통량 대비 %, 금액$, 아직 잠긴 비율 %(최대 공급 대비), 방식] — 코인마켓캡
  const unlSoon = u => u && u[0] && u[0] - Date.now() < 30 * 86400e3 && u[1] != null ? u[1] : null;
  function unlFlag(u) { return u && u[0] && u[0] - Date.now() < 14 * 86400e3 && u[1] != null && u[1] >= 1 ? ["unl"] : []; }
  function sectorModel(d) {
    const rank = d.rank || { c: {}, moves: [], news: {}, trail: {} };
    const cp = (d.kv.cp && d.kv.cp.m) || {};
    const upbit = new Set(Object.keys(d.kv.upbit || {}).map(k => k.replace(/^KRW-/, "")));
    const bithumb = new Set(d.kv.bithumb || []), bnf = new Set(d.kv.bnf || []), mine = new Set(d.kv.mine || []);
    const sec = {}; (d.sectors || []).forEach(s => sec[s.id] = s);
    // 시세 찾기: 코인게코 id(b.cg) → 심볼(같은 심볼이 여럿이면 시총이 가장 큰 것)
    const bySym = new Map(); Object.entries(cp).forEach(([id, a]) => { const s = String(a[1] || "").toUpperCase(), cur = bySym.get(s); if (!cur || (n(a[3]) || 0) > (n(cp[cur][3]) || 0)) bySym.set(s, id); });
    const keyOf = b => (b.cg && cp[b.cg]) ? b.cg : ([b.sym, b.kr].filter(Boolean).map(x => bySym.get(String(x).toUpperCase())).find(Boolean) || null);
    const feesM = (d.kv.fees && d.kv.fees.m) || {}, fundM = (d.kv.fund && d.kv.fund.m) || {}, unlM = (d.kv.unlocks && d.kv.unlocks.m) || {};
    const coins = {}, baseCp = new Set();
    (d.coins || []).forEach(b => {
      const key = keyOf(b); if (key) baseCp.add(key);
      const c = rank.c[b.sym] || [b.sector, 0, 0, null, (b.q || []).reduce((a, x) => a + x, 0), 0, 0, 0, null, ""];
      const mk = key ? cp[key] : null, kr = b.kr || b.sym;
      coins[b.sym] = { b, sym: b.sym, sec: c[0], pos: c[1], lg: c[2], score: n(c[3]), Q: n(c[4]), S: n(c[5]), N: n(c[6]), chal: c[7], crank: c[8], why: c[9],
        warn: c[10] || null, mk, fund: fundInfo(fundM[b.sym] || fundM[kr]), unl: unlM[b.sym] || null,
        flags: flagsOf(mk).concat(c[10] ? ["warn"] : []).concat(fundFlag(fundM[b.sym] || fundM[kr])).concat(unlFlag(unlM[b.sym])), ex: { up: upbit.has(kr), bt: bithumb.has(kr), bf: bnf.has(b.sym) || bnf.has(kr) }, mine: mine.has(kr) || mine.has(b.sym),
        trail: (rank.trail || {})[b.sym] || [], news: (rank.news || {})[b.sym] || [], qd: c[11] || null, fz: feeInfo(feesM[b.sym], mk),
        ds: c[12] != null ? n(c[12]) : null, dp: c[13] || null, sg: c[14] != null ? n(c[14]) : null, ext: c[15] >= 1, act: c[15] === 2 };
    });
    // 섹터 안 수수료 점유율: 30일 기준과 최근 7일 기준을 비교
    const secSum = {};
    Object.values(coins).forEach(c => { if (!c.fz || !(c.fz.f30 > 0)) return; const t = secSum[c.sec] = secSum[c.sec] || [0, 0]; t[0] += c.fz.f30; t[1] += c.fz.f7 || 0; });
    Object.values(coins).forEach(c => { const t = secSum[c.sec]; if (!c.fz || !t || !(c.fz.f30 > 0)) return; c.fz.sh30 = c.fz.f30 / t[0] * 100; c.fz.sh7 = t[1] > 0 ? (c.fz.f7 || 0) / t[1] * 100 : null; });
    const exId = new Map(), exSym = new Map();
    (d.kv.ex || []).forEach(([id, why, sym]) => { exId.set(id, why); if (sym) exSym.set(String(sym).toUpperCase(), why); });
    const exRows = [], pending = [];
    const baseSyms = new Set(); (d.coins || []).forEach(b => { baseSyms.add(String(b.sym).toUpperCase()); if (b.kr) baseSyms.add(String(b.kr).toUpperCase()); });
    Object.entries(cp).forEach(([id, m]) => { const sy = String(m[1] || "").toUpperCase(); if (baseCp.has(id) || baseSyms.has(sy)) return;
      const r = m[0] > 0 ? m[0] : 1e9, why = exId.get(id) || exSym.get(sy);
      if (r <= 150 && why) { exRows.push({ id, sym: m[1], rank: m[0], why, mcap: m[3] }); return; }
      if (why) return;
      // 분류 대기: 시총 150위 안 · 업비트 원화 · 바이낸스 300위 안인데 아직 섹터가 없는 코인
      if (r <= 150 || upbit.has(sy) || (bnf.has(sy) && r <= 300)) pending.push({ id, sym: m[1], rank: m[0], mcap: m[3], up: upbit.has(sy) }); });
    upbit.forEach(sy => { if (!baseSyms.has(sy) && !exSym.has(sy) && !pending.some(p => String(p.sym).toUpperCase() === sy) && !Object.values(cp).some(m => String(m[1] || "").toUpperCase() === sy)) pending.push({ id: "up:" + sy, sym: sy, rank: null, mcap: null, up: true }); });
    exRows.sort((a, b) => a.rank - b.rank); pending.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));
    return { feesM, feesAt: d.kv.fees && d.kv.fees.t, fundAt: d.kv.fund && d.kv.fund.t, unlAt: d.kv.unlocks && d.kv.unlocks.t, rank, sec, coins, exRows, pending, groups: d.kv.groups || [...new Set((d.sectors || []).map(s => s.group))], cpAt: d.kv.cp && d.kv.cp.t };
  }
  function exBadges(c) { return `${c.ex.up ? '<span class="xb up" title="업비트 원화마켓">업</span>' : ""}${c.ex.bt ? '<span class="xb bt" title="빗썸 원화마켓">빗</span>' : ""}${c.ex.bf ? '<span class="xb bf" title="바이낸스 USDⓈ-M 선물">바선</span>' : ""}`; }
  function flagTitle(c, f) {
    if (f === "warn") return `${c.warn} 유의 종목 — 지정이 풀릴 때까지 점수 -8`;
    if ((f === "fhi" || f === "fneg") && c.fund) return `바이낸스 선물 펀딩비 ${c.fund.rate > 0 ? "+" : ""}${c.fund.rate.toFixed(4)}%/회 · 연환산 약 ${c.fund.yr.toFixed(0)}%`;
    if (f === "unl" && c.unl) return `다음 언락 ${kstDate(c.unl[0])} · 유통량의 ${c.unl[1].toFixed(1)}% (${krUsd(c.unl[2])})`;
    return FLAG[f][1]; }
  function flagBadges(c) { return c.flags.map(f => `<span class="fl fl-${f}" title="${esc(flagTitle(c, f))}">${FLAG[f][0]}</span>`).join(""); }
  function moveMark(c) {
    const t = c.trail || [], cur = c.pos, prev = t.length > 1 ? t[t.length - 2] : null;
    if (!cur) return "";
    if (prev === 0 || prev == null) return t.length > 1 ? `<span class="mv new" title="이번에 후보 진입">새</span>` : "";
    if (prev === cur) return "";
    return prev > cur ? `<span class="mv up" title="${prev}위 → ${cur}위">▲${prev - cur}</span>` : `<span class="mv down" title="${prev}위 → ${cur}위">▼${cur - prev}</span>`;
  }
  function coinRow(c, opt = {}) {
    const mk = c.mk || [];
    const name = esc(c.b.ko || c.sym);
    const chal = c.lg === 2 && c.chal ? `<span class="chal" title="1군 꼴찌보다 3점 이상 앞섬 — 2번 연속이면 승격">도전 ${c.chal}/2</span>` : "";
    const newsMark = c.N && Math.abs(c.N) >= 1 ? `<span class="nw ${c.N > 0 ? "rise" : "fall"}" title="뉴스 점수">뉴스 ${c.N > 0 ? "+" : ""}${c.N.toFixed(1)}</span>` : "";
    return `<a class="rk-row${c.lg === 1 ? " major" : ""}" href="/rank/${encodeURIComponent(c.sym)}">
      <span class="rk-no num">${opt.no != null ? opt.no : (c.pos || "-")}</span>
      <span class="rk-nm"><span class="rk-t"><b>${name}</b><span class="sym">${esc(c.sym)}</span>${c.mine ? '<span class="tag mine">내 코인</span>' : ""}${opt.showSec && c.sec ? `<span class="tag">${esc((opt.secName || {})[c.sec] || c.sec)}</span>` : ""}${c.act ? `<span class="tag xr act" title="이 섹터에 시총 150위 안 후보가 3개가 안 돼서, 시세·거래량이 되는 마이너리그 코인으로 1군 빈자리를 임시로 채웠어요">임시 · ${c.crank ? c.crank + "위" : "순위 밖"}</span>` : c.ext ? `<span class="tag xr" title="시총 150위 밖이라 1군 후보는 아니고 마이너리그에만 들어가요">${c.crank ? c.crank + "위" : "순위 밖"}</span>` : ""}</span>
        <span class="rk-s">${exBadges(c)}${flagBadges(c)}${chal}${newsMark}</span></span>
      <span class="rk-sc"><span class="num">${c.score != null ? c.score.toFixed(1) : "-"}</span>${opt.noMove ? "" : moveMark(c)}</span>
      <span class="rk-px"><span class="num">${usd(mk[2])}</span><span class="rk-cg">7일 <b class="num ${ppc(mk[6])}">${pp(mk[6])}</b> · 고점 <b class="num ${ppc(mk[9])}">${pp(mk[9])}</b></span></span></a>`;
  }
  function survival(s) {
    const [g, gl] = GRADE(s.score); const parts = s.parts || [];
    return `<div class="sv" title="${esc(SPARTS.map(([k, mx], i) => `${k} ${parts[i] ?? "-"}/${mx}`).join(" · "))}"><span class="sv-g g-${g}">${g}</span>
      <span class="sv-parts" role="img" aria-label="생존 점수 ${s.score}/100 — ${esc(SPARTS.map(([k, mx], i) => `${k} ${parts[i] ?? "-"}/${mx}`).join(", "))}">${SPARTS.map(([k, mx], i) => `<span class="sv-p"><span class="sv-k"><span class="sv-kn">${SPS[i]}</span><span class="sv-kv num">${parts[i] ?? "-"}<small>/${mx}</small></span></span><i><em style="width:${Math.round((parts[i] || 0) / mx * 100)}%"></em></i></span>`).join("")}</span>
      <span class="sv-n num">${s.score}</span><span class="sv-l">${gl}</span></div>`;
  }
  const median = a => { const v = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y), k = v.length >> 1; return v.length ? (v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2) : null; };
  // 섹터별 숫자 — 1군·2군 코인(시세 있는 것)으로 계산: 시총 합, 시총 가중 7일·30일(섹터 지수), 1군 평균, 고점 대비 중앙값, 연 수수료·보유자 몫, 시총÷수수료 중앙값
  function secStats(M) {
    const out = {};
    Object.values(M.sec).forEach(s => {
      const list = Object.values(M.coins).filter(c => c.sec === s.id && c.lg && c.mk), maj = list.filter(c => c.lg === 1);
      const cap = c => n(c.mk[3]) || 0;
      const w = i => { let a = 0, b = 0; list.forEach(c => { const v = n(c.mk[i]), m = cap(c); if (v != null && m > 0) { a += v * m; b += m; } }); return b > 0 ? a / b : null; };
      const avg = i => { const v = maj.map(c => n(c.mk[i])).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const fee = list.filter(c => c.fz && c.fz.F > 0);
      out[s.id] = { id: s.id, n: list.length, cap: list.reduce((a, c) => a + cap(c), 0), d7: w(6), d30: w(7), m7: avg(6), m30: avg(7),
        ath: median(list.map(c => n(c.mk[9]))), F: fee.reduce((a, c) => a + c.fz.F, 0), H: fee.reduce((a, c) => a + (c.fz.H || 0), 0), nf: fee.length,
        earn: fee.filter(c => c.fz.H > 0).length, pf: fee.length >= 3 ? median(fee.map(c => cap(c) > 0 ? cap(c) / c.fz.F : null)) : null,
        ds: median(list.map(c => c.ds)), up: list.filter(c => c.ex.up).length, list };
    });
    return out;
  }
  // 섹터 흐름 — 요즘 돈이 어느 섹터로 가나 (섹터 지수 = 1군·2군 시총 가중 등락)
  const SF_SORTS = [["d30", "30일"], ["d7", "7일"], ["ath", "고점 대비"], ["F", "연 수수료"], ["score", "생존 점수"]];
  function sectorFlow(M, SS, key) {
    const btc = M.coins.BTC && M.coins.BTC.mk ? { d7: n(M.coins.BTC.mk[6]), d30: n(M.coins.BTC.mk[7]) } : {};
    const rows = Object.values(M.sec).map(s => ({ s, x: SS[s.id] })).filter(r => r.x && r.x.n >= 2);
    const val = r => key === "score" ? r.s.score : key === "F" ? r.x.F : key === "ath" ? (r.x.ath ?? -1e9) : (r.x[key] ?? -1e9);
    rows.sort((a, b) => val(b) - val(a));
    const k2 = key === "d7" ? "d7" : "d30", vmax = Math.max(10, ...rows.map(r => Math.abs(r.x[k2] || 0)));
    const bar = v => { if (v == null) return ""; const w = Math.min(50, Math.abs(v) / vmax * 50); return `<i class="${v >= 0 ? "pos" : "neg"}" style="${v >= 0 ? "left:50%" : `left:${(50 - w).toFixed(1)}%`};width:${w.toFixed(1)}%"></i>`; };
    return `<div class="sf${rows.length > 10 ? " cut" : ""}">${rows.map(({ s, x }) => { const [g] = GRADE(s.score), v = x[k2], vb = btc[k2] != null && v != null ? v - btc[k2] : null;
      return `<button type="button" class="sf-r" data-sec="${esc(s.id)}"><span class="sf-n"><span class="sv-g g-${g}">${g}</span><b>${esc(s.name)}</b></span>
        <span class="sf-bar" aria-hidden="true"><em></em>${bar(v)}</span><span class="sf-v num ${ppc(v)}">${pp(v)}</span>
        <span class="sf-m tiny muted">${k2 === "d30" ? "7일" : "30일"} <b class="num ${ppc(x[k2 === "d30" ? "d7" : "d30"])}">${pp(x[k2 === "d30" ? "d7" : "d30"])}</b> · BTC 대비 <b class="num ${ppc(vb)}">${vb == null ? "-" : (vb > 0 ? "+" : "") + vb.toFixed(1) + "%p"}</b> · 고점 대비 <b class="num">${pp(x.ath)}</b><span class="sf-x">${x.F > 0 ? ` · 연 수수료 <b class="num">${krUsd(x.F)}</b>` : ""} · 시총 ${capKo(x.cap)} · ${x.n}개</span></span></button>`; }).join("")}</div>
      ${rows.length > 10 ? `<button type="button" class="fchip sf-all" aria-expanded="false" data-t="나머지 ${rows.length - 10}개 섹터도 보기">나머지 ${rows.length - 10}개 섹터도 보기</button>` : ""}`;
  }
  function sectorFlowNote(M, SS, secName) {
    const btc = M.coins.BTC && M.coins.BTC.mk ? n(M.coins.BTC.mk[7]) : null;
    const rows = Object.values(SS).filter(x => x.n >= 2 && x.d30 != null).sort((a, b) => b.d30 - a.d30);
    if (rows.length < 4) return "";
    const nm = x => `<b>${esc(secName[x.id] || x.id)}</b>(${pp(x.d30)})`;
    const beat = btc != null ? rows.filter(x => x.d30 > btc).length : null;
    const fee = Object.values(SS).filter(x => x.F > 0).sort((a, b) => b.F - a.F).slice(0, 3);
    return `<ul class="sf-note"><li>최근 30일 가장 강한 섹터는 ${rows.slice(0, 2).map(nm).join("·")}, 가장 약한 섹터는 ${rows.slice(-2).reverse().map(nm).join("·")}예요.</li>
      ${beat != null ? `<li>비트코인(30일 ${pp(btc)})보다 잘한 섹터는 ${rows.length}개 중 <b>${beat}개</b>예요${beat <= rows.length / 4 ? " — 지금은 알트코인보다 비트코인이 강한 장이에요" : beat >= rows.length * 3 / 4 ? " — 알트코인 쪽으로 돈이 도는 장이에요" : ""}.</li>` : ""}
      ${fee.length ? `<li>실제 수수료가 가장 많이 도는 곳은 ${fee.map(x => `<b>${esc(secName[x.id] || x.id)}</b>(연 ${krUsd(x.F)})`).join("·")}이에요 — 가격이 아니라 사용량 기준이에요.</li>` : ""}</ul>`;
  }
  function sectorCard(s, M, F, SS) {
    const arr = Object.values(M.coins).filter(c => c.sec === s.id && c.lg);
    const majors = arr.filter(c => c.lg === 1).sort((a, b) => a.pos - b.pos);
    const minors = arr.filter(c => c.lg === 2).sort((a, b) => a.pos - b.pos).filter(F);
    const others = Object.values(M.coins).filter(c => c.sec === s.id && !c.lg && c.why !== "core");
    const st = (SS || {})[s.id];
    const nums = st && st.n ? [`시총 ${capKo(st.cap)}`, `30일 <b class="num ${ppc(st.d30)}">${pp(st.d30)}</b>`, `고점 대비 <b class="num">${pp(st.ath)}</b>`,
      st.F > 0 ? `연 수수료 <b class="num">${krUsd(st.F)}</b>` : "", st.F > 0 ? `보유자 몫 <b class="num">${pct0(st.H / st.F * 100)}</b>` : ""].filter(Boolean).join(" · ") : "";
    // 섹터 안 돈 버는 코인, 30일 가장 강한·약한 코인
    const earners = st ? st.list.filter(c => c.fz && c.fz.F > 0).sort((a, b) => (b.fz.H - a.fz.H) || (b.fz.F - a.fz.F)).slice(0, 3) : [];
    const mov = st ? st.list.filter(c => n(c.mk[7]) != null).sort((a, b) => n(b.mk[7]) - n(a.mk[7])) : [];
    const cl = c => `<a href="/rank/${encodeURIComponent(c.sym)}">${esc(c.b.ko || c.sym)}</a>`;
    const act = majors.filter(c => c.act).length;
    return `<section class="sec-card" id="s-${esc(s.id)}"><div class="sc-top"><h3>${esc(s.name)}</h3><span class="sc-cy">${esc(s.cycle || "")}</span></div>
      ${survival(s)}<p class="sc-story">${esc(s.story || "")}</p>${nums ? `<div class="sc-num tiny muted">${nums}</div>` : ""}
      <div class="rk-h"><span>1군 · 3대장</span><span>점수</span><span>가격 · 7일 · 고점 대비</span></div>
      <div class="rk-list">${majors.length ? majors.map(c => coinRow(c)).join("") : `<div class="empty small">후보가 아직 없어요 (시세·거래량이 있는 코인이 없어요)</div>`}</div>
      ${act ? `<div class="tiny muted sc-act">이 섹터는 시총 150위 안 후보가 ${3 - act ? `${3 - act}개뿐이라` : "없어서"}, 마이너리그에서 시세·거래량이 되는 코인 ${act}개로 1군 빈자리를 임시로 채웠어요(‘임시’ 표시). 150위 안 코인이 생기면 그 코인이 먼저예요.</div>` : ""}
      ${minors.length ? `<details class="minor"><summary>마이너리그 ${minors.length}개${minors.some(c => c.ext) ? ` <span class="tiny muted">(150위 밖 ${minors.filter(c => c.ext).length}개 포함)</span>` : ""}</summary><div class="rk-list">${minors.map(c => coinRow(c)).join("")}</div></details>` : ""}
      <details class="more srep"><summary>섹터 리포트 — 돈의 흐름 · 고르는 법 · 좋아질 때와 나빠질 때</summary><div class="more-body">
        ${s.flow ? `<div><div class="mini-h">돈의 흐름</div>${esc(s.flow)}${st && st.F > 0 ? `<div class="small sr-fact">실제 숫자: 이 섹터 코인 ${st.nf}개의 연 수수료 <b>${krUsd(st.F)}</b> 중 토큰 보유자 몫은 ${st.H > 0 ? `<b>${krUsd(st.H)}</b>(${pct0(st.H / st.F * 100)})` : "<b>없어요</b>"}${st.pf ? ` · 시총은 연 수수료의 중앙값 ${xMult(st.pf)}` : ""}.</div>` : ""}</div>` : ""}
        ${earners.length ? `<div><div class="mini-h">섹터 안에서 돈 버는 코인</div>${earners.map(c => `${cl(c)} <span class="tiny muted">연 수수료 ${krUsd(c.fz.F)}${c.fz.H > 0 ? ` · 보유자 몫 ${krUsd(c.fz.H)}` : " · 보유자 몫 없음"}</span>`).join("<br>")} <a class="tiny" href="/money">돈 버는 코인 →</a></div>` : ""}
        ${Array.isArray(s.kpi) && s.kpi.length ? `<div><div class="mini-h">봐야 할 지표</div><ul>${s.kpi.map(k => `<li>${esc(k)}</li>`).join("")}</ul></div>` : ""}
        ${s.pick ? `<div><div class="mini-h">섹터 안에서 고르는 법</div>${esc(s.pick)}</div>` : ""}
        ${s.bull || s.bear ? `<div class="scen"><div class="bull"><b>좋아지는 그림</b>${esc(s.bull || "")}</div><div class="bear"><b>나빠지는 그림</b>${esc(s.bear || "")}</div></div>` : ""}
        <div><div class="mini-h">웹2로 치면</div>${esc(s.web2 || "")}</div>
        <div><div class="mini-h">끝까지 남을까</div>${esc(s.why || "")}</div>
        <div><div class="mini-h">급등할 수 있는 때</div>${esc(s.trigger || "")}</div>
        <div><div class="mini-h">위험</div>${esc(s.risk || "")}</div>
        ${mov.length >= 3 ? `<div><div class="mini-h">최근 30일 섹터 안에서</div>가장 강함 ${mov.slice(0, 2).map(c => `${cl(c)} <span class="num ${ppc(c.mk[7])}">${pp(c.mk[7])}</span>`).join(" · ")} / 가장 약함 ${mov.slice(-2).reverse().map(c => `${cl(c)} <span class="num ${ppc(c.mk[7])}">${pp(c.mk[7])}</span>`).join(" · ")}</div>` : ""}
        <div><div class="mini-h">생존 점수 구성</div>${SPARTS.map(([k, mx], i) => `${k} ${(s.parts || [])[i] ?? "-"}/${mx}`).join(" · ")}</div>
        ${others.length ? `<div><div class="mini-h">지금 후보가 아닌 코인</div>${others.map(c => `<a href="/rank/${encodeURIComponent(c.sym)}">${esc(c.b.ko || c.sym)}</a> <span class="tiny muted">${esc(WHY[c.why] || c.why || "")}</span>`).join(" · ")}</div>` : ""}
      </div></details></section>`;
  }
  // ── 성적표: 매일 9시 이후 저장한 1군·2군 가격을 이어 붙여 '매일 동일 비중으로 다시 맞춘' 수익률을 계산 ──
  function perfCalc(snaps, M) {
    if (!snaps || !snaps.length) return null;
    const nowPx = sym => { const c = M.coins[sym]; return c && c.mk ? n(c.mk[2]) : null; };
    const pts = snaps.map(x => ({ t: x.s.t, day: x.day, c: x.s.c || {}, btc: n(x.s.btc) }));
    // 마지막 기록 뒤에 받은 시세가 있으면 '지금' 점을 하나 더 붙인다
    const nowT = M.cpAt || Date.now();
    if (nowT > pts[pts.length - 1].t + 60e3) pts.push({ t: nowT, now: true, c: null, btc: nowPx("BTC") });
    // 기준선: 섹터마다 시총 상위 3개(c[4] 시총 순위) · 데이터 점수 상위 3개(c[6])
    const top3 = (c, key, asc) => { const by = {}; Object.entries(c).forEach(([sym, x]) => { const v = n(x[key]); if (v == null) return; (by[x[1]] = by[x[1]] || []).push([sym, v]); });
      const out = new Set(); Object.values(by).forEach(arr => arr.sort((p, q) => asc ? p[1] - q[1] : q[1] - p[1]).slice(0, 3).forEach(([sym]) => out.add(sym))); return out; };
    const G = [["g1", (c) => c[0] === 1], ["g2", (c) => c[0] === 2], ["ga", () => true], ["cap3", (c, sym, a) => a.cap3.has(sym)], ["d3", (c, sym, a) => a.d3.has(sym)]];
    pts.forEach(p => { if (p.c) { p.cap3 = top3(p.c, 4, true); p.d3 = top3(p.c, 6, false); } });
    const V = { g1: 1, g2: 1, ga: 1, cap3: 1, d3: 1, btc: 1 }, series = [{ t: pts[0].t, ...V }], has = { cap3: false, d3: false };
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const pxB = sym => b.now ? nowPx(sym) : (b.c[sym] ? n(b.c[sym][3]) : null);
      for (const [g, pick] of G) {
        const rs = Object.entries(a.c).filter(([sym, c]) => pick(c, sym, a)).map(([sym, c]) => { const p1 = pxB(sym), p0 = n(c[3]); return p1 && p0 ? p1 / p0 - 1 : null; }).filter(x => x != null && isFinite(x));
        if (rs.length) { V[g] *= 1 + rs.reduce((s, x) => s + x, 0) / rs.length; if (g in has) has[g] = true; }
      }
      if (a.btc && b.btc) V.btc *= b.btc / a.btc;
      series.push({ t: b.t, ...V });
    }
    // 1군에 새로 들어온 코인: 들어온 날 가격부터 지금까지 (비트코인과 비교)
    const promos = [];
    for (let i = 1; i < pts.length - 1; i++) for (const [sym, c] of Object.entries(pts[i].c)) {
      if (c[0] !== 1 || (pts[i - 1].c[sym] && pts[i - 1].c[sym][0] === 1)) continue;
      const p1 = nowPx(sym), p0 = n(c[3]); const b0 = pts[i].btc, b1 = nowPx("BTC");
      if (p1 && p0) promos.push({ sym, sec: c[1], t: pts[i].t, r: (p1 / p0 - 1) * 100, vb: b0 && b1 ? (p1 / p0 - b1 / b0) * 100 : null });
    }
    promos.sort((x, y) => y.t - x.t);
    return { series, start: pts[0].t, days: snaps.length, promos, has };
  }
  function multiLine(series, keys, label) {
    if (series.length < 2) return "";
    const W = 420, H = 210, L = 52, R = 10, T = 14, B = 26;
    const xs = series.map(p => p.t); const all = series.flatMap(p => keys.map(([k]) => (p[k] - 1) * 100));
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all); const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const X = v => L + (v - x0) / ((x1 - x0) || 1) * (W - L - R), Y = v => T + (hi - v) / ((hi - lo) || 1) * (H - T - B);
    let grid = ""; for (let i = 0; i < 4; i++) { const v = lo + (hi - lo) * i / 3, y = Y(v); grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axis" x="${L - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end">${(v > 0 ? "+" : "") + v.toFixed(Math.abs(hi - lo) < 6 ? 1 : 0)}%</text>`; }
    grid += `<line class="zero" x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`;
    const xl = `<text class="axis" x="${L}" y="${H - 6}" text-anchor="start">${kstDate(x0)}</text><text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${kstDate(x1)}</text>`;
    const lines = keys.map(([k, , cls]) => `<path class="pl ${cls}" d="${series.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y((p[k] - 1) * 100).toFixed(1)}`).join(" ")}"/>`).join("");
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${xl}${lines}</svg></div>`;
  }
  function perfSection(P, M, secName) {
    const head = `<div class="sec-head"><h2>성적표</h2><span class="sub">${P ? `${kstDate(P.start)}부터 · 매일 9시 기록` : "매일 9시 이후 첫 기록부터 쌓여요"}</span></div>`;
    if (!P) return `<section class="section">${head}<div class="empty small">아직 기록이 없어요. 오늘 9시 이후 첫 저장부터 1군·2군·전체 후보의 수익률을 비트코인과 비교해 보여드려요.</div></section>`;
    const last = P.series[P.series.length - 1];
    const K = [["g1", "1군(3대장) 동일 비중", "pl-g1"], ["cap3", "섹터 시총 상위 3", "pl-cap"], ["d3", "데이터 점수 상위 3", "pl-d3"], ["g2", "2군(마이너리그)", "pl-g2"], ["ga", "전체 후보", "pl-ga"], ["btc", "비트코인", "pl-btc"]]
      .filter(([k]) => !(k in P.has) || P.has[k]);
    const r = k => (last[k] - 1) * 100;
    const sg = x => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%p`;
    const verdict = P.series.length < 3 ? "기록이 쌓이는 중이에요. 2~4주는 지나야 의미 있는 차이가 보여요."
      : `1군이 섹터 시총 상위 3보다 ${sg(r("g1") - r("cap3"))}, 전체 후보보다 ${sg(r("g1") - r("ga"))}, 비트코인보다 ${sg(r("g1") - r("btc"))}${P.has.d3 ? ` · 데이터 점수 상위 3은 시총 상위 3보다 ${sg(r("d3") - r("cap3"))}` : ""}.`;
    return `<section class="section">${head}<div class="panel pf-card">
      <div class="pf-verdict">${esc(verdict)}</div>
      <div class="pf-grid">${K.map(([k, l, cls]) => `<div class="pf-t"><span class="pf-k"><i class="sw ${cls}"></i>${l}</span><b class="num ${ppc(r(k))}">${pp(r(k))}</b></div>`).join("")}</div>
      ${multiLine(P.series, K, "1군·2군·전체 후보·비트코인 누적 수익률")}
      ${P.promos.length ? `<div class="mini-h">1군에 새로 들어온 뒤 성적</div><div class="pf-pr">${P.promos.slice(0, 10).map(x => `<div><a href="/rank/${encodeURIComponent(x.sym)}">${esc((M.coins[x.sym] && M.coins[x.sym].b.ko) || x.sym)}</a> <span class="tiny muted">${esc(secName[x.sec] || x.sec)} · ${kstDate(x.t)} 승격</span> <b class="num ${ppc(x.r)}">${pp(x.r)}</b>${x.vb != null ? ` <span class="tiny muted">BTC 대비 ${pp(x.vb)}p</span>` : ""}</div>`).join("")}</div>` : ""}
      <p class="legend">매일 그날의 바구니를 같은 비중으로 산 것으로 보고 다음 날까지의 수익률을 이어 붙였어요(수수료·펀딩비 제외). 전체 후보 = 1군+2군. <b>섹터 시총 상위 3</b>은 점수 없이 각 섹터에서 시총이 가장 큰 3개만 고른 단순 기준선이에요 — 1군이 이걸 꾸준히 앞서야 점수가 값을 하는 거예요. <b>데이터 점수 상위 3</b>은 사람 판단 없이 숫자로만 고른 바구니로, 종합 점수에 넣을지 판단하려고 따로 재고 있어요.</p></div></section>`;
  }
  const SORTS = [["score", "종합 점수"], ["data", "데이터 점수(검증 중)"], ["deep", "고점 대비 많이 빠진 순"], ["hot30", "30일 많이 오른 순"], ["hot7", "7일 많이 오른 순"], ["news", "뉴스 점수"], ["cap", "시가총액"], ["hold", "보유자 수익 많은 순"], ["cheap", "수익 대비 싼 순(시총÷연 보유자 수익)"], ["ftrend", "수수료 최근 1주 추세"], ["fund", "펀딩비 높은 순"], ["unl", "30일 안 언락 큰 순"]];
  const FILTERS = [["major", "1군만"], ["nohot", "과열 빼기"], ["nodeep", "과대낙폭 빼기"], ["up", "업비트 원화만"], ["bf", "바이낸스 선물만"], ["earn", "보유자 수익 있는 코인만"], ["nounl", "큰 언락 빼기"]];
  function loadPref() { try { return Object.assign({ view: "sec", sort: "score", f: [] }, JSON.parse(localStorage.getItem("secPref") || "{}")); } catch (e) { return { view: "sec", sort: "score", f: [] }; } }
  function savePref(p) { try { localStorage.setItem("secPref", JSON.stringify(p)); } catch (e) {} }
  async function sectorsPage() {
    nav("sectors"); setTitle("섹터 순위판");
    const [d, perf] = await Promise.all([get("/api/sectors"), get("/api/perf").catch(() => [])]);
    const M = sectorModel(d), R = M.rank, SS = secStats(M);
    const pref = loadPref(); if (!SF_SORTS.some(x => x[0] === pref.sf)) pref.sf = "d30";
    const secName = Object.fromEntries(Object.values(M.sec).map(s => [s.id, s.name]));
    const core = Object.values(M.coins).filter(c => c.why === "core" || c.b.core).sort((a, b) => (a.crank || 99) - (b.crank || 99));
    const moves = (R.moves || []).filter(m => ["promo", "demo", "in", "out", "warn", "unwarn"].includes(m[0]));
    const ups = (R.moves || []).filter(m => m[0] === "up" || m[0] === "down");
    const nm = s => esc((M.coins[s] && M.coins[s].b.ko) || s);
    const moveHtml = moves.length ? moves.slice(0, 12).map(m => `<div class="mvf mvf-${m[0]}"><b>${esc(MOVE[m[0]])}</b><a href="/rank/${encodeURIComponent(m[1])}">${nm(m[1])}</a><span class="muted">${esc(secName[m[2]] || m[2])}${m[3] ? ` ${m[3]}위` : ""}${m[4] ? ` → ${m[4]}위` : ""}${m[5] ? " · " + esc(VIA[m[5]] || WHY[m[5]] || m[5]) : ""}</span></div>`).join("")
      : `<div class="small muted">이번 계산에서는 1군·2군 사이 이동이 없었어요${ups.length ? ` · 같은 리그 안 순위 변동 ${ups.length}건` : ""}.</div>`;
    const intro = `<details class="more rules"><summary>순위는 이렇게 정해요</summary><div class="more-body">
      <div><b>점수</b> = 코인 품질×0.6 + 규모×0.25 + 섹터 생존 점수×0.15 + 뉴스 점수. 품질은 ${QN.join("·")} 5항목(각 20점), 규모는 시총 1억 달러=0 ~ 1,000억 달러=100, 뉴스 점수는 -20~+20이에요.</div>
      <div><b>실제 수익</b> — DefiLlama에서 수수료·매출·보유자 수익을 받는 코인은 '실사용·수익'(연 수수료 100만 달러=4 ~ 100억 달러=20)과 '토큰 가치 포착'(보유자 몫÷시총 1%=8 ~ 30%=20)을 AI 판단 점수와 반반 섞어요. PoW·프라이버시 코인은 화폐 성격이라 보여주기만 해요. <b>유의 종목</b>은 지정이 풀릴 때까지 뉴스 점수에서 8점을 빼요.</div>
      <div><b>데이터 점수</b>(0~100, 검증 중 · 종합 점수에는 아직 안 들어감) = 성장(최근 30일 수수료 ÷ 1년) · 실질 보유자 수익(보유자 몫÷시총 − 실제 공급 증가율) · 밸류(시총÷연 수수료, 섹터 중앙값과 비교) · 점유율 추세(섹터 수수료 점유율 30일 − 1년) · 공급 건전성(유통 비율, 30일 안 언락) 5항목 각 20점이에요. 3항목 이상 있는 코인만 점수가 나와요. 실제 공급 증가율은 매일 기록한 유통량이 28일 넘게 쌓이면 자동으로 들어가요.</div>
      <div><b>심층 점검</b>은 AI가 코인마다 10가지 체크리스트(누가 돈을 내나 · 토큰에 돌아오나 · 공급 · 사용자 · 경쟁 · 팀·개발 · 리스크 · 밸류 · 일정 · 반대 논리)를 근거 링크와 함께 채우고, 기준표에 맞춰 품질 점수를 고쳐요. 하루 3번 몇 개씩 차례로 돌아요.</div>
      <div><b>뉴스</b>는 하루 3번 AI가 코인별로 -10~+10을 매기고, 시간이 지나면 줄어들어요(단기 3일·보통 10일·구조적 변화 45일마다 절반). 큰 코인은 웬만한 뉴스로는 순위가 잘 안 바뀌어요.</div>
      <div><b>1군(3대장)</b>은 2군 1등이 1군 꼴찌보다 3점 이상 앞선 상태가 2번 연속일 때만 바뀌어요(뉴스 +10 이상이면 바로). <b>마이너리그(2군)</b>는 매번 점수순으로 바뀌어요.</div>
      <div><b>1군 후보</b>는 시총 150위 안, 24시간 거래대금이 시총의 0.1% 이상인 코인이에요. <b>마이너리그</b>에는 여기에 더해 업비트 원화마켓 코인 전부와 바이낸스(선물 포함) 상장 코인 중 시총 300위 안 코인이 들어가요 — 이 코인들은 순위 옆에 시총 순위가 붙고 1군 후보는 아니에요. 다만 150위 안 후보가 3개가 안 되는 섹터(NFT·소셜 등)는 이 중 시세·거래량이 되는 코인으로 1군 빈자리를 <b>임시</b>로 채워요. '150위까지만'을 체크하면 예전처럼 150위 안 코인만 보여요. 기준 코인(비트코인·이더리움·솔라나·BNB·XRP)과 스테이블코인·래핑·스테이킹 파생·금 토큰은 빼요.</div>
      <div><b>과열</b> = 30일 +40% 이상 또는 7일 +25% 이상. <b>과대낙폭</b> = 고점 대비 -90% 이하 또는 30일 -30% 이하. 둘 다 거르거나 그 순서로 볼 수 있어요.</div>
      <div><b>섹터 생존 점수</b>(0~100) = ${SPARTS.map(([k, mx]) => `${k} ${mx}`).join(" · ")}. A 80+ 핵심 · B 65+ 성장 · C 50+ 순환 · D 50 미만 회피.</div></div></details>`;
    main().innerHTML = `<header class="head"><div class="eyebrow">섹터 순위판</div><h1>섹터별 3대장과 마이너리그</h1>
      <div class="stamp">${R.ts ? `순위 계산 ${kst(R.ts)}` : "첫 순위 계산 전이에요"}${M.cpAt ? ` · 시세 ${kst(M.cpAt)}` : ""} · 뉴스 반영 하루 3번</div>${intro}</header>
      ${core.length ? `<section class="section"><div class="sec-head"><h2>기준 코인</h2><span class="sub">순위에서 빼고 시장 기준으로만 봐요</span></div><div class="core-strip">${core.map(c => { const mk = c.mk || []; return `<a class="core-c" href="/rank/${encodeURIComponent(c.sym)}"><b>${esc(c.b.ko || c.sym)}</b><span class="num">${usd(mk[2])}</span><span class="num ${ppc(mk[6])}">7일 ${pp(mk[6])}</span><span class="num tiny muted">고점 ${pp(mk[9])}</span></a>`; }).join("")}</div></section>` : ""}
      <section class="section"><div class="sec-head"><h2>이번 순위 변동</h2><span class="sub">${R.ts ? kst(R.ts) : ""}</span></div><div class="panel mvf-list">${moveHtml}</div></section>
      ${perfSection(perfCalc(perf, M), M, secName)}
      <section class="section" id="sf-s"><div class="sec-head"><h2>섹터 흐름 — 요즘 돈이 어디로 가나</h2><span class="sub">시총 가중 섹터 지수 · 누르면 이동</span></div>
        <div class="panel">${sectorFlowNote(M, SS, secName)}<div class="fchips" id="sf-sort" role="group" aria-label="섹터 흐름 정렬">${SF_SORTS.map(([k, l]) => `<button type="button" class="fchip" data-sf="${k}">${l}</button>`).join("")}</div>
        <div id="sf-body"></div>
        <p class="legend">막대는 가운데(0%)에서 오른쪽이 오름, 왼쪽이 내림이에요. 섹터 지수는 큰 코인 영향을 많이 받아서, 1군 평균과 다를 수 있어요. 수익률은 가격만 본 것이고(스테이킹 보상 제외), 투자 권유가 아니에요.</p></div></section>
      ${moneyTeaser(M, secName)}
      <section class="section"><div class="lvl" id="sec-view" role="group" aria-label="보기"><button type="button" data-v="sec">섹터별</button><button type="button" data-v="all">전체 순위</button></div>
        <div class="ctl" id="sec-ctl"><label class="chk"><input type="checkbox" id="t150"> 150위까지만</label><label class="sel">정렬 <select id="sec-sort">${SORTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        <div class="fchips">${FILTERS.map(([k, l]) => `<button type="button" class="fchip" data-f="${k}" aria-pressed="false">${l}</button>`).join("")}</div></div>
        <div id="sec-body"></div></section>
      ${M.pending.length ? `<section class="section"><div class="sec-head"><h2>분류 대기 ${M.pending.length}개</h2><span class="sub">시총 150위 안 · 업비트 원화 · 바이낸스 300위 안에 새로 들어와 아직 섹터를 정하지 않은 코인 (하루 3번 AI가 분류)</span></div><div class="panel small">${M.pending.map(p => `<span class="pend">${esc(p.sym)} <span class="tiny muted">${p.rank ? p.rank + "위" : "순위 없음"}${p.up ? " · 업" : ""}</span></span>`).join(" ")}</div></section>` : ""}
      <details class="panel exl"><summary>시총 150위 안에서 뺀 토큰 ${M.exRows.length}개 — 스테이블코인·래핑·스테이킹 파생·금 토큰 등</summary><div class="exl-body">${M.exRows.map(x => `<div><span class="num tiny muted">${x.rank}위</span> <b>${esc(x.sym)}</b> <span class="muted small">${esc(x.why)}</span></div>`).join("") || '<div class="small muted">시세를 받은 뒤 표시돼요.</div>'}</div></details>
      <p class="legend">점수와 섹터 생존 점수는 공개 데이터를 바탕으로 한 AI 판단 점수이며 확률 예측이나 투자 권유가 아니에요. 시세: 코인마켓캡·코인게코·코인로어 중 받아진 곳(달러) · 거래소 표시: 업비트·빗썸 원화마켓, 바이낸스 USDⓈ-M 선물 목록.</p>`;
    const F = c => {
      const f = pref.f || [];
      if (pref.t150 && !(c.crank > 0 && c.crank <= 150)) return false;
      if (f.includes("nohot") && c.flags.includes("hot")) return false;
      if (f.includes("nodeep") && c.flags.includes("deep")) return false;
      if (f.includes("up") && !c.ex.up) return false;
      if (f.includes("bf") && !c.ex.bf) return false;
      if (f.includes("earn") && !(c.fz && c.fz.H > 0)) return false;
      if (f.includes("nounl") && c.flags.includes("unl")) return false;
      return true; };
    const draw = () => {
      document.querySelectorAll("#sec-view button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === pref.view)));
      document.querySelectorAll("#sec-ctl .fchip").forEach(b => b.setAttribute("aria-pressed", String((pref.f || []).includes(b.dataset.f))));
      $("sec-sort").value = pref.sort; $("sec-sort").closest(".sel").hidden = pref.view !== "all"; $("t150").checked = !!pref.t150;
      const box = $("sec-body");
      if (pref.view === "sec") {
        box.innerHTML = M.groups.map(g => { const ss = Object.values(M.sec).filter(s => s.group === g).sort((a, b) => b.score - a.score || a.ord - b.ord);
          return ss.length ? `<div class="grp"><h2 class="grp-h">${esc(g)}</h2>${ss.map(s => sectorCard(s, M, F, SS)).join("")}</div>` : ""; }).join("");
      } else {
        const mk = (c, i) => c.mk ? n(c.mk[i]) : null;
        const key = { score: c => c.score ?? -1e9, deep: c => -(mk(c, 9) ?? 0), hot30: c => mk(c, 7) ?? -1e9, hot7: c => mk(c, 6) ?? -1e9, news: c => c.N ?? 0, cap: c => mk(c, 3) ?? 0,
          hold: c => c.fz ? c.fz.H : -1, cheap: c => c.fz && c.fz.mult ? -c.fz.mult : -1e15, ftrend: c => c.fz && c.fz.trend != null ? c.fz.trend : -1e9,
          fund: c => c.fund ? c.fund.yr : -1e9, unl: c => unlSoon(c.unl) ?? -1, data: c => c.ds ?? -1 }[pref.sort] || (c => c.score);
        const list = Object.values(M.coins).filter(c => c.lg && ((pref.f || []).includes("major") ? c.lg === 1 : true)).filter(F).sort((a, b) => key(b) - key(a));
        box.innerHTML = `<div class="panel"><div class="rk-h"><span>${esc(SORTS.find(s => s[0] === pref.sort)[1])} · ${list.length}개</span><span>점수</span><span>가격 · 7일 · 고점 대비</span></div><div class="rk-list">${list.map((c, i) => coinRow(c, { no: i + 1, showSec: true, secName, noMove: true })).join("") || '<div class="empty small">조건에 맞는 코인이 없어요.</div>'}</div>
          <p class="legend">1군은 진한 표시예요. 30일 변동은 시세 소스에 없으면 업비트 주봉 4주 변동으로 채우고, 둘 다 없으면 비워요.</p></div>`;
      }
      savePref(pref);
    };
    const drawSf = () => { document.querySelectorAll("#sf-sort .fchip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sf === pref.sf))); $("sf-body").innerHTML = sectorFlow(M, SS, pref.sf); savePref(pref); };
    document.querySelectorAll("#sf-sort .fchip").forEach(b => b.addEventListener("click", () => { pref.sf = b.dataset.sf; drawSf(); }));
    $("sf-body").addEventListener("click", e => {
      const all = e.target.closest(".sf-all"); if (all) { const box = $("sf-body").querySelector(".sf"), open = box.classList.toggle("cut") === false; all.setAttribute("aria-expanded", String(open)); all.textContent = open ? "접기" : all.dataset.t; return; }
      const b = e.target.closest("[data-sec]"); if (!b) return;
      if (pref.view !== "sec") { pref.view = "sec"; draw(); }
      const el = $("s-" + b.dataset.sec); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); try { history.replaceState(null, "", "#s-" + b.dataset.sec); } catch (x) {} } });
    drawSf();
    document.querySelectorAll("#sec-view button").forEach(b => b.addEventListener("click", () => { pref.view = b.dataset.v; draw(); }));
    document.querySelectorAll("#sec-ctl .fchip").forEach(b => b.addEventListener("click", () => { const f = new Set(pref.f || []); f.has(b.dataset.f) ? f.delete(b.dataset.f) : f.add(b.dataset.f); pref.f = [...f]; draw(); }));
    $("sec-sort").addEventListener("change", e => { pref.sort = e.target.value; draw(); });
    $("t150").addEventListener("change", e => { pref.t150 = e.target.checked; draw(); });
    draw(); openHash();
  }
  const DN = ["성장", "실질 수익률", "밸류", "점유율 추세", "공급 건전성"];
  const DH = ["최근 30일 수수료(연환산) ÷ 지난 1년 수수료 — 같으면 10, 2배면 20", "보유자 몫 ÷ 시총 − 실제 공급 증가율 — 0%면 8, +5%면 20", "시총 ÷ 연 수수료가 섹터 중앙값보다 4배 싸면 20, 4배 비싸면 0", "섹터 수수료 점유율이 1년 평균보다 늘면 %p당 +1", "유통 비율×20, 30일 안 언락 유통량 1%당 −2"];
  function dataPanel(c) {
    if (!c.dp) return "";
    return `<section class="panel section"><div class="sec-head"><h2>데이터 점수 <span class="tiny muted">검증 중</span></h2><span class="sub">${c.ds != null ? `<b class="num" style="font-size:18px;color:var(--ink)">${c.ds.toFixed(0)}</b>/100` : "항목이 3개 미만이라 점수 없음"}</span></div>
      ${DN.map((k, i) => { const v = c.dp[i]; return `<div class="bar-row" title="${esc(DH[i])}"><span class="small">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${v == null ? 0 : v / 20 * 100}%"></div></div><span class="num small">${v == null ? "-" : v.toFixed(0) + "/20"}</span></div>`; }).join("")}
      <p class="legend">사람 판단 없이 숫자로만 매긴 점수예요(DefiLlama 수수료·매출, 코인마켓캡 유통량·언락). 아직 종합 점수에는 넣지 않고, 성적표에서 '데이터 점수 상위 3' 바구니가 시총 상위 3보다 나은지 4주 이상 지켜본 뒤 반영 여부를 정해요.${c.sg != null ? ` 실제 공급 증가율 연 ${c.sg > 0 ? "+" : ""}${c.sg.toFixed(1)}%.` : " 실제 공급 증가율은 기록이 28일 쌓이면 들어가요."}</p></section>`;
  }
  const DDK = { pay: "누가 돈을 내나", accrue: "토큰에 돌아오나", supply: "공급·희석", users: "사용자·활동", moat: "경쟁", team: "팀·개발", risk: "리스크", value: "밸류에이션", catalyst: "일정·촉매", against: "반대 논리" };
  function deepPanel(d) {
    if (!d || !Array.isArray(d.items)) return `<section class="panel section"><div class="sec-head"><h2>심층 점검</h2><span class="sub">아직 전</span></div><div class="small muted">AI가 하루 3번 몇 개씩 차례로 10가지 체크리스트를 근거 링크와 함께 채워요. 1군·내 코인부터 해요.</div></section>`;
    const dots = v => { v = Math.max(0, Math.min(5, Math.round(n(v) || 0))); return `<span class="dd-dots" aria-label="${v}/5">${"●".repeat(v)}<i>${"●".repeat(5 - v)}</i></span>`; };
    const qn = d.q && Array.isArray(d.q.from) && Array.isArray(d.q.to) ? QN.map((k, i) => d.q.from[i] !== d.q.to[i] ? `${k} ${d.q.from[i]}→${d.q.to[i]}` : "").filter(Boolean) : [];
    return `<section class="panel section dd"><div class="sec-head"><h2>심층 점검</h2><span class="sub">${d.at ? kst(d.at) : ""} · AI 조사</span></div>
      ${d.v ? `<p class="dd-v">${esc(d.v)}</p>` : ""}
      <div class="dd-list">${d.items.map(x => { const srcs = (x.src || []).map(sx => { const u = safeUrl(sx.u); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(sx.t || "출처")}</a>` : ""; }).filter(Boolean);
        return `<div class="dd-row"><div class="dd-h"><b>${esc(DDK[x.k] || x.t || x.k)}</b>${dots(x.s)}</div><div class="small">${esc(x.n || "")}</div>${srcs.length ? `<div class="tiny muted dd-src">${srcs.join(" · ")}</div>` : ""}</div>`; }).join("")}</div>
      ${d.kill ? `<div class="dd-kill"><b>틀리면 버릴 조건</b> ${esc(d.kill)}</div>` : ""}
      ${qn.length ? `<div class="tiny muted">이 점검으로 품질 점수 변경: ${esc(qn.join(" · "))}${d.q.why ? " — " + esc(d.q.why) : ""}</div>` : ""}
      <p class="legend">점은 5점 만점(리스크·반대 논리는 점이 많을수록 안전). AI가 공개 자료로 조사한 내용이라 틀릴 수 있어요 — 출처를 직접 확인해 주세요.</p></section>`;
  }
  // ── 수수료 12개월 흐름 (kv feehist → /api/feehist) ──
  // h = [첫 달 YYYYMM, 수수료[13], 매출[13], 보유자 몫[13], 받은 시각] — 값은 달마다 하루 평균($), 마지막 칸은 이번 달(진행 중)
  let FHP = null;
  const feeHist = () => FHP || (FHP = get("/api/feehist").then(d => (d && d.m) || {}).catch(() => ({})));
  const monthOf = (first, i) => { const m0 = (Math.floor(first / 100) * 12) + (first % 100 - 1) + i; return { y: Math.floor(m0 / 12), m: m0 % 12 + 1 }; };
  const avgOf = a => { const v = a.filter(x => x != null && isFinite(x)); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  function histInfo(h) {
    if (!h || !Array.isArray(h[1])) return null;
    const F = h[1], R = h[2] || [], H = h[3] || [], full = F.slice(0, 12), have = full.filter(v => v != null && v > 0);
    const o = { h, F, R, H, first: h[0], at: h[4], months: have.length };
    if (have.length < 4) return o;
    const mean = avgOf(have), sd = Math.sqrt(have.reduce((a, b) => a + (b - mean) ** 2, 0) / have.length);
    o.cv = sd / mean; o.steady = o.cv < 0.3 ? "꾸준함" : o.cv < 0.7 ? "보통" : "들쭉날쭉";
    const a3 = avgOf(full.slice(9, 12)), a9 = avgOf(full.slice(0, 9));
    o.tr = a3 && a9 ? (a3 / a9 - 1) * 100 : null;
    o.hm = H.slice(0, 12).filter(v => v > 0).length;
    const i = H.findIndex(v => v > 0); if (i > 0 && H.slice(i, 12).every(v => v > 0)) o.hStart = monthOf(h[0], i);
    return o;
  }
  // 작은 선(수수료 하루 평균, 13달)
  function spark(arr) {
    const pts = (arr || []).slice(0, 13).map((x, i) => [i, x]).filter(p => p[1] != null && isFinite(p[1]));
    if (pts.length < 4) return "";
    const mx = Math.max(...pts.map(p => p[1]), 1e-9), W = 72, H = 22, X = i => 1 + i / 12 * (W - 2), Y = v => H - 2 - Math.max(0, v) / mx * (H - 4);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${pts.map((p, k) => (k ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join("")}"/><circle cx="${X(pts[pts.length - 1][0]).toFixed(1)}" cy="${Y(pts[pts.length - 1][1]).toFixed(1)}" r="2"/></svg>`;
  }
  // 13달 막대 — 한 칸 안에 수수료(연함) ⊃ 매출(중간) ⊃ 보유자 몫(진함). 높이는 한 달 환산(하루 평균 × 30)
  function histChart(h, label) {
    const F = h[1] || [], R = h[2] || [], Hh = h[3] || [];
    const vals = [...F, ...R, ...Hh].filter(v => v != null && v > 0); if (vals.length < 3) return "";
    const W = Math.round(Math.min(560, Math.max(320, (window.innerWidth || 560) - 64))), Ht = 190, L = 50, Rr = 6, T = 12, B = 24;
    const top = Math.max(...vals) * 30, step = Math.pow(10, Math.floor(Math.log10(top))), nice = [1, 2, 2.5, 5, 10].map(k => k * step).find(v => v * 4 >= top) || step * 10;
    const Y = v => T + (1 - v / (nice * 4)) * (Ht - T - B), bw = (W - L - Rr) / 13;
    let g = ""; for (let k = 0; k <= 4; k++) { const v = nice * k, y = Y(v); g += `<line class="${k ? "grid" : "zero"}" x1="${L}" x2="${W - Rr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axis" x="${L - 5}" y="${(y + 4).toFixed(1)}" text-anchor="end">${krShort(v)}</text>`; }
    let cols = "";
    for (let i = 0; i < 13; i++) {
      const x = L + i * bw, mo = monthOf(h[0], i), cur = i === 12;
      const ser = [[F[i], "f", "수수료"], [R[i], "r", "매출"], [Hh[i], "h", "보유자 몫"]].filter(p => p[0] != null && p[0] > 0).sort((a, b) => b[0] - a[0]);
      const tip = `${mo.y}년 ${mo.m}월${cur ? " (진행 중)" : ""}|수수료 한 달 ${krUsd((F[i] || 0) * 30)}|매출 ${krUsd((R[i] || 0) * 30)}|보유자 몫 ${krUsd((Hh[i] || 0) * 30)}`;
      cols += `<g class="hc${cur ? " cur" : ""}" tabindex="0" data-tip="${esc(tip)}"><rect class="hit" x="${x.toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${Ht - T - B}"/>${ser.map(([v, k]) => `<rect class="mf-${k}" x="${(x + bw * 0.14).toFixed(1)}" y="${Y(v * 30).toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${Math.max(0.8, Y(0) - Y(v * 30)).toFixed(1)}" rx="1.5"/>`).join("")}</g>`;
      if (i % (W < 420 ? 2 : 1) === 0 || i === 12) cols += `<text class="axis" x="${(x + bw / 2).toFixed(1)}" y="${Ht - 8}" text-anchor="middle">${mo.m === 1 || i === 0 ? String(mo.y).slice(2) + "." : ""}${mo.m}${W < 420 ? "" : "월"}</text>`;
    }
    return `<div class="chart hchart"><svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${esc(label || "12개월 수수료·매출·보유자 몫")}">${g}${cols}</svg></div>`;
  }
  const krShort = v => v >= 1e8 ? (v / 1e8).toFixed(v >= 1e9 ? 0 : 1) + "억$" : v >= 1e4 ? Math.round(v / 1e4) + "만$" : v > 0 ? "$" + Math.round(v) : "0";
  const histLegend = `<div class="mlegend"><span><i class="mf-f"></i>수수료</span><span><i class="mf-r"></i>매출</span><span><i class="mf-h"></i>보유자 몫</span><span class="tiny muted">마지막 칸은 이번 달(진행 중, 하루 평균×30)</span></div>`;
  function histNote(hi) {
    if (!hi || hi.months < 4) return "";
    const t = [];
    if (hi.tr != null) t.push(Math.abs(hi.tr) < 10 ? "최근 3달 수수료는 그 전 9달 평균과 비슷해요" : `최근 3달 수수료가 그 전 9달 평균보다 ${pct0(Math.abs(hi.tr))} ${hi.tr > 0 ? "많아요(커지는 중)" : "적어요(줄어드는 중)"}`);
    t.push(`달마다 ${hi.steady === "꾸준함" ? "고르게 벌어요" : hi.steady === "보통" ? "조금씩 오르내려요" : "크게 오르내려요(한두 달 반짝)"}`);
    if (hi.hStart) t.push(`보유자 몫은 ${hi.hStart.y}년 ${hi.hStart.m}월부터 생겼어요`);
    else if (hi.hm === 12) t.push("보유자 몫이 12달 내내 있었어요");
    else if (hi.hm === 0) t.push("12달 동안 보유자 몫이 없었어요");
    return t.join(" · ") + ".";
  }
  // ── 코인 페이지: 숫자로 본 진단 · 같은 섹터 비교 ──
  function coinDiag(c, M, SS, secName, hi) {
    const st = SS[c.sec], mk = c.mk || [], out = [], peers = st ? st.list : [];
    const dt = d => `${Math.abs(d).toFixed(1)}%p ${d >= 0 ? "강해요" : "약해요"}`;
    if (peers.includes(c) && peers.length > 1) {
      const bs = peers.slice().sort((a, b) => (b.score ?? -1e9) - (a.score ?? -1e9)), bc = peers.slice().sort((a, b) => (n(b.mk[3]) || 0) - (n(a.mk[3]) || 0));
      out.push(["위치", `${secName[c.sec] || c.sec} 후보 ${peers.length}개 중 점수 ${bs.indexOf(c) + 1}위, 시총 ${bc.indexOf(c) + 1}위예요.`]);
    }
    const d30 = n(mk[7]), btc = M.coins.BTC && M.coins.BTC.mk ? n(M.coins.BTC.mk[7]) : null;
    if (d30 != null) out.push(["가격 흐름", [`최근 30일 ${pp(d30)}`, st && st.d30 != null && c.sym !== "BTC" ? `섹터 지수(${pp(st.d30)})보다 ${dt(d30 - st.d30)}` : "", btc != null && c.sym !== "BTC" ? `비트코인(${pp(btc)})보다 ${dt(d30 - btc)}` : ""].filter(Boolean).join(" · ") + "."]);
    const ath = n(mk[9]);
    if (ath != null) out.push(["고점 대비", `${pp(ath)}${st && st.ath != null && peers.length > 2 ? ` — 섹터 중앙값(${pp(st.ath)})보다 ${ath < st.ath ? "더 빠져 있어요" : "덜 빠졌어요"}` : ""}.`]);
    const mcap = n(mk[3]);
    if (c.fz && c.fz.F > 0 && mcap) { const pf = mcap / c.fz.F;
      out.push(["밸류", `시총이 1년 수수료의 ${xMult(pf)}${st && st.pf ? ` — 섹터 중앙값(${xMult(st.pf)})보다 ${pf <= st.pf ? `${(st.pf / pf).toFixed(1)}배 싸요` : `${(pf / st.pf).toFixed(1)}배 비싸요`}` : ""}.`]); }
    if (c.fz && c.fz.F > 0) { const y = mcap && c.fz.H > 0 ? c.fz.H / mcap * 100 : 0;
      out.push(["토큰에 오는 돈", NOFEE.has(c.sec) ? `수수료(연 ${krUsd(c.fz.F)})는 채굴자 몫이라 보유자에게 돌아오지 않아요(화폐형).` : c.fz.H > 0 ? `1년치 보유자 몫 ${krUsd(c.fz.H)} — 시총의 ${pct0(y)}, 100만 원어치면 1년에 약 ${wonPer(y)}어치가 돌아오는 셈이에요.` : c.fz.R > 0 ? `매출(연 ${krUsd(c.fz.R)})은 있지만 보유자에게 돌아가는 몫은 없어요.` : `수수료(연 ${krUsd(c.fz.F)})는 대부분 유동성 공급자·검증인 몫이에요.`]); }
    else if (!NOFEE.has(c.sec)) out.push(["토큰에 오는 돈", "DefiLlama에 수수료 데이터가 없어요 — 수익 모델이 없거나 아직 집계되지 않는 코인이에요."]);
    if (hi && hi.months >= 4) out.push(["수수료 추세", histNote(hi)]);
    else if (c.fz && c.fz.trend != null) out.push(["수수료 추세", `최근 7일 수수료가 30일 평균보다 ${pp(c.fz.trend)}.`]);
    const circ = n(mk[11]), sup = [];
    if (circ != null) sup.push(`유통 비율 ${Math.round(circ * 100)}%${circ < 0.5 ? "(앞으로 풀릴 물량이 많아요)" : circ >= 0.9 ? "(거의 다 풀렸어요)" : ""}`);
    if (c.unl && c.unl[0] && c.unl[0] - Date.now() < 30 * 86400e3 && c.unl[1] != null) sup.push(`${kstDate(c.unl[0])} 언락 유통량의 ${c.unl[1].toFixed(1)}%`);
    if (c.sg != null) sup.push(`실제 공급 연 ${c.sg > 0 ? "+" : ""}${c.sg.toFixed(1)}%`);
    if (sup.length) out.push(["공급", sup.join(" · ") + "."]);
    if (c.fund) out.push(["선물 수급", c.fund.yr >= 30 ? `펀딩비 연 ${c.fund.yr.toFixed(0)}% — 롱이 몰려 있어 선물로 들고 있는 비용이 커요.` : c.fund.yr <= -15 ? `펀딩비 연 ${c.fund.yr.toFixed(0)}% — 숏이 몰려 있어요.` : `펀딩비 연 ${c.fund.yr.toFixed(0)}%로 보통이에요.`]);
    if (c.ds != null && st && st.ds != null && peers.length > 2) out.push(["데이터 점수", `${c.ds.toFixed(0)}/100 — 섹터 중앙값 ${st.ds.toFixed(0)}보다 ${c.ds >= st.ds ? "높아요" : "낮아요"}(숫자로만 매긴 점수).`]);
    if (c.N != null && Math.abs(c.N) >= 2) out.push(["뉴스", `뉴스 점수 ${c.N > 0 ? "+" : ""}${c.N.toFixed(1)} — ${c.N > 0 ? "좋은 소식이 쌓여 있어요" : "나쁜 소식이 쌓여 있어요"}.`]);
    return out;
  }
  function peerTable(c, SS) {
    const st = SS[c.sec]; if (!st) return "";
    const list = st.list.slice().sort((a, b) => (a.lg - b.lg) || (a.pos - b.pos));
    let show = list.slice(0, 10); if (!show.includes(c) && c.mk) show.push(c);
    if (show.length < 2) return "";
    const td = (v, cls = "") => `<td class="num ${cls}">${v}</td>`;
    return `<section class="section"><div class="sec-head"><h2>같은 섹터 비교</h2><span class="sub"><a href="/sectors#s-${esc(c.sec)}">섹터 리포트 →</a></span></div>
      <div class="panel"><div class="tbl"><table class="money peer"><thead><tr><th>코인</th><th>점수</th><th>시총</th><th>30일</th><th>고점<br>대비</th><th>연<br>수수료</th><th>시총 ÷<br>수수료</th><th>보유자<br>수익률</th><th>유통<br>비율</th></tr></thead><tbody>${show.map(x => { const mk = x.mk || [], mc = n(mk[3]);
        return `<tr${x === c ? ' class="me"' : ""}><td class="mn"><a href="/rank/${encodeURIComponent(x.sym)}">${esc(x.b.ko || x.sym)}</a><span class="tiny muted">${x.lg === 1 ? `1군 ${x.pos}위${x.act ? " · 임시" : ""}` : x.lg === 2 ? `마이너 ${x.pos}위` : "후보 아님"}</span></td>
          ${td(x.score != null ? x.score.toFixed(1) : "-")}${td(capKo(mc).replace(" 달러", ""))}${td(pp(mk[7]), ppc(mk[7]))}${td(pp(mk[9]))}${td(x.fz && x.fz.F > 0 ? krUsd(x.fz.F) : "-")}${td(x.fz && x.fz.F > 0 && mc ? xMult(mc / x.fz.F) : "-")}${td(x.fz && x.fz.H > 0 && mc ? pct0(x.fz.H / mc * 100) : "-")}${td(n(mk[11]) != null ? Math.round(n(mk[11]) * 100) + "%" : "-")}</tr>`; }).join("")}</tbody></table></div>
      <p class="legend">1군·마이너리그 순서예요(최대 10개). 시총 ÷ 수수료는 낮을수록 버는 돈에 비해 싸고, 보유자 수익률은 1년 보유자 몫 ÷ 시총이에요. 유통 비율이 낮으면 앞으로 풀릴 물량이 많아요.</p></div></section>`;
  }
  let M_SEC = {};
  async function rankCoinPage(sym) {
    nav("sectors");
    const [d, h, FH] = await Promise.all([get("/api/sectors"), get("/api/sector-coin/" + encodeURIComponent(sym)).catch(() => ({ hist: [], news: [] })), feeHist()]);
    const M = sectorModel(d), c = M.coins[sym]; M_SEC = M.sec;
    if (!c) { setTitle(sym); main().innerHTML = `<header class="head"><div class="eyebrow">섹터 순위판</div><h1>${esc(sym)}</h1></header><div class="empty">순위판에 없는 코인이에요. <a href="/sectors">섹터 순위판으로</a></div>`; return; }
    const b = c.b, s = M.sec[c.sec] || {}, mk = c.mk || [];
    const SS = secStats(M), secName = Object.fromEntries(Object.values(M.sec).map(x => [x.id, x.name])), hi = histInfo(FH[sym]), diag = coinDiag(c, M, SS, secName, hi);
    setTitle(`${b.ko || sym} 섹터 순위`);
    const R = (d.rank && d.rank.rules) || { w: [0.6, 0.25, 0.15] }, w = R.w || [0.6, 0.25, 0.15];
    const parts = [["코인 품질", (c.Q || 0) * w[0], `${c.Q ?? "-"}/100 × ${w[0]}`], ["규모(시총)", (c.S || 0) * w[1], `${c.S ?? "-"}/100 × ${w[1]}`], ["섹터 생존", (s.score || 0) * w[2], `${s.score ?? "-"}/100 × ${w[2]}`], ["뉴스", c.N || 0, "-20~+20"]];
    const lgName = c.lg === 1 ? `1군 ${c.pos}위` : c.lg === 2 ? `마이너리그 ${c.pos}위${c.ext ? " (150위 밖 — 1군 후보 아님)" : ""}` : (WHY[c.why] || "후보 아님");
    const hist = (h.hist || []).map(([ts, x]) => [ts, x]).sort((a, b) => a[0] - b[0]);
    const posPts = hist.filter(([, x]) => x && x[1]).map(([ts, x]) => [ts, -x[1], `${kst(ts)} · ${x[2] === 1 ? "1군" : "2군"} ${x[1]}위 · ${n(x[3]) != null ? n(x[3]).toFixed(1) : "-"}점`]);
    const newsRows = (h.news || []).map(x => { const nn = x.n || {}; const u = safeUrl(nn.url); const hl = { short: 3, normal: 10, structural: 45 }[x.kind] || 10;
      const now = n(x.impact) * Math.pow(0.5, Math.max(0, Date.now() - (n(nn.pub) || x.ts)) / (hl * 86400e3));
      return `<div class="cn-row"><span class="cn-i num ${n(x.impact) > 0 ? "rise" : "fall"}">${n(x.impact) > 0 ? "+" : ""}${n(x.impact)}</span><div><div>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(nn.title || "")}</a>` : esc(nn.title || "")}</div>
        <div class="tiny muted">${kst(n(nn.pub) || x.ts)} · ${esc({ short: "단기", normal: "보통", structural: "구조적" }[x.kind] || x.kind)} · 지금 영향 ${now > 0 ? "+" : ""}${now.toFixed(1)}${nn.why ? " · " + esc(nn.why) : ""}</div></div></div>`; }).join("");
    main().innerHTML = `<header class="head"><div class="eyebrow"><a href="/sectors#s-${esc(c.sec)}">${esc(s.name || c.sec)}</a> · 섹터 순위판</div>
      <h1>${esc(b.ko || sym)} <span class="muted num" style="font-size:15px">${esc(sym)}</span></h1>
      <div class="row"><span class="chip${c.lg === 1 ? " lg1" : ""}">${esc(lgName)}</span>${exBadges(c)}${flagBadges(c)}${c.mine ? '<span class="tag mine">내 코인</span>' : ""}</div>
      <p class="c-what">${esc(b.story || "")}</p></header>
      <section class="tiles"><div class="tile"><b>점수</b><div class="v num">${c.score != null ? c.score.toFixed(1) : "-"}</div><div class="s">${c.crank ? `시총 ${c.crank}위` : ""}</div></div>
        <div class="tile"><b>가격</b><div class="v num">${usd(mk[2])}</div><div class="s">${ppChip(mk[5], " 24h")}</div></div>
        <div class="tile"><b>고점 대비</b><div class="v num ${ppc(mk[9])}">${pp(mk[9])}</div><div class="s">7일 ${pp(mk[6])} · 30일 ${pp(mk[7])}</div></div></section>
      ${diag.length ? `<section class="panel section cdiag"><div class="sec-head"><h2>숫자로 본 진단</h2><span class="sub">데이터로 자동 계산 · 같은 섹터와 비교</span></div>
        <dl class="cd">${diag.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        <p class="legend">사람 판단 없이 시세(코인마켓캡)·수수료(DefiLlama)·언락·펀딩비 숫자로만 쓴 문장이에요. 왜 그런지는 아래 심층 점검과 장단점을 같이 보세요. 투자 권유가 아니에요.</p></section>` : ""}
      <section class="panel section sb"><h2>점수 구성</h2>${parts.map(([k, v, t]) => `<div class="bar-row"><span class="small">${k}</span><div class="bar-track"><div class="bar-fill${v < 0 ? " neg" : ""}" style="width:${Math.min(100, Math.abs(v) / 60 * 100).toFixed(0)}%"></div></div><span class="num small">${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(1)}</span></div>`).join("")}
        <p class="tiny muted" style="margin:0">${parts.map(([k, , t]) => `${k} ${t}`).join(" · ")}</p>
        <div class="mini-h">코인 품질 5항목 (각 20점)</div>${QN.map((k, i) => { const man = (b.q || [])[i], dv = i < 2 && c.qd ? c.qd[i] : null, used = dv != null && man != null ? Math.round((man + dv) / 2) : man;
          return `<div class="bar-row"><span class="small">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${(used || 0) / 20 * 100}%"></div></div><span class="num small">${used ?? "-"}/20</span></div>${dv != null ? `<div class="tiny muted qd">AI 판단 ${man} · 실제 수익 데이터 ${dv.toFixed(1)} → 반반 섞어 ${used}</div>` : ""}`; }).join("")}
        ${b.qnote ? `<p class="small muted">${esc(b.qnote)}</p>` : ""}</section>
      ${dataPanel(c)}
      ${deepPanel(h.dd || b.dd)}
      ${c.fz ? `<section class="panel section"><div class="sec-head"><h2>실제 수익</h2><span class="sub">DefiLlama${c.fz.at ? " · " + kst(c.fz.at) : ""}${c.fz.chain ? " · 체인 수수료" : ""}</span></div>
        <div class="fz-grid">
          <div><span class="tiny muted">수수료 30일</span><b class="num">${krUsd(c.fz.f30)}</b><span class="tiny muted">연 ${krUsd(c.fz.F)}</span></div>
          <div><span class="tiny muted">매출 30일</span><b class="num">${krUsd(c.fz.r30)}</b><span class="tiny muted">연 ${krUsd(c.fz.R)}</span></div>
          <div><span class="tiny muted">보유자 수익 30일</span><b class="num">${krUsd(c.fz.h30)}</b><span class="tiny muted">연 ${krUsd(c.fz.H)}</span></div>
          <div><span class="tiny muted">시총 ÷ 연 보유자 수익</span><b class="num">${xMult(c.fz.mult)}</b><span class="tiny muted">매출 기준 ${xMult(c.fz.multR)}</span></div>
          <div><span class="tiny muted">수수료 최근 1주 추세</span><b class="num ${ppc(c.fz.trend)}">${pp(c.fz.trend)}</b><span class="tiny muted">30일 평균 대비</span></div>
          <div><span class="tiny muted">섹터 수수료 점유율</span><b class="num">${c.fz.sh30 != null ? c.fz.sh30.toFixed(0) + "%" : "-"}</b><span class="tiny muted">${c.fz.sh7 != null ? "최근 7일 " + c.fz.sh7.toFixed(0) + "%" : ""}</span></div></div>
        ${hi && hi.months >= 3 ? `<div class="mini-h">12개월 흐름 (한 달 환산)</div><div class="mwrap" id="c-hist">${histChart(hi.h, `${b.ko || sym} 12개월 수수료·매출·보유자 몫`)}${histLegend}</div>${histNote(hi) ? `<p class="small" style="margin:0">${esc(histNote(hi))}</p>` : ""}` : ""}
        ${["pow", "privacy"].includes(c.sec) ? '<p class="small muted" style="margin:0">PoW·프라이버시 코인은 화폐 성격이라 이 숫자를 점수에 반영하지 않아요.</p>' : ""}
        <p class="legend">수수료 = 사용자가 낸 돈 전체, 매출 = 그중 프로토콜이 가져간 몫, 보유자 수익 = 바이백·소각·분배로 토큰 보유자에게 간 몫이에요. 30일 값이 비면 1년 합계의 절반을 바닥으로 써요. 보유자 수익이 0이면 앱이 잘돼도 토큰 가격으로 바로 이어지지 않아요. DefiLlama가 집계하지 않는 바이백(별도 리저브 매입 등)은 빠져 있을 수 있어요.</p></section>` : ""}
      <section class="panel section"><div class="scen"><div class="bull"><b>장점</b>${(b.pros || []).map(esc).join(" · ")}</div><div class="bear"><b>단점</b>${(b.cons || []).map(esc).join(" · ")}</div></div>
        <div><div class="mini-h">급등할 수 있는 때</div>${esc(b.trigger || "")}</div><div><div class="mini-h">토큰에 가치가 쌓이는 방식</div>${esc(b.capture || "")}${b.stake ? " · 스테이킹 하지 않으면 발행분만큼 몫이 줄어요" : ""}</div>
        <div class="small muted">시총 ${capKo(mk[3])} · 24시간 거래대금 ${capKo(mk[4])}${n(mk[11]) != null ? ` · 유통 비율 ${Math.round(n(mk[11]) * 100)}%` : ""}</div></section>
      ${peerTable(c, SS)}
      ${c.fund || c.unl ? `<section class="panel section"><h2>보유 비용 · 공급 일정</h2><div class="fz-grid">
        ${c.fund ? `<div><span class="tiny muted">바이낸스 선물 펀딩비(1회)</span><b class="num ${c.fund.rate > 0 ? "rise" : c.fund.rate < 0 ? "fall" : ""}">${c.fund.rate > 0 ? "+" : ""}${c.fund.rate.toFixed(4)}%</b><span class="tiny muted">연환산 약 ${c.fund.yr > 0 ? "+" : ""}${c.fund.yr.toFixed(1)}%</span></div>
          <div><span class="tiny muted">미결제약정</span><b class="num">${krUsd(c.fund.oi)}</b><span class="tiny muted">${M.fundAt ? kst(M.fundAt) : ""}</span></div>` : ""}
        ${c.unl ? `<div><span class="tiny muted">다음 언락</span><b class="num ${unlSoon(c.unl) >= 1 ? "rise" : ""}">${c.unl[0] ? kstDate(c.unl[0]) : "예정 없음"}</b><span class="tiny muted">${c.unl[1] != null ? `유통량의 ${c.unl[1].toFixed(2)}% · ${krUsd(c.unl[2])}` : ""}${/linear/i.test(c.unl[4] || "") ? " · 조금씩 풀림" : ""}</span></div>
          <div><span class="tiny muted">아직 잠긴 물량</span><b class="num">${c.unl[3] != null ? c.unl[3].toFixed(1) + "%" : "-"}</b><span class="tiny muted">최대 공급 대비</span></div>` : ""}</div>
        ${c.fund ? `<p class="small" style="margin:0">${c.fund.yr >= 30 ? "롱이 많이 몰려 선물로 들고 있는 비용이 커요. 오래 들고 갈 거라면 현물이 더 유리할 수 있어요." : c.fund.yr <= -15 ? "펀딩비가 음수라 롱 포지션은 오히려 펀딩비를 받고 있어요(숏이 몰린 상태)." : "펀딩비는 보통 수준이에요."}</p>` : ""}
        <p class="legend">펀딩비는 롱이 숏에게 주는 돈(음수면 반대)이에요. 연환산은 8시간마다 낸다고 보고 계산했어요 — 바이낸스는 일부 코인을 4시간·1시간마다 정산해 실제로는 더 클 수 있어요. 언락은 코인마켓캡 일정 기준이에요(다음 한 번만 보여요).</p></section>` : ""}
      ${posPts.length > 1 ? `<section class="section"><div class="sec-head"><h2>섹터 안 순위 흐름</h2><span class="sub">위로 갈수록 높은 순위</span></div><div class="panel">${lineChart(posPts, v => Math.round(-v) + "위", false, "섹터 안 순위")}</div></section>` : ""}
      <section class="section"><div class="sec-head"><h2>순위에 반영된 뉴스</h2><span class="sub">AI가 매긴 영향(-10~+10), 시간이 지나면 줄어요</span></div><div class="panel cn-list">${newsRows || '<div class="small muted">아직 반영된 뉴스가 없어요.</div>'}</div></section>
      <p class="legend"><a href="/sectors">섹터 순위판으로</a> · 점수는 AI 판단 점수이며 투자 권유가 아니에요.</p>`;
    if ($("c-hist")) moneyTip($("c-hist"));
  }

  // ── 라우팅 ──
  // ── 돈 버는 코인 (/money) ──
  // 스마트폰 시대에 돈은 앱이 벌었다 — 웹3에서 지금 실제로 수수료를 버는 곳과, 그 돈이 토큰 보유자에게 얼마나 돌아오는지.
  // 데이터: DefiLlama 수수료·매출·보유자 수익(kv fees) + 코인마켓캡 시총·유통 비율(kv cp). 모든 금액은 연환산 달러.
  //   수수료(F) = 사용자가 낸 돈 전체 · 매출(R) = 그중 프로토콜이 가져간 몫 · 보유자 몫(H) = 바이백·소각·분배로 토큰 보유자에게 간 몫
  // 정렬 = 순위가 답하는 질문 [키, 짧은 이름, 질문, 읽는 법, 용어]
  const MONEY_SORTS = [
    ["F", "수수료", "사람들이 돈을 내고 가장 많이 쓰는 곳은?", "인기·사용량 순위예요. 다만 이 돈이 토큰에 오는지는 따로 봐야 해요.", "fee"],
    ["R", "매출", "사업으로 가장 많이 버는 곳은?", "유동성 공급자·검증인 몫을 빼고 프로토콜에 남는 돈 순위예요.", "rev"],
    ["H", "보유자 몫", "토큰 가진 사람에게 가장 많이 돌려주는 곳은?", "바이백·소각·분배로 실제 돌아간 돈의 크기 순위예요.", "hold"],
    ["yield", "수익률", "들고 있으면 가장 많이 돌아오는 곳은?", "가격 대비 돌려받는 비율이에요. 100만 원어치 들고 있을 때 1년에 돌아오는 몫으로 같이 보여줘요.", "yield"],
    ["fyield", "희석 반영", "앞으로 풀릴 물량까지 치면 어디가 많이 돌려주나?", "아직 잠긴 토큰이 다 풀린다고 보고 다시 계산한 수익률이에요. 유통 비율이 낮을수록 많이 줄어요.", "dil"],
    ["pe", "싼 순", "버는 돈에 비해 가장 싼 곳은?", "시가총액이 1년 보유자 몫의 몇 배인지(주식의 PER) — 낮을수록 싸요.", "pe"],
    ["growth", "성장", "요즘 가장 빨리 크는 곳은?", "최근 30일 수수료가 1년 평균보다 얼마나 늘었는지예요.", "growth"],
    ["payout", "환원율", "번 돈을 가장 아낌없이 돌려주는 곳은?", "매출 중 보유자에게 돌려준 비율(주식의 배당성향)이에요.", "payout"],
    ["steady", "꾸준함", "1년 내내 고르게 버는 곳은?", "지난 12달 수수료가 달마다 얼마나 고르게 나왔는지예요. 한두 달 반짝한 곳을 거를 때 써요(12개월 기록이 있는 코인만).", "steady"],
    ["tr3", "3달 추세", "최근 석 달 동안 수수료가 늘고 있는 곳은?", "최근 3달 평균 수수료가 그 전 9달 평균보다 얼마나 많은지예요. 30일 성장보다 덜 흔들려요(12개월 기록이 있는 코인만).", "trend"]];
  // 처음 보는 사람을 위한 용어 풀이 — 가게·주식에 빗대어
  const GLOSS = {
    fee: ["수수료", "사용자가 그 서비스를 쓰면서 낸 돈 전체예요. 가게로 치면 손님이 계산대에 낸 돈 총액이에요. 크면 '많이 쓰인다'는 뜻이지만, 이 돈이 토큰 주인에게 가는지는 별개예요."],
    rev: ["매출 (프로토콜 매출)", "수수료 중에서 서비스를 만든 쪽(프로토콜)이 가져간 몫이에요. 나머지는 거래 상대가 돼 준 유동성 공급자나 체인을 지키는 검증인에게 가요. 가게로 치면 재료비·카드 수수료를 떼고 가게에 남는 돈이에요."],
    hold: ["보유자 몫", "매출 중에서 바이백·소각·분배로 토큰 가진 사람에게 실제로 돌아간 돈이에요. 주식으로 치면 배당 + 자사주 매입이에요. 이게 있어야 '서비스가 잘되면 토큰도 좋아지는' 연결고리가 생겨요."],
    yield: ["보유자 수익률", "1년 보유자 몫 ÷ 시가총액이에요. 주식의 배당수익률과 같아요. 3%면 100만 원어치 들고 있을 때 1년에 약 3만 원어치가 돌아오는 셈이에요(바이백은 현금이 아니라 토큰 가치로 돌아와요). 가격 오르내림은 빼고 계산해요."],
    dil: ["희석 · 희석 반영 수익률", "희석은 새 토큰이 풀려서 내 몫이 작아지는 거예요(주식의 신주 발행). 희석 반영 수익률은 아직 잠겨 있는 토큰까지 다 풀렸다고 치고 다시 계산한 수익률이에요. 지금 수익률이 높아 보여도 이 숫자가 많이 낮으면, 앞으로 나눠 가질 사람이 크게 늘어난다는 뜻이에요."],
    circ: ["유통 비율", "최대 발행량 중 지금 시장에 풀려 있는 비율이에요. 30%면 앞으로 지금의 2배 넘는 물량이 더 풀릴 수 있어요. 낮을수록 언락(잠금 해제) 때 파는 물량이 나올 수 있어요."],
    pe: ["시총 ÷ 보유자 몫 (PER)", "시가총액이 1년 보유자 몫의 몇 배인지예요. 주식의 PER과 같아서 낮을수록 버는 돈에 비해 싸요. 20배 = 수익률 5%, 50배 = 2%, 100배 = 1%."],
    pf: ["시총 ÷ 수수료", "시가총액이 1년 수수료의 몇 배인지예요. 보유자 몫이 없는 코인도 비교할 수 있어서, 같은 섹터 안에서 비싼지 싼지 볼 때 써요."],
    payout: ["환원율", "매출 중 보유자에게 돌려준 비율이에요. 주식의 배당성향과 같아요. 100%에 가까우면 번 돈을 거의 다 돌려주고, 0%면 금고에 쌓아 둬요."],
    growth: ["수수료 성장", "최근 30일 하루 평균 수수료가 지난 1년 하루 평균보다 몇 % 많은지예요. +면 요즘 더 많이 쓰이고, -면 식고 있어요."],
    secmed: ["섹터 중앙값", "같은 섹터(예: 현물 DEX)에서 데이터가 있는 코인들의 '시총 ÷ 수수료'를 줄 세웠을 때 가운데 값이에요. 이보다 낮으면 그 섹터 안에서 싼 편이에요."],
    buyback: ["바이백 · 소각", "프로토콜이 번 돈으로 시장에서 자기 토큰을 사들이는 게 바이백, 사들인 토큰을 없애는 게 소각이에요. 둘 다 남은 토큰 한 개의 몫을 키워요(주식의 자사주 매입·소각)."],
    arch: ["돈이 돌아오는 방식", "환원형 = 번 돈 대부분을 돌려줌 · 체인 소각형 = 체인 수수료를 태움 · 금고 적립형 = 프로토콜 금고(DAO)에 쌓아 둠 · 통과형 = 수수료가 대부분 유동성 공급자·검증인 몫 · 혼합형 = 일부만 돌려줌."],
    ann: ["1년치로 환산", "최근 30일 실적을 1년(×365÷30)으로 늘린 값이에요. 단, 1년 실제 실적의 절반보다 작으면 1년 실적을 써서 한 달 반짝한 것에 속지 않게 했어요."],
    steady: ["꾸준함", "지난 12달 동안 달마다 수수료가 얼마나 고르게 나왔는지예요(변동계수 = 표준편차 ÷ 평균). 0.3 아래면 '꾸준함', 0.7 위면 '들쭉날쭉'이에요. 가게로 치면 매달 매출이 비슷한 가게가 더 믿을 만한 것과 같아요."],
    trend: ["3달 추세", "최근 3달 평균 수수료 ÷ 그 전 9달 평균 − 1이에요. 30일 하나만 보는 것보다 일시적인 급등락에 덜 속아요. +면 커지는 중, -면 줄어드는 중이에요."],
    fswitch: ["수수료 스위치", "지금은 금고에 쌓는 매출을 토큰 보유자에게 돌리기로 결정하는 것(주로 거버넌스 투표)이에요. 결정되면 보유자 몫이 0에서 갑자기 생겨서 대표적인 급등 재료가 돼요."] };
  const tq = k => GLOSS[k] ? `<button type="button" class="tq" data-term="${k}" aria-label="${esc(GLOSS[k][0])} 뜻">?</button>` : "";
  // 받침에 따라 은/는 (한글이 아니면 '은(는)')
  const eun = w => { const c = String(w || "").trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 ? ((c - 0xac00) % 28 ? "은" : "는") : "은(는)"; };
  const wonPer = y => !(y > 0) ? "0원" : y >= 1 ? `${y >= 10 ? y.toFixed(0) : y.toFixed(1)}만 원` : `${(Math.round(y * 100) * 100).toLocaleString("ko-KR")}원`; // 100만 원어치 기준 1년 몫 (1만 원 아래는 원 단위)
  let tqBound = false;
  function bindTerms() { // '?' 누르면 용어 풀이 말풍선
    if (tqBound) return; tqBound = true;
    const pop = document.createElement("div"); pop.className = "tq-pop"; pop.hidden = true; pop.setAttribute("role", "dialog"); document.body.appendChild(pop);
    const close = () => { pop.hidden = true; };
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest(".tq");
      if (!b) { if (!pop.contains(e.target)) close(); return; }
      e.preventDefault(); e.stopPropagation();
      const g = GLOSS[b.dataset.term]; if (!g) return;
      pop.textContent = ""; const h = document.createElement("b"); h.textContent = g[0]; const p2 = document.createElement("p"); p2.textContent = g[1]; pop.append(h, p2);
      pop.hidden = false; const r = b.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 24);
      pop.style.width = w + "px"; pop.style.left = Math.max(12, Math.min(r.left + window.scrollX - w / 2 + r.width / 2, window.scrollX + window.innerWidth - w - 12)) + "px"; pop.style.top = (r.bottom + window.scrollY + 8) + "px";
    }, true);
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    window.addEventListener("resize", close);
  }
  const ARCH = { give: ["환원형", "매출의 절반 이상을 바이백·소각·분배로 보유자에게 돌려줘요"], burn: ["체인 소각형", "체인 수수료를 태워서 모든 보유자의 몫을 늘려요"],
    vault: ["금고 적립형", "매출은 있지만 대부분 프로토콜 금고(DAO)에 쌓여요 — 환원 결정이 나오면 보유자 몫이 생길 수 있어요"],
    pass: ["통과형", "수수료 대부분이 유동성 공급자·검증인(체인은 검증인·금고)에게 가고 토큰 보유자 몫이 작아요"], mix: ["혼합형", "매출 일부만 보유자에게 돌아가요"] };
  function moneyModel(M, FH) {
    const rows = [];
    Object.values(M.coins).forEach(c => {
      const fz = c.fz; if (!fz || !(fz.F > 0)) return;
      const f = (M.feesM || {})[c.sym] || [];
      const mcap = c.mk ? n(c.mk[3]) : null, circ = c.mk ? n(c.mk[11]) : null;
      const fdv = mcap && circ > 0.05 ? mcap / circ : null;
      const F = fz.F, R = fz.R || 0, H = fz.H || 0;
      const d1y = n(f[2]) > 0 ? f[2] / 365 : null, d30 = n(f[0]) > 0 ? f[0] / 30 : null, d7 = n(f[1]) > 0 ? f[1] / 7 : null;
      const growth = d1y && d30 ? (d30 / d1y - 1) * 100 : null;
      const take = R > 0 ? R / F : 0, payout = R > 0 ? H / R : (H > 0 ? 1 : 0);
      const arch = fz.chain ? (H > 0 ? "burn" : "pass") : H > 0 && payout >= 0.5 ? "give" : R > 0 && H / Math.max(R, 1) < 0.2 ? (take < 0.1 ? "pass" : "vault") : take < 0.1 ? "pass" : "mix";
      rows.push({ c, sym: c.sym, sec: c.sec, F, R, H, mcap, fdv, circ, d1y, d30, d7, growth, take, payout, arch,
        pf: mcap && F > 0 ? mcap / F : null, ps: mcap && R > 0 ? mcap / R : null, pe: mcap && H > 0 ? mcap / H : null,
        yield: mcap && H > 0 ? H / mcap * 100 : 0, fyield: (fdv || mcap) && H > 0 ? H / (fdv || mcap) * 100 : 0, ryield: mcap && R > 0 ? R / mcap * 100 : 0,
        noScore: NOFEE.has(c.sec), hi: FH ? histInfo(FH[c.sym]) : null });
    });
    // 섹터 중앙값 (시총 ÷ 연 수수료) — 같은 섹터 안에서 비싼지 싼지
    const med = a => { const v = a.slice().sort((x, y) => x - y), k = v.length >> 1; return v.length ? (v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2) : null; };
    const bySec = {}; rows.forEach(r => { if (r.pf && !r.noScore && r.c.why !== "core") (bySec[r.sec] = bySec[r.sec] || []).push(r.pf); });
    const secMed = {}; Object.entries(bySec).forEach(([k, a]) => { if (a.length >= 3) secMed[k] = med(a); });
    rows.forEach(r => { r.vsSec = r.pf && secMed[r.sec] ? r.pf / secMed[r.sec] : null; });
    // 섹터별 합계
    const secs = {};
    rows.forEach(r => { const s = secs[r.sec] = secs[r.sec] || { id: r.sec, F: 0, R: 0, H: 0, mcap: 0, n: 0, top: null }; s.F += r.F; s.R += r.R; s.H += r.H; s.mcap += r.mcap || 0; s.n++; if (!s.top || r.F > s.top.F) s.top = r; });
    const tot = rows.reduce((a, r) => (a.F += r.F, a.R += r.R, a.H += r.H, a.mcap += r.mcap || 0, a), { F: 0, R: 0, H: 0, mcap: 0 });
    return { rows, secs: Object.values(secs).sort((a, b) => b.F - a.F), tot, secMed };
  }
  const NOFEE = new Set(["pow", "privacy"]);
  const pct0 = x => x == null || !isFinite(x) ? "-" : x === 0 ? "0%" : (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2)) + "%";
  function moneyVerdict(r, secName) {
    const out = [];
    if (r.H > 0) out.push(`사용자가 낸 수수료의 ${pct0(r.H / r.F * 100)}가 토큰 보유자에게 가요 — 시총 대비 연 ${pct0(r.yield)}${r.fdv && r.circ < 0.8 ? `, 앞으로 풀릴 물량까지 넣으면 ${pct0(r.fyield)}` : ""}.`);
    else if (r.R > 0) out.push(`매출(연 ${krUsd(r.R)})은 있지만 보유자 몫은 없어요 — 매출을 전부 돌려준다면 시총 대비 연 ${pct0(r.ryield)}예요.`);
    else out.push(`수수료(연 ${krUsd(r.F)})는 대부분 유동성 공급자·검증인 몫이라 프로토콜 매출이 거의 없어요.`);
    if (r.growth != null) out.push(Math.abs(r.growth) < 10 ? "최근 30일 수수료는 1년 평균과 비슷해요." : `최근 30일 수수료가 1년 평균보다 ${pct0(Math.abs(r.growth))} ${r.growth > 0 ? "많아요(성장)" : "적어요(둔화)"}.`);
    if (r.vsSec) out.push(r.vsSec < 0.7 ? `같은 섹터(${secName[r.sec] || r.sec}) 중앙값보다 수수료 대비 ${(1 / r.vsSec).toFixed(1)}배 싸요.` : r.vsSec > 1.4 ? `같은 섹터 중앙값보다 수수료 대비 ${r.vsSec.toFixed(1)}배 비싸요.` : "수수료 대비 가격은 섹터 중앙값 근처예요.");
    return out;
  }
  function moneyCaveats(r) {
    const w = [];
    if (r.c.sec === "cex") w.push("거래소 토큰은 거래소 장부의 바이백·소각이 DefiLlama에 잘 안 잡혀요");
    if (r.arch === "burn") w.push("체인 수수료 소각은 발행(스테이킹 보상)과 같이 봐야 해요");
    if (r.circ != null && r.circ < 0.5) w.push(`유통 비율 ${Math.round(r.circ * 100)}% — 앞으로 풀릴 물량이 많아요`);
    if (r.c.unl && r.c.unl[0] && r.c.unl[0] - Date.now() < 30 * 86400e3 && r.c.unl[1] >= 1) w.push(`${kstDate(r.c.unl[0])} 언락 유통량의 ${r.c.unl[1].toFixed(1)}%`);
    if (r.c.sg != null && r.c.sg > 3) w.push(`실제 공급이 연 ${r.c.sg.toFixed(1)}% 늘고 있어요`);
    if (r.d1y == null) w.push("1년 데이터가 없어 30일 값으로만 계산했어요");
    if (r.noScore) w.push("PoW·프라이버시 코인은 수수료가 채굴자 몫이라 점수엔 안 써요");
    return w;
  }
  // 섹터별 돈의 흐름 — 수수료 ⊃ 매출 ⊃ 보유자 몫 (같은 색 세 단계)
  function moneySecChart(MM, secName) {
    const list = MM.secs.filter(s => s.F > 0).slice(0, 16), max = Math.max(...list.map(s => s.F), 1);
    const bar = (v, cls) => v > 0 ? `<i class="mf-${cls}" style="width:${Math.max(0.6, v / max * 100).toFixed(2)}%"></i>` : "";
    return `<div class="msec" role="list">${list.map(s => `<div class="msec-r" role="listitem" tabindex="0" data-tip="${esc(`${secName[s.id] || s.id}|연 수수료 ${krUsd(s.F)}|프로토콜 매출 ${krUsd(s.R)}|보유자 몫 ${krUsd(s.H)} (${pct0(s.H / s.F * 100)})|코인 ${s.n}개 · 가장 큰 곳 ${(s.top.c.b.ko || s.top.sym)}`)}">
        <span class="msec-n">${esc(secName[s.id] || s.id)}</span>
        <span class="msec-t">${[[s.F, "f"], [s.R, "r"], [s.H, "h"]].sort((a, b) => b[0] - a[0]).map(([v, k]) => bar(v, k)).join("")}</span>
        <span class="msec-v num">${krUsd(s.F)}<small>${s.H > 0 ? ` · 보유자 ${pct0(s.H / s.F * 100)}` : " · 보유자 0"}</small></span></div>`).join("")}</div>
      <div class="mlegend"><span><i class="mf-f"></i>수수료(사용자가 낸 돈)</span><span><i class="mf-r"></i>프로토콜 매출</span><span><i class="mf-h"></i>보유자 몫</span></div>`;
  }
  // 싸고 성장하는 코인 지도 — x: 시총 ÷ 연 보유자 수익(로그, 왼쪽이 쌈) · y: 수수료 성장(최근 30일 ÷ 1년 평균)
  function moneyScatter(MM) {
    const pts = MM.rows.filter(r => r.pe && r.growth != null);
    if (pts.length < 4) return "";
    // 좁은 화면은 좌표계를 작게 잡아 글자가 줄어들지 않게
    const W = Math.round(Math.min(640, Math.max(330, (window.innerWidth || 640) - 56))), H = W < 480 ? 300 : 360, L = 48, R = 12, T = 18, B = 40;
    const lx = v => Math.log10(Math.min(Math.max(v, 1), 1e5));
    const xs = pts.map(r => lx(r.pe)); let x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)); if (x1 - x0 < 2) x1 = x0 + 2;
    const gy = v => Math.max(-90, Math.min(200, v));
    let y0 = Math.min(-50, ...pts.map(r => gy(r.growth))), y1 = Math.max(50, ...pts.map(r => gy(r.growth))); y0 = Math.floor(y0 / 50) * 50; y1 = Math.ceil(y1 / 50) * 50;
    const X = v => L + (lx(v) - x0) / (x1 - x0) * (W - L - R), Y = v => T + (y1 - gy(v)) / (y1 - y0) * (H - T - B);
    let g = "";
    for (let e = x0; e <= x1; e++) { const x = L + (e - x0) / (x1 - x0) * (W - L - R); g += `<line class="grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${T}" y2="${H - B}"/><text class="axis" x="${x.toFixed(1)}" y="${H - B + 16}" text-anchor="middle">${Math.pow(10, e).toLocaleString("en-US")}배</text>`; }
    for (let v = y0; v <= y1; v += 50) { const y = Y(v); g += `<line class="${v === 0 ? "zero" : "grid"}" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axis" x="${L - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end">${v > 0 ? "+" : ""}${v}%</text>`; }
    // 싸고(보유자 수익률 5% 이상 = 20배 이하) 성장하는 칸
    const qx = Math.min(W - R, Math.max(L, X(20))), qy = Y(0);
    const zone = qx > L ? `<rect class="mz" x="${L}" y="${T}" width="${(qx - L).toFixed(1)}" height="${(qy - T).toFixed(1)}"/><text class="mz-t" x="${L + 6}" y="${T + 14}">싸고 성장하는 칸</text>` : "";
    // 이름표: 보유자 몫이 큰 순서로 최대 7개, 다른 이름표·점과 겹치면 자리를 바꾸고 그래도 겹치면 생략 (값은 점에 올리면 보임)
    const boxes = [], labAt = {}, tw = t => t.length * 11 + 4;
    pts.forEach(r => boxes.push([X(r.pe) - 5, Y(r.growth) - 5, X(r.pe) + 5, Y(r.growth) + 5]));
    const hitB = b => boxes.some(o => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]));
    pts.slice().sort((a, b) => b.H - a.H).slice(0, 7).forEach(r => { const x = X(r.pe), y = Y(r.growth), t = r.c.b.ko || r.sym, w = tw(t);
      for (const [dx, dy, anc] of [[8, -7, "start"], [8, 15, "start"], [-8, -7, "end"], [-8, 15, "end"]]) {
        const x0 = anc === "start" ? x + dx : x + dx - w, b = [x0, y + dy - 11, x0 + w, y + dy + 2];
        if (b[0] < L || b[2] > W - R || b[1] < T || b[3] > H - B || hitB(b)) continue;
        boxes.push(b); labAt[r.sym] = [x + dx, y + dy, anc]; break; } });
    const dots = pts.sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).map(r => { const x = X(r.pe), y = Y(r.growth), la = labAt[r.sym];
      return `<g class="mdot${r.c.lg === 1 ? " g1" : ""}" tabindex="0" data-tip="${esc(`${r.c.b.ko || r.sym} (${r.sym})|보유자 수익률 연 ${pct0(r.yield)} · 시총÷보유자 몫 ${xMult(r.pe)}|수수료 성장 ${pp(r.growth)}|연 보유자 몫 ${krUsd(r.H)}`)}"><circle class="hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13"/><circle class="pt" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>${la ? `<text class="mlab" x="${la[0].toFixed(1)}" y="${la[1].toFixed(1)}" text-anchor="${la[2]}">${esc(r.c.b.ko || r.sym)}</text>` : ""}</g>`; }).join("");
    return `<div class="chart mchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="수익 대비 가격과 수수료 성장 산점도">${zone}${g}${dots}
      <text class="axis" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">시총 ÷ 연 보유자 몫${W < 480 ? "" : " (왼쪽일수록 수익 대비 쌈)"}</text></svg></div>`;
  }
  function moneyRow(r, i, key, secName) {
    const c = r.c, a = ARCH[r.arch];
    const main = { H: [krUsd(r.H), "연 보유자 몫"], yield: [pct0(r.yield), `100만 원당 연 ${wonPer(r.yield)}`], fyield: [pct0(r.fyield), `희석 반영 · 100만 원당 ${wonPer(r.fyield)}`], pe: [xMult(r.pe), "시총 ÷ 보유자 몫"],
      growth: [pp(r.growth), "수수료 성장"], F: [krUsd(r.F), "연 수수료"], R: [krUsd(r.R), "연 매출"], payout: [r.R > 0 ? pct0(r.payout * 100) : "-", "매출 중 보유자 몫"],
      steady: [r.hi && r.hi.cv != null ? r.hi.steady : "-", r.hi && r.hi.cv != null ? `변동 ${r.hi.cv.toFixed(2)}` : "기록 없음"], tr3: [r.hi && r.hi.tr != null ? pp(r.hi.tr) : "-", "최근 3달 vs 9달"] }[key] || [krUsd(r.H), "연 보유자 몫"];
    const fun = [[r.F, "수수료", "f"], [r.R, "매출", "r"], [r.H, "보유자", "h"]];
    const tmax = Math.max(r.d1y || 0, r.d30 || 0, r.d7 || 0, 1);
    const tr = [[r.d1y, "1년 평균"], [r.d30, "최근 30일"], [r.d7, "최근 7일"]];
    const cav = moneyCaveats(r);
    return `<details class="mrow"${i < 1 ? " open" : ""}><summary>
        <span class="mr-no num">${i + 1}</span>
        <span class="mr-nm"><b>${esc(c.b.ko || c.sym)}</b> <span class="sym">${esc(c.sym)}</span><span class="mr-tags"><span class="tag">${esc(secName[c.sec] || c.sec)}</span>${c.b.core ? '<span class="tag">기준 코인</span>' : c.lg === 1 ? '<span class="tag mine">1군</span>' : ""}<span class="tag arch-${r.arch}" title="${esc(a[1])}">${a[0]}</span>${r.c.ex.up ? '<span class="xb up" title="업비트 원화마켓">업</span>' : ""}</span></span>
        <span class="mr-sp" title="12개월 수수료 흐름">${r.hi ? spark(r.hi.F) : ""}</span>
        <span class="mr-v"><b class="num">${main[0]}</b><span class="tiny muted">${main[1]}</span></span></summary>
      <div class="mr-body">
        <div class="mr-grid">
          <div><span class="tiny muted">연 수수료 ${tq("fee")}</span><b class="num">${krUsd(r.F)}</b><span class="tiny muted">손님이 낸 돈</span></div>
          <div><span class="tiny muted">연 매출 ${tq("rev")}</span><b class="num">${krUsd(r.R)}</b><span class="tiny muted">가게에 남은 돈</span></div>
          <div><span class="tiny muted">연 보유자 몫 ${tq("hold")}</span><b class="num">${krUsd(r.H)}</b><span class="tiny muted">토큰 주인에게 간 돈</span></div>
          <div><span class="tiny muted">보유자 수익률 ${tq("yield")}</span><b class="num">${r.H > 0 ? pct0(r.yield) : "0%"}</b><span class="tiny muted">100만 원당 연 ${wonPer(r.yield)}</span></div>
          <div><span class="tiny muted">희석 반영 ${tq("dil")}</span><b class="num">${r.H > 0 ? pct0(r.fyield) : "-"}</b><span class="tiny muted">${r.fdv ? `유통 ${Math.round((r.circ || 0) * 100)}% · 100만 원당 ${wonPer(r.fyield)}` : "유통 비율 모름"}</span></div>
          <div><span class="tiny muted">시총 ÷ 수수료 ${tq("pf")}</span><b class="num">${xMult(r.pf)}</b><span class="tiny muted">${r.vsSec ? `섹터 중앙값의 ${r.vsSec.toFixed(1)}배` : "섹터 비교 없음"}</span></div>
        </div>
        <div class="mr-two">
          <div><div class="mini-h">돈의 흐름 (1년치) ${tq("ann")}</div>${fun.map(([v, l, k]) => `<div class="mfun"><span>${l}</span><span class="mfun-t"><i class="mf-${k}" style="width:${v > 0 ? Math.max(1, v / r.F * 100).toFixed(1) : 0}%"></i></span><span class="num">${krUsd(v)}</span></div>`).join("")}</div>
          <div><div class="mini-h">하루 평균 수수료 추세 ${tq("growth")}</div>${tr.map(([v, l]) => `<div class="mfun"><span>${l}</span><span class="mfun-t"><i class="mf-r" style="width:${v ? (v / tmax * 100).toFixed(1) : 0}%"></i></span><span class="num">${v ? krUsd(v) : "-"}</span></div>`).join("")}</div>
        </div>
        ${r.hi && r.hi.months >= 3 ? `<div><div class="mini-h">12개월 흐름 (한 달 환산) ${tq("steady")}</div><div class="mwrap mr-hist">${histChart(r.hi.h, `${r.c.b.ko || r.sym} 12개월 수수료·매출·보유자 몫`)}</div>${histNote(r.hi) ? `<div class="small">${esc(histNote(r.hi))}</div>` : ""}</div>` : ""}
        <ul class="mr-v2">${moneyVerdict(r, secName).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
        ${cav.length ? `<div class="mr-cav">${cav.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
        <div class="small"><a href="/rank/${encodeURIComponent(c.sym)}">${esc(c.b.ko || c.sym)} 순위·심층 점검 보기 →</a></div>
      </div></details>`;
  }
  function moneyTip(root) {
    const tip = document.createElement("div"); tip.className = "mtip"; tip.hidden = true; root.appendChild(tip);
    const show = (el, ev) => { const parts = String(el.dataset.tip || "").split("|"); tip.textContent = "";
      parts.forEach((t, i) => { const d = document.createElement(i ? "div" : "b"); d.textContent = t; tip.appendChild(d); });
      tip.hidden = false; const rb = root.getBoundingClientRect(), eb = el.getBoundingClientRect();
      let x = (ev && ev.clientX != null ? ev.clientX : eb.left + eb.width / 2) - rb.left + 12, y = (ev && ev.clientY != null ? ev.clientY : eb.top) - rb.top + 12;
      x = Math.min(x, rb.width - tip.offsetWidth - 4); tip.style.left = Math.max(4, x) + "px"; tip.style.top = y + "px"; };
    root.querySelectorAll("[data-tip]").forEach(el => {
      el.addEventListener("pointermove", e => show(el, e)); el.addEventListener("focus", () => show(el));
      el.addEventListener("pointerleave", () => { tip.hidden = true; }); el.addEventListener("blur", () => { tip.hidden = true; }); });
  }
  function moneyTeaser(M, secName) { // 섹터 순위판 위쪽 요약
    const MM = moneyModel(M); const top = MM.rows.filter(r => r.H > 0).sort((a, b) => b.H - a.H).slice(0, 5);
    if (!top.length) return "";
    return `<section class="section"><div class="sec-head"><h2>돈 버는 코인</h2><a class="sub" href="/money">자세히 보기 →</a></div>
      <a class="panel mteaser" href="/money"><div class="small muted">추적 중인 코인들의 연 수수료 ${krUsd(MM.tot.F)} 가운데 토큰 보유자에게 돌아가는 몫은 ${krUsd(MM.tot.H)}(${pct0(MM.tot.H / MM.tot.F * 100)})예요.</div>
      <div class="mt-list">${top.map((r, i) => `<span><span class="num muted">${i + 1}</span> <b>${esc(r.c.b.ko || r.sym)}</b> <span class="num">${krUsd(r.H)}</span> <span class="tiny muted">수익률 ${pct0(r.yield)}</span></span>`).join("")}</div></a></section>`;
  }
  function loadMPref() { try { return Object.assign({ sort: "H", t150: false, up: false, major: false, sec: "" }, JSON.parse(localStorage.getItem("moneyPref") || "{}")); } catch (e) { return { sort: "H", t150: false, up: false, major: false, sec: "" }; } }
  function saveMPref(p) { try { localStorage.setItem("moneyPref", JSON.stringify(p)); } catch (e) {} }
  // 실제 코인 하나로 수수료 → 매출 → 보유자 몫을 따라가는 예시
  function moneyExample(MM) {
    const pool = MM.rows.filter(r => r.H > 0 && r.mcap && !r.c.b.core);
    const ex = pool.filter(r => r.H <= r.R * 1.05).sort((a, b) => b.H - a.H)[0] || pool.sort((a, b) => b.H - a.H)[0];
    if (!ex) return "";
    const nm = esc(ex.c.b.ko || ex.sym), share = ex.H / ex.F * 100;
    return `<div class="mex panel">
      <div class="mini-h">예시로 따라가 보기 — ${nm}</div>
      <div class="mflow">
        <div><span class="tiny muted">① 손님이 낸 돈</span><b class="num">${krUsd(ex.F)}</b><span class="tiny">수수료(사용자) ${tq("fee")}</span></div>
        <i aria-hidden="true">→</i>
        <div><span class="tiny muted">② 가게에 남은 돈</span><b class="num">${krUsd(ex.R)}</b><span class="tiny">매출(프로토콜) ${tq("rev")}</span></div>
        <i aria-hidden="true">→</i>
        <div class="hl"><span class="tiny muted">③ 주주에게 간 돈</span><b class="num">${krUsd(ex.H)}</b><span class="tiny">보유자 몫(토큰 주인) ${tq("hold")}</span></div>
      </div>
      <p class="small">${nm} 사용자가 1년에 낸 돈 중 <b>${pct0(share)}</b>가 토큰 보유자에게 돌아가요. 시가총액이 ${krUsd(ex.mcap)}라서 <b>보유자 수익률은 연 ${pct0(ex.yield)}</b> — <b>100만 원어치 들고 있으면 1년에 약 ${wonPer(ex.yield)}어치</b>가 바이백·소각·분배로 돌아오는 셈이에요(가격 변동은 빼고).${ex.fdv && ex.circ < 0.8 ? ` 다만 아직 안 풀린 토큰까지 치면 ${pct0(ex.fyield)}(100만 원당 ${wonPer(ex.fyield)})로 줄어요 ${tq("dil")}.` : ""}${ex.H > ex.R ? " (이 코인은 매출 밖 기금까지 바이백에 써서 보유자 몫이 매출보다 커요.)" : ""}</p></div>`;
  }
  // 같은 코인도 무엇으로 줄 세우느냐에 따라 순위가 크게 달라진다 — 수수료·매출·보유자 몫 상위 10 나란히
  function moneyCompare(MM) {
    const rk = key => { const m = {}; MM.rows.filter(r => r[key] > 0).sort((a, b) => b[key] - a[key]).forEach((r, i) => m[r.sym] = i + 1); return m; };
    const RF = rk("F"), RR = rk("R"), RH = rk("H");
    const col = (key, ttl, q, tk, other) => { const list = MM.rows.filter(r => r[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 10);
      return `<div class="mcmp-c"><div class="mcmp-h"><b>${ttl}</b> ${tq(tk)}<span class="tiny muted">${q}</span></div><ol>${list.map(r => { const o = other(r);
        return `<li><a href="/rank/${encodeURIComponent(r.sym)}">${esc(r.c.b.ko || r.sym)}</a><span class="num">${krUsd(r[key])}</span>${o ? `<span class="mcmp-o ${o[1]}">${esc(o[0])}</span>` : ""}</li>`; }).join("")}</ol></div>`; };
    const hTag = r => RH[r.sym] ? [`보유자 ${RH[r.sym]}위`, RH[r.sym] > 15 ? "far" : ""] : ["보유자 몫 0", "far"];
    const fTag = r => [`수수료 ${RF[r.sym] || "-"}위`, (RF[r.sym] || 99) - (RH[r.sym] || 99) >= 5 ? "up" : ""];
    // 눈여겨볼 차이 자동 문장
    const ins = [];
    MM.rows.filter(r => RF[r.sym] <= 10 && (!RH[r.sym] || RH[r.sym] - RF[r.sym] >= 10)).sort((a, b) => RF[a.sym] - RF[b.sym]).slice(0, 3).forEach(r =>
      ins.push(`<b>${esc(r.c.b.ko || r.sym)}</b>${eun(r.c.b.ko || r.sym)} 수수료 ${RF[r.sym]}위인데 보유자 몫은 ${RH[r.sym] ? RH[r.sym] + "위" : "없어요"} — ${r.arch === "pass" ? "수수료 대부분이 유동성 공급자·검증인 몫이에요." : r.arch === "vault" ? "번 돈을 금고에 쌓아 둬요(환원 결정이 나면 달라질 수 있어요)." : "쓰이는 만큼 토큰에 돈이 오지는 않아요."}`));
    MM.rows.filter(r => RH[r.sym] <= 10 && (RF[r.sym] || 99) - RH[r.sym] >= 5).sort((a, b) => RH[a.sym] - RH[b.sym]).slice(0, 2).forEach(r =>
      ins.push(`<b>${esc(r.c.b.ko || r.sym)}</b>${eun(r.c.b.ko || r.sym)} 수수료 ${RF[r.sym]}위지만 보유자 몫은 ${RH[r.sym]}위 — 버는 돈에 비해 아낌없이 돌려줘요${r.R > 0 ? (r.payout >= 1 ? "(매출보다 많이 — 기금까지 바이백에 써요)" : `(매출의 ${pct0(r.payout * 100)})`) : ""}.`));
    return `<div class="mcmp">${col("F", "많이 쓰이는 곳", "수수료 순", "fee", hTag)}${col("R", "많이 버는 곳", "매출 순", "rev", hTag)}${col("H", "많이 돌려주는 곳", "보유자 몫 순", "hold", fTag)}</div>
      ${ins.length ? `<div class="mins"><div class="mini-h">눈여겨볼 차이</div><ul>${ins.map(t => `<li>${t}</li>`).join("")}</ul></div>` : ""}`;
  }
  // ── 12개월 합계 (같은 달끼리 더함) — 12달 수수료 기록이 다 있는 코인만 ──
  function histSum(rows) {
    const acc = {}; let used = 0, last = -1;
    rows.forEach(r => { const h = r.hi && r.hi.h; if (!h || !Array.isArray(h[1]) || h[1].slice(0, 12).some(v => v == null)) return; used++;
      const base = Math.floor(h[0] / 100) * 12 + (h[0] % 100 - 1);
      for (let i = 0; i < 13; i++) { const a = acc[base + i] = acc[base + i] || [0, 0, 0]; a[0] += h[1][i] || 0; a[1] += (h[2] || [])[i] || 0; a[2] += (h[3] || [])[i] || 0; }
      last = Math.max(last, base + 12); });
    if (!used) return null;
    const first = last - 12, ser = [[], [], []];
    for (let k = first; k <= last; k++) { const a = acc[k]; for (let j = 0; j < 3; j++) ser[j].push(a ? a[j] : null); }
    return { h: [Math.floor(first / 12) * 100 + first % 12 + 1, ser[0], ser[1], ser[2]], used };
  }
  function moneyYear(MM) {
    const S = histSum(MM.rows), got = MM.rows.filter(r => r.hi).length;
    if (!S || S.used < 5) return `<div class="small muted">DefiLlama에서 코인마다 12개월 기록을 받는 중이에요(지금 ${got}개 / ${MM.rows.length}개 · 한 시간에 몇 개씩, 하루쯤 걸려요). 다 모이면 여기에 웹3 전체 수수료가 1년 동안 어떻게 변했는지 그려져요.</div>`;
    const hi = histInfo(S.h), F = S.h[1], H = S.h[3];
    const y12 = F.slice(0, 12).reduce((a, b) => a + (b || 0), 0) * 30.4, h12 = H.slice(0, 12).reduce((a, b) => a + (b || 0), 0) * 30.4;
    const best = F.slice(0, 12).indexOf(Math.max(...F.slice(0, 12))), bm = monthOf(S.h[0], best);
    return `${histChart(S.h, "12개월 전체 수수료·매출·보유자 몫")}${histLegend}
      <ul class="mr-v2"><li>기록이 다 있는 코인 ${S.used}개를 합치면 지난 12달 수수료는 약 <b>${krUsd(y12)}</b>, 그중 토큰 보유자 몫은 <b>${krUsd(h12)}</b>(${pct0(h12 / Math.max(y12, 1) * 100)})예요.</li>
        ${hi && hi.tr != null ? `<li>최근 3달 평균은 그 전 9달보다 <b class="${ppc(hi.tr)}">${pp(hi.tr)}</b> — 웹3 전체 '매출'이 ${hi.tr > 10 ? "커지는 중이에요" : hi.tr < -10 ? "줄어드는 중이에요" : "비슷한 수준이에요"}.</li>` : ""}
        <li>가장 많이 번 달은 ${bm.y}년 ${bm.m}월이에요. 수수료는 거래가 몰리는 강세장·급락장에 커지는 경향이 있어요.</li></ul>`;
  }
  function moneySecTrend(MM, secName) {
    const by = {}; MM.rows.forEach(r => (by[r.sec] = by[r.sec] || []).push(r));
    const list = Object.entries(by).map(([id, rows]) => ({ id, S: histSum(rows) })).filter(x => x.S).map(x => { const F = x.S.h[1], a3 = avgOf(F.slice(9, 12)), a9 = avgOf(F.slice(0, 9));
      return { ...x, tr: a3 && a9 ? (a3 / a9 - 1) * 100 : null, y: F.slice(0, 12).reduce((a, b) => a + (b || 0), 0) * 30.4 }; }).filter(x => x.tr != null && x.S.used >= 2).sort((a, b) => b.tr - a.tr);
    if (list.length < 4) return "";
    const k = Math.min(6, Math.floor(list.length / 2)), row = x => `<div class="mst-r"><span class="mst-n">${esc(secName[x.id] || x.id)}</span>${spark(x.S.h[1])}<b class="num ${ppc(x.tr)}">${pp(x.tr)}</b><span class="tiny muted">연 ${krUsd(x.y)} · 코인 ${x.S.used}개</span></div>`;
    return `<div class="mst"><div><div class="mini-h">커지는 곳</div>${list.slice(0, k).map(row).join("")}</div><div><div class="mini-h">줄어드는 곳</div>${list.slice(-k).reverse().map(row).join("")}</div></div>`;
  }
  // 수익과 가격이 엇갈리는 곳 — 수수료 성장(최근 30일 ÷ 1년 평균)과 가격 30일 변동이 반대
  function moneyDiverge(MM) {
    const pr = r => r.c.mk ? n(r.c.mk[7]) : null;
    const up = MM.rows.filter(r => r.growth != null && r.growth >= 15 && pr(r) != null && pr(r) <= -5 && !r.c.b.core).sort((a, b) => (b.growth - pr(b)) - (a.growth - pr(a))).slice(0, 6);
    const dn = MM.rows.filter(r => r.growth != null && r.growth <= -15 && pr(r) != null && pr(r) >= 5 && !r.c.b.core).sort((a, b) => (pr(b) - b.growth) - (pr(a) - a.growth)).slice(0, 6);
    if (!up.length && !dn.length) return "";
    const li = r => `<li><a href="/rank/${encodeURIComponent(r.sym)}">${esc(r.c.b.ko || r.sym)}</a> <span class="tiny muted">수수료 <b class="num ${ppc(r.growth)}">${pp(r.growth)}</b> · 가격 30일 <b class="num ${ppc(pr(r))}">${pp(pr(r))}</b>${r.H > 0 ? ` · 수익률 ${pct0(r.yield)}` : ""}</span></li>`;
    return `<div class="mdiv"><div><div class="mini-h">쓰임은 느는데 가격은 빠진 곳</div>${up.length ? `<ul>${up.map(li).join("")}</ul>` : '<div class="small muted">지금은 없어요.</div>'}</div>
      <div><div class="mini-h">가격은 올랐는데 쓰임은 줄어든 곳</div>${dn.length ? `<ul>${dn.map(li).join("")}</ul>` : '<div class="small muted">지금은 없어요.</div>'}</div></div>`;
  }
  // 1군인데 수수료 데이터가 없는 코인 — 왜 비어 있는지
  function moneyCoverage(M, MM) {
    const has = new Set(MM.rows.map(r => r.sym));
    const g1 = Object.values(M.coins).filter(c => c.lg === 1), miss = g1.filter(c => !has.has(c.sym));
    const why = c => c.sec === "meme" ? "밈 — 수수료 모델이 없어요" : NOFEE.has(c.sec) ? "화폐형 — 수수료는 채굴자 몫" : c.b.ll ? "DefiLlama 이름 확인 중" : c.sec === "cex" ? "거래소 장부 — 온체인 집계 안 됨" : "DefiLlama에 수수료 집계 없음";
    const grp = {}; miss.forEach(c => (grp[why(c)] = grp[why(c)] || []).push(c));
    return `<details class="panel more"><summary>1군 ${g1.length}개 중 ${g1.length - miss.length}개만 수수료 데이터가 있어요 — 나머지는 왜 비어 있나</summary><div class="more-body small">
      ${Object.entries(grp).map(([k, list]) => `<div><b>${esc(k)}</b> <span class="muted">${list.length}개</span><div>${list.map(c => `<a href="/rank/${encodeURIComponent(c.sym)}">${esc(c.b.ko || c.sym)}</a>`).join(" · ")}</div></div>`).join("")}
      <p class="legend">수수료가 없다고 나쁜 코인은 아니에요(비트코인처럼 화폐로 보유되는 코인, 밈처럼 관심이 가치인 코인). 다만 이 페이지의 '돈 버는' 기준으로는 잴 수 없어요.</p></div></details>`;
  }
  async function moneyPage() {
    nav("money"); setTitle("돈 버는 코인"); bindTerms();
    const [d, FH] = await Promise.all([get("/api/sectors"), feeHist()]);
    const M = sectorModel(d);
    const MM = moneyModel(M, FH), secName = Object.fromEntries(Object.values(M.sec).map(s => [s.id, s.name]));
    if (!MM.rows.length) { main().innerHTML = `<header class="head"><div class="eyebrow">돈 버는 코인</div><h1>웹3에서 실제로 돈을 버는 곳</h1></header><div class="empty">DefiLlama 수익 데이터를 받는 중이에요. 몇 시간 안에 채워져요.</div>`; return; }
    const T = MM.tot, top3 = MM.rows.slice().sort((a, b) => b.H - a.H).slice(0, 3), top3H = top3.reduce((s, r) => s + r.H, 0);
    const earners = MM.rows.filter(r => r.H > 0).length;
    const vault = MM.rows.filter(r => (r.arch === "vault" || (r.arch === "mix" && r.payout < 0.35)) && r.R > 0 && r.mcap && !r.c.b.core).filter(r => r.ryield >= 1).sort((a, b) => b.ryield - a.ryield).slice(0, 8);
    const archCount = Object.keys(ARCH).map(k => [k, MM.rows.filter(r => r.arch === k)]);
    const pref = loadMPref(); if (!MONEY_SORTS.some(x => x[0] === pref.sort)) pref.sort = "H";
    main().innerHTML = `<header class="head"><div class="eyebrow">돈 버는 코인</div><h1>웹3에서 실제로 돈을 버는 곳</h1>
      <p class="lead">스마트폰 시대의 돈은 결국 사람들이 매일 쓰는 앱이 벌었어요. 웹3도 같다고 보면, 봐야 할 건 세 가지예요 — <b>사람들이 실제로 돈을 내는가</b>(수수료), <b>그 돈을 프로토콜이 가져가는가</b>(매출), <b>그게 토큰을 가진 사람에게 돌아오는가</b>(보유자 몫).</p>
      <div class="stamp">DefiLlama 수수료·매출·보유자 수익${M.feesAt ? ` · ${kst(M.feesAt)}` : ""} · 시세 코인마켓캡 · 모든 금액은 1년치로 환산 ${tq("ann")}</div></header>
      <section class="mguide panel"><div class="mini-h">처음이라면 이렇게 읽어요</div>
        <ol><li><b>가게로 생각해요.</b> 코인(프로토콜)은 가게, 사용자는 손님, 토큰 보유자는 주주예요. 손님이 많이 와도(수수료) 주주에게 배당이 없으면(보유자 몫 0) 주식(토큰)값이 오를 이유가 약해요.</li>
          <li><b><a href="#m-cmp">순위 비교</a></b>에서 "많이 쓰이는 곳"과 "많이 돌려주는 곳"이 얼마나 다른지 봐요.</li>
          <li><b><a href="#m-map-s">지도</a></b>의 왼쪽 위 칸(싸고 성장하는 곳)에 있는 코인을 찾아요.</li>
          <li><b><a href="#m-list-s">코인별 보기</a></b>에서 줄을 펼쳐 '주의할 점'(언락·유통 비율)까지 확인해요. 모르는 말은 <span class="tq-demo">?</span>를 누르면 풀이가 나와요.</li></ol></section>
      ${moneyExample(MM)}
      <section class="mstats">
        <div class="panel"><span class="tiny muted">추적 코인의 연 수수료 ${tq("fee")}</span><b class="num">${krUsd(T.F)}</b><span class="tiny muted">코인 ${MM.rows.length}개</span></div>
        <div class="panel"><span class="tiny muted">그중 보유자에게 가는 몫 ${tq("hold")}</span><b class="num">${pct0(T.H / T.F * 100)}</b><span class="tiny muted">연 ${krUsd(T.H)} · ${earners}개 코인</span></div>
        <div class="panel"><span class="tiny muted">보유자 몫 상위 3개 비중</span><b class="num">${pct0(top3H / Math.max(T.H, 1) * 100)}</b><span class="tiny muted">${top3.map(r => esc(r.c.b.ko || r.sym)).join(" · ")}</span></div>
        <div class="panel"><span class="tiny muted">전체 평균 보유자 수익률 ${tq("yield")}</span><b class="num">${pct0(T.H / Math.max(T.mcap, 1) * 100)}</b><span class="tiny muted">100만 원당 연 ${wonPer(T.H / Math.max(T.mcap, 1) * 100)}</span></div>
      </section>
      <section class="section" id="m-cmp"><div class="sec-head"><h2>순위 비교 — 많이 쓰이는 곳 ≠ 많이 돌려주는 곳</h2><span class="sub">같은 코인도 기준에 따라 순위가 크게 달라요</span></div>
        <div class="panel">${moneyCompare(MM)}
        <p class="legend">왼쪽 두 줄의 오른쪽 작은 글씨는 그 코인의 '보유자 몫' 순위, 오른쪽 줄은 '수수료' 순위예요. 순위 차이가 크면 "쓰이는 것"과 "토큰에 돈이 오는 것"이 따로 놀고 있다는 뜻이에요.</p></div></section>
      <section class="section" id="m-year"><div class="sec-head"><h2>1년 흐름 — 웹3의 '매출'은 커지고 있나</h2><span class="sub">달마다 한 달 환산 · 막대에 올리면 자세히</span></div>
        <div class="panel mwrap" id="m-yr">${moneyYear(MM)}
        ${moneySecTrend(MM, secName) ? `<div class="mini-h" style="margin-top:12px">섹터별 수수료 추세 (최근 3달 vs 그 전 9달) ${tq("trend")}</div>${moneySecTrend(MM, secName)}` : ""}
        <p class="legend">DefiLlama 일별 수수료를 달마다 하루 평균으로 모아 30을 곱했어요. 12개월 기록이 다 있는 코인만 더해서, 새로 생긴 코인은 빠져 있어요.</p></div></section>
      <section class="section"><div class="sec-head"><h2>돈이 어디서 나오나 — 섹터별</h2><span class="sub">막대에 손가락·마우스를 올리면 자세히</span></div>
        <div class="panel mwrap" id="m-sec">${moneySecChart(MM, secName)}
        <p class="legend">한 막대 안에서 연한 부분이 사용자가 낸 수수료 전체 ${tq("fee")}, 중간이 프로토콜 매출 ${tq("rev")}, 진한 부분이 토큰 보유자에게 간 몫 ${tq("hold")}이에요. 수수료가 커도 진한 부분이 작으면 그 섹터는 "쓰이긴 하는데 토큰엔 돈이 잘 안 오는" 곳이에요.</p></div></section>
      <section class="section"><div class="sec-head"><h2>돈이 토큰에 돌아오는 방식 ${tq("arch")}</h2><span class="sub">같은 수수료라도 구조에 따라 토큰 가치가 달라요</span></div>
        <div class="march">${archCount.map(([k, list]) => `<div class="panel"><b>${ARCH[k][0]}</b> <span class="num muted">${list.length}개</span><p class="small muted">${esc(ARCH[k][1])}</p><div class="small">${list.sort((a, b) => b.F - a.F).slice(0, 4).map(r => esc(r.c.b.ko || r.sym)).join(" · ") || "-"}</div></div>`).join("")}</div></section>
      <section class="section" id="m-map-s"><div class="sec-head"><h2>싸고 성장하는 코인 지도</h2><span class="sub">보유자 몫이 있는 코인만 · 점에 올리면 자세히</span></div>
        <div class="panel mwrap" id="m-map">${moneyScatter(MM) || '<div class="small muted">점을 찍을 코인이 아직 부족해요.</div>'}
        <p class="legend">가로는 시총 ÷ 1년 보유자 몫 ${tq("pe")} — 왼쪽일수록 버는 돈에 비해 싸요. 세로는 수수료 성장 ${tq("growth")} — 위일수록 요즘 더 많이 쓰여요. 왼쪽 위 칸(20배 이하 = 수익률 연 5% 이상, 그리고 성장 중)이 가장 매력적인 자리예요. 진한 점은 1군, 이름은 보유자 몫이 큰 코인 몇 개만 붙였어요.</p></div></section>
      ${moneyDiverge(MM) ? `<section class="section"><div class="sec-head"><h2>쓰임과 가격이 엇갈리는 곳</h2><span class="sub">수수료 성장(최근 30일 ÷ 1년 평균) vs 가격 30일</span></div>
        <div class="panel">${moneyDiverge(MM)}<p class="legend">왼쪽은 사람들이 더 많이 쓰는데 가격은 빠진 곳, 오른쪽은 가격은 올랐는데 쓰임은 줄어든 곳이에요. 가격이 언젠가 쓰임을 따라간다고 보면 눈여겨볼 만하지만, 수수료가 늘어난 이유(일시적 이벤트·인센티브)를 꼭 확인해야 해요. 투자 권유가 아니에요.</p></div></section>` : ""}
      ${vault.length ? `<section class="section"><div class="sec-head"><h2>환원 결정이 나오면 달라질 코인 ${tq("fswitch")}</h2><span class="sub">매출은 큰데 보유자 몫이 작은 곳</span></div>
        <div class="panel"><div class="mvault">${vault.map(r => `<a href="/rank/${encodeURIComponent(r.sym)}"><b>${esc(r.c.b.ko || r.sym)}</b><span class="tiny muted">${esc(secName[r.sec] || r.sec)}</span><span class="num">매출 ${krUsd(r.R)}</span><span class="small">다 돌려주면 연 <b class="num">${pct0(r.ryield)}</b><span class="tiny muted"> (지금 ${pct0(r.yield)})</span></span><span class="tiny muted">100만 원당 ${wonPer(r.yield)} → ${wonPer(r.ryield)}</span></a>`).join("")}</div>
        <p class="legend">유니스왑의 '수수료 스위치'처럼, 프로토콜 매출을 바이백·분배로 돌리기로 결정되면 토큰의 수익률이 바로 바뀌어요. 이런 거버넌스 투표가 대표적인 급등 재료예요. 실제로 결정될지는 각 프로토콜 거버넌스를 확인해야 해요.</p></div></section>` : ""}
      <section class="section" id="m-list-s"><div class="sec-head"><h2>코인별로 보기</h2><span class="sub">무엇으로 줄 세울지 고르고, 줄을 누르면 자세히 펼쳐져요</span></div>
        <div class="msorts" role="group" aria-label="줄 세우는 기준">${MONEY_SORTS.map(([k, l]) => `<button type="button" class="fchip" data-ms="${k}">${l}</button>`).join("")}</div>
        <div class="mq" id="m-q"></div>
        <div class="ctl" id="m-ctl"><label class="sel">섹터 <select id="m-sec-f"><option value="">전체</option>${MM.secs.map(s => `<option value="${esc(s.id)}">${esc(secName[s.id] || s.id)}</option>`).join("")}</select></label>
          <label class="chk"><input type="checkbox" id="m-t150"> 150위까지만</label><label class="chk"><input type="checkbox" id="m-up"> 업비트 원화만</label><label class="chk"><input type="checkbox" id="m-major"> 1군만</label></div>
        <div class="panel mwrap" id="m-list"></div></section>
      ${moneyCoverage(M, MM)}
      <details class="panel more" id="m-gloss"><summary>용어 풀이 전체 보기 (가게·주식으로 비유)</summary><div class="more-body small mgl">
        ${Object.values(GLOSS).map(([t, x]) => `<div><b>${esc(t)}</b><p>${esc(x)}</p></div>`).join("")}
        <div><b>한계</b><p>거래소 토큰(BNB·OKB 등)의 바이백, 오프체인 매출은 잘 안 잡혀요. 체인 수수료 소각은 스테이킹 발행과 함께 봐야 실제 희석을 알 수 있어요. 수수료에는 인센티브로 되돌려 준 돈이 섞여 있을 수 있어요. 바이백은 현금 배당이 아니라 토큰 가치로 돌아와요. 투자 권유가 아니에요.</p></div></div></details>`;
    const draw = () => {
      $("m-sec-f").value = pref.sec || ""; $("m-t150").checked = !!pref.t150; $("m-up").checked = !!pref.up; $("m-major").checked = !!pref.major;
      document.querySelectorAll("[data-ms]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ms === pref.sort)));
      const S = MONEY_SORTS.find(x => x[0] === pref.sort) || MONEY_SORTS[2];
      $("m-q").innerHTML = `<b>${esc(S[2])}</b> ${tq(S[4])}<span class="small muted">${esc(S[3])}</span>`;
      const key = pref.sort, val = { H: r => r.H, R: r => r.R, yield: r => r.yield, fyield: r => r.fyield, pe: r => r.pe ? -r.pe : -1e15, growth: r => r.growth ?? -1e9, F: r => r.F, payout: r => r.R > 0 ? r.payout : -1,
        steady: r => r.hi && r.hi.cv != null ? -r.hi.cv : -1e9, tr3: r => r.hi && r.hi.tr != null ? r.hi.tr : -1e9 }[key] || (r => r.H);
      const list = MM.rows.filter(r => (!pref.sec || r.sec === pref.sec) && (!pref.t150 || (r.c.crank > 0 && r.c.crank <= 150)) && (!pref.up || r.c.ex.up) && (!pref.major || r.c.lg === 1))
        .filter(r => key === "pe" || key === "yield" || key === "fyield" ? r.H > 0 : key === "payout" ? r.R > 0 : key === "R" ? r.R > 0 : key === "steady" ? r.hi && r.hi.cv != null : key === "tr3" ? r.hi && r.hi.tr != null : true).sort((a, b) => val(b) - val(a));
      $("m-list").innerHTML = list.length ? list.map((r, i) => moneyRow(r, i, key, secName)).join("") : `<div class="empty small">${(key === "steady" || key === "tr3") && !MM.rows.some(r => r.hi && r.hi.cv != null) ? "12개월 기록을 받는 중이에요 — 하루쯤 지나면 이 순서로 볼 수 있어요." : "조건에 맞는 코인이 없어요."}</div>`;
      moneyTip($("m-list"));
      saveMPref(pref);
    };
    document.querySelectorAll("[data-ms]").forEach(b => b.addEventListener("click", () => { pref.sort = b.dataset.ms; draw(); }));
    $("m-sec-f").addEventListener("change", e => { pref.sec = e.target.value; draw(); });
    [["m-t150", "t150"], ["m-up", "up"], ["m-major", "major"]].forEach(([id, k]) => $(id).addEventListener("change", e => { pref[k] = e.target.checked; draw(); }));
    draw(); moneyTip($("m-sec")); if ($("m-map")) moneyTip($("m-map")); moneyTip($("m-yr")); openHash();
  }

  async function route() {
    const p = location.pathname.replace(/\.html$/, "");
    let m;
    try {
      if (p === "/" || p === "/index") return await reportPage(null);
      if ((m = p.match(/^\/r\/([\w-]+)$/))) return await reportPage(m[1]);
      if (p === "/track") return await trackPage();
      if (p === "/coin" || p === "/coin/" || p === "/coin/index") return await coinsPage();
      if ((m = p.match(/^\/coin\/([\w-]+)$/))) return await coinPage(m[1].toUpperCase());
      if (p === "/weekly" || p === "/weekly/" || p === "/weekly/index") return await weeklyPage(null);
      if ((m = p.match(/^\/weekly\/([\w-]+)$/))) return await weeklyPage(m[1]);
      if (p === "/map") return await mapPage();
      if (p === "/sectors" || p === "/sectors/") return await sectorsPage();
      if (p === "/money" || p === "/money/") return await moneyPage();
      if ((m = p.match(/^\/rank\/([^/]+)\/?$/))) return await rankCoinPage(decodeURIComponent(m[1]).toUpperCase());
      nav(""); main().innerHTML = `<div class="empty">페이지를 찾지 못했어요. <a href="/">최신 리포트로 가기</a></div>`;
    } catch (e) {
      main().innerHTML = `<div class="empty">내용을 불러오지 못했어요. 잠시 후 새로고침해 주세요.<br><span class="tiny muted">${esc(e.message || e)}</span></div>`;
    }
  }
  document.addEventListener("click", e => { const a = e.target.closest && e.target.closest('a[href^="#c-"]'); if (!a) return; const el = document.getElementById(a.getAttribute("href").slice(1)); if (el) { e.preventDefault(); if (el.tagName === "DETAILS") el.open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); history.replaceState(null, "", a.getAttribute("href")); } });
  setInterval(() => document.querySelectorAll(".age[data-ts]").forEach(el => { const a = ago(Number(el.dataset.ts)); if (a) { el.textContent = a.t; el.className = "age age-" + a.c; } }), 60000);
  if (SITE.disclosure) { const f = $("disclosure"); if (f) f.textContent = SITE.disclosure; }
  route();
})();
