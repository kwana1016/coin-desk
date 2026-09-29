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
    const items = [["latest", "/", "최신 리포트"], ["weekly", "/weekly/", "주간 요약"], ["track", "/track", "성적표"], ["coins", "/coin/", "코인별"], ["map", "/map", "생태계 지도"]];
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

  // ── 라우팅 ──
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
