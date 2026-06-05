import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../core/theme.dart';
import '../../widgets/ui_bits.dart';

/// A clean close-price area chart.
///
/// fl_chart 0.69 has no first-class candlestick chart, and on a phone an area
/// line of closes reads far better than tiny candles. Line color reflects the
/// period's net direction (green up / red down). Min/max are annotated.
class PriceChart extends StatelessWidget {
  const PriceChart({super.key, required this.candles});
  final List<Candle> candles;

  @override
  Widget build(BuildContext context) {
    final closes = candles.map((c) => c.close).toList();
    final first = closes.first;
    final last = closes.last;
    final up = last >= first;
    final lineColor = up ? AppColors.up : AppColors.down;

    final minY = closes.reduce((a, b) => a < b ? a : b);
    final maxY = closes.reduce((a, b) => a > b ? a : b);
    final pad = (maxY - minY) == 0 ? 1.0 : (maxY - minY) * 0.08;
    final interval = ((maxY - minY) + 2 * pad) / 4;

    final spots = <FlSpot>[
      for (var i = 0; i < closes.length; i++) FlSpot(i.toDouble(), closes[i]),
    ];

    return Column(
      children: [
        Expanded(
          child: LineChart(
            LineChartData(
              minX: 0,
              maxX: (closes.length - 1).toDouble(),
              minY: minY - pad,
              maxY: maxY + pad,
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                horizontalInterval: interval,
                getDrawingHorizontalLine: (_) => FlLine(
                  color: context.palette.border,
                  strokeWidth: 1,
                  dashArray: const [4, 4],
                ),
              ),
              titlesData: FlTitlesData(
                topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false)),
                bottomTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false)),
                leftTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false)),
                rightTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 48,
                    interval: interval,
                    getTitlesWidget: (value, meta) => Text(
                      formatCompact(value),
                      style: TextStyle(
                        color: context.palette.textDim,
                        fontSize: 10,
                        fontFamily: AppTheme.monoFamily,
                      ),
                    ),
                  ),
                ),
              ),
              borderData: FlBorderData(show: false),
              lineTouchData: LineTouchData(
                touchTooltipData: LineTouchTooltipData(
                  getTooltipColor: (_) => context.palette.surfaceAlt,
                  getTooltipItems: (touched) => touched
                      .map(
                        (t) => LineTooltipItem(
                          formatPrice(t.y),
                          TextStyle(
                            color: lineColor,
                            fontWeight: FontWeight.w700,
                            fontFamily: AppTheme.monoFamily,
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              lineBarsData: [
                LineChartBarData(
                  spots: spots,
                  isCurved: true,
                  barWidth: 2,
                  color: lineColor,
                  dotData: const FlDotData(show: false),
                  belowBarData: BarAreaData(
                    show: true,
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        lineColor.withValues(alpha: 0.25),
                        lineColor.withValues(alpha: 0.0),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _label(context, 'L ${formatPrice(minY)}'),
            _label(context, '${candles.length} pts'),
            _label(context, 'H ${formatPrice(maxY)}'),
          ],
        ),
      ],
    );
  }

  Widget _label(BuildContext context, String text) {
    return Text(
      text,
      style: TextStyle(
        color: context.palette.textDim,
        fontSize: 11,
        fontFamily: AppTheme.monoFamily,
      ),
    );
  }
}
