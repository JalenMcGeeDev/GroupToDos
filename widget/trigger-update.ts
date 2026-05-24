/**
 * Call from inside the React Native app (not the widget task handler) to push
 * fresh goal data to the My Goals widget immediately.
 *
 * Platform-guarded and error-swallowed so it's safe to call on iOS.
 */
import React from 'react';
import { Platform } from 'react-native';
import type { WidgetGoal, WidgetProfile } from './widget-data';

export async function triggerAllWidgetUpdates(goals: WidgetGoal[]): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const { requestWidgetUpdate } = require('react-native-android-widget') as {
      requestWidgetUpdate: (opts: {
        widgetName: string;
        renderWidget: () => React.ReactElement;
        widgetNotFound: () => void;
      }) => Promise<void>;
    };

    const { MyGoalsWidget } = require('./MyGoalsWidget') as {
      MyGoalsWidget: React.ComponentType<{ goals: WidgetGoal[] }>;
    };

    const noop = () => {};

    await requestWidgetUpdate({
      widgetName: 'MyGoalsWidget',
      renderWidget: () => React.createElement(MyGoalsWidget, { goals }),
      widgetNotFound: noop,
    });
  } catch {
    // Widget module unavailable or not on Android
  }
}

export async function triggerStreakWidgetUpdate(
  profile: WidgetProfile
): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const { requestWidgetUpdate } = require('react-native-android-widget') as {
      requestWidgetUpdate: (opts: {
        widgetName: string;
        renderWidget: () => React.ReactElement;
        widgetNotFound: () => void;
      }) => Promise<void>;
    };

    const { StreakTrackerWidget } = require('./StreakTrackerWidget') as {
      StreakTrackerWidget: React.ComponentType<{
        streak_current: number;
        streak_longest: number;
      }>;
    };

    const noop = () => {};

    await requestWidgetUpdate({
      widgetName: 'StreakTrackerWidget',
      renderWidget: () =>
        React.createElement(StreakTrackerWidget, {
          streak_current: profile.streak_current,
          streak_longest: profile.streak_longest,
        }),
      widgetNotFound: noop,
    });
  } catch {
    // Widget module unavailable or not on Android
  }
}
