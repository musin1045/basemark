import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';

import { exportBackupData, importBackupData } from '../db/db';
import { COLORS } from '../lib/theme';

function formatDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}${month}${day}-${hours}${minutes}`;
}

function getImportErrorMessage(error) {
  if (!error) {
    return '백업 파일을 가져오지 못했습니다.';
  }

  if (error instanceof SyntaxError) {
    return 'JSON 형식이 잘못되어 백업 파일을 읽을 수 없습니다.';
  }

  return error.message || '백업 파일을 가져오지 못했습니다.';
}

export default function SettingsScreen() {
  const [summary, setSummary] = useState({ siteCount: 0, recordCount: 0 });
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const backup = await exportBackupData();
      setSummary({
        siteCount: backup.sites.length,
        recordCount: backup.records.length,
      });
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSummary();
    }, [loadSummary])
  );

  const handleExport = async () => {
    setExporting(true);
    setStatusMessage('');

    try {
      const backup = await exportBackupData();
      const baseDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;

      if (!baseDirectory) {
        throw new Error('백업 파일을 저장할 수 있는 폴더를 찾지 못했습니다.');
      }

      const filename = `gongsu-backup-${formatDateStamp()}.json`;
      const fileUri = `${baseDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '공수 앱 백업 내보내기',
        });
      }

      setStatusMessage(`백업 파일을 준비했습니다: ${filename}`);
    } catch (error) {
      Alert.alert('내보내기 실패', getImportErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const runImport = async (uri) => {
    setImporting(true);
    setStatusMessage('');

    try {
      const rawText = await FileSystem.readAsStringAsync(uri);
      const payload = JSON.parse(rawText);
      const result = await importBackupData(payload);

      await loadSummary();
      setStatusMessage(
        `가져오기 완료: 현장 ${result.siteCount}개, 기록 ${result.recordCount}개`
      );
      Alert.alert('가져오기 완료', '백업 데이터를 현재 앱에 반영했습니다.');
    } catch (error) {
      Alert.alert('가져오기 실패', getImportErrorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const selectedFile = result.assets[0];

      Alert.alert(
        '백업 가져오기',
        `${selectedFile.name || '선택한 파일'}을 불러오면 현재 현장/기록 데이터가 이 파일 내용으로 교체됩니다.`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '가져오기',
            onPress: () => {
              runImport(selectedFile.uri);
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('파일 선택 실패', getImportErrorMessage(error));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>설정</Text>
        <Text style={styles.headerCopy}>
          백업 내보내기와 가져오기를 여기에서 관리합니다.
        </Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          {loadingSummary ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>현재 데이터를 확인하는 중입니다.</Text>
            </View>
          ) : (
            <View style={styles.summaryRow}>
              <View style={styles.summaryBlock}>
                <Text style={styles.summaryLabel}>현장 수</Text>
                <Text style={styles.summaryValue}>{summary.siteCount}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryBlock}>
                <Text style={styles.summaryLabel}>기록 수</Text>
                <Text style={styles.summaryValue}>{summary.recordCount}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>백업 내보내기</Text>
          <Text style={styles.sectionCopy}>
            현재 현장과 기록 전체를 JSON 백업 파일로 만들어 공유하거나 보관할 수 있습니다.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, exporting && styles.buttonDisabled]}
            onPress={handleExport}
            disabled={exporting}
          >
            <Text style={styles.primaryButtonText}>
              {exporting ? '내보내는 중...' : '백업 파일 내보내기'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>백업 가져오기</Text>
          <Text style={styles.sectionCopy}>
            우리 앱 백업은 물론이고, `sites / records`, `items / entries`처럼 필드명이 조금 다른 JSON
            백업도 최대한 읽어오도록 맞춰두었습니다.
          </Text>
          <TouchableOpacity
            style={[styles.secondaryButton, importing && styles.buttonDisabled]}
            onPress={handleImport}
            disabled={importing}
          >
            <Text style={styles.secondaryButtonText}>
              {importing ? '가져오는 중...' : '백업 파일 가져오기'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.warningText}>
            가져오기를 실행하면 현재 앱 안의 현장과 기록 데이터는 선택한 파일 내용으로 교체됩니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>지원 형식</Text>
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>JSON 파일 우선 지원</Text>
            <Text style={styles.noteText}>`sites`, `records` 배열 또는 `entries`, `items` 배열 인식</Text>
            <Text style={styles.noteText}>`site_name`, `siteName`, `task_name`, `taskName` 같은 대체 필드 인식</Text>
          </View>
        </View>

        {statusMessage ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        ) : null}
      </ScrollView>
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
    gap: 6,
    backgroundColor: COLORS.background,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
  },
  headerCopy: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    gap: 14,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryBlock: {
    flex: 1,
    gap: 6,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
  },
  summaryDivider: {
    width: 1,
    height: 42,
    backgroundColor: COLORS.border,
    marginHorizontal: 14,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  sectionCopy: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  warningText: {
    color: COLORS.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  noteCard: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  noteText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: '#EAF3DE',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#CFE3B5',
  },
  statusText: {
    color: COLORS.settled,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
});
