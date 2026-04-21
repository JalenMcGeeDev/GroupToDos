import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNotificationStore } from '../stores/notification-store';
import { COLORS } from '../constants';
import type { Notification, NotificationType } from '../lib/types';

const NOTIF_ICONS: Record<NotificationType, string> = {
  checkin_reminder: 'clock',
  teammate_action: 'activity',
  milestone_celebration: 'award',
  streak_alert: 'zap',
  streak_broken: 'alert-triangle',
  goal_completed: 'check-circle',
  goal_reaction: 'heart',
  comment: 'message-circle',
  group_invite: 'user-plus',
  member_joined: 'users',
  help_requested: 'help-circle',
  help_offered: 'check-circle',
  due_date_reminder: 'calendar',
  due_date_missed: 'alert-octagon',
};

const NOTIF_COLORS: Record<NotificationType, string> = {
  checkin_reminder: COLORS.warning,
  teammate_action: COLORS.primary,
  milestone_celebration: COLORS.accent,
  streak_alert: '#F59E0B',
  streak_broken: COLORS.danger,
  goal_completed: COLORS.success,
  goal_reaction: '#EC4899',
  comment: COLORS.primary,
  group_invite: COLORS.primary,
  member_joined: COLORS.success,
  help_requested: '#F97316',
  help_offered: COLORS.success,
  due_date_reminder: '#F59E0B',
  due_date_missed: COLORS.danger,
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, unreadCount, isLoading, fetchNotifications, markAsRead, markAllAsRead } =
    useNotificationStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handlePress = async (notif: Notification) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }

    // Navigate based on notification type and data
    if (notif.type === 'group_invite') {
      router.push('/pending-invites' as any);
      return;
    }

    if (notif.data?.group_id) {
      router.push({
        pathname: `/group/${notif.data.group_id}` as any,
        params: notif.data?.goal_id ? { expandGoal: notif.data.goal_id as string } : undefined,
      });
    }
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const icon = NOTIF_ICONS[item.type] ?? 'bell';
    const color = NOTIF_COLORS[item.type] ?? COLORS.primary;

    return (
      <Pressable
        className={`flex-row items-start px-6 py-4 ${
          !item.read ? 'bg-primary-50/30' : ''
        }`}
        onPress={() => handlePress(item)}
      >
        <View
          className="w-10 h-10 rounded-xl items-center justify-center mr-3 mt-0.5"
          style={{ backgroundColor: color + '12' }}
        >
          <Feather name={icon as any} size={16} color={color} />
        </View>
        <View className="flex-1">
          <Text
            className={`text-base ${!item.read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
          >
            {item.title}
          </Text>
          {item.body && (
            <Text className="text-base text-gray-400 mt-0.5 leading-5" numberOfLines={2}>
              {item.body}
            </Text>
          )}
          <Text className="text-xs text-gray-300 mt-1.5 uppercase tracking-wider">{formatTime(item.created_at)}</Text>
        </View>
        {!item.read && (
          <View className="w-2 h-2 rounded-full mt-2.5" style={{ backgroundColor: COLORS.primary }} />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-4 pb-4">
        <View className="flex-row items-center flex-1">
          <Pressable
            className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center mr-3"
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={18} color="#525252" />
          </Pressable>
          <Text className="text-2xl font-bold text-gray-900 tracking-tight">Notifications</Text>
        </View>
        {unreadCount > 0 && (
          <Pressable
            className="px-3.5 py-1.5 rounded-xl bg-primary-50"
            onPress={markAllAsRead}
          >
            <Text style={{ color: COLORS.primary }} className="text-xs font-semibold">
              Mark all read
            </Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-24">
              <Text className="text-gray-300 text-base">Loading...</Text>
            </View>
          ) : (
            <View className="items-center py-24 px-8">
              <View className="w-16 h-16 rounded-2xl bg-gray-50 items-center justify-center mb-5">
                <Feather name="bell-off" size={28} color="#D4D4D4" />
              </View>
              <Text className="text-base font-semibold text-gray-400">No notifications yet</Text>
              <Text className="text-base text-gray-300 text-center mt-2 leading-5">
                You'll see updates from your groups here.
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
