import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as ExpoImagePicker from 'expo-image-picker';

const isExpoGo = Constants.executionEnvironment === 'storeClient';
const CROP_THEME = { cropperToolbarColor: '#C15F3C', cropperToolbarWidgetColor: '#FFFFFF', cropperTitleColor: '#FFFFFF' };
import { decode } from 'base64-arraybuffer';
import { useAuthStore } from '../../stores/auth-store';
import { supabase } from '../../lib/supabase';
import { COLORS, CADENCE_LABELS } from '../../constants';
import { useAlert } from '../../components/AlertProvider';
import { useMyGoals } from '../../hooks/use-my-goals';
import { useGroups } from '../../hooks/use-groups';
import { usePreferencesStore } from '../../stores/preferences-store';
import { CELEBRATION_SOUNDS, DEFAULT_SOUND_KEY } from '../../constants/celebration-sounds';
import type { CelebrationSoundKey } from '../../constants/celebration-sounds';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type { CheckinCadence } from '../../lib/types';

const CADENCE_OPTIONS: CheckinCadence[] = ['daily', 'every_2_days', 'every_3_days', 'weekly'];

export default function ProfileScreen() {
  const { profile, user, updateProfile, signOut } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: goals } = useMyGoals();
  const { data: groups } = useGroups();

  const [editing, setEditing] = useState(false);
  const [streakModalOpen, setStreakModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { showAlert } = useAlert();
  const celebrationSound = usePreferencesStore((s) => s.celebrationSound);
  const setCelebrationSound = usePreferencesStore((s) => s.setCelebrationSound);
  const previewSoundRef = useRef<AudioPlayer | null>(null);

  const handleSoundSelect = (key: CelebrationSoundKey) => {
    // Stop any currently previewing sound
    if (previewSoundRef.current) {
      try {
        previewSoundRef.current.remove();
      } catch {}
      previewSoundRef.current = null;
    }

    setCelebrationSound(key);

    // Preview the sound
    const entry = CELEBRATION_SOUNDS.find((s) => s.key === key);
    if (entry) {
      try {
        const player = createAudioPlayer(entry.source);
        previewSoundRef.current = player;
        player.volume = 0.8;
        player.play();
        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            player.remove();
            previewSoundRef.current = null;
          }
        });
      } catch {}
    }
  };

  const completedGoals = goals?.filter((g) => g.status === 'completed').length ?? 0;
  const activeGoals = goals?.filter((g) => g.status === 'active').length ?? 0;
  const groupCount = groups?.length ?? 0;

  const memberSince = profile
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const handlePickPhoto = async () => {
    let pickedUri: string | null = null;
    let pickedBase64: string | null = null;

    if (isExpoGo) {
      const picked = await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        quality: 0.7,
        base64: true,
      });
      if (picked.canceled || !picked.assets[0]) return;
      pickedUri = picked.assets[0].uri;
      pickedBase64 = picked.assets[0].base64 ?? null;
    } else {
      try {
        const ImageCropPicker = require('react-native-image-crop-picker').default;
        const result = await ImageCropPicker.openPicker({
          mediaType: 'photo',
          cropping: true,
          width: 400,
          height: 400,
          quality: 0.7,
          includeBase64: true,
          ...CROP_THEME,
        });
        pickedUri = result.path;
        pickedBase64 = result.data ?? null;
      } catch {
        return;
      }
    }

    if (!pickedUri) return;

    setUploadingPhoto(true);
    try {
      const ext = pickedUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
      const filePath = `${user!.id}/avatar.${ext}`;

      const base64 = pickedBase64;
      if (!base64) throw new Error('Could not read image data');

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, decode(base64), { upsert: true, contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatar_url = `${urlData.publicUrl}?t=${Date.now()}`;

      await updateProfile({ avatar_url });
    } catch (e: any) {
      showAlert({
        title: 'Upload failed',
        message: e.message ?? 'Could not upload photo. Please try again.',
        icon: 'alert-circle',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setSavingProfile(true);
    await updateProfile({ display_name: displayName.trim() });
    setSavingProfile(false);
    setEditing(false);
  };

  const handleCadenceChange = async (cadence: CheckinCadence) => {
    // Keep streak but reset the window so the new cadence starts fresh from today
    await updateProfile({
      checkin_cadence: cadence,
      last_action_date: new Date().toISOString().split('T')[0],
    });
  };

  const handleSignOut = () => {
    showAlert({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      icon: 'log-out',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ],
    });
  };
  const confirmDeleteAccount = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete account');
      }

      await signOut();
    } catch (err: any) {
      showAlert({ title: 'Error', message: err.message ?? 'Could not delete account.', icon: 'alert-circle' });
    }
  };

  const handleDeleteAccount = () => {
    showAlert({
      title: 'Delete Account',
      message:
        'This will permanently delete your account and all your goals. Your groups will be transferred to another member, or deleted if you are the only one.',
      icon: 'trash-2',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            showAlert({
              title: 'Are you absolutely sure?',
              message: 'This cannot be undone. Your account will be permanently deleted.',
              icon: 'alert-circle',
              buttons: [
                { text: 'Go back', style: 'cancel' },
                { text: 'Delete my account', style: 'destructive', onPress: confirmDeleteAccount },
              ],
            }),
        },
      ],
    });
  };
  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const cadenceMultiplier = profile.checkin_cadence === 'weekly' ? 7 : profile.checkin_cadence === 'every_3_days' ? 3 : profile.checkin_cadence === 'every_2_days' ? 2 : 1;
  const eqDays = profile.streak_current * cadenceMultiplier;
  const flameColor =
    eqDays >= 30
      ? '#EF4444'
      : eqDays >= 7
        ? '#F59E0B'
        : '#FB923C';

  const streakLabel = profile.checkin_cadence === 'weekly'
    ? 'Week streak'
    : profile.checkin_cadence === 'every_2_days' || profile.checkin_cadence === 'every_3_days'
      ? 'Check-in streak'
      : 'Day streak';

  // Streak modal: "no check-in due" state
  const todayStr = new Date().toISOString().split('T')[0];
  const checkedInToday = profile.last_action_date === todayStr;
  const checkinDueDays = cadenceMultiplier;
  const nextDueDate = (() => {
    if (!profile.last_action_date) return todayStr;
    const last = new Date(profile.last_action_date);
    last.setDate(last.getDate() + checkinDueDays);
    return last.toISOString().split('T')[0];
  })();
  const checkinDueToday = !checkedInToday && nextDueDate <= todayStr;
  const noCheckinDue = !checkinDueToday;
  const nextDueDateFormatted = new Date(nextDueDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
        {/* Profile Header Card */}
        <View className="bg-white px-6 pt-5 pb-7">
          <Text className="text-2xl font-bold text-gray-900 tracking-tight mb-6">Profile</Text>

          <View className="items-center">
            {/* Avatar */}
            <Pressable onPress={handlePickPhoto} className="relative mb-4">
              <View className="w-24 h-24 rounded-full items-center justify-center overflow-hidden" style={{ backgroundColor: COLORS.primary + '12' }}>
                {uploadingPhoto ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : profile.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    className="w-24 h-24 rounded-full"
                  />
                ) : (
                  <Text className="text-3xl font-bold" style={{ color: COLORS.primary }}>
                    {profile.display_name.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.primary, borderWidth: 3, borderColor: '#fff' }}
              >
                <Feather name="camera" size={12} color="#fff" />
              </View>
            </Pressable>

            {/* Name */}
            {editing ? (
              <View className="flex-row items-center mt-1">
                <TextInput
                  className="border-b-2 py-1.5 text-lg font-bold text-gray-900 text-center min-w-[160px]"
                  style={{ borderBottomColor: COLORS.primary }}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoFocus
                />
                <Pressable
                  className="ml-3 w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: COLORS.primary }}
                  onPress={handleSave}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Feather name="check" size={14} color="#FFF" />
                  )}
                </Pressable>
                <Pressable
                  className="ml-1.5 w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
                  onPress={() => {
                    setEditing(false);
                    setDisplayName(profile.display_name);
                  }}
                >
                  <Feather name="x" size={14} color="#737373" />
                </Pressable>
              </View>
            ) : (
              <Pressable className="flex-row items-center mt-1" onPress={() => setEditing(true)}>
                <Text className="text-xl font-bold text-gray-900 tracking-tight">
                  {profile.display_name}
                </Text>
                <Feather name="edit-2" size={13} color="#D4D4D4" className="ml-2" />
              </Pressable>
            )}

            {/* Member since */}
            <Text className="text-base text-gray-400 mt-1">Member since {memberSince}</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View className="flex-row mx-5 mt-4 bg-white rounded-2xl p-1" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
          <StatCard
            icon="zap"
            iconColor={flameColor}
            value={profile.streak_current}
            label={streakLabel}
            sublabel={`Best: ${profile.streak_longest}`}
            onPress={() => setStreakModalOpen(true)}
          />
          <View className="w-px bg-gray-100 my-3" />
          <StatCard
            icon="target"
            iconColor={COLORS.primary}
            value={activeGoals}
            label="Active"
            sublabel={`${completedGoals} done`}
          />
          <View className="w-px bg-gray-100 my-3" />
          <StatCard
            icon="users"
            iconColor={COLORS.accent}
            value={groupCount}
            label={groupCount === 1 ? 'Group' : 'Groups'}
          />
        </View>

        {/* Check-in Cadence */}
        <View className="mx-5 mt-4">
          <SectionHeader icon="clock" title="Check-in Reminder" />
          <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
            <Text className="text-xs text-gray-400 mb-3">How often do you want to receive a check-in notification?</Text>
            <View className="flex-row flex-wrap gap-2">
              {CADENCE_OPTIONS.map((cadence) => {
                const isActive = profile.checkin_cadence === cadence;
                return (
                  <Pressable
                    key={cadence}
                    onPress={() => handleCadenceChange(cadence)}
                    className="rounded-xl px-4 py-2.5"
                    style={{
                      backgroundColor: isActive ? COLORS.primary + '12' : '#F5F5F5',
                      borderWidth: 1.5,
                      borderColor: isActive ? COLORS.primary : 'transparent',
                    }}
                  >
                    <Text
                      className="text-base font-semibold"
                      style={{ color: isActive ? COLORS.primary : '#737373' }}
                    >
                      {CADENCE_LABELS[cadence]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Celebration Sound */}
        <View className="mx-5 mt-4">
          <SectionHeader icon="volume-2" title="Celebration Sound" />
          <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
            <Text className="text-xs text-gray-400 mb-3">
              Plays when you complete a goal. Tap to preview.
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CELEBRATION_SOUNDS.map((s) => {
                const isActive = celebrationSound === s.key;
                const isDefault = s.key === DEFAULT_SOUND_KEY;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => handleSoundSelect(s.key)}
                    className="rounded-xl px-4 py-2.5"
                    style={{
                      backgroundColor: isActive ? COLORS.primary + '12' : '#F5F5F5',
                      borderWidth: 1.5,
                      borderColor: isActive ? COLORS.primary : 'transparent',
                    }}
                  >
                    <Text
                      className="text-base font-semibold"
                      style={{ color: isActive ? COLORS.primary : '#737373' }}
                    >
                      {s.label}{isDefault ? ' (Default)' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Account Section */}
        <View className="mx-5 mt-4">
          <SectionHeader icon="user" title="Account" />
          <View className="bg-white rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
            <SettingsRow
              icon="phone"
              label="Phone"
              value={user?.phone ?? 'Not set'}
            />
            <View className="h-px bg-gray-50 mx-4" />
            <SettingsRow
              icon="calendar"
              label="Joined"
              value={memberSince}
            />
          </View>
        </View>

        {/* Sign Out */}
        <View className="mx-5 mt-6">
          <Pressable
            className="py-4 flex-row items-center justify-center rounded-2xl bg-white"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.03,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 1,
              borderWidth: 1,
              borderColor: '#FEE2E2',
            }}
            onPress={handleSignOut}
          >
            <Feather name="log-out" size={16} color="#EF4444" />
            <Text className="font-semibold text-base ml-2" style={{ color: '#EF4444' }}>
              Sign Out
            </Text>
          </Pressable>
        </View>

        {/* Delete Account */}
        <View className="mx-5 mt-3 mb-2">
          <Pressable
            className="py-4 flex-row items-center justify-center rounded-2xl"
            onPress={handleDeleteAccount}
          >
            <Feather name="trash-2" size={14} color="#A3A3A3" />
            <Text className="text-sm font-medium ml-1.5" style={{ color: '#A3A3A3' }}>
              Delete Account
            </Text>
          </Pressable>
        </View>

        {/* Version */}
        <Text style={{ textAlign: 'center', fontSize: 11, color: '#C7C0BA', marginBottom: 8 }}>
          v{Constants.expoConfig?.version ?? '—'}{Updates.updateId ? ` (${Updates.updateId.slice(0, 8)})` : ''}
        </Text>
      </ScrollView>

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
          <Pressable className="bg-white rounded-2xl p-6 mx-8 w-full max-w-sm" onPress={() => {}}>
            <View className="items-center mb-4">
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: flameColor + '15' }}
              >
                <Feather name="zap" size={24} color={flameColor} />
              </View>
              <Text className="text-lg font-bold text-gray-900">Your Streak</Text>
            </View>

            {noCheckinDue ? (
              <>
                <Text className="text-2xl font-bold text-center text-gray-900 mb-1">
                  No check-in due today
                </Text>
                <Text className="text-sm text-gray-400 text-center mb-5">
                  {checkedInToday
                    ? "You've already checked in today — great work!"
                    : "You're on track. Keep it up!"}
                </Text>
                <View className="bg-gray-50 rounded-xl py-3 px-4 items-center mb-5">
                  <Text className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Next check-in</Text>
                  <Text className="text-base font-semibold text-gray-800">{nextDueDateFormatted}</Text>
                </View>
              </>
            ) : (
              <>
                <Text className="text-base text-gray-500 text-center leading-5 mb-1">
                  Your streak counts consecutive check-ins based on your cadence (currently:{' '}
                  <Text className="font-semibold text-gray-700">
                    {CADENCE_LABELS[profile?.checkin_cadence ?? 'daily']?.toLowerCase() ?? 'daily'}
                  </Text>
                  ).
                </Text>
                <Text className="text-base text-gray-500 text-center leading-5 mb-3">
                  Complete today's check-in before midnight to keep your streak going!
                </Text>
                <View className="bg-orange-50 rounded-xl py-3 px-4 items-center mb-5">
                  <Text className="text-xs text-orange-400 uppercase tracking-wider mb-0.5">Due by</Text>
                  <Text className="text-base font-semibold text-orange-700">Tonight at 11:59 PM</Text>
                </View>
              </>
            )}

            <Text className="text-xs text-gray-400 text-center mb-4">
              Adjust your check-in cadence in the settings below.
            </Text>
            <Pressable
              className="py-2.5 items-center"
              onPress={() => setStreakModalOpen(false)}
            >
              <Text className="text-base font-semibold" style={{ color: COLORS.primary }}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ─── Small helper components ─── */

function StatCard({
  icon,
  iconColor,
  value,
  label,
  sublabel,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  value: number;
  label: string;
  sublabel?: string;
  onPress?: () => void;
}) {
  const content = (
    <View className="flex-1 items-center py-4">
      <View
        className="w-9 h-9 rounded-xl items-center justify-center mb-2"
        style={{ backgroundColor: iconColor + '15' }}
      >
        <Feather name={icon} size={16} color={iconColor} />
      </View>
      <Text className="text-xl font-bold text-gray-900">{value}</Text>
      <Text className="text-xs text-gray-400 mt-0.5">{label}</Text>
      {sublabel && <Text className="text-[10px] text-gray-300 mt-0.5">{sublabel}</Text>}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={{ flex: 1 }}>{content}</Pressable> : content;
}

function SectionHeader({ icon, title }: { icon: keyof typeof Feather.glyphMap; title: string }) {
  return (
    <View className="flex-row items-center mb-2 ml-1">
      <Feather name={icon} size={13} color="#A3A3A3" />
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1.5">
        {title}
      </Text>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center px-4 py-3.5">
      <View className="w-8 h-8 rounded-lg bg-gray-50 items-center justify-center mr-3">
        <Feather name={icon} size={14} color="#A3A3A3" />
      </View>
      <Text className="text-base text-gray-500 flex-1">{label}</Text>
      <Text className="text-base font-medium text-gray-900">{value}</Text>
    </View>
  );
}
