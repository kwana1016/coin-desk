"""AI 코인 리서치센터 — 정적 사이트 생성기.

사용: 저장소 루트에서  python3 tools/build_site.py
입력: site.json, data/reports/*.json, data/weekly/*.json, data/ecosystem.json, tools/theme.css
출력: public/ (index, r/, track, coin/, weekly/, map, feed.json)
외부 라이브러리 없음 (파이썬 3.8+).
"""
import glob
import html
import json
import math
import os
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KST = timezone(timedelta(hours=9))
WD = "월화수목금토일"
ORDER = {"강력관심": 0, "관심": 1, "중립": 2, "주의": 3}
RSTAR = {"강력관심": 5, "관심": 4, "중립": 3, "주의": 1}
HZ = [("24h", "24시간"), ("3d", "3일"), ("7d", "7일")]
HZ_NAME = dict(HZ)
CSS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "theme.css"), encoding="utf-8").read()
FONTS = ("https://fonts.googleapis.com/css2?family=Hahmlet:wght@600;700&family=IBM+Plex+Sans+KR:wght@400;500;600;700"
         "&family=IBM+Plex+Mono:wght@400;500;600&display=swap")


# ── 작은 도우미 ─────────────────────────────────────
def e(x):
    return html.escape("" if x is None else str(x), quote=True)


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def won(x):
    x = num(x)
    if x is None:
        return "-"
    if x >= 100:
        return f"{round(x):,}원"
    if x >= 1:
        return f"{x:,.2f}원"
    return f"{x:.4f}원"


