import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/storage.dart';

/// Source-of-truth list of watched tickers, backed by shared_preferences.
class WatchlistNotifier extends StateNotifier<List<String>> {
  WatchlistNotifier(this._storage) : super(_storage.readWatchlist());

  final Storage _storage;

  bool contains(String ticker) => state.contains(ticker.toUpperCase());

  Future<void> add(String ticker) async {
    final t = ticker.toUpperCase().trim();
    if (t.isEmpty || state.contains(t)) return;
    state = [t, ...state];
    await _storage.writeWatchlist(state);
  }

  Future<void> remove(String ticker) async {
    final t = ticker.toUpperCase().trim();
    if (!state.contains(t)) return;
    state = state.where((e) => e != t).toList();
    await _storage.writeWatchlist(state);
  }

  Future<void> toggle(String ticker) async {
    if (contains(ticker)) {
      await remove(ticker);
    } else {
      await add(ticker);
    }
  }
}

final watchlistProvider =
    StateNotifierProvider<WatchlistNotifier, List<String>>((ref) {
  return WatchlistNotifier(ref.watch(storageProvider));
});

/// Live quote for a single ticker (auto-disposed, family by ticker).
final quoteProvider =
    FutureProvider.autoDispose.family<StockQuote, String>((ref, ticker) async {
  return ref.watch(apiClientProvider).getQuote(ticker);
});
