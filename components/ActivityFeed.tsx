import React from 'react';
import { View, Text, FlatList, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { FeedItem } from '../lib/types';

interface ActivityFeedProps {
  items: FeedItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const EVENT_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  action_completed:        { icon: 'check-circle', color: '#16A34A', bg: '#DCFCE7' },
  goal_created:            { icon: 'target',       color: '#D97757', bg: '#FBE7DD' },
  goal_completed:          { icon: 'award',        color: '#F59E0B', bg: '#FEF3C7' },
  goal_shared:             { icon: 'share-2',      color: '#8B5CF6', bg: '#EDE9FE' },
  action_added:            { icon: 'plus-circle',  color: '#6B7280', bg: '#F3F4F6' },
  action_due_date_changed: { icon: 'calendar',     color: '#D97757', bg: '#FBE7DD' },
  member_joined:           { icon: 'user-plus',    color: '#10B981', bg: '#D1FAE5' },
  member_left:             { icon: 'user-minus',    color: '#EF4444', bg: '#FEE2E2' },
  help_requested:          { icon: 'help-circle',  color: '#F97316', bg: '#FFF7ED' },
  help_resolved:           { icon: 'check-circle', color: '#16A34A', bg: '#DCFCE7' },
  help_offered:            { icon: 'life-buoy',    color: '#0D9488', bg: '#F0FDFA' },
  goal_reaction:           { icon: 'heart',        color: '#EC4899', bg: '#FDF2F8' },
  goal_photo_added:        { icon: 'image',        color: '#8B5CF6', bg: '#EDE9FE' },
  intention_shared:        { icon: 'edit-3',       color: '#8B5CF6', bg: '#EDE9FE' },
};

export function ActivityFeed({ items, isLoading, onRefresh, refreshing }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <Text className="text-gray-400">Loading activity...</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-16">
        <View className="w-14 h-14 rounded-2xl bg-gray-50 items-center justify-center mb-4">
          <Feather name="activity" size={24} color="#D4D4D4" />
        </View>
        <Text className="text-base text-gray-400 text-center leading-5">No activity yet.{"\n"}Be the first to log an action!</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <TimelineItem item={item} isLast={index === items.length - 1} />
      )}
      onRefresh={onRefresh}
      refreshing={refreshing ?? false}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="pb-4"
    />
  );
}

function TimelineItem({ item, isLast }: { item: FeedItem; isLast: boolean }) {
  const config = EVENT_CONFIG[item.type] ?? EVENT_CONFIG.action_added;
  const timeAgo = getTimeAgo(new Date(item.created_at));

  return (
    <View className="flex-row">
      {/* Timeline rail */}
      <View className="items-center" style={{ width: 36 }}>
        {/* Dot */}
        <View
          className="w-7 h-7 rounded-full items-center justify-center"
          style={{ backgroundColor: config.bg }}
        >
          <Feather name={config.icon as any} size={13} color={config.color} />
        </View>
        {/* Vertical connector line */}
        {!isLast && (
          <View className="flex-1 w-0.5 bg-gray-100" style={{ marginTop: 2, marginBottom: -2 }} />
        )}
      </View>

      {/* Content */}
      <View className="flex-1 ml-3 pb-5" style={{ minHeight: 44 }}>
        {/* Header: avatar + name + time */}
        <View className="flex-row items-center mb-1">
          <View className="w-5 h-5 rounded-full bg-gray-200 items-center justify-center overflow-hidden mr-1.5">
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} className="w-5 h-5 rounded-full" />
            ) : (
              <Text className="text-[9px] font-bold text-gray-500">
                {item.display_name?.[0]?.toUpperCase() ?? '?'}
              </Text>
            )}
          </View>
          <Text className="text-xs font-semibold text-gray-700">{item.display_name}</Text>
          <Text className="text-[10px] text-gray-300 ml-1.5">{timeAgo}</Text>
        </View>

        {/* Event description */}
        <Text className="text-[13px] text-gray-600 leading-5">{item.title}</Text>

        {/* Thumbnail for gallery photo entries */}
        {item.type === 'goal_photo_added' && item.media_url && (
          <Image
            source={{ uri: item.media_url }}
            className="w-24 h-24 rounded-xl mt-2"
            resizeMode="cover"
          />
        )}
      </View>
    </View>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