def won_short(x):
    x = num(x)
    if x is None or x < 1e8:
        return won(x)
    eok = int(x // 1e8)
    man = round((x - eok * 1e8) / 1e4)
    return f"{eok}억" + (f" {man:,}만" if man else "") + "원"


def pct(x, d=1):
    x = num(x)
    if x is None:
        return "-"
    v = x * 100
    return f"{'+' if v > 0 else ''}{v:.{d}f}%"


def cls(x):
    x = num(x)
    if x is None:
        return ""
    return "rise" if x > 0 else ("fall" if x < 0 else "")


def chg(x, suffix=""):
    return f'<span class="chg {cls(x)}">{pct(x)}{suffix}</span>'


def kst(ms):
    d = datetime.fromtimestamp(ms / 1000, KST)
    return f"{d.month}/{d.day}({WD[d.weekday()]}) {d:%H:%M}"


def kst_date(ms):
    d = datetime.fromtimestamp(ms / 1000, KST)
    return f"{d.month}/{d.day}"


def coin_stars(p):
    n = num(p.get("stars"))
    if n is not None and 1 <= round(n) <= 5:
        return int(round(n))
    return RSTAR.get(p.get("rating"), 3)


def news_stars(n):
    k = num(n.get("stars"))
    if k is not None and 1 <= round(k) <= 5:
        return int(round(k))
    s = num(n.get("score"))
    return 1 if s is None else max(1, min(5, math.ceil(s / 2)))


def star_html(k, label):
    off = f'<span class="off">{"☆" * (5 - k)}</span>' if k < 5 else ""
    return f'<span class="stars" role="img" aria-label="{e(label)}">{"★" * k}{off}</span>'


def rt(rating):
    return f'<span class="rt rt-{e(rating)}">{e(rating)}</span>'


def hz_of(x):
    return x.get("h") or "24h"


# ── 카드 조각 ───────────────────────────────────────
def ladder(lv, price):
    if not lv or num(lv.get("stop")) is None or num(lv.get("target1")) is None or num(price) is None:
        return ""
    price = num(price)
    stop, t1 = num(lv["stop"]), num(lv["target1"])
    lo_z, hi_z = num(lv.get("entry_low")), num(lv.get("entry_high"))
    t2 = num(lv.get("target2"))
    vals = [v for v in (stop, lo_z, hi_z, t1, t2, price) if v is not None]
    lo, hi = min(vals) * 0.99, max(vals) * 1.01

    def P(v):
        return (v - lo) / (hi - lo) * 100

    zl = lo_z if lo_z is not None else price
    zh = hi_z if hi_z is not None else price
    segs = (f'<div class="seg s-loss" style="left:0;width:{P(zl):.2f}%"></div>'
            f'<div class="seg s-gain" style="left:{P(zh):.2f}%;width:{max(0, P(t1) - P(zh)):.2f}%"></div>')
    if t2 is not None:
        segs += f'<div class="seg s-gain2" style="left:{P(t1):.2f}%;width:{max(0, P(t2) - P(t1)):.2f}%"></div>'
    segs += f'<div class="seg s-zone" style="left:{P(zl):.2f}%;width:{max(1.2, P(zh) - P(zl)):.2f}%"></div>'
    ticks = f'<div class="tk stop" style="left:{P(stop):.2f}%"></div><div class="tk tgt" style="left:{P(t1):.2f}%"></div>'
    if t2 is not None:
        ticks += f'<div class="tk tgt" style="left:{P(t2):.2f}%"></div>'
    now_left = min(96, max(4, P(price)))
    label = f"손절 {won(stop)}, 진입 {won(zl)}~{won(zh)}, 현재 {won(price)}, 1차 목표 {won(t1)}"
    tgt = won(t1) + (f" · {won(t2)}" if t2 is not None else "")
    tgt_pct = pct(lv.get("t1_pct")) + (f" · {pct(lv.get('t2_pct'))}" if lv.get("t2_pct") is not None else "")
    foot = []
    if lv.get("rr") is not None:
        foot.append(f"손익비 {num(lv['rr']):.1f}")
    if lv.get("weight") is not None:
        foot.append(f"비중 상한 계좌의 {round(num(lv['weight']) * 100)}%")
    return (f'<div class="ladder"><div class="ladder-title"><span>가격 구간</span><span>왼쪽 손절 · 가운데 진입 · 오른쪽 목표</span></div>'
            f'<div class="lrail" role="img" aria-label="{e(label)}">{segs}{ticks}'
            f'<div class="now" style="left:{now_left:.2f}%"><span>지금</span><i></i></div></div>'
            f'<div class="lvals"><div class="lv l-stop"><b>손절</b><span class="num">{won(stop)}</span><small>{pct(lv.get("stop_pct"))}</small></div>'
            f'<div class="lv l-zone"><b>진입 구간</b><span class="num">{won(zl)}~</span><small>{won(zh)}</small></div>'
            f'<div class="lv l-tgt"><b>목표 1·2</b><span class="num">{tgt}</span><small>{tgt_pct}</small></div></div>'
            + (f'<div class="lfoot">{" · ".join(foot)}</div>' if foot else "") + '</div>')


def metrics(p):
    m = p.get("metrics") or {}
    items = [("1주", m.get("chg_1w"), True), ("4주", m.get("chg_4w"), True),
             ("52주 고점 대비", m.get("from_hi52"), True), ("주간 변동폭", m.get("wk_range"), False)]
    cells = ""
    for k, v, signed in items:
        if v is None:
            continue
        val = pct(v) if signed else "%.0f%%" % (num(v) * 100)
        cells += f'<div class="m"><b>{k}</b><span class="{cls(v) if signed else ""}">{val}</span></div>'
    return f'<div class="mgrid">{cells}</div>' if cells else ""


def tags(p):
    t = f'<span class="tag">{e(p["position"])}</span>' if p.get("position") else ""
    if p.get("__new"):
        t += '<span class="tag new">새 코인</span>'
    return f'<div class="c-tags">{t}</div>' if t else ""


def card(p, base, links, anchor=True):
    k = coin_stars(p)
    sym = p["sym"]
    name = e(p.get("name") or sym)
    name_html = f'<a href="{base}coin/{e(sym)}.html">{name}</a>' if sym in links else name
    reasons = "".join(f"<li>{e(r)}</li>" for r in p.get("reasons") or [])
    scen = ""
    if p.get("bull") or p.get("bear"):
        scen = '<div class="scen">'
        if p.get("bull"):
            scen += f'<div class="bull"><b>오르는 경우</b>{e(p["bull"])}</div>'
        if p.get("bear"):
            scen += f'<div class="bear"><b>내리는 경우</b>{e(p["bear"])}</div>'
        scen += "</div>"
    counter = f'<div class="counter"><b>반대 의견</b>{e(p["counter"])}</div>' if p.get("counter") else ""
    more = ""
    if p.get("invalidation"):
        more += f'<div><div class="mini-h">이 판단이 틀리는 조건</div>{e(p["invalidation"])}</div>'
    if p.get("checklist"):
        more += '<div><div class="mini-h">사기 전 체크리스트</div><ul>' + "".join(f"<li>{e(x)}</li>" for x in p["checklist"]) + "</ul></div>"
    if p.get("related"):
        rows = "".join(f'<div>{star_html(news_stars(x), "중요도 별 %d개" % news_stars(x))}<span>{e(x.get("title"))}</span></div>'
                       for x in p["related"][:3])
        more += f'<div class="related"><div class="mini-h">관련 뉴스</div>{rows}</div>'
    more = f'<details class="more"><summary>틀리는 조건 · 체크리스트 · 관련 뉴스</summary><div class="more-body">{more}</div></details>' if more else ""
    since = f'<div class="since"><b>지난 리포트 이후</b>{e(p["since_last"])}</div>' if p.get("since_last") else ""
    aid = f' id="c-{e(sym)}"' if anchor else ""
    return f"""<article class="card"{aid}>
<div class="c-head"><div class="c-id"><div class="c-name">{name_html}<span class="sym">{e(sym)}</span></div>{tags(p)}</div>
<div class="c-verdict">{rt(p.get("rating"))}{star_html(k, f"별 {k}개 (5점 만점)")}</div></div>
<div class="c-price"><span class="p num">{won(p.get("price"))}</span>{chg(p.get("chg24"), " 24h")}</div>
{f'<p class="c-what">{e(p["what"])}</p>' if p.get("what") else ""}
{since}
{f'<p class="c-comment">{e(p["comment"])}</p>' if p.get("comment") else ""}
{metrics(p)}
{f'<ul class="reasons">{reasons}</ul>' if reasons else ""}
{ladder(p.get("levels"), p.get("price"))}
{scen}{counter}{more}
</article>"""


def folded(p, base, links):
    k = coin_stars(p)
    line = p.get("comment") or ""
    new = '<span class="tag new">새 코인</span>' if p.get("__new") else ""
    return (f'<details class="fold" id="c-{e(p["sym"])}"><summary><span class="f-name"><b>{e(p.get("name") or p["sym"])}</b>'
            f'<span class="num tiny muted">{e(p["sym"])}</span>{new}</span>'
            f'<span class="f-right">{rt(p.get("rating"))}{star_html(k, "별 %d개" % k)}</span>'
            f'<span class="f-line"><span class="num">{won(p.get("price"))}</span>{chg(p.get("chg24"))}<span>{e(line)}</span></span></summary>'
            f'{card(dict(p, __new=False), base, links, anchor=False)}</details>')


# ── 리포트 조각 ─────────────────────────────────────
def glance(picks, cautions, base):
    def row(p, caution=False):
        k = 1 if caution else coin_stars(p)
        rating = "주의" if caution else p.get("rating")
        sub = [star_html(k, "별 %d개" % k)]
        if not caution and p.get("position"):
            sub.append(e(p["position"]))
        if p.get("__new"):
            sub.append('<span class="tag new">새 코인</span>')
        m = (p.get("metrics") or {}).get("chg_1w")
        if m is not None:
            sub.append(f'1주 <span class="num {cls(m)}">{pct(m)}</span>')
        if caution and p.get("reason"):
            r = p["reason"]
            sub.append(e(r if len(r) <= 46 else r[:46] + "…"))
        price = f'<span class="num">{won_short(p.get("price"))}</span>{chg(p.get("chg24"))}' if p.get("price") is not None else ""
        return (f'<a class="g-row" href="#c-{e(p["sym"])}"><span class="g-name"><b>{e(p.get("name") or p["sym"])}</b>'
                f'<span class="sym">{e(p["sym"])}</span></span>'
                f'<span class="g-price">{price}</span>{rt(rating)}'
                f'<span class="g-sub">{sub[0]} {" · ".join(sub[1:])}</span></a>')
    strong = [p for p in picks if p.get("rating") in ("강력관심", "관심")]
    rest = [p for p in picks if p.get("rating") not in ("강력관심", "관심")]
    out = ""
    if strong:
        out += '<div class="g-group">관심</div>' + "".join(row(p) for p in strong)
    if rest:
        out += '<div class="g-group">지켜볼 코인</div>' + "".join(row(p) for p in rest)
    if cautions:
        out += '<div class="g-group">주의</div>' + "".join(row(c, True) for c in cautions)
    return f'<div class="glance">{out}</div>'


def fng_meter(f):
    v = num(f.get("value"))
    if v is None:
        return ""
    prev = f' · 전일 {e(f["prev"])}' if f.get("prev") is not None else ""
    return (f'<div class="stat fng"><div class="fng-top"><b>공포탐욕 지수</b><span class="small muted">{e(f.get("label", ""))}{prev}</span></div>'
            f'<div class="v num">{int(v)}</div>'
            f'<div class="fng-bar" role="img" aria-label="공포탐욕 {int(v)} / 100"><i></i><i></i><i></i><i></i><i></i>'
            f'<span class="fng-mark" style="left:{max(0, min(100, v)):.0f}%"></span></div>'
            f'<div class="fng-scale"><span>극단적 공포</span><span>중립</span><span>극단적 탐욕</span></div></div>')


def market(m):
    tiles = ""
    if m.get("btc"):
        tiles += (f'<div class="stat"><b>비트코인</b><div class="v num">{won_short(m["btc"].get("price"))}</div>'
                  f'<div>{chg(m["btc"].get("chg"), " 24h")}</div></div>')
    if m.get("fng"):
        tiles += fng_meter(m["fng"])
    watch = "".join(f"<li>{e(w)}</li>" for w in m.get("watch") or [])
    note = ""
    if m.get("summary") or watch:
        summ = f'<p>{e(m["summary"])}</p>' if m.get("summary") else ""
        note = (f'<div class="panel mkt-note"><h3>시장 요약</h3>{summ}'
                + (f'<div class="mini-h">이번에 지켜볼 것</div><ul class="watch">{watch}</ul>' if watch else "") + '</div>')
    if not tiles and not note:
        return ""
    return f'<section class="section" id="market"><div class="mkt">{tiles}</div>{note}</section>'


def brief(r):
    b = r.get("brief") or {}
    pts = [x for x in (b.get("points") or []) if x]
    if not pts:
        return ""
    lis = "".join(f"<li><span>{e(x)}</span></li>" for x in pts[:3])
    return (f'<section class="brief" id="brief"><div class="sec-head"><h2>60초 브리핑</h2><span class="sub">오늘 꼭 알아야 할 3가지</span></div>'
            f'<ol>{lis}</ol></section>')


def alerts(r):
    al = r.get("alerts") or []
    if not al:
        return ""
    rows = ""
    for a in al[:3]:
        t = e(a.get("title"))
        if (a.get("url") or "").startswith("http"):
            t = f'<a href="{e(a["url"])}" target="_blank" rel="noopener">{t}</a>'
        rows += f'<div>{t}<div class="small muted">{e(a.get("summary") or a.get("impact") or "")}</div></div>'
    return f'<section class="alert" role="alert"><b>★5 긴급 소식</b>{rows}</section>'


def news_block(news):
    if not news:
        return ""

    def title(n, cls_="ntitle"):
        url = n.get("url") or ""
        if url.startswith("http"):
            return f'<a class="{cls_}" href="{e(url)}" target="_blank" rel="noopener">{e(n.get("title"))}</a>'
        return f'<span class="{cls_}">{e(n.get("title"))}</span>'

    def meta(n):
        tone = n.get("tone") or "중립"
        coins = ", ".join(n.get("coins") or []) or "시장 전체"
        out = '<span class="tag new">새 소식</span>' if n.get("new") else ""
        out += f'<span class="tone tone-{e(tone)}">{e(tone)}</span>'
        if n.get("category"):
            out += f'<span class="tag cat">{e(n["category"])}</span>'
        out += f"<span>{e(coins)} · {e(n.get('source', ''))}{' · ' + e(n['time']) if n.get('time') else ''}</span>"
        return f'<div class="nmeta">{out}</div>'

    def body(n):
        out = ""
        if n.get("summary"):
            out += f'<p class="nsum">{e(n["summary"])}</p>'
        elif n.get("note"):
            out += f'<p class="nsum">{e(n["note"])}</p>'
        if n.get("impact"):
            out += f'<div class="nimpact"><b>영향</b>{e(n["impact"])}</div>'
        if n.get("priced_in"):
            out += f'<div class="priced">가격 반영: {e(n["priced_in"])}</div>'
        return out

    tops = ""
    for n in news[:3]:
        k = news_stars(n)
        s = n.get("score")
        tops += (f'<article class="ntop"><div class="nscore"><span class="n">{e(s) if s is not None else "-"}</span>'
                 f'{star_html(k, "중요도 %s점, 별 %d개" % (s, k))}<small>/10</small></div>'
                 f'<div class="nbody">{title(n)}{meta(n)}{body(n)}</div></article>')
    rest = ""
    for n in news[3:]:
        k = news_stars(n)
        rest += (f'<details class="nrow"><summary>{star_html(k, "중요도 별 %d개" % k)}<span class="t">{e(n.get("title"))}</span>{meta(n)}</summary>'
                 f'<div class="nrow-body">{body(n)}{title(n, "small") if (n.get("url") or "").startswith("http") else ""}</div></details>')
    rest = f'<div class="nlist">{rest}</div>' if rest else ""
    return (f'<section class="section" id="news"><div class="sec-head"><h2>뉴스 {len(news)}건</h2><span class="sub">중요도 순 · 위 3건은 핵심</span></div>'
            f'<div class="news">{tops}</div>{rest}</section>')


def cautions_block(cz, base, links):
    if not cz:
        return ""
    items = ""
    for c in cz:
        nm = e(c.get("name") or c["sym"])
        if c["sym"] in links:
            nm = f'<a href="{base}coin/{e(c["sym"])}.html">{nm}</a>'
        pr = f'<span class="row"><span class="num small">{won(c.get("price"))}</span>{chg(c.get("chg24"))}</span>' if c.get("price") is not None else ""
        items += (f'<div class="cz-item" id="c-{e(c["sym"])}"><div class="cz-top"><span class="row">{nm}<span class="num tiny muted">{e(c["sym"])}</span>{rt("주의")}</span>{pr}</div>'
                  f'<p>{e(c.get("reason"))}</p></div>')
    return f'<section class="section"><div class="sec-head"><h2>주의 코인</h2><span class="sub">리스크관리부</span></div><div class="cz">{items}</div></section>'


def track_table(items, base, links):
    if not items:
        return ""
    rows = ""
    for x in items:
        stars = star_html(x["stars"], "별 %d개" % x["stars"]) if x.get("stars") else "-"
        result = '<td class="rise">적중</td>' if x.get("hit") else '<td class="fall">빗나감</td>'
        sym = f'<a href="{base}coin/{e(x["sym"])}.html">{e(x["sym"])}</a>' if x["sym"] in links else e(x["sym"])
        rows += (f'<tr><td>{sym}</td><td>{e(x.get("rating"))}</td><td>{stars}</td><td>{e(x.get("from", "-"))}</td>'
                 f'<td><span class="hz">{HZ_NAME.get(hz_of(x), hz_of(x))}</span></td>'
                 f'<td class="num {cls(x.get("ret"))}">{pct(x.get("ret"))}</td>'
                 f'<td class="num {cls(x.get("vs_btc"))}">{pct(x.get("vs_btc"))}</td>{result}</tr>')
    return (f'<div class="tbl"><table><thead><tr><th>코인</th><th>등급</th><th>별점</th><th>코멘트 시점</th><th>기간</th><th>수익률</th>'
            f'<th>BTC 대비</th><th>결과</th></tr></thead><tbody>{rows}</tbody></table></div>')


def report_page(r, site, archive, is_index, prev, links):
    m = r.get("market") or {}
    base = "" if is_index else "../"
    prev_syms = set()
    if prev:
        prev_syms = {q["sym"] for q in prev.get("picks") or []} | {q["sym"] for q in prev.get("cautions") or []}
    picks = sorted(r.get("picks") or [], key=lambda p: ORDER.get(p.get("rating"), 9))
    if prev:
        picks = [dict(p, __new=p["sym"] not in prev_syms) for p in picks]
    cz = [dict(c, __new=bool(prev) and c["sym"] not in prev_syms) for c in r.get("cautions") or []]
    n_new = sum(1 for p in picks if p.get("__new"))
    n_pos = len({p.get("position") for p in picks if p.get("position")})
    cover = f"코인 {len(picks)}개" + (f" · 새 코인 {n_new}개" if prev else "") + (f" · 분야 {n_pos}곳" if n_pos else "")
    strong = [p for p in picks if p.get("rating") in ("강력관심", "관심")]
    rest = [p for p in picks if p.get("rating") not in ("강력관심", "관심")]
    cards = "".join(card(p, base, links) for p in strong) or '<div class="empty">이번 리포트에는 관심 코인이 없어요.</div>'
    folds = "".join(folded(p, base, links) for p in rest)
    tk = r.get("track") or {}
    track = ""
    if tk.get("summary") or tk.get("items"):
        track = (f'<section class="section"><div class="sec-head"><h2>이번에 채점한 코멘트</h2><a class="small" href="{base}track.html">전체 성적표</a></div>'
                 f'<p class="small" style="margin:0">{e(tk.get("summary", ""))}</p>'
                 f'<div class="panel">{track_table(tk.get("items") or [], base, links) or "<span class=small>아직 채점할 코멘트가 없어요.</span>"}</div></section>')
    arch = "".join(
        f'<a href="{base}r/{e(a["id"])}.html"{" aria-current=page" if a["id"] == r["__id"] else ""}>{e(kst(a["ts"]))}</a>'
        for a in archive[:30])
    old_notice = "" if is_index else f'<div class="notice">지난 리포트예요 ({e(kst(r["ts"]))}). <a href="../">최신 리포트 보기</a></div>'
    regime = f'<span class="chip regime-{e(m.get("regime"))}">{e(m.get("regime"))}</span>' if m.get("regime") else ""
    title = site.get("title", "AI 코인 리서치센터")
    body = f"""<header class="head">
<div class="head-top"><div class="eyebrow">{e(title)} · 코인 코멘트</div>{regime}</div>
<h1>{e(m.get("headline") or title)}</h1>
<div class="stamp">{e(kst(r["ts"]))} 작성 · {cover}</div>
</header>
{old_notice}
{alerts(r)}
{brief(r)}
<section class="section" id="glance"><div class="sec-head"><h2>한눈에 보기</h2><span class="sub">누르면 해당 코인으로 이동</span></div>{glance(picks, cz, base)}
<p class="legend">별점 ★5 강력관심 · ★4 관심 · ★3 관심(약)·중립(좋은 편) · ★2 중립 · ★1 주의. 등락 색은 업비트처럼 상승 빨강, 하락 파랑이에요.</p></section>
{market(m)}
<section class="section" id="picks"><div class="sec-head"><h2>관심 코인 {len(strong)}개</h2><span class="sub">운용부</span></div><div class="cards">{cards}</div></section>
{f'<section class="section"><div class="sec-head"><h2>지켜볼 코인 {len(rest)}개</h2><span class="sub">눌러서 펼치기</span></div><div class="cards">{folds}</div></section>' if rest else ""}
{cautions_block(cz, base, links)}
{news_block(r.get("news") or [])}
{track}
{f'<section class="section"><h2>지난 리포트</h2><div class="archive">{arch}</div></section>' if len(archive) > 1 else ""}"""
    desc = m.get("headline") or "AI가 뉴스와 시세를 보고 쓰는 코인 코멘트"
    return shell(site, title if is_index else f"{kst(r['ts'])} 리포트", desc, body, 0 if is_index else 1,
                 "latest" if is_index else "", extra_js=OPEN_JS)


OPEN_JS = """<script>
function openHash(){var h=location.hash.slice(1);if(!h)return;var el=document.getElementById(h);if(el&&el.tagName==='DETAILS'){el.open=true;}}
window.addEventListener('hashchange',openHash);openHash();
</script>"""

CHART_JS = """<script>
document.querySelectorAll('.chart[data-points]').forEach(function(box){
  var pts=JSON.parse(box.getAttribute('data-points')); var svg=box.querySelector('svg'); var tip=box.querySelector('.tip');
  var xh=svg.querySelector('.xh'), hl=svg.querySelector('.hl'); var vb=svg.viewBox.baseVal;
  function show(i){ var p=pts[i]; var r=svg.getBoundingClientRect(); var sx=r.width/vb.width, sy=r.height/vb.height;
    xh.setAttribute('x1',p.x);xh.setAttribute('x2',p.x);xh.style.opacity=1; hl.setAttribute('cx',p.x);hl.setAttribute('cy',p.y);hl.style.opacity=1;
    tip.textContent=p.t; var bw=box.clientWidth, tw=tip.offsetWidth, left=p.x*sx;
    left=Math.max(tw/2, Math.min(bw-tw/2, left)); tip.style.left=left+'px'; tip.style.top=(p.y*sy-10)+'px'; tip.style.opacity=1; }
  function hide(){ xh.style.opacity=0; hl.style.opacity=0; tip.style.opacity=0; }
  function near(ev){ var r=svg.getBoundingClientRect(); var cx=((ev.touches?ev.touches[0].clientX:ev.clientX)-r.left)/r.width*vb.width;
    var b=0,d=1e9; pts.forEach(function(p,i){var k=Math.abs(p.x-cx); if(k<d){d=k;b=i;}}); return b; }
  var hit=svg.querySelector('.hit'); hit.addEventListener('mousemove',function(e){show(near(e));}); hit.addEventListener('mouseleave',hide);
  hit.addEventListener('touchstart',function(e){show(near(e));},{passive:true}); hit.addEventListener('touchmove',function(e){show(near(e));},{passive:true});
});
</script>"""


def line_chart(points, fmt_y, zero=False, label=""):
    """points: [(x(ms), y, tooltip)] 시간순. 단일 계열 선 차트 + 옅은 면."""
    if len(points) < 2:
        return ""
    W, H, L, R, T, B = 420, 210, 62, 10, 14, 26
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    lo, hi = min(ys), max(ys)
    if zero:
        lo, hi = min(lo, 0), max(hi, 0)
    pad = (hi - lo) * 0.08 or abs(hi) * 0.05 or 1
    lo, hi = lo - pad, hi + pad
    x0, x1 = min(xs), max(xs)

    def X(v):
        return L + (v - x0) / ((x1 - x0) or 1) * (W - L - R)

    def Y(v):
        return T + (hi - v) / ((hi - lo) or 1) * (H - T - B)

    grid = ""
    for i in range(4):
        v = lo + (hi - lo) * i / 3
        y = Y(v)
        grid += (f'<line class="grid" x1="{L}" x2="{W - R}" y1="{y:.1f}" y2="{y:.1f}"/>'
                 f'<text class="axis" x="{L - 6}" y="{y + 4:.1f}" text-anchor="end">{e(fmt_y(v))}</text>')
    if zero and lo < 0 < hi:
        grid += f'<line class="zero" x1="{L}" x2="{W - R}" y1="{Y(0):.1f}" y2="{Y(0):.1f}"/>'
    xl = (f'<text class="axis" x="{L}" y="{H - 6}" text-anchor="start">{e(kst_date(x0))}</text>'
          f'<text class="axis" x="{W - R}" y="{H - 6}" text-anchor="end">{e(kst_date(x1))}</text>')
    path = " ".join(f"{'M' if i == 0 else 'L'}{X(x):.1f},{Y(y):.1f}" for i, (x, y, _) in enumerate(points))
    base_y = Y(max(lo, min(0, hi))) if zero else H - B
    area = f'M{X(xs[0]):.1f},{base_y:.1f} ' + path.replace("M", "L", 1) + f' L{X(xs[-1]):.1f},{base_y:.1f} Z'
    dots = "".join(f'<circle class="dot" cx="{X(x):.1f}" cy="{Y(y):.1f}" r="4"/>' for x, y, _ in points) if len(points) <= 40 else ""
    data = json.dumps([{"x": round(X(x), 1), "y": round(Y(y), 1), "t": t} for x, y, t in points], ensure_ascii=False)
    return (f'<div class="chart" data-points="{e(data)}"><svg viewBox="0 0 {W} {H}" role="img" aria-label="{e(label)}">{grid}{xl}'
            f'<path class="area" d="{area}"/><path class="line" d="{path}"/>{dots}<line class="xh" x1="0" x2="0" y1="{T}" y2="{H - B}"/>'
            f'<circle class="hl" cx="0" cy="0" r="5"/><rect class="hit" x="{L}" y="0" width="{W - L - R}" height="{H}"/></svg>'
            f'<div class="tip"></div></div>')


NAV = (("latest", "", "최신 리포트"), ("weekly", "weekly/", "주간 요약"), ("track", "track.html", "성적표"),
       ("coins", "coin/", "코인별"), ("map", "map.html", "생태계 지도"))


def shell(site, title, desc, body, depth, active, charts=False, extra_js=""):
    base = "../" * depth
    name = site.get("title", "AI 코인 리서치센터")
    nav = "".join(f'<a href="{base}{href}"{" aria-current=page" if key == active else ""}>{label}</a>' for key, href, label in NAV)
    disclosure = f"<div>{e(site['disclosure'])}</div>" if site.get("disclosure") else ""
    full_title = name if title == name else f"{title} · {name}"
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{e(full_title)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:title" content="{e(full_title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>{CSS}</style></head>
<body><div class="wrap">
<nav class="nav" aria-label="사이트 메뉴">{nav}</nav>
{body}
<footer>
  <div>AI가 공개 뉴스와 업비트 시세로 자동 작성한 참고용 코멘트예요. 투자 권유가 아니며, 매매 판단과 책임은 본인에게 있어요.</div>
  {disclosure}
</footer>
</div>{CHART_JS if charts else ""}{extra_js}</body></html>"""


# ── 데이터 모으기 ─────────────────────────────────
def collect(reports_asc):
    by_id = {r["__id"]: r for r in reports_asc}
    comments = {}
    for r in reports_asc:
        for p in r.get("picks") or []:
            comments.setdefault(p["sym"], []).append({
                "id": r["__id"], "ts": r["ts"], "name": p.get("name") or p["sym"], "rating": p.get("rating"),
                "stars": coin_stars(p), "price": p.get("price"), "chg24": p.get("chg24"), "comment": p.get("comment"),
                "reasons": p.get("reasons") or [], "position": p.get("position"), "results": []})
        for c in r.get("cautions") or []:
            comments.setdefault(c["sym"], []).append({
                "id": r["__id"], "ts": r["ts"], "name": c.get("name") or c["sym"], "rating": "주의", "stars": 1,
                "price": c.get("price"), "chg24": c.get("chg24"), "comment": c.get("reason"), "reasons": [],
                "position": None, "results": []})
    scored, seen = [], set()
    for r in reports_asc:
        for x in (r.get("track") or {}).get("items") or []:
            if not x.get("sym") or x.get("ret") is None:
                continue
            key = (x["sym"], x.get("from_id") or x.get("from"), hz_of(x))
            if key in seen:
                continue
            seen.add(key)
            item = dict(x)
            item["h"] = hz_of(x)
            item["scored_ts"] = r["ts"]
            if not item.get("stars"):
                src = by_id.get(x.get("from_id") or "")
                hit = None
                if src:
                    for p in src.get("picks") or []:
                        if p["sym"] == x["sym"]:
                            hit = coin_stars(p)
                    if hit is None and any(c["sym"] == x["sym"] for c in src.get("cautions") or []):
                        hit = 1
                item["stars"] = hit or RSTAR.get(x.get("rating"), 3)
            scored.append(item)
            for c in comments.get(item["sym"], []):
                if item.get("from_id") and c["id"] == item["from_id"]:
                    c["results"].append(item)
    return comments, scored


def agg(items):
    n = len(items)
    if not n:
        return None
    hits = sum(1 for x in items if x.get("hit"))
    avg = sum(num(x.get("vs_btc")) or 0 for x in items) / n
    return {"n": n, "hits": hits, "rate": hits / n, "avg": avg}


# ── 성적표 ───────────────────────────────────────
def track_page(site, scored, links):
    intro = ('<div class="stamp">관심·주의 코멘트가 24시간·3일·7일 뒤 비트코인보다 잘했는지 채점해요. '
             '관심류는 BTC보다 더 오르면, 주의는 BTC보다 못하면 적중이에요.</div>')
    if not scored:
        body = (f'<header class="head"><div class="eyebrow">회고부</div><h1>코멘트 성적표</h1>{intro}</header>'
                '<div class="empty">아직 채점된 코멘트가 없어요.<br>코멘트를 쓰고 하루가 지나면 첫 결과가 올라와요.</div>')
        return shell(site, "코멘트 성적표", "AI 코인 코멘트의 적중률", body, 0, "track")
    tiles = ""
    for h, label in HZ:
        a = agg([x for x in scored if x["h"] == h])
        if a:
            tiles += (f'<div class="tile"><b>{label} 뒤</b><div class="v num">{a["rate"] * 100:.0f}%</div>'
                      f'<div class="s">{a["hits"]}/{a["n"]} 적중 · BTC 대비 <span class="{cls(a["avg"])}">{pct(a["avg"])}</span></div></div>')
        else:
            tiles += f'<div class="tile"><b>{label} 뒤</b><div class="v num muted">-</div><div class="s">아직 채점 전</div></div>'
    rows = ""
    for k in (5, 4, 3, 2, 1):
        cells = ""
        for h, _ in HZ:
            g = agg([x for x in scored if x.get("stars") == k and x["h"] == h])
            cells += f'<td class="num">{"%.0f%% <span class=muted>(%d/%d)</span>" % (g["rate"] * 100, g["hits"], g["n"]) if g else "-"}</td>'
        rows += f"<tr><td>{star_html(k, '별 %d개' % k)}</td>{cells}</tr>"
    table = (f'<div class="tbl"><table><thead><tr><th>별점</th>{"".join("<th>" + l + " 뒤</th>" for _, l in HZ)}</tr></thead>'
             f'<tbody>{rows}</tbody></table></div>')
    bars = ""
    day = [x for x in scored if x["h"] == "24h"]
    for k in (5, 4, 3, 2, 1):
        g = agg([x for x in day if x.get("stars") == k])
        label = star_html(k, f"별 {k}개")
        if not g:
            bars += f'<div class="bar-row"><span>{label}</span><div class="bar-track"><span class="bar-half"></span></div><span class="muted small">표본 없음</span></div>'
            continue
        bars += (f'<div class="bar-row"><span>{label}</span><div class="bar-track" role="img" aria-label="적중률 {g["rate"] * 100:.0f}%">'
                 f'<div class="bar-fill" style="width:{g["rate"] * 100:.1f}%"></div><span class="bar-half"></span></div>'
                 f'<span class="num">{g["rate"] * 100:.0f}% <span class="muted">({g["hits"]}/{g["n"]})</span></span></div>')
    batches = {}
    for x in day:
        batches.setdefault(x["scored_ts"], []).append(x)
    pts, cum = [], 0.0
    for ts in sorted(batches):
        grp = batches[ts]
        add = sum(num(x.get("vs_btc")) or 0 for x in grp)
        cum += add
        pts.append((ts, cum * 100, f"{kst(ts)} · {len(grp)}건, 이번 {add * 100:+.1f}%p → 누적 {cum * 100:+.1f}%p"))
    chart = line_chart(pts, lambda v: f"{v:+.0f}%p", zero=True, label="24시간 기준 BTC 대비 초과수익 누적") if len(pts) >= 2 else ""
    recent = sorted(scored, key=lambda x: x["scored_ts"], reverse=True)[:40]
    body = f"""<header class="head"><div class="eyebrow">회고부</div><h1>코멘트 성적표</h1>{intro}</header>
<section class="tiles">{tiles}</section>
<section class="panel section"><h2>별점별 적중률 (24시간)</h2><div class="bars">{bars}</div>
<p class="legend">가운데 세로선이 50%예요. 별이 많을수록 적중률도 높아야 별점을 믿을 수 있어요. 표본이 적을 때는 참고만 하세요.</p></section>
<section class="panel section"><h2>기간별로 보면</h2>{table}<p class="legend">짧게는 맞고 길게는 틀리는지, 그 반대인지 볼 수 있어요.</p></section>
{f'<section class="panel section"><h2>BTC 대비 초과수익 누적 (24시간)</h2>{chart}<p class="legend">채점된 코멘트의 BTC 대비 수익률(%p)을 차례로 더한 값이에요. 오른쪽 위로 갈수록 시장보다 잘한 거예요.</p></section>' if chart else ""}
<section class="panel section"><h2>최근 채점 {len(recent)}건</h2>{track_table(recent, "", links)}</section>"""
    a = agg(day) or agg(scored)
    desc = f"채점 {len(scored)}건 · 24시간 적중률 {a['rate'] * 100:.0f}%"
    return shell(site, "코멘트 성적표", desc, body, 0, "track", charts=bool(chart))


# ── 코인별 ───────────────────────────────────────
def coin_page(site, sym, entries):
    entries = sorted(entries, key=lambda c: c["ts"])
    last = entries[-1]
    name = last["name"]
    done = [x for c in entries for x in c["results"]]
    pts = [(c["ts"], num(c["price"]), f'{kst(c["ts"])} · {won(c["price"])} · {c["rating"]} ★{c["stars"]}')
           for c in entries if num(c.get("price")) is not None]
    chart = line_chart(pts, lambda v: won(v).replace("원", ""), label=f"{name} 코멘트 시점 가격") if len(pts) >= 2 else ""
    tl = ""
    for c in reversed(entries):
        res = ""
        for x in sorted(c["results"], key=lambda x: [h for h, _ in HZ].index(x["h"]) if x["h"] in HZ_NAME else 9):
            verdict = '<b class="rise">적중</b>' if x.get("hit") else '<b class="fall">빗나감</b>'
            res += (f'<div class="res"><span class="hz">{HZ_NAME.get(x["h"], x["h"])} 뒤</span>{chg(x.get("ret"))}'
                    f'<span>BTC 대비 <span class="num {cls(x.get("vs_btc"))}">{pct(x.get("vs_btc"))}</span></span>{verdict}</div>')
        reasons = "".join(f"<li>{e(r)}</li>" for r in c.get("reasons") or [])
        reasons = f'<ul class="reasons">{reasons}</ul>' if reasons else ""
        comment = f'<p>{e(c["comment"])}</p>' if c.get("comment") else ""
        tl += (f'<div class="tl"><div class="tl-top"><a class="small" href="../r/{e(c["id"])}.html">{e(kst(c["ts"]))}</a>'
               f'<span class="row">{rt(c["rating"])}{star_html(c["stars"], "별 %d개" % c["stars"])}</span></div>'
               f'<div class="row"><span class="num small">{won(c.get("price"))}</span>{chg(c.get("chg24"), " 24h")}</div>'
               f'{comment}{reasons}{res}</div>')
    a = agg([x for x in done if x["h"] == "24h"])
    rate = "%.0f%%" % (a["rate"] * 100) if a else "-"
    rate_sub = "%d/%d 적중 (24시간)" % (a["hits"], a["n"]) if a else "아직 채점 전"
    tiles = (f'<div class="tile"><b>최근 별점</b><div class="v">{star_html(last["stars"], "별 %d개" % last["stars"])}</div><div class="s">{e(last["rating"])} · {e(kst(last["ts"]))}</div></div>'
             f'<div class="tile"><b>코멘트 횟수</b><div class="v num">{len(entries)}번</div><div class="s">처음 {e(kst(entries[0]["ts"]))}</div></div>'
             f'<div class="tile"><b>채점 결과</b><div class="v num">{rate}</div><div class="s">{rate_sub}</div></div>')
    pos = next((c["position"] for c in reversed(entries) if c.get("position")), "")
    body = f"""<header class="head"><div class="eyebrow">코인별 기록{" · " + e(pos) if pos else ""}</div><h1>{e(name)} <span class="muted num" style="font-size:15px">{e(sym)}</span></h1>
<div class="stamp">이 코인이 받은 코멘트와 별점, 24시간·3일·7일 뒤 결과를 시간순으로 모았어요.</div></header>
<section class="tiles">{tiles}</section>
{f'<section class="panel section"><h2>코멘트 시점 가격</h2>{chart}<p class="legend">점 하나가 코멘트 하나예요. 눌러서 그때의 등급과 별점을 볼 수 있어요.</p></section>' if chart else ""}
<section class="section"><h2>코멘트 기록</h2><div class="timeline">{tl}</div></section>"""
    desc = f"{name} 최근 코멘트: {last['rating']} ★{last['stars']} ({kst(last['ts'])})"
    return shell(site, f"{name}({sym})", desc, body, 1, "coins", charts=bool(chart))


def coins_index(site, comments):
    rows = []
    for sym, entries in comments.items():
        last = max(entries, key=lambda c: c["ts"])
        a = agg([x for c in entries for x in c["results"] if x["h"] == "24h"])
        rows.append((last["ts"], sym, last, len(entries), a))
    rows.sort(key=lambda t: (-t[0], -t[2]["stars"]))
    trs = ""
    for ts, sym, last, n, a in rows:
        hit = "%.0f%% (%d/%d)" % (a["rate"] * 100, a["hits"], a["n"]) if a else "-"
        trs += (f'<tr><td><a href="{e(sym)}.html">{e(last["name"])}</a> <span class="muted num tiny">{e(sym)}</span></td>'
                f'<td>{star_html(last["stars"], "별 %d개" % last["stars"])}</td><td>{rt(last["rating"])}</td><td class="num">{n}번</td><td class="num">{hit}</td>'
                f'<td class="num">{e(kst(ts))}</td></tr>')
    body = f"""<header class="head"><div class="eyebrow">코인별 기록</div><h1>코멘트한 코인 {len(rows)}개</h1>
<div class="stamp">코인 이름을 누르면 그 코인의 코멘트 기록과 결과를 볼 수 있어요. 최근 코멘트 순이에요.</div></header>
<section class="panel"><div class="tbl"><table><thead><tr><th>코인</th><th>최근 별점</th><th>등급</th><th>코멘트</th><th>적중 (24시간)</th><th>최근</th></tr></thead>
<tbody>{trs}</tbody></table></div></section>"""
    return shell(site, "코인별 기록", "AI 코인 코멘트를 받은 코인 목록과 기록", body, 1, "coins")


# ── 주간 요약 ─────────────────────────────────────
def weekly_body(w, base, links):
    tiles = ""
    for k, label in (("reports", "리포트"), ("coins", "다룬 코인"), ("news", "다룬 뉴스")):
        v = (w.get("counts") or {}).get(k)
        if v is not None:
            tiles += f'<div class="tile"><b>{label}</b><div class="v num">{e(v)}</div></div>'
    trk = ""
    for h, label in HZ:
        t = (w.get("track") or {}).get(h)
        if t and t.get("n"):
            trk += (f'<div class="tile"><b>{label} 뒤 적중률</b><div class="v num">{num(t.get("rate", 0)) * 100:.0f}%</div>'
                    f'<div class="s">{e(t.get("hits"))}/{e(t.get("n"))} · BTC 대비 <span class="{cls(t.get("avg"))}">{pct(t.get("avg"))}</span></div></div>')
    top = ""
    for i, c in enumerate(w.get("top") or [], 1):
        nm = e(c.get("name") or c.get("sym"))
        if c.get("sym") in links:
            nm = f'<a href="{base}coin/{e(c["sym"])}.html">{nm}</a>'
        k = int(round(num(c.get("avg_stars")) or 3))
        top += (f'<div class="rank-row"><span class="no">{i}</span><span class="nm"><b>{nm} <span class="num tiny muted">{e(c.get("sym"))}</span></b>'
                f'<span>{e(c.get("note") or "")}</span></span>'
                f'<span class="row" style="justify-content:flex-end">{star_html(k, "평균 별 %d개" % k)}'
                f'<span class="tiny muted">{e(c.get("count"))}번</span>{chg(c.get("chg_week")) if c.get("chg_week") is not None else ""}</span></div>')
    sectors = ""
    secs = w.get("sectors") or []
    mx = max([num(s.get("count")) or 0 for s in secs] or [1]) or 1
    for s in secs[:8]:
        c = num(s.get("count")) or 0
        sectors += (f'<div class="bar-row"><span class="small">{e(s.get("name"))}</span><div class="bar-track"><div class="bar-fill" style="width:{c / mx * 100:.0f}%"></div></div>'
                    f'<span class="num small">{int(c)}번</span></div>')
    story = ""
    if w.get("link_story"):
        ls = w["link_story"]
        story = f'<div class="story"><b>LINK 스토리 · {e(ls.get("verdict", ""))}</b><span>{e(ls.get("text", ""))}</span></div>'
    cal = "".join(f'<div class="cal-row"><span class="d">{e(x.get("date"))}</span><span>{e(x.get("event"))}'
                  f'{" · " + e(", ".join(x.get("coins") or [])) if x.get("coins") else ""}</span></div>' for x in w.get("next_week") or [])
    nxt = "".join(f'<li>{e(x)}</li>' for x in w.get("watch_next") or [])
    lessons = "".join(f"<li>{e(x)}</li>" for x in w.get("lessons") or [])
    return f"""<header class="head"><div class="eyebrow">주간 요약 · {e(w.get("label", ""))}</div><h1>{e(w.get("headline", "이번 주 코인 요약"))}</h1>
<div class="stamp">{e(kst(w["ts"]))} 작성</div></header>
{f'<section class="brief"><p style="margin:0">{e(w["summary"])}</p></section>' if w.get("summary") else ""}
{f'<section class="tiles">{tiles}</section>' if tiles else ""}
{f'<section class="panel section"><h2>이번 주 가장 주목한 코인</h2><div class="rank">{top}</div><p class="legend">리포트에 나온 횟수와 평균 별점, 한 주 가격 변화예요.</p></section>' if top else ""}
{f'<section class="panel section"><h2>많이 다룬 분야</h2><div class="bars">{sectors}</div></section>' if sectors else ""}
{f'<section class="section"><h2>이번 주 성적</h2><div class="tiles">{trk}</div></section>' if trk else ""}
{story}
{f'<section class="panel section"><h2>다음 주 일정</h2><div class="cal">{cal}</div></section>' if cal else ""}
{f'<section class="panel section"><h2>다음 주에 지켜볼 것</h2><ul class="watch">{nxt}</ul></section>' if nxt else ""}
{f'<section class="panel section"><h2>이번 주 교훈</h2><ul class="watch">{lessons}</ul></section>' if lessons else ""}"""


def weekly_pages(site, weeklies, links):
    """weeklies: 최신순. weekly/index.html(최신) + weekly/<id>.html"""
    out = {}
    arch = lambda cur: "".join(
        f'<a href="{e(w["__id"])}.html"{" aria-current=page" if w["__id"] == cur else ""}>{e(w.get("label") or w["__id"])}</a>' for w in weeklies)
    for i, w in enumerate(weeklies):
        body = weekly_body(w, "../", links) + (f'<section class="section"><h2>지난 주간 요약</h2><div class="archive">{arch(w["__id"])}</div></section>' if len(weeklies) > 1 else "")
        out[w["__id"]] = shell(site, f"주간 요약 {w.get('label', '')}", w.get("headline", "주간 요약"), body, 1, "weekly")
    if weeklies:
        out["index"] = out[weeklies[0]["__id"]]
    else:
        body = ('<header class="head"><div class="eyebrow">주간 요약</div><h1>주간 요약</h1></header>'
                '<div class="empty">첫 주간 요약은 일요일 밤에 올라와요.</div>')
        out["index"] = shell(site, "주간 요약", "한 주 코인 코멘트 요약", body, 1, "weekly")
    return out


# ── 생태계 지도 ───────────────────────────────────
MAP_JS = """<script>
(function(){var m=document.getElementById('map');var bs=document.querySelectorAll('.lvl button');
function set(l){m.className='map stack lv-'+l;bs.forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.l===l));});
document.querySelectorAll('.lvl-desc').forEach(function(p){p.hidden=p.dataset.l!==l;});try{localStorage.setItem('mapLevel',l);}catch(e){}}
bs.forEach(function(b){b.addEventListener('click',function(){set(b.dataset.l);});});
var s='1';try{s=localStorage.getItem('mapLevel')||'1';}catch(e){} if(/^[123]$/.test(location.hash.slice(1)))s=location.hash.slice(1); set(s);})();
</script>"""


def map_page(site, eco, latest, links):
    lv = eco.get("levels") or {}
    btns = "".join(f'<button type="button" data-l="{k}" aria-pressed="{"true" if k == "1" else "false"}">{e(v.get("name"))}</button>' for k, v in sorted(lv.items()))
    descs = "".join(f'<p class="lvl-desc stamp" data-l="{k}"{"" if k == "1" else " hidden"}>{e(v.get("desc"))}</p>' for k, v in sorted(lv.items()))
    layers = ""
    for i, L in enumerate(eco.get("layers") or [], 1):
        chips = ""
        secs = ""
        for s in L.get("sectors") or []:
            first = (s.get("leaders") or [{}])[0]
            if first.get("sym"):
                nm = e(first.get("name") or first["sym"])
                chips += (f'<a href="coin/{e(first["sym"])}.html">{nm}</a>' if first["sym"] in links else f"<span>{nm}</span>")
            leaders = ""
            for j, c in enumerate(s.get("leaders") or [], 1):
                sym = c.get("sym", "")
                nm = e(c.get("name") or sym)
                nm = f'<a href="coin/{e(sym)}.html">{nm}</a>' if sym in links else f"<b>{nm}</b>"
                lt = latest.get(sym)
                badge = f'{rt(lt["rating"])}' if lt else ""
                leaders += (f'<div class="leader"><span class="rk">{j}</span><span>{nm} <span class="num tiny muted">{e(sym)}</span>{badge}</span>'
                            f'<span class="why">{e(c.get("why"))}</span></div>')
            secs += (f'<div class="sector"><h3>{e(s.get("name"))}</h3><div class="w2">웹2로 치면 · {e(s.get("web2"))}</div>'
                     f'<div class="leaders">{leaders}</div>'
                     f'<div class="drivers need-3"><span><b>움직이는 재료</b> {e(s.get("drivers"))}</span><span><b>주의할 점</b> {e(s.get("risk"))}</span></div></div>')
        layers += (f'<section class="layer"><div class="layer-head"><h2>{i}층 · {e(L.get("name"))}</h2><span class="w2">웹2로 치면 {e(L.get("web2"))}</span></div>'
                   f'<p class="layer-desc">{e(L.get("desc"))}</p>'
                   f'<div class="chips1 only-1">{chips}</div>'
                   f'<div class="sectors need-2">{secs}</div></section>')
    flows = "".join(f'<div class="flow"><b>{e(f.get("from"))}</b><span class="arrow">→</span><b>{e(f.get("to"))}</b><span class="tag">{e(f.get("what"))}</span>'
                    f'<span class="fx">{e(f.get("why"))}</span></div>' for f in eco.get("flows") or [])
    body = f"""<header class="head"><div class="eyebrow">생태계 지도</div><h1>코인 세계를 6층 건물로 보면</h1>
