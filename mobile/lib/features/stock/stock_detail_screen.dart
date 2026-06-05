import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../widgets/state_views.dart';
import '../../widgets/ui_bits.dart';
import '../watchlist/watchlist_provider.dart';
import 'price_chart.dart';
import 'stock_detail_provider.dart';

const _periods = ['1w', '1m', '3m', '1y'];

class StockDetailScreen extends ConsumerWidget {
  const StockDetailScreen({super.key, required this.ticker});
  final String ticker;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final t = ticker.toUpperCase();
    final quote = ref.watch(quoteProvider(t));
    final inWatchlist = ref.watch(watchlistProvider).contains(t);

    return Scaffold(
      appBar: AppBar(
        title: Text(t, style: const TextStyle(fontFamily: AppTheme.monoFamily)),
        actions: [
          IconButton(
            tooltip: inWatchlist ? s.removeFromWatchlist : s.addToWatchlist,
            icon: Icon(
              inWatchlist ? Icons.star_rounded : Icons.star_border_rounded,
              color: inWatchlist ? AppColors.hold : null,
            ),
            onPressed: () {
              ref.read(watchlistProvider.notifier).toggle(t);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(inWatchlist
                      ? '${s.removeFromWatchlist}: $t'
                      : '${s.addToWatchlist}: $t'),
                ),
              );
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(quoteProvider(t));
          ref.invalidate(detailOhlcvProvider(t));
          ref.invalidate(detailNewsProvider(t));
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            quote.when(
              loading: () => const SkeletonBox(height: 80, radius: 16),
              error: (e, _) => ErrorView(
                message: s.errorGeneric,
                detail: '$e',
                retryLabel: s.retry,
                onRetry: () => ref.invalidate(quoteProvider(t)),
              ),
              data: (q) => _QuoteHeader(quote: q),
            ),
            const SizedBox(height: 20),
            _PeriodSelector(ticker: t),
            const SizedBox(height: 12),
            _ChartSection(ticker: t),
            const SizedBox(height: 24),
            _AnalyzeSection(ticker: t),
            const SizedBox(height: 28),
            _NewsSection(ticker: t),
          ],
        ),
      ),
    );
  }
}

class _QuoteHeader extends StatelessWidget {
  const _QuoteHeader({required this.quote});
  final StockQuote quote;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(quote.name,
            style: TextStyle(color: context.palette.textDim, fontSize: 14)),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              formatPrice(quote.price),
              style: const TextStyle(
                fontSize: 38,
                fontWeight: FontWeight.w800,
                fontFamily: AppTheme.monoFamily,
                height: 1,
              ),
            ),
            const SizedBox(width: 12),
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: ChangePill(changePct: quote.changePct),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          '${formatSigned(quote.change)} today',
          style: TextStyle(
            color: changeColor(quote.change),
            fontFamily: AppTheme.monoFamily,
            fontWeight: FontWeight.w600,
            fontSize: 13,
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            _stat(context, 'Open', quote.open),
            _stat(context, 'High', quote.high),
            _stat(context, 'Low', quote.low),
            _stat(context, 'Prev', quote.prevClose),
          ],
        ),
      ],
    );
  }

  Widget _stat(BuildContext context, String label, double value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(color: context.palette.textDim, fontSize: 11)),
          const SizedBox(height: 2),
          Text(
            formatPrice(value),
            style: const TextStyle(
              fontFamily: AppTheme.monoFamily,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

class _PeriodSelector extends ConsumerWidget {
  const _PeriodSelector({required this.ticker});
  final String ticker;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(chartPeriodProvider(ticker));
    return Row(
      children: _periods.map((p) {
        final active = p == selected;
        return Expanded(
          child: GestureDetector(
            onTap: () =>
                ref.read(chartPeriodProvider(ticker).notifier).state = p,
            child: Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: BoxDecoration(
                color: active
                    ? AppColors.accent.withValues(alpha: 0.16)
                    : context.palette.surfaceAlt,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: active ? AppColors.accent : context.palette.border,
                ),
              ),
              child: Text(
                p.toUpperCase(),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: active ? AppColors.accent : context.palette.textDim,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  fontFamily: AppTheme.monoFamily,
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _ChartSection extends ConsumerWidget {
  const _ChartSection({required this.ticker});
  final String ticker;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final ohlcv = ref.watch(detailOhlcvProvider(ticker));
    return SizedBox(
      height: 240,
      child: ohlcv.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(
          message: s.errorGeneric,
          detail: '$e',
          retryLabel: s.retry,
          onRetry: () => ref.invalidate(detailOhlcvProvider(ticker)),
        ),
        data: (series) {
          if (series.candles.length < 2) {
            return const EmptyView(
                icon: Icons.show_chart_rounded, title: '—');
          }
          return PriceChart(candles: series.candles);
        },
      ),
    );
  }
}

class _AnalyzeSection extends ConsumerWidget {
  const _AnalyzeSection({required this.ticker});
  final String ticker;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final state = ref.watch(analysisProvider(ticker));
    final notifier = ref.read(analysisProvider(ticker).notifier);

    if (state.loading) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 28),
        decoration: BoxDecoration(
          color: context.palette.surfaceAlt,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.palette.border),
        ),
        child: Column(
          children: [
            const SizedBox(
              width: 30,
              height: 30,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
            const SizedBox(height: 16),
            Text(s.analyzing,
                style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(s.analyzeWait,
                style:
                    TextStyle(color: context.palette.textDim, fontSize: 12)),
          ],
        ),
      );
    }

    if (state.error != null) {
      return ErrorView(
        message: s.errorGeneric,
        detail: '${state.error}',
        retryLabel: s.retry,
        onRetry: () => notifier.run(ticker),
      );
    }

    if (state.hasResult) {
      return _AnalysisResultView(
        result: state.result!,
        onRerun: () => notifier.run(ticker),
      );
    }

    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () => notifier.run(ticker),
        icon: const Icon(Icons.auto_awesome_rounded, size: 20),
        label: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Text(s.analyze),
        ),
      ),
    );
  }
}

