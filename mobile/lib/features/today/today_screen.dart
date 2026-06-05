import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../widgets/state_views.dart';
import '../../widgets/ui_bits.dart';
import 'today_provider.dart';

class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final scan = ref.watch(scanProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(s.todayTitle),
        actions: [
          IconButton(
            tooltip: s.retry,
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(scanProvider),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(scanProvider);
          ref.invalidate(trumpFeedProvider);
          await ref.read(scanProvider.future).catchError(
                (_) => ScanResult.empty(),
              );
        },
        child: scan.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: const [_TodaySkeleton()],
          ),
          error: (e, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              SizedBox(
                height: MediaQuery.of(context).size.height * 0.6,
                child: ErrorView(
                  message: s.errorGeneric,
                  detail: '$e',
                  retryLabel: s.retry,
                  onRetry: () => ref.invalidate(scanProvider),
                ),
              ),
            ],
          ),
          data: (result) => _TodayBody(result: result),
        ),
      ),
    );
  }
}

class _TodayBody extends ConsumerWidget {
  const _TodayBody({required this.result});
  final ScanResult result;

  static int _rank(String p) {
    switch (p.toLowerCase()) {
      case 'high':
        return 3;
      case 'medium':
      case 'med':
        return 2;
      default:
        return 1;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final triggers = [...result.triggers]
      ..sort((a, b) => _rank(b.priority).compareTo(_rank(a.priority)));

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _ScanSummary(result: result),
        const SizedBox(height: 16),
        if (triggers.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40),
            child: EmptyView(
              icon: Icons.bolt_rounded,
              title: s.noTriggers,
              hint: s.noTriggersHint,
            ),
          )
        else
          ...triggers.map(
            (t) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _TriggerCard(trigger: t),
            ),
          ),
        const SizedBox(height: 8),
        const _TrumpStrip(),
      ],
    );
  }
}

class _ScanSummary extends StatelessWidget {
  const _ScanSummary({required this.result});
  final ScanResult result;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.accentDeep.withValues(alpha: 0.20),
            context.palette.surfaceAlt,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.palette.border),
      ),
      child: Row(
        children: [
          _stat(context, '${result.triggered}', 'triggered'),
          Container(
            width: 1,
            height: 34,
            margin: const EdgeInsets.symmetric(horizontal: 18),
            color: context.palette.border,
          ),
          _stat(context, '${result.scanned}', 'scanned'),
          const Spacer(),
          Icon(Icons.radar_rounded,
              color: AppColors.accent.withValues(alpha: 0.8), size: 28),
        ],
      ),
    );
  }

  Widget _stat(BuildContext context, String value, String label) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            fontFamily: AppTheme.monoFamily,
          ),
        ),
        Text(label,
            style: TextStyle(color: context.palette.textDim, fontSize: 12)),
      ],
    );
  }
}

class _TriggerCard extends ConsumerWidget {
  const _TriggerCard({required this.trigger});
  final ScanTrigger trigger;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final pColor = priorityColor(trigger.priority);

    return Material(
      color: Theme.of(context).cardTheme.color,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/stock/${trigger.ticker}'),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.palette.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    trigger.ticker,
                    style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                      fontFamily: AppTheme.monoFamily,
                    ),
                  ),
                  const SizedBox(width: 8),
                  PriorityBadge(
                    label: s.priorityLabel(trigger.priority),
                    color: pColor,
                  ),
                  const Spacer(),
                  if (trigger.recommendedReview.isNotEmpty)
                    Row(
                      children: [
                        const Icon(Icons.visibility_rounded,
                            size: 14, color: AppColors.accent),
                        const SizedBox(width: 4),
                        Text(
                          s.reviewSuggested,
                          style: const TextStyle(
                            color: AppColors.accent,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  EventChip(
                    label: '5d ${formatPct(trigger.chg5d)}',
                    color: changeColor(trigger.chg5d),
                  ),
                  EventChip(
                    label: 'vol ${trigger.relVolume.toStringAsFixed(1)}x',
                  ),
                  ...trigger.events.map(
                    (e) => EventChip(
                      label: e.detail.isNotEmpty ? e.detail : e.type,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TrumpStrip extends ConsumerStatefulWidget {
  const _TrumpStrip();

  @override
  ConsumerState<_TrumpStrip> createState() => _TrumpStripState();
}

class _TrumpStripState extends ConsumerState<_TrumpStrip> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(stringsProvider);
    final feed = ref.watch(trumpFeedProvider);

    return Container(
      decoration: BoxDecoration(
        color: context.palette.surfaceAlt,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.palette.border),
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  const Icon(Icons.campaign_rounded,
                      size: 18, color: AppColors.hold),
                  const SizedBox(width: 10),
                  Text(s.trumpWatch,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Icon(
                    _expanded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    color: context.palette.textDim,
                  ),
                ],
              ),
            ),
          ),
          AnimatedCrossFade(
            duration: const Duration(milliseconds: 220),
            crossFadeState: _expanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            firstChild: const SizedBox(width: double.infinity),
            secondChild: feed.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(20),
                child: LoadingView(),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(s.errorGeneric,
                    style: TextStyle(color: context.palette.textDim)),
              ),
              data: (f) {
                if (f.posts.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('—',
                        style: TextStyle(color: context.palette.textDim)),
                  );
                }
                return Column(
                  children: f.posts.take(5).map((p) {
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            margin: const EdgeInsets.only(top: 6, right: 10),
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: AppColors.hold,
                              shape: BoxShape.circle,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              p.text,
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style:
                                  const TextStyle(fontSize: 13, height: 1.35),
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TodaySkeleton extends StatelessWidget {
  const _TodaySkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SkeletonBox(height: 64, radius: 16),
        const SizedBox(height: 16),
        for (var i = 0; i < 4; i++) ...[
          const SkeletonBox(height: 96, radius: 16),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}
