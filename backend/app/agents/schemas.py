import operator
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel
from langgraph.graph import MessagesState


class AnalystReport(BaseModel):
    analyst_type: str
    summary: str
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float  # 0.0-1.0
    key_evidence: list[str]
    key_risks: list[str]


class DebateMessage(BaseModel):
    role: str  # "bull" | "bear" | "aggressive" | "conservative" | "neutral"
    content: str
    round: int


class AnalysisProgress(BaseModel):
    stage: str
    message: str
    data: Optional[dict] = None
    progress_pct: float  # 0-100


class FinalDecision(BaseModel):
    action: Literal["BUY", "SELL", "HOLD"]
    confidence: float
    reasoning: str
    entry_price: Optional[float] = None  # suggested entry / buy price
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    time_horizon: str = "1M"  # "1W", "1M", "3M"


class AnalysisState(MessagesState):
    ticker: str
    trade_date: str
    user_tier: str
    task_id: str
    language: Optional[str]  # e.g. "en", "zh-TW"
    risk_style: Optional[str]  # "conservative" | "balanced" | "aggressive"

    # Analyst reports (filled in parallel)
    market_report: Optional[AnalystReport]
    sentiment_report: Optional[AnalystReport]
    news_report: Optional[AnalystReport]
    fundamentals_report: Optional[AnalystReport]
    macro_report: Optional[AnalystReport]
    market_research_report: Optional[AnalystReport]

    # Research debate
    bull_arguments: Annotated[list[DebateMessage], operator.add]
    bear_arguments: Annotated[list[DebateMessage], operator.add]
    research_verdict: Optional[str]

    # Trader
    trader_plan: Optional[str]

    # Risk debate
    risk_debate: Annotated[list[DebateMessage], operator.add]
    risk_verdict: Optional[str]

    # Final
    final_decision: Optional[FinalDecision]

    # Progress callback
    progress_callback: Optional[Any]  # callable(AnalysisProgress)

    # Per-node custom prompts: keyed by node type (e.g. "market", "sentiment")
    custom_prompts: Optional[dict]  # {"market": "...", "sentiment": "..."}
