"""Registry of available Agent nodes for DAG construction."""

NODE_REGISTRY: dict[str, dict] = {
    "market_analyst": {
        "name": "Market Analyst",
        "category": "analysts",
        "description": "Technical analysis using RSI, MACD, Bollinger Bands from OHLCV data",
        "config_schema": {
            "lookback_period": {"type": "string", "default": "6mo", "options": ["1mo", "3mo", "6mo", "1y"]},
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": [],
        "output_keys": ["market_report"],
    },
    "sentiment_analyst": {
        "name": "Sentiment Analyst",
        "category": "analysts",
        "description": "Social media and market sentiment analysis",
        "config_schema": {
            "sources": {"type": "string", "default": "all", "options": ["reddit", "twitter", "all"]},
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": [],
        "output_keys": ["sentiment_report"],
    },
    "news_analyst": {
        "name": "News Analyst",
        "category": "analysts",
        "description": "Financial news analysis and impact assessment",
        "config_schema": {
            "lookback_days": {"type": "number", "default": 7},
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": [],
        "output_keys": ["news_report"],
    },
    "fundamentals_analyst": {
        "name": "Fundamentals Analyst",
        "category": "analysts",
        "description": "Fundamental analysis: PE, ROE, revenue growth, balance sheet",
        "config_schema": {
            "focus": {"type": "string", "default": "all", "options": ["value", "growth", "all"]},
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": [],
        "output_keys": ["fundamentals_report"],
    },
    "market_research_analyst": {
        "name": "Market Research Analyst",
        "category": "analysts",
        "description": "Market research: hot stocks, sector heat, alternative picks",
        "config_schema": {
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": [],
        "output_keys": ["market_research_report"],
    },
    "macro_analyst": {
        "name": "Macro Analyst",
        "category": "analysts",
        "description": "Macro/geopolitical analysis: indices, VIX, yields, commodities, wars, Fed policy",
        "config_schema": {
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": [],
        "output_keys": ["macro_report"],
    },
    "bull_researcher": {
        "name": "Bull Researcher",
        "category": "debaters",
        "description": "Constructs bullish arguments from analyst reports",
        "config_schema": {
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": ["market_report", "sentiment_report", "news_report", "fundamentals_report", "macro_report"],
        "output_keys": ["bull_arguments"],
    },
    "bear_researcher": {
        "name": "Bear Researcher",
        "category": "debaters",
        "description": "Constructs bearish arguments from analyst reports",
        "config_schema": {
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": ["market_report", "sentiment_report", "news_report", "fundamentals_report", "macro_report"],
        "output_keys": ["bear_arguments"],
    },
    "research_manager": {
        "name": "Research Manager",
        "category": "managers",
        "description": "Synthesizes bull and bear arguments into a research verdict",
        "config_schema": {
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": ["bull_arguments", "bear_arguments"],
        "output_keys": ["research_verdict"],
    },
    "portfolio_manager": {
        "name": "Portfolio Manager",
        "category": "managers",
        "description": "Makes final BUY/SELL/HOLD decision with target price and stop loss",
        "config_schema": {
            "style": {"type": "string", "default": "balanced", "options": ["conservative", "balanced", "aggressive"]},
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": ["research_verdict", "risk_verdict"],
        "output_keys": ["final_decision"],
    },
    "aggressive_risk": {
        "name": "Aggressive Risk Debater",
        "category": "debaters",
        "description": "Argues for higher risk tolerance and larger positions",
        "config_schema": {
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": ["trader_plan"],
        "output_keys": ["risk_debate"],
    },
    "conservative_risk": {
        "name": "Conservative Risk Debater",
        "category": "debaters",
        "description": "Argues for lower risk tolerance and capital preservation",
        "config_schema": {
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": ["trader_plan"],
        "output_keys": ["risk_debate"],
    },
    "neutral_risk": {
        "name": "Neutral Risk Debater",
        "category": "debaters",
        "description": "Provides balanced risk assessment weighing both sides",
        "config_schema": {
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": ["trader_plan"],
        "output_keys": ["risk_debate"],
    },
    "trader": {
        "name": "Trader",
        "category": "managers",
        "description": "Creates a trading plan based on research verdict",
        "config_schema": {
            "custom_prompt": {"type": "text", "default": ""},
        },
        "input_keys": ["research_verdict"],
        "output_keys": ["trader_plan"],
    },
}


def get_node_info(node_type: str) -> dict | None:
    return NODE_REGISTRY.get(node_type)


def list_nodes_by_category() -> dict[str, list[dict]]:
    categories: dict[str, list[dict]] = {}
    for node_type, info in NODE_REGISTRY.items():
        cat = info["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append({"type": node_type, **info})
    return categories
