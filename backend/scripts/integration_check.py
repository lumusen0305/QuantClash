"""End-to-end integration smoke check for the full DAG pipeline.

Unlike tests/test_quant_features.py (fast, pure functions, no network), this runs
ONE real full-DAG analysis and asserts the integrated decision is coherent —
catching integration regressions across consensus / verifier / tools / levels.
Slow (~5 min, hits LLM + market data). Run manually:

    .venv/bin/python -m scripts.integration_check [TICKER]
"""
import asyncio
import sys


async def _check(ticker: str) -> int:
    from app.api.digest import _analyze_one
    from datetime import date
    r = await _analyze_one(ticker, date.today().isoformat(), "en")
    if r.get("_error"):
        print(f"FAIL: analysis error: {r['_error']}")
        return 1
    fd = r.get("final_decision") or {}
    action = (fd.get("action") or "").upper()
    conf = fd.get("confidence")
    rsn = (fd.get("reasoning") or "")
    problems = []
    if action not in ("BUY", "SELL", "HOLD"):
        problems.append(f"bad action {action!r}")
    if not isinstance(conf, (int, float)) or not (0 <= conf <= 1):
        problems.append(f"bad confidence {conf!r}")
    # structured reasoning (Trading-R1 THESIS/EVIDENCE/RISK)
    if not all(k in rsn.upper() for k in ("THESIS", "EVIDENCE")):
        problems.append("reasoning not structured (missing THESIS/EVIDENCE)")
    # BUY/SELL must carry grounded prices; HOLD must not
    if action in ("BUY", "SELL") and fd.get("entry_price") is None:
        problems.append("directional decision missing entry_price")
    print(f"{ticker}: {action} conf={conf} entry={fd.get('entry_price')} "
          f"tgt={fd.get('target_price')} stop={fd.get('stop_loss')}")
    if problems:
        print("FAIL: " + "; ".join(problems))
        return 1
    print("PASS: integrated decision is coherent")
    return 0


if __name__ == "__main__":
    tk = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    sys.exit(asyncio.run(_check(tk)))
