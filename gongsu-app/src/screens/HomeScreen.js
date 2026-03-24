import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRecordsByMonth, groupByDate } from '../db/db';
import {
  buildCalendarCells,
  formatGongsu,
  formatMoney,
  formatMonthLabel,
  getTodayKey,
  WEEKDAYS,
} from '../lib/formatters';
import { COLORS, FONT, GONGSU_PALETTE } from '../lib/theme';

const CALENDAR_LINE_COLOR = '#C4D3E1';
const CALENDAR_LINE_WIDTH = 1;
const BADGE_RIGHT_GAP = 3;
const BADGE_OFFSET_X = -2;

function getEntryPalette(entry) {
  return {
    backgroundColor: '#FFFFFF',
    dayColor: entry ? COLORS.text : COLORS.textMuted,
  };
}

function getGongsuBadgePalette(entry) {
  if (!entry) {
    return null;
  }

  if (entry.isHoliday) {
    return {
      backgroundColor: COLORS.holidayBg,
      borderColor: COLORS.holidayBorder,
      textColor: COLORS.holidayText,
      label: '휴',
    };
  }

  if (entry.totalGongsu >= 2) {
    return {
      backgroundColor: GONGSU_PALETTE[2].background,
      borderColor: GONGSU_PALETTE[2].border,
      textColor: GONGSU_PALETTE[2].text,
      label: '2',
    };
  }

  if (entry.totalGongsu >= 1.5) {
    return {
      backgroundColor: GONGSU_PALETTE[1.5].background,
      borderColor: GONGSU_PALETTE[1.5].border,
      textColor: GONGSU_PALETTE[1.5].text,
      label: '1.5',
    };
  }

  if (entry.totalGongsu >= 1) {
    return {
      backgroundColor: GONGSU_PALETTE[1].background,
      borderColor: GONGSU_PALETTE[1].border,
      textColor: GONGSU_PALETTE[1].text,
      label: '1',
    };
  }

  return {
    backgroundColor: GONGSU_PALETTE[0.5].background,
    borderColor: GONGSU_PALETTE[0.5].border,
    textColor: GONGSU_PALETTE[0.5].text,
    label: '0.5',
  };
}

