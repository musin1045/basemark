import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { getRecordsByDate, getSites, saveRecords } from '../db/db';

const COLORS = {
  primary: '#0C447C',
  mid: '#185FA5',
  light: '#378ADD',
  settled: '#27500A',
  settledBg: '#EAF3DE',
  gray: '#888780',
  grayBg: '#F1EFE8',
};

const QUICK_VALS = [0.5, 1.0, 1.5, 2.0];

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 (${weekdays[date.getDay()]})`;
}

function formatMoney(n) {
  return n.toLocaleString('ko-KR') + '원';
}

function adjustDate(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function newItem(sites) {
  const defaultSite = sites[0] || null;
  return {
    key: Date.now().toString(),
    taskName: '',
    gongsu: 2.0,
    siteId: defaultSite?.id || null,
    siteName: defaultSite?.name || '',
    unitPrice: defaultSite?.unit_price || 0,
  };
}

export default function InputScreen({ route, navigation }) {
  const initialDate = route.params?.date || new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate);
  const [sites, setSites] = useState([]);
  const [items, setItems] = useState([]);
  const [memo, setMemo] = useState('');
  const [memoOpen, setMemoOpen] = useState(false);
  const [isSettled, setIsSettled] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [showSitePicker, setShowSitePicker] = useState(null); // itemKey or null

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    loadForDate(date);
  }, [date, sites]);

  async function loadSites() {
    const s = await getSites();
    setSites(s);
  }

  async function loadForDate(d) {
    if (sites.length === 0) return;
    const records = await getRecordsByDate(d);
    if (records.length > 0) {
      const loadedItems = records.map(r => ({
        key: r.id.toString(),
        taskName: r.task_name || '',
        gongsu: r.gongsu,
        siteId: r.site_id,
        siteName: r.site_name || '',
        unitPrice: r.unit_price || 0,
      }));
      setItems(loadedItems);
      setMemo(records[0].memo || '');
      setIsSettled(records[0].is_settled === 1);
      setIsHoliday(records[0].is_holiday === 1);
    } else {
      setItems([newItem(sites)]);
      setMemo('');
      setIsSettled(false);
      setIsHoliday(false);
    }
  }

  function updateItem(key, field, value) {
    setItems(prev => prev.map(it => {
      if (it.key !== key) return it;
      if (field === 'siteId') {
        const site = sites.find(s => s.id === value);
        return { ...it, siteId: value, siteName: site?.name || '', unitPrice: site?.unit_price || 0 };
      }
      return { ...it, [field]: value };
    }));
  }

  function addItem() {
    setItems(prev => [...prev, newItem(sites)]);
  }

  function removeItem(key) {
    if (items.length === 1) return;
    setItems(prev => prev.filter(it => it.key !== key));
  }

  const totalGongsu = items.reduce((s, it) => s + (parseFloat(it.gongsu) || 0), 0);
  const totalAmount = items.reduce((s, it) => s + Math.round((parseFloat(it.gongsu) || 0) * (it.unitPrice || 0)), 0);

  async function handleSave() {
    if (items.length === 0 || items.every(it => (parseFloat(it.gongsu) || 0) === 0)) {
      Alert.alert('입력 오류', '공수를 입력해주세요.');
      return;
    }
    await saveRecords(date, items, memo, isSettled, isHoliday);
    navigation.navigate('Home');
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setDate(d => adjustDate(d, -1))} hitSlop={8}>
          <Text style={styles.headerArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerDate}>{formatDate(date)}</Text>
        <TouchableOpacity onPress={() => setDate(d => adjustDate(d, 1))} hitSlop={8}>
          <Text style={styles.headerArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

          {/* Items */}
          {items.map((item, idx) => {
            const amount = Math.round((parseFloat(item.gongsu) || 0) * (item.unitPrice || 0));
            return (
              <View key={item.key} style={styles.card}>
                {items.length > 1 && (
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>작업 {idx + 1}</Text>
                    <TouchableOpacity onPress={() => removeItem(item.key)}>
                      <Text style={styles.removeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Task name */}
                <Text style={styles.fieldLabel}>작업명</Text>
                <TextInput
                  style={styles.taskInput}
                  value={item.taskName}
                  onChangeText={v => updateItem(item.key, 'taskName', v)}
                  placeholder="예: 전기 배선 작업"
                  placeholderTextColor="#BBB"
                />

                {/* Gongsu quick buttons */}
                <Text style={styles.fieldLabel}>공수</Text>
                <View style={styles.quickRow}>
                  {QUICK_VALS.map(v => {
                    const active = parseFloat(item.gongsu) === v;
                    return (
                      <TouchableOpacity
                        key={v}
                        style={[styles.quickBtn, active && styles.quickBtnActive]}
                        onPress={() => updateItem(item.key, 'gongsu', v)}
                      >
                        <Text style={[styles.quickBtnText, active && styles.quickBtnTextActive]}>
                          {v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom gongsu input */}
                <View style={styles.customGongsuRow}>
                  <Text style={styles.customGongsuLabel}>직접 입력:</Text>
                  <TextInput
                    style={styles.customGongsuInput}
                    value={item.gongsu !== null ? String(item.gongsu) : ''}
                    onChangeText={v => {
                      const num = parseFloat(v);
                      updateItem(item.key, 'gongsu', isNaN(num) ? 0 : num);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.0"
                    placeholderTextColor="#BBB"
                  />
                </View>

                {/* Site picker */}
                <Text style={styles.fieldLabel}>현장 / 단가</Text>
                <TouchableOpacity
                  style={styles.sitePickerBtn}
                  onPress={() => setShowSitePicker(showSitePicker === item.key ? null : item.key)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.siteColorDot, { backgroundColor: sites.find(s => s.id === item.siteId)?.color || '#ccc' }]} />
                    <Text style={styles.sitePickerText}>{item.siteName || '현장 선택'}</Text>
                  </View>
                  <Text style={styles.sitePickerPrice}>
                    {item.unitPrice ? formatMoney(item.unitPrice) + '/일' : '단가 미설정'}
                  </Text>
                </TouchableOpacity>

                {showSitePicker === item.key && (
                  <View style={styles.siteList}>
                    {sites.map(s => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.siteListItem, item.siteId === s.id && styles.siteListItemActive]}
                        onPress={() => {
                          updateItem(item.key, 'siteId', s.id);
                          setShowSitePicker(null);
                        }}
                      >
                        <View style={[styles.siteColorDot, { backgroundColor: s.color }]} />
                        <Text style={styles.siteListText}>{s.name}</Text>
                        <Text style={styles.siteListPrice}>{formatMoney(s.unit_price)}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.siteListAddBtn}
                      onPress={() => {
                        setShowSitePicker(null);
                        navigation.navigate('Sites');
                      }}
                    >
                      <Text style={styles.siteListAddText}>+ 현장 추가</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Amount preview */}
                <View style={styles.amountBox}>
                  <Text style={styles.amountLabel}>오늘 일당</Text>
                  <Text style={styles.amountValue}>{formatMoney(amount)}</Text>
                  <Text style={styles.amountSub}>
                    {parseFloat(item.gongsu) || 0}공수 × {formatMoney(item.unitPrice || 0)}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Add item */}
          <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
            <Text style={styles.addItemText}>+ 작업 추가</Text>
          </TouchableOpacity>

          {/* Total summary */}
          {items.length > 1 && (
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>오늘 합계</Text>
              <Text style={styles.totalGongsu}>{totalGongsu % 1 === 0 ? totalGongsu.toFixed(0) : totalGongsu.toFixed(1)} 공수</Text>
              <Text style={styles.totalAmount}>{formatMoney(totalAmount)}</Text>
            </View>
          )}

          {/* Options */}
          <View style={styles.optionsCard}>
            {/* Holiday toggle */}
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>휴일로 표시</Text>
              <Switch
                value={isHoliday}
                onValueChange={setIsHoliday}
                trackColor={{ false: '#E0E0E0', true: '#ED93B1' }}
                thumbColor={isHoliday ? '#72243E' : '#fff'}
              />
            </View>

            {/* Settled toggle */}
            <View style={[styles.optionRow, { borderTopWidth: 1, borderTopColor: '#F0F0F0' }]}>
              <View>
                <Text style={styles.optionLabel}>정산완료 처리</Text>
                <Text style={styles.optionSub}>달력에 줄이 그어집니다</Text>
              </View>
              <Switch
                value={isSettled}
                onValueChange={setIsSettled}
                trackColor={{ false: '#E0E0E0', true: '#C5E1A5' }}
                thumbColor={isSettled ? COLORS.settled : '#fff'}
              />
            </View>

            {/* Memo */}
            <TouchableOpacity
              style={[styles.optionRow, { borderTopWidth: 1, borderTopColor: '#F0F0F0' }]}
              onPress={() => setMemoOpen(v => !v)}
            >
              <Text style={styles.optionLabel}>메모 {memoOpen ? '▲' : '▼'}</Text>
              {!memoOpen && memo ? <Text style={styles.memoPreview} numberOfLines={1}>{memo}</Text> : null}
            </TouchableOpacity>
            {memoOpen && (
              <TextInput
                style={styles.memoInput}
                value={memo}
                onChangeText={setMemo}
                placeholder="메모를 입력하세요"
                placeholderTextColor="#BBB"
                multiline
                numberOfLines={3}
              />
            )}
          </View>

          {/* Save button */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>저장하고 달력으로</Text>
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerArrow: { fontSize: 28, color: '#fff', fontWeight: '600' },
  headerDate: { fontSize: 17, color: '#fff', fontWeight: '700' },
  scroll: { flex: 1 },
  content: { padding: 14, gap: 12 },
  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.mid },
  removeBtn: { fontSize: 18, color: '#E53935', padding: 4 },
  fieldLabel: { fontSize: 13, color: '#888', fontWeight: '600', marginTop: 4 },
  taskInput: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#222',
  },
  // Quick buttons
  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F8F8',
  },
  quickBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  quickBtnText: { fontSize: 18, fontWeight: '700', color: '#555' },
  quickBtnTextActive: { color: '#fff' },
  // Custom gongsu
  customGongsuRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customGongsuLabel: { fontSize: 14, color: '#888' },
  customGongsuInput: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    width: 90,
    textAlign: 'center',
  },
  // Site picker
  sitePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  siteColorDot: { width: 12, height: 12, borderRadius: 6 },
  sitePickerText: { fontSize: 16, color: '#222', fontWeight: '600' },
  sitePickerPrice: { fontSize: 14, color: '#888' },
  siteList: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  siteListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  siteListItemActive: { backgroundColor: '#EEF4FF' },
  siteListText: { flex: 1, fontSize: 15, color: '#222', fontWeight: '600' },
  siteListPrice: { fontSize: 14, color: '#888' },
  siteListAddBtn: { padding: 12, alignItems: 'center', backgroundColor: '#F8F8F8' },
  siteListAddText: { fontSize: 14, color: COLORS.mid, fontWeight: '600' },
  // Amount
  amountBox: {
    backgroundColor: '#F0F8EC',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C5E1A5',
  },
  amountLabel: { fontSize: 12, color: COLORS.settled, marginBottom: 2 },
  amountValue: { fontSize: 24, fontWeight: '800', color: COLORS.settled },
  amountSub: { fontSize: 13, color: '#666', marginTop: 2 },
  // Add item
  addItemBtn: {
    borderWidth: 2,
    borderColor: '#D0D0D0',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addItemText: { fontSize: 16, fontWeight: '700', color: '#888' },
  // Total
  totalCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  totalGongsu: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  totalAmount: { fontSize: 28, fontWeight: '800', color: '#fff' },
  // Options
  optionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionLabel: { fontSize: 16, color: '#333', fontWeight: '600' },
  optionSub: { fontSize: 12, color: '#888', marginTop: 2 },
  memoPreview: { fontSize: 13, color: '#999', maxWidth: 200 },
  memoInput: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // Save
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