class _AnalysisResultView extends ConsumerWidget {
  const _AnalysisResultView({required this.result, required this.onRerun});
  final AnalysisResult result;
  final VoidCallback onRerun;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final c = actionColor(result.action);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              decoration: BoxDecoration(
                color: c.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: c.withValues(alpha: 0.5)),
              ),
              child: Text(
                result.action,
                style: TextStyle(
                  color: c,
                  fontWeight: FontWeight.w900,
                  fontSize: 20,
                  letterSpacing: 1.2,
                ),
              ),
            ),
            const Spacer(),
            IconButton(
              tooltip: s.retry,
              icon: const Icon(Icons.refresh_rounded),
              color: context.palette.textDim,
              onPressed: onRerun,
            ),
          ],
        ),
        if (result.finalDecision.isNotEmpty) ...[
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.palette.surfaceAlt,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.palette.border),
            ),
            child: Text(
              result.finalDecision,
              style: const TextStyle(fontSize: 14, height: 1.5),
            ),
          ),
        ],
        if (result.reports.isNotEmpty) ...[
          const SizedBox(height: 14),
          ...result.reports.entries.map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _ReportTile(label: e.key, body: e.value),
            ),
          ),
        ],
      ],
    );
  }
}

class _ReportTile extends StatelessWidget {
  const _ReportTile({required this.label, required this.body});
  final String label;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.palette.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 16),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          title:
              Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
          iconColor: AppColors.accent,
          collapsedIconColor: context.palette.textDim,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(body,
                  style: const TextStyle(fontSize: 13.5, height: 1.5)),
            ),
          ],
        ),
      ),
    );
  }
}

class _NewsSection extends ConsumerWidget {
  const _NewsSection({required this.ticker});
  final String ticker;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final news = ref.watch(detailNewsProvider(ticker));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(s.news,
            style:
                const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        news.when(
          loading: () => Column(
            children: List.generate(
              3,
              (_) => const Padding(
                padding: EdgeInsets.only(bottom: 10),
                child: SkeletonBox(height: 70, radius: 12),
              ),
            ),
          ),
          error: (e, _) => ErrorView(
            message: s.errorGeneric,
            detail: '$e',
            retryLabel: s.retry,
            onRetry: () => ref.invalidate(detailNewsProvider(ticker)),
          ),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyView(
                  icon: Icons.feed_outlined, title: '—');
            }
            return Column(
              children: items
                  .take(15)
                  .map((n) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _NewsCard(item: n),
                      ))
                  .toList(),
            );
          },
        ),
      ],
    );
  }
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.item});
  final NewsItem item;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).cardTheme.color,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          if (item.url.isEmpty) return;
          // url_launcher isn't a dependency in this build, so we copy the
          // link to the clipboard and confirm — the user opens it manually.
          Clipboard.setData(ClipboardData(text: item.url));
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Link copied to clipboard')),
          );
        },
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.palette.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  height: 1.3,
                ),
              ),
              if (item.summary.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  item.summary,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: context.palette.textDim,
                    fontSize: 12.5,
                    height: 1.35,
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.public_rounded,
                      size: 13, color: context.palette.textDim),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      item.source.isEmpty ? '—' : item.source,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: context.palette.textDim, fontSize: 11.5),
                    ),
                  ),
                  Icon(Icons.open_in_new_rounded,
                      size: 13, color: context.palette.textDim),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
