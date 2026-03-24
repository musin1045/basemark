import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  exportBackupData,
  importBackupData,
  previewBackupData,
} from '../db/db';
import {
  PRIVACY_POLICY_CONTACT_EMAIL,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_SUMMARY,
} from '../lib/privacyPolicy';
import { COLORS } from '../lib/theme';
import { checkForAppUpdate } from '../lib/updateCheck';

const AUTO_BACKUP_PREFIX = 'gongsu-before-import-';

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
    return error.message || 'JSON 형식이 잘못되어 백업 파일을 읽을 수 없습니다.';
  }

  return error.message || '백업 파일을 가져오지 못했습니다.';
}

function isSqliteFilename(name) {
  return /\.(sqlite|sqlite3|db)$/i.test(String(name ?? '').trim());
}

async function findLatestAutoBackupFile() {
  const baseDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;

  if (!baseDirectory) {
    throw new Error('자동 저장 백업을 찾을 수 있는 폴더를 찾지 못했습니다.');
  }

  const entries = await FileSystem.readDirectoryAsync(baseDirectory);
  const latestFilename = entries
    .filter((name) => name.startsWith(AUTO_BACKUP_PREFIX) && /\.json$/i.test(name))
    .sort()
    .pop();

  if (!latestFilename) {
    return null;
  }

  return {
    filename: latestFilename,
    fileUri: `${baseDirectory}${latestFilename}`,
  };
}

