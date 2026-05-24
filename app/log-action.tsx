import React, { useState } from 'react';
import * as Sentry from '@sentry/react-native';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as ExpoImagePicker from 'expo-image-picker';

const isExpoGo = Constants.executionEnvironment === 'storeClient';
const CROP_THEME = { cropperToolbarColor: '#C15F3C', cropperToolbarWidgetColor: '#FFFFFF', cropperTitleColor: '#FFFFFF' };
import { useGoal } from '../hooks/use-goals';
import { useLogAction } from '../hooks/use-activity';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import { COLORS } from '../constants';
import { useAlert } from '../components/AlertProvider';
import { useAddGoalPhoto } from '../hooks/use-goal-gallery';
import type { SubGoal } from '../lib/types';

export default function LogActionScreen() {
  const { goalId, groupId } = useLocalSearchParams<{ goalId: string; groupId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { data: goal } = useGoal(goalId!);
  const logAction = useLogAction();

  const [selectedSubGoal, setSelectedSubGoal] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { showAlert } = useAlert();

  // Gallery prompt state (shown after successful check-in, only for goal creator)
  const [showGalleryPrompt, setShowGalleryPrompt] = useState(false);
  const [galleryImageUri, setGalleryImageUri] = useState<string | null>(null);
  const addGalleryPhoto = useAddGoalPhoto(goalId ?? undefined);

  const allSubGoals = goal ? flattenSubGoals(goal.sub_goals ?? []) : [];
  const leafSubGoals = allSubGoals.filter(
    (sg) => !sg.children?.length || sg.children.length === 0
  );

  const handlePickImage = async () => {
    if (isExpoGo) {
      const picked = await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
      });
      if (!picked.canceled && picked.assets[0]) setImageUri(picked.assets[0].uri);
    } else {
      try {
        const ImageCropPicker = require('react-native-image-crop-picker').default;
        const result = await ImageCropPicker.openPicker({
          mediaType: 'photo',
          cropping: true,
          freeStyleCropEnabled: true,
          quality: 0.7,
          ...CROP_THEME,
        });
        setImageUri(result.path);
      } catch { /* cancelled */ }
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    if (!user) return null;

    const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
    const fileName = `${user.id}/${Date.now()}.${ext}`;

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from('action-media')
      .upload(fileName, blob, { contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` });

    if (error) {
      console.error('Upload error:', error);
      Sentry.captureException(new Error(`action-media upload: ${error.message}`), { tags: { context: 'logActionUpload' } });
      return null;
    }

    const { data } = supabase.storage.from('action-media').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!selectedSubGoal) {
      showAlert({ title: 'Error', message: 'Please select which item you worked on.', icon: 'alert-circle' });
      return;
    }

    setUploading(true);

    let mediaUrl: string | undefined;
    if (imageUri) {
      const url = await uploadImage(imageUri);
      if (url) mediaUrl = url;
    }

    logAction.mutate(
      {
        subGoalId: selectedSubGoal,
        note: note.trim() || undefined,
        mediaUrl,
      },
      {
        onSuccess: () => {
          setUploading(false);
          // If goal creator, prompt to add a gallery photo
          if (user && goal && user.id === goal.created_by) {
            setShowGalleryPrompt(true);
          } else {
            showAlert({
              title: 'Logged! \uD83C\uDF89',
              message: 'Great job! Your action has been recorded.',
              icon: 'check-circle',
              buttons: [{ text: 'OK', onPress: () => router.back() }],
            });
          }
        },
        onError: (err) => {
          setUploading(false);
          showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' });
        },
      }
    );
  };

  const isSubmitting = logAction.isPending || uploading;

  const handlePickGalleryImage = async () => {
    if (isExpoGo) {
      const picked = await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
      });
      if (!picked.canceled && picked.assets[0]) setGalleryImageUri(picked.assets[0].uri);
    } else {
      try {
        const ImageCropPicker = require('react-native-image-crop-picker').default;
        const result = await ImageCropPicker.openPicker({
          mediaType: 'photo',
          cropping: true,
          freeStyleCropEnabled: true,
          quality: 0.8,
          ...CROP_THEME,
        });
        setGalleryImageUri(result.path);
      } catch { /* cancelled */ }
    }
  };

  const handleSubmitGalleryPhoto = async () => {
    if (!galleryImageUri) {
      router.back();
      return;
    }
    addGalleryPhoto.mutate(galleryImageUri, {
      onSuccess: () => {
        setShowGalleryPrompt(false);
        router.back();
      },
      onError: (err) => {
        showAlert({ title: 'Upload failed', message: err.message, icon: 'alert-circle' });
      },
    });
  };

  const handleSkipGallery = () => {
    setShowGalleryPrompt(false);
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center px-6 pt-3 pb-4">
        <Pressable
          className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center mr-3"
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={18} color="#525252" />
        </Pressable>
        <Text className="text-xl font-bold text-gray-900 tracking-tight">Log Action</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}>
        {/* Goal Title */}
        {goal && (
          <View className="bg-primary-50/50 rounded-2xl p-4 mb-5 flex-row items-center">
            <Feather name="target" size={16} color={COLORS.primary} />
            <Text className="text-base font-medium ml-2.5" style={{ color: COLORS.primary }}>
              {goal.title}
            </Text>
          </View>
        )}

        {/* Sub-goal Selection */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">What did you work on? *</Text>
        <View className="mb-5">
          {leafSubGoals.map((sg) => (
            <Pressable
              key={sg.id}
              className={`flex-row items-center p-4 rounded-2xl mb-2 ${
                selectedSubGoal === sg.id
                  ? 'bg-primary-50/50'
                  : 'bg-gray-50'
              }`}
              onPress={() => setSelectedSubGoal(sg.id)}
            >
              <View
                className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                  selectedSubGoal === sg.id ? 'border-primary bg-primary' : 'border-gray-200'
                }`}
                style={selectedSubGoal === sg.id ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary } : undefined}
              >
                {selectedSubGoal === sg.id && (
                  <Feather name="check" size={11} color="#FFF" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-base text-gray-900">{sg.title}</Text>
                <Text className="text-xs text-gray-400 capitalize uppercase tracking-wider mt-0.5">
                  {sg.level.replace('_', ' ')}
                </Text>
              </View>
              {sg.status === 'completed' && (
                <Feather name="check-circle" size={14} color={COLORS.success} />
              )}
            </Pressable>
          ))}

          {leafSubGoals.length === 0 && (
            <Text className="text-base text-gray-300 text-center py-6">
              No items to log against.
            </Text>
          )}
        </View>

        {/* Note */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Note <Text className="text-gray-300 normal-case">(optional)</Text>
        </Text>
        <TextInput
          className="border-b border-gray-200 py-3 text-base text-gray-900 mb-5"
          placeholder="What did you accomplish? How did it go?"
          placeholderTextColor="#D4D4D4"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          value={note}
          onChangeText={setNote}
        />

        {/* Image Picker */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Photo <Text className="text-gray-300 normal-case">(optional)</Text>
        </Text>
        {imageUri ? (
          <View className="mb-5">
            <Image
              source={{ uri: imageUri }}
              className="w-full h-48 rounded-2xl"
              resizeMode="cover"
            />
            <Pressable
              className="absolute top-2.5 right-2.5 w-8 h-8 rounded-xl bg-black/50 items-center justify-center"
              onPress={() => setImageUri(null)}
            >
              <Feather name="x" size={14} color="#FFF" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            className="flex-row items-center justify-center py-10 rounded-2xl border border-dashed border-gray-200 bg-gray-50 mb-5"
            onPress={handlePickImage}
          >
            <Feather name="camera" size={20} color="#D4D4D4" />
            <Text className="text-base text-gray-400 ml-2">Add a photo</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Submit */}
      <View
        className="absolute left-0 right-0 bg-white px-6 py-5"
        style={{ bottom: insets.bottom > 0 ? 72 : 84, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 3 }}
      >
        <Pressable
          className="rounded-2xl py-4 items-center flex-row justify-center"
          style={{
            backgroundColor: isSubmitting || !selectedSubGoal ? '#F5F5F5' : COLORS.primary,
          }}
          onPress={handleSubmit}
          disabled={isSubmitting || !selectedSubGoal}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Feather name="check-circle" size={18} color={selectedSubGoal ? '#FFF' : '#D4D4D4'} />
              <Text
                className={`text-base font-semibold ml-2 tracking-wide ${
                  selectedSubGoal ? 'text-white' : 'text-gray-300'
                }`}
              >
                Log Action
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Gallery prompt modal — shown to goal creator after a successful check-in */}
      <Modal visible={showGalleryPrompt} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={handleSkipGallery}>
          <Pressable
            className="bg-white rounded-t-2xl px-5 pt-5 pb-8"
            onPress={() => {/* prevent dismiss */}}
          >
            {/* Handle */}
            <View className="items-center mb-4">
              <View className="w-10 h-1 rounded-full bg-gray-200" />
            </View>

            {/* Icon + heading */}
            <View className="flex-row items-center mb-1">
              <View className="w-10 h-10 rounded-xl bg-primary-50 items-center justify-center mr-3">
                <Feather name="image" size={18} color={COLORS.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-gray-900">Add to Goal Gallery?</Text>
                <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
                  {goal?.title}
                </Text>
              </View>
            </View>

            <Text className="text-sm text-gray-500 mb-4 mt-2 leading-5">
              Capture a photo to show your group what you&apos;ve been working on.
            </Text>

            {/* Image preview or picker */}
            {galleryImageUri ? (
              <View className="mb-4">
                <Image
                  source={{ uri: galleryImageUri }}
                  className="w-full h-44 rounded-2xl"
                  resizeMode="cover"
                />
                <Pressable
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-xl bg-black/50 items-center justify-center"
                  onPress={() => setGalleryImageUri(null)}
                >
                  <Feather name="x" size={14} color="#FFF" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                className="flex-row items-center justify-center py-8 rounded-2xl border border-dashed border-gray-200 bg-gray-50 mb-4"
                onPress={handlePickGalleryImage}
              >
                <Feather name="camera" size={20} color="#D4D4D4" />
                <Text className="text-base text-gray-400 ml-2">Choose a photo</Text>
              </Pressable>
            )}

            {/* Actions */}
            <View className="flex-row" style={{ gap: 10 }}>
              <Pressable
                className="flex-1 py-3 rounded-xl items-center bg-gray-100"
                onPress={handleSkipGallery}
              >
                <Text className="text-base font-semibold text-gray-500">Skip</Text>
              </Pressable>
              <Pressable
                className={`flex-1 py-3 rounded-xl items-center ${!galleryImageUri ? 'opacity-40' : ''}`}
                style={{ backgroundColor: COLORS.primary }}
                onPress={handleSubmitGalleryPhoto}
                disabled={!galleryImageUri || addGalleryPhoto.isPending}
              >
                {addGalleryPhoto.isPending ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text className="text-base font-semibold text-white">Add to Gallery</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function flattenSubGoals(subGoals: SubGoal[]): SubGoal[] {
  const result: SubGoal[] = [];
  function walk(items: SubGoal[]) {
    for (const sg of items) {
      result.push(sg);
      if (sg.children?.length) walk(sg.children);
    }
  }
  walk(subGoals);
  return result;
}
