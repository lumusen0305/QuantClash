import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../widgets/state_views.dart';
import '../../widgets/ui_bits.dart';
import '../watchlist/watchlist_provider.dart';
import 'position_form_sheet.dart';
import 'positions_provider.dart';

class PortfolioScreen extends ConsumerWidget {
  const PortfolioScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final positions = ref.watch(positionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(s.portfolioTitle),
        actions: [
          IconButton(
            tooltip: s.addPosition,
            icon: const Icon(Icons.add_rounded),
            onPressed: () => showPositionForm(context),
          ),
        ],
      ),
      body: positions.isEmpty
          ? RefreshIndicator(
              onRefresh: () async {},
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(
                    height: MediaQuery.of(context).size.height * 0.6,
                    child: EmptyView(
                      icon: Icons.pie_chart_outline_rounded,
                      title: s.emptyPortfolio,
                      hint: s.emptyPortfolioHint,
                      action: ElevatedButton.icon(
                        onPressed: () => showPositionForm(context),
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: Text(s.addPosition),
                      ),
                    ),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () async {
                for (final p in positions) {
                  ref.invalidate(quoteProvider(p.ticker));
                }
              },
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  _PortfolioSummary(positions: positions),
                  const SizedBox(height: 16),
                  ...positions.map(
                    (p) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _PositionCard(position: p),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

/// Reads each position's quote and sums totals. Watches each quoteProvider so
/// the summary updates as quotes resolve.
class _PortfolioSummary extends ConsumerWidget {
  const _PortfolioSummary({required this.positions});
  final List<Position> positions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);

    double totalValue = 0;
    double totalCost = 0;
    bool anyLoaded = false;

    for (final p in positions) {
      totalCost += p.costBasis;
      final price = ref.watch(quoteProvider(p.ticker)).asData?.value.price;
      if (price != null) {
        anyLoaded = true;
        totalValue += p.marketValue(price);
      } else {
        totalValue += p.costBasis; // fall back to cost until quote resolves
      }
    }

    final pnl = totalValue - totalCost;
    final pnlPct = totalCost == 0 ? 0.0 : (pnl / totalCost) * 100;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.accentDeep.withValues(alpha: 0.20),
            context.palette.surfaceAlt,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.totalValue,
              style: TextStyle(color: context.palette.textDim, fontSize: 13)),
          const SizedBox(height: 4),
          Text(
            formatMoney(totalValue),
            style: const TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.w800,
              fontFamily: AppTheme.monoFamily,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text('${s.totalPnl}:  ',
                  style:
                      TextStyle(color: context.palette.textDim, fontSize: 13)),
              Text(
                formatSigned(pnl),
                style: TextStyle(
                  color: anyLoaded
                      ? changeColor(pnl)
                      : context.palette.textDim,
                  fontWeight: FontWeight.w700,
                  fontFamily: AppTheme.monoFamily,
                ),
              ),
              const SizedBox(width: 8),
              if (anyLoaded) ChangePill(changePct: pnlPct, compact: true),
            ],
          ),
        ],
      ),
    );
  }
}

class _PositionCard extends ConsumerWidget {
  const _PositionCard({required this.position});
  final Position position;

  String _trim(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quote = ref.watch(quoteProvider(position.ticker));

    return Material(
      color: Theme.of(context).cardTheme.color,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/stock/${position.ticker}'),
        onLongPress: () => showPositionForm(context, existing: position),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.palette.border),
          ),
          child: quote.when(
            loading: () => const SizedBox(
              height: 44,
              child: Row(
                children: [
                  SkeletonBox(width: 70, height: 18),
                  Spacer(),
                  SkeletonBox(width: 80, height: 18),
                ],
              ),
            ),
            error: (e, _) => _header(context, ref, null),
            data: (q) => Column(
              children: [
                _header(context, ref, q),
                const SizedBox(height: 12),
                _metrics(context, q),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context, WidgetRef ref, StockQuote? q) {
    return Row(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              position.ticker,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontFamily: AppTheme.monoFamily,
                fontSize: 17,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${_trim(position.shares)} sh @ ${formatMoney(position.avgCost)}',
              style: TextStyle(color: context.palette.textDim, fontSize: 12),
            ),
          ],
        ),
        const Spacer(),
        if (q != null)
          Text(
            formatMoney(q.price),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontFamily: AppTheme.monoFamily,
              fontSize: 15,
            ),
          )
        else
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 18),
            color: context.palette.textDim,
            onPressed: () => ref.invalidate(quoteProvider(position.ticker)),
          ),
        IconButton(
          icon: Icon(Icons.more_vert_rounded,
              size: 18, color: context.palette.textDim),
          onPressed: () => showPositionForm(context, existing: position),
        ),
      ],
    );
  }

  Widget _metrics(BuildContext context, StockQuote q) {
    final mv = position.marketValue(q.price);
    final pnl = position.pnl(q.price);
    final pnlPct = position.pnlPct(q.price);
    return Row(
      children: [
        _metric(context, 'Value', formatMoney(mv)),
        const SizedBox(width: 20),
        _metric(context, 'P&L', formatSigned(pnl), color: changeColor(pnl)),
        const Spacer(),
        ChangePill(changePct: pnlPct, compact: true),
      ],
    );
  }

  Widget _metric(BuildContext context, String label, String value,
      {Color? color}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: TextStyle(color: context.palette.textDim, fontSize: 11)),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontFamily: AppTheme.monoFamily,
            fontSize: 14,
            color: color,
          ),
        ),
      ],
    );
  }
}
