import 'react-native-gesture-handler';

import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import InputScreen from './src/screens/InputScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SettleScreen from './src/screens/SettleScreen';
import SiteScreen from './src/screens/SiteScreen';
import { getAppSetting } from './src/db/db';
import {
  DEFAULT_EVENING_REMINDER_SETTINGS,
  EVENING_REMINDER_SETTING_KEY,
  ensureNotificationHandlerConfigured,
  normalizeEveningReminderSettings,
  syncEveningReminderAsync,
} from './src/lib/notifications';
import { COLORS } from './src/lib/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const NAVIGATION_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.background,
    card: COLORS.surface,
    primary: COLORS.primary,
    text: COLORS.text,
    border: COLORS.border,
  },
};

function HomeTabs() {
  const insets = useSafeAreaInsets();
  const safeBottomInset = Math.max(insets.bottom, 0);
  const tabBarBottomPadding = 0;
  const tabBarTopPadding = 2;
  const tabBarHeight = 54 + safeBottomInset;
  const tabTitles = {
    HomeTab: '\uAE30\uB85D',
    SitesTab: '\uD604\uC7A5',
    SettleTab: '\uC815\uC0B0',
    SettingsTab: '\uC124\uC815',
  };
  const tabIcons = {
    HomeTab: ['calendar-outline', 'calendar'],
    SitesTab: ['location-outline', 'location'],
    SettleTab: ['wallet-outline', 'wallet'],
    SettingsTab: ['settings-outline', 'settings'],
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowIcon: true,
        tabBarIcon: ({ focused, color }) => {
          const [inactiveIcon, activeIcon] = tabIcons[route.name] ?? ['ellipse-outline', 'ellipse'];
          return (
            <Ionicons
              name={focused ? activeIcon : inactiveIcon}
              size={22}
              color={color}
            />
          );
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          height: tabBarHeight,
          paddingBottom: tabBarBottomPadding,
          paddingTop: tabBarTopPadding,
        },
        tabBarItemStyle: {
          paddingTop: 2,
          paddingBottom: safeBottomInset > 0 ? safeBottomInset + 6 : 12,
          justifyContent: 'flex-start',
        },
        tabBarLabelStyle: {
          fontSize: 15,
          fontWeight: '700',
          lineHeight: 18,
          includeFontPadding: false,
          marginTop: 2,
          marginBottom: 0,
          paddingBottom: 0,
        },
        tabBarLabel: tabTitles[route.name] ?? route.name,
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: '\uAE30\uB85D' }} />
      <Tab.Screen name="SitesTab" component={SiteScreen} options={{ title: '\uD604\uC7A5' }} />
      <Tab.Screen name="SettleTab" component={SettleScreen} options={{ title: '\uC815\uC0B0' }} />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ title: '\uC124\uC815' }}
      />
    </Tab.Navigator>
  );
}

function NotificationBootstrap() {
  useEffect(() => {
    let cancelled = false;

    const bootstrapNotifications = async () => {
      try {
        ensureNotificationHandlerConfigured();
        const rawValue = await getAppSetting(EVENING_REMINDER_SETTING_KEY, '');
        if (cancelled) {
          return;
        }

        let parsedValue = null;
        if (rawValue) {
          try {
            parsedValue = JSON.parse(rawValue);
          } catch {}
        }

        await syncEveningReminderAsync(
          normalizeEveningReminderSettings(parsedValue ?? DEFAULT_EVENING_REMINDER_SETTINGS)
        );
      } catch {}
    };

    void bootstrapNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NotificationBootstrap />
      <NavigationContainer theme={NAVIGATION_THEME}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={HomeTabs} />
          <Stack.Screen
            name="Input"
            component={InputScreen}
            options={{ presentation: 'modal' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