function formatCellAmount(value) {
  const amount = Math.round(Number(value) || 0);

  if (amount >= 100000) {
    const man = amount / 10000;
    return `${Number.isInteger(man) ? man.toFixed(0) : man.toFixed(1)}만`;
  }

  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(1)}만`;
  }

  return `${amount.toLocaleString('ko-KR')}원`;
}

function getSiteSummary(entry) {
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

function getCellNote(entry) {
  if (!entry) {
    return '';
  }

  const memo = String(entry.memo ?? '').trim();
  if (memo.length > 0) {
    return memo;
  }

  const taskNames = [
    ...new Set(
      entry.items
        .map((item) => String(item.task_name ?? '').trim())
        .filter(Boolean)
    ),
  ];

  if (taskNames.length === 0) {
    return '';
  }

  if (taskNames.length === 1) {
    return taskNames[0];
  }

  return `${taskNames[0]} 외 ${taskNames.length - 1}`;
}

export default function HomeScreen({ navigation }) {
  const today = new Date();
  const { width } = useWindowDimensions();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [dateMap, setDateMap] = useState({});
  const [loading, setLoading] = useState(true);
  const calendarScale = Math.min(Math.max(width / 390, 0.92), 1.28);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const records = await getRecordsByMonth(year, month);
      setDateMap(groupByDate(records));
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const entries = Object.values(dateMap);
  const totalGongsu = entries.reduce((sum, entry) => sum + entry.totalGongsu, 0);
  const totalAmount = entries.reduce((sum, entry) => sum + entry.totalAmount, 0);
  const todayKey = getTodayKey();

  const calendarRows = useMemo(() => {
    const cells = buildCalendarCells(year, month);
    const rows = [];

    for (let index = 0; index < cells.length; index += 7) {
      rows.push(cells.slice(index, index + 7));
    }

    return rows;
  }, [year, month]);

  const responsiveCellStyles = useMemo(
    () => ({
      daySlot: {
        minHeight: 104 * calendarScale,
      },
      emptyCell: {
        minHeight: 104 * calendarScale,
      },
      dayTopRow: {
        minHeight: 24 * calendarScale,
        gap: Math.max(2, 2 * calendarScale),
      },
      dayNumberWrap: {
        minWidth: 22 * calendarScale,
      },
      dayNumber: {
        fontSize: FONT.titleLarge * calendarScale,
        lineHeight: FONT.titleLarge * calendarScale + 1,
      },
      gongsuBadge: {
        width: FONT.xs * calendarScale * 2.05,
        borderRadius: 6 * calendarScale,
        paddingHorizontal: 0,
        paddingVertical: Math.max(1, calendarScale - 0.2),
        transform: [{ translateX: BADGE_OFFSET_X }],
      },
      gongsuBadgeText: {
        fontSize: FONT.xs * calendarScale,
        lineHeight: FONT.xs * calendarScale + 1,
      },
      cellAmount: {
        fontSize: FONT.sm * Math.min(calendarScale, 1.16),
      },
      siteRow: {
        minHeight: 20 * Math.min(calendarScale, 1.16),
      },
      siteText: {
        fontSize: (FONT.xs - 1) * Math.min(calendarScale, 1.18),
        lineHeight: FONT.xs * Math.min(calendarScale, 1.14),
      },
    }),
    [calendarScale]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.monthSwitcher}>
            <TouchableOpacity onPress={previousMonth} style={styles.navButton}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{formatMonthLabel(year, month)}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.navButton}>
              <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.primaryAction}
            onPress={() => navigation.navigate('Input', { date: todayKey })}
          >
            <Text style={styles.primaryActionText}>오늘 입력</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatLabel}>합계</Text>
            <Text style={styles.headerStatValue}>{formatMoney(totalAmount)}</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Text style={styles.headerStatLabel}>이번달 공수</Text>
            <Text style={styles.headerStatValue}>{formatGongsu(totalGongsu)} 공수</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.calendarCard}>
          <View style={styles.calendarGrid}>
            <View style={styles.weekRow}>
              {WEEKDAYS.map((weekday, index) => (
                <View
                  key={weekday}
                  style={[styles.weekCell, index === 6 && styles.lastColumn]}
                >
                  <Text
                    style={[
                      styles.weekLabel,
                      index === 0 && styles.sundayText,
                      index === 6 && styles.saturdayText,
                    ]}
                  >
                    {weekday}
                  </Text>
                </View>
              ))}
            </View>

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>달력 데이터를 불러오는 중입니다.</Text>
              </View>
            ) : (
              calendarRows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={styles.calendarRow}>
                  {row.map((day, colIndex) => {
                    if (!day) {
                      return (
                        <View
                          key={`empty-${rowIndex}-${colIndex}`}
                          style={[
                            styles.emptyCell,
                            responsiveCellStyles.emptyCell,
                            colIndex === 6 && styles.lastColumn,
                          ]}
                        />
                      );
                    }

                    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const entry = dateMap[dateKey];
                    const palette = getEntryPalette(entry);
                    const badgePalette = getGongsuBadgePalette(entry);
                    const cellNote = getCellNote(entry);
                    const siteSummary = getSiteSummary(entry);
                    const shouldCenterMeta = Boolean(
                      entry && !cellNote && (entry.totalAmount > 0 || siteSummary)
                    );
                    const isToday = dateKey === todayKey;

                    return (
                      <View
                        key={dateKey}
                        style={[
                          styles.daySlot,
                          responsiveCellStyles.daySlot,
                          colIndex === 6 && styles.lastColumn,
                        ]}
                      >
                        <TouchableOpacity
                          style={[styles.dayInner, { backgroundColor: palette.backgroundColor }]}
                          activeOpacity={0.85}
                          onPress={() => navigation.navigate('Input', { date: dateKey })}
                        >
                          {isToday ? <View style={styles.todayRing} /> : null}

                          <View style={[styles.dayTopRow, responsiveCellStyles.dayTopRow]}>
                            <View style={[styles.dayNumberWrap, responsiveCellStyles.dayNumberWrap]}>
                              <Text
                                style={[
                                  styles.dayNumber,
                                  responsiveCellStyles.dayNumber,
                                  { color: palette.dayColor },
                                  colIndex === 0 && !entry && styles.sundayText,
                                  colIndex === 6 && !entry && styles.saturdayText,
                                ]}
                                numberOfLines={1}
                                maxFontSizeMultiplier={1}
                              >
                                {day}
                              </Text>
                            </View>
                            {badgePalette ? (
                              <View
                                style={[
                                  styles.gongsuBadge,
                                  responsiveCellStyles.gongsuBadge,
                                  {
                                    backgroundColor: badgePalette.backgroundColor,
                                    borderColor: badgePalette.borderColor,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.gongsuBadgeText,
                                    responsiveCellStyles.gongsuBadgeText,
                                    { color: badgePalette.textColor },
                                  ]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.74}
                                  maxFontSizeMultiplier={1}
                                >
                                  {badgePalette.label}
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <View
                            style={[
                              styles.cellMiddle,
                              shouldCenterMeta && styles.cellMiddleWithoutNote,
                            ]}
                          >
                            {cellNote ? (
                              <Text
                                style={styles.cellNote}
                                numberOfLines={2}
                                ellipsizeMode="tail"
                                maxFontSizeMultiplier={1}
                              >
                                {cellNote}
                              </Text>
                            ) : null}
                          </View>

                          <View
                            style={[
                              styles.cellMeta,
                              shouldCenterMeta && styles.cellMetaCentered,
                            ]}
                          >
                            <View
                              style={[
                                styles.cellAmountRow,
                                shouldCenterMeta && styles.cellAmountRowCentered,
                              ]}
                            >
                              {entry ? (
                                <Text
                                  style={[styles.cellAmount, responsiveCellStyles.cellAmount]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.72}
                                  maxFontSizeMultiplier={1}
                                >
                                  {formatCellAmount(entry.totalAmount)}
                                </Text>
                              ) : null}
                            </View>

                            <View
                              style={[
                                styles.siteRow,
                                responsiveCellStyles.siteRow,
                                shouldCenterMeta && styles.siteRowCentered,
                              ]}
                            >
                              {siteSummary ? (
                                <Text
                                  style={[styles.siteText, responsiveCellStyles.siteText]}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.62}
                                  maxFontSizeMultiplier={1}
                                >
                                  {siteSummary}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        </View>
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
    paddingTop: 10,
    paddingBottom: 16,
    gap: 14,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: FONT.hero,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: FONT.pageTitle,
    fontWeight: '800',
  },
  primaryAction: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryActionText: {
    color: COLORS.primary,
    fontSize: FONT.body,
    fontWeight: '800',
  },
  headerStats: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerStat: {
    flex: 1,
    gap: 2,
  },
  headerStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FONT.sm,
    fontWeight: '600',
  },
  headerStatValue: {
    color: '#FFFFFF',
    fontSize: FONT.title,
    fontWeight: '800',
  },
  headerStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginHorizontal: 14,
  },
  body: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  bodyContent: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 14,
  },
  calendarCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  calendarGrid: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: CALENDAR_LINE_WIDTH,
    borderColor: CALENDAR_LINE_COLOR,
  },
  weekRow: {
    flexDirection: 'row',
    backgroundColor: '#F5F8FC',
  },
  weekCell: {
    flex: 1,
    paddingVertical: 9,
    borderRightWidth: CALENDAR_LINE_WIDTH,
    borderRightColor: CALENDAR_LINE_COLOR,
  },
  weekLabel: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: FONT.sm,
    fontWeight: '700',
  },
  sundayText: {
    color: '#D14343',
  },
  saturdayText: {
    color: '#175CD3',
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: FONT.body,
  },
  calendarRow: {
    flexDirection: 'row',
    borderTopWidth: CALENDAR_LINE_WIDTH,
    borderTopColor: CALENDAR_LINE_COLOR,
  },
  daySlot: {
    flex: 1,
    minHeight: 104,
    borderRightWidth: CALENDAR_LINE_WIDTH,
    borderRightColor: CALENDAR_LINE_COLOR,
    backgroundColor: '#FFFFFF',
  },
  emptyCell: {
    flex: 1,
    minHeight: 104,
    borderRightWidth: CALENDAR_LINE_WIDTH,
    borderRightColor: CALENDAR_LINE_COLOR,
    backgroundColor: '#FCFDFE',
  },
  lastColumn: {
    borderRightWidth: 0,
  },
  dayInner: {
    flex: 1,
    paddingLeft: 5,
    paddingRight: BADGE_RIGHT_GAP,
    paddingTop: 5,
    paddingBottom: 5,
  },
  todayRing: {
    position: 'absolute',
    top: 1.5,
    right: 1.5,
    bottom: 1.5,
    left: 1.5,
    borderWidth: 1,
    borderColor: COLORS.today,
    borderRadius: 10,
  },
  dayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
    gap: 2,
  },
  dayNumberWrap: {
    minWidth: 22,
    flexShrink: 0,
  },
  dayNumber: {
    color: COLORS.text,
    fontSize: FONT.titleLarge,
    fontWeight: '800',
    lineHeight: FONT.titleLarge + 1,
    includeFontPadding: false,
  },
  gongsuBadge: {
    width: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 1,
    flexShrink: 0,
    transform: [{ translateX: BADGE_OFFSET_X }],
  },
  gongsuBadgeText: {
    fontSize: FONT.xs,
    lineHeight: FONT.xs + 1,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.15,
    includeFontPadding: false,
  },
  cellMiddle: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingTop: 4,
  },
  cellMiddleWithoutNote: {
    flex: 0,
    minHeight: 0,
    paddingTop: 0,
  },
  cellNote: {
    fontSize: FONT.xs,
    lineHeight: FONT.xs + 3,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  cellMeta: {
    justifyContent: 'flex-end',
    paddingTop: 7,
  },
  cellMetaCentered: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 4,
  },
  cellAmountRow: {
    minHeight: 20,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 1,
  },
  cellAmountRowCentered: {
    justifyContent: 'center',
  },
  cellAmount: {
    fontSize: FONT.sm,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  siteRow: {
    minHeight: 20,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 0,
    marginTop: 0,
  },
  siteRowCentered: {
    justifyContent: 'center',
    marginTop: 1,
  },
  siteText: {
    width: '100%',
    fontSize: FONT.xs - 1,
    lineHeight: FONT.xs,
    fontWeight: '800',
    color: COLORS.textSoft,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
});
