import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/storage.dart';

/// Portfolio holdings, persisted under StorageKeys.positions.
class PositionsNotifier extends StateNotifier<List<Position>> {
  PositionsNotifier(this._storage) : super(_storage.readPositions());

  final Storage _storage;

  Future<void> _persist() => _storage.writePositions(state);

  /// Adds a new holding, or replaces an existing one for the same ticker.
  Future<void> upsert(Position position) async {
    final t = position.ticker.toUpperCase();
    final normalized = position.copyWith(ticker: t);
    final idx = state.indexWhere((p) => p.ticker == t);
    if (idx == -1) {
      state = [...state, normalized];
    } else {
      final next = [...state];
      next[idx] = normalized;
      state = next;
    }
    await _persist();
  }

  Future<void> remove(String ticker) async {
    final t = ticker.toUpperCase();
    state = state.where((p) => p.ticker != t).toList();
    await _persist();
  }
}

final positionsProvider =
    StateNotifierProvider<PositionsNotifier, List<Position>>((ref) {
  return PositionsNotifier(ref.watch(storageProvider));
});
