"""리포트 점검기 — 저장 전에 규칙을 지켰는지 확인한다.

사용: python3 check_report.py report.json [prev.json] [--mine LINK,SOL]
출력: ERROR/WARN 줄과 마지막에 OK 또는 FAIL. ERROR가 있으면 종료코드 1.
"""
import difflib
import json
import math
import sys

RATINGS = {"강력관심", "관심", "중립", "주의"}
CATS = {"규제·정책", "상장·상폐", "해킹·보안", "제휴·채택", "기관·ETF", "기술·업그레이드", "토큰·공급", "거시", "시황"}
PICK_FIELDS = ["sym", "name", "rating", "stars", "position", "what", "price", "chg24", "comment", "reasons",
               "metrics", "bull", "bear", "levels", "counter", "invalidation", "checklist"]
NEWS_FIELDS = ["title", "url", "source", "time", "score", "tone", "category", "coins", "summary", "impact"]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    mine = []
    for i, a in enumerate(sys.argv):
        if a == "--mine" and i + 1 < len(sys.argv):
            mine = [s.strip().upper() for s in sys.argv[i + 1].split(",") if s.strip()]
            args = [x for x in args if x != sys.argv[i + 1]]
    r = json.load(open(args[0], encoding="utf-8"))
    prev = json.load(open(args[1], encoding="utf-8")) if len(args) > 1 else None
    errs, warns = [], []
    E, W = errs.append, warns.append

    if not isinstance(r.get("ts"), int):
        E("ts가 정수(epoch ms)가 아니에요")
    picks = r.get("picks") or []
    cz = r.get("cautions") or []
    if not 8 <= len(picks) <= 11:
        E(f"카드 수 {len(picks)}개 (8~10개, 내 코인이 많으면 11개까지)")
    for p in picks:
        miss = [f for f in PICK_FIELDS if p.get(f) in (None, "", [])]
        if miss:
            E(f"{p.get('sym')}: 빠진 필드 {miss}")
        rt, st = p.get("rating"), p.get("stars")
        if rt not in RATINGS:
            E(f"{p.get('sym')}: 등급 '{rt}' 이상함")
        ok = {"강력관심": {5}, "관심": {3, 4}, "중립": {2, 3}, "주의": {1}}.get(rt, set())
        if st not in ok:
            E(f"{p.get('sym')}: {rt}인데 별 {st}개 (허용 {sorted(ok)})")
        lv = p.get("levels") or {}
        if rt in ("강력관심", "관심") and isinstance(lv.get("rr"), (int, float)) and lv["rr"] < 1.5:
            E(f"{p.get('sym')}: 손익비 {lv['rr']} < 1.5 인데 {rt}")
        m = p.get("metrics") or {}
        if rt in ("강력관심", "관심") and ((p.get("chg24") or 0) >= 0.15 or (m.get("chg_1w") or 0) >= 0.40):
            E(f"{p.get('sym')}: 급등(24h {p.get('chg24')}, 1주 {m.get('chg_1w')}) 코인은 최대 중립")
        if not isinstance(p.get("reasons"), list) or not 2 <= len(p.get("reasons") or []) <= 4:
            W(f"{p.get('sym')}: 근거는 2~4개")
    syms = [p.get("sym") for p in picks]
    anchors = {"BTC", "LINK"} | set(mine)
    for a in sorted(anchors):
        if a not in syms and a not in {c.get("sym") for c in cz}:
            E(f"고정 코인 {a}가 카드에 없어요")
    pos = [p.get("position") for p in picks if p.get("position")]
    if len(set(pos)) < 5:
        E(f"분야가 {len(set(pos))}곳뿐 (5곳 이상)")
    for k in set(pos):
        if pos.count(k) > 3:
            E(f"분야 '{k}'가 {pos.count(k)}개 (최대 3개)")

    if prev:
        pp = {q.get("sym"): q for q in prev.get("picks") or []}
        pc = {q.get("sym") for q in prev.get("cautions") or []}
        rep = [s for s in syms if s in pp or s in pc]
        limit = len(anchors) + 2
        if len(rep) > limit:
            E(f"직전 리포트와 겹치는 카드 {len(rep)}개 {rep} (최대 {limit}개)")
        new = len(picks) - len(rep)
        need = min(math.ceil(len(picks) / 2), len(picks) - len(anchors))
        if new < need:
            E(f"새 코인 카드 {new}개 (최소 {need}개)")
        for p in picks:
            s = p.get("sym")
            if s in pp or s in pc:
                if not p.get("since_last"):
                    E(f"{s}: 다시 나온 코인인데 since_last가 비어 있어요")
                old = (pp.get(s) or {}).get("comment") or ""
                if old and difflib.SequenceMatcher(None, old, p.get("comment") or "").ratio() > 0.75:
                    E(f"{s}: comment가 직전 리포트와 거의 같아요. 새로 써주세요")
            elif p.get("since_last"):
                W(f"{s}: 새 코인인데 since_last가 있어요 (빈 문자열로)")
        purls = {n.get("url") for n in prev.get("news") or [] if n.get("url")}
        ptitles = {n.get("title") for n in prev.get("news") or []}
        for n in r.get("news") or []:
            if (n.get("url") in purls or n.get("title") in ptitles) and not str(n.get("summary", "")).startswith("후속"):
                E(f"직전 리포트에 실린 뉴스예요: {n.get('title')}")

    news = r.get("news") or []
    if not 12 <= len(news) <= 15:
        E(f"뉴스 {len(news)}건 (12~15건)")
    cats = []
    for n in news:
        miss = [f for f in NEWS_FIELDS if n.get(f) in (None, "")]
        if miss:
            E(f"뉴스 '{str(n.get('title'))[:20]}': 빠진 필드 {miss}")
        if n.get("category") not in CATS:
            E(f"뉴스 '{str(n.get('title'))[:20]}': 분류 '{n.get('category')}' 이상함")
        if not isinstance(n.get("new"), bool):
            W(f"뉴스 '{str(n.get('title'))[:20]}': new(true/false)가 없어요")
        cats.append(n.get("category"))
    for k in set(cats):
        if cats.count(k) > 3:
            E(f"뉴스 분류 '{k}'가 {cats.count(k)}건 (최대 3건)")
    if len(set(cats)) < 5:
        W(f"뉴스 분류가 {len(set(cats))}종류 (5종류 이상 권장)")

    b = r.get("brief") or {}
    if len([x for x in b.get("points") or [] if x]) != 3:
        E("brief.points는 3개")
    sc = b.get("script") or ""
    if not 250 <= len(sc) <= 700:
        E(f"brief.script 길이 {len(sc)}자 (250~700자, 약 60초)")

    for x in (r.get("track") or {}).get("items") or []:
        if x.get("h") not in ("24h", "3d", "7d"):
            E(f"track {x.get('sym')}: h가 24h/3d/7d 중 하나가 아니에요")
        if not x.get("from_id") or not x.get("stars"):
            E(f"track {x.get('sym')}: from_id·stars 필요")

    for w in warns:
        print("WARN:", w)
    for e_ in errs:
        print("ERROR:", e_)
    print("OK" if not errs else f"FAIL ({len(errs)}건)")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
