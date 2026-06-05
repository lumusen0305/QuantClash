# QuantClash v2.0 產品計劃書

## 一句話定位

> **AI Agent 版的 TradingView — 用戶組裝自己的分析團隊、回測算法、在 K 線圖上看到 B/S 信號。**

散戶不缺資訊，缺的是可以客製化、可驗證的分析工具。QuantClash 讓用戶用 DAG 組裝自己的 Agent 分析團隊，搭配自定義算法回測引擎，在 K 線圖上直接看到歷史買賣點，用數據證明策略有效。

---

## 目錄

1. [現況與問題](#1-現況與問題)
2. [市場機會與用戶痛點](#2-市場機會與用戶痛點)
3. [競品分析與社群標竿](#3-競品分析與社群標竿)
4. [核心差異化：三大支柱](#4-核心差異化三大支柱)
5. [Agent DAG 工作流引擎](#5-agent-dag-工作流引擎)
6. [回測引擎與 K 線圖視覺化](#6-回測引擎與-k-線圖視覺化)
7. [倉位管理系統](#7-倉位管理系統)
8. [智慧新聞消化系統](#8-智慧新聞消化系統)
9. [技術架構變更](#9-技術架構變更)
10. [商業模式與定價](#10-商業模式與定價)
11. [監管策略](#11-監管策略)
12. [MVP 範圍與開發計劃](#12-mvp-範圍與開發計劃)
13. [成功指標](#13-成功指標)

---

## 1. 現況與問題

### 1.1 目前架構

QuantClash v1 是一個固定流水線的 AI 股票分析工具：

```
START
  ├── market_analyst       (RSI / MACD / Bollinger)
  ├── sentiment_analyst    (情緒分析)
  ├── news_analyst         (新聞分析)
  └── fundamentals_analyst (基本面分析)
       ↓ (fan-in)
  ├── bull_researcher      (多頭論點)
  └── bear_researcher      (空頭論點)
       ↓
  research_manager → trader
       ↓ (fan-out)
  ├── aggressive_risk      (激進辯論)
  ├── conservative_risk    (保守辯論)
  └── neutral_risk         (中立辯論)
       ↓ (fan-in)
  portfolio_manager → END  → BUY / SELL / HOLD
```

### 1.2 核心問題

| 問題 | 影響 |
|------|------|
| Pipeline 硬編碼，用戶無法客製化 | 無差異化，像玩具 |
| 只輸出 BUY/SELL/HOLD，沒有倉位建議 | 散戶不知道該買多少 |
| 分析是一次性的，不跟蹤持倉 | 用戶不會回來 |
| 散戶不看新聞，不主動觸發分析 | 用戶忘了這個 App |
| Free tier (Ollama) 品質太差 | 轉化率低 |

---

## 2. 市場機會與用戶痛點

### 2.1 核心洞察

**散戶不看新聞。不是因為懶，而是因為：**

1. 太多了 — 不知道哪個跟我的持倉有關
2. 看不懂 — 英文、專業術語、財報數字
3. 不知道影響 — 這個新聞對我的股票是好是壞
4. 不知道怎麼動 — 知道利空也不知道該減多少

現有工具（Yahoo Finance、鉅亨網）解決了 #1，沒有解決 #2/#3/#4。

### 2.2 價值跳躍

```
現有工具：AAPL 發布財報，EPS 超預期 12%
QuantClash：你持有 AAPL 佔倉位 23%，
            這個財報對你是正面的，
            但明天法說會有 guidance 下修風險，
            你設定的波動上限是 25%，目前接近觸發，
            可以考慮先將部分倉位鎖定獲利。
```

**從「資訊」到「針對我的行動提示」** — 這是真正的產品價值。

### 2.3 目標用戶

**主要：「有紀律的散戶」**

- 有投資經驗 1-5 年
- 持有 5-20 支股票
- 知道應該有紀律但做不到
- 願意付 $10-30/月（已在用其他投資工具）
- 不想從零學量化，但想要更聰明的工具

**次要：「想系統化的進階用戶」**

- 會看技術指標，但想自動化
- 想要自定義分析流程（DAG）
- 可能有程式基礎

---

## 3. 競品分析與社群標竿

### 3.1 開源社群標竿

#### virattt/ai-hedge-fund（GitHub 30k+ stars）

- 多 Agent 架構（technical、fundamentals、sentiment、risk manager、portfolio manager）
- 純 CLI，無 UI，無法互動
- 無倉位管理，無即時新聞
- **我們的機會**：加上持倉追蹤、即時新聞、移動端 UI 就已超越

#### TauricResearch/TradingAgents（學術論文 + code）

- Multi-agent debate 機制（bull/bear debator）
- 加入了 macro analyst、technical analyst 分層
- **核心啟發**：Agent 應該可以被「組合」，不是固定角色
- 論文驗證了多 agent debate 比單 agent 分析有更好的決策品質

#### Flowise / LangFlow（視覺化 LLM 流程編輯器）

- 用戶拖拉節點建立 AI pipeline
- 通用型工具，無金融專門化
- **核心啟發**：視覺化 DAG 編輯器是成熟的 UX 範式，可直接借鑒到量化領域

### 3.2 商業競品

| 競品 | 優勢 | 劣勢 | 我們的機會 |
|------|------|------|-----------|
| Bloomberg Terminal | 數據全面、專業 | $25k/年，機構專用 | 散戶市場空白 |
| Seeking Alpha | 社群分析文章 | 人工為主，不個人化 | AI + 個人持倉 |
| TradingView | Pine Script 社群 | 偏技術分析、無 AI agent | DAG Agent 市場 |
| Robinhood News | 內嵌交易工具 | 新聞是補充，不是核心 | 新聞驅動 + 倉位 |
| Public.com | 社群 + AI 摘要 | 無自定義分析流程 | DAG + 倉位管理 |

### 3.3 關鍵差異

沒有一個現有產品同時做到：

1. 用戶自定義 Agent 分析流程（DAG）
2. 新聞自動消化並連結到個人持倉
3. 基於用戶自己設定的規則給出倉位調整提示

**這三者的交集就是 QuantClash v2 的護城河。**

---

## 4. 核心差異化：三大支柱

```
     ┌─────────────────┐
     │  Agent DAG       │  ← 用戶自定義分析流程
     │  工作流引擎      │
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │  智慧新聞        │  ← AI 消化新聞、連結持倉
     │  消化系統        │
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │  倉位管理        │  ← 基於用戶規則給行動提示
     │  與紀律引擎      │
     └─────────────────┘
```

三者協同：
- DAG 引擎 — 定義「怎麼分析」
- 新聞消化 — 持續提供「分析什麼」
- 倉位管理 — 決定「最終怎麼動」

---

## 5. Agent DAG 工作流引擎

### 5.1 設計理念

從 v1 的硬編碼 Pipeline 進化為用戶可配置的 DAG：

```
v1:  固定 12 節點 pipeline，所有人一樣
v2:  用戶從 Agent 庫選擇節點 → 自由連接 → 儲存為策略模板
```

### 5.2 Agent 節點庫

#### 分析師節點（數據採集 + LLM 分析）

| 節點 | 數據源 | 輸出 | v1 存在 |
|------|--------|------|---------|
| 技術分析師 | yfinance OHLCV | RSI/MACD/BB 信號 | Yes |
| 基本面分析師 | Finnhub financials | PE/ROE/增長信號 | Yes |
| 新聞情緒師 | Finnhub/NewsAPI | 情緒分數 | Yes |
| 情緒分析師 | 社群/Reddit | 市場情緒 | Yes |
| 總體經濟師 | FRED API | 利率/CPI 影響 | New |
| 內部人交易師 | SEC Form 4 / 公開資訊觀測站 | 內部人買賣信號 | New |
| 選擇權流分析師 | unusual whales | 期權異動 | New |
| 機構持倉追蹤 | 13F filings | 大戶動向 | New |
| 自定義分析師 | 用戶自定義 prompt + 數據源 | 任意 | New |

#### 辯論節點（觀點對抗）

| 節點 | 角色 | v1 存在 |
|------|------|---------|
| 多頭辯護 | 尋找所有做多理由 | Yes |
| 空頭辯護 | 尋找所有做空理由 | Yes |
| 魔鬼代言人 | 強制挑戰當前共識 | New |
| 量化純客觀 | 只接受數字，拒絕故事 | New |

#### 決策節點（整合 + 輸出）

| 節點 | 功能 | v1 存在 |
|------|------|---------|
| 研究主管 | 綜合辯論結論 | Yes |
| 風險官 | 評估風險 | Yes |
| 投組經理 | 最終決策 | Yes |
| 量化評分器 | 所有信號轉 0-100 分 | New |
| 倉位計算器 | 依據規則計算具體倉位 | New |

### 5.3 DAG 配置格式

後端以 JSON 格式儲存策略，動態組裝 LangGraph：

```json
{
  "strategy_name": "巴菲特價值流",
  "description": "重基本面、輕技術面的長線策略",
  "nodes": [
    {"id": "n1", "type": "fundamentals_analyst", "config": {"focus": "value_metrics"}},
    {"id": "n2", "type": "news_analyst", "config": {"lookback_days": 30}},
    {"id": "n3", "type": "insider_tracker", "config": {}},
    {"id": "n4", "type": "bull_researcher", "config": {}},
    {"id": "n5", "type": "bear_researcher", "config": {}},
    {"id": "n6", "type": "research_manager", "config": {}},
    {"id": "n7", "type": "portfolio_manager", "config": {"style": "conservative"}}
  ],
  "edges": [
    {"from": "START", "to": "n1"},
    {"from": "START", "to": "n2"},
    {"from": "START", "to": "n3"},
    {"from": "n1", "to": "n4"},
    {"from": "n1", "to": "n5"},
    {"from": "n2", "to": "n4"},
    {"from": "n2", "to": "n5"},
    {"from": "n3", "to": "n6"},
    {"from": "n4", "to": "n6"},
    {"from": "n5", "to": "n6"},
    {"from": "n6", "to": "n7"},
    {"from": "n7", "to": "END"}
  ]
}
```

### 5.4 前端 DAG 編輯器（Flutter）

```
┌──────────────────────────────────────────────────┐
│  我的策略：巴菲特價值流                    [儲存] │
├──────────┬───────────────────────────────────────┤
│          │                                       │
│ Agent庫  │           DAG 畫布                    │
│          │                                       │
│ ┌──────┐ │  [基本面] ──┐                         │
│ │技術  │ │  [新聞]  ───┼→ [多頭] ──┐             │
│ │分析師│ │  [內部人] ──┘  [空頭] ──┼→ [研究] → [決策]│
│ └──────┘ │                        │             │
│ ┌──────┐ │                                       │
│ │基本面│ │                                       │
│ │分析師│ │  ── 點擊節點開啟設定面板 ──            │
│ └──────┘ │  ┌─────────────────────────┐          │
│ ┌──────┐ │  │ 基本面分析師 設定        │          │
│ │新聞  │ │  │ 模型: [Claude Sonnet ▼]  │          │
│ │情緒師│ │  │ 關注: [價值指標 ▼]       │          │
│ └──────┘ │  │ 自定義 Prompt:           │          │
│ ...      │  │ [重視長期自由現金流...]   │          │
│          │  └─────────────────────────┘          │
└──────────┴───────────────────────────────────────┘
```

**技術實現選項：**
- 方案 A：Flutter `CustomPainter` + 手勢處理（全自建）
- 方案 B：嵌入 WebView 使用 React Flow 庫（成熟但有 bridge 開銷）
- **推薦方案 A**，控制力更強，效能更好

### 5.5 策略模板市場

用戶可以：
- 將策略命名並公開分享
- 一鍵 fork 他人的策略模板
- 查看策略的社群評分

社群飛輪：
```
好用戶建立好策略 → 分享 → 吸引新用戶 → fork/改良 → 更多策略 → 循環
```

---

## 6. 回測引擎與 K 線圖視覺化

### 6.1 為什麼回測是核心功能

DAG 策略如果沒有回測，就只是「故事」。回測把故事變成「證據」：

```
沒有回測：「我的策略會賺錢」      → 信仰
有回測：  「過去 2 年勝率 68%，    → 數據
          Sharpe 1.4，Max DD -12%」
```

回測也是策略市場飛輪的基礎 — 用戶不會 fork 一個沒有績效數據的策略。

### 6.2 回測架構

#### 回測 Agent 節點

回測本身是 DAG 裡的一個特殊節點，不是獨立系統：

```
[用戶 DAG 策略] → [回測 Agent 節點] → [績效報告 + K線圖數據]
```

回測 Agent 的工作：
1. 接收 DAG 策略的信號邏輯
2. 對歷史數據逐日/逐根 K 棒模擬執行
3. 記錄每一筆 B/S 信號的進出場點
4. 計算績效指標
5. 輸出可視化數據（K 線 + B/S 標記）

#### 回測引擎後端設計

```python
# backtest/engine.py

class BacktestConfig(BaseModel):
    ticker: str
    start_date: str                    # "2024-01-01"
    end_date: str                      # "2026-05-20"
    initial_capital: float             # 初始資金
    commission_pct: float = 0.001425   # 台股手續費 0.1425%
    tax_pct: float = 0.003             # 台股證交稅 0.3%
    slippage_pct: float = 0.001        # 滑點模擬

class Signal(BaseModel):
    date: str
    action: Literal["BUY", "SELL"]
    price: float
    size_pct: float                    # 佔總資金百分比
    reason: str                        # 觸發原因

class BacktestResult(BaseModel):
    signals: list[Signal]              # 所有 B/S 信號（用於 K 線標記）
    total_return_pct: float
    annual_return_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown_pct: float
    max_drawdown_duration_days: int
    win_rate: float
    profit_factor: float
    total_trades: int
    avg_holding_days: float
    equity_curve: list[dict]           # [{date, equity, drawdown}]
    monthly_returns: list[dict]        # [{month, return_pct}]
```

#### 兩種回測模式

| 模式 | 描述 | 適用場景 |
|------|------|---------|
| **規則回測** | 用戶寫 Python 算法，引擎直接執行 | 有程式能力的用戶 |
| **Agent 回測** | DAG Agent 對每根歷史 K 棒做分析決策 | 無程式能力的用戶 |

##### 模式一：規則回測（用戶自定義算法）

用戶在平台上寫 Python 算法，類似 TradingView 的 Pine Script：

```python
# 用戶寫的策略算法範例
# 平台提供 ctx 物件，包含歷史數據和下單方法

def strategy(ctx):
    closes = ctx.closes
    volumes = ctx.volumes

    # 計算指標
    sma_20 = ctx.sma(closes, 20)
    sma_60 = ctx.sma(closes, 60)
    rsi = ctx.rsi(closes, 14)

    # 黃金交叉 + RSI 未超買 → 買入
    if (sma_20[-1] > sma_60[-1] and
        sma_20[-2] <= sma_60[-2] and
        rsi[-1] < 70):
        ctx.buy(size_pct=0.1, reason="SMA20/60 黃金交叉, RSI={:.1f}".format(rsi[-1]))

    # 死亡交叉 or RSI 超買 → 賣出
    if (sma_20[-1] < sma_60[-1] and sma_20[-2] >= sma_60[-2]):
        ctx.sell(size_pct=1.0, reason="SMA20/60 死亡交叉")
    elif rsi[-1] > 85:
        ctx.sell(size_pct=0.5, reason="RSI 超買 {:.1f}".format(rsi[-1]))
```

平台提供的 `ctx` API：

```python
class StrategyContext:
    # 數據
    opens: np.ndarray          # 開盤價序列
    highs: np.ndarray          # 最高價序列
    lows: np.ndarray           # 最低價序列
    closes: np.ndarray         # 收盤價序列
    volumes: np.ndarray        # 成交量序列
    dates: list[str]           # 日期序列
    current_date: str          # 當前日期
    current_price: float       # 當前收盤價

    # 持倉狀態
    position: float            # 目前持股數
    cash: float                # 目前現金
    equity: float              # 總資產

    # 內建指標函數
    def sma(self, data, period): ...
    def ema(self, data, period): ...
    def rsi(self, data, period): ...
    def macd(self, data, fast, slow, signal): ...
    def bollinger(self, data, period, std): ...
    def atr(self, data, period): ...

    # 下單方法
    def buy(self, size_pct: float, reason: str = ""): ...
    def sell(self, size_pct: float, reason: str = ""): ...
```

**安全性：** 用戶算法在沙箱環境執行（RestrictedPython 或 Docker container），禁止 import、IO、網路存取。

##### 模式二：Agent 回測

對沒有程式能力的用戶，讓 DAG Agent 團隊對歷史數據逐日分析：

```
對 2024-01-01 到 2026-05-20 的每個交易日：
  1. 餵入當日及之前的 K 線數據
  2. 執行用戶的 DAG Agent 策略
  3. 收集 Agent 的 BUY/SELL/HOLD 決策
  4. 記錄信號
```

Agent 回測成本較高（每根 K 棒都要跑 LLM），因此：
- Free 用戶：不可用
- Basic：最多回測 30 個交易日
- Premium：最多 250 個交易日（約 1 年）
- Pro：最多 2500 個交易日（約 10 年）

### 6.3 K 線圖 + B/S 標記（Flutter 前端）

#### UI 設計

```
┌───────────────────────────────────────────────────────┐
│  AAPL │ 日K │ 週K │ 月K │    策略：巴菲特價值流       │
│───────────────────────────────────────────────────────│
│                                                       │
│    ██                                                 │
│    ██  ██                          ██                 │
│   B██  ██  ██      ██  ██         ██  ██             │
│    ██  ██  ██  ██  ██  ██    S██  ██  ██             │
│        ██  ██  ██  ██  ██     ██  ██  ██  ██         │
│            ██  ██      ██     ██      ██  ██         │
│                ██      ██                  ██         │
│                                            ██         │
│  B = 買入點 (綠色三角▲)                               │
│  S = 賣出點 (紅色三角▼)                               │
│                                                       │
│── 成交量 ─────────────────────────────────────────────│
│  ▃▅▂▆▃▇▂▅▃▆▂▃▅▂▃▇▅▂▃▅▇▂▃▅▂▃▅▂▃▆▅▂▃▅▂▃▅▂▃         │
│───────────────────────────────────────────────────────│
│  績效摘要                                             │
│  總報酬: +34.2%  |  勝率: 68%  |  Sharpe: 1.42       │
│  最大回撤: -12.3% |  交易次數: 23  |  平均持有: 18天   │
│                                                       │
│  [查看詳細報告]    [調整策略]    [分享策略]             │
└───────────────────────────────────────────────────────┘
```

#### 點擊 B/S 標記展開詳情

```
┌─────────────────────────────────┐
│  B 買入 │ 2025-03-15            │
│─────────────────────────────────│
│  進場價: $178.50                 │
│  倉位: 10% ($5,000)             │
│  觸發原因:                       │
│    SMA20/60 黃金交叉             │
│    RSI(14) = 42.3 (未超買)       │
│    新聞情緒: +0.7 (偏多)         │
│                                  │
│  結果: 持有 22 天                │
│  出場價: $195.20 (+9.4%)         │
│  盈虧: +$468                     │
└─────────────────────────────────┘
```

#### Flutter 實現

```dart
// K 線圖元件架構
class CandlestickChart extends StatelessWidget {
  final List<CandleData> candles;        // K 線數據
  final List<SignalMarker> signals;      // B/S 信號標記
  final List<double> volumeData;         // 成交量
  final List<IndicatorOverlay> overlays; // 均線等覆蓋指標

  // 使用 CustomPainter 實現完全控制
  // 支援手勢：pinch zoom, pan, tap on signal
}

class SignalMarker {
  final DateTime date;
  final double price;
  final SignalType type;    // buy / sell
  final String reason;
  final TradeResult? result; // 回測結果（盈虧）
}

// 渲染層
class CandlestickPainter extends CustomPainter {
  // 1. 繪製 K 線（紅漲綠跌 or 用戶自選配色）
  // 2. 繪製均線覆蓋
  // 3. 繪製 B/S 三角標記
  //    B = 綠色 ▲ 在 K 棒下方
  //    S = 紅色 ▼ 在 K 棒上方
  // 4. 點擊 hitTest → 展開信號詳情 BottomSheet
}
```

### 6.4 績效報告頁面

回測完成後生成完整績效報告：

```
┌───────────────────────────────────────────┐
│  策略回測報告：巴菲特價值流 × AAPL         │
│  期間：2024-01-01 ~ 2026-05-20            │
│───────────────────────────────────────────│
│                                           │
│  ── 核心指標 ──                           │
│  總報酬     +34.2%  │ 年化報酬   +14.8%   │
│  Sharpe     1.42    │ Sortino    1.88     │
│  最大回撤   -12.3%  │ 回撤天數   34 天    │
│  勝率       68.2%   │ 盈虧比     2.1:1    │
│  交易次數   23      │ 平均持有   18 天    │
│                                           │
│  ── 權益曲線 ──                           │
│  📈 [equity curve chart]                  │
│                                           │
│  ── 月度報酬熱力圖 ──                     │
│       1月  2月  3月  4月  ...             │
│  2024 +2%  -1%  +5%  +3%  ...             │
│  2025 +4%  +1%  -2%  +6%  ...             │
│                                           │
│  ── 所有交易記錄 ──                       │
│  #1  B 03/15 $178.50 → S 04/06 $195.20  +9.4% │
│  #2  B 05/02 $185.00 → S 05/15 $180.30  -2.5% │
│  ...                                     │
│                                           │
│  [分享報告]  [匯出 CSV]  [調整策略重跑]    │
└───────────────────────────────────────────┘
```

### 6.5 回測 API 設計

```
POST /backtest/rule          ← 規則回測（用戶 Python 算法）
  body: { strategy_id, ticker, start_date, end_date, config }
  response: { task_id }     ← 非同步，Celery 執行

POST /backtest/agent         ← Agent 回測（DAG 逐日分析）
  body: { strategy_id, ticker, start_date, end_date }
  response: { task_id }

GET  /backtest/{task_id}     ← 回測結果
  response: BacktestResult   ← 含 signals、equity_curve 等

GET  /backtest/{task_id}/chart  ← K 線圖數據（含 B/S 標記）
  response: { candles, signals, overlays }
```

### 6.6 策略排行榜（社群飛輪的燃料）

回測數據驅動策略排行榜：

| 排名 | 策略名稱 | 作者 | 年化報酬 | Sharpe | 最大回撤 | Fork 數 |
|------|---------|------|---------|--------|---------|--------|
| 1 | 動量突破 v3 | @trader_wang | +28.4% | 1.8 | -8.2% | 342 |
| 2 | 巴菲特價值流 | @value_inv | +18.7% | 1.5 | -11.0% | 218 |
| 3 | RSI 反轉狙擊 | @quant_lee | +24.1% | 1.3 | -15.4% | 156 |

用戶看到績效數據 → 信任 → fork → 改良 → 重新回測 → 分享 → 飛輪轉起來。

---

## 7. 倉位管理系統

### 6.1 問題

v1 只告訴用戶 BUY/SELL/HOLD，但散戶最大的問題是「該買多少」和「該什麼時候走」。

### 6.2 用戶規則引擎

**核心思路：用戶自己設定規則，AI 執行規則並解釋。**

這不是投資建議，而是紀律輔助工具。

```python
class UserRiskProfile(BaseModel):
    """用戶自定義的風險規則 — 這是用戶的紀律，不是我們的建議"""
    total_capital: float                              # 總資金
    max_single_position_pct: float                    # 單一標的最大佔比
    max_portfolio_risk_pct: float                     # 組合最大風險敞口
    stop_loss_pct: float                              # 止損觸發百分比
    take_profit_pct: float                            # 止盈觸發百分比
    rebalance_trigger_pct: float                      # 偏離幾% 觸發再平衡提醒

class PositionAction(BaseModel):
    """基於用戶規則計算出的倉位提示"""
    action: Literal["INCREASE", "DECREASE", "HOLD", "CLOSE", "OPEN"]
    current_pct: float                                # 目前佔比
    suggested_pct: float                              # 規則建議佔比
    reason: str                                       # 觸發原因（哪條規則）
    urgency: Literal["low", "medium", "high"]         # 緊急程度
```

### 6.3 倉位計算方法

| 方法 | 適合用戶 | 描述 |
|------|---------|------|
| 固定比例 | 初學者 | 每筆交易固定佔總資金 X% |
| 風險均等 (Risk Parity) | 中階 | 依波動率分配，高波動低倉位 |
| Kelly 公式 | 進階 | 基於勝率和賠率的最優倉位 |
| 波動率目標 | 進階 | 總組合波動率控制在目標內 |

### 6.4 與 Agent 分析的整合

```
Agent 分析結果                    用戶持倉 + 風險規則
     │                                  │
     └──────────┬───────────────────────┘
                ↓
        ┌───────────────┐
        │  倉位計算引擎  │
        └───────┬───────┘
                ↓
     「你的 AAPL 倉位 (23%) 已超過你設定的
      單一標的上限 (20%)。近期新聞偏空，
      技術面 RSI 進入超買區。
      依你的規則，建議將倉位調整至 18%。」
```

---

## 8. 智慧新聞消化系統

### 7.1 設計理念

**散戶不需要「看」新聞，需要 AI 幫他「消化」新聞並翻譯成跟自己持倉的關係。**

### 7.2 運作流程

```
[新聞源]          [用戶持倉]         [用戶規則]
Finnhub            AAPL 23%          止損 -8%
NewsAPI     →      TSLA 12%    →     單一上限 25%
RSS feeds          NVDA 18%          再平衡觸發 5%
                       ↓
              ┌─────────────────┐
              │  新聞相關性過濾  │  ← 只留與持倉相關的新聞
              └────────┬────────┘
                       ↓
              ┌─────────────────┐
              │  Agent DAG 分析  │  ← 用戶選擇的策略模板
              └────────┬────────┘
                       ↓
              ┌─────────────────┐
              │  倉位影響計算    │  ← 這個新聞對我的持倉意味什麼
              └────────┬────────┘
                       ↓
              ┌─────────────────┐
              │  推送通知        │  ← 只在需要行動時通知
              └─────────────────┘
```

### 7.3 通知分級

| 級別 | 條件 | 通知方式 |
|------|------|---------|
| 靜默 | 新聞與持倉相關但影響輕微 | App 內新聞摘要 |
| 提醒 | 觸發用戶設定的觀察閾值 | App 推送通知 |
| 警報 | 觸發用戶設定的止損/止盈/上限規則 | 推送 + 紅色標記 |

### 7.4 新聞摘要卡片（前端 UI）

```
┌─────────────────────────────────────────┐
│  AAPL 相關  |  2 分鐘前                 │
│─────────────────────────────────────────│
│  Apple 法說會：下季 guidance 低於預期     │
│                                         │
│  對你的影響：                            │
│  你的 AAPL 佔倉位 23%（你的上限是 20%）   │
│  市場情緒轉為偏空 (信心: 72%)             │
│  RSI: 71.2 (接近超買)                    │
│                                         │
│  你的規則提示：                           │
│  ⚠️ 倉位超過你設定的上限 3%              │
│  ⚠️ 情緒指標與你的保守風格不一致          │
│                                         │
│  [查看完整分析]     [調整倉位規則]        │
└─────────────────────────────────────────┘
```

---

## 9. 技術架構變更

### 8.1 新增後端模組

```
backend/app/
├── agents/
│   ├── graph.py              # 修改：支援動態 DAG 組裝
│   ├── node_registry.py      # 新增：Agent 節點註冊中心
│   └── analysts/
│       ├── macro_analyst.py   # 新增：總體經濟
│       ├── insider_analyst.py # 新增：內部人交易
│       └── options_analyst.py # 新增：選擇權流
├── portfolio/                 # 新增模組
│   ├── holdings.py            # 用戶持倉管理
│   ├── position_sizer.py     # 倉位計算引擎
│   ├── rules_engine.py       # 用戶規則引擎
│   └── models.py             # Portfolio 資料模型
├── news/                      # 新增模組
│   ├── aggregator.py          # 多源新聞聚合
│   ├── relevance_filter.py   # 持倉相關性過濾
│   ├── digest.py              # 新聞消化 + 影響評估
│   └── notifier.py            # 推送通知觸發
├── strategies/                # 新增模組
│   ├── models.py              # DAG 策略資料模型
│   ├── compiler.py            # JSON → LangGraph 動態編譯
│   ├── validator.py           # DAG 合法性驗證（無環、有終點）
│   └── marketplace.py         # 策略分享市場邏輯
└── api/
    ├── strategies.py          # 新增：策略 CRUD + 分享 API
    ├── portfolio.py           # 新增：持倉管理 API
    └── news_digest.py         # 新增：新聞摘要 API
```

### 8.2 核心技術變更：動態 DAG 編譯

```python
# strategies/compiler.py（概念）

from langgraph.graph import StateGraph, START, END
from app.agents.node_registry import NODE_REGISTRY

def compile_strategy(strategy_config: dict) -> StateGraph:
    """將用戶的 JSON 策略配置動態編譯為 LangGraph"""
    workflow = StateGraph(AnalysisState)

    # 動態添加節點
    for node in strategy_config["nodes"]:
        node_cls = NODE_REGISTRY[node["type"]]
        workflow.add_node(
            node["id"],
            node_cls(config=node.get("config", {}))
        )

    # 動態添加邊
    for edge in strategy_config["edges"]:
        src = START if edge["from"] == "START" else edge["from"]
        dst = END if edge["to"] == "END" else edge["to"]
        workflow.add_edge(src, dst)

    return workflow.compile()
```

### 8.3 資料庫新增

```sql
-- 用戶策略
CREATE TABLE strategies (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    dag_config JSONB NOT NULL,        -- DAG 節點 + 邊的配置
    is_public BOOLEAN DEFAULT FALSE,
    fork_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 用戶持倉
CREATE TABLE holdings (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    ticker VARCHAR(10) NOT NULL,
    shares DECIMAL NOT NULL,
    avg_cost DECIMAL NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, ticker)
);

-- 用戶風險規則
CREATE TABLE risk_profiles (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) UNIQUE,
    total_capital DECIMAL,
    max_single_position_pct DECIMAL DEFAULT 20,
    max_portfolio_risk_pct DECIMAL DEFAULT 80,
    stop_loss_pct DECIMAL DEFAULT 8,
    take_profit_pct DECIMAL DEFAULT 25,
    rebalance_trigger_pct DECIMAL DEFAULT 5,
    position_sizing_method VARCHAR(20) DEFAULT 'fixed'
);

-- 新聞摘要記錄
CREATE TABLE news_digests (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    ticker VARCHAR(10),
    headline TEXT,
    summary TEXT,
    impact_assessment JSONB,          -- Agent 分析結果
    position_action JSONB,            -- 倉位影響建議
    urgency VARCHAR(10),
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.4 新增 Celery 任務

```python
# 定時新聞掃描（每 15 分鐘）
@celery_app.task(name="news.scan_and_digest")
def scan_and_digest():
    """掃描新聞 → 過濾相關持倉 → 消化 → 推送"""
    ...

# 每日倉位健康檢查（每天早上開盤前）
@celery_app.task(name="portfolio.daily_health_check")
def daily_health_check():
    """檢查所有用戶的持倉是否觸發任何規則"""
    ...
```

### 8.5 Docker Compose 新增

```yaml
# 新增 worker
worker-news:
  build: .
  env_file: .env
  command: celery -A app.tasks.celery_app worker -Q news_queue -c 4 --loglevel=info
  depends_on:
    - postgres
    - redis

# 新增定時排程
celery-beat:
  build: .
  env_file: .env
  command: celery -A app.tasks.celery_app beat --loglevel=info
  depends_on:
    - redis
```

---

## 10. 商業模式與定價

### 9.1 分層定價

| 功能 | Free | Basic ($9/月) | Premium ($29/月) | Pro ($99/月) |
|------|------|-------------|---------------|-------------|
| 固定 Pipeline 分析 | 1 次/天 | 5 次/天 | 20 次/天 | 無限 |
| 自定義 DAG | 不可 | 3 節點上限 | 10 節點上限 | 無限 |
| 持倉追蹤 | 3 支股票 | 10 支 | 50 支 | 無限 |
| 新聞消化推送 | 不可 | 每日摘要 | 即時推送 | 即時 + 自定義源 |
| 倉位管理 | 不可 | 固定比例 | 全部方法 | 全部 + 自定義 |
| 策略模板市場 | 只能讀 | 讀 + 存 | 讀 + 存 + 分享 | 全部 + 賣 |
| LLM 選擇 | Ollama | gpt-4o-mini | Claude Sonnet | 全部 + BYOK |
| 回測 | 不可 | 不可 | 1 年歷史 | 10 年歷史 |

### 9.2 收入預測（保守）

| 指標 | Month 6 | Month 12 | Month 24 |
|------|---------|----------|----------|
| 註冊用戶 | 2,000 | 10,000 | 50,000 |
| 付費用戶 | 100 | 800 | 4,000 |
| 付費率 | 5% | 8% | 8% |
| ARPU | $15 | $18 | $22 |
| MRR | $1,500 | $14,400 | $88,000 |

---

## 11. 監管策略

### 10.1 核心原則

> **我們不提供投資建議。我們幫助用戶執行他們自己設定的紀律。**

### 10.2 用語規範

| 不能說（= 投資建議） | 可以說（= 規則執行） |
|---------------------|---------------------|
| 建議你買入 AAPL | 你的 AAPL 分析信號為正面 |
| 你應該減倉 | 你的倉位已超過你自己設定的上限 |
| 這支股票會漲 | 技術指標顯示上升動能 |
| 最佳買入時機 | 你設定的進場條件已被觸發 |

### 10.3 免責架構

1. 所有輸出標注「分析結果，非投資建議」
2. 倉位提示基於「用戶自定義規則」，非系統建議
3. 用戶使用前需同意免責條款
4. 考慮諮詢金融法律顧問確認各市場合規要求

---

## 12. MVP 範圍與開發計劃

### 11.1 Phase 1：MVP（6-8 週）

**目標：讓現有用戶感受到明顯的價值提升**

| 功能 | 描述 | 優先級 |
|------|------|--------|
| 持倉管理 | 用戶可輸入/追蹤自己的持倉 | P0 |
| 倉位規則引擎 | 設定止損/止盈/上限，觸發提醒 | P0 |
| 新聞掃描 + 持倉關聯 | 每日新聞摘要卡片 | P0 |
| Agent prompt 客製化 | 不改 DAG，先讓用戶調每個 agent 的行為 | P1 |
| 策略儲存 | 將現有 pipeline 的設定存為策略 | P1 |

### 11.2 Phase 2：DAG 編輯器（8-12 週）

| 功能 | 描述 |
|------|------|
| DAG 視覺化編輯器 | Flutter CustomPainter，拖拉節點 |
| 動態 LangGraph 編譯 | JSON config → LangGraph 即時組裝 |
| 新增 Agent 節點 | 總經、內部人、選擇權流 |
| DAG 驗證器 | 確保 DAG 合法（無環、有終點） |
| 策略模板分享 | 公開/fork/評分機制 |

### 11.3 Phase 3：護城河深化（12-20 週）

| 功能 | 描述 |
|------|------|
| 即時新聞推送 | WebSocket + push notification |
| 回測引擎 | 歷史數據驗證策略績效 |
| Kelly/Risk Parity 倉位 | 進階倉位計算方法 |
| 策略市場交易 | 付費策略模板 |
| 券商 API 整合 | 查看實際持倉（只讀） |

---

## 13. 成功指標

### 12.1 北極星指標

> **每週活躍用戶中查看新聞摘要卡片的比例（目標 >60%）**

這代表用戶真的在用 QuantClash 來消化新聞、管理持倉，而不是一次性分析完就離開。

### 12.2 關鍵指標

| 指標 | Phase 1 目標 | Phase 3 目標 |
|------|-------------|-------------|
| DAU/MAU | >15% | >30% |
| 新聞摘要開啟率 | >40% | >60% |
| 付費轉化率 | >3% | >8% |
| 策略模板 fork 次數/月 | - | >500 |
| D7 留存 | >25% | >40% |
| NPS | >20 | >40 |

---

## 附錄 A：創業評估

### 整體評分：7/10

**定位：AI Agent 版的 TradingView — 拖拉組裝 Agent DAG、自定義算法回測、K 線圖上看 B/S 信號。**

**加分：** TradingView Pine Script 幾百萬用戶已驗證「自定義策略」需求存在，DAG 拖拉比寫程式門檻更低，TAM 理論上更大。目前沒有任何工具同時提供「拖拉 DAG + 回測 + K 線 B/S」給散戶。技術全棧可行（LangGraph 動態 DAG + Python 沙箱回測 + Flutter/Web K 線圖均有成熟方案）。

**關鍵前提：**
1. 砍功能到核心四件：DAG 編輯器 + 規則回測 + K 線 B/S + 策略分享
2. 先做 Web 版，不要先做 Flutter App
3. 定位為「策略分析工具」而非「投資建議」，繞開監管

---

## 附錄 B：風險評估（含修正）

### 風險總覽

| 排名 | 死因 | 初始評估 | 修正評估 | 修正理由 |
|------|------|---------|---------|---------|
| **1** | **做太多做太久** | 35% | **40%** | 計劃書功能清單是 10 人團隊做一年的量，1-3 人必須砍到核心 |
| 2 | TradingView 競爭 | 30% | 25% | TV 核心是圖表，最可能做「AI 寫 Pine Script」，不是 DAG Agent |
| 3 | 社群冷啟動失敗 | 30% | 25% | 自己先做 20-30 個高品質策略可解，但需要手動投入 |
| 4 | 做完了沒人用 | 45% | 25% | Pine Script 百萬用戶已驗證需求；DAG 門檻比寫程式更低 |
| 5 | LLM 成本吃掉利潤 | 35% | 20% | 核心是規則回測（純 Python，成本≈$0），Agent 回測限 Pro 用戶 |
| 6 | 回測好看實盤爆 | 30% | 20% | 行業共同問題，QuantConnect/TV 都有；加 out-of-sample 警告即可 |
| 7 | 創辦人倦怠 | 20% | 20% | 取決於個人，無法外部評估 |
| 8 | 監管突襲 | 25% | 15% | 定位成「回測分析工具」非「投資顧問」可繞開；不做實時 BUY/SELL 推送 |
| 9 | 免費替代品太多 | 25% | 15% | 重新檢視後，直接競品（同時有 DAG + 回測 + K 線 B/S）實際上是 0 |
| 10 | 技術債 | 20% | 10% | v2 本就重構，現有 prototype 債務自然解決 |

### 逐條分析

#### #1. 做太多做太久（40%）— 最大威脅

計劃書包含 DAG 編輯器、節點庫、回測引擎、K 線圖、倉位管理、新聞消化、策略市場、推送通知、算法沙箱等。這是 10 人團隊做一年的量。

**緩解方案：** MVP 只做四件事：
```
1. DAG 編輯器（Web 版）— 3-5 個內建節點，拖拉連接
2. 規則回測引擎 — Python 沙箱執行用戶算法
3. K 線圖 + B/S 標記 — 回測結果視覺化
4. 策略儲存/分享 — 社群飛輪基礎
```
一個人 4-6 週可完成。其餘全部推到 Phase 2+。

#### #2. TradingView 競爭（25%）

TradingView 有 5000 萬+ 用戶和成熟的 Pine Script 生態。但他們最可能做的是「AI 輔助寫 Pine Script」或「AI 解讀圖表」，不是「多 Agent debate DAG」。Pine Script 生態太重，他們不會把核心 UX 大改成 DAG 拖拉模式。

**結論：** 更可能成為間接競爭者（共存），而不是直接殺死你。威脅在於用戶心智佔位，不在功能重疊。

#### #3. 社群冷啟動失敗（25%）

策略市場空的時候沒人會用。

**緩解方案：** 創辦人自己寫 20-30 個高品質策略模板，每個跑完整回測並附績效數據。TradingView 早期也是團隊自己寫了前幾百個指標。這需要時間但完全可控。

#### #4. 做完了沒人用（25%）

原本評估 45%，但重新想：Pine Script 用戶有幾百萬人，這已經驗證了「自定義策略」的需求。QuantClash 的 DAG 拖拉比寫程式門檻更低，理論上 TAM 更大而非更小。

**真正的風險不是「沒人要」，是「用戶會不會從 TradingView 搬過來」。** 解法是先做 Web 版降低遷移成本，不要要求用戶先下載 App。

#### #5. LLM 成本吃掉利潤（20%）

原本擔心 Agent 回測每次 $25+。但重新想：核心回測模式是「規則回測」（用戶寫 Python 算法，引擎執行），成本幾乎為零。Agent 回測（LLM 逐日分析）是附加功能，限 Pro 用戶、限回測天數即可控制成本。

DAG 分析本身每次約 $0.10（Claude Sonnet），Premium 用戶 20 次/月 = $2，$29 定價毛利充足。

#### #6. 回測好看實盤爆（20%）

過擬合、前視偏差、倖存者偏差是所有回測工具的共同問題。QuantConnect、TradingView、Backtrader 全都有。

**緩解方案：**
- 交易次數太少的策略標記「統計不顯著」
- 提供 out-of-sample 測試分割功能
- 績效報告顯著位置放過擬合風險提醒
- 免責聲明

#### #7. 創辦人倦怠（20%）

取決於創辦人對問題的執念程度，外部無法評估。

#### #8. 監管突襲（15%）

原本評估 25%，但重新分析定位後風險下降。關鍵區別：

| 高風險定位 | 低風險定位 |
|-----------|-----------|
| 即時推送 BUY/SELL 通知 | 歷史回測分析工具 |
| 「建議你買入 AAPL」 | 「你的策略在歷史上產生了 BUY 信號」 |
| 替用戶做決策 | 用戶設規則，工具執行規則 |
| 投資顧問 | 分析工具 |

QuantConnect、Backtrader 定位為分析工具，從未有監管問題。只要不做「即時投資建議推送」，風險大幅降低。

**重要：不要做「推送 BUY/SELL 通知到手機」這個功能。這條線一過就是投資顧問。**

#### #9. 免費替代品太多（15%）

重新檢視所謂「替代品」：
- ChatGPT/Claude → 沒有回測、沒有 K 線圖、沒有持續性
- ai-hedge-fund 開源 → CLI only，95% 散戶不會用
- QuantConnect → 要寫 C#/Python，門檻高，無 DAG
- Backtrader → 純 Python 庫，沒有 UI

同時提供「拖拉 DAG + 回測 + K 線 B/S」的產品目前是零。這些工具是不同品類，不是直接替代品。

#### #10. 技術債（10%）

現有 codebase 的問題（WebSocket 無驗證、配額競態、CORS 全開）是 prototype 階段正常的。做 v2 時本就要重構架構，這些會自然被解決，不構成獨立風險。

---

### 修正總結

初始評估過於悲觀，主要原因是把「通用 AI 股票工具」的風險套用到了 QuantClash 上。加入回測 + K 線 B/S + DAG 之後，QuantClash 的定位從「AI 股票助手」變成了「量化策略平台」，這兩個品類的競爭格局完全不同。

**真正的頭號風險是「做太多做太久」，不是市場需求或競爭。** 砍功能、快速上線、用數據驗證，是最重要的事。
