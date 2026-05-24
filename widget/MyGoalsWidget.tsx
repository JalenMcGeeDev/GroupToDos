import React from 'react';
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetGoal, WidgetSubGoal } from './widget-data';

// Max goals shown; each shows up to 2 sub-goals
const MAX_GOALS = 5;
const MAX_SUB_GOALS_PER_GOAL = 2;

function daysInlineLabel(dueDateIso: string | null): string | null {
  if (!dueDateIso) return null;
  const due = new Date(dueDateIso);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'overdue';
  return `${diff}d`;
}

function daysInlineColor(dueDateIso: string | null): `#${string}` {
  if (!dueDateIso) return '#8E8E93';
  const due = new Date(dueDateIso);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return '#FF9999';
  if (diff <= 7) return '#FFFF99';
  return '#99FF99';
}

interface Props {
  goals: WidgetGoal[];
  unauthenticated?: boolean;
  loading?: boolean;
}

function SubGoalRow({ sg }: { sg: WidgetSubGoal }) {
  const done = sg.status === 'completed';
  const label = daysInlineLabel(sg.due_date);

  return (
    <FlexWidget
      key={sg.id}
      clickAction={done ? undefined : `COMPLETE_SUB_GOAL:${sg.id}`}
      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
    >
      {/* Rounded checkbox */}
      <FlexWidget
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: done ? 0 : 2,
          borderColor: '#EBEBF5',
          backgroundColor: done ? '#34C759' : '#00000000',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 8,
        }}
      >
        {done ? (
          <TextWidget text="✓" style={{ fontSize: 14, color: '#FFFFFF', fontWeight: 'bold' }} />
        ) : null}
      </FlexWidget>
      <TextWidget
        text={sg.title}
        style={{ fontSize: 20, color: done ? '#34C759' : '#EBEBF5' }}
      />
      {label && !done ? (
        <TextWidget
          text={` (${label})`}
          style={{ fontSize: 20, color: daysInlineColor(sg.due_date) }}
        />
      ) : null}
    </FlexWidget>
  );
}

export function MyGoalsWidget({ goals, unauthenticated, loading }: Props) {
  const visible = goals.slice(0, MAX_GOALS);
  const overflow = goals.length - MAX_GOALS;

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        padding: 16,
      }}
    >
      {/* Header */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          paddingBottom: 10,
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <ImageWidget
            image={require('../assets/icon.png')}
            imageWidth={28}
            imageHeight={28}
            style={{ borderRadius: 8 }}
          />
          <TextWidget
            text="My Goals"
            style={{ fontSize: 18, color: '#FFFFFF', fontWeight: 'bold', marginLeft: 10 }}
          />
        </FlexWidget>
        <TextWidget
          text="↻"
          clickAction="REFRESH_WIDGET"
          style={{ fontSize: 30, color: '#8E8E93' }}
        />
      </FlexWidget>

      {/* Body */}
      {unauthenticated ? (
        <TextWidget
          clickAction="OPEN_APP"
          text="Log in to Cogo to see your goals"
          style={{ fontSize: 15, color: '#8E8E93' }}
        />
      ) : loading ? (
        <TextWidget
          text="Loading goals..."
          style={{ fontSize: 15, color: '#8E8E93' }}
        />
      ) : goals.length === 0 ? (
        <TextWidget
          clickAction="OPEN_APP"
          text="No active goals — open Cogo to add one"
          style={{ fontSize: 15, color: '#8E8E93' }}
        />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          {visible.map((goal) => {
            const subGoals = (goal.sub_goals ?? []).slice(0, MAX_SUB_GOALS_PER_GOAL);
            const incompleteSubGoals = subGoals.filter((sg) => sg.status !== 'completed');
            const sorted = [
              ...incompleteSubGoals,
              ...subGoals.filter((sg) => sg.status === 'completed'),
            ].slice(0, MAX_SUB_GOALS_PER_GOAL);

            return (
              <FlexWidget
                key={goal.id}
                style={{ flexDirection: 'column', marginBottom: 14 }}
              >
                <FlexWidget
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
                >
                  <TextWidget
                    text={goal.title}
                    clickAction={`OPEN_GOAL:${goal.id}`}
                    style={{ fontSize: 21, color: '#FFFFFF', fontWeight: 'bold' }}
                  />
                  {daysInlineLabel(goal.due_date) ? (
                    <TextWidget
                      text={` (${daysInlineLabel(goal.due_date)})`}
                      style={{ fontSize: 21, color: daysInlineColor(goal.due_date), fontWeight: 'bold' }}
                    />
                  ) : null}
                </FlexWidget>
                {sorted.map((sg) => (
                  <SubGoalRow key={sg.id} sg={sg} />
                ))}
              </FlexWidget>
            );
          })}
          {overflow > 0 && (
            <TextWidget
              text={`+${overflow} more goals — open Cogo`}
              clickAction="OPEN_APP"
              style={{ fontSize: 13, color: '#8E8E93', marginTop: 4 }}
            />
          )}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
