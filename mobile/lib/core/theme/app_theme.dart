import 'package:flutter/material.dart';

class AppTheme {
  static ThemeData get dark => ThemeData(
    brightness: Brightness.dark,
    primaryColor: const Color(0xFF00D4AA),
    scaffoldBackgroundColor: const Color(0xFF0A0E1A),
    colorScheme: const ColorScheme.dark(
      primary: Color(0xFF00D4AA),
      secondary: Color(0xFF4361EE),
      surface: Color(0xFF111827),
      error: Color(0xFFEF4444),
    ),
    cardTheme: CardThemeData(
      color: const Color(0xFF111827),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      elevation: 0,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Color(0xFF0A0E1A),
      elevation: 0,
    ),
  );
}
