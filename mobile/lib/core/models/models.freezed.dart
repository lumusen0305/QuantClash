// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

User _$UserFromJson(Map<String, dynamic> json) {
  return _User.fromJson(json);
}

/// @nodoc
mixin _$User {
  String get id => throw _privateConstructorUsedError;
  String get email => throw _privateConstructorUsedError;
  String get tier => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;

  /// Serializes this User to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of User
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $UserCopyWith<User> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $UserCopyWith<$Res> {
  factory $UserCopyWith(User value, $Res Function(User) then) =
      _$UserCopyWithImpl<$Res, User>;
  @useResult
  $Res call({String id, String email, String tier, DateTime createdAt});
}

/// @nodoc
class _$UserCopyWithImpl<$Res, $Val extends User>
    implements $UserCopyWith<$Res> {
  _$UserCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of User
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? email = null,
    Object? tier = null,
    Object? createdAt = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      email: null == email
          ? _value.email
          : email // ignore: cast_nullable_to_non_nullable
              as String,
      tier: null == tier
          ? _value.tier
          : tier // ignore: cast_nullable_to_non_nullable
              as String,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$UserImplCopyWith<$Res> implements $UserCopyWith<$Res> {
  factory _$$UserImplCopyWith(
          _$UserImpl value, $Res Function(_$UserImpl) then) =
      __$$UserImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String id, String email, String tier, DateTime createdAt});
}

