import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

interface Props {
  streak_current: number;
  streak_longest: number;
  unauthenticated?: boolean;
  loading?: boolean;
}

function streakColor(streak: number): `#${string}` {
  if (streak >= 30) return '#EF4444';
  if (streak >= 7) return '#F59E0B';
  return '#FB923C';
}

export function StreakTrackerWidget({
  streak_current,
  streak_longest,
  unauthenticated,
  loading,
}: Props) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <TextWidget
        text="🔥"
        style={{ fontSize: 24, marginRight: 10 }}
      />

      {unauthenticated ? (
        <TextWidget
          text="Log in to Cogo"
          style={{ fontSize: 13, color: '#8E8E93' }}
        />
      ) : loading ? (
        <TextWidget
          text="Loading..."
          style={{ fontSize: 13, color: '#8E8E93' }}
        />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          <TextWidget
            text={`${streak_current} day${streak_current !== 1 ? 's' : ''}`}
            style={{
              fontSize: 18,
              color: streakColor(streak_current),
              fontWeight: 'bold',
            }}
          />
          <TextWidget
            text={`Best: ${streak_longest}`}
            style={{ fontSize: 13, color: '#8E8E93', marginTop: 1 }}
          />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
