import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { CutterProvider, useCutter } from "./src/context/CutterContext";
import LoginScreen from "./src/screens/LoginScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import SignalControllerScreen from "./src/screens/SignalControllerScreen";
import ExcelReportsScreen from "./src/screens/ExcelReportsScreen";
import ApiPerformanceScreen from "./src/screens/ApiPerformanceScreen";
import { useResponsive } from "./src/utils/responsive";
import { colors } from "./src/theme/colors";

const Tab = createBottomTabNavigator();

function MainTabNavigator() {
  const { activeDowntime, downtimesList, storedReports } = useCutter();
  const insets = useSafeAreaInsets();
  const { isSmallPhone, rf } = useResponsive();

  const bottomInset = Math.max(insets.bottom, 8);
  const tabBarHeight = (isSmallPhone ? 52 : 56) + bottomInset;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: colors.cardBorder,
          height: tabBarHeight,
          paddingBottom: bottomInset,
          paddingTop: 6,
          elevation: 8,
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6
        },
        tabBarLabelStyle: {
          fontSize: rf(10),
          fontWeight: "700"
        },
        tabBarIcon: ({ focused, color }) => {
          let iconName = "bar-chart-outline";

          if (route.name === "Volume") {
            iconName = focused ? "bar-chart" : "bar-chart-outline";
          } else if (route.name === "Downtimes") {
            iconName = focused ? "warning" : "warning-outline";
          } else if (route.name === "PdfReports" || route.name === "ExcelReports") {
            iconName = focused ? "document-text" : "document-text-outline";
          } else if (route.name === "Performance") {
            iconName = focused ? "speedometer" : "speedometer-outline";
          }

          return <Ionicons name={iconName} size={isSmallPhone ? 18 : 20} color={color} />;
        }
      })}
    >
      <Tab.Screen
        name="Volume"
        component={DashboardScreen}
        options={{
          title: "Volume & Overview"
        }}
      />
      <Tab.Screen
        name="Downtimes"
        component={SignalControllerScreen}
        options={{
          title: "Downtimes & Logs",
          tabBarBadge: activeDowntime
            ? "ACTIVE"
            : downtimesList.length > 0
            ? downtimesList.length
            : undefined,
          tabBarBadgeStyle: {
            backgroundColor: activeDowntime ? colors.danger : "#d97706",
            color: "#ffffff",
            fontSize: 8,
            fontWeight: "800"
          }
        }}
      />
      <Tab.Screen
        name="PdfReports"
        component={ExcelReportsScreen}
        options={{
          title: "PDF Reports",
          tabBarBadge: storedReports.length > 0 ? storedReports.length : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: "#ffffff",
            fontSize: 9,
            fontWeight: "800"
          }
        }}
      />
      <Tab.Screen
        name="Performance"
        component={ApiPerformanceScreen}
        options={{
          title: "API Performance",
          tabBarBadge: "5",
          tabBarBadgeStyle: {
            backgroundColor: "#047857",
            color: "#ffffff",
            fontSize: 9,
            fontWeight: "800"
          }
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { isAuthenticated } = useCutter();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <MainTabNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <CutterProvider>
        <StatusBar style="light" backgroundColor="#064e3b" translucent={true} />
        <RootNavigator />
      </CutterProvider>
    </SafeAreaProvider>
  );
}
