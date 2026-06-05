import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../watchlist/watchlist_provider.dart';

/// Runs the fast rule-based scan over the current watchlist.
///
/// Re-fires automatically when the watchlist changes (it `watch`es it),
/// and can be force-refreshed via `ref.invalidate(scanProvider)`.
final scanProvider = FutureProvider.autoDispose<ScanResult>((ref) async {
  final tickers = ref.watch(watchlistProvider);
  if (tickers.isEmpty) return ScanResult.empty();
  return ref.watch(apiClientProvider).scan(tickers);
});

/// Trump political feed for the collapsible strip on the Today tab.
final trumpFeedProvider = FutureProvider.autoDispose<TrumpFeed>((ref) async {
  return ref.watch(apiClientProvider).getTrumpFeed();
});
