// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$UserImpl _$$UserImplFromJson(Map<String, dynamic> json) => _$UserImpl(
      id: json['id'] as String,
      email: json['email'] as String,
      tier: json['tier'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$$UserImplToJson(_$UserImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'email': instance.email,
      'tier': instance.tier,
      'createdAt': instance.createdAt.toIso8601String(),
    };

_$StockQuoteImpl _$$StockQuoteImplFromJson(Map<String, dynamic> json) =>
    _$StockQuoteImpl(
      ticker: json['ticker'] as String,
      price: (json['price'] as num).toDouble(),
      change: (json['change'] as num).toDouble(),
      changePct: (json['changePct'] as num).toDouble(),
      high: (json['high'] as num?)?.toDouble(),
      low: (json['low'] as num?)?.toDouble(),
      open: (json['open'] as num?)?.toDouble(),
      prevClose: (json['prevClose'] as num?)?.toDouble(),
    );

Map<String, dynamic> _$$StockQuoteImplToJson(_$StockQuoteImpl instance) =>
    <String, dynamic>{
      'ticker': instance.ticker,
      'price': instance.price,
      'change': instance.change,
      'changePct': instance.changePct,
      'high': instance.high,
      'low': instance.low,
      'open': instance.open,
      'prevClose': instance.prevClose,
    };

_$AnalystReportImpl _$$AnalystReportImplFromJson(Map<String, dynamic> json) =>
    _$AnalystReportImpl(
      analystType: json['analystType'] as String,
      summary: json['summary'] as String,
      signal: json['signal'] as String,
      confidence: (json['confidence'] as num).toDouble(),
      keyEvidence: (json['keyEvidence'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      keyRisks:
          (json['keyRisks'] as List<dynamic>).map((e) => e as String).toList(),
    );

Map<String, dynamic> _$$AnalystReportImplToJson(_$AnalystReportImpl instance) =>
    <String, dynamic>{
      'analystType': instance.analystType,
      'summary': instance.summary,
      'signal': instance.signal,
      'confidence': instance.confidence,
      'keyEvidence': instance.keyEvidence,
      'keyRisks': instance.keyRisks,
    };

_$FinalDecisionImpl _$$FinalDecisionImplFromJson(Map<String, dynamic> json) =>
    _$FinalDecisionImpl(
      action: json['action'] as String,
      confidence: (json['confidence'] as num).toDouble(),
      reasoning: json['reasoning'] as String,
      targetPrice: (json['targetPrice'] as num?)?.toDouble(),
      stopLoss: (json['stopLoss'] as num?)?.toDouble(),
      timeHorizon: json['timeHorizon'] as String,
    );

Map<String, dynamic> _$$FinalDecisionImplToJson(_$FinalDecisionImpl instance) =>
    <String, dynamic>{
      'action': instance.action,
      'confidence': instance.confidence,
      'reasoning': instance.reasoning,
      'targetPrice': instance.targetPrice,
      'stopLoss': instance.stopLoss,
      'timeHorizon': instance.timeHorizon,
    };

_$AnalysisProgressImpl _$$AnalysisProgressImplFromJson(
        Map<String, dynamic> json) =>
    _$AnalysisProgressImpl(
      taskId: json['taskId'] as String,
      stage: json['stage'] as String,
      message: json['message'] as String,
      data: json['data'] as Map<String, dynamic>?,
      progressPct: (json['progressPct'] as num).toDouble(),
    );

Map<String, dynamic> _$$AnalysisProgressImplToJson(
        _$AnalysisProgressImpl instance) =>
    <String, dynamic>{
      'taskId': instance.taskId,
      'stage': instance.stage,
      'message': instance.message,
      'data': instance.data,
      'progressPct': instance.progressPct,
    };
