from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, stocks, analyze, billing, webhooks, websocket, strategies, nodes, backtest, llm
from app.api.discovery import router as discovery_router
from app.api.portfolio import router as portfolio_router
from app.api.workflows import router as workflows_router
from app.api.reports import router as reports_router
from app.api.screener import router as screener_router
from app.api.usage import router as usage_router
from app.api.political import router as political_router
from app.api.digest import router as digest_router
from app.api.watch import router as watch_router
from app.api.eval import router as eval_router

app = FastAPI(title="AI Stock Analysis API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(stocks.router, prefix="/stocks", tags=["stocks"])
app.include_router(analyze.router, prefix="/analyze", tags=["analyze"])
app.include_router(billing.router, prefix="/billing", tags=["billing"])
app.include_router(webhooks.router, prefix="/webhook", tags=["webhooks"])
app.include_router(websocket.router, tags=["websocket"])
app.include_router(strategies.router, prefix="/strategies", tags=["strategies"])
app.include_router(nodes.router, prefix="/nodes", tags=["nodes"])
app.include_router(backtest.router, prefix="/backtest", tags=["backtest"])
app.include_router(llm.router, prefix="/llm", tags=["llm"])
app.include_router(discovery_router, prefix="/discovery", tags=["discovery"])
app.include_router(portfolio_router, prefix="/portfolio", tags=["portfolio"])
app.include_router(workflows_router, prefix="/workflows", tags=["workflows"])
app.include_router(reports_router, prefix="/reports", tags=["reports"])
app.include_router(screener_router, prefix="/screener", tags=["screener"])
app.include_router(usage_router, prefix="/usage", tags=["usage"])
app.include_router(political_router, prefix="/political", tags=["political"])
app.include_router(digest_router, prefix="/digest", tags=["digest"])
app.include_router(watch_router, prefix="/watch", tags=["watch"])
app.include_router(eval_router, prefix="/eval", tags=["eval"])


@app.get("/health")
async def health():
    return {"status": "ok"}
