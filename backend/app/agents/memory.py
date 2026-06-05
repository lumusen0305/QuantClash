import sqlite3
import json
import os
from datetime import datetime
from pathlib import Path


class AnalysisMemory:
    def __init__(self, db_path: str = "~/.stockapp/memory.db"):
        expanded = os.path.expanduser(db_path)
        Path(expanded).parent.mkdir(parents=True, exist_ok=True)
        self.db_path = expanded
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticker TEXT NOT NULL,
                    trade_date TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ticker ON analyses(ticker)")
            conn.commit()

    def _rows(self, ticker: str, limit: int = 5) -> list[tuple]:
        with sqlite3.connect(self.db_path) as conn:
            return conn.execute(
                """
                SELECT trade_date, decision FROM analyses
                WHERE ticker = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (ticker, limit),
            ).fetchall()

    @staticmethod
    def _levels(ticker: str) -> dict | None:
        """Current price + technical levels for outcome scoring + regime check.
        Lazy import avoids any import cycle."""
        try:
            from app.agents.pricing_tools import compute_levels
            return compute_levels(ticker)
        except Exception:
            return None

    @staticmethod
    def _current_price(ticker: str) -> float | None:
        lv = AnalysisMemory._levels(ticker)
        return lv["current_price"] if lv else None

    @staticmethod
    def _regime_shift_warning(levels: dict | None) -> str:
        """Circuit-breaker (arXiv 2505.16067 experience-following + 2603.27539
        §6.1): when current volatility is ELEVATED, the market regime has likely
        shifted, so blindly following past experiences (anchoring) is dangerous.
        Tell the model to DOWN-WEIGHT the history below."""
        if not levels:
            return ""
        atr = levels.get("atr14")
        price = levels.get("current_price")
        adx = levels.get("adx14")
        if not atr or not price:
            return ""
        atr_ratio = atr / price
        # >4% daily ATR = high volatility; ADX>30 = strong (possibly new) trend
        if atr_ratio > 0.04 or (isinstance(adx, (int, float)) and adx > 30):
            return (
                f"⚠ REGIME-SHIFT CIRCUIT BREAKER: current volatility is elevated "
                f"(ATR {atr_ratio:.1%} of price"
                + (f", ADX {adx:.0f}" if isinstance(adx, (int, float)) else "")
                + "). The market regime may have changed — DOWN-WEIGHT the past "
                "analyses below; do not anchor to prior calls that were made under "
                "different conditions.\n"
            )
        return ""

    @staticmethod
    def _score_decision(decision: dict, cur: float, bench_ret: float | None = None) -> dict | None:
        """Compare a past decision to the current price → realized outcome.

        Returns {pct, correct, alpha, beat_market, hit_target, hit_stop} or None.
        `pct` is the favourable move; `alpha` is that move net of the benchmark
        (SPY) over the same window — a BUY that made +3% while SPY made +10%
        actually UNDERperformed (alpha < 0), so `beat_market` is the real bar
        (mirrors TradingAgents' raw+alpha decision log).
        """
        action = (decision.get("action") or "").upper()
        if action not in ("BUY", "SELL"):
            return None  # HOLD has no directional outcome
        ref = decision.get("entry_price") or decision.get("target_price")
        # Fall back to nothing if we never recorded a price anchor
        if not isinstance(ref, (int, float)) or ref <= 0:
            return None
        raw = (cur - ref) / ref  # signed move of the underlying
        # For SELL the call is "right" when price falls, so flip the sign
        favour = raw if action == "BUY" else -raw
        alpha = None
        beat_market = None
        if isinstance(bench_ret, (int, float)):
            # market leg: long SPY for a BUY, out/short for a SELL
            market_favour = bench_ret if action == "BUY" else -bench_ret
            alpha = favour - market_favour
            beat_market = alpha > 0
        tgt = decision.get("target_price")
        stop = decision.get("stop_loss")
        hit_target = None
        hit_stop = None
        if isinstance(tgt, (int, float)):
            hit_target = (cur >= tgt) if action == "BUY" else (cur <= tgt)
        if isinstance(stop, (int, float)):
            hit_stop = (cur <= stop) if action == "BUY" else (cur >= stop)
        return {
            "pct": favour,
            "correct": favour > 0,
            "alpha": alpha,
            "beat_market": beat_market,
            "hit_target": hit_target,
            "hit_stop": hit_stop,
        }

    def get_context(self, ticker: str) -> str:
        """Past analyses ENRICHED with realized outcomes + a hit-rate, so the
        LLM learns from whether its prior calls actually worked (reflection)."""
        rows = self._rows(ticker, 5)
        if not rows:
            return f"No previous analyses found for {ticker}."

        levels = self._levels(ticker)
        cur = levels["current_price"] if levels else None
        lines = []
        warn = self._regime_shift_warning(levels)
        if warn:
            lines.append(warn)
        lines.append(f"Previous analyses for {ticker} (with realized outcomes):")
        # SPY benchmark series (once) so each past call is scored on ALPHA too.
        spy = None
        try:
            from app.eval.harness import _closes
            spy = _closes("SPY")
        except Exception:
            spy = None
        wins = 0
        scored = 0
        stop_hits = 0
        conf_sum = 0.0
        beat_market = 0
        alpha_scored = 0
        for trade_date, decision_json in rows:
            try:
                decision = json.loads(decision_json)
            except Exception:
                continue
            base = (
                f"  [{trade_date}] {decision.get('action')} "
                f"conf={decision.get('confidence', 0):.0%} "
                f"entry={decision.get('entry_price')} tgt={decision.get('target_price')} "
                f"stop={decision.get('stop_loss')}"
            )
            bench_ret = None
            if spy is not None:
                try:
                    from app.eval.harness import forward_return
                    bench_ret = forward_return("SPY", trade_date, spy)
                except Exception:
                    bench_ret = None
            outcome = self._score_decision(decision, cur, bench_ret) if cur else None
            if outcome:
                scored += 1
                wins += 1 if outcome["correct"] else 0
                if outcome["hit_stop"]:
                    stop_hits += 1
                conf_sum += float(decision.get("confidence") or 0.0)
                tag = "✓RIGHT" if outcome["correct"] else "✗WRONG"
                extra = f" → {tag} ({outcome['pct']:+.1%} in favour"
                if outcome.get("alpha") is not None:
                    alpha_scored += 1
                    beat_market += 1 if outcome["beat_market"] else 0
                    extra += f", α {outcome['alpha']:+.1%} vs SPY"
                    if not outcome["beat_market"]:
                        extra += " (UNDERPERFORMED market)"
                if outcome["hit_target"]:
                    extra += ", hit target"
                if outcome["hit_stop"]:
                    extra += ", hit stop"
                extra += ")"
                base += extra
            lines.append(base)

        if scored:
            rate = wins / scored
            avg_conf = conf_sum / scored
            alpha_note = ""
            if alpha_scored:
                alpha_note = (f" Beat the market (positive alpha) on only "
                              f"{beat_market}/{alpha_scored} — directional 'wins' that "
                              f"trail SPY are not real edge.")
            lines.append(
                f"TRACK RECORD: {wins}/{scored} prior directional calls were correct "
                f"({rate:.0%} hit-rate), avg stated confidence {avg_conf:.0%}.{alpha_note}"
            )
            critique = self._reflect_critique(scored, wins, rate, avg_conf, stop_hits)
            if critique:
                lines.append("REFLECT CRITIQUE (learn from these — adjust this decision): " + critique)
        return "\n".join(lines)

    @staticmethod
    def _reflect_critique(scored: int, wins: int, rate: float,
                          avg_conf: float, stop_hits: int) -> str:
        """Verbal-feedback critique (arXiv 2510.08068): turn the realized
        track record into targeted natural-language lessons that get injected
        into the next decision's prompt — no fine-tuning, just self-correction.
        """
        notes = []
        # Confidence miscalibration: stated confidence >> realized accuracy.
        if scored >= 2 and avg_conf - rate >= 0.20:
            notes.append(
                f"OVERCONFIDENT — stated confidence ({avg_conf:.0%}) far exceeds realized "
                f"accuracy ({rate:.0%}); calibrate confidence DOWN this time."
            )
        if scored >= 3 and rate <= 0.4:
            notes.append(
                "Past calls on this ticker were mostly WRONG; be skeptical, demand "
                "stronger evidence, and prefer HOLD unless the edge is clear."
            )
        if stop_hits >= 2:
            notes.append(
                f"Entries got stopped out {stop_hits}x — entries have been too aggressive; "
                "wait for a pullback / widen the stop, or HOLD."
            )
        if scored >= 3 and rate >= 0.7 and avg_conf - rate < 0.2:
            notes.append("Track record is solid and well-calibrated — act with normal conviction.")
        return " ".join(notes)

    def store(self, ticker: str, date: str, decision: dict):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO analyses (ticker, trade_date, decision, created_at) VALUES (?, ?, ?, ?)",
                (ticker, date, json.dumps(decision), datetime.utcnow().isoformat()),
            )
            conn.commit()
