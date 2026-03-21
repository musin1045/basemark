import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { getSites, addSite, updateSite, deleteSite } from '../db/db';

const COLORS = {
  primary: '#0C447C',
  mid: '#185FA5',
};

const PRESET_COLORS = [
  '#185FA5', '#0C447C', '#378ADD', '#27500A',
  '#854F0B', '#72243E', '#5C3A91', '#1B6B4A',
];

export default function SiteScreen({ navigation }) {
  const [sites, setSites] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = add new
  const [form, setForm] = useState({ name: '', unitPrice: '', color: '#185FA5' });
  const [colorPickerVisible, setColorPickerVisible] = useState(false);

  useEffect(() => {
    loadSites();
  }, []);

  async function loadSites() {
    const s = await getSites();
    setSites(s);
  }

  function openAdd() {
    setEditTarget(null);
    setForm({ name: '', unitPrice: '', color: '#185FA5' });
    setColorPickerVisible(false);
    setModalVisible(true);
  }

  function openEdit(site) {
    setEditTarget(site);
    setForm({ name: site.name, unitPrice: String(site.unit_price), color: site.color || '#185FA5' });
    setColorPickerVisible(false);
    setModalVisible(true);
  }

  async function handleSave() {
    const name = form.name.trim();
    const unitPrice = parseInt(form.unitPrice.replace(/,/g, ''), 10);
    if (!name) { Alert.alert('오류', '현장명을 입력해주세요.'); return; }
    if (!unitPrice || unitPrice <= 0) { Alert.alert('오류', '올바른 단가를 입력해주세요.'); return; }

    if (editTarget) {
      await updateSite(editTarget.id, name, unitPrice, form.color);
    } else {
      await addSite(name, unitPrice, form.color);
    }
    setModalVisible(false);
    loadSites();
  }

  async function handleDelete(site) {
    Alert.alert(
      '현장 삭제',
      `"${site.name}"을 삭제하시겠어요?\n기존 기록은 유지됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: async () => {
            await deleteSite(site.id);
            loadSites();
          }
        }
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>현장 관리</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ 추가</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sites}
        keyExtractor={s => s.id.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>등록된 현장이 없습니다.</Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd}>
              <Text style={styles.emptyAddText}>+ 현장 추가하기</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.siteCard}>
            <View style={[styles.colorBar, { backgroundColor: item.color || '#185FA5' }]} />
            <View style={styles.siteInfo}>
              <Text style={styles.siteName}>{item.name}</Text>
              <Text style={styles.sitePrice}>{(item.unit_price).toLocaleString('ko-KR')}원 / 일</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
              <Text style={styles.editBtnText}>수정</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(item)}>
              <Text style={styles.delBtnText}>삭제</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editTarget ? '현장 수정' : '현장 추가'}</Text>

            <Text style={styles.fieldLabel}>현장명</Text>
            <TextInput
              style={styles.textInput}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder="예: 강남 빌딩 공사"
              placeholderTextColor="#BBB"
              autoFocus={!editTarget}
            />

            <Text style={styles.fieldLabel}>일 단가 (원)</Text>
            <TextInput
              style={styles.textInput}
              value={form.unitPrice}
              onChangeText={v => setForm(f => ({ ...f, unitPrice: v }))}
              placeholder="예: 200000"
              placeholderTextColor="#BBB"
              keyboardType="numeric"
            />

            {/* Color section */}
            <Text style={styles.fieldLabel}>달력 색상</Text>
            {!editTarget && !colorPickerVisible ? (
              <View style={styles.colorAutoSection}>
                <View style={styles.colorAutoBox}>
                  <View style={[styles.colorDotLarge, { backgroundColor: form.color }]} />
                  <Text style={styles.colorAutoText}>자동 지정됨</Text>
                </View>
                <TouchableOpacity onPress={() => setColorPickerVisible(true)}>
                  <Text style={styles.colorChangeLink}>직접 고를게요</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.colorPalette}>
                  {PRESET_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: c },
                        form.color === c && styles.colorCircleActive,
                      ]}
                      onPress={() => setForm(f => ({ ...f, color: c }))}
                    />
                  ))}
                </View>
              </>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={handleSave}
              >
                <Text style={styles.modalBtnSaveText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  addBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  list: { padding: 14, gap: 10 },
  siteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  colorBar: { width: 6, alignSelf: 'stretch' },
  siteInfo: { flex: 1, paddingVertical: 14, paddingLeft: 12 },
  siteName: { fontSize: 17, fontWeight: '700', color: '#222', marginBottom: 3 },
  sitePrice: { fontSize: 14, color: '#888' },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  editBtnText: { fontSize: 14, color: COLORS.mid, fontWeight: '600' },
  delBtn: { paddingHorizontal: 12, paddingVertical: 14 },
  delBtnText: { fontSize: 14, color: '#E53935', fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 16 },
  emptyText: { fontSize: 16, color: '#AAA' },
  emptyAddBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyAddText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#222', marginBottom: 8, textAlign: 'center' },
  fieldLabel: { fontSize: 13, color: '#888', fontWeight: '600', marginTop: 8 },
  textInput: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    color: '#222',
  },
  colorAutoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
  },
  colorAutoBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorDotLarge: { width: 24, height: 24, borderRadius: 12 },
  colorAutoText: { fontSize: 15, color: '#555', fontWeight: '600' },
  colorChangeLink: { fontSize: 14, color: COLORS.mid, fontWeight: '600' },
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 8,
  },
  colorCircle: { width: 40, height: 40, borderRadius: 20 },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: '#222',
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalBtn: { flex: 1, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: '#F0F0F0' },
  modalBtnCancelText: { fontSize: 16, fontWeight: '700', color: '#666' },
  modalBtnSave: { backgroundColor: COLORS.primary },
  modalBtnSaveText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
