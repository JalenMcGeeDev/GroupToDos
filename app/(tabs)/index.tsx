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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMyGoals } from '../../hooks/use-my-goals';
import { useAuthStore } from '../../stores/auth-store';
import { StreakIndicator } from '../../components/StreakIndicator';
import { GoalCard } from '../../components/GoalCard';
import { COLORS } from '../../constants';
import type { Goal } from '../../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function YourGoalsScreen() {
  const router = useRouter();
  const { data: goals, isLoading, refetch } = useMyGoals();
  const profile = useAuthStore((s) => s.profile);
  const [refreshing, setRefreshing] = useState(false);

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
                onPress={() => router.push('/check-in' as any)}
                compact
              />
            )}
            <View className="ml-2">
              <Pressable
                className="flex-row items-center rounded-xl px-3 h-10"
                style={{ backgroundColor: '#F3F4F6' }}
                onPress={() => router.push('/goal/create' as any)}
              >
                <Feather name="plus" size={18} color="#525252" />
                <Text className="ml-1.5 text-sm font-semibold" style={{ color: '#525252' }}>Goal</Text>
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

    </SafeAreaView>
  );
}
