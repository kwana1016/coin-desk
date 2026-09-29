"""AI 코인 리서치센터 — 정적 사이트 생성기.

사용: 저장소 루트에서  python3 tools/build_site.py
입력: site.json, data/reports/*.json (예약 실행이 쓰는 리포트)
출력: public/index.html (최신), public/r/<id>.html (지난 리포트), public/feed.json
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


def e(x):
    return html.escape("" if x is None else str(x), quote=True)


def won(x):
    if x is None:
        return "-"
    x = float(x)
    if x >= 100:
        return f"{round(x):,}원"
    if x >= 1:
        return f"{x:,.2f}원"
    return f"{x:.4f}원"


def won_short(x):
    x = float(x)
    if x < 1e8:
        return won(x)
    eok = int(x // 1e8)
    man = round((x - eok * 1e8) / 1e4)
    return f"{eok}억" + (f" {man:,}만" if man else "") + "원"


def pct(x, d=1):
    if x is None:
        return "-"
    v = float(x) * 100
    return f"{'+' if v > 0 else ''}{v:.{d}f}%"


def cls(x):
    if x is None:
        return ""
    return "up" if float(x) > 0 else ("down" if float(x) < 0 else "")


def kst(ms):
    d = datetime.fromtimestamp(ms / 1000, KST)
    return f"{d.month}/{d.day}({WD[d.weekday()]}) {d:%H:%M}"


CSS = """
:root{--bg:#eef1f4;--paper:#fff;--ink:#18202b;--muted:#5d6877;--line:#d9dee5;--accent:#23408e;--accent-soft:#e3e9f7;
--strong:#0e7a4f;--buy:#2459c8;--neutral:#6b7380;--warn:#b42318;--strong-soft:#e2f3eb;--buy-soft:#e4ecfb;--neutral-soft:#eceef1;--warn-soft:#fbe8e6;--star:#c47f00;--star-off:#d5dae1;
--font-body:"IBM Plex Sans KR",-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
--font-num:"IBM Plex Mono",ui-monospace,"SFMono-Regular",Menlo,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#12161c;--paper:#1a2029;--ink:#e7ebf0;--muted:#98a2b0;--line:#2b3340;--accent:#8fa9f0;
--accent-soft:#222c40;--strong:#3fc38b;--buy:#79a2ff;--neutral:#9aa3af;--warn:#ff8a7e;--strong-soft:#173327;--buy-soft:#1c2842;
--neutral-soft:#232932;--warn-soft:#3a1f1d;--star:#f2b640;--star-off:#3a4350;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:15px;line-height:1.6}
.wrap{max-width:720px;margin:0 auto;padding-inline:16px;padding-block:20px 56px;display:flex;flex-direction:column;gap:18px}
.num{font-family:var(--font-num);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
h1{font-size:22px;line-height:1.3;margin:0;font-weight:700;text-wrap:balance}
h2{font-size:13px;margin:0;font-weight:600;letter-spacing:.06em;color:var(--muted)}
.eyebrow{font-size:12px;letter-spacing:.08em;color:var(--muted);font-weight:500}
.panel{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px}
.section{display:flex;flex-direction:column;gap:10px}
.small{font-size:13px}.muted{color:var(--muted)}
.head{display:flex;flex-direction:column;gap:8px}
.head-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.chip{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;white-space:nowrap;background:var(--accent-soft);color:var(--accent)}
.regime-상승장{background:var(--strong-soft);color:var(--strong)}.regime-하락장{background:var(--warn-soft);color:var(--warn)}.regime-횡보장{background:var(--neutral-soft);color:var(--neutral)}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.stat{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:0}
.stat b{display:block;font-size:12px;font-weight:500;color:var(--muted)}.stat .v{font-size:16px;font-weight:600}
.up{color:var(--strong)}.down{color:var(--warn)}
ul.plain{margin:0;padding-left:18px}
.cards{display:flex;flex-direction:column;gap:12px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.coin{font-size:17px;font-weight:700;line-height:1.3}.coin small{font-family:var(--font-num);font-weight:500;color:var(--muted);font-size:13px;margin-left:4px}
.price{font-size:14px;margin-top:2px}
.rating{font-size:13px;font-weight:700;padding:4px 11px;border-radius:999px;white-space:nowrap}
.r-강력관심{background:var(--strong-soft);color:var(--strong)}.r-관심{background:var(--buy-soft);color:var(--buy)}
.r-중립{background:var(--neutral-soft);color:var(--neutral)}.r-주의{background:var(--warn-soft);color:var(--warn)}
.comment{margin:0}
.track{position:relative;height:34px;margin:0 8px}
.rail{position:absolute;left:0;right:0;top:15px;height:4px;border-radius:2px;background:var(--line)}
.zone{position:absolute;top:11px;height:12px;border-radius:3px;background:var(--buy-soft);border:1px solid var(--buy)}
.tick{position:absolute;top:8px;width:2px;height:18px;border-radius:1px;transform:translateX(-1px)}
.tick.stop{background:var(--warn)}.tick.tgt{background:var(--strong)}
.cur{position:absolute;top:11px;width:12px;height:12px;border-radius:50%;background:var(--ink);border:2px solid var(--paper);transform:translateX(-6px)}
.levels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;font-size:13px}
.levels div{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed var(--line);padding-bottom:3px;min-width:0}
.levels span:first-child{color:var(--muted);white-space:nowrap}
@media (max-width:480px){.levels{grid-template-columns:minmax(0,1fr)}}
.lv-stop{color:var(--warn)}.lv-tgt{color:var(--strong)}
.counter{background:var(--warn-soft);border-radius:10px;padding:10px 12px;font-size:14px}.counter b{color:var(--warn);font-weight:600}
details{font-size:14px}summary{cursor:pointer;color:var(--accent);font-weight:500}details ul{margin:6px 0 0;padding-left:18px}
.list{display:flex;flex-direction:column}
.item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
.item:last-child{border-bottom:0}
.score{font-family:var(--font-num);font-weight:600;font-size:14px;min-width:34px;text-align:center;border-radius:8px;padding:2px 0;background:var(--neutral-soft);height:fit-content}
.score.hi{background:var(--warn-soft);color:var(--warn)}.score.mid{background:var(--accent-soft);color:var(--accent)}
.item a{color:var(--ink);text-decoration:none;font-weight:500}.item a:hover{text-decoration:underline}
.meta{font-size:12px;color:var(--muted)}
.stars{color:var(--star);font-size:15px;letter-spacing:1px;white-space:nowrap;line-height:1}.stars .off{color:var(--star-off)}
.rbox{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.nstar{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:74px}.nstar .stars{font-size:13px}
.nstar small{font-family:var(--font-num);font-size:11px;color:var(--muted)}
.legend{font-size:12px;color:var(--muted);margin:0}
.tone-호재{color:var(--strong);font-weight:600}.tone-악재{color:var(--warn);font-weight:600}.tone-중립{color:var(--muted);font-weight:600}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}
th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}th{color:var(--muted);font-weight:500}
.archive{display:flex;flex-wrap:wrap;gap:6px}
.archive a{font-family:var(--font-num);font-size:13px;color:var(--accent);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:4px 8px;background:var(--paper)}
.archive a[aria-current]{background:var(--accent);color:var(--paper);border-color:var(--accent)}
.notice{background:var(--accent-soft);color:var(--accent);border-radius:10px;padding:8px 12px;font-size:13px}
.notice a{color:inherit}
footer{font-size:12px;color:var(--muted);text-align:center;display:flex;flex-direction:column;gap:4px}
a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
"""


RSTAR = {"강력관심": 5, "관심": 4, "중립": 3, "주의": 1}


def coin_stars(p):
    try:
        n = round(float(p.get("stars")))
        if 1 <= n <= 5:
            return n
    except (TypeError, ValueError):
        pass
    return RSTAR.get(p.get("rating"), 3)


def news_stars(n):
    try:
        k = round(float(n.get("stars")))
        if 1 <= k <= 5:
            return k
    except (TypeError, ValueError):
        pass
    try:
        return max(1, min(5, math.ceil(float(n.get("score")) / 2)))
    except (TypeError, ValueError):
        return 1


def star_html(k, label):
    off = f'<span class="off">{"☆" * (5 - k)}</span>' if k < 5 else ""
    return f'<span class="stars" role="img" aria-label="{e(label)}">{"★" * k}{off}</span>'


def ladder(lv, price):
    keys = ["stop", "entry_low", "entry_high", "target1", "target2"]
    if not lv or lv.get("stop") is None or lv.get("target1") is None:
        return ""
    vals = [lv[k] for k in keys if lv.get(k) is not None] + [price]
    lo, hi = min(vals) * 0.99, max(vals) * 1.01

    def P(v):
        return f"{(v - lo) / (hi - lo) * 100:.2f}%"

    zone = ""
    if lv.get("entry_low") is not None and lv.get("entry_high") is not None:
        left = (lv["entry_low"] - lo) / (hi - lo) * 100
        width = max(0.8, (lv["entry_high"] - lv["entry_low"]) / (hi - lo) * 100)
        zone = f'<div class="zone" style="left:{left:.2f}%;width:{width:.2f}%"></div>'
    ticks = f'<div class="tick stop" style="left:{P(lv["stop"])}"></div>'
    for k in ("target1", "target2"):
        if lv.get(k) is not None:
            ticks += f'<div class="tick tgt" style="left:{P(lv[k])}"></div>'
    label = f'손절 {won(lv["stop"])}, 진입 {won(lv.get("entry_low"))}~{won(lv.get("entry_high"))}, 현재 {won(price)}, 목표 {won(lv["target1"])}'

    def row(k, v, c=""):
        return f'<div><span>{k}</span><span class="num {c}">{e(v)}</span></div>'

    rows = row("진입 구간", f'{won(lv.get("entry_low"))}~{won(lv.get("entry_high"))}')
    rows += row("손절", f'{won(lv["stop"])} ({pct(lv.get("stop_pct"))})', "lv-stop")
    rows += row("1차 목표", f'{won(lv["target1"])} ({pct(lv.get("t1_pct"))})', "lv-tgt")
    if lv.get("target2") is not None:
        rows += row("2차 목표", f'{won(lv["target2"])} ({pct(lv.get("t2_pct"))})', "lv-tgt")
    if lv.get("weight") is not None:
        rows += row("비중 상한", f'계좌의 {round(lv["weight"] * 100)}%')
    if lv.get("rr") is not None:
        rows += row("손익비", f'{float(lv["rr"]):.1f}')
    return (f'<div class="track" role="img" aria-label="{e(label)}"><div class="rail"></div>{zone}{ticks}'
            f'<div class="cur" style="left:{P(price)}"></div></div><div class="levels">{rows}</div>')


EXTRA_CSS = """
.nav{display:flex;gap:6px;flex-wrap:wrap}
.nav a{font-size:13px;font-weight:500;color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:4px 12px;background:var(--paper)}
.nav a[aria-current]{color:var(--paper);background:var(--accent);border-color:var(--accent)}
.coin a{color:inherit;text-decoration:none}.coin a:hover{text-decoration:underline}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tile{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:0}
.tile b{display:block;font-size:12px;font-weight:500;color:var(--muted)}.tile .v{font-size:18px;font-weight:700}
.tile .s{font-size:12px;color:var(--muted)}
.bars{display:flex;flex-direction:column;gap:8px}
.bar-row{display:grid;grid-template-columns:86px minmax(0,1fr) 92px;gap:10px;align-items:center;font-size:13px}
.bar-track{height:10px;background:var(--neutral-soft);border-radius:0 4px 4px 0;position:relative}
.bar-fill{position:absolute;left:0;top:0;bottom:0;background:var(--accent);border-radius:0 4px 4px 0}
.bar-half{position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--muted);opacity:.5}
.chart{position:relative}
.chart svg{display:block;width:100%;height:auto;overflow:visible}
.chart .grid{stroke:var(--line);stroke-width:1}
.chart .zero{stroke:var(--muted);stroke-width:1;stroke-dasharray:3 3}
.chart .axis{fill:var(--muted);font-size:13px;font-family:var(--font-num)}
.chart .line{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart .dot{fill:var(--accent);stroke:var(--paper);stroke-width:2}
.chart .hit{fill:transparent;cursor:crosshair}
.chart .xh{stroke:var(--muted);stroke-width:1;opacity:0}
.chart .hl{fill:var(--accent);stroke:var(--paper);stroke-width:2;opacity:0}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--paper);font-size:12px;line-height:1.4;padding:6px 8px;border-radius:8px;white-space:nowrap;opacity:0;transform:translate(-50%,-100%);transition:opacity .1s}
.empty{border:1px dashed var(--line);border-radius:12px;padding:18px;text-align:center;color:var(--muted);font-size:14px}
.coins-tbl a{color:var(--ink);font-weight:600;text-decoration:none}.coins-tbl a:hover{text-decoration:underline}
.timeline{display:flex;flex-direction:column;gap:10px}
.tl{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.tl-top{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
.res{font-size:13px}
@media (max-width:480px){.tile{padding:8px 10px}.bar-row{grid-template-columns:70px minmax(0,1fr) 84px}}
@media (prefers-reduced-motion:reduce){.tip{transition:none}}
"""

CHART_JS = """
<script>
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
</script>
"""


def line_chart(points, fmt_y, zero=False, label=""):
    """points: [(x_value(ms), y_value, tooltip)] 시간 순. 단일 계열 선 차트 (SVG + 호버 툴팁)."""
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
        grid += f'<line class="grid" x1="{L}" x2="{W - R}" y1="{y:.1f}" y2="{y:.1f}"/><text class="axis" x="{L - 6}" y="{y + 4:.1f}" text-anchor="end">{e(fmt_y(v))}</text>'
    if zero and lo < 0 < hi:
        grid += f'<line class="zero" x1="{L}" x2="{W - R}" y1="{Y(0):.1f}" y2="{Y(0):.1f}"/>'
    xl = (f'<text class="axis" x="{L}" y="{H - 6}" text-anchor="start">{e(kst_date(x0))}</text>'
          f'<text class="axis" x="{W - R}" y="{H - 6}" text-anchor="end">{e(kst_date(x1))}</text>')
    path = " ".join(f"{'M' if i == 0 else 'L'}{X(x):.1f},{Y(y):.1f}" for i, (x, y, _) in enumerate(points))
    dots = "".join(f'<circle class="dot" cx="{X(x):.1f}" cy="{Y(y):.1f}" r="4"/>' for x, y, _ in points) if len(points) <= 40 else ""
    data = json.dumps([{"x": round(X(x), 1), "y": round(Y(y), 1), "t": t} for x, y, t in points], ensure_ascii=False)
    return (f'<div class="chart" data-points="{e(data)}"><svg viewBox="0 0 {W} {H}" role="img" aria-label="{e(label)}">{grid}{xl}'
            f'<path class="line" d="{path}"/>{dots}<line class="xh" x1="0" x2="0" y1="{T}" y2="{H - B}"/>'
            f'<circle class="hl" cx="0" cy="0" r="5"/><rect class="hit" x="{L}" y="0" width="{W - L - R}" height="{H}"/></svg>'
            f'<div class="tip"></div></div>')


def kst_date(ms):
    d = datetime.fromtimestamp(ms / 1000, KST)
    return f"{d.month}/{d.day}"


def shell(site, title, desc, body, depth, active, charts=False):
    base = "../" * depth
    name = site.get("title", "AI 코인 리서치센터")
    nav = "".join(
        f'<a href="{base}{href}"{" aria-current=page" if key == active else ""}>{label}</a>'
        for key, href, label in (("latest", "", "최신 리포트"), ("track", "track.html", "성적표"), ("coins", "coin/", "코인별")))
    disclosure = f"<div>{e(site['disclosure'])}</div>" if site.get("disclosure") else ""
    full_title = name if title == name else f"{title} · {name}"
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(full_title)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:title" content="{e(full_title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>{CSS}{EXTRA_CSS}</style></head>
<body><div class="wrap">
<nav class="nav" aria-label="사이트 메뉴">{nav}</nav>
{body}
<footer>
  <div>AI가 공개 뉴스와 업비트 시세로 자동 작성한 참고용 코멘트예요. 투자 권유가 아니며, 매매 판단과 책임은 본인에게 있어요.</div>
  {disclosure}
</footer>
</div>{CHART_JS if charts else ""}</body></html>"""


def card(p, base):
    reasons = "".join(f"<li>{e(r)}</li>" for r in p.get("reasons") or [])
    counter = ""
    if p.get("counter"):
        inv = f'<br><span class="small">틀리는 조건: {e(p["invalidation"])}</span>' if p.get("invalidation") else ""
        counter = f'<div class="counter"><b>반대 의견</b> {e(p["counter"])}{inv}</div>'
    check = ""
    if p.get("checklist"):
        check = "<details><summary>사기 전 체크리스트</summary><ul>" + "".join(
            f"<li>{e(x)}</li>" for x in p["checklist"]) + "</ul></details>"
    k = coin_stars(p)
    return f"""<article class="card">
  <div class="card-top"><div><div class="coin"><a href="{base}coin/{e(p["sym"])}.html">{e(p.get("name") or p["sym"])}<small>{e(p["sym"])}</small></a></div>
  <div class="price num">{won(p.get("price"))} <span class="{cls(p.get("chg24"))}">{pct(p.get("chg24"))} 24h</span></div></div>
  <div class="rbox"><span class="rating r-{e(p.get("rating"))}">{e(p.get("rating"))}</span>{star_html(k, f"별 {k}개 (5점 만점)")}</div></div>
  {f'<p class="comment">{e(p["comment"])}</p>' if p.get("comment") else ""}
  {f'<ul class="plain small">{reasons}</ul>' if reasons else ""}
  {ladder(p.get("levels"), p.get("price"))}
  {counter}{check}
</article>"""


def report_page(r, site, archive, is_index):
    m = r.get("market") or {}
    base = "" if is_index else "../"
    picks = sorted(r.get("picks") or [], key=lambda p: ORDER.get(p.get("rating"), 9))
    stats = ""
    if m.get("btc"):
        stats += (f'<div class="stat"><b>비트코인</b><div class="v num">{won_short(m["btc"]["price"])}</div>'
                  f'<div class="small num {cls(m["btc"].get("chg"))}">{pct(m["btc"].get("chg"))} 24h</div></div>')
    if m.get("fng"):
        f = m["fng"]
        prev = f" · 전일 {f['prev']}" if f.get("prev") is not None else ""
        stats += (f'<div class="stat"><b>공포탐욕</b><div class="v num">{e(f.get("value"))}</div>'
                  f'<div class="small">{e(f.get("label", ""))}{prev}</div></div>')
    watch = "".join(f"<li>{e(w)}</li>" for w in m.get("watch") or [])
    cards = "".join(card(p, base) for p in picks) or '<div class="panel small muted">이번 리포트에는 코멘트할 관심 코인이 없어요.</div>'
    cautions = ""
    for c in r.get("cautions") or []:
        pr = f' <span class="num small">{won(c.get("price"))}</span> <span class="num small {cls(c.get("chg24"))}">{pct(c.get("chg24"))}</span>' if c.get("price") is not None else ""
        cautions += (f'<div class="item"><div class="nstar">{star_html(1, "주의, 별 1개")}<small>주의</small></div><div>'
                     f'<div><b><a href="{base}coin/{e(c["sym"])}.html">{e(c.get("name") or c["sym"])}</a></b>{pr}</div>'
                     f'<div class="small">{e(c.get("reason"))}</div></div></div>')
    news = ""
    for n in r.get("news") or []:
        s = n.get("score")
        url = n.get("url") or ""
        t = f'<a href="{e(url)}" target="_blank" rel="noopener">{e(n.get("title"))}</a>' if url.startswith("http") else e(n.get("title"))
        coins = ", ".join(n.get("coins") or []) or "시장 전체"
        tone = n.get("tone") or "중립"
        note = f'<div class="small">{e(n["note"])}</div>' if n.get("note") else ""
        k = news_stars(n)
        news += (f'<div class="item"><div class="nstar">{star_html(k, f"중요도 {s}점, 별 {k}개")}<small>{e(s) + "/10" if s is not None else ""}</small></div><div>{t}'
                 f'<div class="meta"><span class="tone-{e(tone)}">{e(tone)}</span> · {e(coins)} · {e(n.get("source", ""))}'
                 f'{" · " + e(n["time"]) if n.get("time") else ""}</div>{note}</div></div>')
    tk = r.get("track") or {}
    track = ""
    if tk.get("summary") or tk.get("items"):
        track = (f'<section class="panel section"><h2>회고부 · 이번에 채점한 코멘트</h2><p class="small" style="margin:0">{e(tk.get("summary", ""))}</p>'
                 f'{track_table(tk.get("items") or [], base)}<a class="small" href="{base}track.html">전체 성적표 보기</a></section>')
    arch = "".join(
        f'<a href="{base}r/{e(a["id"])}.html"{" aria-current=page" if a["id"] == r["__id"] else ""}>{e(kst(a["ts"]))}</a>'
        for a in archive[:30])
    old_notice = "" if is_index else f'<div class="notice">지난 리포트예요 ({e(kst(r["ts"]))}). <a href="../">최신 리포트 보기</a></div>'
    regime = f'<span class="chip regime-{e(m.get("regime"))}">{e(m.get("regime"))}</span>' if m.get("regime") else ""
    title = site.get("title", "AI 코인 리서치센터")
    body = f"""<header class="head">
  <div class="head-top"><div><div class="eyebrow">{e(title)} · 코인 코멘트</div><h1>{e(m.get("headline") or title)}</h1></div>{regime}</div>
  <div class="small muted">{e(kst(r["ts"]))} 작성{" · " + e(r["sources"]) if r.get("sources") else ""}</div>
</header>
{old_notice}
{f'<section class="section"><div class="stats">{stats}</div><div class="panel section"><h2>마켓부 · 시장 한 줄</h2><p style="margin:0">{e(m.get("summary", ""))}</p>{f"<ul class=plain small>{watch}</ul>" if watch else ""}</div></section>' if (stats or m.get("summary")) else ""}
<section class="section"><h2>운용부 · 코인별 코멘트</h2><p class="legend">별점 · 코인: ★5 강력관심 · ★4 관심 · ★3 관심(약)/중립(좋은 편) · ★2 중립 · ★1 주의 / 뉴스: 중요도 10점을 별 5개로</p><div class="cards">{cards}</div></section>
{f'<section class="panel section"><h2>리스크관리부 · 주의 코인</h2><div class="list">{cautions}</div></section>' if cautions else ""}
{f'<section class="panel section"><h2>뉴스부 · 중요도 순</h2><div class="list">{news}</div></section>' if news else ""}
{track}
{f'<section class="section"><h2>지난 리포트</h2><div class="archive">{arch}</div></section>' if len(archive) > 1 else ""}"""
    desc = m.get("headline") or "AI가 뉴스와 시세를 보고 쓰는 코인 코멘트"
    return shell(site, title if is_index else f"{kst(r['ts'])} 리포트", desc, body, 0 if is_index else 1,
                 "latest" if is_index else "")


def track_table(items, base):
    if not items:
        return ""
    rows = ""
    for x in items:
        stars = star_html(x["stars"], "별 %d개" % x["stars"]) if x.get("stars") else "-"
        result = '<td class="up">적중</td>' if x.get("hit") else '<td class="down">빗나감</td>'
        rows += (f'<tr><td><a href="{base}coin/{e(x["sym"])}.html">{e(x["sym"])}</a></td><td>{e(x.get("rating"))}</td>'
                 f'<td>{stars}</td><td>{e(x.get("from", "-"))}</td><td class="num {cls(x.get("ret"))}">{pct(x.get("ret"))}</td>'
                 f'<td class="num {cls(x.get("vs_btc"))}">{pct(x.get("vs_btc"))}</td>{result}</tr>')
    return (f'<div class="tbl coins-tbl"><table><thead><tr><th>코인</th><th>등급</th><th>별점</th><th>코멘트 시점</th><th>24h 수익률</th>'
            f'<th>BTC 대비</th><th>결과</th></tr></thead><tbody>{rows}</tbody></table></div>')


# ── 데이터 모으기 ─────────────────────────────────
def collect(reports_asc):
    """코인별 코멘트 기록과 채점 결과를 리포트들에서 모은다."""
    by_id = {r["__id"]: r for r in reports_asc}
    comments = {}  # sym → [entry]
    for r in reports_asc:
        for p in r.get("picks") or []:
            comments.setdefault(p["sym"], []).append({
                "id": r["__id"], "ts": r["ts"], "name": p.get("name") or p["sym"], "rating": p.get("rating"),
                "stars": coin_stars(p), "price": p.get("price"), "chg24": p.get("chg24"), "comment": p.get("comment"),
                "reasons": p.get("reasons") or [], "levels": p.get("levels"), "counter": p.get("counter")})
        for c in r.get("cautions") or []:
            comments.setdefault(c["sym"], []).append({
                "id": r["__id"], "ts": r["ts"], "name": c.get("name") or c["sym"], "rating": "주의", "stars": 1,
                "price": c.get("price"), "chg24": c.get("chg24"), "comment": c.get("reason"), "reasons": [],
                "levels": None, "counter": None})
    scored, seen = [], set()
    for r in reports_asc:
        for x in (r.get("track") or {}).get("items") or []:
            if not x.get("sym") or x.get("ret") is None:
                continue
            key = (x["sym"], x.get("from_id") or x.get("from"))
            if key in seen:
                continue
            seen.add(key)
            item = dict(x)
            item["scored_ts"] = r["ts"]
            if not item.get("stars"):
                src = by_id.get(x.get("from_id") or "")
                hit = None
                if src:
                    for p in (src.get("picks") or []):
                        if p["sym"] == x["sym"]:
                            hit = coin_stars(p)
                    if hit is None and any(c["sym"] == x["sym"] for c in src.get("cautions") or []):
                        hit = 1
                item["stars"] = hit or RSTAR.get(x.get("rating"), 3)
            scored.append(item)
            if item.get("from_id") and item["sym"] in comments:
                for c in comments[item["sym"]]:
                    if c["id"] == item["from_id"]:
                        c["result"] = item
    return comments, scored


def agg(items):
    n = len(items)
    if not n:
        return None
    hits = sum(1 for x in items if x.get("hit"))
    avg = sum(float(x.get("vs_btc") or 0) for x in items) / n
    return {"n": n, "hits": hits, "rate": hits / n, "avg": avg}


# ── 성적표 ───────────────────────────────────────
def track_page(site, scored):
    a = agg(scored)
    if not a:
        body = """<header class="head"><div class="eyebrow">회고부</div><h1>코멘트 성적표</h1>
<div class="small muted">관심·주의 코멘트가 24시간 뒤 비트코인보다 잘했는지 채점해 모아요.</div></header>
<div class="empty">아직 채점된 코멘트가 없어요.<br>코멘트를 쓰고 하루가 지나면 다음 실행 때 첫 결과가 올라와요.</div>"""
        return shell(site, "코멘트 성적표", "AI 코인 코멘트의 적중률", body, 0, "track")
    tiles = (f'<div class="tile"><b>채점한 코멘트</b><div class="v num">{a["n"]}건</div><div class="s">적중 {a["hits"]}건</div></div>'
             f'<div class="tile"><b>적중률</b><div class="v num">{a["rate"] * 100:.0f}%</div><div class="s">50%가 동전 던지기 수준</div></div>'
             f'<div class="tile"><b>BTC 대비 평균</b><div class="v num {cls(a["avg"])}">{pct(a["avg"])}</div><div class="s">24시간 기준</div></div>')
    bars = ""
    for k in (5, 4, 3, 2, 1):
        g = agg([x for x in scored if x.get("stars") == k])
        label = star_html(k, f"별 {k}개")
        if not g:
            bars += f'<div class="bar-row"><span>{label}</span><div class="bar-track"><span class="bar-half"></span></div><span class="muted small">표본 없음</span></div>'
            continue
        bars += (f'<div class="bar-row"><span>{label}</span><div class="bar-track" role="img" aria-label="적중률 {g["rate"] * 100:.0f}%">'
                 f'<div class="bar-fill" style="width:{g["rate"] * 100:.1f}%"></div><span class="bar-half"></span></div>'
                 f'<span class="num">{g["rate"] * 100:.0f}% <span class="muted">({g["hits"]}/{g["n"]})</span></span></div>')
    batches = {}
    for x in scored:
        batches.setdefault(x["scored_ts"], []).append(x)
    pts, cum = [], 0.0
    for ts in sorted(batches):
        grp = batches[ts]
        add = sum(float(x.get("vs_btc") or 0) for x in grp)
        cum += add
        pts.append((ts, cum * 100, f'{kst(ts)} · {len(grp)}건 채점, 이번 {add * 100:+.1f}%p → 누적 {cum * 100:+.1f}%p'))
    chart = line_chart(pts, lambda v: f"{v:+.0f}%p", zero=True, label="BTC 대비 초과수익 누적 추이") if len(pts) >= 2 else ""
    recent = sorted(scored, key=lambda x: x["scored_ts"], reverse=True)[:30]
    body = f"""<header class="head"><div class="eyebrow">회고부</div><h1>코멘트 성적표</h1>
<div class="small muted">관심·주의 코멘트가 24시간 뒤 비트코인보다 잘했는지 채점해 모아요. 관심류는 BTC보다 더 오르면, 주의는 BTC보다 못하면 적중이에요.</div></header>
<section class="tiles">{tiles}</section>
<section class="panel section"><h2>별점별 적중률</h2><div class="bars">{bars}</div>
<p class="legend">가운데 세로선이 50%예요. 별이 많을수록 적중률도 높아야 별점을 믿을 수 있어요. 표본이 적을 때는 참고만 하세요.</p></section>
{f'<section class="panel section"><h2>BTC 대비 초과수익 누적</h2>{chart}<p class="legend">채점된 코멘트의 BTC 대비 수익률(%p)을 순서대로 더한 값이에요. 오른쪽 위로 갈수록 코멘트가 시장보다 잘한 거예요.</p></section>' if chart else ""}
<section class="panel section"><h2>최근 채점 {len(recent)}건</h2>{track_table(recent, "")}</section>"""
    desc = f"채점 {a['n']}건 · 적중률 {a['rate'] * 100:.0f}% · BTC 대비 평균 {pct(a['avg'])}"
    return shell(site, "코멘트 성적표", desc, body, 0, "track", charts=bool(chart))


# ── 코인별 ───────────────────────────────────────
def coin_page(site, sym, entries):
    entries = sorted(entries, key=lambda c: c["ts"])
    last = entries[-1]
    name = last["name"]
    done = [c["result"] for c in entries if c.get("result")]
    a = agg(done)
    pts = [(c["ts"], float(c["price"]), f'{kst(c["ts"])} · {won(c["price"])} · {c["rating"]} ★{c["stars"]}')
           for c in entries if c.get("price") is not None]
    chart = line_chart(pts, lambda v: won(v).replace("원", ""), label=f"{name} 코멘트 시점 가격") if len(pts) >= 2 else ""
    tl = ""
    for c in reversed(entries):
        res = ""
        if c.get("result"):
            x = c["result"]
            verdict = '<b class="up">적중</b>' if x.get("hit") else '<b class="down">빗나감</b>'
            res = (f'<div class="res">24시간 뒤: <span class="num {cls(x.get("ret"))}">{pct(x.get("ret"))}</span> · BTC 대비 '
                   f'<span class="num {cls(x.get("vs_btc"))}">{pct(x.get("vs_btc"))}</span> · {verdict}</div>')
        comment = f'<p class="comment">{e(c["comment"])}</p>' if c.get("comment") else ""
        reasons = "".join(f"<li>{e(r)}</li>" for r in c.get("reasons") or [])
        reasons = f'<ul class="plain small">{reasons}</ul>' if reasons else ""
        stars = star_html(c["stars"], "별 %d개" % c["stars"])
        tl += (f'<div class="tl"><div class="tl-top"><a class="small" href="../r/{e(c["id"])}.html">{e(kst(c["ts"]))}</a>'
               f'<span class="rbox" style="flex-direction:row;align-items:center"><span class="rating r-{e(c["rating"])}">{e(c["rating"])}</span>{stars}</span></div>'
               f'<div class="num small">{won(c.get("price"))} <span class="{cls(c.get("chg24"))}">{pct(c.get("chg24"))} 24h</span></div>'
               f'{comment}{reasons}{res}</div>')
    rate = "%.0f%%" % (a["rate"] * 100) if a else "-"
    rate_sub = "%d/%d 적중" % (a["hits"], a["n"]) if a else "아직 채점 전"
    last_stars = star_html(last["stars"], "별 %d개" % last["stars"])
    tiles = (f'<div class="tile"><b>최근 별점</b><div class="v">{last_stars}</div><div class="s">{e(last["rating"])} · {e(kst(last["ts"]))}</div></div>'
             f'<div class="tile"><b>코멘트 횟수</b><div class="v num">{len(entries)}번</div><div class="s">처음 {e(kst(entries[0]["ts"]))}</div></div>'
             f'<div class="tile"><b>채점 결과</b><div class="v num">{rate}</div><div class="s">{rate_sub}</div></div>')
    body = f"""<header class="head"><div class="eyebrow">코인별 기록</div><h1>{e(name)} <span class="muted num" style="font-size:15px">{e(sym)}</span></h1>
<div class="small muted">이 코인이 받은 코멘트와 별점, 24시간 뒤 결과를 시간순으로 모았어요.</div></header>
<section class="tiles">{tiles}</section>
{f'<section class="panel section"><h2>코멘트 시점 가격</h2>{chart}<p class="legend">점 하나가 코멘트 하나예요. 눌러서 그때의 등급과 별점을 볼 수 있어요.</p></section>' if chart else ""}
<section class="section"><h2>코멘트 기록</h2><div class="timeline">{tl}</div></section>"""
    desc = f"{name} 최근 코멘트: {last['rating']} ★{last['stars']} ({kst(last['ts'])})"
    return shell(site, f"{name}({sym})", desc, body, 1, "coins", charts=bool(chart))


def coins_index(site, comments):
    rows = []
    for sym, entries in comments.items():
        last = max(entries, key=lambda c: c["ts"])
        a = agg([c["result"] for c in entries if c.get("result")])
        rows.append((last["ts"], sym, last, len(entries), a))
    rows.sort(key=lambda t: (-t[0], -t[2]["stars"]))
    trs = ""
    for ts, sym, last, n, a in rows:
        hit = "%.0f%% (%d/%d)" % (a["rate"] * 100, a["hits"], a["n"]) if a else "-"
        stars = star_html(last["stars"], "별 %d개" % last["stars"])
        trs += (f'<tr><td><a href="{e(sym)}.html">{e(last["name"])}</a> <span class="muted num">{e(sym)}</span></td>'
                f'<td>{stars}</td><td>{e(last["rating"])}</td><td class="num">{n}번</td><td class="num">{hit}</td>'
                f'<td class="num">{e(kst(ts))}</td></tr>')
    body = f"""<header class="head"><div class="eyebrow">코인별 기록</div><h1>코멘트한 코인 {len(rows)}개</h1>
<div class="small muted">코인 이름을 누르면 그 코인의 코멘트 기록과 결과를 볼 수 있어요. 최근 코멘트 순이에요.</div></header>
<section class="panel"><div class="tbl coins-tbl"><table><thead><tr><th>코인</th><th>최근 별점</th><th>등급</th><th>코멘트</th><th>적중</th><th>최근</th></tr></thead>
<tbody>{trs}</tbody></table></div></section>"""
    return shell(site, "코인별 기록", "AI 코인 코멘트를 받은 코인 목록과 기록", body, 1, "coins")


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def main():
    site_path = os.path.join(ROOT, "site.json")
    site = json.load(open(site_path, encoding="utf-8")) if os.path.exists(site_path) else {}
    reports = []
    for path in glob.glob(os.path.join(ROOT, "data", "reports", "*.json")):
        try:
            r = json.load(open(path, encoding="utf-8"))
        except (OSError, ValueError) as ex:
            print("건너뜀:", path, ex)
            continue
        r["__id"] = os.path.splitext(os.path.basename(path))[0]
        if isinstance(r.get("ts"), (int, float)):
            reports.append(r)
    if not reports:
        print("리포트 없음")
        return
    reports.sort(key=lambda r: r["ts"])
    comments, scored = collect(reports)
    newest = sorted(reports, key=lambda r: r["ts"], reverse=True)
    archive = [{"id": r["__id"], "ts": r["ts"]} for r in newest]
    out = os.path.join(ROOT, "public")
    for r in newest:
        write(os.path.join(out, "r", r["__id"] + ".html"), report_page(r, site, archive, is_index=False))
    write(os.path.join(out, "index.html"), report_page(newest[0], site, archive, is_index=True))
    write(os.path.join(out, "track.html"), track_page(site, scored))
    write(os.path.join(out, "coin", "index.html"), coins_index(site, comments))
    for sym, entries in comments.items():
        write(os.path.join(out, "coin", sym + ".html"), coin_page(site, sym, entries))
    latest = {k: v for k, v in newest[0].items() if k != "__id"}
    a = agg(scored)
    with open(os.path.join(out, "feed.json"), "w", encoding="utf-8") as f:
        json.dump({"latest_id": newest[0]["__id"], "latest": latest, "archive": archive[:60],
                   "track": a, "coins": sorted(comments)}, f, ensure_ascii=False)
    print(f"완료: 리포트 {len(reports)}개, 코인 {len(comments)}개, 채점 {len(scored)}건 → public/")


if __name__ == "__main__":
    main()
