import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const EVENING_REMINDER_SETTING_KEY = 'eveningReminder';

export const DEFAULT_EVENING_REMINDER_SETTINGS = {
  enabled: false,
  hour: 20,
  minute: 0,
};

const DAILY_REMINDER_NOTIFICATION_ID = 'gongsu-evening-reminder';
const DAILY_REMINDER_CHANNEL_ID = 'gongsu-evening-reminder';
let notificationHandlerConfigured = false;

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numericValue), min), max);
}

export function isNotificationFeatureSupported() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function normalizeEveningReminderSettings(value) {
  return {
    enabled: Boolean(value?.enabled),
    hour: clampNumber(value?.hour, 18, 23, DEFAULT_EVENING_REMINDER_SETTINGS.hour),
    minute: clampNumber(value?.minute, 0, 59, DEFAULT_EVENING_REMINDER_SETTINGS.minute),
  };
}

export function formatEveningReminderTime(value) {
  const { hour, minute } = normalizeEveningReminderSettings(value);
  const meridiem = hour < 12 ? '오전' : '오후';
  const displayHour = hour % 12 || 12;
  return `${meridiem} ${displayHour}:${String(minute).padStart(2, '0')}`;
}

export function ensureNotificationHandlerConfigured() {
  if (!isNotificationFeatureSupported() || notificationHandlerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  notificationHandlerConfigured = true;
}

async function ensureReminderChannelAsync() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(DAILY_REMINDER_CHANNEL_ID, {
    name: '저녁 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180],
    lightColor: '#185FA5',
  });
}

async function cancelEveningReminderAsync() {
  if (!isNotificationFeatureSupported()) {
    return;
  }

  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_NOTIFICATION_ID);
  } catch {}

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const matchingIds = scheduled
      .filter(
        (notification) =>
          notification.identifier === DAILY_REMINDER_NOTIFICATION_ID ||
          notification.content?.data?.kind === DAILY_REMINDER_NOTIFICATION_ID
      )
      .map((notification) => notification.identifier);

    await Promise.all(
      matchingIds.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier))
    );
  } catch {}
}

async function getReminderPermissionsAsync(requestIfNeeded) {
  let permissions = await Notifications.getPermissionsAsync();

  if (!permissions.granted && requestIfNeeded) {
    permissions = await Notifications.requestPermissionsAsync();
  }

  return permissions;
}

export async function syncEveningReminderAsync(settings, options = {}) {
  const { requestPermissions = false } = options;
  const normalized = normalizeEveningReminderSettings(settings);

  ensureNotificationHandlerConfigured();

  if (!isNotificationFeatureSupported()) {
    return {
      settings: {
        ...normalized,
        enabled: false,
      },
      granted: false,
      scheduled: false,
      unsupported: true,
    };
  }

  await ensureReminderChannelAsync();
  await cancelEveningReminderAsync();

  if (!normalized.enabled) {
    return {
      settings: normalized,
      granted: true,
      scheduled: false,
      unsupported: false,
    };
  }

  const permissions = await getReminderPermissionsAsync(requestPermissions);
  if (!permissions.granted) {
    return {
      settings: {
        ...normalized,
        enabled: false,
      },
      granted: false,
      scheduled: false,
      unsupported: false,
    };
  }

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_NOTIFICATION_ID,
    content: {
      title: '오늘 기록 입력하실 시간입니다',
      body: '기록 탭에서 오늘 공수와 정산 상태를 확인해 주세요.',
      sound: false,
      data: {
        kind: DAILY_REMINDER_NOTIFICATION_ID,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      channelId: DAILY_REMINDER_CHANNEL_ID,
      hour: normalized.hour,
      minute: normalized.minute,
    },
  });

  return {
    settings: normalized,
    granted: true,
    scheduled: true,
    unsupported: false,
  };
}
