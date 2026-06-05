import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'features/auth/auth_screen.dart';
import 'features/more/more_screen.dart';
import 'features/portfolio/portfolio_screen.dart';
import 'features/shell/app_shell.dart';
import 'features/stock/stock_detail_screen.dart';
import 'features/subscription/subscription_screen.dart';
import 'features/today/today_screen.dart';
import 'features/watchlist/watchlist_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

/// App router: a 4-tab bottom-nav shell (Today / Watchlist / Portfolio / More)
/// plus top-level routes for the stock detail screen and the reachable-but-
/// secondary auth & subscription screens (linked from the More tab).
final appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/today',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) =>
          AppShell(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/today',
              builder: (_, __) => const TodayScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/watchlist',
              builder: (_, __) => const WatchlistScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/portfolio',
              builder: (_, __) => const PortfolioScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/more',
              builder: (_, __) => const MoreScreen(),
            ),
          ],
        ),
      ],
    ),

    // Top-level routes (pushed over the shell, full-screen).
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/stock/:ticker',
      builder: (_, state) =>
          StockDetailScreen(ticker: state.pathParameters['ticker']!),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/auth',
      builder: (_, __) => const AuthScreen(),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/subscription',
      builder: (_, __) => const SubscriptionScreen(),
    ),
  ],
);