<div class="stamp">분야마다 우리가 아는 서비스(웹2)에 빗대고, 대표 코인과 이유를 붙였어요.</div></header>
<div class="section"><div class="lvl" role="group" aria-label="난이도">{btns}</div>{descs}</div>
<div id="map" class="map stack lv-1">
{layers}
<section class="layer need-3"><div class="layer-head"><h2>분야끼리 이렇게 연결돼요</h2></div><div class="flows">{flows}</div></section>
</div>
<p class="legend">{e(eco.get("note", ""))} 등급 표시는 최근 리포트 기준이에요. 기준일 {e(eco.get("updated", ""))}.</p>"""
    return shell(site, "코인 생태계 지도", "코인 세계를 6층으로 나눠 분야별 대표 코인과 연결을 보여주는 지도", body, 0, "map", extra_js=MAP_JS)


# ── 쓰기 ─────────────────────────────────────────
def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def load_dir(sub):
    out = []
    for path in glob.glob(os.path.join(ROOT, "data", sub, "*.json")):
        try:
            d = json.load(open(path, encoding="utf-8"))
        except (OSError, ValueError) as ex:
            print("건너뜀:", path, ex)
            continue
        d["__id"] = os.path.splitext(os.path.basename(path))[0]
        if isinstance(d.get("ts"), (int, float)):
            out.append(d)
    return sorted(out, key=lambda d: d["ts"])


def main():
    site_path = os.path.join(ROOT, "site.json")
    site = json.load(open(site_path, encoding="utf-8")) if os.path.exists(site_path) else {}
    reports = load_dir("reports")
    weeklies = sorted(load_dir("weekly"), key=lambda d: d["ts"], reverse=True)
    eco_path = os.path.join(ROOT, "data", "ecosystem.json")
    eco = json.load(open(eco_path, encoding="utf-8")) if os.path.exists(eco_path) else {}
    out = os.path.join(ROOT, "public")
    if not reports:
        print("리포트 없음")
        return
    comments, scored = collect(reports)
    links = set(comments)
    newest = sorted(reports, key=lambda r: r["ts"], reverse=True)
    archive = [{"id": r["__id"], "ts": r["ts"]} for r in newest]
    for i, r in enumerate(newest):
        prev = newest[i + 1] if i + 1 < len(newest) else None
        write(os.path.join(out, "r", r["__id"] + ".html"), report_page(r, site, archive, False, prev, links))
    write(os.path.join(out, "index.html"), report_page(newest[0], site, archive, True, newest[1] if len(newest) > 1 else None, links))
    write(os.path.join(out, "track.html"), track_page(site, scored, links))
    write(os.path.join(out, "coin", "index.html"), coins_index(site, comments))
    for sym, entries in comments.items():
        write(os.path.join(out, "coin", sym + ".html"), coin_page(site, sym, entries))
    for key, text in weekly_pages(site, weeklies, links).items():
        write(os.path.join(out, "weekly", key + ".html"), text)
    latest = {}
    for sym, entries in comments.items():
        last = max(entries, key=lambda c: c["ts"])
        latest[sym] = last
    if eco:
        write(os.path.join(out, "map.html"), map_page(site, eco, latest, links))
    feed_latest = {k: v for k, v in newest[0].items() if k != "__id"}
    with open(os.path.join(out, "feed.json"), "w", encoding="utf-8") as f:
        json.dump({"latest_id": newest[0]["__id"], "latest": feed_latest, "archive": archive[:60],
                   "track": {h: agg([x for x in scored if x["h"] == h]) for h, _ in HZ}, "coins": sorted(comments),
                   "weekly": [w["__id"] for w in weeklies[:20]]}, f, ensure_ascii=False)
    print(f"완료: 리포트 {len(reports)}개, 주간 {len(weeklies)}개, 코인 {len(comments)}개, 채점 {len(scored)}건 → public/")


if __name__ == "__main__":
    main()
