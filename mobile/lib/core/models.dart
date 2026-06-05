// Hand-written data models for the QuantClash mobile rebuild.
//
// We intentionally do NOT use @freezed / json_serializable here because
// build_runner codegen cannot be run in this environment. (The legacy
// `core/models/models.dart` still uses freezed for the old auth/analysis
// flow; this file is independent and only used by the new tabs.)
//
// Every model parses defensively (num? -> double, missing keys -> defaults)
// so a slightly different backend payload never throws at runtime.

double _toDouble(dynamic v, [double fallback = 0]) {
  if (v == null) return fallback;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? fallback;
}

int _toInt(dynamic v, [int fallback = 0]) {
  if (v == null) return fallback;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? fallback;
}

String _toStr(dynamic v, [String fallback = '']) {
  if (v == null) return fallback;
  return v.toString();
}

/// GET /stocks/{ticker}/quote
class StockQuote {
  StockQuote({
    required this.ticker,
    required this.price,
    required this.change,
    required this.changePct,
    required this.high,
    required this.low,
    required this.open,
    required this.prevClose,
    required this.name,
  });

  final String ticker;
  final double price;
  final double change;
  final double changePct;
  final double high;
  final double low;
  final double open;
  final double prevClose;
  final String name;

  factory StockQuote.fromJson(Map<String, dynamic> j) => StockQuote(
        ticker: _toStr(j['ticker']),
        price: _toDouble(j['price']),
        change: _toDouble(j['change']),
        changePct: _toDouble(j['change_pct']),
        high: _toDouble(j['high']),
        low: _toDouble(j['low']),
        open: _toDouble(j['open']),
        prevClose: _toDouble(j['prev_close']),
        name: _toStr(j['name'], _toStr(j['ticker'])),
      );

  bool get isUp => change >= 0;
}

/// One OHLCV candle from GET /stocks/{ticker}/ohlcv
class Candle {
  Candle({
    required this.date,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.volume,
  });

  final String date;
  final double open;
  final double high;
  final double low;
  final double close;
  final double volume;

  factory Candle.fromJson(Map<String, dynamic> j) => Candle(
        date: _toStr(j['date']),
        open: _toDouble(j['open']),
        high: _toDouble(j['high']),
        low: _toDouble(j['low']),
        close: _toDouble(j['close']),
        volume: _toDouble(j['volume']),
      );
}

/// GET /stocks/{ticker}/ohlcv → { ticker, data: [...] }
class OhlcvSeries {
  OhlcvSeries({required this.ticker, required this.candles});

  final String ticker;
  final List<Candle> candles;

