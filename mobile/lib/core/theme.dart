import 'package:flutter/material.dart';

/// QuantClash mobile theme.
///
/// Aesthetic direction: a calm "night-sky trading deck". Dark-first and
/// data-forward. Numbers/tickers use a monospace family for a tabular
/// terminal feel; UI text uses the platform sans. Semantic colors are shared
/// across both themes:
///   green = up / buy, red = down / sell, amber = hold / medium priority.
///
/// Brand accent is the app's existing teal (0xFF00D4AA) carried over from the
/// original theme so the rebuild stays visually consistent with auth /
/// subscription screens, paired with deep navy surfaces.
class AppColors {
  AppColors._();

  // Semantic (shared between light & dark).
  static const Color up = Color(0xFF00D4AA); // teal/green — up & buy
  static const Color down = Color(0xFFEF4444); // red — down & sell
  static const Color hold = Color(0xFFF59E0B); // amber — hold & medium

  static const Color buy = up;
  static const Color sell = down;

  // Priority badges.
  static const Color priorityHigh = Color(0xFFEF4444);
  static const Color priorityMedium = Color(0xFFF59E0B);
  static const Color priorityLow = Color(0xFF38BDF8);

  // Brand accent.
  static const Color accent = Color(0xFF00D4AA);
  static const Color accentDeep = Color(0xFF0E9E84);
  static const Color onAccent = Color(0xFF04211B);

  // Dark palette (matches the original 0xFF0A0E1A / 0xFF111827 family).
  static const Color darkBg = Color(0xFF0A0E1A);
  static const Color darkSurface = Color(0xFF111827);
  static const Color darkSurfaceAlt = Color(0xFF1A2236);
  static const Color darkBorder = Color(0xFF243042);
  static const Color darkText = Color(0xFFE6EDF3);
  static const Color darkTextDim = Color(0xFF8B98A9);

  // Light palette.
  static const Color lightBg = Color(0xFFF6F8FB);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceAlt = Color(0xFFEEF2F7);
  static const Color lightBorder = Color(0xFFD9E0EA);
  static const Color lightText = Color(0xFF0B1320);
  static const Color lightTextDim = Color(0xFF5B6776);
}

/// Returns the semantic color for a signed change value.
Color changeColor(num value) {
  if (value > 0) return AppColors.up;
  if (value < 0) return AppColors.down;
  return AppColors.hold;
}

/// Returns the semantic color for an action verb (BUY / SELL / HOLD).
Color actionColor(String? action) {
  switch ((action ?? '').toUpperCase()) {
    case 'BUY':
    case 'STRONG BUY':
      return AppColors.buy;
    case 'SELL':
    case 'STRONG SELL':
      return AppColors.sell;
    default:
      return AppColors.hold;
  }
}

/// Returns the semantic color for a scan priority string.
Color priorityColor(String? priority) {
  switch ((priority ?? '').toLowerCase()) {
    case 'high':
      return AppColors.priorityHigh;
    case 'medium':
    case 'med':
      return AppColors.priorityMedium;
    default:
      return AppColors.priorityLow;
  }
}

class AppTheme {
  AppTheme._();

  /// Monospace family used for prices, tickers and other tabular figures.
  static const String monoFamily = 'monospace';

  static ThemeData get dark => _build(
        brightness: Brightness.dark,
        bg: AppColors.darkBg,
        surface: AppColors.darkSurface,
        surfaceAlt: AppColors.darkSurfaceAlt,
        border: AppColors.darkBorder,
        text: AppColors.darkText,
        textDim: AppColors.darkTextDim,
      );

  static ThemeData get light => _build(
        brightness: Brightness.light,
        bg: AppColors.lightBg,
        surface: AppColors.lightSurface,
        surfaceAlt: AppColors.lightSurfaceAlt,
        border: AppColors.lightBorder,
        text: AppColors.lightText,
        textDim: AppColors.lightTextDim,
      );

  static ThemeData _build({
    required Brightness brightness,
    required Color bg,
    required Color surface,
    required Color surfaceAlt,
    required Color border,
    required Color text,
    required Color textDim,
  }) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: AppColors.accent,
      onPrimary: AppColors.onAccent,
      secondary: AppColors.accentDeep,
      onSecondary: Colors.white,
      error: AppColors.down,
      onError: Colors.white,
      surface: surface,
      onSurface: text,
    );

    final base =
        brightness == Brightness.dark ? ThemeData.dark() : ThemeData.light();

    return base.copyWith(
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      canvasColor: bg,
      dividerColor: border,
      splashFactory: InkRipple.splashFactory,
      textTheme: base.textTheme.apply(bodyColor: text, displayColor: text),
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        foregroundColor: text,
        titleTextStyle: TextStyle(
          color: text,
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
      ),
      cardTheme: CardThemeData(
        color: surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: border),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: AppColors.accent,
        unselectedItemColor: textDim,
        type: BottomNavigationBarType.fixed,
        showUnselectedLabels: true,
        selectedLabelStyle:
            const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: const TextStyle(fontSize: 11),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceAlt,
        hintStyle: TextStyle(color: textDim),
        labelStyle: TextStyle(color: textDim),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.onAccent,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.accent),
      ),
      listTileTheme: ListTileThemeData(iconColor: textDim, textColor: text),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceAlt,
        contentTextStyle: TextStyle(color: text),
        behavior: SnackBarBehavior.floating,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      progressIndicatorTheme:
          const ProgressIndicatorThemeData(color: AppColors.accent),
      extensions: <ThemeExtension<dynamic>>[
        AppPalette(surfaceAlt: surfaceAlt, border: border, textDim: textDim),
      ],
    );
  }
}

/// Extra palette slots not covered by [ColorScheme], reachable via
/// `context.palette` (see extension below).
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.surfaceAlt,
    required this.border,
    required this.textDim,
  });

  final Color surfaceAlt;
  final Color border;
  final Color textDim;

  @override
  AppPalette copyWith({Color? surfaceAlt, Color? border, Color? textDim}) {
    return AppPalette(
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      border: border ?? this.border,
      textDim: textDim ?? this.textDim,
    );
  }

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    return AppPalette(
      surfaceAlt: Color.lerp(surfaceAlt, other.surfaceAlt, t)!,
      border: Color.lerp(border, other.border, t)!,
      textDim: Color.lerp(textDim, other.textDim, t)!,
    );
  }
}

extension AppPaletteX on BuildContext {
  AppPalette get palette =>
      Theme.of(this).extension<AppPalette>() ??
      const AppPalette(
        surfaceAlt: AppColors.darkSurfaceAlt,
        border: AppColors.darkBorder,
        textDim: AppColors.darkTextDim,
      );
}
