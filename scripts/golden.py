#!/usr/bin/env python3
"""検算値（golden）の生成と、モデルの総当たり検証（内部設計 §9.2, §9.3）。

TypeScript 実装とは独立に、SciPy で §4 の式を計算する。

  python3 scripts/golden.py            # tests/golden/<id>.json を書き出す
  python3 scripts/golden.py --brute    # 超幾何による周辺化を総当たり計算と比べる
"""

import itertools
import json
import math
import sys
from pathlib import Path

from scipy.special import logsumexp
from scipy.stats import binom, hypergeom, multinomial

ROOT = Path(__file__).resolve().parent.parent
MACHINES = ROOT / "src" / "machines" / "data"
PRESETS = ROOT / "src" / "core" / "priors" / "presets.json"
OUT = ROOT / "tests" / "golden"


def prob(v):
    return 1 / v["oneIn"] if "oneIn" in v else v["num"] / v["den"]


def probs(machine, s):
    p = machine["probabilities"]
    return (
        prob(p["big"]["values"][s]),
        prob(p["reg"]["values"][s]),
        prob(p["grape"]["values"][s]) if "grape" in p else None,
    )


def log_lik(machine, s, N, b, r, session):
    """session: None / (n, g, None) / (n, g, (bw, rw))"""
    pb, pr, pg = probs(machine, s)
    ll = multinomial.logpmf([b, r, N - b - r], N, [pb, pr, 1 - pb - pr]) if N > 0 else 0.0
    if session is not None:
        n, g, known = session
        q = pg / (1 - pb - pr)
        if known is not None:
            bw, rw = known
            ll += binom.logpmf(g, n - bw - rw, q)
        else:
            T = b + r
            ks = range(max(0, n - (N - T)), min(n, T) + 1)
            ll += logsumexp([hypergeom.logpmf(k, N, T, n) + binom.logpmf(g, n - k, q) for k in ks])
    return float(ll)


def posterior(settings, ll, weights):
    total = sum(weights[s] for s in settings)
    lw = [math.log(weights[s] / total) + ll[s] if weights[s] > 0 else -math.inf for s in settings]
    z = logsumexp(lw)
    return {s: math.exp(x - z) for s, x in zip(settings, lw)}


def cases_for(machine):
    p = machine["probabilities"]
    s_lo, s_hi = machine["settings"][0], machine["settings"][-1]
    out = [(0, 0, 0, None)]
    for N in (500, 3000, 8000):
        def around(prob_):
            mean = N * prob_
            sd = math.sqrt(mean * (1 - prob_))
            return {round(mean - 2 * sd), round(mean), round(mean + 2 * sd)}
        bs = sorted({x for s in (s_lo, s_hi) for x in around(prob(p["big"]["values"][s])) if x >= 0})
        rs = sorted({x for s in (s_lo, s_hi) for x in around(prob(p["reg"]["values"][s])) if x >= 0})
        for b, r in itertools.product(bs, rs):
            if b + r > N:
                continue
            out.append((N, b, r, None))
            if "grape" not in p:
                continue
            n = N // 2
            gs = set()
            for s in (s_lo, s_hi):
                pg = prob(p["grape"]["values"][s])
                mean = n * pg
                sd = math.sqrt(mean * (1 - pg))
                gs |= {round(mean - 2 * sd), round(mean + 2 * sd)}
            for g in sorted(gs):
                if g > n or g > N - b - r:
                    continue
                out.append((N, b, r, (n, g, None)))
                bw, rw = b // 2, r // 2
                if g <= n - bw - rw:
                    out.append((N, b, r, (n, g, (bw, rw))))
    return out


