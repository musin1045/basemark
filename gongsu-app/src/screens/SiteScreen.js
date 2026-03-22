import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addSite, deleteSite, getSites, updateSite } from '../db/db';
import { formatMoney } from '../lib/formatters';
import { COLORS, SITE_COLORS } from '../lib/theme';

const EMPTY_FORM = {
  name: '',
  unitPrice: '200000',
  color: SITE_COLORS[0],
};

export default function SiteScreen() {
  const [sites, setSites] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadSites = useCallback(async () => {
    const loadedSites = await getSites();
    setSites(loadedSites);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSites();
    }, [loadSites])
  );

  const averageUnitPrice = useMemo(() => {
    if (sites.length === 0) {
      return 0;
    }

    return Math.round(
      sites.reduce((sum, site) => sum + Number(site.unit_price || 0), 0) / sites.length
    );
  }, [sites]);

  const openCreate = () => {
    setEditingSite(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (site) => {
    setEditingSite(site);
    setForm({
      name: site.name,
      unitPrice: String(site.unit_price),
      color: site.color ?? SITE_COLORS[0],
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingSite(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    const trimmedName = form.name.trim();
    const unitPrice = Number(form.unitPrice.replace(/[^\d]/g, '')) || 0;

    if (trimmedName.length === 0) {
      Alert.alert('현장 이름을 입력해 주세요', '이름이 있어야 목록에서 구분할 수 있습니다.');
      return;
    }

    if (unitPrice <= 0) {
      Alert.alert('단가를 확인해 주세요', '1공수 단가는 0원보다 커야 합니다.');
      return;
    }

    if (editingSite) {
      await updateSite(editingSite.id, trimmedName, unitPrice, form.color);
    } else {
      await addSite(trimmedName, unitPrice, form.color);
    }

    closeModal();
    await loadSites();
  };

  const handleDelete = (site) => {
    Alert.alert(
      '현장을 삭제할까요?',
      `"${site.name}"을 목록에서 삭제합니다. 기존 기록은 이름 스냅샷을 보존합니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            await deleteSite(site.id);
            await loadSites();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>SITE MANAGER</Text>
          <Text style={styles.headerTitle}>현장 관리</Text>
          <Text style={styles.headerCopy}>현장별 단가와 색상을 관리합니다.</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Text style={styles.addButtonText}>새 현장</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>등록 현장</Text>
          <Text style={styles.summaryValue}>{sites.length}곳</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>평균 단가</Text>
          <Text style={styles.summaryValue}>{formatMoney(averageUnitPrice)}</Text>
        </View>
      </View>

      <FlatList
        data={sites}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>등록된 현장이 없습니다.</Text>
            <Text style={styles.emptyStateCopy}>
              첫 번째 현장을 추가하면 입력 화면에서 바로 선택할 수 있습니다.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.siteCard}>
            <View style={[styles.siteSwatch, { backgroundColor: item.color }]} />
            <View style={styles.siteInfo}>
              <Text style={styles.siteName}>{item.name}</Text>
              <Text style={styles.sitePrice}>{formatMoney(item.unit_price)} / 1공수</Text>
            </View>
            <View style={styles.siteActions}>
              <TouchableOpacity onPress={() => openEdit(item)}>
                <Text style={styles.editText}>수정</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)}>
                <Text style={styles.deleteText}>삭제</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingSite ? '현장 수정' : '새 현장 추가'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>현장명</Text>
              <TextInput
                style={styles.textInput}
                value={form.name}
                onChangeText={(value) => setForm((current) => ({ ...current, name: value }))}
                placeholder="예: 성수동 오피스 현장"
                placeholderTextColor={COLORS.textSoft}
                autoFocus
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>1공수 단가</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="number-pad"
                value={form.unitPrice}
                onChangeText={(value) =>
                  setForm((current) => ({
                    ...current,
                    unitPrice: value.replace(/[^\d]/g, ''),
                  }))
                }
                placeholder="200000"
                placeholderTextColor={COLORS.textSoft}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>대표 색상</Text>
              <View style={styles.colorRow}>
                {SITE_COLORS.map((color) => {
                  const active = form.color === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        active && styles.colorOptionActive,
                      ]}
                      onPress={() => setForm((current) => ({ ...current, color }))}
                    />
                  );
                })}
              </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>
                {editingSite ? '현장 수정 저장' : '현장 추가 저장'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  headerCopy: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  emptyState: {
    marginTop: 40,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    gap: 8,
  },
  emptyStateTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyStateCopy: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  siteCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  siteSwatch: {
    width: 16,
    height: 48,
    borderRadius: 8,
  },
  siteInfo: {
    flex: 1,
    gap: 4,
  },
  siteName: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  sitePrice: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  siteActions: {
    gap: 12,
    alignItems: 'flex-end',
  },
  editText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  deleteText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(12, 31, 51, 0.34)',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '800',
  },
  modalClose: {
    color: COLORS.primary,
    fontSize: 14,
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
    borderRadius: 16,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  colorOptionActive: {
    borderWidth: 3,
    borderColor: COLORS.text,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
