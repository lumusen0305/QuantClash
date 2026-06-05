import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebSocketService {
  static const String wsBaseUrl = 'ws://localhost:8000';

  WebSocketChannel? _channel;
  final String userId;

  WebSocketService({required this.userId});

  void connect() {
    _channel = WebSocketChannel.connect(
      Uri.parse('$wsBaseUrl/ws/$userId'),
    );
  }

  Stream<Map<String, dynamic>> get messages =>
      _channel!.stream.map((data) => json.decode(data) as Map<String, dynamic>);

  void subscribeToQuote(String ticker) {
    _channel?.sink.add(json.encode({
      'action': 'subscribe_quote',
      'ticker': ticker,
    }));
  }

  void unsubscribeFromQuote(String ticker) {
    _channel?.sink.add(json.encode({
      'action': 'unsubscribe_quote',
      'ticker': ticker,
    }));
  }

  void ping() {
    _channel?.sink.add(json.encode({'action': 'ping'}));
  }

  void disconnect() {
    _channel?.sink.close();
  }
}
