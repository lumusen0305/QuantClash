import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/theme.dart';

final NumberFormat _price = NumberFormat('#,##0.00');

String formatPrice(num v) => _price.format(v);
String formatMoney(num v) => '\$${_price.format(v)}';
String formatCompact(num v) => NumberFormat.compact().format(v);

String formatPct(num v, {bool sign = true}) {
  final s = sign && v > 0 ? '+' : '';
  return '$s${v.toStringAsFixed(2)}%';
}

String formatSigned(num v) {
  final s = v > 0 ? '+' : '';
  return '$s${_price.format(v)}';
}

/// A colored pill that shows a percentage change (green up / red down).
class ChangePill extends StatelessWidget {
  const ChangePill({super.key, required this.changePct, this.compact = false});

  final num changePct;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = changeColor(changePct);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 7 : 10,
        vertical: compact ? 3 : 5,
      ),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            changePct >= 0
                ? Icons.arrow_drop_up_rounded
                : Icons.arrow_drop_down_rounded,
            color: c,
            size: compact ? 16 : 20,
          ),
          Text(
            formatPct(changePct, sign: false),
            style: TextStyle(
              color: c,
              fontWeight: FontWeight.w700,
              fontSize: compact ? 12 : 14,
              fontFamily: AppTheme.monoFamily,
            ),
          ),
        ],
      ),
    );
  }
}

/// Small labeled badge (e.g. priority HIGH/MED/LOW).
class PriorityBadge extends StatelessWidget {
  const PriorityBadge({super.key, required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

/// Compact chip used for scan event details ("5d +9.2%").
class EventChip extends StatelessWidget {
  const EventChip({super.key, required this.label, this.color});
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? context.palette.textDim;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: context.palette.surfaceAlt,
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: context.palette.border),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: c,
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          fontFamily: AppTheme.monoFamily,
        ),
      ),
    );
  }
}

/// A tiny line sparkline. Pass real closes or a synthetic 2-point line.
class Sparkline extends StatelessWidget {
  const Sparkline({
    super.key,
    required this.values,
    required this.color,
    this.width = 64,
    this.height = 28,
  });

  final List<double> values;
  final Color color;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    if (values.length < 2) return SizedBox(width: width, height: height);
    final spots = <FlSpot>[
      for (var i = 0; i < values.length; i++) FlSpot(i.toDouble(), values[i]),
    ];
    return SizedBox(
      width: width,
      height: height,
      child: LineChart(
        LineChartData(
          gridData: const FlGridData(show: false),
          titlesData: const FlTitlesData(show: false),
          borderData: FlBorderData(show: false),
          lineTouchData: const LineTouchData(enabled: false),
          minX: 0,
          maxX: (values.length - 1).toDouble(),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              barWidth: 1.8,
              color: color,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(
                show: true,
                color: color.withValues(alpha: 0.12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Builds a fake 2-point line from a change% so we don't burn an API call.
  static List<double> synthetic(double changePct) => [100, 100 + changePct];
}
