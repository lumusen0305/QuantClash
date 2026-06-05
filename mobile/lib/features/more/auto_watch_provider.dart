import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/settings_provider.dart';
import '../../core/storage.dart';
import '../watchlist/watchlist_provider.dart';

/// Local, editable draft of the auto-watch subscription form.
class AutoWatchState {
  const AutoWatchState({
    this.email = '',
    this.news = true,
    this.anomaly = true,
    this.enabled = false,
    this.saving = false,
    this.message,
    this.isError = false,
  });

  final String email;
  final bool news;
  final bool anomaly;
  final bool enabled;
  final bool saving;
  final String? message;
  final bool isError;

  AutoWatchState copyWith({
    String? email,
    bool? news,
    bool? anomaly,
    bool? enabled,
    bool? saving,
    String? message,
    bool? isError,
    bool clearMessage = false,
  }) {
    return AutoWatchState(
      email: email ?? this.email,
      news: news ?? this.news,
      anomaly: anomaly ?? this.anomaly,
      enabled: enabled ?? this.enabled,
      saving: saving ?? this.saving,
      message: clearMessage ? null : (message ?? this.message),
      isError: isError ?? this.isError,
    );
  }
}

class AutoWatchNotifier extends StateNotifier<AutoWatchState> {
  AutoWatchNotifier(this._ref)
      : super(AutoWatchState(
          email: _ref.read(storageProvider).readWatchEmail() ?? '',
        ));

  final Ref _ref;

  void setEmail(String v) =>
      state = state.copyWith(email: v.trim(), clearMessage: true);
  void setNews(bool v) => state = state.copyWith(news: v, clearMessage: true);
  void setAnomaly(bool v) =>
      state = state.copyWith(anomaly: v, clearMessage: true);
  void setEnabled(bool v) =>
      state = state.copyWith(enabled: v, clearMessage: true);

  bool _validEmail(String e) =>
      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(e);

  Future<void> save() async {
    if (!_validEmail(state.email)) {
      state = state.copyWith(message: 'Enter a valid email', isError: true);
      return;
    }
    state = state.copyWith(saving: true, clearMessage: true);
    try {
      final tickers = _ref.read(watchlistProvider);
      final language = _ref.read(localeProvider);
      final sub = WatchSubscription(
        email: state.email,
        tickers: tickers,
        news: state.news,
        anomaly: state.anomaly,
        language: language,
        enabled: state.enabled,
      );
      await _ref.read(apiClientProvider).watchSubscribe(sub);
      await _ref.read(storageProvider).writeWatchEmail(state.email);
      if (!mounted) return;
      state = state.copyWith(
          saving: false, message: 'Auto-watch saved', isError: false);
    } catch (_) {
      if (!mounted) return;
      state = state.copyWith(
          saving: false,
          message: 'Failed to save subscription',
          isError: true);
    }
  }

  Future<void> runNow() async {
    if (!_validEmail(state.email)) {
      state = state.copyWith(message: 'Enter a valid email', isError: true);
      return;
    }
    state = state.copyWith(saving: true, clearMessage: true);
    try {
      await _ref.read(apiClientProvider).watchRunNow(state.email);
      if (!mounted) return;
      state = state.copyWith(
          saving: false, message: 'Run triggered', isError: false);
    } catch (_) {
      if (!mounted) return;
      state = state.copyWith(
          saving: false, message: 'Failed to run', isError: true);
    }
  }
}

final autoWatchProvider =
    StateNotifierProvider<AutoWatchNotifier, AutoWatchState>((ref) {
  return AutoWatchNotifier(ref);
});
