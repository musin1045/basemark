import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getRecordsByDateRange,
  groupByDate,
  setSettled,
  setSettledByDateRange,
} from '../db/db';
import {
  escapeHtml,
  formatGongsu,
  formatMoney,
  formatMonthLabel,
} from '../lib/formatters';
import { COLORS } from '../lib/theme';

const DEDUCTION_PRESETS = [
  { key: 'none', label: '공제 없음', rate: 0 },
  { key: 'dayworker', label: '일용직 3.3%', rate: 3.3 },
  { key: 'insurance', label: '4대보험 9.4%', rate: 9.4 },
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function getMonthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate();

  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

function getCurrentMonthRange() {
  const today = new Date();
  return getMonthRange(today.getFullYear(), today.getMonth() + 1);
}

function shiftMonthRange(dateKey, delta) {
  const [year, month] = String(dateKey).split('-').map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return getMonthRange(shifted.getFullYear(), shifted.getMonth() + 1);
}

function formatDateInput(value) {
  const digits = String(value ?? '')
    .replace(/[^\d]/g, '')
    .slice(0, 8);

  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function formatPercentInput(value) {
  const sanitized = String(value ?? '').replace(/[^0-9.]/g, '');
  const [integerPart = '', ...decimalParts] = sanitized.split('.');

  if (decimalParts.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${decimalParts.join('').slice(0, 2)}`;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function isWholeMonthRange(startDate, endDate) {
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
    return false;
  }

  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const lastDay = new Date(endYear, endMonth, 0).getDate();

  return (
    startYear === endYear &&
    startMonth === endMonth &&
    startDay === 1 &&
    endDay === lastDay
  );
}

function getRangeTitle(startDate, endDate) {
  if (isWholeMonthRange(startDate, endDate)) {
    const [year, month] = startDate.split('-').map(Number);
    return formatMonthLabel(year, month);
  }

  return `${startDate} ~ ${endDate}`;
}

function getEntrySiteSummary(entry) {
  if (!entry?.items?.length) {
    return '';
  }

  const siteNames = [
    ...new Set(
      entry.items
        .map((item) => String(item.site_name ?? '').trim())
        .filter(Boolean)
    ),
  ];

  if (siteNames.length === 0) {
    return '';
  }

  if (siteNames.length === 1) {
    return siteNames[0];
  }

  return `${siteNames[0]} 외 ${siteNames.length - 1}`;
}

function buildSettlementPdfFilename(startDate, endDate) {
  const normalizedStart = String(startDate ?? '').replace(/[^\d]/g, '');
  const normalizedEnd = String(endDate ?? '').replace(/[^\d]/g, '');
  return `gongsu-settlement-${normalizedStart || 'start'}-${normalizedEnd || 'end'}.pdf`;
}

export default function SettleScreen() {
  const today = new Date();
  const initialRange = getCurrentMonthRange();

  const [rangeStart, setRangeStart] = useState(initialRange.start);
  const [rangeEnd, setRangeEnd] = useState(initialRange.end);
  const [rangeStartInput, setRangeStartInput] = useState(initialRange.start);
  const [rangeEndInput, setRangeEndInput] = useState(initialRange.end);
  const [dateMap, setDateMap] = useState({});
  const [deductionRateInput, setDeductionRateInput] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [processingDate, setProcessingDate] = useState(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const rangeRef = useRef({
    start: initialRange.start,
    end: initialRange.end,
  });
  const loadRequestIdRef = useRef(0);

  const loadDataForRange = useCallback(async (startDate, endDate, options = {}) => {
    const { notifyOnError = false } = options;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const records = await getRecordsByDateRange(startDate, endDate);
      if (loadRequestIdRef.current !== requestId) {
        return false;
      }

      setDateMap(groupByDate(records));
      return true;
    } catch (error) {
      if (loadRequestIdRef.current !== requestId) {
        return false;
      }

      const nextMessage =
        String(error?.message ?? '').trim() || '정산 데이터를 불러오지 못했습니다.';
      setErrorMessage(nextMessage);

      if (notifyOnError) {
        Alert.alert('정산 불러오기 실패', nextMessage);
      }

      return false;
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  rangeRef.current = {
    start: rangeStart,
    end: rangeEnd,
  };

  useFocusEffect(
    useCallback(() => {
      void loadDataForRange(rangeRef.current.start, rangeRef.current.end);
    }, [loadDataForRange])
  );

  const entries = useMemo(
    () => Object.values(dateMap).sort((left, right) => left.date.localeCompare(right.date)),
    [dateMap]
  );

  const rangeTitle = useMemo(
    () => getRangeTitle(rangeStart, rangeEnd),
    [rangeEnd, rangeStart]
  );

  const rangeLabel = useMemo(
    () => `${rangeStart} ~ ${rangeEnd}`,
    [rangeEnd, rangeStart]
  );

  const totals = useMemo(() => {
    const totalGongsu = entries.reduce((sum, entry) => sum + entry.totalGongsu, 0);
    const totalAmount = entries.reduce((sum, entry) => sum + entry.totalAmount, 0);
    const settledAmount = entries
      .filter((entry) => entry.isSettled)
      .reduce((sum, entry) => sum + entry.totalAmount, 0);

    return {
      totalGongsu,
      totalAmount,
      settledAmount,
      unsettledAmount: totalAmount - settledAmount,
    };
  }, [entries]);

  const deductionRate = useMemo(() => {
    const parsed = Number(deductionRateInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.min(parsed, 100);
  }, [deductionRateInput]);

  const deductionAmounts = useMemo(() => {
    const deductionAmount = Math.round((totals.totalAmount * deductionRate) / 100);

    return {
      deductionAmount,
      netAmount: Math.max(0, totals.totalAmount - deductionAmount),
    };
  }, [deductionRate, totals]);

  const siteSummaries = useMemo(() => {
    const map = new Map();

    entries.forEach((entry) => {
      entry.items.forEach((item) => {
        const key = item.site_id ?? `snapshot:${item.site_name}`;
        const current = map.get(key) ?? {
          key,
          siteName: item.site_name || '미지정 현장',
          siteColor: item.site_color || COLORS.primarySoft,
          totalGongsu: 0,
          totalAmount: 0,
          unsettledAmount: 0,
        };

        current.totalGongsu += Number(item.gongsu || 0);
        current.totalAmount += Number(item.amount || 0);
        current.unsettledAmount += entry.isSettled ? 0 : Number(item.amount || 0);

        map.set(key, current);
      });
    });

    return [...map.values()].sort((left, right) => right.totalAmount - left.totalAmount);
  }, [entries]);

  const isBusy = isLoading || isBulkUpdating || Boolean(processingDate);

  const applyRange = async (startDate, endDate) => {
    if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
      Alert.alert('날짜 형식을 확인해 주세요', '시작일과 종료일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    if (startDate > endDate) {
      Alert.alert('기간을 확인해 주세요', '종료일은 시작일보다 같거나 늦어야 합니다.');
      return;
    }

    setRangeStart(startDate);
    setRangeEnd(endDate);
    setRangeStartInput(startDate);
    setRangeEndInput(endDate);
    await loadDataForRange(startDate, endDate, {
      notifyOnError: true,
    });
  };

  const moveRangeByMonth = async (delta) => {
    const nextRange = shiftMonthRange(rangeStart, delta);
    await applyRange(nextRange.start, nextRange.end);
  };

  const resetToCurrentMonth = async () => {
    const nextRange = getCurrentMonthRange();
    await applyRange(nextRange.start, nextRange.end);
  };

  const resetToPreviousMonth = async () => {
    const currentRange = getCurrentMonthRange();
    const nextRange = shiftMonthRange(currentRange.start, -1);
    await applyRange(nextRange.start, nextRange.end);
  };

  const toggleSettled = async (date, currentValue) => {
    if (isBusy) {
      return;
    }

    setProcessingDate(date);
    setErrorMessage('');

    try {
      await setSettled(date, !currentValue);
      await loadDataForRange(rangeStart, rangeEnd, {
        notifyOnError: true,
      });
    } catch (error) {
      const nextMessage =
        String(error?.message ?? '').trim() || '정산 상태를 변경하지 못했습니다.';
      setErrorMessage(nextMessage);
      Alert.alert('정산 변경 실패', nextMessage);
    } finally {
      setProcessingDate(null);
    }
  };

  const handleBulkUpdate = (nextSettled) => {
    if (entries.length === 0) {
      Alert.alert('정산할 내용이 없습니다', '먼저 기록을 입력한 뒤 다시 시도해 주세요.');
      return;
    }

    if (isBusy) {
      return;
    }

    Alert.alert(
      nextSettled ? '일괄 정산 완료' : '일괄 미정산',
      `${rangeLabel} 기록을 ${nextSettled ? '전부 정산 완료' : '전부 미정산'}로 바꿀까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: nextSettled ? '정산 완료' : '미정산으로 변경',
          onPress: async () => {
            setIsBulkUpdating(true);
            setErrorMessage('');

            try {
              await setSettledByDateRange(rangeStart, rangeEnd, nextSettled);
              await loadDataForRange(rangeStart, rangeEnd, {
                notifyOnError: true,
              });
            } catch (error) {
              const nextMessage =
                String(error?.message ?? '').trim() || '일괄 정산 상태를 변경하지 못했습니다.';
              setErrorMessage(nextMessage);
              Alert.alert('일괄 정산 실패', nextMessage);
            } finally {
              setIsBulkUpdating(false);
            }
          },
        },
      ]
    );
  };

  const exportPdf = async () => {
    if (entries.length === 0) {
      Alert.alert('내보낼 내용이 없습니다', '먼저 기록을 입력한 뒤 다시 시도해 주세요.');
      return;
    }

    const rows = entries
      .map(
        (entry) => `
          <tr>
            <td>${escapeHtml(entry.date)}</td>
            <td style="text-align:center;">${escapeHtml(formatGongsu(entry.totalGongsu))}</td>
            <td style="text-align:right;">${escapeHtml(formatMoney(entry.totalAmount))}</td>
            <td style="text-align:center;">${entry.isSettled ? '완료' : '미정산'}</td>
          </tr>
        `
      )
      .join('');

    const siteRows = siteSummaries
      .map(
        (site) => `
          <tr>
            <td>${escapeHtml(site.siteName)}</td>
            <td style="text-align:center;">${escapeHtml(formatGongsu(site.totalGongsu))}</td>
            <td style="text-align:right;">${escapeHtml(formatMoney(site.totalAmount))}</td>
            <td style="text-align:right;">${escapeHtml(formatMoney(site.unsettledAmount))}</td>
          </tr>
        `
      )
      .join('');

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: sans-serif; padding: 24px; color: #172534; }
            h1 { margin: 0 0 8px; color: #0C447C; }
            h2 { margin-top: 28px; }
            p { color: #667085; }
            .summary { display: flex; gap: 16px; margin: 20px 0; }
            .card { flex: 1; background: #F3F7FB; border-radius: 12px; padding: 14px; }
            .label { font-size: 12px; color: #667085; }
            .value { font-size: 20px; font-weight: 700; margin-top: 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border-bottom: 1px solid #D7E3EE; padding: 10px 8px; font-size: 13px; }
            th { text-align: left; background: #0C447C; color: white; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(rangeTitle)} 정산 요약</h1>
          <p>대상 기간 ${escapeHtml(rangeLabel)}</p>
          <p>출력일 ${escapeHtml(today.toLocaleDateString('ko-KR'))}</p>

          <div class="summary">
            <div class="card"><div class="label">총 공수</div><div class="value">${escapeHtml(formatGongsu(totals.totalGongsu))}</div></div>
            <div class="card"><div class="label">총 금액</div><div class="value">${escapeHtml(formatMoney(totals.totalAmount))}</div></div>
            <div class="card"><div class="label">미정산</div><div class="value">${escapeHtml(formatMoney(totals.unsettledAmount))}</div></div>
          </div>

          <h2>현장별 요약</h2>
          <table>
            <tr>
              <th>현장</th>
              <th>공수</th>
              <th>금액</th>
              <th>미정산</th>
            </tr>
            ${siteRows}
          </table>

          <h2>날짜별 정산</h2>
          <table>
            <tr>
              <th>날짜</th>
              <th>공수</th>
              <th>금액</th>
              <th>상태</th>
            </tr>
            ${rows}
          </table>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      const shareUri =
        baseDirectory && uri
          ? `${baseDirectory}${buildSettlementPdfFilename(rangeStart, rangeEnd)}`
          : uri;

      if (shareUri && shareUri !== uri) {
        try {
          await FileSystem.deleteAsync(shareUri, {
            idempotent: true,
          });
        } catch {}

        await FileSystem.copyAsync({
          from: uri,
          to: shareUri,
        });
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: `${rangeTitle} 정산서 공유`,
        });
      } else {
        Alert.alert('정산서가 생성되었습니다', shareUri);
      }
    } catch (error) {
      Alert.alert('정산서 공유에 실패했습니다', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => moveRangeByMonth(-1)}
            style={[styles.headerButton, isBusy && styles.touchDisabled]}
            disabled={isBusy}
          >
            <Text style={styles.headerButtonText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{rangeTitle}</Text>
          <TouchableOpacity
            onPress={() => moveRangeByMonth(1)}
            style={[styles.headerButton, isBusy && styles.touchDisabled]}
            disabled={isBusy}
          >
            <Text style={styles.headerButtonText}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.amountHeadline}>{formatMoney(totals.totalAmount)}</Text>
        <Text style={styles.amountSubline}>
          {formatGongsu(totals.totalGongsu)} 공수 · {rangeLabel}
        </Text>

        <View style={styles.pillRow}>
          <TouchableOpacity
            style={[styles.pill, styles.pillTouchable, { backgroundColor: COLORS.settledBg }]}
            onPress={() => handleBulkUpdate(true)}
            disabled={isBusy || entries.length === 0}
          >
            <Text style={[styles.pillText, { color: COLORS.settled }]}>
              정산 완료 {formatMoney(totals.settledAmount)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, styles.pillTouchable, { backgroundColor: COLORS.unsettledBg }]}
            onPress={() => handleBulkUpdate(false)}
            disabled={isBusy || entries.length === 0}
          >
            <Text style={[styles.pillText, { color: COLORS.unsettled }]}>
              미정산 {formatMoney(totals.unsettledAmount)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.feedbackCard}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.feedbackText}>정산 데이터를 불러오는 중입니다.</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={[styles.feedbackCard, styles.feedbackCardError]}>
            <Text style={styles.feedbackErrorTitle}>불러오기 또는 변경 중 문제가 생겼습니다.</Text>
            <Text style={styles.feedbackErrorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.deductionCard}>
          <Text style={styles.deductionTitle}>세금/공제 계산</Text>

          <View style={styles.deductionPresetRow}>
            {DEDUCTION_PRESETS.map((preset) => {
              const active = Math.abs(deductionRate - preset.rate) < 0.001;

              return (
                <TouchableOpacity
                  key={preset.key}
                  style={[
                    styles.deductionPresetButton,
                    active && styles.deductionPresetButtonActive,
                  ]}
                  onPress={() => setDeductionRateInput(String(preset.rate))}
                >
                  <Text
                    style={[
                      styles.deductionPresetButtonText,
                      active && styles.deductionPresetButtonTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.deductionInputRow}>
            <Text style={styles.deductionInputLabel}>공제율(%)</Text>
            <TextInput
              style={styles.deductionInput}
              value={deductionRateInput}
              onChangeText={(value) => setDeductionRateInput(formatPercentInput(value))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={COLORS.textSoft}
            />
          </View>

          <View style={styles.deductionSummaryRow}>
            <View style={styles.deductionSummaryCard}>
              <Text style={styles.deductionSummaryLabel}>총액</Text>
              <Text style={styles.deductionSummaryValue}>{formatMoney(totals.totalAmount)}</Text>
            </View>
            <View style={styles.deductionSummaryCard}>
              <Text style={styles.deductionSummaryLabel}>공제액</Text>
              <Text style={styles.deductionSummaryValue}>
                {formatMoney(deductionAmounts.deductionAmount)}
              </Text>
            </View>
            <View style={styles.deductionSummaryCard}>
              <Text style={styles.deductionSummaryLabel}>실수령액</Text>
              <Text style={styles.deductionSummaryValueStrong}>
                {formatMoney(deductionAmounts.netAmount)}
              </Text>
            </View>
          </View>

          <View style={styles.deductionSummaryRowAlt}>
            <View style={[styles.deductionSummaryCard, styles.deductionSummaryCardWide]}>
              <View style={styles.deductionMetricRow}>
                <Text style={styles.deductionSummaryLabel}>{'\uCD1D\uC561'}</Text>
                <Text style={styles.deductionSummaryValue}>{formatMoney(totals.totalAmount)}</Text>
              </View>
              <View style={styles.deductionMetricDivider} />
              <View style={styles.deductionMetricRow}>
                <Text style={styles.deductionSummaryLabel}>{'\uACF5\uC81C\uC561'}</Text>
                <Text style={styles.deductionSummaryValue}>
                  {formatMoney(deductionAmounts.deductionAmount)}
                </Text>
              </View>
            </View>
            <View style={[styles.deductionSummaryCard, styles.deductionSummaryCardNet]}>
              <Text style={styles.deductionSummaryLabel}>{'\uC2E4\uC218\uB839\uC561'}</Text>
              <Text style={styles.deductionSummaryValueStrong}>
                {formatMoney(deductionAmounts.netAmount)}
              </Text>
            </View>
          </View>

          <Text style={styles.deductionHint}>
            계산용 예상값입니다. 실제 공제율은 계약 형태와 신고 방식에 따라 달라질 수 있습니다.
          </Text>
        </View>

        <View style={styles.rangeCard}>
          <View style={styles.rangeHeaderRow}>
            <Text style={styles.rangeTitle}>기간 지정</Text>
            <View style={styles.rangePresetRow}>
              <TouchableOpacity
                style={[styles.rangePresetButton, isBusy && styles.touchDisabled]}
                onPress={resetToPreviousMonth}
                disabled={isBusy}
              >
                <Text style={styles.rangePresetButtonText}>지난달</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rangePresetButton, isBusy && styles.touchDisabled]}
                onPress={resetToCurrentMonth}
                disabled={isBusy}
              >
                <Text style={styles.rangePresetButtonText}>이번 달</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.rangeInputRow}>
            <View style={styles.rangeInputGroup}>
              <Text style={styles.rangeInputLabel}>시작일</Text>
              <TextInput
                style={styles.rangeInput}
                value={rangeStartInput}
                onChangeText={(value) => setRangeStartInput(formatDateInput(value))}
                keyboardType="number-pad"
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
                editable={!isBusy}
              />
            </View>

            <Text style={styles.rangeDivider}>~</Text>

            <View style={styles.rangeInputGroup}>
              <Text style={styles.rangeInputLabel}>종료일</Text>
              <TextInput
                style={styles.rangeInput}
                value={rangeEndInput}
                onChangeText={(value) => setRangeEndInput(formatDateInput(value))}
                keyboardType="number-pad"
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
                editable={!isBusy}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.rangeApplyButton, isBusy && styles.touchDisabled]}
            onPress={() => applyRange(rangeStartInput, rangeEndInput)}
            disabled={isBusy}
          >
            <Text style={styles.rangeApplyButtonText}>기간 적용</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bulkActionRow}>
          <TouchableOpacity
            style={[styles.bulkActionButton, styles.bulkActionPrimary, isBusy && styles.touchDisabled]}
            onPress={() => handleBulkUpdate(true)}
            disabled={isBusy || entries.length === 0}
          >
            <Text style={styles.bulkActionPrimaryText}>일괄 정산 완료</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkActionButton, styles.bulkActionSecondary, isBusy && styles.touchDisabled]}
            onPress={() => handleBulkUpdate(false)}
            disabled={isBusy || entries.length === 0}
          >
            <Text style={styles.bulkActionSecondaryText}>일괄 미정산</Text>
          </TouchableOpacity>
        </View>

        {siteSummaries.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>현장별 요약</Text>
            {siteSummaries.map((site) => (
              <View key={site.key} style={styles.siteCard}>
                <View style={[styles.siteDot, { backgroundColor: site.siteColor }]} />
                <View style={styles.siteInfo}>
                  <Text style={styles.siteName}>{site.siteName}</Text>
                  <Text style={styles.siteCaption}>
                    {formatGongsu(site.totalGongsu)} 공수 · 총 {formatMoney(site.totalAmount)}
                  </Text>
                </View>
                <Text style={styles.siteUnsettled}>{formatMoney(site.unsettledAmount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>날짜별 정산</Text>

          {entries.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>선택한 기간의 기록이 없습니다.</Text>
              <Text style={styles.emptyCopy}>
                날짜 범위를 조정하거나 기록 탭에서 입력한 뒤 다시 확인해 주세요.
              </Text>
            </View>
          ) : (
            entries.map((entry) => (
              <TouchableOpacity
                key={entry.date}
                style={[
                  styles.entryCard,
                  processingDate === entry.date && styles.entryCardPending,
                  isBusy && processingDate !== entry.date && styles.touchDisabled,
                ]}
                activeOpacity={0.82}
                onPress={() => toggleSettled(entry.date, entry.isSettled)}
                disabled={isBusy}
              >
                <View style={styles.entryInfo}>
                  <View style={styles.entryHeaderRow}>
                    <Text style={styles.entryDate}>{entry.date}</Text>
                    <View
                      style={[
                        styles.entryStatusChip,
                        entry.isSettled
                          ? styles.entryStatusChipSettled
                          : styles.entryStatusChipUnsettled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.entryStatusChipText,
                          { color: entry.isSettled ? COLORS.settled : COLORS.unsettled },
                        ]}
                      >
                        {entry.isSettled ? '완료' : '미정산'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.entryMeta}>
                    {formatGongsu(entry.totalGongsu)} 공수 · {formatMoney(entry.totalAmount)}
                  </Text>

                  {getEntrySiteSummary(entry) ? (
                    <Text style={styles.entrySite} numberOfLines={1}>
                      현장: {getEntrySiteSummary(entry)}
                    </Text>
                  ) : null}

                  {entry.memo ? (
                    <Text style={styles.entryMemo} numberOfLines={2}>
                      메모: {entry.memo}
                    </Text>
                  ) : null}

                  <Text style={styles.entryHint}>
                    {entry.isSettled ? '\uB20C\uB7EC\uC11C \uBBF8\uC815\uC0B0\uC73C\uB85C \uBCC0\uACBD' : '\uB20C\uB7EC\uC11C \uC815\uC0B0\uC644\uB8CC\uB85C \uBCC0\uACBD'}
                  </Text>
                </View>

              </TouchableOpacity>
            ))
          )}
        </View>

        {entries.length > 0 ? (
          <TouchableOpacity
            style={[styles.exportButton, isBusy && styles.touchDisabled]}
            onPress={exportPdf}
            disabled={isBusy}
          >
            <Text style={styles.exportButtonText}>정산서 공유하기</Text>
          </TouchableOpacity>
        ) : null}
        {entries.length > 0 ? (
          <Text style={styles.exportHint}>카카오톡, 문자, 이메일, 드라이브로 바로 보낼 수 있습니다.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  amountHeadline: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  amountSubline: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillTouchable: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  touchDisabled: {
    opacity: 0.55,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  bodyContent: {
    padding: 16,
    gap: 16,
  },
  feedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feedbackCardError: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    borderColor: '#E8B4B4',
    backgroundColor: '#FFF5F5',
  },
  feedbackText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackErrorTitle: {
    color: '#A53B3B',
    fontSize: 13,
    fontWeight: '800',
  },
  feedbackErrorText: {
    color: '#8B4A4A',
    fontSize: 12,
    lineHeight: 18,
  },
  deductionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  deductionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  deductionPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  deductionPresetButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deductionPresetButtonActive: {
    backgroundColor: '#EAF3E2',
    borderColor: '#B7D8A0',
  },
  deductionPresetButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  deductionPresetButtonTextActive: {
    color: '#2F6E2A',
  },
  deductionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deductionInputLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  deductionInput: {
    minWidth: 92,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  deductionSummaryRow: {
    display: 'none',
  },
  deductionSummaryRowAlt: {
    flexDirection: 'row',
    gap: 10,
  },
  deductionSummaryCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#F4F7FB',
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 6,
  },
  deductionSummaryCardWide: {
    flex: 1.3,
    gap: 10,
  },
  deductionSummaryCardNet: {
    justifyContent: 'center',
  },
  deductionMetricRow: {
    gap: 6,
  },
  deductionMetricDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  deductionSummaryLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  deductionSummaryValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },
  deductionSummaryValueStrong: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  deductionHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  rangeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  rangeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rangePresetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rangeTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  rangePresetButton: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rangePresetButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  rangeInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  rangeInputGroup: {
    flex: 1,
    gap: 6,
  },
  rangeInputLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  rangeInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rangeDivider: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontWeight: '800',
    paddingBottom: 12,
  },
  rangeApplyButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  rangeApplyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  bulkActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  bulkActionButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bulkActionPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  bulkActionSecondary: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  bulkActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  bulkActionSecondaryText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  siteCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  siteDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  siteInfo: {
    flex: 1,
    gap: 4,
  },
  siteName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  siteCaption: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  siteUnsettled: {
    color: COLORS.unsettled,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 8,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyCopy: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  entryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  entryCardPending: {
    borderColor: COLORS.primary,
  },
  entryInfo: {
    gap: 4,
  },
  entryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  entryDate: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  entryMeta: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  entrySite: {
    color: COLORS.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  entryMemo: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  entryHint: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  entryStatusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  entryStatusChipSettled: {
    backgroundColor: COLORS.settledBg,
  },
  entryStatusChipUnsettled: {
    backgroundColor: COLORS.unsettledBg,
  },
  entryStatusChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  exportButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  exportHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: -6,
  },
});