  factory OhlcvSeries.fromJson(Map<String, dynamic> j) {
    final raw = (j['data'] as List?) ?? const [];
    return OhlcvSeries(
      ticker: _toStr(j['ticker']),
      candles: raw
          .whereType<Map>()
          .map((e) => Candle.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

/// One row from GET /stocks/search → { results: [...] }
class SearchResult {
  SearchResult({
    required this.symbol,
    required this.description,
    required this.type,
    required this.exchange,
  });

  final String symbol;
  final String description;
  final String type;
  final String exchange;

  factory SearchResult.fromJson(Map<String, dynamic> j) => SearchResult(
        symbol: _toStr(j['symbol']),
        description: _toStr(j['description']),
        type: _toStr(j['type']),
        exchange: _toStr(j['exchange']),
      );
}

/// One article from GET /stocks/{ticker}/news → { news: [...] }
class NewsItem {
  NewsItem({
    required this.title,
    required this.source,
    required this.url,
    required this.summary,
    required this.publishedAt,
  });

  final String title;
  final String source;
  final String url;
  final String summary;
  final String publishedAt;

  factory NewsItem.fromJson(Map<String, dynamic> j) => NewsItem(
        title: _toStr(j['title']),
        source: _toStr(j['source']),
        url: _toStr(j['url']),
        summary: _toStr(j['summary']),
        publishedAt: _toStr(j['published_at']),
      );
}

/// One event chip inside a scan trigger.
class ScanEvent {
  ScanEvent({required this.type, required this.detail});

  final String type;
  final String detail;

  factory ScanEvent.fromJson(Map<String, dynamic> j) => ScanEvent(
        type: _toStr(j['type']),
        detail: _toStr(j['detail']),
      );
}

/// One triggered stock from POST /workflows/scan → { triggers: [...] }
class ScanTrigger {
  ScanTrigger({
    required this.ticker,
    required this.events,
    required this.recommendedReview,
    required this.priority,
    required this.chg5d,
    required this.relVolume,
  });

  final String ticker;
  final List<ScanEvent> events;
  final String recommendedReview;
  final String priority;
  final double chg5d;
  final double relVolume;

  factory ScanTrigger.fromJson(Map<String, dynamic> j) {
    final raw = (j['events'] as List?) ?? const [];
    return ScanTrigger(
      ticker: _toStr(j['ticker']),
      events: raw
          .whereType<Map>()
          .map((e) => ScanEvent.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      recommendedReview: _toStr(j['recommended_review']),
      priority: _toStr(j['priority'], 'low'),
      chg5d: _toDouble(j['chg_5d']),
      relVolume: _toDouble(j['rel_volume']),
    );
  }
}

/// POST /workflows/scan response.
class ScanResult {
  ScanResult({
    required this.scanned,
    required this.triggered,
    required this.triggers,
  });

  final int scanned;
  final int triggered;
  final List<ScanTrigger> triggers;

  factory ScanResult.fromJson(Map<String, dynamic> j) {
    final raw = (j['triggers'] as List?) ?? const [];
    return ScanResult(
      scanned: _toInt(j['scanned']),
      triggered: _toInt(j['triggered']),
      triggers: raw
          .whereType<Map>()
          .map((e) => ScanTrigger.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }

  static ScanResult empty() =>
      ScanResult(scanned: 0, triggered: 0, triggers: const []);
}

/// One post from GET /political/trump → { posts: [...] }
class TrumpPost {
  TrumpPost({required this.text, required this.url, required this.publishedAt});

  final String text;
  final String url;
  final String publishedAt;

  factory TrumpPost.fromJson(Map<String, dynamic> j) => TrumpPost(
        text: _toStr(j['text']),
        url: _toStr(j['url']),
        publishedAt: _toStr(j['published_at']),
      );
}

/// GET /political/trump → { source, posts: [...] }
class TrumpFeed {
  TrumpFeed({required this.source, required this.posts});

  final String source;
  final List<TrumpPost> posts;

  factory TrumpFeed.fromJson(Map<String, dynamic> j) {
    final raw = (j['posts'] as List?) ?? const [];
    return TrumpFeed(
      source: _toStr(j['source']),
      posts: raw
          .whereType<Map>()
          .map((e) => TrumpPost.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

/// Subset of POST /analyze/sync result we render on mobile.
class AnalysisResult {
  AnalysisResult({
    required this.finalDecision,
    required this.action,
    required this.reports,
  });

  /// Full free-text decision/reasoning block.
  final String finalDecision;

  /// Extracted action verb (BUY / SELL / HOLD) — best-effort.
  final String action;

  /// Named report sections we can show in expandable tiles.
  final Map<String, String> reports;

  /// Parses the FULL /analyze/sync response: { status, result: {...} }.
  factory AnalysisResult.fromResponse(Map<String, dynamic> response) {
    final result = (response['result'] is Map)
        ? Map<String, dynamic>.from(response['result'] as Map)
        : response;

    final decision = _toStr(result['final_decision']);

    final reports = <String, String>{};
    void add(String key, String label) {
      final v = _toStr(result[key]);
      if (v.trim().isNotEmpty) reports[label] = v;
    }

    add('market_report', 'Market');
    add('sentiment_report', 'Sentiment');
    add('news_report', 'News');
    add('fundamentals_report', 'Fundamentals');
    add('trader_plan', 'Trader Plan');

    return AnalysisResult(
      finalDecision: decision,
      action: _extractAction(decision, result),
      reports: reports,
    );
  }

  static String _extractAction(String decision, Map<String, dynamic> result) {
    for (final k in ['action', 'recommendation', 'signal']) {
      final v = _toStr(result[k]).toUpperCase().trim();
      if (v == 'BUY' || v == 'SELL' || v == 'HOLD') return v;
    }
    final up = decision.toUpperCase();
    if (up.contains('SELL')) return 'SELL';
    if (up.contains('BUY')) return 'BUY';
    if (up.contains('HOLD')) return 'HOLD';
    return 'HOLD';
  }
}

/// A user portfolio holding (persisted in shared_preferences).
class Position {
  Position({
    required this.ticker,
    required this.shares,
    required this.avgCost,
  });

  final String ticker;
  final double shares;
  final double avgCost;

  double get costBasis => shares * avgCost;
  double marketValue(double price) => shares * price;
  double pnl(double price) => (price - avgCost) * shares;
  double pnlPct(double price) =>
      avgCost == 0 ? 0 : ((price - avgCost) / avgCost) * 100;

  factory Position.fromJson(Map<String, dynamic> j) => Position(
        ticker: _toStr(j['ticker']),
        shares: _toDouble(j['shares']),
        avgCost: _toDouble(j['avgCost']),
      );

  Map<String, dynamic> toJson() => {
        'ticker': ticker,
        'shares': shares,
        'avgCost': avgCost,
      };

  Position copyWith({String? ticker, double? shares, double? avgCost}) =>
      Position(
        ticker: ticker ?? this.ticker,
        shares: shares ?? this.shares,
        avgCost: avgCost ?? this.avgCost,
      );
}

/// Body for POST /watch/subscribe and the unwrapped GET /watch/subscription.
class WatchSubscription {
  WatchSubscription({
    required this.email,
    required this.tickers,
    required this.news,
    required this.anomaly,
    required this.language,
    required this.enabled,
  });

  final String email;
  final List<String> tickers;
  final bool news;
  final bool anomaly;
  final String language;
  final bool enabled;

  /// Parses the inner subscription object (already unwrapped from
  /// `{ subscription: {...} }`).
  factory WatchSubscription.fromJson(Map<String, dynamic> j) {
    final triggers = (j['triggers'] is Map)
        ? Map<String, dynamic>.from(j['triggers'] as Map)
        : const <String, dynamic>{};
    final tk = (j['tickers'] as List?) ?? const [];
    return WatchSubscription(
      email: _toStr(j['email']),
      tickers: tk.map((e) => _toStr(e)).where((e) => e.isNotEmpty).toList(),
      news: triggers['news'] == true,
      anomaly: triggers['anomaly'] == true,
      language: _toStr(j['language'], 'en'),
      enabled: j['enabled'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
        'email': email,
        'tickers': tickers,
        'triggers': {'news': news, 'anomaly': anomaly},
        'language': language,
        'enabled': enabled,
      };
}
