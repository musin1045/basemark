import 'react-native-gesture-handler';

import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import InputScreen from './src/screens/InputScreen';
import SettleScreen from './src/screens/SettleScreen';
import SiteScreen from './src/screens/SiteScreen';
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

const TAB_ICONS = {
  HomeTab: '기록',
  SitesTab: '현장',
  SettleTab: '정산',
};

function HomeTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          height: 62 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          paddingVertical: 6,
        },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '700',
        },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 12, fontWeight: '700' }}>
            {TAB_ICONS[route.name]}
          </Text>
        ),
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: '기록' }}
      />
      <Tab.Screen
        name="SitesTab"
        component={SiteScreen}
        options={{ title: '현장' }}
      />
      <Tab.Screen
        name="SettleTab"
        component={SettleScreen}
        options={{ title: '정산' }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
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
