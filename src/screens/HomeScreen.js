import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getRecordsByMonth, groupByDate } from '../db/db';

const COLORS = {
  primary: '#0C447C',
  mid: '#185FA5',
  light: '#378ADD',
  veryLight: '#B5D4F4',
  zero: '#F1EFE8',
  holiday: '#FBEAF0',
  holidayText: '#72243E',
  holidayBorder: '#ED93B1',
  settled: '#27500A',
  settledBg: '#EAF3DE',
  unsettled: '#854F0B',
  unsettledBg: '#FEF5E7',
  gray: '#888780',
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatMoney(n) {
  return n.toLocaleString('ko-KR') + '원';
}

function getCellStyle(gongsu, isHoliday, isSettled) {
  if (isHoliday) {
    return {
      bg: COLORS.holiday,
      text: COLORS.holidayText,
      border: COLORS.holidayBorder,
    };
  }
  if (gongsu === null) return { bg: 'transparent', text: '#333', border: 'transparent' };
  if (gongsu === 0) return { bg: COLORS.zero, text: COLORS.gray, border: 'transparent' };
  if (gongsu < 0.5) return { bg: COLORS.veryLight, text: COLORS.primary, border: 'transparent' };
  if (gongsu < 1.0) return { bg: COLORS.veryLight, text: COLORS.primary, border: 'transparent' };
  if (gongsu < 1.5) return { bg: COLORS.light, text: '#fff', border: 'transparent' };
  if (gongsu < 2.0) return { bg: '#185FA5', text: '#fff', border: 'transparent' };
  return { bg: COLORS.primary, text: '#fff', border: 'transparent' };
}

export default function HomeScreen({ navigation }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [dateMap, setDateMap] = useState({});

  const loadData = useCallback(async () => {
    const records = await getRecordsByMonth(year, month);
    setDateMap(groupByDate(records));
  }, [year, month]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // Summary
  const allEntries = Object.values(dateMap);
  const totalGongsu = allEntries.reduce((s, d) => s + d.totalGongsu, 0);
  const totalAmount = allEntries.reduce((s, d) => s + d.totalAmount, 0);
  const settledAmount = allEntries.filter(d => d.isSettled).reduce((s, d) => s + d.totalAmount, 0);
  const unsettledAmount = totalAmount - settledAmount;
  const holidayCount = allEntries.filter(d => d.isHoliday).length;

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
              <Text style={styles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{year}년 {month}월</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.navBtn} hitSlop={8}>
              <Text style={styles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.localBadge}>
            <Text style={styles.localBadgeText}>로컬 저장 중</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>이번달 총 공수</Text>
            <Text style={styles.summaryValue}>{totalGongsu % 1 === 0 ? totalGongsu.toFixed(0) : totalGongsu.toFixed(1)}</Text>
          </View>
          <View style={[styles.summaryBox, { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.25)' }]}>
            <Text style={styles.summaryLabel}>이번달 총 금액</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalAmount)}</Text>
          </View>
        </View>

        <View style={styles.settleRow}>
          <View style={styles.settleItem}>
            <Text style={[styles.settleDot, { color: '#7ED857' }]}>●</Text>
            <Text style={styles.settleLabel}>정산완료</Text>
            <Text style={[styles.settleAmt, { color: '#7ED857' }]}>{formatMoney(settledAmount)}</Text>
          </View>
          <Text style={styles.settleSep}>|</Text>
          <View style={styles.settleItem}>
            <Text style={[styles.settleDot, { color: '#FFD060' }]}>●</Text>
            <Text style={styles.settleLabel}>미정산</Text>
            <Text style={[styles.settleAmt, { color: '#FFD060' }]}>{formatMoney(unsettledAmount)}</Text>
          </View>
        </View>
      </View>

      {/* ── Weekday row ──────────────────────────────────────── */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text
            key={d}
            style={[
              styles.weekLabel,
              i === 0 && { color: '#E53935' },
              i === 6 && { color: '#1565C0' },
            ]}
          >
            {d}
          </Text>
        ))}
      </View>

      {/* ── Calendar grid ───────────────────────────────────── */}
      <ScrollView style={styles.calScroll} contentContainerStyle={styles.calContent}>
        <View style={styles.grid}>
          {cells.map((day, idx) => {
            if (!day) {
              return <View key={`e-${idx}`} style={styles.cellEmpty} />;
            }
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const entry = dateMap[dateStr];
            const gongsu = entry ? entry.totalGongsu : null;
            const isSettled = entry?.isSettled || false;
            const isHoliday = entry?.isHoliday || false;
            const isToday = dateStr === todayStr;
            const { bg, text, border } = getCellStyle(gongsu, isHoliday, isSettled);
            const dayOfWeek = (firstDay + (day - 1)) % 7;

            return (
              <TouchableOpacity
                key={dateStr}
                style={[
                  styles.cell,
                  { backgroundColor: bg },
                  border !== 'transparent' && { borderColor: border, borderWidth: 1 },
                  isToday && { borderColor: COLORS.mid, borderWidth: 1.5 },
                ]}
                onPress={() => navigation.navigate('Input', { date: dateStr })}
                activeOpacity={0.75}
              >
                {/* Settled overlay line */}
                {isSettled && (
                  <View style={styles.settledLine} />
                )}
                <Text
                  style={[
                    styles.dayNum,
                    { color: text },
                    isSettled && styles.strikethrough,
                    dayOfWeek === 0 && !entry && { color: '#E53935' },
                    dayOfWeek === 6 && !entry && { color: '#1565C0' },
                  ]}
                >
                  {day}
                </Text>
                {gongsu !== null && gongsu > 0 && (
                  <Text style={[styles.gongsuText, { color: text }]}>
                    {gongsu % 1 === 0 ? gongsu.toFixed(0) : gongsu.toFixed(1)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Bottom summary ─────────────────────────────────── */}
        <View style={styles.bottomSummary}>
          <View style={styles.bsItem}>
            <Text style={styles.bsLabel}>총 공수</Text>
            <Text style={styles.bsValue}>{totalGongsu % 1 === 0 ? totalGongsu.toFixed(0) : totalGongsu.toFixed(1)}</Text>
          </View>
          <View style={styles.bsDivider} />
          <View style={styles.bsItem}>
            <Text style={styles.bsLabel}>휴일 수</Text>
            <Text style={styles.bsValue}>{holidayCount}일</Text>
          </View>
          <View style={styles.bsDivider} />
          <View style={styles.bsItem}>
            <Text style={styles.bsLabel}>월 합계</Text>
            <Text style={styles.bsValue}>{formatMoney(totalAmount)}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.primary },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginBottom: 8,
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBtn: { padding: 4 },
  navArrow: { fontSize: 26, color: '#fff', fontWeight: '600' },
  monthTitle: { fontSize: 20, color: '#fff', fontWeight: '700' },
  localBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  localBadgeText: { color: '#fff', fontSize: 12 },
  summaryRow: { flexDirection: 'row', gap: 0, marginBottom: 8 },
  summaryBox: { flex: 1, paddingHorizontal: 8 },
  summaryLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 2 },
  summaryValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    gap: 8,
  },
  settleItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  settleDot: { fontSize: 10 },
  settleLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  settleAmt: { fontSize: 13, fontWeight: '700', marginLeft: 4 },
  settleSep: { color: 'rgba(255,255,255,0.4)', fontSize: 16 },
  // Weekday
  weekRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  // Calendar
  calScroll: { flex: 1, backgroundColor: '#fff' },
  calContent: { paddingBottom: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#fff',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.85,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#F0F0F0',
    position: 'relative',
  },
  cellEmpty: {
    width: `${100 / 7}%`,
    aspectRatio: 0.85,
    borderWidth: 0.5,
    borderColor: '#F0F0F0',
  },
  dayNum: { fontSize: 17, fontWeight: '700' },
  gongsuText: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  strikethrough: { textDecorationLine: 'line-through' },
  settledLine: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    height: 1.5,
    backgroundColor: 'rgba(0,0,0,0.28)',
    top: '50%',
    zIndex: 1,
  },
  // Bottom summary
  bottomSummary: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderTopColor: '#E8E8E8',
    marginTop: 4,
    backgroundColor: '#F9F9F9',
  },
  bsItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  bsLabel: { fontSize: 12, color: '#888', marginBottom: 2 },
  bsValue: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  bsDivider: { width: 1, backgroundColor: '#E0E0E0', marginVertical: 8 },
});
