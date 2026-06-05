import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../widgets/state_views.dart';
import '../../widgets/ui_bits.dart';
import 'search_sheet.dart';
import 'watchlist_provider.dart';

class WatchlistScreen extends ConsumerWidget {
  const WatchlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final tickers = ref.watch(watchlistProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(s.watchlistTitle),
        actions: [
          IconButton(
            tooltip: s.addStock,
            icon: const Icon(Icons.add_rounded),
            onPressed: () => showSearchSheet(context),
          ),
        ],
      ),
      body: tickers.isEmpty
          ? RefreshIndicator(
              onRefresh: () async {},
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(
                    height: MediaQuery.of(context).size.height * 0.6,
                    child: EmptyView(
                      icon: Icons.star_border_rounded,
                      title: s.emptyWatchlist,
                      hint: s.emptyWatchlistHint,
                      action: ElevatedButton.icon(
                        onPressed: () => showSearchSheet(context),
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: Text(s.addStock),
                      ),
                    ),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () async {
                for (final t in tickers) {
                  ref.invalidate(quoteProvider(t));
                }
              },
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                itemCount: tickers.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) =>
                    _WatchlistRow(ticker: tickers[i]),
              ),
            ),
    );
  }
}

class _WatchlistRow extends ConsumerWidget {
  const _WatchlistRow({required this.ticker});
  final String ticker;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final quote = ref.watch(quoteProvider(ticker));

    return Dismissible(
      key: ValueKey('wl_$ticker'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        decoration: BoxDecoration(
          color: AppColors.down.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Icon(Icons.delete_outline_rounded, color: AppColors.down),
      ),
      onDismissed: (_) {
        ref.read(watchlistProvider.notifier).remove(ticker);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${s.removeFromWatchlist}: $ticker')),
        );
      },
      child: Material(
        color: Theme.of(context).cardTheme.color,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => context.push('/stock/$ticker'),
          child: Container(
            height: 76,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.palette.border),
            ),
            child: quote.when(
              loading: () => _rowSkeleton(context),
              error: (e, _) => Row(
                children: [
                  Text(
                    ticker,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontFamily: AppTheme.monoFamily,
                      fontSize: 16,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    color: context.palette.textDim,
                    onPressed: () => ref.invalidate(quoteProvider(ticker)),
                  ),
                ],
              ),
              data: (q) => _rowData(context, q),
            ),
          ),
        ),
      ),
    );
  }

  Widget _rowData(BuildContext context, StockQuote q) {
    return Row(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              q.ticker,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontFamily: AppTheme.monoFamily,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 2),
            SizedBox(
              width: 120,
              child: Text(
                q.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style:
                    TextStyle(color: context.palette.textDim, fontSize: 12),
              ),
            ),
          ],
        ),
        const Spacer(),
        Sparkline(
          values: Sparkline.synthetic(q.changePct),
          color: changeColor(q.changePct),
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              formatPrice(q.price),
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontFamily: AppTheme.monoFamily,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 4),
            ChangePill(changePct: q.changePct, compact: true),
          ],
        ),
      ],
    );
  }

  Widget _rowSkeleton(BuildContext context) {
    return const Row(
      children: [
        SkeletonBox(width: 70, height: 18),
        Spacer(),
        SkeletonBox(width: 60, height: 18),
      ],
    );
  }
}
