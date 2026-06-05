import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/settings_provider.dart';

/// The bottom-navigation shell hosting the 4 primary tabs.
///
/// Driven by go_router's [StatefulNavigationShell] so each tab keeps its own
/// navigation stack and scroll state.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: navigationShell.currentIndex,
        onTap: (index) => navigationShell.goBranch(
          index,
          // Tapping the active tab returns to its root.
          initialLocation: index == navigationShell.currentIndex,
        ),
        items: [
          BottomNavigationBarItem(
            icon: const Icon(Icons.bolt_outlined),
            activeIcon: const Icon(Icons.bolt_rounded),
            label: s.tabToday,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.star_border_rounded),
            activeIcon: const Icon(Icons.star_rounded),
            label: s.tabWatchlist,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.pie_chart_outline_rounded),
            activeIcon: const Icon(Icons.pie_chart_rounded),
            label: s.tabPortfolio,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.more_horiz_rounded),
            activeIcon: const Icon(Icons.more_horiz_rounded),
            label: s.tabMore,
          ),
        ],
      ),
    );
  }
}
