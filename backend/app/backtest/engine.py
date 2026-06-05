from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Public models
# ---------------------------------------------------------------------------

class BacktestConfig(BaseModel):
    ticker: str
    start_date: str  # YYYY-MM-DD
    end_date: str
    initial_capital: float = 100_000.0
    commission_pct: float = 0.001
    slippage_pct: float = 0.0005


class Signal(BaseModel):
    date: str
    action: str  # "BUY" or "SELL"
    price: float
    size_pct: float
    reason: str


class BacktestResult(BaseModel):
    signals: list[Signal]
    total_return_pct: float
    win_rate: float
    sharpe_ratio: float
    sortino_ratio: float = 0.0
    cagr_pct: float = 0.0
    max_drawdown_pct: float
    equity_curve: list[dict]  # [{date, equity}]
    final_equity: float


# ---------------------------------------------------------------------------
# Strategy context (injected into user code as `ctx`)
# ---------------------------------------------------------------------------

@dataclass
class StrategyContext:
    _opens: np.ndarray
    _highs: np.ndarray
    _lows: np.ndarray
    _closes: np.ndarray
    _volumes: np.ndarray
    _dates: list[str]
    _cash: float
    _position: float  # shares held
    _commission_pct: float
    _slippage_pct: float
    _signals: list[Signal] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Raw data
    # ------------------------------------------------------------------

    @property
    def opens(self) -> np.ndarray:
        return self._opens

    @property
    def highs(self) -> np.ndarray:
        return self._highs

    @property
    def lows(self) -> np.ndarray:
        return self._lows

    @property
    def closes(self) -> np.ndarray:
        return self._closes

    @property
    def volumes(self) -> np.ndarray:
        return self._volumes

    @property
    def current_price(self) -> float:
        return float(self._closes[-1])

    @property
    def position(self) -> float:
        return self._position

    @property
    def cash(self) -> float:
        return self._cash

    @property
    def equity(self) -> float:
        return self._cash + self._position * self.current_price

    # ------------------------------------------------------------------
    # Indicators
    # ------------------------------------------------------------------

    def sma(self, period: int) -> float:
        """Simple moving average of closes over `period` bars."""
        arr = self._closes
        if len(arr) < period:
            return float("nan")
        return float(np.mean(arr[-period:]))

    def ema(self, period: int) -> float:
        """Exponential moving average of closes over `period` bars."""
        arr = self._closes
        if len(arr) < period:
            return float("nan")
        s = pd.Series(arr)
        return float(s.ewm(span=period, adjust=False).mean().iloc[-1])

    def rsi(self, period: int = 14) -> float:
        """Relative Strength Index."""
        arr = self._closes
        if len(arr) < period + 1:
            return float("nan")
        s = pd.Series(arr)
        delta = s.diff()
        gain = delta.clip(lower=0)
        loss = (-delta).clip(lower=0)
        avg_gain = gain.ewm(com=period - 1, adjust=False).mean()
        avg_loss = loss.ewm(com=period - 1, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi_val = 100 - (100 / (1 + rs))
        return float(rsi_val.iloc[-1])

    def macd(self, fast: int = 12, slow: int = 26, signal: int = 9) -> dict:
        """MACD indicator. Returns dict with macd, signal, histogram."""
        arr = self._closes
        if len(arr) < slow + signal:
            nan = float("nan")
            return {"macd": nan, "signal": nan, "histogram": nan}
        s = pd.Series(arr)
        ema_fast = s.ewm(span=fast, adjust=False).mean()
        ema_slow = s.ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line
        return {
            "macd": float(macd_line.iloc[-1]),
            "signal": float(signal_line.iloc[-1]),
            "histogram": float(histogram.iloc[-1]),
        }

    def bollinger(self, period: int = 20, std: float = 2.0) -> dict:
        """Bollinger Bands. Returns dict with upper, middle, lower."""
        arr = self._closes
        if len(arr) < period:
            nan = float("nan")
            return {"upper": nan, "middle": nan, "lower": nan}
        s = pd.Series(arr[-period:])
        middle = float(s.mean())
        deviation = float(s.std(ddof=1)) * std
        return {
            "upper": middle + deviation,
            "middle": middle,
            "lower": middle - deviation,
        }

    # ------------------------------------------------------------------
    # Orders
    # ------------------------------------------------------------------

    def buy(self, size_pct: float = 1.0, reason: str = "") -> None:
        """Buy using `size_pct` of available cash."""
        if self._position > 0:
            return  # already long
        size_pct = max(0.0, min(1.0, size_pct))
        price = self.current_price * (1 + self._slippage_pct)
        cash_to_use = self._cash * size_pct
        commission = cash_to_use * self._commission_pct
        net_cash = cash_to_use - commission
        if net_cash <= 0:
            return
        shares = net_cash / price
        self._position += shares
        self._cash -= cash_to_use
        self._signals.append(Signal(
            date=self._dates[-1],
            action="BUY",
            price=round(price, 4),
            size_pct=size_pct,
            reason=reason,
        ))

    def sell(self, size_pct: float = 1.0, reason: str = "") -> None:
        """Sell `size_pct` of current position."""
        if self._position <= 0:
            return  # no position
        size_pct = max(0.0, min(1.0, size_pct))
        shares_to_sell = self._position * size_pct
        price = self.current_price * (1 - self._slippage_pct)
        gross = shares_to_sell * price
        commission = gross * self._commission_pct
        self._cash += gross - commission
        self._position -= shares_to_sell
        self._signals.append(Signal(
            date=self._dates[-1],
            action="SELL",
            price=round(price, 4),
            size_pct=size_pct,
            reason=reason,
        ))


# ---------------------------------------------------------------------------
# Sandbox execution
# ---------------------------------------------------------------------------

_SAFE_BUILTINS: dict[str, Any] = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "len": len,
    "range": range,
    "int": int,
    "float": float,
    "bool": bool,
    "str": str,
    "list": list,
    "dict": dict,
    "tuple": tuple,
    "isinstance": isinstance,
    "print": print,
    "True": True,
    "False": False,
    "None": None,
    "math": math,
}


