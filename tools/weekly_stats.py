"""주간 집계 — 주간 요약을 쓸 때 숫자는 이 스크립트 결과만 쓴다.

사용: python3 weekly_stats.py <리포트 JSON 폴더> <시작 epoch ms> <끝 epoch ms>
출력: JSON (counts, top, sectors, track, link_notes, lessons, first_prices)
"""
import glob
import json
import os
import sys

ORDER = {"강력관심": 0, "관심": 1, "중립": 2, "주의": 3}
RSTAR = {"강력관심": 5, "관심": 4, "중립": 3, "주의": 1}
GROUPS = [("디지털 금", ["디지털 금", "가치저장"]), ("레이어2", ["L2", "레이어2", "롤업"]),
          ("오라클·데이터", ["오라클", "인덱싱", "데이터"]), ("RWA", ["RWA", "실물", "토큰화"]),
          ("DeFi", ["DeFi", "디파이", "DEX", "대출", "거래소", "스테이킹", "합성"]),
          ("AI", ["AI", "컴퓨팅", "GPU"]), ("밈", ["밈"]), ("게임", ["게임", "메타버스", "NFT"]),
          ("결제·송금", ["결제", "송금"]), ("브릿지·인프라", ["브릿지", "크로스체인", "메시징", "저장", "인프라"]),
          ("L1", ["L1", "레이어1", "스마트컨트랙트", "블록체인"])]


def group(pos):
    for g, keys in GROUPS:
        if any(k.lower() in pos.lower() for k in keys):
            return g
    return pos or "기타"


def main():
    folder, start, end = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    reps = []
    for f in glob.glob(os.path.join(folder, "*.json")):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        d["__id"] = os.path.splitext(os.path.basename(f))[0]
        if isinstance(d.get("ts"), (int, float)) and start <= d["ts"] <= end:
            reps.append(d)
    reps.sort(key=lambda d: d["ts"])
    coins, sectors, news_n = {}, {}, 0
    for r in reps:
        news_n += len(r.get("news") or [])
        for p in r.get("picks") or []:
            c = coins.setdefault(p["sym"], {"sym": p["sym"], "name": p.get("name") or p["sym"], "count": 0, "stars": [],
                                           "ratings": [], "first_price": p.get("price"), "first_ts": r["ts"], "last_price": p.get("price")})
            c["count"] += 1
            c["stars"].append(p.get("stars") or RSTAR.get(p.get("rating"), 3))
            c["ratings"].append(p.get("rating"))
            c["last_price"] = p.get("price")
            g = group(p.get("position") or "")
            sectors[g] = sectors.get(g, 0) + 1
        for q in r.get("cautions") or []:
            c = coins.setdefault(q["sym"], {"sym": q["sym"], "name": q.get("name") or q["sym"], "count": 0, "stars": [],
                                           "ratings": [], "first_price": q.get("price"), "first_ts": r["ts"], "last_price": q.get("price")})
            c["count"] += 1
            c["stars"].append(1)
            c["ratings"].append("주의")
            c["last_price"] = q.get("price")
    top = []
    for c in coins.values():
        avg = sum(c["stars"]) / len(c["stars"])
        best = min(c["ratings"], key=lambda x: ORDER.get(x, 9))
        top.append({"sym": c["sym"], "name": c["name"], "count": c["count"], "avg_stars": round(avg, 1), "best": best,
                    "first_price": c["first_price"], "last_price_in_reports": c["last_price"]})
    top.sort(key=lambda c: (-c["count"], -c["avg_stars"]))
    track = {}
    seen = set()
    for r in reps:
        for x in (r.get("track") or {}).get("items") or []:
            h = x.get("h") or "24h"
            key = (x.get("sym"), x.get("from_id") or x.get("from"), h)
            if key in seen or x.get("ret") is None:
                continue
            seen.add(key)
            t = track.setdefault(h, {"n": 0, "hits": 0, "sum": 0.0})
            t["n"] += 1
            t["hits"] += 1 if x.get("hit") else 0
            t["sum"] += float(x.get("vs_btc") or 0)
    for t in track.values():
        t["rate"] = round(t["hits"] / t["n"], 3)
        t["avg"] = round(t.pop("sum") / t["n"], 4)
    link_notes = []
    for r in reps:
        for p in r.get("picks") or []:
            if p["sym"] == "LINK":
                note = next((x for x in p.get("reasons") or [] if "스토리" in x), "")
                link_notes.append({"id": r["__id"], "rating": p.get("rating"), "note": note})
    out = {"window": [start, end], "counts": {"reports": len(reps), "coins": len(coins), "news": news_n},
           "top": top[:8], "sectors": sorted([{"name": k, "count": v} for k, v in sectors.items()], key=lambda s: -s["count"]),
           "track": track, "link_notes": link_notes, "lessons": (reps[-1].get("lessons") if reps else []) or [],
           "report_ids": [r["__id"] for r in reps]}
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
