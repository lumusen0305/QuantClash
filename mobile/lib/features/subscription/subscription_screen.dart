import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../auth/auth_provider.dart';

final _plans = [
  {
    'name': 'Free',
    'price': '\$0/mo',
    'analyses': '1 analysis/day',
    'model': 'Local GPU',
    'tier': 'free',
    'color': const Color(0xFF6B7280),
  },
  {
    'name': 'Basic',
    'price': '\$9.99/mo',
    'analyses': '5 analyses/day',
    'model': 'GPT-4o Mini',
    'tier': 'basic',
    'color': const Color(0xFF4361EE),
  },
  {
    'name': 'Premium',
    'price': '\$29.99/mo',
    'analyses': '20 analyses/day',
    'model': 'Claude Sonnet',
    'tier': 'premium',
    'color': const Color(0xFF00D4AA),
  },
];

class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  Future<void> _upgrade(BuildContext context, String tier) async {
    try {
      final dio = ApiClient.createDio();
      final response = await dio.post('/subscription/checkout', data: {'tier': tier});
      final url = response.data['checkout_url'] as String?;
      if (url != null && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Opening checkout: $url')),
        );
        // In a real app: launchUrl(Uri.parse(url)) or flutter_stripe checkout
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(authProvider);
    final currentTier = userAsync.valueOrNull?.tier ?? 'free';

    return Scaffold(
      appBar: AppBar(title: const Text('Subscription')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Current plan banner
          userAsync.when(
            data: (user) => user != null
                ? Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          const Icon(Icons.verified_user, color: Color(0xFF00D4AA)),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Current Plan',
                                  style: TextStyle(color: Colors.grey, fontSize: 12)),
                              Text(
                                currentTier.toUpperCase(),
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 18),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
            loading: () => const LinearProgressIndicator(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          const SizedBox(height: 24),

          Text('Choose a Plan',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),

          // Plan cards
          ..._plans.map((plan) {
            final isCurrent = plan['tier'] == currentTier;
            final color = plan['color'] as Color;
            return Container(
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isCurrent ? color : color.withOpacity(0.3),
                  width: isCurrent ? 2 : 1,
                ),
                color: isCurrent ? color.withOpacity(0.08) : const Color(0xFF111827),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          plan['name'] as String,
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 20,
                              color: color),
                        ),
                        const Spacer(),
                        if (isCurrent)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: color.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text('Current',
                                style: TextStyle(
                                    color: color,
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold)),
                          ),
                        Text(
                          plan['price'] as String,
                          style: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 18),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _FeatureRow(
                        icon: Icons.analytics_outlined,
                        text: plan['analyses'] as String),
                    const SizedBox(height: 6),
                    _FeatureRow(
                        icon: Icons.psychology_outlined,
                        text: 'Model: ${plan['model']}'),
                    const SizedBox(height: 16),
                    if (!isCurrent)
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () =>
                              _upgrade(context, plan['tier'] as String),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: color,
                            foregroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          child: Text(
                            currentTier == 'free'
                                ? 'Upgrade to ${plan['name']}'
                                : 'Switch to ${plan['name']}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  final IconData icon;
  final String text;
  const _FeatureRow({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.grey),
        const SizedBox(width: 8),
        Text(text, style: const TextStyle(color: Colors.grey, fontSize: 13)),
      ],
    );
  }
}
