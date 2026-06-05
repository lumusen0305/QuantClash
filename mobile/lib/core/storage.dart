import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

/// shared_preferences keys (centralized to avoid typos).
class StorageKeys {
  StorageKeys._();
  static const watchlist = 'qc_watchlist'; // List<String> (JSON)
  static const positions = 'qc_positions'; // List<Map> (JSON)
  static const watchEmail = 'qc_watch_email'; // String
  static const theme = 'qc_theme'; // 'dark' | 'light'
  static const locale = 'qc_locale'; // 'en' | 'zh-TW'
}

const List<String> kSeedWatchlist = [
  'AAPL',
  'NVDA',
  'MSFT',
  'TSLA',
  'GOOGL',
  'AMZN',
];

/// Exposes the resolved [SharedPreferences] instance. Overridden in main()
/// with the eagerly-loaded instance so reads/writes are synchronous.
final sharedPrefsProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError('sharedPrefsProvider must be overridden in main()');
});

/// Typed facade over SharedPreferences for the app's persisted state.
class Storage {
  Storage(this._prefs);
  final SharedPreferences _prefs;

  // ---- Watchlist ------------------------------------------------------------

  List<String> readWatchlist() {
    final raw = _prefs.getString(StorageKeys.watchlist);
    if (raw == null) return List<String>.from(kSeedWatchlist);
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => e.toString()).toList();
    } catch (_) {
      return List<String>.from(kSeedWatchlist);
    }
  }

  Future<void> writeWatchlist(List<String> tickers) =>
      _prefs.setString(StorageKeys.watchlist, jsonEncode(tickers));

  bool hasWatchlistKey() => _prefs.containsKey(StorageKeys.watchlist);

  /// Seeds the watchlist on first launch so Today has something to scan.
  Future<void> ensureSeeded() async {
    if (!hasWatchlistKey()) {
      await writeWatchlist(kSeedWatchlist);
    }
  }

  // ---- Positions ------------------------------------------------------------

  List<Position> readPositions() {
    final raw = _prefs.getString(StorageKeys.positions);
    if (raw == null) return const [];
    try {
      final list = jsonDecode(raw) as List;
      return list
          .whereType<Map>()
          .map((e) => Position.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> writePositions(List<Position> positions) {
    final encoded = jsonEncode(positions.map((p) => p.toJson()).toList());
    return _prefs.setString(StorageKeys.positions, encoded);
  }

  // ---- Misc settings --------------------------------------------------------

  String? readWatchEmail() => _prefs.getString(StorageKeys.watchEmail);
  Future<void> writeWatchEmail(String email) =>
      _prefs.setString(StorageKeys.watchEmail, email);

  String readTheme() => _prefs.getString(StorageKeys.theme) ?? 'dark';
  Future<void> writeTheme(String mode) =>
      _prefs.setString(StorageKeys.theme, mode);

  String readLocale() => _prefs.getString(StorageKeys.locale) ?? 'en';
  Future<void> writeLocale(String locale) =>
      _prefs.setString(StorageKeys.locale, locale);
}

final storageProvider =
    Provider<Storage>((ref) => Storage(ref.watch(sharedPrefsProvider)));
