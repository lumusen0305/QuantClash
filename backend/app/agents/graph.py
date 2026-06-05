import asyncio
from langgraph.graph import StateGraph, START, END

from app.agents.schemas import AnalysisState, AnalysisProgress
from app.agents.analysts.market_analyst import market_analyst_node
from app.agents.analysts.sentiment_analyst import sentiment_analyst_node
from app.agents.analysts.news_analyst import news_analyst_node
from app.agents.analysts.fundamentals_analyst import fundamentals_analyst_node
from app.agents.analysts.macro_analyst import macro_analyst_node
from app.agents.analysts.market_research_analyst import market_research_analyst_node
from app.agents.researchers.bull_researcher import bull_researcher_node
from app.agents.researchers.bear_researcher import bear_researcher_node
from app.agents.managers.research_manager import research_manager_node
from app.agents.trader import trader_node
from app.agents.risk.aggressive_debator import aggressive_risk_node
from app.agents.risk.conservative_debator import conservative_risk_node
from app.agents.risk.neutral_debator import neutral_risk_node
from app.agents.managers.portfolio_manager import portfolio_manager_node


def create_analysis_graph():
    workflow = StateGraph(AnalysisState)

    # Analyst nodes (run in parallel from START)
    workflow.add_node("market_analyst", market_analyst_node)
    workflow.add_node("sentiment_analyst", sentiment_analyst_node)
    workflow.add_node("news_analyst", news_analyst_node)
    workflow.add_node("fundamentals_analyst", fundamentals_analyst_node)
    workflow.add_node("macro_analyst", macro_analyst_node)
    workflow.add_node("market_research_analyst", market_research_analyst_node)

    # Research debate nodes
    workflow.add_node("bull_researcher", bull_researcher_node)
    workflow.add_node("bear_researcher", bear_researcher_node)
    workflow.add_node("research_manager", research_manager_node)

    # Trader
    workflow.add_node("trader", trader_node)

    # Risk debate nodes (run in parallel from trader)
    workflow.add_node("aggressive_risk", aggressive_risk_node)
    workflow.add_node("conservative_risk", conservative_risk_node)
    workflow.add_node("neutral_risk", neutral_risk_node)

    # Portfolio manager
    workflow.add_node("portfolio_manager", portfolio_manager_node)

    # Parallel analysts from START
    workflow.add_edge(START, "market_analyst")
    workflow.add_edge(START, "sentiment_analyst")
    workflow.add_edge(START, "news_analyst")
    workflow.add_edge(START, "fundamentals_analyst")
    workflow.add_edge(START, "macro_analyst")
    workflow.add_edge(START, "market_research_analyst")

    # All 6 analysts fan-in to both researcher nodes
    for analyst in ("market_analyst", "sentiment_analyst", "news_analyst", "fundamentals_analyst", "macro_analyst", "market_research_analyst"):
        workflow.add_edge(analyst, "bull_researcher")
        workflow.add_edge(analyst, "bear_researcher")

    # Research debate → manager → trader
    workflow.add_edge("bull_researcher", "research_manager")
    workflow.add_edge("bear_researcher", "research_manager")
    workflow.add_edge("research_manager", "trader")

    # Trader → parallel risk debate
    workflow.add_edge("trader", "aggressive_risk")
    workflow.add_edge("trader", "conservative_risk")
    workflow.add_edge("trader", "neutral_risk")

    # Risk debate fan-in → portfolio manager
    workflow.add_edge("aggressive_risk", "portfolio_manager")
    workflow.add_edge("conservative_risk", "portfolio_manager")
    workflow.add_edge("neutral_risk", "portfolio_manager")

    workflow.add_edge("portfolio_manager", END)

    return workflow.compile()


async def run_analysis(
    ticker: str,
    trade_date: str,
    user_tier: str,
    task_id: str = "",
    progress_callback=None,
    language: str | None = None,
    risk_style: str | None = None,
) -> dict:
    graph = create_analysis_graph()
    initial_state = {
        "ticker": ticker,
        "trade_date": trade_date,
        "user_tier": user_tier,
        "task_id": task_id,
        "language": language,
        "risk_style": risk_style or "balanced",
        "messages": [],
        "bull_arguments": [],
        "bear_arguments": [],
        "risk_debate": [],
        "progress_callback": progress_callback,
    }

    if progress_callback:
        await progress_callback(AnalysisProgress(
            stage="start",
            message=f"Starting analysis for {ticker}...",
            progress_pct=0.0,
        ))

    result = await graph.ainvoke(initial_state)

    if progress_callback:
        await progress_callback(AnalysisProgress(
            stage="complete",
            message="Analysis complete.",
            progress_pct=100.0,
        ))

    return result
