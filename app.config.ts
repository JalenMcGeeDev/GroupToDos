import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Cogo",
  slug: "goals",
  version: "1.0.0",
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
    supportsTablet: true,
    bundleIdentifier: "com.cogoal.app",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
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
    ["@sentry/react-native/expo", {
      "organization": "mcg-works-llc",
      "project": "react-native"
    }],
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
