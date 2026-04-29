import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  FlatList,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useGroups, useLeaveGroup, useUpdateGroup } from '../../hooks/use-groups';
import { useAuthStore } from '../../stores/auth-store';
import { StreakIndicator } from '../../components/StreakIndicator';
import { COLORS, CADENCE_LABELS } from '../../constants';
import { useAlert } from '../../components/AlertProvider';
import { supabase } from '../../lib/supabase';
import { decode } from 'base64-arraybuffer';
import * as ExpoImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import type { GroupWithDetails, GroupMember } from '../../lib/types';

// 10 curated Unsplash stock photos used as default group covers.
// Assigned deterministically from group.id so each group gets a consistent image.
const STOCK_COVERS = [
  'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80', // purple/pink gradient
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', // mountain lake
  'https://images.unsplash.com/photo-1518066000714-58c45f1a2c0a?w=800&q=80', // night sky
  'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&q=80', // forest
  'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&q=80', // ocean
  'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=80', // city night
  'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80', // desert dunes
  'https://images.unsplash.com/photo-1490750967868-88df5691cc48?w=800&q=80', // flowers
  'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80', // geometric gradient
  'https://images.unsplash.com/photo-1511300636408-a63a89df3482?w=800&q=80', // sunrise
];

function getCoverImage(group: GroupWithDetails): string {
  if (group.cover_image) return group.cover_image;
  // Simple deterministic hash of group.id → stock image
  let hash = 0;
  for (let i = 0; i < group.id.length; i++) {
    hash = (hash * 31 + group.id.charCodeAt(i)) >>> 0;
  }
  return STOCK_COVERS[hash % STOCK_COVERS.length];
}

