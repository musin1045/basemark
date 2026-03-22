import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getRecordsByMonth,
  groupByDate,
  setSettled,
  setSettledByMonth,
} from '../db/db';
import {
  escapeHtml,
  formatGongsu,
  formatMoney,
  formatMonthLabel,
} from '../lib/formatters';
import { COLORS } from '../lib/theme';

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

export default function SettleScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [dateMap, setDateMap] = useState({});

  const loadData = useCallback(async () => {
    const records = await getRecordsByMonth(year, month);
    setDateMap(groupByDate(records));
  }, [month, year]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const previousMonth = () => {
    if (month === 1) {
      setYear((value) => value - 1);
      setMonth(12);
      return;
    }
    setMonth((value) => value - 1);
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear((value) => value + 1);
      setMonth(1);
      return;
    }
    setMonth((value) => value + 1);
  };

  const entries = useMemo(
    () => Object.values(dateMap).sort((left, right) => left.date.localeCompare(right.date)),
    [dateMap]
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

  const toggleSettled = async (date, currentValue) => {
    await setSettled(date, !currentValue);
    await loadData();
  };

  const handleBulkUpdate = (nextSettled) => {
    if (entries.length === 0) {
      Alert.alert('정산할 내용이 없습니다', '먼저 기록을 입력한 뒤 다시 시도해 주세요.');
      return;
    }

    Alert.alert(
      nextSettled ? '일괄 정산 완료' : '일괄 미정산',
      `${formatMonthLabel(year, month)} 기록을 ${nextSettled ? '전부 정산 완료' : '전부 미정산'}로 바꿀까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: nextSettled ? '정산 완료' : '미정산으로 변경',
          onPress: async () => {
            await setSettledByMonth(year, month, nextSettled);
            await loadData();
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
          <h1>${escapeHtml(formatMonthLabel(year, month))} 정산 요약</h1>
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
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${formatMonthLabel(year, month)} 정산 PDF`,
        });
      } else {
        Alert.alert('PDF가 생성되었습니다', uri);
      }
    } catch (error) {
      Alert.alert('PDF 생성에 실패했습니다', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={previousMonth} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{formatMonthLabel(year, month)}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.amountHeadline}>{formatMoney(totals.totalAmount)}</Text>
        <Text style={styles.amountSubline}>{formatGongsu(totals.totalGongsu)} 공수 누적</Text>

        <View style={styles.pillRow}>
          <View style={[styles.pill, { backgroundColor: COLORS.settledBg }]}>
            <Text style={[styles.pillText, { color: COLORS.settled }]}>
              정산 완료 {formatMoney(totals.settledAmount)}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: COLORS.unsettledBg }]}>
            <Text style={[styles.pillText, { color: COLORS.unsettled }]}>
              미정산 {formatMoney(totals.unsettledAmount)}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bulkActionRow}>
          <TouchableOpacity
            style={[styles.bulkActionButton, styles.bulkActionPrimary]}
            onPress={() => handleBulkUpdate(true)}
          >
            <Text style={styles.bulkActionPrimaryText}>일괄 정산 완료</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkActionButton, styles.bulkActionSecondary]}
            onPress={() => handleBulkUpdate(false)}
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
              <Text style={styles.emptyTitle}>이번 달 기록이 아직 없습니다.</Text>
              <Text style={styles.emptyCopy}>
                기록 탭에서 입력하면 여기에서 날짜별 정산 상태를 바로 바꿀 수 있습니다.
              </Text>
            </View>
          ) : (
            entries.map((entry) => (
              <View key={entry.date} style={styles.entryCard}>
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
                </View>

                <TouchableOpacity
                  style={[
                    styles.entryActionButton,
                    entry.isSettled
                      ? styles.entryActionButtonSecondary
                      : styles.entryActionButtonPrimary,
                  ]}
                  onPress={() => toggleSettled(entry.date, entry.isSettled)}
                >
                  <Text
                    style={[
                      styles.entryActionButtonText,
                      entry.isSettled
                        ? styles.entryActionButtonSecondaryText
                        : styles.entryActionButtonPrimaryText,
                    ]}
                  >
                    {entry.isSettled ? '완료 취소' : '정산 완료'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {entries.length > 0 ? (
          <TouchableOpacity style={styles.exportButton} onPress={exportPdf}>
            <Text style={styles.exportButtonText}>월별 정산 PDF 내보내기</Text>
          </TouchableOpacity>
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
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
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
  entryActionButton: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderWidth: 1,
  },
  entryActionButtonPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  entryActionButtonSecondary: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  entryActionButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  entryActionButtonPrimaryText: {
    color: '#FFFFFF',
  },
  entryActionButtonSecondaryText: {
    color: COLORS.text,
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
});
