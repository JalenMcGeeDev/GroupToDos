import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useNotificationStore } from '../stores/notification-store';
import { COLORS } from '../constants';

export function NotificationBell() {
  const router = useRouter();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <Pressable
      className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center"
      onPress={() => router.push('/notifications')}
    >
      <Feather name="bell" size={18} color="#525252" />
      {unreadCount > 0 && (
        <View
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full items-center justify-center px-1"
          style={{ backgroundColor: COLORS.danger }}
        >
          <Text className="text-xs font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
