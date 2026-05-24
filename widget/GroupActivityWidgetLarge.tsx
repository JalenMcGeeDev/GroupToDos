import React from 'react';
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetActivityItem } from './widget-data';

const MAX_ITEMS = 8;

interface Props {
  items: WidgetActivityItem[];
  groupName: string;
  unauthenticated?: boolean;
  loading?: boolean;
  notConfigured?: boolean;
}

function actionLabel(type: string): string {
  switch (type) {
    case 'action_completed': return 'completed an action';
    case 'goal_created': return 'created a goal';
    case 'goal_completed': return 'completed a goal';
    case 'goal_shared': return 'shared a goal';
    case 'member_joined': return 'joined the group';
    case 'member_left': return 'left the group';
    case 'help_requested': return 'asked for help';
    case 'help_resolved': return 'resolved a request';
    case 'help_offered': return 'offered help';
    default: return type.replace(/_/g, ' ');
  }
}

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function GroupActivityWidgetLarge({
  items,
  groupName,
  unauthenticated,
  loading,
  notConfigured,
}: Props) {
  const visible = items.slice(0, MAX_ITEMS);

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
            text={groupName || 'Group Activity'}
            style={{
              fontSize: 18,
              color: '#FFFFFF',
              fontWeight: 'bold',
              marginLeft: 10,
            }}
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
          text="Log in to Cogo to see group activity"
          style={{ fontSize: 15, color: '#8E8E93' }}
        />
      ) : notConfigured ? (
        <TextWidget
          text="Tap ↻ to configure this widget"
          style={{ fontSize: 15, color: '#8E8E93' }}
        />
      ) : loading ? (
        <TextWidget
          text="Loading activity..."
          style={{ fontSize: 15, color: '#8E8E93' }}
        />
      ) : items.length === 0 ? (
        <TextWidget
          clickAction="OPEN_APP"
          text="No recent activity — check back later"
          style={{ fontSize: 15, color: '#8E8E93' }}
        />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          {visible.map((item) => (
            <FlexWidget
              key={item.id}
              clickAction="OPEN_APP"
              style={{ flexDirection: 'column', marginBottom: 8 }}
            >
              <TextWidget
                text={`› ${item.display_name} ${actionLabel(item.type)}`}
                style={{ fontSize: 21, color: '#EBEBF5' }}
              />
              {item.note ? (
                <TextWidget
                  text={item.note}
                  style={{ fontSize: 20, color: '#8E8E93', marginTop: 2 }}
                />
              ) : null}
              <TextWidget
                text={relativeTime(item.created_at)}
                style={{ fontSize: 13, color: '#636366', marginTop: 2 }}
              />
            </FlexWidget>
          ))}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
