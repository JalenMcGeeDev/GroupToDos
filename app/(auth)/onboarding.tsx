import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/auth-store';
import { COLORS } from '../../constants';
import { useAlert } from '../../components/AlertProvider';

export default function OnboardingScreen() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const { showAlert } = useAlert();
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const signOut = useAuthStore((s) => s.signOut);

  const handleContinue = async () => {
    const trimmed = username.trim().toLowerCase();

    if (trimmed.length < 3) {
      showAlert({ title: 'Too short', message: 'Username must be at least 3 characters.', icon: 'alert-circle' });
      return;
    }
    if (trimmed.length > 24) {
      showAlert({ title: 'Too long', message: 'Username must be 24 characters or less.', icon: 'alert-circle' });
      return;
    }
    if (!/^[a-z0-9._]+$/.test(trimmed)) {
      showAlert({ title: 'Invalid', message: 'Only lowercase letters, numbers, dots, and underscores.', icon: 'alert-circle' });
      return;
    }

    setLoading(true);
    try {
      await updateProfile({ display_name: trimmed, onboarding_completed: true });
    } catch (err: any) {
      showAlert({ title: 'Error', message: err.message ?? 'Something went wrong.', icon: 'alert-circle' });
    }
    setLoading(false);
    // Navigation handled by auth gate detecting onboarding_completed
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 px-7 pt-24 pb-12">
        <View className="mb-10">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center mb-6"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Feather name="user" size={28} color="#FFF" />
          </View>
          <Text className="text-3xl font-bold text-gray-900 tracking-tight">Pick a username</Text>
          <Text className="text-base text-gray-400 mt-2 leading-6">
            This is how others will find you
          </Text>
        </View>

        {/* Username Input */}
        <View className="mb-8">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Username
          </Text>
          <View className="flex-row items-center border-b border-gray-200 pb-3">
            <Text className="text-base text-gray-300 mr-1">@</Text>
            <TextInput
              className="flex-1 text-base text-gray-900"
              placeholder="yourname"
              placeholderTextColor="#D4D4D4"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
              maxLength={24}
              autoFocus
            />
          </View>
          <Text className="text-xs text-gray-300 mt-2">
            Letters, numbers, dots, and underscores only
          </Text>
        </View>

        {/* Continue Button */}
        <Pressable
          className="rounded-2xl py-4 items-center"
          style={{
            backgroundColor:
              loading || username.trim().length < 3 ? COLORS.primaryLight : COLORS.primary,
          }}
          onPress={handleContinue}
          disabled={loading || username.trim().length < 3}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text className="text-white text-base font-semibold tracking-wide">Continue</Text>
          )}
        </Pressable>

        <View className="mt-auto items-center pb-4">
          <Pressable onPress={() => signOut()}>
            <Text className="text-base text-gray-400">Log out</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
