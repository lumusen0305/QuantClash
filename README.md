# QuantClash - AI 智能量化投資分析平台

QuantClash 是一個 AI 驅動的股票分析平台，提供後端 API、Celery 工作者和 React 前端介面。

## 專案結構

-   **`backend/`**: Python FastAPI 後端服務與 Celery 工作者。
-   **`web/`**: React 網頁前端應用。
-   **`mobile/`**: Flutter 移動應用 (未包含在本文檔的啟動流程中)。
-   **`start.sh`**: 一鍵啟動腳本，用於快速啟動開發環境。

## 啟動專案

專案提供了一個方便的 `start.sh` 腳本來啟動所有必要的服務（後端 API、Celery worker、前端）。

### 1. 前置準備

在啟動之前，請確保你的系統已安裝以下軟體：

-   **Docker** (推薦，用於運行 PostgreSQL 和 Redis)
-   **Node.js** (包含 npm)
-   **Python 3.10+**
-   **pip** (Python 套件管理器)

### 2. 環境變數設定

在 `backend/` 目錄下創建一個 `.env` 檔案。這個檔案用於儲存敏感資訊和專案設定。以下是必須填寫的環境變數範例：

```dotenv
# .env 範例 (請根據你的實際情況填寫)

# Database
DATABASE_URL="postgresql+asyncpg://user:password@localhost/stockapp" # 或你的 PostgreSQL 連線字串

# Redis
REDIS_URL="redis://localhost:6379" # 或你的 Redis 連線字串

# JWT
SECRET_KEY="your_jwt_secret_key" # 請替換為一個強而安全的隨機字串
ACCESS_TOKEN_EXPIRE_MINUTES=10080 # 例如 7 天

# Stripe (如果不需要可留空)
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""

# Finnhub (如果不需要可留空)
FINNHUB_API_KEY=""

# Twelve Data (如果不需要可留空)
TWELVE_DATA_API_KEY=""

# LLM (請至少填寫一個，或根據需求填寫多個)
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
GOOGLE_API_KEY="your_google_gemini_api_key" # 例如 Gemini API Key
OLLAMA_URL="http://localhost:11434" # 如果使用本地 Ollama
OLLAMA_MODEL="qwen3:8b"             # 如果使用本地 Ollama
ALI_API_KEY=""                      # 如果使用阿里云 LLM

# Email (SMTP) - 用於消化報告等郵件發送
SMTP_HOST="smtp.gmail.com"          # 郵件伺服器主機，例如 Gmail 為 smtp.gmail.com
SMTP_PORT=587                       # 郵件伺服器端口
SMTP_USER="your_email@example.com"  # 你的郵件地址 (完整信箱)
SMTP_PASSWORD="your_app_password"   # 你的郵件應用程式密碼 (例如 Gmail 的應用程式密碼)
SMTP_FROM="your_email@example.com"  # 寄件人信箱，如果為空則預設為 SMTP_USER
SMTP_USE_TLS=True                   # 是否使用 TLS 加密

# Celery
CELERY_BROKER_URL="redis://localhost:6379/1"
CELERY_RESULT_BACKEND="redis://localhost:6379/2"
```

**重要提示：**
-   `SECRET_KEY` 務必替換為一個安全、隨機的字串。
-   如果你使用 Gmail，`SMTP_PASSWORD` 需要填寫**應用程式密碼**，而不是你的 Gmail 帳號密碼。請參閱 [Google 說明](https://support.google.com/accounts/answer/185833?hl=zh-Hant) 建立。

### 3. 安裝依賴

進入 `backend` 和 `web` 目錄，安裝各自的依賴：

```bash
# 後端
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate

# 前端
cd web
npm install
```

### 4. 執行啟動腳本

回到專案根目錄，執行 `start.sh` 腳本：

```bash
./start.sh
```

這將會：
-   檢查並啟動 Docker 容器中的 PostgreSQL 和 Redis (如果尚未運行)。
-   套用後端資料庫 migration。
-   啟動後端 FastAPI API 服務 (預設 `http://localhost:8000`)。
-   啟動 Celery worker 和 Celery Beat。
-   啟動前端開發伺服器 (預設 `http://localhost:5173`)。

腳本執行完成後，你將會在終端機中看到 API 和 Web 介面的訪問網址。

### 可選的腳本參數

你可以使用以下參數來客製化啟動行為：

-   `./start.sh --no-infra`：跳過 Docker 基礎設施的啟動 (當你手動運行 PostgreSQL/Redis 時使用)。
-   `./start.sh --no-worker`：不啟動 Celery worker。
-   `./start.sh --no-beat`：不啟動 Celery Beat。
-   `./start.sh --build`：前端使用 build + preview 模式，而非開發模式。
-   `./start.sh -h` 或 `./start.sh --help`：顯示幫助訊息。

---

希望這個 `README.md` 對你有幫助！