import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/models/models.dart';
import 'analysis_provider.dart';

class AnalysisScreen extends ConsumerStatefulWidget {
  final String taskId;
  const AnalysisScreen({super.key, required this.taskId});

  @override
  ConsumerState<AnalysisScreen> createState() => _AnalysisScreenState();
}

class _AnalysisScreenState extends ConsumerState<AnalysisScreen> {
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Color _signalColor(String signal) {
    switch (signal.toLowerCase()) {
      case 'bullish':
        return const Color(0xFF00D4AA);
      case 'bearish':
        return const Color(0xFFEF4444);
      default:
        return const Color(0xFFF59E0B);
    }
  }

  Color _actionColor(String action) {
    switch (action.toUpperCase()) {
      case 'BUY':
        return const Color(0xFF00D4AA);
      case 'SELL':
        return const Color(0xFFEF4444);
      default:
        return const Color(0xFFF59E0B);
    }
  }

  @override
  Widget build(BuildContext context) {
    final analysisState = ref.watch(analysisNotifierProvider(widget.taskId));
    final progressStream = ref.watch(analysisProgressProvider(widget.taskId));

    // Feed progress into the notifier
    progressStream.whenData((progress) {
      ref
          .read(analysisNotifierProvider(widget.taskId).notifier)
          .addProgress(progress);
    });

    final progressLog = analysisState.progressLog;
    final latestProgress = progressLog.isNotEmpty ? progressLog.last : null;
    final progressPct = latestProgress?.progressPct ?? 0.0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Analysis'),
        leading: BackButton(onPressed: () => context.go('/home')),
      ),
      body: ListView(
        controller: _scrollController,
        padding: const EdgeInsets.all(16),
        children: [
          // Progress bar
          if (!analysisState.isComplete) ...[
            Text(
              latestProgress?.stage ?? 'Initializing...',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: progressPct / 100,
              backgroundColor: const Color(0xFF111827),
              color: Theme.of(context).colorScheme.primary,
              minHeight: 8,
              borderRadius: BorderRadius.circular(4),
            ),
            const SizedBox(height: 4),
            Text(
              '${progressPct.toStringAsFixed(0)}%',
              style: const TextStyle(color: Colors.grey, fontSize: 12),
              textAlign: TextAlign.end,
            ),
            const SizedBox(height: 16),
          ],

          // Live feed
          if (progressLog.isNotEmpty) ...[
            Text('Live Feed',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            _LiveFeed(messages: progressLog),
            const SizedBox(height: 24),
          ],

          // Analyst reports
          if (analysisState.analystReports.isNotEmpty) ...[
            Text('Analyst Reports',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            ...analysisState.analystReports.values
                .map((r) => _AnalystReportCard(report: r, signalColor: _signalColor(r.signal))),
            const SizedBox(height: 24),
          ],

          // Final decision
          if (analysisState.finalDecision != null) ...[
            Text('Final Decision',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            _FinalDecisionCard(
              decision: analysisState.finalDecision!,
              actionColor: _actionColor(analysisState.finalDecision!.action),
            ),
          ],

          if (!analysisState.isComplete && progressLog.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Column(
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(height: 16),
                    Text('Connecting to analysis engine...'),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _LiveFeed extends StatelessWidget {
  final List<AnalysisProgress> messages;
  const _LiveFeed({required this.messages});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: messages.reversed.take(10).map((m) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.only(top: 6, right: 8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary,
                      shape: BoxShape.circle,
                    ),
                  ),
                  Expanded(
                    child: Text(m.message,
                        style: const TextStyle(fontSize: 13, color: Colors.grey)),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

class _AnalystReportCard extends StatefulWidget {
  final AnalystReport report;
  final Color signalColor;
  const _AnalystReportCard({required this.report, required this.signalColor});

  @override
  State<_AnalystReportCard> createState() => _AnalystReportCardState();
}

class _AnalystReportCardState extends State<_AnalystReportCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.report.analystType,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: widget.signalColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: widget.signalColor),
                  ),
                  child: Text(
                    widget.report.signal.toUpperCase(),
                    style: TextStyle(
                        color: widget.signalColor,
                        fontSize: 11,
                        fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${(widget.report.confidence * 100).toStringAsFixed(0)}%',
                  style: TextStyle(color: widget.signalColor, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(widget.report.summary,
                style: const TextStyle(color: Colors.grey, fontSize: 13)),
            if (_expanded) ...[
              const SizedBox(height: 8),
              if (widget.report.keyEvidence.isNotEmpty) ...[
                const Text('Key Evidence:',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                ...widget.report.keyEvidence.map((e) => Padding(
                      padding: const EdgeInsets.only(left: 8, top: 2),
                      child: Text('• $e',
                          style: const TextStyle(fontSize: 12, color: Colors.grey)),
                    )),
              ],
              if (widget.report.keyRisks.isNotEmpty) ...[
                const SizedBox(height: 6),
                const Text('Key Risks:',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                ...widget.report.keyRisks.map((e) => Padding(
                      padding: const EdgeInsets.only(left: 8, top: 2),
                      child: Text('• $e',
                          style: const TextStyle(
                              fontSize: 12, color: Color(0xFFEF4444))),
                    )),
              ],
            ],
            TextButton(
              onPressed: () => setState(() => _expanded = !_expanded),
              style: TextButton.styleFrom(padding: EdgeInsets.zero),
              child: Text(_expanded ? 'Show less' : 'Show more',
                  style: const TextStyle(fontSize: 12)),
            ),
          ],
        ),
      ),
    );
  }
}

class _FinalDecisionCard extends StatelessWidget {
  final FinalDecision decision;
  final Color actionColor;
  const _FinalDecisionCard({required this.decision, required this.actionColor});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  decoration: BoxDecoration(
                    color: actionColor,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    decision.action,
                    style: const TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.bold,
                        fontSize: 20),
                  ),
                ),
                const SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Confidence: ${(decision.confidence * 100).toStringAsFixed(0)}%',
                      style: TextStyle(color: actionColor, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      'Horizon: ${decision.timeHorizon}',
                      style: const TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text('Reasoning',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Text(decision.reasoning,
                style: const TextStyle(color: Colors.grey, fontSize: 13)),
            if (decision.targetPrice != null || decision.stopLoss != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (decision.targetPrice != null)
                    _MetricChip(
                      label: 'Target',
                      value: '\$${decision.targetPrice!.toStringAsFixed(2)}',
                      color: const Color(0xFF00D4AA),
                    ),
                  const SizedBox(width: 12),
                  if (decision.stopLoss != null)
                    _MetricChip(
                      label: 'Stop Loss',
                      value: '\$${decision.stopLoss!.toStringAsFixed(2)}',
                      color: const Color(0xFFEF4444),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _MetricChip({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
          Text(value,
              style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 14)),
        ],
      ),
    );
  }
}
