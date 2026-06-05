import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'quote_provider.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _searchController = TextEditingController();

  static const List<Map<String, dynamic>> _marketOverview = [
    {'name': 'S&P 500', 'value': '5,308.13', 'change': '+0.48%', 'positive': true},
    {'name': 'Nasdaq', 'value': '16,742.39', 'change': '+0.61%', 'positive': true},
    {'name': 'Dow Jones', 'value': '38,239.66', 'change': '+0.21%', 'positive': true},
  ];

  static const List<String> _watchlist = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL'];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _navigateToStock(String ticker) {
    context.go('/stock/$ticker');
  }

  void _onSearch() {
    final ticker = _searchController.text.trim().toUpperCase();
    if (ticker.isNotEmpty) {
      _navigateToStock(ticker);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Stock Analysis'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline),
            onPressed: () => context.go('/subscription'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Search bar
          TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: 'Search ticker (AAPL, MSFT...)',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              suffixIcon: IconButton(
                icon: const Icon(Icons.arrow_forward),
                onPressed: _onSearch,
              ),
            ),
            textCapitalization: TextCapitalization.characters,
            onSubmitted: (_) => _onSearch(),
          ),
          const SizedBox(height: 24),

          // Market overview
          Text('Market Overview',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          SizedBox(
            height: 90,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _marketOverview.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (_, i) {
                final item = _marketOverview[i];
                return _MarketCard(
                  name: item['name'] as String,
                  value: item['value'] as String,
                  change: item['change'] as String,
                  positive: item['positive'] as bool,
                );
              },
            ),
          ),
          const SizedBox(height: 24),

          // Watchlist
          Text('Watchlist',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          ..._watchlist.map((ticker) => _WatchlistTile(
                ticker: ticker,
                onTap: () => _navigateToStock(ticker),
              )),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          showDialog(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('Enter Ticker'),
              content: TextField(
                controller: _searchController,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(hintText: 'e.g. AAPL'),
                autofocus: true,
              ),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel')),
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                    _onSearch();
                  },
                  child: const Text('Go'),
                ),
              ],
            ),
          );
        },
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Colors.black,
        child: const Icon(Icons.add),
      ),
    );
  }
}

class _MarketCard extends StatelessWidget {
  final String name;
  final String value;
  final String change;
  final bool positive;

  const _MarketCard({
    required this.name,
    required this.value,
    required this.change,
    required this.positive,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(name,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.grey)),
            Text(value,
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            Text(
              change,
              style: TextStyle(
                color: positive ? const Color(0xFF00D4AA) : const Color(0xFFEF4444),
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WatchlistTile extends ConsumerWidget {
  final String ticker;
  final VoidCallback onTap;

  const _WatchlistTile({required this.ticker, required this.onTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quoteAsync = ref.watch(quoteProvider(ticker));

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        title: Text(ticker,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        trailing: quoteAsync.when(
          data: (quote) => Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '\$${quote.price.toStringAsFixed(2)}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                '${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toStringAsFixed(2)}%',
                style: TextStyle(
                  color: quote.changePct >= 0
                      ? const Color(0xFF00D4AA)
                      : const Color(0xFFEF4444),
                  fontSize: 12,
                ),
              ),
            ],
          ),
          loading: () => const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          error: (_, __) => const Text('--', style: TextStyle(color: Colors.grey)),
        ),
      ),
    );
  }
}
