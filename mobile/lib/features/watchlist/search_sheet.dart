import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import '../../widgets/state_views.dart';
import 'watchlist_provider.dart';

/// Opens the bottom-sheet ticker search used to add to the watchlist.
Future<void> showSearchSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const _SearchSheet(),
  );
}

class _SearchSheet extends ConsumerStatefulWidget {
  const _SearchSheet();

  @override
  ConsumerState<_SearchSheet> createState() => _SearchSheetState();
}

class _SearchSheetState extends ConsumerState<_SearchSheet> {
  final _controller = TextEditingController();
  Timer? _debounce;
  bool _loading = false;
  Object? _error;
  List<SearchResult> _results = const [];

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final q = value.trim();
    if (q.isEmpty) {
      setState(() {
        _results = const [];
        _error = null;
        _loading = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () => _run(q));
  }

  Future<void> _run(String q) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ref.read(apiClientProvider).search(q);
      if (!mounted) return;
      setState(() {
        _results = res;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(stringsProvider);
    final watchlist = ref.watch(watchlistProvider);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.palette.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: TextField(
                controller: _controller,
                autofocus: true,
                textCapitalization: TextCapitalization.characters,
                onChanged: _onChanged,
                decoration: InputDecoration(
                  hintText: s.searchHint,
                  prefixIcon: const Icon(Icons.search_rounded),
                ),
              ),
            ),
            Expanded(child: _body(context, s, watchlist)),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context, Strings s, List<String> watchlist) {
    if (_loading) return const LoadingView();
    if (_error != null) {
      return ErrorView(
        message: s.errorGeneric,
        detail: '$_error',
        retryLabel: s.retry,
        onRetry: () => _run(_controller.text.trim()),
      );
    }
    if (_controller.text.trim().isEmpty) {
      return EmptyView(icon: Icons.search_rounded, title: s.searchHint);
    }
    if (_results.isEmpty) {
      return const EmptyView(icon: Icons.search_off_rounded, title: '—');
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      itemCount: _results.length,
      separatorBuilder: (_, __) =>
          Divider(height: 1, color: context.palette.border),
      itemBuilder: (context, i) {
        final r = _results[i];
        final inList = watchlist.contains(r.symbol.toUpperCase());
        return ListTile(
          title: Text(
            r.symbol,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontFamily: AppTheme.monoFamily,
            ),
          ),
          subtitle: Text(
            r.description,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: inList
              ? const Icon(Icons.check_circle_rounded, color: AppColors.up)
              : const Icon(Icons.add_circle_outline_rounded,
                  color: AppColors.accent),
          onTap: () async {
            await ref.read(watchlistProvider.notifier).add(r.symbol);
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('${s.addToWatchlist}: ${r.symbol}')),
            );
          },
        );
      },
    );
  }
}
