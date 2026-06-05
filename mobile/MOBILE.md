# QuantClash Mobile

A thumb-first, dark-first **companion** app for the QuantClash platform. It is
intentionally NOT a port of the 11-tab web app — mobile is the on-the-go view:
glanceable cards, pull-to-refresh, bottom navigation.

## Aesthetic direction

"Night-sky trading deck." Deep-navy surfaces, a single teal brand accent
(`0xFF00D4AA`, carried over from the original theme), and a strict semantic
color system:

| Meaning            | Color            |
| ------------------ | ---------------- |
| Up / Buy           | teal `#00D4AA`   |
| Down / Sell        | red `#EF4444`    |
| Hold / Medium      | amber `#F59E0B`  |
| Low priority / info| sky `#38BDF8`    |

Prices, tickers and other figures use a monospace family for a tabular
"terminal" feel; everything else uses the platform sans. Dark is the default;
a light theme is available and toggled in **More**.

## Navigation — 4 tabs (bottom nav)

Built with go_router's `StatefulShellRoute.indexedStack` so each tab keeps its
own stack/scroll. `lib/features/shell/app_shell.dart` hosts the
`BottomNavigationBar`.

1. **今日 / Today** (`/today`) — flagship glanceable view. Loads the watchlist
   from `shared_preferences` and runs `POST /workflows/scan` (fast, rule-based)
   over it. Triggered stocks render as cards with a priority badge and event
   chips (`5d +9.2%`, `vol 2.1x`, …). Tap → detail. Pull-to-refresh re-scans.
   A collapsible **Trump Watch** strip pulls `GET /political/trump`.
2. **自選 / Watchlist** (`/watchlist`) — each watched ticker with a live quote
   (`GET /stocks/{t}/quote`), colored change %, and a synthetic sparkline
   (built from change % to save API calls). Add via search bottom-sheet
   (`GET /stocks/search`), swipe-to-remove, tap → detail, pull-to-refresh.
3. **投組 / Portfolio** (`/portfolio`) — holdings persisted locally. Each
   position shows live quote, market value, P&L and P&L %; a header card sums
   total value + total P&L. Add/edit/delete via a form bottom-sheet
   (long-press or the ⋮ button to edit).
4. **更多 / More** (`/more`) — theme toggle, language (EN / 繁中), the
   **Auto-watch** email subscription (`POST /watch/subscribe` /
   `POST /watch/run-now`), and links to the (reachable) Subscription and
   Sign-in screens.

### Stock detail (`/stock/:ticker`)

Big quote header, period selector (`1w/1m/3m/1y`), an fl_chart close-price
area chart (`GET /stocks/{t}/ohlcv`), a prominent **AI Analyze** button
(`POST /analyze/sync`, 30–50 s, shows progress then a BUY/SELL/HOLD pill +
reasoning + expandable report sections), a news list (`GET /stocks/{t}/news`),
and an add/remove-from-watchlist star in the app bar.

## Architecture

- **State**: Riverpod. `AsyncValue` + `.when(loading/error/data)` for async
  reads; `StateNotifier` for editable/triggered state.
- **API**: `lib/core/api_client.dart` — one typed method per endpoint, correct
  verbs (GET for quote/ohlcv/search/news/movers/trump/watch-status/
  subscription; POST for analyze-sync/scan/subscribe/run-now). Exposed as
  `apiClientProvider`.
- **Models**: `lib/core/models.dart` — hand-written `fromJson` (NO freezed /
  json_serializable codegen, which can't run here). Defensive parsing.
- **Storage**: `lib/core/storage.dart` — typed `SharedPreferences` facade.
  Keys: `qc_watchlist` (List<String> JSON), `qc_positions` (JSON),
  `qc_watch_email`, `qc_theme`, `qc_locale`. Watchlist is seeded with
  `[AAPL, NVDA, MSFT, TSLA, GOOGL, AMZN]` on first launch.
- **Settings / i18n**: `lib/core/settings_provider.dart` — theme mode, locale,
  and a small bilingual `Strings` table (EN + ZH-TW).
- **Shared widgets**: `lib/widgets/state_views.dart` (loading/error/empty/
  skeleton) and `lib/widgets/ui_bits.dart` (ChangePill, PriorityBadge,
  EventChip, Sparkline, number formatters).

### File map (new / rebuilt)

```
lib/
  main.dart                         # ProviderScope + MaterialApp.router + theme
  router.dart                       # 4-tab shell + /stock/:ticker, /auth, /subscription
  core/
    api_client.dart                 # typed ApiClient + apiClientProvider
    models.dart                     # hand-written models
    storage.dart                    # SharedPreferences facade + providers
    settings_provider.dart          # theme/locale/Strings providers
    theme.dart                      # AppTheme (dark/light) + AppColors + palette
  widgets/
    state_views.dart
    ui_bits.dart
  features/
    shell/app_shell.dart
    today/{today_provider,today_screen}.dart
    watchlist/{watchlist_provider,search_sheet,watchlist_screen}.dart
    portfolio/{positions_provider,position_form_sheet,portfolio_screen}.dart
    more/{auto_watch_provider,more_screen}.dart
    stock/{stock_detail_provider,price_chart,stock_detail_screen}.dart
```

The legacy auth & subscription screens (`features/auth/`,
`features/subscription/`) are kept and reachable from More. The legacy
freezed models (`core/models/models.dart`), the legacy static
`core/api/api_client.dart` and `auth_provider.dart` are left intact because
those screens still depend on them.

## Running

```bash
flutter pub get
flutter run                # Android emulator: baseUrl defaults to 10.0.2.2:8000
```

`baseUrl` is `http://10.0.2.2:8000` (Android-emulator alias for the host).
For a physical device or a different host, override at build time:

```bash
flutter run --dart-define=QC_API_BASE=http://192.168.1.20:8000
```

(iOS simulator can use `http://localhost:8000`.)

The backend must be running (`backend/` — FastAPI on :8000). All endpoints are
no-auth in dev.

## Not done yet / known limitations

- **News / subscription links don't open a browser.** `url_launcher` is not in
  the dependency set, so tapping a news item copies the URL to the clipboard
  instead. Add `url_launcher` and swap the tap handler to enable real opening.
- **Sparklines are synthetic** (a 2-point line from the day's change %) to
  avoid an OHLCV call per watchlist row. Swap to a real mini-series if desired.
- **AI analysis is one-shot (`/analyze/sync`)**, not streamed. The richer
  streaming/live-feed flow (`/analyze/stream`, the legacy `analysis_screen`)
  is not wired into the new navigation.
- **Auth is the legacy server flow** and not required to use the 4 tabs; the
  app opens directly on Today. Auto-watch email is independent of auth.
- **No portfolio allocation chart** beyond the total-value/P&L header
  (kept lean for v1).
- The legacy `features/home/` and `features/analysis/` screens are now
  orphaned (not routed). They can be deleted once their flows are folded in.
- Could not run `flutter analyze` / `flutter build` in this environment, so the
  code was written by careful reading rather than compiler verification.
```
