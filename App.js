import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text } from 'react-native';

import HomeScreen from './src/screens/HomeScreen';
import InputScreen from './src/screens/InputScreen';
import SiteScreen from './src/screens/SiteScreen';
import SettleScreen from './src/screens/SettleScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const COLORS = {
  primary: '#0C447C',
  mid: '#185FA5',
};

// Icons (text-based for no-dependency approach)
function TabIcon({ label, active }) {
  const icons = { 달력: '📅', 공수: '✏️', 정산: '💰', 설정: '⚙️' };
  return <Text style={{ fontSize: 20 }}>{icons[label] || '●'}</Text>;
}

// Home stack (Calendar + Input)
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="Input"
        component={InputScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="Sites"
        component={SiteScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: COLORS.mid,
          tabBarInactiveTintColor: '#AAA',
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: '#E8E8E8',
            height: 60,
            paddingBottom: 6,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
          tabBarIcon: ({ focused }) => (
            <TabIcon label={route.name} active={focused} />
          ),
        })}
      >
        <Tab.Screen name="달력" component={HomeStack} />
        <Tab.Screen
          name="공수"
          component={InputScreen}
          initialParams={{ date: new Date().toISOString().slice(0, 10) }}
        />
        <Tab.Screen name="정산" component={SettleScreen} />
        <Tab.Screen name="설정" component={SiteScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
