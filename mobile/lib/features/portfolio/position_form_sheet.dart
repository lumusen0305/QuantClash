import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/settings_provider.dart';
import '../../core/theme.dart';
import 'positions_provider.dart';

/// Opens the add/edit position sheet. Pass [existing] to edit.
Future<void> showPositionForm(BuildContext context, {Position? existing}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _PositionForm(existing: existing),
  );
}

class _PositionForm extends ConsumerStatefulWidget {
  const _PositionForm({this.existing});
  final Position? existing;

  @override
  ConsumerState<_PositionForm> createState() => _PositionFormState();
}

class _PositionFormState extends ConsumerState<_PositionForm> {
  late final TextEditingController _ticker;
  late final TextEditingController _shares;
  late final TextEditingController _avgCost;
  final _formKey = GlobalKey<FormState>();

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    _ticker = TextEditingController(text: widget.existing?.ticker ?? '');
    _shares = TextEditingController(
        text: widget.existing == null ? '' : _trim(widget.existing!.shares));
    _avgCost = TextEditingController(
        text: widget.existing == null ? '' : _trim(widget.existing!.avgCost));
  }

  String _trim(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

  @override
  void dispose() {
    _ticker.dispose();
    _shares.dispose();
    _avgCost.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final pos = Position(
      ticker: _ticker.text.trim().toUpperCase(),
      shares: double.parse(_shares.text.trim()),
      avgCost: double.parse(_avgCost.text.trim()),
    );
    await ref.read(positionsProvider.notifier).upsert(pos);
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  Future<void> _delete() async {
    if (widget.existing == null) return;
    await ref.read(positionsProvider.notifier).remove(widget.existing!.ticker);
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  String? _numValidator(String? v) {
    if (v == null || v.trim().isEmpty) return 'Required';
    final n = double.tryParse(v.trim());
    if (n == null || n <= 0) return 'Invalid';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(stringsProvider);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottomInset + 20),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.palette.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              _isEdit ? s.editPosition : s.addPosition,
              style:
                  const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 18),
            TextFormField(
              controller: _ticker,
              enabled: !_isEdit,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(labelText: s.ticker),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _shares,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
              ],
              decoration: InputDecoration(labelText: s.shares),
              validator: _numValidator,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _avgCost,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
              ],
              decoration:
                  InputDecoration(labelText: s.avgCost, prefixText: '\$ '),
              validator: _numValidator,
            ),
            const SizedBox(height: 22),
            Row(
              children: [
                if (_isEdit)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _delete,
                      icon: const Icon(Icons.delete_outline_rounded, size: 18),
                      label: Text(s.delete),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.down,
                        side: const BorderSide(color: AppColors.down),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                if (_isEdit) const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: _save,
                    child: Text(s.save),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