def _exec_algorithm(algorithm_code: str, ctx: StrategyContext) -> None:
    """Execute user-supplied algorithm code in a restricted namespace."""
    namespace: dict[str, Any] = {
        "__builtins__": _SAFE_BUILTINS,
        "ctx": ctx,
    }
    try:
        exec(compile(algorithm_code, "<algorithm>", "exec"), namespace)  # noqa: S102
    except Exception as exc:
        raise ValueError(f"Algorithm error: {exc}") from exc


# ---------------------------------------------------------------------------
# Metrics helpers
# ---------------------------------------------------------------------------

def _compute_win_rate(signals: list[Signal]) -> float:
    """Pair BUY/SELL signals and compute win rate."""
    buys: list[Signal] = []
    trades: list[tuple[float, float]] = []
    for sig in signals:
        if sig.action == "BUY":
            buys.append(sig)
        elif sig.action == "SELL" and buys:
            entry = buys.pop(0)
            trades.append((entry.price, sig.price))
    if not trades:
        return 0.0
    wins = sum(1 for buy_p, sell_p in trades if sell_p > buy_p)
    return wins / len(trades)


def _compute_sharpe(equity_curve: list[float], risk_free_rate: float = 0.0) -> float:
    """Annualised Sharpe ratio from daily equity values."""
    if len(equity_curve) < 2:
        return 0.0
    arr = np.array(equity_curve, dtype=float)
    returns = np.diff(arr) / arr[:-1]
    excess = returns - risk_free_rate / 252
    std = float(np.std(excess, ddof=1))
    if std == 0:
        return 0.0
    return float(np.mean(excess) / std * math.sqrt(252))


