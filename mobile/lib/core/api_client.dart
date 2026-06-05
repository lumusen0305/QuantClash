import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'models.dart';

/// Base URL for the QuantClash backend.
///
/// Defaults to the Android-emulator host alias (10.0.2.2 → host machine).
/// Override at build time:
///   flutter run --dart-define=QC_API_BASE=http://192.168.1.20:8000
const String kApiBaseUrl = String.fromEnvironment(
  'QC_API_BASE',
  defaultValue: 'http://10.0.2.2:8000',
);

/// Thin, typed wrapper over the QuantClash REST API used by the mobile tabs.
///
/// One method per endpoint with correct verbs:
///   GET  → quote, ohlcv, search, news, movers, trump, watch status/subscription
///   POST → analyze/sync, workflows/scan, watch subscribe/run-now
///
/// (The legacy `core/api/api_client.dart` static helper is still used by the
/// auth & subscription screens; this is the clean instance client for the
/// new feature set.)
class ApiClient {
  ApiClient({Dio? dio})
      : _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: kApiBaseUrl,
                connectTimeout: const Duration(seconds: 15),
                // /analyze/sync runs 30-50s; give it generous headroom.
                receiveTimeout: const Duration(seconds: 90),
                headers: {'Content-Type': 'application/json'},
              ),
            );

  final Dio _dio;

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map) return Map<String, dynamic>.from(data);
    return <String, dynamic>{};
  }

  // ---- Stocks ---------------------------------------------------------------

  Future<StockQuote> getQuote(String ticker) async {
    final res = await _dio.get('/stocks/$ticker/quote');
    return StockQuote.fromJson(_asMap(res.data));
  }

  Future<OhlcvSeries> getOhlcv(String ticker, {String period = '3m'}) async {
    final res = await _dio.get(
      '/stocks/$ticker/ohlcv',
      queryParameters: {'period': period},
    );
    return OhlcvSeries.fromJson(_asMap(res.data));
  }

  Future<List<SearchResult>> search(String query) async {
    final res = await _dio.get(
      '/stocks/search',
      queryParameters: {'q': query},
    );
    final raw = (_asMap(res.data)['results'] as List?) ?? const [];
    return raw
        .whereType<Map>()
        .map((e) => SearchResult.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<NewsItem>> getNews(String ticker) async {
    final res = await _dio.get('/stocks/$ticker/news');
    final raw = (_asMap(res.data)['news'] as List?) ?? const [];
    return raw
        .whereType<Map>()
        .map((e) => NewsItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  // ---- Discovery / signals --------------------------------------------------

  /// Fast, rule-based scan over a set of tickers (powers the Today tab).
  Future<ScanResult> scan(List<String> tickers) async {
    final res = await _dio.post('/workflows/scan', data: {'tickers': tickers});
    return ScanResult.fromJson(_asMap(res.data));
  }

  Future<TrumpFeed> getTrumpFeed() async {
    final res = await _dio.get('/political/trump');
    return TrumpFeed.fromJson(_asMap(res.data));
  }

  // ---- AI analysis ----------------------------------------------------------

  /// Heavy synchronous LangGraph analysis (30-50s). [language] is 'en' or
  /// 'zh-TW'. Returns the parsed result subset; throws on transport errors.
  Future<AnalysisResult> analyze(String ticker, {String language = 'en'}) async {
    final res = await _dio.post(
      '/analyze/sync',
      data: {'ticker': ticker, 'language': language},
      options: Options(receiveTimeout: const Duration(seconds: 120)),
    );
    return AnalysisResult.fromResponse(_asMap(res.data));
  }

  // ---- Auto-watch (email alerts) -------------------------------------------

  Future<void> watchSubscribe(WatchSubscription sub) async {
    await _dio.post('/watch/subscribe', data: sub.toJson());
  }

  /// GET /watch/subscription?email= → { subscription: {...} | null }.
  Future<WatchSubscription?> getWatchSubscription(String email) async {
    final res = await _dio.get(
      '/watch/subscription',
      queryParameters: {'email': email},
    );
    final body = _asMap(res.data);
    final sub = body['subscription'];
    if (sub is! Map) return null;
    return WatchSubscription.fromJson(Map<String, dynamic>.from(sub));
  }

  Future<void> watchRunNow(String email) async {
    await _dio.post('/watch/run-now', data: {'email': email});
  }

  /// GET /watch/status → { smtp_configured: bool }.
  Future<bool> watchSmtpConfigured() async {
    final res = await _dio.get('/watch/status');
    return _asMap(res.data)['smtp_configured'] == true;
  }
}

/// App-wide singleton API client.
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());
