import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/settings_provider.dart';

/// Selected chart period for the stock detail screen, per ticker.
/// One of: '1w', '1m', '3m', '1y' (lowercase = backend ?period= values).
final chartPeriodProvider =
    StateProvider.autoDispose.family<String, String>((ref, ticker) => '1m');

/// OHLCV series for (ticker, currentPeriod).
final detailOhlcvProvider =
    FutureProvider.autoDispose.family<OhlcvSeries, String>((ref, ticker) async {
  final period = ref.watch(chartPeriodProvider(ticker));
  return ref.watch(apiClientProvider).getOhlcv(ticker, period: period);
});

/// News list for a ticker.
final detailNewsProvider = FutureProvider.autoDispose
    .family<List<NewsItem>, String>((ref, ticker) async {
  return ref.watch(apiClientProvider).getNews(ticker);
});

/// State for the heavy /analyze/sync call. A notifier (not a FutureProvider)
/// so the user explicitly triggers it and we show a long-running progress UI.
class AnalysisState {
  const AnalysisState({this.loading = false, this.result, this.error});
  final bool loading;
  final AnalysisResult? result;
  final Object? error;

  bool get hasResult => result != null;
}

class AnalysisNotifier extends StateNotifier<AnalysisState> {
  AnalysisNotifier(this._ref) : super(const AnalysisState());

  final Ref _ref;

  Future<void> run(String ticker) async {
    if (state.loading) return;
    state = const AnalysisState(loading: true);
    try {
      final language = _ref.read(localeProvider);
      final result =
          await _ref.read(apiClientProvider).analyze(ticker, language: language);
      if (!mounted) return;
      state = AnalysisState(result: result);
    } catch (e) {
      if (!mounted) return;
      state = AnalysisState(error: e);
    }
  }
}

final analysisProvider = StateNotifierProvider.autoDispose
    .family<AnalysisNotifier, AnalysisState, String>((ref, ticker) {
  return AnalysisNotifier(ref);
});
