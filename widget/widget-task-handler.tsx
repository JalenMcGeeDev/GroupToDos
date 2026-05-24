import React from 'react';
import { Linking } from 'react-native';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import {
  readSession,
  refreshSessionIfNeeded,
  fetchGoals,
  fetchProfile,
  fetchGroupActivity,
  markSubGoalComplete,
  readGoalsCache,
  writeGoalsCache,
  readWidgetGroupConfig,
  type WidgetGoal,
  type WidgetProfile,
  type WidgetActivityItem,
} from './widget-data';
import { widgetCapture } from './widget-analytics';
import { StreakTrackerWidget } from './StreakTrackerWidget';
import { GroupActivityWidgetMedium } from './GroupActivityWidgetMedium';
import { GroupActivityWidgetLarge } from './GroupActivityWidgetLarge';
import { MyGoalsWidget } from './MyGoalsWidget';

const GROUP_ACTIVITY_WIDGET_NAMES = [
  'GroupActivityWidgetMedium',
  'GroupActivityWidgetLarge',
] as const;
type GroupActivityWidgetName = (typeof GROUP_ACTIVITY_WIDGET_NAMES)[number];

function isGroupActivityWidget(name: string): name is GroupActivityWidgetName {
  return GROUP_ACTIVITY_WIDGET_NAMES.includes(name as GroupActivityWidgetName);
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderStreak(
  profile: WidgetProfile | null,
  options: { unauthenticated?: boolean; loading?: boolean } = {}
): React.ReactElement {
  return (
    <StreakTrackerWidget
      streak_current={profile?.streak_current ?? 0}
      streak_longest={profile?.streak_longest ?? 0}
      unauthenticated={options.unauthenticated}
      loading={options.loading}
    />
  );
}

function renderGroupActivity(
  widgetName: string,
  items: WidgetActivityItem[],
  groupName: string,
  options: {
    unauthenticated?: boolean;
    loading?: boolean;
    notConfigured?: boolean;
  } = {}
): React.ReactElement {
  if (widgetName === 'GroupActivityWidgetLarge') {
    return (
      <GroupActivityWidgetLarge
        items={items}
        groupName={groupName}
        unauthenticated={options.unauthenticated}
        loading={options.loading}
        notConfigured={options.notConfigured}
      />
    );
  }
  return (
    <GroupActivityWidgetMedium
      items={items}
      groupName={groupName}
      unauthenticated={options.unauthenticated}
      loading={options.loading}
      notConfigured={options.notConfigured}
    />
  );
}

function renderGoals(
  goals: WidgetGoal[],
  options: { unauthenticated?: boolean; loading?: boolean } = {}
): React.ReactElement {
  return (
    <MyGoalsWidget
      goals={goals}
      unauthenticated={options.unauthenticated}
      loading={options.loading}
    />
  );
}

// ---------------------------------------------------------------------------
// Task handler
// ---------------------------------------------------------------------------

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetAction, widgetInfo, renderWidget } = props;
  const { widgetName, widgetId } = widgetInfo;

  switch (widgetAction) {
    // -----------------------------------------------------------------------
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const session = await readSession();

      if (!session) {
        if (widgetName === 'StreakTrackerWidget') {
          renderWidget(renderStreak(null, { unauthenticated: true }));
        } else if (isGroupActivityWidget(widgetName)) {
          renderWidget(renderGroupActivity(widgetName, [], '', { unauthenticated: true }));
        } else {
          renderWidget(renderGoals([], { unauthenticated: true }));
        }
        return;
      }

      const freshSession = await refreshSessionIfNeeded(session);

      if (widgetName === 'StreakTrackerWidget') {
        const profile = await fetchProfile(
          freshSession.access_token,
          freshSession.user_id
        );
        renderWidget(renderStreak(profile));
        if (widgetAction === 'WIDGET_ADDED') {
          await widgetCapture(freshSession.user_id, 'widget_added', {
            widget_name: widgetName,
          });
        }
        break;
      }

      if (isGroupActivityWidget(widgetName)) {
        const groupConfig = await readWidgetGroupConfig(widgetId);
        if (!groupConfig) {
          renderWidget(renderGroupActivity(widgetName, [], '', { notConfigured: true }));
          if (widgetAction === 'WIDGET_ADDED') {
            await widgetCapture(freshSession.user_id, 'widget_added', {
              widget_name: widgetName,
            });
          }
          break;
        }
        const limit = widgetName === 'GroupActivityWidgetLarge' ? 8 : 4;
        const items = await fetchGroupActivity(
          freshSession.access_token,
          groupConfig.id,
          limit
        );
        renderWidget(renderGroupActivity(widgetName, items, groupConfig.name));
        if (widgetAction === 'WIDGET_ADDED') {
          await widgetCapture(freshSession.user_id, 'widget_added', {
            widget_name: widgetName,
            group_id: groupConfig.id,
          });
        }
        break;
      }

      // MyGoalsWidget
      const goals = await fetchGoals(freshSession.access_token, freshSession.user_id);
      await writeGoalsCache(goals);
      renderWidget(renderGoals(goals));
      if (widgetAction === 'WIDGET_ADDED') {
        await widgetCapture(freshSession.user_id, 'widget_added', {
          widget_name: widgetName,
          goal_count: goals.length,
        });
      }
      break;
    }

    // -----------------------------------------------------------------------
    case 'WIDGET_CLICK': {
      const clickAction: string = (widgetInfo as any).clickAction ?? '';
      const session = await readSession();

      if (!session) {
        Linking.openURL('cogoal://').catch(() => {});
        break;
      }

      const freshSession = await refreshSessionIfNeeded(session);

      if (clickAction === 'OPEN_APP') {
        Linking.openURL('cogoal://').catch(() => {});
      } else if (clickAction.startsWith('OPEN_GOAL:')) {
        const goalId = clickAction.replace('OPEN_GOAL:', '');
        Linking.openURL(`cogoal://goal/${goalId}`).catch(() => {});
      } else if (clickAction === 'REFRESH_WIDGET') {
        await widgetCapture(freshSession.user_id, 'widget_refresh_tapped', {
          widget_name: widgetName,
        });
        if (widgetName === 'StreakTrackerWidget') {
          const profile = await fetchProfile(
            freshSession.access_token,
            freshSession.user_id
          );
          renderWidget(renderStreak(profile));
        } else if (isGroupActivityWidget(widgetName)) {
          const groupConfig = await readWidgetGroupConfig(widgetId);
          if (!groupConfig) {
            renderWidget(renderGroupActivity(widgetName, [], '', { notConfigured: true }));
          } else {
            const limit = widgetName === 'GroupActivityWidgetLarge' ? 8 : 4;
            const items = await fetchGroupActivity(
              freshSession.access_token,
              groupConfig.id,
              limit
            );
            renderWidget(renderGroupActivity(widgetName, items, groupConfig.name));
          }
        } else {
          const goals = await fetchGoals(
            freshSession.access_token,
            freshSession.user_id
          );
          await writeGoalsCache(goals);
          renderWidget(renderGoals(goals));
        }
      } else if (clickAction.startsWith('COMPLETE_SUB_GOAL:')) {
        const subGoalId = clickAction.replace('COMPLETE_SUB_GOAL:', '');
        await markSubGoalComplete(
          freshSession.access_token,
          freshSession.user_id,
          subGoalId
        );
        await widgetCapture(freshSession.user_id, 'widget_sub_goal_completed', {
          sub_goal_id: subGoalId,
        });
        const goals = await fetchGoals(
          freshSession.access_token,
          freshSession.user_id
        );
        await writeGoalsCache(goals);
        renderWidget(renderGoals(goals));
      }
      break;
    }

    // -----------------------------------------------------------------------
    case 'WIDGET_DELETED': {
      const session = await readSession();
      if (session) {
        await widgetCapture(session.user_id, 'widget_removed', {
          widget_name: widgetName,
        });
      }
      break;
    }

    default:
      break;
  }
}
