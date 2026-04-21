import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useGroups } from '../../hooks/use-groups';
import { NotificationBell } from '../../components/NotificationBell';
import { COLORS } from '../../constants';
import type { GroupWithDetails, GroupMember } from '../../lib/types';

export default function GroupsScreen() {
  const router = useRouter();
  const { data: groups, isLoading, refetch } = useGroups();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleInvite = useCallback(async (group: GroupWithDetails) => {
    try {
      await Share.share({
        message: `Join my group "${group.name}" on CoGoal! Use invite code: ${group.invite_code}`,
      });
    } catch {}
  }, []);

  const renderAvatarStack = (members: GroupMember[], maxShow = 5) => {
    const shown = members.slice(0, maxShow);
    const overflow = members.length - maxShow;

    return (
      <View className="flex-row items-center">
        {shown.map((member, index) => (
          <View
            key={member.user_id}
            style={{ marginLeft: index === 0 ? 0 : -10, zIndex: maxShow - index }}
          >
            {member.profile?.avatar_url ? (
              <Image
                source={{ uri: member.profile.avatar_url }}
                className="w-9 h-9 rounded-full"
                style={{ borderWidth: 2, borderColor: '#fff' }}
              />
            ) : (
              <View
                className="w-9 h-9 rounded-full bg-gray-200 items-center justify-center"
                style={{ borderWidth: 2, borderColor: '#fff' }}
              >
                <Text className="text-xs font-semibold text-gray-500">
                  {member.profile?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
          </View>
        ))}
        {overflow > 0 && (
          <View
            style={{ marginLeft: -10, zIndex: 0 }}
          >
            <View
              className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
              style={{ borderWidth: 2, borderColor: '#fff' }}
            >
              <Text className="text-xs font-semibold text-gray-500">+{overflow}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderGroupCard = ({ item }: { item: GroupWithDetails }) => (
    <Pressable
      className="bg-white rounded-2xl p-5 mb-3 items-center border border-gray-200"
      onPress={() => router.push(`/group/${item.id}`)}
    >
      {/* Avatars */}
      <View className="flex-row items-center justify-center w-full">
        {renderAvatarStack(item.members)}
      </View>

      {/* Group name */}
      <Text className="text-lg font-semibold text-gray-900 tracking-tight mt-4 text-center">
        {item.name}
      </Text>

      {/* Task count */}
      <Text className="text-xs text-gray-400 mt-1 text-center">
        {item.active_goals.length} active goal{item.active_goals.length !== 1 ? 's' : ''}
      </Text>

      {/* Invite button */}
      <Pressable
        className="flex-row items-center justify-center bg-gray-50 rounded-xl py-2.5 mt-4 w-full self-stretch"
        onPress={(e) => {
          e.stopPropagation();
          handleInvite(item);
        }}
      >
        <MaterialIcons name="person-add-alt" size={16} color="#737373" />
        <Text className="text-base font-medium text-gray-500 ml-2">Invite a Contact</Text>
      </Pressable>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-6 pt-4 pb-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-gray-900 tracking-tight">Your Groups</Text>
          <NotificationBell />
        </View>
      </View>

      {/* Section header */}
      <View className="px-6 pb-3">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {groups?.length ?? 0} Group{(groups?.length ?? 0) !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Groups List */}
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroupCard}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
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
                <Feather name="users" size={28} color="#D4D4D4" />
              </View>
              <Text className="text-base font-semibold text-gray-400">No groups yet</Text>
              <Text className="text-base text-gray-300 text-center mt-2 leading-5">
                Create a group or join one with an invite code to get started.
              </Text>
            </View>
          )
        }
      />

      {/* Floating Action Button */}
      <View className="absolute bottom-8 right-6 items-end">
        <Pressable
          className="flex-row items-center rounded-2xl px-5 py-3.5"
          style={{ backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 }}
          onPress={() => router.push('/create-group')}
        >
          <Feather name="plus" size={18} color="#FFF" />
          <Text className="text-white text-base font-semibold ml-2">New Group</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
