import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import 'auto_watch_provider.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(stringsProvider);
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.moreTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          _SectionLabel(s.appearance),
          _Card(
            children: [
              SwitchListTile(
                value: themeMode == ThemeMode.dark,
                onChanged: (_) =>
                    ref.read(themeModeProvider.notifier).toggle(),
                title: Text(s.darkMode),
                secondary: Icon(
                  themeMode == ThemeMode.dark
                      ? Icons.dark_mode_rounded
                      : Icons.light_mode_rounded,
                ),
                activeThumbColor: AppColors.accent,
              ),
              Divider(height: 1, color: context.palette.border),
              ListTile(
                leading: const Icon(Icons.translate_rounded),
                title: Text(s.language),
                trailing: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'en', label: Text('EN')),
                    ButtonSegment(value: 'zh-TW', label: Text('繁中')),
                  ],
                  selected: {locale},
                  showSelectedIcon: false,
                  onSelectionChanged: (set) =>
                      ref.read(localeProvider.notifier).set(set.first),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          _SectionLabel(s.autoWatch),
          const _AutoWatchCard(),
          const SizedBox(height: 22),
          _SectionLabel(s.account),
          _Card(
            children: [
              ListTile(
                leading: const Icon(Icons.workspace_premium_rounded),
                title: Text(s.subscription),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.push('/subscription'),
              ),
              Divider(height: 1, color: context.palette.border),
              ListTile(
                leading: const Icon(Icons.login_rounded),
                title: Text(s.signIn),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.push('/auth'),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Center(
            child: Text(
              'QuantClash  •  ${s.version} 1.0.0',
              style: TextStyle(color: context.palette.textDim, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _AutoWatchCard extends ConsumerStatefulWidget {
  const _AutoWatchCard();

  @override
  ConsumerState<_AutoWatchCard> createState() => _AutoWatchCardState();
}

class _AutoWatchCardState extends ConsumerState<_AutoWatchCard> {
  late final TextEditingController _email;

  @override
  void initState() {
    super.initState();
    _email = TextEditingController(text: ref.read(autoWatchProvider).email);
  }

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(stringsProvider);
    final st = ref.watch(autoWatchProvider);
    final notifier = ref.read(autoWatchProvider.notifier);

    // Surface messages as a snackbar.
    ref.listen(autoWatchProvider, (prev, next) {
      if (next.message != null && next.message != prev?.message) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.message!),
            backgroundColor:
                next.isError ? AppColors.down.withValues(alpha: 0.9) : null,
          ),
        );
      }
    });

    return _Card(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
          child: Text(
            s.autoWatchHint,
            style: TextStyle(color: context.palette.textDim, fontSize: 13),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            inputFormatters: [
              FilteringTextInputFormatter.deny(RegExp(r'\s')),
            ],
            onChanged: notifier.setEmail,
            decoration: InputDecoration(
              labelText: s.email,
              prefixIcon: const Icon(Icons.alternate_email_rounded),
            ),
          ),
        ),
        SwitchListTile(
          value: st.news,
          onChanged: notifier.setNews,
          title: Text(s.newsAlerts),
          secondary: const Icon(Icons.article_outlined),
          activeThumbColor: AppColors.accent,
          dense: true,
        ),
        SwitchListTile(
          value: st.anomaly,
          onChanged: notifier.setAnomaly,
          title: Text(s.anomalyAlerts),
          secondary: const Icon(Icons.show_chart_rounded),
          activeThumbColor: AppColors.accent,
          dense: true,
        ),
        SwitchListTile(
          value: st.enabled,
          onChanged: notifier.setEnabled,
          title: Text(s.enabled),
          secondary: const Icon(Icons.notifications_active_outlined),
          activeThumbColor: AppColors.up,
          dense: true,
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: st.saving ? null : notifier.runNow,
                  icon: const Icon(Icons.play_arrow_rounded, size: 18),
                  label: Text(s.runNow),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.accent,
                    side: BorderSide(color: context.palette.border),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: st.saving ? null : notifier.save,
                  child: st.saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.onAccent,
                          ),
                        )
                      : Text(s.save),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 0, 10),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          color: context.palette.textDim,
          fontSize: 12,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.0,
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.palette.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }
}
