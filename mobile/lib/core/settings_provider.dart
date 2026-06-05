import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'storage.dart';

/// Theme mode (dark-first). Persisted under StorageKeys.theme.
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier(this._storage)
      : super(_storage.readTheme() == 'light'
            ? ThemeMode.light
            : ThemeMode.dark);

  final Storage _storage;

  void toggle() =>
      setMode(state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark);

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    await _storage.writeTheme(mode == ThemeMode.light ? 'light' : 'dark');
  }
}

final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier(ref.watch(storageProvider));
});

/// App locale: 'en' or 'zh-TW'. Persisted under StorageKeys.locale.
class LocaleNotifier extends StateNotifier<String> {
  LocaleNotifier(this._storage) : super(_storage.readLocale());
  final Storage _storage;

  Future<void> set(String locale) async {
    state = locale;
    await _storage.writeLocale(locale);
  }
}

final localeProvider = StateNotifierProvider<LocaleNotifier, String>((ref) {
  return LocaleNotifier(ref.watch(storageProvider));
});

/// Minimal bilingual string table (EN + ZH-TW), mirroring the web app's i18n.
class Strings {
  Strings(this.locale);
  final String locale;

  bool get _zh => locale == 'zh-TW';

  String get tabToday => _zh ? '今日' : 'Today';
  String get tabWatchlist => _zh ? '自選' : 'Watchlist';
  String get tabPortfolio => _zh ? '投組' : 'Portfolio';
  String get tabMore => _zh ? '更多' : 'More';

  String get todayTitle => _zh ? '今日訊號' : "Today's Signals";
  String get noTriggers => _zh ? '目前沒有觸發訊號' : 'No triggers right now';
  String get noTriggersHint => _zh
      ? '盤面平靜。下拉重新掃描自選股。'
      : 'Markets are quiet. Pull to re-scan your watchlist.';
  String get trumpWatch => _zh ? 'Trump 動態' : 'Trump Watch';

  String get watchlistTitle => _zh ? '自選股' : 'Watchlist';
  String get emptyWatchlist => _zh ? '尚未加入自選股' : 'Your watchlist is empty';
  String get emptyWatchlistHint =>
      _zh ? '點右上角搜尋並加入股票。' : 'Tap the add icon to add a stock.';
  String get addStock => _zh ? '加入股票' : 'Add stock';
  String get searchHint => _zh ? '搜尋代號或公司' : 'Search ticker or company';

  String get portfolioTitle => _zh ? '投資組合' : 'Portfolio';
  String get emptyPortfolio => _zh ? '尚未建立持倉' : 'No holdings yet';
  String get emptyPortfolioHint =>
      _zh ? '新增一筆持倉以追蹤損益。' : 'Add a position to track your P&L.';
  String get totalValue => _zh ? '總市值' : 'Total Value';
  String get totalPnl => _zh ? '總損益' : 'Total P&L';
  String get addPosition => _zh ? '新增持倉' : 'Add Position';
  String get editPosition => _zh ? '編輯持倉' : 'Edit Position';
  String get shares => _zh ? '股數' : 'Shares';
  String get avgCost => _zh ? '平均成本' : 'Avg Cost';
  String get ticker => _zh ? '代號' : 'Ticker';
  String get save => _zh ? '儲存' : 'Save';
  String get delete => _zh ? '刪除' : 'Delete';

  String get moreTitle => _zh ? '更多' : 'More';
  String get appearance => _zh ? '外觀' : 'Appearance';
  String get darkMode => _zh ? '深色模式' : 'Dark mode';
  String get language => _zh ? '語言' : 'Language';
  String get autoWatch => _zh ? '自動監控（Email）' : 'Auto-watch (Email)';
  String get autoWatchHint => _zh
      ? '當自選股出現新聞或異常波動時寄送 Email。'
      : 'Email me when watched stocks have news or anomalies.';
  String get email => 'Email';
  String get newsAlerts => _zh ? '新聞提醒' : 'News alerts';
  String get anomalyAlerts => _zh ? '異常波動提醒' : 'Anomaly alerts';
  String get enabled => _zh ? '啟用' : 'Enabled';
  String get runNow => _zh ? '立即執行' : 'Run now';
  String get account => _zh ? '帳號' : 'Account';
  String get subscription => _zh ? '訂閱' : 'Subscription';
  String get signIn => _zh ? '登入' : 'Sign in';
  String get version => _zh ? '版本' : 'Version';

  String get analyze => _zh ? 'AI 分析' : 'Analyze';
  String get analyzing => _zh ? 'AI 分析中…' : 'Analyzing…';
  String get analyzeWait =>
      _zh ? '深度分析約需 30–50 秒' : 'Deep analysis takes 30–50s';
  String get addToWatchlist => _zh ? '加入自選' : 'Add to watchlist';
  String get removeFromWatchlist => _zh ? '移除自選' : 'Remove from watchlist';
  String get news => _zh ? '新聞' : 'News';
  String get retry => _zh ? '重試' : 'Retry';
  String get errorGeneric => _zh ? '載入失敗' : 'Something went wrong';

  String get reviewSuggested => _zh ? '建議檢視' : 'Review';
  String priorityLabel(String p) {
    switch (p.toLowerCase()) {
      case 'high':
        return _zh ? '高' : 'HIGH';
      case 'medium':
      case 'med':
        return _zh ? '中' : 'MED';
      default:
        return _zh ? '低' : 'LOW';
    }
  }
}

final stringsProvider =
    Provider<Strings>((ref) => Strings(ref.watch(localeProvider)));
