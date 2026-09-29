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
    off = f'<span class="off">{"★" * (5 - k)}</span>' if k < 5 else ""
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


def card(p):
    reasons = "".join(f"<li>{e(r)}</li>" for r in p.get("reasons") or [])
    counter = ""
    if p.get("counter"):
        inv = f'<br><span class="small">틀리는 조건: {e(p["invalidation"])}</span>' if p.get("invalidation") else ""
        counter = f'<div class="counter"><b>반대 의견</b> {e(p["counter"])}{inv}</div>'
    check = ""
    if p.get("checklist"):
        check = "<details><summary>사기 전 체크리스트</summary><ul>" + "".join(
            f"<li>{e(x)}</li>" for x in p["checklist"]) + "</ul></details>"
    return f"""<article class="card">
  <div class="card-top"><div><div class="coin">{e(p.get("name") or p["sym"])}<small>{e(p["sym"])}</small></div>
  <div class="price num">{won(p.get("price"))} <span class="{cls(p.get("chg24"))}">{pct(p.get("chg24"))} 24h</span></div></div>
  <div class="rbox"><span class="rating r-{e(p.get("rating"))}">{e(p.get("rating"))}</span>{star_html(coin_stars(p), f"별 {coin_stars(p)}개 (5점 만점)")}</div></div>
  {f'<p class="comment">{e(p["comment"])}</p>' if p.get("comment") else ""}
  {f'<ul class="plain small">{reasons}</ul>' if reasons else ""}
  {ladder(p.get("levels"), p.get("price"))}
  {counter}{check}
</article>"""


def page(r, site, archive, is_index):
    m = r.get("market") or {}
    title = site.get("title", "AI 코인 리서치센터")
    desc = m.get("headline") or "AI가 뉴스와 시세를 보고 쓰는 코인 코멘트"
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
    cards = "".join(card(p) for p in picks) or '<div class="panel small muted">이번 리포트에는 코멘트할 관심 코인이 없어요.</div>'
    cautions = ""
    for c in r.get("cautions") or []:
        pr = f' <span class="num small">{won(c.get("price"))}</span> <span class="num small {cls(c.get("chg24"))}">{pct(c.get("chg24"))}</span>' if c.get("price") is not None else ""
        cautions += (f'<div class="item"><div class="nstar">{star_html(1, "주의, 별 1개")}<small>주의</small></div><div><div><b>{e(c.get("name") or c["sym"])}</b>{pr}</div>'
                     f'<div class="small">{e(c.get("reason"))}</div></div></div>')
    news = ""
    for n in r.get("news") or []:
        s = n.get("score")
        sc = "hi" if (s or 0) >= 7 else ("mid" if (s or 0) >= 5 else "")
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
    track_rows = "".join(
        f'<tr><td>{e(x.get("sym"))}</td><td>{e(x.get("rating"))}</td><td>{e(x.get("from", "-"))}</td>'
        f'<td class="num {cls(x.get("ret"))}">{pct(x.get("ret"))}</td><td class="num {cls(x.get("vs_btc"))}">{pct(x.get("vs_btc"))}</td>'
        f'<td class="{"up" if x.get("hit") else "down"}">{"적중" if x.get("hit") else "빗나감"}</td></tr>'
        for x in tk.get("items") or [])
    lessons = "".join(f"<li>교훈: {e(x)}</li>" for x in r.get("lessons") or [])
    track = ""
    if tk.get("summary") or track_rows:
        table = (f'<div class="tbl"><table><thead><tr><th>코인</th><th>당시 등급</th><th>코멘트 시점</th><th>수익률</th>'
                 f'<th>BTC 대비</th><th>결과</th></tr></thead><tbody>{track_rows}</tbody></table></div>') if track_rows else ""
        track = (f'<section class="panel section"><h2>회고부 · 지난 코멘트 성적</h2><p class="small" style="margin:0">{e(tk.get("summary", ""))}</p>'
                 f'{table}{f"<ul class=plain small>{lessons}</ul>" if lessons else ""}</section>')
    base = "" if is_index else "../"
    arch = "".join(
        f'<a href="{base}r/{e(a["id"])}.html"{" aria-current=page" if a["id"] == r["__id"] else ""}>{e(kst(a["ts"]))}</a>'
        for a in archive[:30])
    old_notice = "" if is_index else f'<div class="notice">지난 리포트예요 ({e(kst(r["ts"]))}). <a href="../">최신 리포트 보기</a></div>'
    disclosure = f"<div>{e(site['disclosure'])}</div>" if site.get("disclosure") else ""
    regime = f'<span class="chip regime-{e(m.get("regime"))}">{e(m.get("regime"))}</span>' if m.get("regime") else ""
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:title" content="{e(title)} · {e(kst(r['ts']))}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>{CSS}</style></head>
<body><div class="wrap">
<header class="head">
  <div class="head-top"><div><div class="eyebrow">{e(title)} · 코인 코멘트</div><h1>{e(m.get("headline") or title)}</h1></div>{regime}</div>
  <div class="small muted">{e(kst(r["ts"]))} 작성{" · " + e(r["sources"]) if r.get("sources") else ""}</div>
</header>
{old_notice}
{f'<section class="section"><div class="stats">{stats}</div><div class="panel section"><h2>마켓부 · 시장 한 줄</h2><p style="margin:0">{e(m.get("summary", ""))}</p>{f"<ul class=plain small>{watch}</ul>" if watch else ""}</div></section>' if (stats or m.get("summary")) else ""}
<section class="section"><h2>운용부 · 코인별 코멘트</h2><p class="legend">별점 · 코인: ★5 강력관심 · ★4 관심 · ★3 관심(약)/중립(좋은 편) · ★2 중립 · ★1 주의 / 뉴스: 중요도 10점을 별 5개로</p><div class="cards">{cards}</div></section>
{f'<section class="panel section"><h2>리스크관리부 · 주의 코인</h2><div class="list">{cautions}</div></section>' if cautions else ""}
{f'<section class="panel section"><h2>뉴스부 · 중요도 순</h2><div class="list">{news}</div></section>' if news else ""}
{track}
{f'<section class="section"><h2>지난 리포트</h2><div class="archive">{arch}</div></section>' if len(archive) > 1 else ""}
<footer>
  <div>AI가 공개 뉴스와 업비트 시세로 자동 작성한 참고용 코멘트예요. 투자 권유가 아니며, 매매 판단과 책임은 본인에게 있어요.</div>
  {disclosure}
</footer>
</div></body></html>"""


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
    reports.sort(key=lambda r: r["ts"], reverse=True)
    if not reports:
        print("리포트 없음")
        return
    archive = [{"id": r["__id"], "ts": r["ts"]} for r in reports]
    out = os.path.join(ROOT, "public")
    os.makedirs(os.path.join(out, "r"), exist_ok=True)
    for r in reports:
        with open(os.path.join(out, "r", r["__id"] + ".html"), "w", encoding="utf-8") as f:
            f.write(page(r, site, archive, is_index=False))
    with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as f:
        f.write(page(reports[0], site, archive, is_index=True))
    latest = {k: v for k, v in reports[0].items() if k != "__id"}
    with open(os.path.join(out, "feed.json"), "w", encoding="utf-8") as f:
        json.dump({"latest_id": reports[0]["__id"], "latest": latest, "archive": archive[:60]}, f, ensure_ascii=False)
    print(f"완료: 리포트 {len(reports)}개 → public/")


if __name__ == "__main__":
    main()
