import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/api/websocket_service.dart';
import '../../core/models/models.dart';

final analysisProgressProvider =
    StreamProvider.family<AnalysisProgress, String>((ref, taskId) async* {
  final dio = ApiClient.createDio();
  // Get user ID from token (simplified - use a real user ID from auth state)
  final prefs = await dio.options.headers;
  // We use a simple polling fallback via WebSocket
  // In production, tie userId from authProvider
  final ws = WebSocketService(userId: 'current_user');
  ws.connect();
  ref.onDispose(ws.disconnect);

  await for (final msg in ws.messages) {
    if (msg['task_id'] == taskId) {
      yield AnalysisProgress.fromJson(msg);
    }
  }
});

class AnalysisState {
  final List<AnalysisProgress> progressLog;
  final Map<String, AnalystReport> analystReports;
  final FinalDecision? finalDecision;
  final bool isComplete;

  const AnalysisState({
    this.progressLog = const [],
    this.analystReports = const {},
    this.finalDecision,
    this.isComplete = false,
  });

  AnalysisState copyWith({
    List<AnalysisProgress>? progressLog,
    Map<String, AnalystReport>? analystReports,
    FinalDecision? finalDecision,
    bool? isComplete,
  }) {
    return AnalysisState(
      progressLog: progressLog ?? this.progressLog,
      analystReports: analystReports ?? this.analystReports,
      finalDecision: finalDecision ?? this.finalDecision,
      isComplete: isComplete ?? this.isComplete,
    );
  }
}

class AnalysisNotifier extends FamilyNotifier<AnalysisState, String> {
  @override
  AnalysisState build(String taskId) {
    _loadAnalysis(taskId);
    return const AnalysisState();
  }

  Future<void> _loadAnalysis(String taskId) async {
    final dio = ApiClient.createDio();
    try {
      final response = await dio.get('/analysis/$taskId');
      final data = response.data as Map<String, dynamic>;
      final reports = <String, AnalystReport>{};
      if (data['analyst_reports'] != null) {
        for (final r in (data['analyst_reports'] as List)) {
          final report = AnalystReport.fromJson(r as Map<String, dynamic>);
          reports[report.analystType] = report;
        }
      }
      FinalDecision? decision;
      if (data['final_decision'] != null) {
        decision = FinalDecision.fromJson(
            data['final_decision'] as Map<String, dynamic>);
      }
      state = state.copyWith(
        analystReports: reports,
        finalDecision: decision,
        isComplete: data['status'] == 'completed',
      );
    } catch (_) {}
  }

  void addProgress(AnalysisProgress progress) {
    state = state.copyWith(
      progressLog: [...state.progressLog, progress],
    );

    final data = progress.data;
    if (data != null) {
      if (data['type'] == 'analyst_report') {
        final report = AnalystReport.fromJson(data);
        state = state.copyWith(
          analystReports: {...state.analystReports, report.analystType: report},
        );
      } else if (data['type'] == 'final_decision') {
        state = state.copyWith(
          finalDecision: FinalDecision.fromJson(data),
          isComplete: true,
        );
      }
    }
  }
}

final analysisNotifierProvider =
    NotifierProviderFamily<AnalysisNotifier, AnalysisState, String>(
        AnalysisNotifier.new);