def generate():
    presets = json.loads(PRESETS.read_text(encoding="utf-8"))["presets"]
    OUT.mkdir(parents=True, exist_ok=True)
    for path in sorted(MACHINES.glob("*.json")):
        machine = json.loads(path.read_text(encoding="utf-8"))
        settings = machine["settings"]
        rows = []
        for N, b, r, session in cases_for(machine):
            ll = {s: log_lik(machine, s, N, b, r, session) for s in settings}
            row = {"N": N, "b": b, "r": r, "posterior": {}}
            if session is not None:
                n, g, known = session
                row["session"] = {"n": n, "g": g, "known": None if known is None else {"bw": known[0], "rw": known[1]}}
            for preset in presets:
                row["posterior"][preset["id"]] = posterior(settings, ll, preset["weights"])
            rows.append(row)
        out = OUT / path.name
        out.write_text(json.dumps({"machine": machine["id"], "cases": rows}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{out.relative_to(ROOT)}: {len(rows)} cases")


def brute_lik(pb, pr, pg, N, b, r, n, g, known):
    """遊技区間（n ゲーム: BIG/REG/ぶどう/その他）と残り（N−n ゲーム: BIG/REG/それ以外）を総当たり"""
    po = 1 - pb - pr - pg
    total = 0.0
    bws = [known[0]] if known else range(0, min(b, n) + 1)
    for bw in bws:
        rws = [known[1]] if known else range(0, min(r, n - bw) + 1)
        for rw in rws:
            rest = n - bw - rw - g
            if rest < 0 or b - bw < 0 or r - rw < 0:
                continue
            m = N - n
            out_rest = m - (b - bw) - (r - rw)
            if out_rest < 0:
                continue
            total += math.exp(
                multinomial.logpmf([bw, rw, g, rest], n, [pb, pr, pg, po])
                + (multinomial.logpmf([b - bw, r - rw, out_rest], m, [pb, pr, 1 - pb - pr]) if m > 0 else 0.0)
            )
    return total


def brute():
    """小さな N のすべての入力で、§4.3 の式（の尤度比）が総当たりと一致するか確かめる"""
    params = [(0.06, 0.04, 0.2), (0.08, 0.05, 0.17)]  # 2つの架空の設定（差がはっきりするよう大きめの確率）
    worst = 0.0
    checked = 0
    for N in range(1, 9):
        for n in range(0, N + 1):
            for b in range(0, N + 1):
                for r in range(0, N + 1 - b):
                    for g in range(0, min(n, N - b - r) + 1):
                        for known_mode in (False, True):
                            knowns = [None]
                            if known_mode:
                                knowns = [(bw, rw) for bw in range(0, min(b, n) + 1) for rw in range(0, min(r, n - bw) + 1)
                                          if n - bw - rw >= g and (N - n) >= (b - bw) + (r - rw)]
                            for known in knowns:
                                lls = []
                                for pb, pr, pg in params:
                                    ll = multinomial.logpmf([b, r, N - b - r], N, [pb, pr, 1 - pb - pr])
                                    q = pg / (1 - pb - pr)
                                    if known is not None:
                                        bw, rw = known
                                        # 区間内のボーナスの配置の確率は設定によらない（多変量超幾何）ので、尤度比では消える
                                        ll += binom.logpmf(g, n - bw - rw, q)
                                    else:
                                        T = b + r
                                        ks = range(max(0, n - (N - T)), min(n, T) + 1)
                                        ll += logsumexp([hypergeom.logpmf(k, N, T, n) + binom.logpmf(g, n - k, q) for k in ks])
                                    lls.append(ll)
                                bs = [brute_lik(pb, pr, pg, N, b, r, n, g, known) for pb, pr, pg in params]
                                if bs[0] == 0 or bs[1] == 0:
                                    raise SystemExit(f"impossible case slipped through: {(N, n, b, r, g, known)}")
                                # 設定間の尤度比が一致すれば、事後確率も一致する
                                diff = abs((lls[0] - lls[1]) - (math.log(bs[0]) - math.log(bs[1])))
                                worst = max(worst, diff)
                                checked += 1
    print(f"brute-force: {checked} cases, worst |Δ log likelihood ratio| = {worst:.3e}")
    if worst > 1e-9:
        raise SystemExit("MISMATCH")


if __name__ == "__main__":
    if "--brute" in sys.argv:
        brute()
    else:
        generate()
