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

NODE_FUNCTIONS: dict[str, object] = {
    "market_analyst": market_analyst_node,
    "sentiment_analyst": sentiment_analyst_node,
    "news_analyst": news_analyst_node,
    "fundamentals_analyst": fundamentals_analyst_node,
    "macro_analyst": macro_analyst_node,
    "market_research_analyst": market_research_analyst_node,
    "bull_researcher": bull_researcher_node,
    "bear_researcher": bear_researcher_node,
    "research_manager": research_manager_node,
    "trader": trader_node,
    "aggressive_risk": aggressive_risk_node,
    "conservative_risk": conservative_risk_node,
    "neutral_risk": neutral_risk_node,
    "portfolio_manager": portfolio_manager_node,
}

_EDGE_SENTINELS = {"START": START, "END": END}


def compile_strategy(dag_config: dict):
    """Compile a LangGraph StateGraph from a DAG config dict.

    dag_config format:
        {
            "nodes": [{"id": "n1", "type": "market_analyst", "config": {...}}, ...],
            "edges": [{"from": "START", "to": "n1"}, {"from": "n1", "to": "END"}, ...],
        }
    """
    workflow = StateGraph(AnalysisState)

    for node in dag_config["nodes"]:
        node_id: str = node["id"]
        node_type: str = node["type"]
        fn = NODE_FUNCTIONS.get(node_type)
        if fn is None:
            raise ValueError(f"Unknown node type: {node_type!r}")
        workflow.add_node(node_id, fn)

    for edge in dag_config["edges"]:
        src = _EDGE_SENTINELS.get(edge["from"], edge["from"])
        dst = _EDGE_SENTINELS.get(edge["to"], edge["to"])
        workflow.add_edge(src, dst)

    return workflow.compile()


async def run_custom_analysis(
    dag_config: dict,
    ticker: str,
    trade_date: str,
    user_tier: str,
    task_id: str,
    progress_callback=None,
    language: str | None = None,
) -> dict:
    graph = compile_strategy(dag_config)

    # Extract per-node custom prompts from DAG config, keyed by node type
    custom_prompts: dict = {}
    for node in dag_config.get("nodes", []):
        node_type = node.get("type", "")
        cp = node.get("config", {}).get("custom_prompt", "")
        if cp and node_type:
            custom_prompts[node_type] = cp

    initial_state = {
        "ticker": ticker,
        "trade_date": trade_date,
        "user_tier": user_tier,
        "task_id": task_id,
        "language": language,
        "messages": [],
        "bull_arguments": [],
        "bear_arguments": [],
        "risk_debate": [],
        "progress_callback": progress_callback,
        "custom_prompts": custom_prompts if custom_prompts else None,
    }

    if progress_callback:
        await progress_callback(AnalysisProgress(
            stage="start",
            message=f"Starting custom analysis for {ticker}...",
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