def _compute_sortino(equity_curve: list[float], risk_free_rate: float = 0.0) -> float:
    """Annualised Sortino ratio — like Sharpe but only penalises downside vol."""
    if len(equity_curve) < 2:
        return 0.0
    arr = np.array(equity_curve, dtype=float)
    returns = np.diff(arr) / arr[:-1]
    excess = returns - risk_free_rate / 252
    downside = excess[excess < 0]
    if len(downside) == 0:
        return 0.0
    dd = float(np.std(downside, ddof=1))
    if dd == 0:
        return 0.0
    return float(np.mean(excess) / dd * math.sqrt(252))


def _compute_cagr(equity_curve: list[float], n_days: int) -> float:
    """Compound annual growth rate (%) from the equity curve length."""
    if len(equity_curve) < 2 or n_days <= 0:
        return 0.0
    start, end = equity_curve[0], equity_curve[-1]
    if start <= 0:
        return 0.0
    years = n_days / 252.0
    if years <= 0:
        return 0.0
    return float(((end / start) ** (1 / years) - 1) * 100)


def _compute_max_drawdown(equity_curve: list[float]) -> float:
    """Maximum drawdown as a positive percentage."""
    if len(equity_curve) < 2:
        return 0.0
    arr = np.array(equity_curve, dtype=float)
    peak = np.maximum.accumulate(arr)
    drawdown = (arr - peak) / peak
    return float(-np.min(drawdown) * 100)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_backtest(config: BacktestConfig, algorithm_code: str) -> BacktestResult:
    """Download OHLCV data and run the user algorithm bar-by-bar."""
    # Download data
    raw = yf.download(
        config.ticker,
        start=config.start_date,
        end=config.end_date,
        auto_adjust=True,
        progress=False,
    )
    if raw.empty:
        raise ValueError(f"No price data found for {config.ticker!r} in the given date range.")

    # Flatten MultiIndex columns if present (yfinance >= 0.2.x)
    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.get_level_values(0)

    opens = raw["Open"].to_numpy(dtype=float)
    highs = raw["High"].to_numpy(dtype=float)
    lows = raw["Low"].to_numpy(dtype=float)
    closes = raw["Close"].to_numpy(dtype=float)
    volumes = raw["Volume"].to_numpy(dtype=float)
    dates = [str(d.date()) for d in raw.index]

    cash = config.initial_capital
    position = 0.0
    all_signals: list[Signal] = []
    equity_curve_values: list[float] = []
    equity_curve_dates: list[str] = []

    for i in range(len(dates)):
        ctx = StrategyContext(
            _opens=opens[: i + 1],
            _highs=highs[: i + 1],
            _lows=lows[: i + 1],
            _closes=closes[: i + 1],
            _volumes=volumes[: i + 1],
            _dates=dates[: i + 1],
            _cash=cash,
            _position=position,
            _commission_pct=config.commission_pct,
            _slippage_pct=config.slippage_pct,
        )

        _exec_algorithm(algorithm_code, ctx)

        # Carry state forward
        cash = ctx._cash
        position = ctx._position
        all_signals.extend(ctx._signals)

        equity = cash + position * closes[i]
        equity_curve_values.append(equity)
        equity_curve_dates.append(dates[i])

    final_equity = cash + position * closes[-1]
    total_return_pct = (final_equity - config.initial_capital) / config.initial_capital * 100
    win_rate = _compute_win_rate(all_signals)
    sharpe = _compute_sharpe(equity_curve_values)
    sortino = _compute_sortino(equity_curve_values)
    cagr = _compute_cagr(equity_curve_values, len(equity_curve_values))
    max_dd = _compute_max_drawdown(equity_curve_values)

    equity_curve = [
        {"date": d, "equity": round(e, 2)}
        for d, e in zip(equity_curve_dates, equity_curve_values)
    ]

    return BacktestResult(
        signals=all_signals,
        total_return_pct=round(total_return_pct, 4),
        win_rate=round(win_rate, 4),
        sharpe_ratio=round(sharpe, 4),
        sortino_ratio=round(sortino, 4),
        cagr_pct=round(cagr, 4),
        max_drawdown_pct=round(max_dd, 4),
        equity_curve=equity_curve,
        final_equity=round(final_equity, 2),
    )