const LABELED_STOCK_COVERS = [
  { url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80', label: 'Gradient' },
  { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', label: 'Mountains' },
  { url: 'https://images.unsplash.com/photo-1518066000714-58c45f1a2c0a?w=800&q=80', label: 'Night Sky' },
  { url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&q=80', label: 'Forest' },
  { url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&q=80', label: 'Ocean' },
  { url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=80', label: 'City Night' },
  { url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80', label: 'Desert' },
  { url: 'https://images.unsplash.com/photo-1490750967868-88df5691cc48?w=800&q=80', label: 'Flowers' },
  { url: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80', label: 'Abstract' },
  { url: 'https://images.unsplash.com/photo-1511300636408-a63a89df3482?w=800&q=80', label: 'Sunrise' },
];

const isExpoGo = Constants.executionEnvironment === 'storeClient';
const CROP_THEME = { cropperToolbarColor: '#C15F3C', cropperToolbarWidgetColor: '#FFFFFF', cropperTitleColor: '#FFFFFF' };

export default function GroupsScreen() {
  const router = useRouter();
  const { data: groups, isLoading, refetch } = useGroups();
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);
  const [streakModalOpen, setStreakModalOpen] = useState(false);

  // Long-press action sheet state
  const [selectedGroup, setSelectedGroup] = useState<GroupWithDetails | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [stockPickerOpen, setStockPickerOpen] = useState(false);
  const [showStockGrid, setShowStockGrid] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const leaveGroup = useLeaveGroup();
  const updateGroup = useUpdateGroup();
  const { showAlert } = useAlert();

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleInvite = useCallback((group: GroupWithDetails) => {
    router.push(`/group/${group.id}?invite=1`);
  }, [router]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (!trimmed || !selectedGroup || trimmed === selectedGroup.name) {
      setRenameOpen(false);
      return;
    }
    updateGroup.mutate(
      { groupId: selectedGroup.id, name: trimmed },
      {
        onSuccess: () => setRenameOpen(false),
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      }
    );
  };

  const handlePickStock = (url: string) => {
    if (!selectedGroup) return;
    setStockPickerOpen(false);
    setShowStockGrid(false);
    updateGroup.mutate(
      { groupId: selectedGroup.id, cover_image: url },
      {
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      }
    );
  };

  const handleChangePhotoUpload = async () => {
    if (!selectedGroup) return;
    let pickedUri: string | null = null;
    let pickedBase64: string | null = null;

    if (isExpoGo) {
      const picked = await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9] as [number, number],
        quality: 0.75,
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
          width: 1200,
          height: 675,
          quality: 0.75,
          includeBase64: true,
          ...CROP_THEME,
        });
        pickedUri = result.path;
        pickedBase64 = result.data ?? null;
      } catch {
        return;
      }
    }

    if (!pickedUri || !pickedBase64) return;

    setUploadingCover(true);
    try {
      const ext = pickedUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
      const filePath = `${selectedGroup.id}/cover.${ext}`;
      const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('group-covers')
        .upload(filePath, decode(pickedBase64), { upsert: true, contentType });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('group-covers').getPublicUrl(filePath);
      const cover_image = `${urlData.publicUrl}?t=${Date.now()}`;

      updateGroup.mutate(
        { groupId: selectedGroup.id, cover_image },
        {
          onError: (err) => showAlert({ title: 'Upload failed', message: err.message, icon: 'alert-circle' }),
        }
      );
    } catch (e: any) {
      showAlert({ title: 'Upload failed', message: e.message ?? 'Could not upload photo.', icon: 'alert-circle' });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleLeave = () => {
    if (!selectedGroup) return;
    const isOwner = selectedGroup.created_by === user?.id;
    showAlert({
      title: 'Leave Group',
      message: isOwner
        ? 'You are the owner. The longest-standing member will automatically become the new owner. Are you sure you want to leave?'
        : 'Are you sure you want to leave this group?',
      icon: 'log-out',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            leaveGroup.mutate(
              { groupId: selectedGroup.id },
              {
                onSuccess: () => { setSheetOpen(false); refetch(); },
                onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
              }
            );
          },
        },
      ],
    });
  };

  const renderAvatarStack = (members: GroupMember[], maxShow = 4) => {
    const shown = members.slice(0, maxShow);
    const overflow = members.length - maxShow;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {shown.map((member, index) => (
          <View key={member.user_id} style={{ marginLeft: index === 0 ? 0 : -8, zIndex: maxShow - index }}>
            {member.profile?.avatar_url ? (
              <Image
                source={{ uri: member.profile.avatar_url }}
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' }}
              />
            ) : (
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>
                  {member.profile?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
          </View>
        ))}
        {overflow > 0 && (
          <View style={{ marginLeft: -8, zIndex: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>+{overflow}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderGroupCard = ({ item }: { item: GroupWithDetails }) => {
    const coverUri = getCoverImage(item);
    return (
      <Pressable
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
        onPress={() => router.push(`/group/${item.id}`)}
        onLongPress={() => {
          setSelectedGroup(item);
          setSheetOpen(true);
        }}
        delayLongPress={400}
      >
        <View style={{ borderRadius: 24, overflow: 'hidden', height: 200, marginBottom: 16 }}>
        <ImageBackground
          source={{ uri: coverUri }}
          style={{ flex: 1 }}
          resizeMode="cover"
        >
          {/* Full-card dark scrim so text is always legible */}
          <LinearGradient
            colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.78)']}
            locations={[0, 0.5, 1]}
            style={{ flex: 1, justifyContent: 'space-between', padding: 18 }}
          >
            {/* Top row: avatar stack */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              {renderAvatarStack(item.members)}
              {/* Active goals badge */}
              <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="target" size={11} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
                  {item.active_goals.length} goal{item.active_goals.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {/* Bottom row: name + member count + invite */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: -0.4, lineHeight: 24 }} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 3, fontWeight: '500' }}>
                  {item.members.length} member{item.members.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <Pressable
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.3)',
                }}
                onPress={(e) => {
                  e.stopPropagation();
                  handleInvite(item);
                }}
              >
                <MaterialIcons name="person-add-alt" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 5 }}>Invite</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </ImageBackground>
        </View>
      </Pressable>
    );
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
              Your Groups
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
                onPress={() => router.push('/create-group')}
              >
                <Feather name="plus" size={18} color="#525252" />
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Groups List */}
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroupCard}
        className="bg-gray-50"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 96 }}>
              <Text style={{ color: COLORS.textTertiary, fontSize: 16 }}>Loading...</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 96, paddingHorizontal: 32 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Feather name="users" size={28} color={COLORS.textTertiary} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.textTertiary }}>No groups yet</Text>
              <Text style={{ fontSize: 15, color: COLORS.textTertiary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                Create a group or join one with an invite code to get started.
              </Text>
            </View>
          )
        }
      />

      {/* Group Actions Bottom Sheet */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setSheetOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 12,
              paddingBottom: 32,
            }}
            onPress={() => {}}
          >
            {/* Handle bar */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 }} />
            {/* Group name */}
            {selectedGroup && (
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#6B7280', textAlign: 'center', marginBottom: 16, paddingHorizontal: 20 }} numberOfLines={1}>
                {selectedGroup.name}
              </Text>
            )}
            {/* Admin-only actions */}
            {selectedGroup?.created_by === user?.id && (
              <>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}
                  onPress={() => {
                    setSheetOpen(false);
                    setRenameValue(selectedGroup?.name ?? '');
                    setRenameOpen(true);
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    <Feather name="edit-2" size={18} color="#374151" />
                  </View>
                  <Text style={{ fontSize: 17, fontWeight: '500', color: '#111827' }}>Rename Group</Text>
                </Pressable>

                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}
                  onPress={() => { setSheetOpen(false); setStockPickerOpen(true); }}
                  disabled={uploadingCover}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    {uploadingCover
                      ? <ActivityIndicator size="small" color={COLORS.primary} />
                      : <Feather name="image" size={18} color="#374151" />
                    }
                  </View>
                  <Text style={{ fontSize: 17, fontWeight: '500', color: '#111827' }}>
                    {uploadingCover ? 'Uploading…' : 'Change Group Photo'}
                  </Text>
                </Pressable>

                <View style={{ height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 24, marginVertical: 4 }} />
              </>
            )}
            {/* Leave Group – visible to all */}
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}
              onPress={() => { setSheetOpen(false); handleLeave(); }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                <Feather name="log-out" size={18} color="#EF4444" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '500', color: '#EF4444' }}>Leave Group</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename Group Modal */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameOpen(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setRenameOpen(false)}>
            <Pressable
              style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, marginHorizontal: 32, width: '88%' }}
              onPress={() => {}}
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 }}>Rename Group</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 16 }}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Group name"
                autoFocus
                maxLength={50}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Pressable style={{ paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 }} onPress={() => setRenameOpen(false)}>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: '#9CA3AF' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={{ backgroundColor: '#111827', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 12 }}
                  onPress={handleRenameSubmit}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Group Photo Modal */}
      <Modal
        visible={stockPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => { setStockPickerOpen(false); setShowStockGrid(false); }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          onPress={() => { setStockPickerOpen(false); setShowStockGrid(false); }}
        >
          <Pressable
            style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 32 }}
            onPress={() => {}}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
              {showStockGrid && (
                <Pressable
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
                  onPress={() => setShowStockGrid(false)}
                >
                  <Feather name="arrow-left" size={16} color="#525252" />
                </Pressable>
              )}
              <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' }}>
                {showStockGrid ? 'Stock Photos' : 'Change Group Photo'}
              </Text>
              <Pressable
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
                onPress={() => { setStockPickerOpen(false); setShowStockGrid(false); }}
              >
                <Feather name="x" size={16} color="#525252" />
              </Pressable>
            </View>
            {showStockGrid ? (
              <FlatList
                data={LABELED_STOCK_COVERS}
                keyExtractor={(item) => item.url}
                numColumns={2}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                columnWrapperStyle={{ gap: 12 }}
                renderItem={({ item }) => {
                  const tileWidth = (Dimensions.get('window').width - 32 - 12) / 2;
                  const isSelected = selectedGroup?.cover_image === item.url;
                  return (
                    <Pressable
                      onPress={() => handlePickStock(item.url)}
                      style={{ width: tileWidth, height: tileWidth * 0.5625, borderRadius: 14, overflow: 'hidden', borderWidth: isSelected ? 3 : 0, borderColor: COLORS.primary }}
                    >
                      <Image source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      {isSelected && (
                        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: COLORS.primary, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="check" size={14} color="#fff" />
                        </View>
                      )}
                      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{item.label}</Text>
                      </View>
                    </Pressable>
                  );
                }}
              />
            ) : (
              <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
                <Pressable
                  onPress={() => setShowStockGrid(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#F3F4F6' }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FBF1EB', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    <Feather name="grid" size={20} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Stock Photos</Text>
                    <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Pick from a curated collection</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#9CA3AF" />
                </Pressable>
                <Pressable
                  onPress={() => { setStockPickerOpen(false); setShowStockGrid(false); handleChangePhotoUpload(); }}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#F3F4F6' }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FBF1EB', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    <Feather name="upload" size={20} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Upload from Gallery</Text>
                    <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Use a photo from your camera roll</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#9CA3AF" />
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
