import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMyGoals } from '../../hooks/use-my-goals';
import { useMyPendingInvites } from '../../hooks/use-invites';
import { useAuthStore } from '../../stores/auth-store';
import { StreakIndicator } from '../../components/StreakIndicator';
import { GoalCard } from '../../components/GoalCard';
import { COLORS, CADENCE_LABELS } from '../../constants';
import type { Goal } from '../../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function YourGoalsScreen() {
  const router = useRouter();
  const { data: goals, isLoading, refetch } = useMyGoals();
  const { data: pendingInvites } = useMyPendingInvites();
  const profile = useAuthStore((s) => s.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [streakModalOpen, setStreakModalOpen] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderGoalCard = ({ item }: { item: Goal }) => {
    return <GoalCard goal={item} />;
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-6 pt-4 pb-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-base text-gray-400 font-medium">
              Welcome back, {profile?.display_name?.split(' ')[0] ?? 'there'} 👋
            </Text>
            <Text className="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">
              Your Goals
            </Text>
          </View>
          <View className="flex-row items-center">
            {profile && (
              <StreakIndicator
                currentStreak={profile.streak_current}
                longestStreak={profile.streak_longest}
                cadence={profile.checkin_cadence}
                onPress={() => setStreakModalOpen(true)}
                compact
              />
            )}
            <View className="ml-2">
              <Pressable
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: '#F3F4F6' }}
                onPress={() => router.push('/goal/create' as any)}
              >
                <Feather name="plus" size={18} color="#525252" />
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Goals List */}
      <FlatList
        className="bg-gray-50"
        data={goals}
        keyExtractor={(item) => item.id}
        renderItem={renderGoalCard}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={
          pendingInvites && pendingInvites.length > 0 ? (
            <Pressable
              className="mb-4 rounded-2xl p-4 flex-row items-center"
              style={{ backgroundColor: COLORS.primary + '10' }}
              onPress={() => router.push('/pending-invites' as any)}
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: COLORS.primary + '20' }}
              >
                <Feather name="user-plus" size={16} color={COLORS.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-900">
                  {pendingInvites.length} group invite{pendingInvites.length > 1 ? 's' : ''}
                </Text>
                <Text className="text-xs text-gray-400 mt-0.5">Tap to view and respond</Text>
              </View>
              <Feather name="chevron-right" size={16} color={COLORS.primary} />
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-24">
              <Text className="text-gray-300 text-base">Loading...</Text>
            </View>
          ) : (
            <View className="items-center py-24 px-8">
              <View className="w-16 h-16 rounded-2xl bg-gray-50 items-center justify-center mb-5">
                <Feather name="target" size={28} color="#D4D4D4" />
              </View>
              <Text className="text-base font-semibold text-gray-400">No goals yet</Text>
              <Text className="text-base text-gray-300 text-center mt-2 leading-5">
                Create your first goal and start tracking your progress.
              </Text>
            </View>
          )
        }
      />

      {/* Streak Explanation Modal */}
      <Modal
        visible={streakModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStreakModalOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center"
          onPress={() => setStreakModalOpen(false)}
        >
          <Pressable className="bg-white rounded-2xl p-6 mx-6" style={{ width: '88%' }} onPress={() => {}}>
            <View className="items-center mb-4">
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: '#FB923C15' }}
              >
                <Feather name="zap" size={26} color="#FB923C" />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>Your Streak 🔥</Text>
            </View>
            <Text style={{ fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 4 }}>
              Your streak counts consecutive check-ins based on your cadence (currently:{' '}
              <Text style={{ fontWeight: '600', color: '#374151' }}>
                {CADENCE_LABELS[profile?.checkin_cadence ?? 'daily']?.toLowerCase() ?? 'daily'}
              </Text>
              ).
            </Text>
            <Text style={{ fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 20 }}>
              Keep logging actions on time to grow your streak!
            </Text>
            <Pressable
              className="flex-row items-center justify-center py-3 rounded-xl mb-2"
              style={{ backgroundColor: COLORS.primary }}
              onPress={() => {
                setStreakModalOpen(false);
                router.push('/(tabs)/profile' as any);
              }}
            >
              <Feather name="settings" size={15} color="#FFF" />
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff', marginLeft: 8 }}>Adjust Check-in Cadence</Text>
            </Pressable>
            <Pressable
              className="py-2.5 items-center"
              onPress={() => setStreakModalOpen(false)}
            >
              <Text style={{ fontSize: 16, fontWeight: '500', color: '#9CA3AF' }}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
