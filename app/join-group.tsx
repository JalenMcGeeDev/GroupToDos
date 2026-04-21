import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useJoinGroup } from '../hooks/use-groups';
import { COLORS } from '../constants';
import { useAlert } from '../components/AlertProvider';

export default function JoinGroupScreen() {
  const router = useRouter();
  const joinGroup = useJoinGroup();
  const [inviteCode, setInviteCode] = useState('');
  const { showAlert } = useAlert();

  const handleJoin = () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      showAlert({ title: 'Error', message: 'Please enter an invite code.', icon: 'alert-circle' });
      return;
    }

    joinGroup.mutate(
      { inviteCode: code },
      {
        onSuccess: (result) => {
          if (result?.group_id) {
            router.replace(`/group/${result.group_id}` as any);
          } else {
            showAlert({ title: 'Joined!', message: 'You have joined the group.', icon: 'check-circle' });
            router.back();
          }
        },
        onError: (err) => {
          showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' });
        },
      }
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center px-6 pt-4 pb-5">
        <Pressable
          className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center mr-3"
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={18} color="#525252" />
        </Pressable>
        <Text className="text-xl font-bold text-gray-900 tracking-tight">Join Group</Text>
      </View>

      <View className="px-6 mt-8">
        <View className="items-center mb-10">
          <View className="w-16 h-16 rounded-2xl bg-primary-50 items-center justify-center mb-5">
            <Feather name="log-in" size={28} color={COLORS.primary} />
          </View>
          <Text className="text-base text-gray-400 text-center px-6 leading-5">
            Enter the invite code shared by a group member to join their group.
          </Text>
        </View>

        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Invite Code</Text>
        <TextInput
          className="border-b-2 border-gray-200 py-3 text-center text-2xl font-bold text-gray-900 tracking-[0.3em] mb-8"
          placeholder="ABCDEF"
          placeholderTextColor="#E5E5E5"
          autoCapitalize="characters"
          maxLength={8}
          value={inviteCode}
          onChangeText={setInviteCode}
        />

        <Pressable
          className="rounded-2xl py-4 items-center"
          style={{
            backgroundColor: joinGroup.isPending ? COLORS.primaryLight : COLORS.primary,
          }}
          onPress={handleJoin}
          disabled={joinGroup.isPending}
        >
          {joinGroup.isPending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text className="text-white text-base font-semibold tracking-wide">Join Group</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
