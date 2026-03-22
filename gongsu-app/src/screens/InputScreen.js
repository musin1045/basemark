import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRecordsByDate, getSites, saveRecords } from '../db/db';
import {
  formatDateLabel,
  formatGongsu,
  formatMoney,
  getTodayKey,
  shiftDateKey,
} from '../lib/formatters';
import { COLORS, GONGSU_PALETTE } from '../lib/theme';

const QUICK_OPTIONS = [
  { key: '0.5', type: 'gongsu', value: 0.5, label: '0.5공' },
  { key: '1', type: 'gongsu', value: 1, label: '1공' },
  { key: '1.5', type: 'gongsu', value: 1.5, label: '1.5공' },
  { key: '2', type: 'gongsu', value: 2, label: '2공' },
  { key: 'holiday', type: 'holiday', label: '휴무' },
];

function createItemKey() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createDraftItem(sites, gongsu = 1) {
  const defaultSite = sites[0] ?? null;

  return {
    key: createItemKey(),
    taskName: '',
    gongsu,
    siteId: defaultSite?.id ?? null,
    siteName: defaultSite?.name ?? '',
    siteColor: defaultSite?.color ?? COLORS.primarySoft,
    unitPrice: defaultSite?.unit_price ?? 0,
  };
}

function formatDecimalInput(text) {
  const sanitized = String(text ?? '').replace(/[^0-9.]/g, '');
  const [integerPart = '', ...decimalParts] = sanitized.split('.');

  if (decimalParts.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${decimalParts.join('')}`;
}

function formatIntegerInput(text) {
  return String(text ?? '').replace(/[^\d]/g, '');
}

function getQuickButtonColors(option) {
  if (option.type === 'holiday') {
    return {
      backgroundColor: COLORS.holidayBg,
      borderColor: COLORS.holidayBorder,
      textColor: COLORS.holidayText,
    };
  }

  const palette = GONGSU_PALETTE[option.value] ?? GONGSU_PALETTE[0];

  return {
    backgroundColor: palette.background,
    borderColor: palette.border,
    textColor: palette.text,
  };
}

function toDisplayGongsu(value) {
  const amount = Number(value) || 0;
  return amount === 0 ? '0' : formatGongsu(amount);
}

export default function InputScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const routeDate = route.params?.date ?? getTodayKey();
  const routePrefillGongsu = route.params?.prefillGongsu ?? null;

  const [date, setDate] = useState(routeDate);
  const [sites, setSites] = useState([]);
  const [items, setItems] = useState([]);
  const [memo, setMemo] = useState('');
  const [isSettled, setIsSettled] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [primaryGongsuInput, setPrimaryGongsuInput] = useState('');
  const [primaryUnitPriceInput, setPrimaryUnitPriceInput] = useState('');

  const loadSites = useCallback(async () => {
    const loadedSites = await getSites();
    setSites(loadedSites);
    return loadedSites;
  }, []);

  const loadDate = useCallback(async (targetDate, availableSites, prefillGongsu) => {
    const records = await getRecordsByDate(targetDate);

    if (records.length > 0) {
      setItems(
        records.map((record) => ({
          key: String(record.id),
          taskName: record.task_name ?? '',
          gongsu: Number(record.gongsu ?? 0),
          siteId: record.site_id ?? null,
          siteName: record.site_name ?? '',
          siteColor: record.site_color ?? COLORS.primarySoft,
          unitPrice: Number(record.unit_price ?? 0),
        }))
      );
      setMemo(records[0]?.memo ?? '');
      setIsSettled(records[0]?.is_settled === 1);
      setIsHoliday(records[0]?.is_holiday === 1);
      return;
    }

    const initialGongsu =
      Number.isFinite(Number(prefillGongsu)) && Number(prefillGongsu) > 0
        ? Number(prefillGongsu)
        : 1;

    setItems([createDraftItem(availableSites, initialGongsu)]);
    setMemo('');
    setIsSettled(false);
    setIsHoliday(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setLoading(true);
      try {
        const loadedSites = await loadSites();
        if (!active) {
          return;
        }
        await loadDate(routeDate, loadedSites, routePrefillGongsu);
        if (active) {
          setDate(routeDate);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, [loadDate, loadSites, routeDate, routePrefillGongsu]);

  useEffect(() => {
    const primaryItem = items[0];

    if (!primaryItem) {
      setPrimaryGongsuInput('');
      setPrimaryUnitPriceInput('');
      return;
    }

    setPrimaryGongsuInput(toDisplayGongsu(primaryItem.gongsu));
    setPrimaryUnitPriceInput(String(primaryItem.unitPrice ?? 0));
  }, [items]);

  const totalGongsu = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.gongsu) || 0), 0),
    [items]
  );

  const totalAmount = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Math.round((Number(item.gongsu) || 0) * (Number(item.unitPrice) || 0)),
        0
      ),
    [items]
  );

  const updateItem = (key, patch) => {
    setItems((currentItems) =>
      currentItems.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const updatePrimaryItem = (patch) => {
    setItems((currentItems) =>
      currentItems.map((item, index) => (index === 0 ? { ...item, ...patch } : item))
    );
  };

  const updatePrimaryItemGongsu = (value) => {
    updatePrimaryItem({ gongsu: value });
  };

  const applySite = (key, site) => {
    updateItem(key, {
      siteId: site.id,
      siteName: site.name,
      siteColor: site.color,
      unitPrice: site.unit_price,
    });
  };

  const addItem = () => {
    setItems((currentItems) => [...currentItems, createDraftItem(sites)]);
  };

  const removeItem = (key) => {
    setItems((currentItems) => {
      if (currentItems.length === 1) {
        return currentItems;
      }
      return currentItems.filter((item) => item.key !== key);
    });
  };

  const goToAdjacentDate = async (delta) => {
    const nextDate = shiftDateKey(date, delta);
    setDate(nextDate);
    setLoading(true);
    try {
      await loadDate(nextDate, sites, null);
    } finally {
      setLoading(false);
    }
  };

  const commitPrimaryGongsuInput = useCallback(() => {
    const parsed = Number(formatDecimalInput(primaryGongsuInput));
    const nextValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

    updatePrimaryItemGongsu(nextValue);
    setPrimaryGongsuInput(toDisplayGongsu(nextValue));

    if (nextValue > 0) {
      setIsHoliday(false);
    }
  }, [primaryGongsuInput]);

  const commitPrimaryUnitPriceInput = useCallback(() => {
    const parsed = Number(formatIntegerInput(primaryUnitPriceInput));
    const nextValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

    updatePrimaryItem({ unitPrice: nextValue });
    setPrimaryUnitPriceInput(String(nextValue));
  }, [primaryUnitPriceInput]);

  const handleQuickSelect = (option) => {
    if (option.type === 'holiday') {
      setIsHoliday(true);
      updatePrimaryItemGongsu(0);
      setPrimaryGongsuInput('0');
      return;
    }

    setIsHoliday(false);
    updatePrimaryItemGongsu(option.value);
    setPrimaryGongsuInput(formatGongsu(option.value));
  };

  const handleSave = async () => {
    const normalizedItems = items.map((item) => ({
      ...item,
      taskName: item.taskName.trim(),
      gongsu: Number(item.gongsu) || 0,
      unitPrice: Number(item.unitPrice) || 0,
    }));

    const hasMeaningfulContent =
      normalizedItems.some(
        (item) => item.gongsu > 0 || item.taskName.length > 0 || item.siteId !== null
      ) ||
      memo.trim().length > 0 ||
      isSettled ||
      isHoliday;

    if (!hasMeaningfulContent) {
      Alert.alert('저장할 내용이 없습니다', '공수, 메모, 상태 중 하나 이상을 입력해 주세요.');
      return;
    }

    setSaving(true);
    try {
      await saveRecords(date, normalizedItems, memo, isSettled, isHoliday);
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main');
      }
    } catch (error) {
      Alert.alert('저장에 실패했습니다', error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingSafe}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingLabel}>입력 화면을 준비하는 중입니다.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton}>
            <Text style={styles.headerIconText}>닫기</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>일일 입력</Text>
          <View style={styles.headerGhost} />
        </View>

        <View style={styles.dateRow}>
          <TouchableOpacity onPress={() => goToAdjacentDate(-1)} style={styles.dateButton}>
            <Text style={styles.dateButtonText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.dateTitle}>{formatDateLabel(date)}</Text>
          <TouchableOpacity onPress={() => goToAdjacentDate(1)} style={styles.dateButton}>
            <Text style={styles.dateButtonText}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topQuickCard}>
          <View style={styles.topQuickRow}>
            {QUICK_OPTIONS.map((option) => {
              const active =
                option.type === 'holiday'
                  ? isHoliday
                  : !isHoliday && Number(items[0]?.gongsu) === option.value;
              const colors = getQuickButtonColors(option);

              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.topQuickButton,
                    {
                      backgroundColor: colors.backgroundColor,
                      borderColor: colors.borderColor,
                      opacity: active ? 1 : 0.7,
                    },
                    active && styles.topQuickButtonActive,
                  ]}
                  onPress={() => handleQuickSelect(option)}
                >
                  <Text style={[styles.topQuickButtonText, { color: colors.textColor }]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.topQuickInputRow}>
            <TextInput
              style={[styles.topQuickInput, styles.topQuickInputHalf]}
              keyboardType="decimal-pad"
              placeholder="공수"
              placeholderTextColor={COLORS.textSoft}
              value={primaryGongsuInput}
              onChangeText={(value) => {
                setPrimaryGongsuInput(formatDecimalInput(value));
                if (isHoliday && Number(formatDecimalInput(value)) > 0) {
                  setIsHoliday(false);
                }
              }}
              onBlur={commitPrimaryGongsuInput}
            />
            <TextInput
              style={[styles.topQuickInput, styles.topQuickInputHalf]}
              keyboardType="number-pad"
              placeholder="단가"
              placeholderTextColor={COLORS.textSoft}
              value={primaryUnitPriceInput}
              onChangeText={(value) => setPrimaryUnitPriceInput(formatIntegerInput(value))}
              onBlur={commitPrimaryUnitPriceInput}
            />
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.body}
          contentContainerStyle={[
            styles.bodyContent,
            { paddingBottom: 160 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>총 합계</Text>
              <Text style={styles.summaryValue}>{formatMoney(totalAmount)}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>총 공수</Text>
              <Text style={styles.summaryValue}>{formatGongsu(totalGongsu)} 공수</Text>
            </View>
          </View>

          {items.map((item, index) => {
            const selectedSite = sites.find((site) => site.id === item.siteId);

            return (
              <View key={item.key} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cardEyebrow}>작업 {index + 1}</Text>
                    <Text style={styles.cardTitle}>
                      {item.taskName.trim().length > 0
                        ? item.taskName
                        : '작업 내용을 입력해 주세요'}
                    </Text>
                  </View>

                  {items.length > 1 ? (
                    <TouchableOpacity onPress={() => removeItem(item.key)}>
                      <Text style={styles.removeText}>삭제</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>기본 현장</Text>
                  <TouchableOpacity
                    style={styles.sitePicker}
                    onPress={() => setPickerTarget(item.key)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.sitePickerLeft}>
                      <View
                        style={[
                          styles.siteColorDot,
                          {
                            backgroundColor:
                              item.siteColor || selectedSite?.color || COLORS.primarySoft,
                          },
                        ]}
                      />
                      <View>
                        <Text style={styles.siteNameText}>
                          {item.siteName || '현장을 선택해 주세요'}
                        </Text>
                        <Text style={styles.sitePriceText}>
                          {formatMoney(item.unitPrice || 0)} / 1공수
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.sitePickerAction}>변경</Text>
                  </TouchableOpacity>
                </View>

                {index > 0 ? (
                  <View style={styles.inlineFieldRow}>
                    <View style={styles.inlineField}>
                      <Text style={styles.fieldLabel}>공수</Text>
                      <TextInput
                        style={styles.textInput}
                        keyboardType="decimal-pad"
                        value={String(item.gongsu ?? 0)}
                        onChangeText={(value) =>
                          updateItem(item.key, {
                            gongsu: Number(formatDecimalInput(value)) || 0,
                          })
                        }
                      />
                    </View>

                    <View style={styles.inlineField}>
                      <Text style={styles.fieldLabel}>단가</Text>
                      <TextInput
                        style={styles.textInput}
                        keyboardType="number-pad"
                        value={String(item.unitPrice ?? 0)}
                        onChangeText={(value) =>
                          updateItem(item.key, {
                            unitPrice: Number(formatIntegerInput(value)) || 0,
                          })
                        }
                      />
                    </View>
                  </View>
                ) : null}

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>작업 내용</Text>
                  <TextInput
                    style={[styles.textInput, styles.taskInput]}
                    placeholder="예: 외벽 브라켓 작업"
                    placeholderTextColor={COLORS.textSoft}
                    value={item.taskName}
                    onChangeText={(value) => updateItem(item.key, { taskName: value })}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              </View>
            );
          })}

          <TouchableOpacity style={styles.secondaryAction} onPress={addItem}>
            <Text style={styles.secondaryActionText}>작업 한 줄 추가</Text>
          </TouchableOpacity>

          <View style={styles.optionsCard}>
            <View style={styles.optionRow}>
              <View>
                <Text style={styles.optionLabel}>정산 완료</Text>
                <Text style={styles.optionHint}>정산 탭에서 완료 항목으로 집계됩니다.</Text>
              </View>
              <Switch
                value={isSettled}
                onValueChange={setIsSettled}
                trackColor={{ false: '#D6DFEA', true: '#BFD7A4' }}
                thumbColor={isSettled ? COLORS.settled : '#FFFFFF'}
              />
            </View>

            <View style={styles.memoGroup}>
              <Text style={styles.fieldLabel}>메모</Text>
              <TextInput
                style={styles.memoInput}
                multiline
                numberOfLines={4}
                placeholder="비고나 전달사항을 적어 주세요"
                placeholderTextColor={COLORS.textSoft}
                value={memo}
                onChangeText={setMemo}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 10) + 12 },
        ]}
      >
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? '저장 중...' : '저장하기'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={pickerTarget !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>현장 선택</Text>
              <TouchableOpacity onPress={() => setPickerTarget(null)}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {sites.map((site) => (
                <TouchableOpacity
                  key={site.id}
                  style={styles.modalSiteItem}
                  onPress={() => {
                    applySite(pickerTarget, site);
                    setPickerTarget(null);
                  }}
                >
                  <View style={styles.sitePickerLeft}>
                    <View style={[styles.siteColorDot, { backgroundColor: site.color }]} />
                    <View>
                      <Text style={styles.siteNameText}>{site.name}</Text>
                      <Text style={styles.sitePriceText}>
                        {formatMoney(site.unit_price)} / 1공수
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.sitePickerAction}>선택</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingSafe: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: COLORS.background,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconButton: {
    minWidth: 44,
  },
  headerIconText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  headerGhost: {
    minWidth: 44,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceMuted,
  },
  dateButtonText: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  dateTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  topQuickCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 10,
  },
  topQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topQuickButton: {
    minWidth: 68,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  topQuickButtonActive: {
    borderWidth: 2,
  },
  topQuickButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  topQuickInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  topQuickInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  topQuickInputHalf: {
    flex: 1,
  },
  keyboardRoot: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  summaryCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  removeText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  taskInput: {
    minHeight: 88,
  },
  inlineFieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineField: {
    flex: 1,
    gap: 8,
  },
  sitePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  sitePickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  siteColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  siteNameText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sitePriceText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sitePickerAction: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryAction: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.primarySoft,
    borderStyle: 'dashed',
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#EAF2FB',
  },
  secondaryActionText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  optionsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 16,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  optionLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  optionHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  memoGroup: {
    gap: 8,
  },
  memoInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: 'rgba(243,247,251,0.98)',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12, 31, 51, 0.36)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  modalClose: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalSiteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
});
