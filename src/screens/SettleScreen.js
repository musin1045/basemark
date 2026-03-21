import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getRecordsByMonth, groupByDate, setSettled } from '../db/db';

const COLORS = {
  primary: '#0C447C',
  mid: '#185FA5',
  settled: '#27500A',
  settledBg: '#EAF3DE',
  unsettled: '#854F0B',
  unsettledBg: '#FEF5E7',
  checking: '#0C447C',
  checkingBg: '#E3EEF9',
};

function formatMoney(n) {
  return n.toLocaleString('ko-KR') + '원';
}

export default function SettleScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [dateMap, setDateMap] = useState({});

  const loadData = useCallback(async () => {
    const records = await getRecordsByMonth(year, month);
    setDateMap(groupByDate(records));
  }, [year, month]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const entries = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  const totalGongsu = entries.reduce((s, d) => s + d.totalGongsu, 0);
  const totalAmount = entries.reduce((s, d) => s + d.totalAmount, 0);
  const settledAmount = entries.filter(d => d.isSettled).reduce((s, d) => s + d.totalAmount, 0);
  const unsettledAmount = totalAmount - settledAmount;

  // Group by site from items
  const siteMap = {};
  for (const entry of entries) {
    for (const item of entry.items) {
      const key = item.site_id || 'none';
      if (!siteMap[key]) {
        siteMap[key] = {
          siteId: item.site_id,
          siteName: item.site_name || '현장 미설정',
          siteColor: item.site_color || '#888',
          totalGongsu: 0,
          totalAmount: 0,
          settledAmount: 0,
          unsettledAmount: 0,
          dates: [],
        };
      }
      siteMap[key].totalGongsu += item.gongsu || 0;
      siteMap[key].totalAmount += item.amount || 0;
      if (entry.isSettled) siteMap[key].settledAmount += item.amount || 0;
      else siteMap[key].unsettledAmount += item.amount || 0;
      if (!siteMap[key].dates.includes(entry.date)) siteMap[key].dates.push(entry.date);
    }
  }
  const siteList = Object.values(siteMap);

  async function toggleSettled(date, currentVal) {
    await setSettled(date, !currentVal);
    loadData();
  }

  async function generatePDF() {
    const rows = entries.map(e => `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:8px;">${e.date}</td>
        <td style="padding:8px;text-align:center;">${e.totalGongsu % 1 === 0 ? e.totalGongsu : e.totalGongsu.toFixed(1)}</td>
        <td style="padding:8px;text-align:right;">${e.totalAmount.toLocaleString('ko-KR')}원</td>
        <td style="padding:8px;text-align:center;color:${e.isSettled ? '#27500A' : '#854F0B'}">${e.isSettled ? '정산완료' : '미정산'}</td>
      </tr>
    `).join('');

    const html = `
      <html><head><meta charset="utf-8">
      <style>body{font-family:sans-serif;padding:24px;}h1{color:#0C447C;}table{width:100%;border-collapse:collapse;}th{background:#0C447C;color:white;padding:10px;}td{padding:8px;}</style>
      </head><body>
      <h1>공수 정산서</h1>
      <p style="color:#666;">${year}년 ${month}월 | 출력일: ${today.toLocaleDateString('ko-KR')}</p>
      <div style="display:flex;gap:24px;margin:16px 0;padding:16px;background:#f5f5f5;border-radius:8px;">
        <div><div style="color:#888;font-size:12px;">총 공수</div><div style="font-size:22px;font-weight:bold;">${totalGongsu % 1 === 0 ? totalGongsu : totalGongsu.toFixed(1)}</div></div>
        <div><div style="color:#888;font-size:12px;">총 금액</div><div style="font-size:22px;font-weight:bold;">${totalAmount.toLocaleString('ko-KR')}원</div></div>
        <div><div style="color:#888;font-size:12px;">정산완료</div><div style="font-size:22px;font-weight:bold;color:#27500A;">${settledAmount.toLocaleString('ko-KR')}원</div></div>
        <div><div style="color:#888;font-size:12px;">미정산</div><div style="font-size:22px;font-weight:bold;color:#854F0B;">${unsettledAmount.toLocaleString('ko-KR')}원</div></div>
      </div>
      <table>
        <tr><th>날짜</th><th>공수</th><th>금액</th><th>상태</th></tr>
        ${rows}
      </table>
      </body></html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: '공수 정산서 공유' });
      } else {
        Alert.alert('저장 완료', `파일 경로:\n${uri}`);
      }
    } catch (e) {
      Alert.alert('오류', 'PDF 생성에 실패했습니다.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} hitSlop={8}>
            <Text style={styles.navArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{year}년 {month}월 정산</Text>
          <TouchableOpacity onPress={nextMonth} hitSlop={8}>
            <Text style={styles.navArrow}>›</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.totalAmountBig}>{formatMoney(totalAmount)}</Text>
        <Text style={styles.totalGongsuSub}>{totalGongsu % 1 === 0 ? totalGongsu : totalGongsu.toFixed(1)} 공수</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: COLORS.settledBg }]}>
            <Text style={[styles.statusText, { color: COLORS.settled }]}>정산완료 {formatMoney(settledAmount)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: COLORS.unsettledBg }]}>
            <Text style={[styles.statusText, { color: COLORS.unsettled }]}>미정산 {formatMoney(unsettledAmount)}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={e => e.date}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          siteList.length > 0 ? (
            <View style={styles.siteSection}>
              <Text style={styles.sectionTitle}>현장별 요약</Text>
              {siteList.map(s => (
                <View key={s.siteId || 'none'} style={styles.siteCard}>
                  <View style={[styles.siteDot, { backgroundColor: s.siteColor }]} />
                  <View style={styles.siteInfo}>
                    <Text style={styles.siteName}>{s.siteName}</Text>
                    <Text style={styles.siteDetails}>
                      {s.totalGongsu % 1 === 0 ? s.totalGongsu : s.totalGongsu.toFixed(1)} 공수 · {s.dates.length}일
                    </Text>
                  </View>
                  <View style={styles.siteAmounts}>
                    <Text style={styles.siteTotalAmt}>{formatMoney(s.totalAmount)}</Text>
                    {s.unsettledAmount > 0 && (
                      <Text style={[styles.siteBadge, { color: COLORS.unsettled }]}>
                        미정산 {formatMoney(s.unsettledAmount)}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>일별 내역</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>이번 달 기록이 없습니다.</Text>
          </View>
        }
        renderItem={({ item: entry }) => (
          <View style={styles.entryCard}>
            <View style={styles.entryLeft}>
              <Text style={styles.entryDate}>{entry.date.slice(5).replace('-', '/')}</Text>
              <Text style={styles.entryGongsu}>
                {entry.totalGongsu % 1 === 0 ? entry.totalGongsu : entry.totalGongsu.toFixed(1)} 공수
              </Text>
            </View>
            <Text style={styles.entryAmount}>{formatMoney(entry.totalAmount)}</Text>
            <TouchableOpacity
              style={[
                styles.settleBadge,
                entry.isSettled
                  ? { backgroundColor: COLORS.settledBg }
                  : { backgroundColor: COLORS.unsettledBg }
              ]}
              onPress={() => toggleSettled(entry.date, entry.isSettled)}
            >
              <Text style={[
                styles.settleBadgeText,
                { color: entry.isSettled ? COLORS.settled : COLORS.unsettled }
              ]}>
                {entry.isSettled ? '정산완료' : '미정산'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          entries.length > 0 ? (
            <View style={styles.footer}>
              <TouchableOpacity style={styles.pdfBtn} onPress={generatePDF}>
                <Text style={styles.pdfBtnText}>📄 PDF 출력</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pdfBtn, styles.reqBtn]} disabled>
                <Text style={styles.reqBtnText}>🔒 정산 요청 (준비 중)</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: COLORS.primary,
    padding: 16,
    paddingBottom: 14,
    alignItems: 'center',
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 10 },
  navArrow: { fontSize: 26, color: '#fff', fontWeight: '600' },
  monthTitle: { fontSize: 18, color: '#fff', fontWeight: '700' },
  totalAmountBig: { fontSize: 34, fontWeight: '900', color: '#fff', marginBottom: 2 },
  totalGongsuSub: { fontSize: 15, color: 'rgba(255,255,255,0.8)', marginBottom: 10 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  statusText: { fontSize: 13, fontWeight: '700' },
  // List
  list: { padding: 14, gap: 8, paddingBottom: 30 },
  siteSection: { marginBottom: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#888', marginBottom: 8 },
  siteCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  siteDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  siteInfo: { flex: 1 },
  siteName: { fontSize: 16, fontWeight: '700', color: '#222' },
  siteDetails: { fontSize: 13, color: '#888', marginTop: 2 },
  siteAmounts: { alignItems: 'flex-end' },
  siteTotalAmt: { fontSize: 16, fontWeight: '800', color: '#222' },
  siteBadge: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  // Entry
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  entryLeft: { flex: 1 },
  entryDate: { fontSize: 16, fontWeight: '700', color: '#222' },
  entryGongsu: { fontSize: 13, color: '#888', marginTop: 2 },
  entryAmount: { fontSize: 16, fontWeight: '800', color: '#333', marginRight: 10 },
  settleBadge: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  settleBadgeText: { fontSize: 12, fontWeight: '700' },
  // Footer
  footer: { marginTop: 16, gap: 10 },
  pdfBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  reqBtn: { backgroundColor: '#C0C0C0' },
  reqBtnText: { fontSize: 16, fontWeight: '700', color: '#888' },
  emptyBox: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, color: '#AAA' },
});
