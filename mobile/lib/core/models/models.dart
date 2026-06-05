import 'package:freezed_annotation/freezed_annotation.dart';

part 'models.freezed.dart';
part 'models.g.dart';

@freezed
class User with _$User {
  const factory User({
    required String id,
    required String email,
    required String tier,
    required DateTime createdAt,
  }) = _User;
  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}

@freezed
class StockQuote with _$StockQuote {
  const factory StockQuote({
    required String ticker,
    required double price,
    required double change,
    required double changePct,
    double? high,
    double? low,
    double? open,
    double? prevClose,
  }) = _StockQuote;
  factory StockQuote.fromJson(Map<String, dynamic> json) => _$StockQuoteFromJson(json);
}

@freezed
class AnalystReport with _$AnalystReport {
  const factory AnalystReport({
    required String analystType,
    required String summary,
    required String signal,
    required double confidence,
    required List<String> keyEvidence,
    required List<String> keyRisks,
  }) = _AnalystReport;
  factory AnalystReport.fromJson(Map<String, dynamic> json) => _$AnalystReportFromJson(json);
}

@freezed
class FinalDecision with _$FinalDecision {
  const factory FinalDecision({
    required String action,
    required double confidence,
    required String reasoning,
    double? targetPrice,
    double? stopLoss,
    required String timeHorizon,
  }) = _FinalDecision;
  factory FinalDecision.fromJson(Map<String, dynamic> json) => _$FinalDecisionFromJson(json);
}

@freezed
class AnalysisProgress with _$AnalysisProgress {
  const factory AnalysisProgress({
    required String taskId,
    required String stage,
    required String message,
    Map<String, dynamic>? data,
    required double progressPct,
  }) = _AnalysisProgress;
  factory AnalysisProgress.fromJson(Map<String, dynamic> json) => _$AnalysisProgressFromJson(json);
}
