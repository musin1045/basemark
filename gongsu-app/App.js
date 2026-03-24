import 'react-native-gesture-handler';

import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PanResponder, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import InputScreen from './src/screens/InputScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SettleScreen from './src/screens/SettleScreen';
import SiteScreen from './src/screens/SiteScreen';
import { COLORS, FONT } from './src/lib/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const TAB_ROUTE_ORDER = ['HomeTab', 'SitesTab', 'SettleTab', 'SettingsTab'];

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

function SwipeableTabScreen({ navigation, route, children }) {
  const currentIndex = TAB_ROUTE_ORDER.indexOf(route.name);

  const handleSwipeEnd = ({ dx, vx }) => {
    const movedFarEnough = Math.abs(dx) >= 56;
    const movedFastEnough = Math.abs(vx) >= 0.45;

    if (!movedFarEnough && !movedFastEnough) {
      return;
    }

    const direction = dx < 0 ? 1 : -1;
    const nextRouteName = TAB_ROUTE_ORDER[currentIndex + direction];

    if (!nextRouteName || nextRouteName === route.name) {
      return;
    }

    navigation.navigate(nextRouteName);
  };

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      const { dx, dy } = gestureState;
      return Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4;
    },
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      const { dx, dy } = gestureState;
      return Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.5;
    },
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_, gestureState) => {
      handleSwipeEnd(gestureState);
    },
    onPanResponderTerminate: (_, gestureState) => {
      handleSwipeEnd(gestureState);
    },
  });

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

function withTabSwipe(ScreenComponent) {
  return function SwipeEnabledScreen(props) {
    return (
      <SwipeableTabScreen navigation={props.navigation} route={props.route}>
        <ScreenComponent {...props} />
      </SwipeableTabScreen>
    );
  };
}

const SwipeableHomeScreen = withTabSwipe(HomeScreen);
const SwipeableSiteScreen = withTabSwipe(SiteScreen);
const SwipeableSettleScreen = withTabSwipe(SettleScreen);
const SwipeableSettingsScreen = withTabSwipe(SettingsScreen);

function HomeTabs() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeBottomInset = Math.max(insets.bottom, 0);
  const tabBarBottomPadding = 0;
  const tabBarTopPadding = 2;
  const tabLabelFontSize = Math.max(FONT.tab, Math.min(FONT.tab + 1, width / 18));
  const tabLabelLineHeight = tabLabelFontSize + 4;
  const tabBarHeight = 38 + tabLabelLineHeight + safeBottomInset;
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
          fontSize: tabLabelFontSize,
          fontWeight: '700',
          lineHeight: tabLabelLineHeight,
          includeFontPadding: false,
          marginTop: 2,
          marginBottom: 0,
          paddingBottom: 0,
        },
        tabBarLabel: tabTitles[route.name] ?? route.name,
      })}
    >
      <Tab.Screen name="HomeTab" component={SwipeableHomeScreen} options={{ title: '\uAE30\uB85D' }} />
      <Tab.Screen name="SitesTab" component={SwipeableSiteScreen} options={{ title: '\uD604\uC7A5' }} />
      <Tab.Screen name="SettleTab" component={SwipeableSettleScreen} options={{ title: '\uC815\uC0B0' }} />
      <Tab.Screen
        name="SettingsTab"
        component={SwipeableSettingsScreen}
        options={{ title: '\uC124\uC815' }}
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