/// @nodoc
class __$$UserImplCopyWithImpl<$Res>
    extends _$UserCopyWithImpl<$Res, _$UserImpl>
    implements _$$UserImplCopyWith<$Res> {
  __$$UserImplCopyWithImpl(_$UserImpl _value, $Res Function(_$UserImpl) _then)
      : super(_value, _then);

  /// Create a copy of User
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? email = null,
    Object? tier = null,
    Object? createdAt = null,
  }) {
    return _then(_$UserImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      email: null == email
          ? _value.email
          : email // ignore: cast_nullable_to_non_nullable
              as String,
      tier: null == tier
          ? _value.tier
          : tier // ignore: cast_nullable_to_non_nullable
              as String,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$UserImpl implements _User {
  const _$UserImpl(
      {required this.id,
      required this.email,
      required this.tier,
      required this.createdAt});

  factory _$UserImpl.fromJson(Map<String, dynamic> json) =>
      _$$UserImplFromJson(json);

  @override
  final String id;
  @override
  final String email;
  @override
  final String tier;
  @override
  final DateTime createdAt;

  @override
  String toString() {
    return 'User(id: $id, email: $email, tier: $tier, createdAt: $createdAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$UserImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.email, email) || other.email == email) &&
            (identical(other.tier, tier) || other.tier == tier) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, id, email, tier, createdAt);

  /// Create a copy of User
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$UserImplCopyWith<_$UserImpl> get copyWith =>
      __$$UserImplCopyWithImpl<_$UserImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$UserImplToJson(
      this,
    );
  }
}

abstract class _User implements User {
  const factory _User(
      {required final String id,
      required final String email,
      required final String tier,
      required final DateTime createdAt}) = _$UserImpl;

  factory _User.fromJson(Map<String, dynamic> json) = _$UserImpl.fromJson;

  @override
  String get id;
  @override
  String get email;
  @override
  String get tier;
  @override
  DateTime get createdAt;

  /// Create a copy of User
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$UserImplCopyWith<_$UserImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

StockQuote _$StockQuoteFromJson(Map<String, dynamic> json) {
  return _StockQuote.fromJson(json);
}

/// @nodoc
mixin _$StockQuote {
  String get ticker => throw _privateConstructorUsedError;
  double get price => throw _privateConstructorUsedError;
  double get change => throw _privateConstructorUsedError;
  double get changePct => throw _privateConstructorUsedError;
  double? get high => throw _privateConstructorUsedError;
  double? get low => throw _privateConstructorUsedError;
  double? get open => throw _privateConstructorUsedError;
  double? get prevClose => throw _privateConstructorUsedError;

  /// Serializes this StockQuote to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of StockQuote
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $StockQuoteCopyWith<StockQuote> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $StockQuoteCopyWith<$Res> {
  factory $StockQuoteCopyWith(
          StockQuote value, $Res Function(StockQuote) then) =
      _$StockQuoteCopyWithImpl<$Res, StockQuote>;
  @useResult
  $Res call(
      {String ticker,
      double price,
      double change,
      double changePct,
      double? high,
      double? low,
      double? open,
      double? prevClose});
}

/// @nodoc
class _$StockQuoteCopyWithImpl<$Res, $Val extends StockQuote>
    implements $StockQuoteCopyWith<$Res> {
  _$StockQuoteCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of StockQuote
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? ticker = null,
    Object? price = null,
    Object? change = null,
    Object? changePct = null,
    Object? high = freezed,
    Object? low = freezed,
    Object? open = freezed,
    Object? prevClose = freezed,
  }) {
    return _then(_value.copyWith(
      ticker: null == ticker
          ? _value.ticker
          : ticker // ignore: cast_nullable_to_non_nullable
              as String,
      price: null == price
          ? _value.price
          : price // ignore: cast_nullable_to_non_nullable
              as double,
      change: null == change
          ? _value.change
          : change // ignore: cast_nullable_to_non_nullable
              as double,
      changePct: null == changePct
          ? _value.changePct
          : changePct // ignore: cast_nullable_to_non_nullable
              as double,
      high: freezed == high
          ? _value.high
          : high // ignore: cast_nullable_to_non_nullable
              as double?,
      low: freezed == low
          ? _value.low
          : low // ignore: cast_nullable_to_non_nullable
              as double?,
      open: freezed == open
          ? _value.open
          : open // ignore: cast_nullable_to_non_nullable
              as double?,
      prevClose: freezed == prevClose
          ? _value.prevClose
          : prevClose // ignore: cast_nullable_to_non_nullable
              as double?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$StockQuoteImplCopyWith<$Res>
    implements $StockQuoteCopyWith<$Res> {
  factory _$$StockQuoteImplCopyWith(
          _$StockQuoteImpl value, $Res Function(_$StockQuoteImpl) then) =
      __$$StockQuoteImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String ticker,
      double price,
      double change,
      double changePct,
      double? high,
      double? low,
      double? open,
      double? prevClose});
}

/// @nodoc
class __$$StockQuoteImplCopyWithImpl<$Res>
    extends _$StockQuoteCopyWithImpl<$Res, _$StockQuoteImpl>
    implements _$$StockQuoteImplCopyWith<$Res> {
  __$$StockQuoteImplCopyWithImpl(
      _$StockQuoteImpl _value, $Res Function(_$StockQuoteImpl) _then)
      : super(_value, _then);

  /// Create a copy of StockQuote
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? ticker = null,
    Object? price = null,
    Object? change = null,
    Object? changePct = null,
    Object? high = freezed,
    Object? low = freezed,
    Object? open = freezed,
    Object? prevClose = freezed,
  }) {
    return _then(_$StockQuoteImpl(
      ticker: null == ticker
          ? _value.ticker
          : ticker // ignore: cast_nullable_to_non_nullable
              as String,
      price: null == price
          ? _value.price
          : price // ignore: cast_nullable_to_non_nullable
              as double,
      change: null == change
          ? _value.change
          : change // ignore: cast_nullable_to_non_nullable
              as double,
      changePct: null == changePct
          ? _value.changePct
          : changePct // ignore: cast_nullable_to_non_nullable
              as double,
      high: freezed == high
          ? _value.high
          : high // ignore: cast_nullable_to_non_nullable
              as double?,
      low: freezed == low
          ? _value.low
          : low // ignore: cast_nullable_to_non_nullable
              as double?,
      open: freezed == open
          ? _value.open
          : open // ignore: cast_nullable_to_non_nullable
              as double?,
      prevClose: freezed == prevClose
          ? _value.prevClose
          : prevClose // ignore: cast_nullable_to_non_nullable
              as double?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$StockQuoteImpl implements _StockQuote {
  const _$StockQuoteImpl(
      {required this.ticker,
      required this.price,
      required this.change,
      required this.changePct,
      this.high,
      this.low,
      this.open,
      this.prevClose});

  factory _$StockQuoteImpl.fromJson(Map<String, dynamic> json) =>
      _$$StockQuoteImplFromJson(json);

  @override
  final String ticker;
  @override
  final double price;
  @override
  final double change;
  @override
  final double changePct;
  @override
  final double? high;
  @override
  final double? low;
  @override
  final double? open;
  @override
  final double? prevClose;

  @override
  String toString() {
    return 'StockQuote(ticker: $ticker, price: $price, change: $change, changePct: $changePct, high: $high, low: $low, open: $open, prevClose: $prevClose)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$StockQuoteImpl &&
            (identical(other.ticker, ticker) || other.ticker == ticker) &&
            (identical(other.price, price) || other.price == price) &&
            (identical(other.change, change) || other.change == change) &&
            (identical(other.changePct, changePct) ||
                other.changePct == changePct) &&
            (identical(other.high, high) || other.high == high) &&
            (identical(other.low, low) || other.low == low) &&
            (identical(other.open, open) || other.open == open) &&
            (identical(other.prevClose, prevClose) ||
                other.prevClose == prevClose));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, ticker, price, change, changePct,
      high, low, open, prevClose);

  /// Create a copy of StockQuote
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$StockQuoteImplCopyWith<_$StockQuoteImpl> get copyWith =>
      __$$StockQuoteImplCopyWithImpl<_$StockQuoteImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$StockQuoteImplToJson(
      this,
    );
  }
}

abstract class _StockQuote implements StockQuote {
  const factory _StockQuote(
      {required final String ticker,
      required final double price,
      required final double change,
      required final double changePct,
      final double? high,
      final double? low,
      final double? open,
      final double? prevClose}) = _$StockQuoteImpl;

  factory _StockQuote.fromJson(Map<String, dynamic> json) =
      _$StockQuoteImpl.fromJson;

  @override
  String get ticker;
  @override
  double get price;
  @override
  double get change;
  @override
  double get changePct;
  @override
  double? get high;
  @override
  double? get low;
  @override
  double? get open;
  @override
  double? get prevClose;

  /// Create a copy of StockQuote
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$StockQuoteImplCopyWith<_$StockQuoteImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

AnalystReport _$AnalystReportFromJson(Map<String, dynamic> json) {
  return _AnalystReport.fromJson(json);
}

/// @nodoc
mixin _$AnalystReport {
  String get analystType => throw _privateConstructorUsedError;
  String get summary => throw _privateConstructorUsedError;
  String get signal => throw _privateConstructorUsedError;
  double get confidence => throw _privateConstructorUsedError;
  List<String> get keyEvidence => throw _privateConstructorUsedError;
  List<String> get keyRisks => throw _privateConstructorUsedError;

  /// Serializes this AnalystReport to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of AnalystReport
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $AnalystReportCopyWith<AnalystReport> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $AnalystReportCopyWith<$Res> {
  factory $AnalystReportCopyWith(
          AnalystReport value, $Res Function(AnalystReport) then) =
      _$AnalystReportCopyWithImpl<$Res, AnalystReport>;
  @useResult
  $Res call(
      {String analystType,
      String summary,
      String signal,
      double confidence,
      List<String> keyEvidence,
      List<String> keyRisks});
}

/// @nodoc
class _$AnalystReportCopyWithImpl<$Res, $Val extends AnalystReport>
    implements $AnalystReportCopyWith<$Res> {
  _$AnalystReportCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of AnalystReport
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? analystType = null,
    Object? summary = null,
    Object? signal = null,
    Object? confidence = null,
    Object? keyEvidence = null,
    Object? keyRisks = null,
  }) {
    return _then(_value.copyWith(
      analystType: null == analystType
          ? _value.analystType
          : analystType // ignore: cast_nullable_to_non_nullable
              as String,
      summary: null == summary
          ? _value.summary
          : summary // ignore: cast_nullable_to_non_nullable
              as String,
      signal: null == signal
          ? _value.signal
          : signal // ignore: cast_nullable_to_non_nullable
              as String,
      confidence: null == confidence
          ? _value.confidence
          : confidence // ignore: cast_nullable_to_non_nullable
              as double,
      keyEvidence: null == keyEvidence
          ? _value.keyEvidence
          : keyEvidence // ignore: cast_nullable_to_non_nullable
              as List<String>,
      keyRisks: null == keyRisks
          ? _value.keyRisks
          : keyRisks // ignore: cast_nullable_to_non_nullable
              as List<String>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$AnalystReportImplCopyWith<$Res>
    implements $AnalystReportCopyWith<$Res> {
  factory _$$AnalystReportImplCopyWith(
          _$AnalystReportImpl value, $Res Function(_$AnalystReportImpl) then) =
      __$$AnalystReportImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String analystType,
      String summary,
      String signal,
      double confidence,
      List<String> keyEvidence,
      List<String> keyRisks});
}

/// @nodoc
class __$$AnalystReportImplCopyWithImpl<$Res>
    extends _$AnalystReportCopyWithImpl<$Res, _$AnalystReportImpl>
    implements _$$AnalystReportImplCopyWith<$Res> {
  __$$AnalystReportImplCopyWithImpl(
      _$AnalystReportImpl _value, $Res Function(_$AnalystReportImpl) _then)
      : super(_value, _then);

  /// Create a copy of AnalystReport
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? analystType = null,
    Object? summary = null,
    Object? signal = null,
    Object? confidence = null,
    Object? keyEvidence = null,
    Object? keyRisks = null,
  }) {
    return _then(_$AnalystReportImpl(
      analystType: null == analystType
          ? _value.analystType
          : analystType // ignore: cast_nullable_to_non_nullable
              as String,
      summary: null == summary
          ? _value.summary
          : summary // ignore: cast_nullable_to_non_nullable
              as String,
      signal: null == signal
          ? _value.signal
          : signal // ignore: cast_nullable_to_non_nullable
              as String,
      confidence: null == confidence
          ? _value.confidence
          : confidence // ignore: cast_nullable_to_non_nullable
              as double,
      keyEvidence: null == keyEvidence
          ? _value._keyEvidence
          : keyEvidence // ignore: cast_nullable_to_non_nullable
              as List<String>,
      keyRisks: null == keyRisks
          ? _value._keyRisks
          : keyRisks // ignore: cast_nullable_to_non_nullable
              as List<String>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$AnalystReportImpl implements _AnalystReport {
  const _$AnalystReportImpl(
      {required this.analystType,
      required this.summary,
      required this.signal,
      required this.confidence,
      required final List<String> keyEvidence,
      required final List<String> keyRisks})
      : _keyEvidence = keyEvidence,
        _keyRisks = keyRisks;

  factory _$AnalystReportImpl.fromJson(Map<String, dynamic> json) =>
      _$$AnalystReportImplFromJson(json);

  @override
  final String analystType;
  @override
  final String summary;
  @override
  final String signal;
  @override
  final double confidence;
  final List<String> _keyEvidence;
  @override
  List<String> get keyEvidence {
    if (_keyEvidence is EqualUnmodifiableListView) return _keyEvidence;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_keyEvidence);
  }

  final List<String> _keyRisks;
  @override
  List<String> get keyRisks {
    if (_keyRisks is EqualUnmodifiableListView) return _keyRisks;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_keyRisks);
  }

  @override
  String toString() {
    return 'AnalystReport(analystType: $analystType, summary: $summary, signal: $signal, confidence: $confidence, keyEvidence: $keyEvidence, keyRisks: $keyRisks)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$AnalystReportImpl &&
            (identical(other.analystType, analystType) ||
                other.analystType == analystType) &&
            (identical(other.summary, summary) || other.summary == summary) &&
            (identical(other.signal, signal) || other.signal == signal) &&
            (identical(other.confidence, confidence) ||
                other.confidence == confidence) &&
            const DeepCollectionEquality()
                .equals(other._keyEvidence, _keyEvidence) &&
            const DeepCollectionEquality().equals(other._keyRisks, _keyRisks));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      analystType,
      summary,
      signal,
      confidence,
      const DeepCollectionEquality().hash(_keyEvidence),
      const DeepCollectionEquality().hash(_keyRisks));

  /// Create a copy of AnalystReport
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$AnalystReportImplCopyWith<_$AnalystReportImpl> get copyWith =>
      __$$AnalystReportImplCopyWithImpl<_$AnalystReportImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$AnalystReportImplToJson(
      this,
    );
  }
}

abstract class _AnalystReport implements AnalystReport {
  const factory _AnalystReport(
      {required final String analystType,
      required final String summary,
      required final String signal,
      required final double confidence,
      required final List<String> keyEvidence,
      required final List<String> keyRisks}) = _$AnalystReportImpl;

  factory _AnalystReport.fromJson(Map<String, dynamic> json) =
      _$AnalystReportImpl.fromJson;

  @override
  String get analystType;
  @override
  String get summary;
  @override
  String get signal;
  @override
  double get confidence;
  @override
  List<String> get keyEvidence;
  @override
  List<String> get keyRisks;

  /// Create a copy of AnalystReport
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$AnalystReportImplCopyWith<_$AnalystReportImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

FinalDecision _$FinalDecisionFromJson(Map<String, dynamic> json) {
  return _FinalDecision.fromJson(json);
}

/// @nodoc
mixin _$FinalDecision {
  String get action => throw _privateConstructorUsedError;
  double get confidence => throw _privateConstructorUsedError;
  String get reasoning => throw _privateConstructorUsedError;
  double? get targetPrice => throw _privateConstructorUsedError;
  double? get stopLoss => throw _privateConstructorUsedError;
  String get timeHorizon => throw _privateConstructorUsedError;

  /// Serializes this FinalDecision to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of FinalDecision
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $FinalDecisionCopyWith<FinalDecision> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $FinalDecisionCopyWith<$Res> {
  factory $FinalDecisionCopyWith(
          FinalDecision value, $Res Function(FinalDecision) then) =
      _$FinalDecisionCopyWithImpl<$Res, FinalDecision>;
  @useResult
  $Res call(
      {String action,
      double confidence,
      String reasoning,
      double? targetPrice,
      double? stopLoss,
      String timeHorizon});
}

/// @nodoc
class _$FinalDecisionCopyWithImpl<$Res, $Val extends FinalDecision>
    implements $FinalDecisionCopyWith<$Res> {
  _$FinalDecisionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of FinalDecision
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? action = null,
    Object? confidence = null,
    Object? reasoning = null,
    Object? targetPrice = freezed,
    Object? stopLoss = freezed,
    Object? timeHorizon = null,
  }) {
    return _then(_value.copyWith(
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as String,
      confidence: null == confidence
          ? _value.confidence
          : confidence // ignore: cast_nullable_to_non_nullable
              as double,
      reasoning: null == reasoning
          ? _value.reasoning
          : reasoning // ignore: cast_nullable_to_non_nullable
              as String,
      targetPrice: freezed == targetPrice
          ? _value.targetPrice
          : targetPrice // ignore: cast_nullable_to_non_nullable
              as double?,
      stopLoss: freezed == stopLoss
          ? _value.stopLoss
          : stopLoss // ignore: cast_nullable_to_non_nullable
              as double?,
      timeHorizon: null == timeHorizon
          ? _value.timeHorizon
          : timeHorizon // ignore: cast_nullable_to_non_nullable
              as String,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$FinalDecisionImplCopyWith<$Res>
    implements $FinalDecisionCopyWith<$Res> {
  factory _$$FinalDecisionImplCopyWith(
          _$FinalDecisionImpl value, $Res Function(_$FinalDecisionImpl) then) =
      __$$FinalDecisionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String action,
      double confidence,
      String reasoning,
      double? targetPrice,
      double? stopLoss,
      String timeHorizon});
}

/// @nodoc
class __$$FinalDecisionImplCopyWithImpl<$Res>
    extends _$FinalDecisionCopyWithImpl<$Res, _$FinalDecisionImpl>
    implements _$$FinalDecisionImplCopyWith<$Res> {
  __$$FinalDecisionImplCopyWithImpl(
      _$FinalDecisionImpl _value, $Res Function(_$FinalDecisionImpl) _then)
      : super(_value, _then);

  /// Create a copy of FinalDecision
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? action = null,
    Object? confidence = null,
    Object? reasoning = null,
    Object? targetPrice = freezed,
    Object? stopLoss = freezed,
    Object? timeHorizon = null,
  }) {
    return _then(_$FinalDecisionImpl(
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as String,
      confidence: null == confidence
          ? _value.confidence
          : confidence // ignore: cast_nullable_to_non_nullable
              as double,
      reasoning: null == reasoning
          ? _value.reasoning
          : reasoning // ignore: cast_nullable_to_non_nullable
              as String,
      targetPrice: freezed == targetPrice
          ? _value.targetPrice
          : targetPrice // ignore: cast_nullable_to_non_nullable
              as double?,
      stopLoss: freezed == stopLoss
          ? _value.stopLoss
          : stopLoss // ignore: cast_nullable_to_non_nullable
              as double?,
      timeHorizon: null == timeHorizon
          ? _value.timeHorizon
          : timeHorizon // ignore: cast_nullable_to_non_nullable
              as String,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$FinalDecisionImpl implements _FinalDecision {
  const _$FinalDecisionImpl(
      {required this.action,
      required this.confidence,
      required this.reasoning,
      this.targetPrice,
      this.stopLoss,
      required this.timeHorizon});

  factory _$FinalDecisionImpl.fromJson(Map<String, dynamic> json) =>
      _$$FinalDecisionImplFromJson(json);

  @override
  final String action;
  @override
  final double confidence;
  @override
  final String reasoning;
  @override
  final double? targetPrice;
  @override
  final double? stopLoss;
  @override
  final String timeHorizon;

  @override
  String toString() {
    return 'FinalDecision(action: $action, confidence: $confidence, reasoning: $reasoning, targetPrice: $targetPrice, stopLoss: $stopLoss, timeHorizon: $timeHorizon)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$FinalDecisionImpl &&
            (identical(other.action, action) || other.action == action) &&
            (identical(other.confidence, confidence) ||
                other.confidence == confidence) &&
            (identical(other.reasoning, reasoning) ||
                other.reasoning == reasoning) &&
            (identical(other.targetPrice, targetPrice) ||
                other.targetPrice == targetPrice) &&
            (identical(other.stopLoss, stopLoss) ||
                other.stopLoss == stopLoss) &&
            (identical(other.timeHorizon, timeHorizon) ||
                other.timeHorizon == timeHorizon));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, action, confidence, reasoning,
      targetPrice, stopLoss, timeHorizon);

  /// Create a copy of FinalDecision
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$FinalDecisionImplCopyWith<_$FinalDecisionImpl> get copyWith =>
      __$$FinalDecisionImplCopyWithImpl<_$FinalDecisionImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$FinalDecisionImplToJson(
      this,
    );
  }
}

abstract class _FinalDecision implements FinalDecision {
  const factory _FinalDecision(
      {required final String action,
      required final double confidence,
      required final String reasoning,
      final double? targetPrice,
      final double? stopLoss,
      required final String timeHorizon}) = _$FinalDecisionImpl;

  factory _FinalDecision.fromJson(Map<String, dynamic> json) =
      _$FinalDecisionImpl.fromJson;

  @override
  String get action;
  @override
  double get confidence;
  @override
  String get reasoning;
  @override
  double? get targetPrice;
  @override
  double? get stopLoss;
  @override
  String get timeHorizon;

  /// Create a copy of FinalDecision
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$FinalDecisionImplCopyWith<_$FinalDecisionImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

AnalysisProgress _$AnalysisProgressFromJson(Map<String, dynamic> json) {
  return _AnalysisProgress.fromJson(json);
}

/// @nodoc
mixin _$AnalysisProgress {
  String get taskId => throw _privateConstructorUsedError;
  String get stage => throw _privateConstructorUsedError;
  String get message => throw _privateConstructorUsedError;
  Map<String, dynamic>? get data => throw _privateConstructorUsedError;
  double get progressPct => throw _privateConstructorUsedError;

  /// Serializes this AnalysisProgress to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of AnalysisProgress
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $AnalysisProgressCopyWith<AnalysisProgress> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $AnalysisProgressCopyWith<$Res> {
  factory $AnalysisProgressCopyWith(
          AnalysisProgress value, $Res Function(AnalysisProgress) then) =
      _$AnalysisProgressCopyWithImpl<$Res, AnalysisProgress>;
  @useResult
  $Res call(
      {String taskId,
      String stage,
      String message,
      Map<String, dynamic>? data,
      double progressPct});
}

/// @nodoc
class _$AnalysisProgressCopyWithImpl<$Res, $Val extends AnalysisProgress>
    implements $AnalysisProgressCopyWith<$Res> {
  _$AnalysisProgressCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of AnalysisProgress
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? taskId = null,
    Object? stage = null,
    Object? message = null,
    Object? data = freezed,
    Object? progressPct = null,
  }) {
    return _then(_value.copyWith(
      taskId: null == taskId
          ? _value.taskId
          : taskId // ignore: cast_nullable_to_non_nullable
              as String,
      stage: null == stage
          ? _value.stage
          : stage // ignore: cast_nullable_to_non_nullable
              as String,
      message: null == message
          ? _value.message
          : message // ignore: cast_nullable_to_non_nullable
              as String,
      data: freezed == data
          ? _value.data
          : data // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
      progressPct: null == progressPct
          ? _value.progressPct
          : progressPct // ignore: cast_nullable_to_non_nullable
              as double,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$AnalysisProgressImplCopyWith<$Res>
    implements $AnalysisProgressCopyWith<$Res> {
  factory _$$AnalysisProgressImplCopyWith(_$AnalysisProgressImpl value,
          $Res Function(_$AnalysisProgressImpl) then) =
      __$$AnalysisProgressImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String taskId,
      String stage,
      String message,
      Map<String, dynamic>? data,
      double progressPct});
}

/// @nodoc
class __$$AnalysisProgressImplCopyWithImpl<$Res>
    extends _$AnalysisProgressCopyWithImpl<$Res, _$AnalysisProgressImpl>
    implements _$$AnalysisProgressImplCopyWith<$Res> {
  __$$AnalysisProgressImplCopyWithImpl(_$AnalysisProgressImpl _value,
      $Res Function(_$AnalysisProgressImpl) _then)
      : super(_value, _then);

  /// Create a copy of AnalysisProgress
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? taskId = null,
    Object? stage = null,
    Object? message = null,
    Object? data = freezed,
    Object? progressPct = null,
  }) {
    return _then(_$AnalysisProgressImpl(
      taskId: null == taskId
          ? _value.taskId
          : taskId // ignore: cast_nullable_to_non_nullable
              as String,
      stage: null == stage
          ? _value.stage
          : stage // ignore: cast_nullable_to_non_nullable
              as String,
      message: null == message
          ? _value.message
          : message // ignore: cast_nullable_to_non_nullable
              as String,
      data: freezed == data
          ? _value._data
          : data // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
      progressPct: null == progressPct
          ? _value.progressPct
          : progressPct // ignore: cast_nullable_to_non_nullable
              as double,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$AnalysisProgressImpl implements _AnalysisProgress {
  const _$AnalysisProgressImpl(
      {required this.taskId,
      required this.stage,
      required this.message,
      final Map<String, dynamic>? data,
      required this.progressPct})
      : _data = data;

  factory _$AnalysisProgressImpl.fromJson(Map<String, dynamic> json) =>
      _$$AnalysisProgressImplFromJson(json);

  @override
  final String taskId;
  @override
  final String stage;
  @override
  final String message;
  final Map<String, dynamic>? _data;
  @override
  Map<String, dynamic>? get data {
    final value = _data;
    if (value == null) return null;
    if (_data is EqualUnmodifiableMapView) return _data;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final double progressPct;

  @override
  String toString() {
    return 'AnalysisProgress(taskId: $taskId, stage: $stage, message: $message, data: $data, progressPct: $progressPct)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$AnalysisProgressImpl &&
            (identical(other.taskId, taskId) || other.taskId == taskId) &&
            (identical(other.stage, stage) || other.stage == stage) &&
            (identical(other.message, message) || other.message == message) &&
            const DeepCollectionEquality().equals(other._data, _data) &&
            (identical(other.progressPct, progressPct) ||
                other.progressPct == progressPct));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, taskId, stage, message,
      const DeepCollectionEquality().hash(_data), progressPct);

  /// Create a copy of AnalysisProgress
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$AnalysisProgressImplCopyWith<_$AnalysisProgressImpl> get copyWith =>
      __$$AnalysisProgressImplCopyWithImpl<_$AnalysisProgressImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$AnalysisProgressImplToJson(
      this,
    );
  }
}

abstract class _AnalysisProgress implements AnalysisProgress {
  const factory _AnalysisProgress(
      {required final String taskId,
      required final String stage,
      required final String message,
      final Map<String, dynamic>? data,
      required final double progressPct}) = _$AnalysisProgressImpl;

  factory _AnalysisProgress.fromJson(Map<String, dynamic> json) =
      _$AnalysisProgressImpl.fromJson;

  @override
  String get taskId;
  @override
  String get stage;
  @override
  String get message;
  @override
  Map<String, dynamic>? get data;
  @override
  double get progressPct;

  /// Create a copy of AnalysisProgress
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$AnalysisProgressImplCopyWith<_$AnalysisProgressImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
