import json, sys
# 입력: {"SYM": {"price":..., "prev":..., "hi52":..., "weeks":[[o,h,l,c], ...최신→과거 6주]}}
def tick(x):
    for lim, st in [(2e6,1000),(1e6,500),(5e5,100),(1e5,50),(1e4,10),(1e3,1),(100,1),(10,0.1),(1,0.01)]:
        if x >= lim: return round(round(x/st)*st, 4)
    return round(x, 4)
def levels(d):
    P = d["price"]; W = d["weeks"]; hi52 = d.get("hi52")
    O = [w[0] for w in W]; H = [w[1] for w in W]; L = [w[2] for w in W]; C = [w[3] for w in W]
    vol = sum((H[i]-L[i])/C[i] for i in range(1, min(5, len(W)))) / max(1, min(4, len(W)-1))  # 지난 4주 평균 주간 변동폭
    sup = [x for x in L[:3] + C[1:3] if x < P]
    near = [x for x in sup if P - x <= 1.2*vol*P]
    S = max(near) if near else P*(1-0.5*vol)
    mid = (S+P)/2
    stop = S - 0.25*vol*P
    stop = min(stop, mid*(1-0.04)); stop = max(stop, mid*(1-0.18))
    R = mid - stop
    res = sorted(x for x in H + ([hi52] if hi52 else []) if x > mid + 1.5*R)
    t1 = res[0] if res and res[0] <= mid + 4*R else mid + 2*R
    later = [x for x in res if x > t1*1.02]
    t2 = later[0] if later and later[0] <= mid + 6*R else max(t1 + 1.5*R, mid + 3.5*R)
    return {
        "entry_low": tick(S), "entry_high": tick(P), "stop": tick(stop), "target1": tick(t1), "target2": tick(t2),
        "stop_pct": round(stop/mid-1, 4), "t1_pct": round(t1/mid-1, 4), "t2_pct": round(t2/mid-1, 4),
        "rr": round((t1-mid)/R, 2), "weight": round(min(0.25, 0.01/(R/mid)), 3),
        "chg_1w": round(C[0]/C[1]-1, 4), "chg_4w": round(C[0]/C[4]-1, 4) if len(C) > 4 else None,
        "wk_range": round(vol, 4), "from_hi52": round(P/hi52-1, 4) if hi52 else None,
        "up_weeks_of_4": sum(C[i] > C[i+1] for i in range(min(4, len(C)-1))),
    }
data = json.load(open(sys.argv[1]))
print(json.dumps({k: levels(v) for k, v in data.items()}, ensure_ascii=False, indent=1))
