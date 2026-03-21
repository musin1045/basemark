import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import InputScreen from './src/screens/InputScreen';
import SiteScreen from './src/screens/SiteScreen';
import SettleScreen from './src/screens/SettleScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#185FA5',
        tabBarInactiveTintColor: '#888780',
        tabBarStyle: { borderTopWidth: 0.5, borderTopColor: '#ddd' },
      }}>
      <Tab.Screen
        name="달력"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>▦</Text> }}
      />
      <Tab.Screen
        name="현장"
        component={SiteScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>◈</Text> }}
      />
      <Tab.Screen
        name="정산"
        component={SettleScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>◎</Text> }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={HomeTabs} />
        <Stack.Screen
          name="Input"
          component={InputScreen}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
