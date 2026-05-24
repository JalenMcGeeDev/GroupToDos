import { ExpoConfig, ConfigContext } from "expo/config";
import type { WithAndroidWidgetsParams } from "react-native-android-widget";
import { version } from "./package.json";

const widgetConfig: WithAndroidWidgetsParams = {
  widgets: [
    {
      name: "StreakTrackerWidget",
      label: "Cogo Streak",
      description: "Track your daily action streak",
      minWidth: "110dp",
      minHeight: "40dp",
      targetCellWidth: 2,
      targetCellHeight: 1,
      updatePeriodMillis: 1800000,
      resizeMode: "none",
    },
    {
      name: "GroupActivityWidgetMedium",
      label: "Group Activity",
      description: "See recent activity from a group",
      minWidth: "250dp",
      minHeight: "110dp",
      targetCellWidth: 4,
      targetCellHeight: 2,
      updatePeriodMillis: 1800000,
      resizeMode: "horizontal|vertical",
      widgetFeatures: "reconfigurable",
    },
    {
      name: "GroupActivityWidgetLarge",
      label: "Group Activity (Detail)",
      description: "See detailed activity from a group",
      minWidth: "250dp",
      minHeight: "250dp",
      targetCellWidth: 4,
      targetCellHeight: 4,
      updatePeriodMillis: 1800000,
      resizeMode: "horizontal|vertical",
      widgetFeatures: "reconfigurable",
    },
    {
      name: "MyGoalsWidget",
      label: "My Goals",
      description: "View goals and check off sub-goals",
      minWidth: "250dp",
      minHeight: "250dp",
      targetCellWidth: 4,
      targetCellHeight: 4,
      updatePeriodMillis: 1800000,
      resizeMode: "horizontal|vertical",
    },
  ],
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Cogo",
  slug: "goals",
  version,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  scheme: "cogoal",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#F7F5F2",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.cogoal.app",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription: "Cogo uses your photo library so you can attach progress photos when logging actions on your goals and upload a profile picture or group cover image.",
      NSCameraUsageDescription: "Cogo uses your camera so you can record a short video when sharing your daily check-in intention.",
      NSMicrophoneUsageDescription: "Cogo uses your microphone so you can record voice note check-ins and voice note comments on goals.",
      NSContactsUsageDescription: "Cogo uses your contacts so you can invite friends and teammates to join your groups by selecting them from your address book.",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
  },
  notification: {
    icon: "./assets/notification-icon.png",
    color: "#3B82F6",
  },
  android: {
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#000000",
    },
    edgeToEdgeEnabled: true,
    package: "com.cogoal.app",
    permissions: ["android.permission.RECORD_AUDIO"],
    runtimeVersion: {
      policy: "appVersion",
    },
  },
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },
  plugins: [
    "expo-router",
    "expo-notifications",
    "expo-image-picker",
    "expo-camera",
    "expo-video",
    ["@sentry/react-native/expo", {
      "organization": "mcg-works-llc",
      "project": "react-native"
    }],
    ["react-native-android-widget", widgetConfig],
  ],
  extra: {
    router: {},
    eas: {
      projectId: "65e294d7-83bc-4e1d-8d4a-de410a80d99d",
    },
  },
  owner: "jalenmcgeedev",
  updates: {
    url: "https://u.expo.dev/65e294d7-83bc-4e1d-8d4a-de410a80d99d",
    requestHeaders: {
      "expo-channel-name": "production",
    },
  },
});
