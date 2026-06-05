import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';

final quoteProvider = FutureProvider.family<StockQuote, String>((ref, ticker) async {
  final dio = ApiClient.createDio();
  final response = await dio.get('/stocks/$ticker/quote');
  return StockQuote.fromJson(response.data as Map<String, dynamic>);
});