export default function SettingsScreen() {
  const [summary, setSummary] = useState({ siteCount: 0, recordCount: 0 });
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingUpdateInfo, setLoadingUpdateInfo] = useState(true);
  const [updateInfo, setUpdateInfo] = useState(null);
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

  const loadUpdateInfo = useCallback(async () => {
    setLoadingUpdateInfo(true);
    try {
      const nextUpdateInfo = await checkForAppUpdate();
      setUpdateInfo(nextUpdateInfo);
    } finally {
      setLoadingUpdateInfo(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSummary();
      void loadUpdateInfo();
    }, [loadSummary, loadUpdateInfo])
  );

  useEffect(() => {
    void loadSummary();
    void loadUpdateInfo();
  }, [loadSummary, loadUpdateInfo]);

  const createBackupExportFile = useCallback(async () => {
    const backup = await exportBackupData();
    const baseDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;

    if (!baseDirectory) {
      throw new Error('백업 파일을 저장할 수 있는 폴더를 찾지 못했습니다.');
    }

    const filename = `gongsu-backup-${formatDateStamp()}.json`;
    const fileUri = `${baseDirectory}${filename}`;
    const serialized = JSON.stringify(backup, null, 2);

    await FileSystem.writeAsStringAsync(fileUri, serialized);

    return {
      filename,
      fileUri,
      serialized,
    };
  }, []);

  const createSafetyBackupFile = useCallback(async () => {
    const backup = await exportBackupData();
    const baseDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;

    if (!baseDirectory) {
      throw new Error('가져오기 전 백업을 저장할 폴더를 찾지 못했습니다.');
    }

    const filename = `gongsu-before-import-${formatDateStamp()}.json`;
    const fileUri = `${baseDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2));

    return {
      filename,
      fileUri,
    };
  }, []);

  const readImportPayload = useCallback(async (selectedFile) => {
    const lowerFileName = String(selectedFile?.name ?? '').trim().toLowerCase();

    if (isSqliteFilename(lowerFileName)) {
      return {
        sqliteSourceUri: selectedFile.uri,
      };
    }

    if (/\.(xlsx|xls|ods)$/.test(lowerFileName)) {
      const workbookBase64 = await FileSystem.readAsStringAsync(selectedFile.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return { workbookBase64 };
    }

    return FileSystem.readAsStringAsync(selectedFile.uri);
  }, []);

  const handleOpenExternalLink = useCallback(async (url, title) => {
    const targetUrl = String(url ?? '').trim();

    if (!targetUrl) {
      return;
    }

    try {
      const supported = await Linking.canOpenURL(targetUrl);
      if (!supported) {
        throw new Error('링크를 열 수 없습니다.');
      }

      await Linking.openURL(targetUrl);
    } catch (error) {
      Alert.alert(title, error?.message || '링크를 열지 못했습니다.');
    }
  }, []);

  const handleSaveToDevice = async () => {
    setExporting(true);
    setStatusMessage('');

    try {
      const { filename, fileUri, serialized } = await createBackupExportFile();

      if (Platform.OS === 'android') {
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (!permissions.granted || !permissions.directoryUri) {
          setStatusMessage('휴대폰 저장을 취소했습니다.');
          return;
        }

        const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          filename.replace(/\.json$/i, ''),
          'application/json'
        );

        await FileSystem.StorageAccessFramework.writeAsStringAsync(targetUri, serialized);
        setStatusMessage(`휴대폰에 저장했습니다: ${filename}`);
        Alert.alert('저장 완료', '선택한 폴더에 백업 파일을 저장했습니다.');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '백업 파일 저장',
          UTI: 'public.json',
        });
        setStatusMessage(`저장용 파일을 준비했습니다: ${filename}`);
        Alert.alert('파일 내보내기', '공유 화면에서 Files에 저장을 선택하면 휴대폰에 보관할 수 있습니다.');
        return;
      }

      setStatusMessage(`앱 저장소에 파일을 만들었습니다: ${filename}`);
      Alert.alert('저장 위치 안내', `앱 저장소에 파일을 만들었습니다.\n${fileUri}`);
    } catch (error) {
      Alert.alert('휴대폰 저장 실패', getImportErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const handleShareExport = async () => {
    setExporting(true);
    setStatusMessage('');

    try {
      const { filename, fileUri } = await createBackupExportFile();

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('이 기기에서는 공유 기능을 사용할 수 없습니다.');
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'PC / 이메일 / 메신저로 백업 보내기',
        UTI: 'public.json',
      });

      setStatusMessage(`공유용 백업 파일을 준비했습니다: ${filename}`);
    } catch (error) {
      Alert.alert('공유 내보내기 실패', getImportErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const runImport = async (selectedFile, payload, mode) => {
    setImporting(true);
    setStatusMessage('');

    try {
      let safetyBackup = null;

      try {
        safetyBackup = await createSafetyBackupFile();
      } catch {}

      const result = await importBackupData(payload, {
        name: selectedFile.name,
        mode,
      });

      await loadSummary();
      setStatusMessage(
        `${mode === 'merge' ? '유지하고 가져오기 완료' : '덮어쓰기 가져오기 완료'}: 현장 ${result.siteCount}개, 기록 ${result.recordCount}개${
          safetyBackup ? ` · 자동 백업 ${safetyBackup.filename}` : ''
        }`
      );
      Alert.alert(
        mode === 'merge' ? '유지하고 가져오기 완료' : '덮어쓰기 가져오기 완료',
        safetyBackup
          ? `백업 데이터를 현재 앱에 반영했습니다.\n가져오기 전 자동 백업: ${safetyBackup.filename}`
          : '백업 데이터를 현재 앱에 반영했습니다.'
      );
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
      const payload = await readImportPayload(selectedFile);
      const preview = await previewBackupData(payload, {
        name: selectedFile.name,
      });
      const sqliteFile = isSqliteFilename(selectedFile.name);
      const sqliteSparseWarning =
        sqliteFile && preview.recordCount <= 1
          ? '\n\n주의: 이 SQLite 파일에서 읽힌 기록 수가 매우 적습니다. 원본 앱에서는 정상인데 여기서만 거의 비어 보인다면, 이 파일은 라이브 DB 본파일만 복사된 상태일 수 있습니다. 다른 앱은 보통 .db와 -wal을 함께 읽기 때문에, 지금 파일만 덮어쓰면 데이터가 크게 줄어들 수 있습니다.'
          : '';
      const replaceWarning =
        summary.recordCount > 0 && preview.recordCount < summary.recordCount
          ? `\n\n주의: 현재 기록 ${summary.recordCount}개보다 이번 파일에서 읽힌 기록이 ${preview.recordCount}개로 더 적습니다. 덮어쓰기를 선택하면 현재 데이터가 많이 줄어들 수 있습니다.`
          : '';

      Alert.alert(
        '백업 가져오기',
        `${selectedFile.name || '선택한 파일'} 읽기 결과\n현장 ${preview.siteCount}개, 기록 ${preview.recordCount}개${sqliteSparseWarning}${replaceWarning}\n\n현재 데이터를 유지하고 추가로 가져올지, 기존 데이터를 지우고 덮어쓸지 선택해 주세요.\n\n가져오기 직전에 현재 데이터는 자동 백업됩니다.\n\n다른 앱에서 만든 백업 파일은 구조가 다르거나 일부 손상되어 있어 복원이 완전하지 않을 수 있습니다.`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '유지하고 가져오기',
            onPress: () => {
              runImport(selectedFile, payload, 'merge');
            },
          },
          {
            text: sqliteSparseWarning ? '그래도 덮어쓰기' : '덮어쓰기',
            style: 'destructive',
            onPress: () => {
              runImport(selectedFile, payload, 'replace');
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('파일 선택 실패', getImportErrorMessage(error));
    }
  };

  const handleRestorePreviousState = async () => {
    try {
      const autoBackup = await findLatestAutoBackupFile();

      if (!autoBackup) {
        Alert.alert(
          '자동 저장 백업 없음',
          '가져오기 전에 저장된 자동 백업 파일이 아직 없습니다.'
        );
        return;
      }

      const payload = await FileSystem.readAsStringAsync(autoBackup.fileUri);
      const preview = await previewBackupData(payload, {
        name: autoBackup.filename,
      });

      Alert.alert(
        '이전 상태로 복원',
        `최신 자동 저장본\n${autoBackup.filename}\n\n현장 ${preview.siteCount}개, 기록 ${preview.recordCount}개\n\n현재 데이터를 이 자동 저장본 상태로 되돌릴까요?`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '이전 상태로 복원',
            style: 'destructive',
            onPress: () => {
              runImport(
                {
                  name: autoBackup.filename,
                  uri: autoBackup.fileUri,
                },
                payload,
                'replace'
              );
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('자동 저장 복원 실패', getImportErrorMessage(error));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>설정</Text>
        <Text style={styles.headerCopy}>
          업데이트, 백업, 개인정보처리방침을 여기에서 확인합니다.
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
          <Text style={styles.sectionTitle}>앱 업데이트</Text>
          <Text style={styles.sectionCopy}>
            설치된 버전과 변경 사항을 확인합니다.
          </Text>

          {loadingUpdateInfo ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>업데이트 정보를 확인하는 중입니다.</Text>
            </View>
          ) : updateInfo ? (
            <>
              <View style={styles.updateCard}>
                <View style={styles.updateVersionRow}>
                  <View style={styles.updateVersionBlock}>
                    <Text style={styles.summaryLabel}>현재 버전</Text>
                    <Text style={styles.updateVersionValue}>{updateInfo.currentVersion}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.updateVersionBlock}>
                    <Text style={styles.summaryLabel}>최신 버전</Text>
                    <Text style={styles.updateVersionValue}>{updateInfo.latestVersion}</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.updateStatusChip,
                    updateInfo.hasUpdate
                      ? styles.updateStatusChipWarning
                      : styles.updateStatusChipCurrent,
                  ]}
                >
                  <Text
                    style={[
                      styles.updateStatusChipText,
                      updateInfo.hasUpdate
                        ? styles.updateStatusChipTextWarning
                        : styles.updateStatusChipTextCurrent,
                    ]}
                  >
                    {updateInfo.isRequired
                      ? '업데이트 필요'
                      : updateInfo.hasUpdate
                        ? '업데이트 가능'
                        : '최신 상태'}
                  </Text>
                </View>

                <Text style={styles.updateHeadline}>{updateInfo.headline}</Text>
                <Text style={styles.noteText}>{updateInfo.message}</Text>
                {updateInfo.publishedAt ? (
                  <Text style={styles.noteText}>배포일 {updateInfo.publishedAt}</Text>
                ) : null}
              </View>

              <TouchableOpacity style={styles.secondaryButton} onPress={loadUpdateInfo}>
                <Text style={styles.secondaryButtonText}>업데이트 내용 확인</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.noteText}>업데이트 정보를 아직 읽지 못했습니다.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>백업 내보내기</Text>
          <Text style={styles.sectionCopy}>
            현재 데이터를 파일로 저장하거나 다른 기기로 보낼 수 있습니다.
          </Text>
          <View style={styles.exportButtonRow}>
            <TouchableOpacity
              style={[styles.primaryButton, styles.exportButtonHalf, exporting && styles.buttonDisabled]}
              onPress={handleSaveToDevice}
              disabled={exporting}
            >
              <Text style={styles.primaryButtonText}>
                {exporting ? '저장 중...' : '휴대폰에 저장'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, styles.exportButtonHalf, exporting && styles.buttonDisabled]}
              onPress={handleShareExport}
              disabled={exporting}
            >
              <Text style={styles.secondaryButtonText}>
                {exporting ? '준비 중...' : '공유로 보내기'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.noteText}>
            공유로 보내기는 PC, 이메일, 메신저, 클라우드 드라이브로 넘길 때 사용합니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>백업 가져오기</Text>
          <Text style={styles.sectionCopy}>
            백업 파일을 불러와 현재 데이터에 반영합니다.
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
          <TouchableOpacity
            style={[styles.secondaryButton, importing && styles.buttonDisabled]}
            onPress={handleRestorePreviousState}
            disabled={importing}
          >
            <Text style={styles.secondaryButtonText}>
              {importing ? '처리 중...' : '이전 상태로 복원'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.noteText}>
            JSON, CSV, TSV, XLSX, XLS, ODS, common SQLite 백업을 가져올 수 있습니다.
          </Text>
          <Text style={styles.noteText}>
            이전 상태로 복원은 가장 최근에 가져오기 전에 자동 저장한 백업으로 현재 상태를 되돌립니다.
          </Text>
          <Text style={styles.noteText}>
            다른 앱에서 만든 백업 파일은 구조 차이 또는 파일 손상 때문에 일부 데이터가 빠지거나 복원이 완전하지 않을 수 있습니다.
          </Text>
          <Text style={styles.warningText}>
            가져오기를 실행하면 현재 앱 안의 현장과 기록 데이터는 선택한 파일 내용으로 교체됩니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>개인정보처리방침</Text>
          <Text style={styles.sectionCopy}>
            앱에서 처리하는 데이터와 문의처를 확인할 수 있습니다.
          </Text>
          <View style={styles.privacyCard}>
            <Text style={styles.summaryLabel}>시행일</Text>
            <Text style={styles.privacyEffectiveDate}>{PRIVACY_POLICY_EFFECTIVE_DATE}</Text>
            {PRIVACY_POLICY_SUMMARY.map((line) => (
              <Text key={line} style={styles.noteText}>
                {line}
              </Text>
            ))}
            <View style={styles.privacyContactRow}>
              <Text style={styles.summaryLabel}>문의처</Text>
              <TouchableOpacity
                onPress={() =>
                  handleOpenExternalLink(
                    `mailto:${PRIVACY_POLICY_CONTACT_EMAIL}`,
                    '문의 이메일 열기 실패'
                  )
                }
                activeOpacity={0.8}
              >
                <Text style={styles.privacyContactValue}>{PRIVACY_POLICY_CONTACT_EMAIL}</Text>
                <Text style={styles.privacyContactHint}>눌러서 메일 보내기</Text>
              </TouchableOpacity>
            </View>
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
  updateCard: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 10,
  },
  updateVersionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  updateVersionBlock: {
    flex: 1,
    gap: 6,
  },
  updateVersionValue: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  updateStatusChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  updateStatusChipCurrent: {
    backgroundColor: COLORS.settledBg,
  },
  updateStatusChipWarning: {
    backgroundColor: COLORS.unsettledBg,
  },
  updateStatusChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  updateStatusChipTextCurrent: {
    color: COLORS.settled,
  },
  updateStatusChipTextWarning: {
    color: COLORS.unsettled,
  },
  updateHeadline: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  reminderSummaryCard: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 8,
  },
  reminderTimeValue: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
  },
  reminderStatusChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reminderStatusChipActive: {
    backgroundColor: COLORS.settledBg,
  },
  reminderStatusChipInactive: {
    backgroundColor: COLORS.unsettledBg,
  },
  reminderStatusChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  reminderStatusChipTextActive: {
    color: COLORS.settled,
  },
  reminderStatusChipTextInactive: {
    color: COLORS.unsettled,
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
  exportButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  exportButtonHalf: {
    flex: 1,
  },
  privacyCard: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 10,
  },
  privacyEffectiveDate: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  privacyContactRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 6,
  },
  privacyContactValue: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  privacyContactHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  reminderPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reminderPresetButton: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reminderPresetButtonActive: {
    backgroundColor: '#EAF3DE',
    borderColor: '#CFE3B5',
  },
  reminderPresetButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  reminderPresetButtonTextActive: {
    color: COLORS.settled,
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
