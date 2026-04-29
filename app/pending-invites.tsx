import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMyPendingInvites, useAcceptInvite, useDeclineInvite } from '../hooks/use-invites';
import { COLORS } from '../constants';
import type { GroupInvite } from '../lib/types';

export default function PendingInvitesScreen() {
  const router = useRouter();
  const { data: invites, isLoading, refetch } = useMyPendingInvites();
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleAccept = async (invite: GroupInvite) => {
    setActionId(invite.id);
    try {
      const groupId = await acceptInvite.mutateAsync(invite.id);
      router.push(`/group/${groupId}` as any);
    } catch {
      Alert.alert('Error', 'Failed to accept invite. Please try again.');
    } finally {
      setActionId(null);
    }
  };

  const handleDecline = (invite: GroupInvite) => {
    Alert.alert(
      'Decline Invite',
      `Decline the invite to "${invite.group?.name ?? 'this group'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setActionId(invite.id);
            try {
              await declineInvite.mutateAsync(invite.id);
            } catch {
              Alert.alert('Error', 'Failed to decline invite.');
            } finally {
              setActionId(null);
            }
          },
        },
      ]
    );
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const renderInvite = ({ item }: { item: GroupInvite }) => {
    const isActioning = actionId === item.id;

    return (
      <View className="mx-6 mb-3 bg-white rounded-2xl p-5" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
        <View className="flex-row items-center mb-3">
          <View
            className="w-11 h-11 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: COLORS.primary + '12' }}
          >
            <Feather name="users" size={18} color={COLORS.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-900">{item.group?.name ?? 'Group'}</Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              Invited by {item.inviter_profile?.display_name ?? 'someone'} · {formatTime(item.created_at)}
            </Text>
          </View>
        </View>

        {isActioning ? (
          <View className="py-3 items-center">
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : (
          <View className="flex-row">
            <Pressable
              className="flex-1 py-2.5 rounded-xl items-center mr-2 bg-gray-100"
              onPress={() => handleDecline(item)}
            >
              <Text className="text-base font-semibold text-gray-500">Decline</Text>
            </Pressable>
            <Pressable
              className="flex-1 py-2.5 rounded-xl items-center"
              style={{ backgroundColor: COLORS.primary }}
              onPress={() => handleAccept(item)}
            >
              <Text className="text-base font-semibold text-white">Accept</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center px-6 pt-4 pb-4">
        <Pressable
          className="w-10 h-10 rounded-xl bg-white items-center justify-center mr-3"
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={18} color="#525252" />
        </Pressable>
        <Text className="text-2xl font-bold text-gray-900 tracking-tight">Group Invites</Text>
      </View>

      <FlatList
        data={invites}
        keyExtractor={(item) => item.id}
        renderItem={renderInvite}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-24">
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <View className="items-center py-24 px-8">
              <View className="w-16 h-16 rounded-2xl bg-white items-center justify-center mb-5">
                <Feather name="mail" size={28} color="#D4D4D4" />
              </View>
              <Text className="text-base font-semibold text-gray-400">No pending invites</Text>
              <Text className="text-base text-gray-300 text-center mt-2 leading-5">
                When someone invites you to a group, it'll show up here.
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
