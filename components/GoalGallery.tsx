import React, { useState, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Image,
  Modal,
  FlatList,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as ExpoImagePicker from 'expo-image-picker';

const isExpoGo = Constants.executionEnvironment === 'storeClient';
const CROP_THEME = { cropperToolbarColor: '#C15F3C', cropperToolbarWidgetColor: '#FFFFFF', cropperTitleColor: '#FFFFFF' };
import { useGoalGallery, useAddGoalPhoto, useDeleteGoalPhoto, useGoalPhotoReactions, useTogglePhotoReaction } from '../hooks/use-goal-gallery';
import { ReactionPicker } from './ReactionPicker';
import { useAuthStore } from '../stores/auth-store';
import { useAlert } from './AlertProvider';
import { COLORS } from '../constants';
import type { GoalPhoto } from '../lib/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMBNAIL_SIZE = (SCREEN_WIDTH - 48 - 8) / 3; // 3 columns, px-4 + gaps

interface GoalGalleryProps {
  goalId: string;
  isCreator: boolean;
  thumbnailSize?: number;
}

export interface GoalGalleryRef {
  addPhoto: () => void;
}

export const GoalGallery = forwardRef<GoalGalleryRef, GoalGalleryProps>(function GoalGallery({ goalId, isCreator, thumbnailSize = THUMBNAIL_SIZE }, ref) {
  const { data: photos = [], isLoading } = useGoalGallery(goalId);
  const addPhoto = useAddGoalPhoto(goalId);
  const { showAlert } = useAlert();

  const [viewerPhoto, setViewerPhoto] = useState<GoalPhoto | null>(null);

  const handleAdd = async () => {
    let uri: string | null = null;
    if (isExpoGo) {
      const picked = await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
      });
      if (!picked.canceled && picked.assets[0]) uri = picked.assets[0].uri;
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
        uri = result.path;
      } catch { /* cancelled */ }
    }
    if (!uri) return;
    addPhoto.mutate(uri, {
      onError: (err) => showAlert({ title: 'Upload failed', message: err.message, icon: 'alert-circle' }),
    });
  };

  useImperativeHandle(ref, () => ({ addPhoto: handleAdd }));

  if (isLoading) {
    return (
      <View className="py-4 items-center">
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <View className="py-5 items-center">
          <Feather name="image" size={22} color="#E5E7EB" />
          <Text className="text-xs text-gray-300 mt-2 text-center">
            {isCreator ? 'No photos yet.\nAdd one to capture progress!' : 'No photos yet.'}
          </Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap" style={{ gap: 4 }}>
          {photos.map((photo) => (
            <Pressable
              key={photo.id}
              onPress={() => setViewerPhoto(photo)}
              style={{ width: thumbnailSize, height: thumbnailSize }}
            >
              <Image
                source={{ uri: photo.storage_url }}
                style={{ width: thumbnailSize, height: thumbnailSize, borderRadius: 8 }}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      )}

      {/* Viewer modal */}
      {viewerPhoto && (
        <PhotoViewer
          photo={viewerPhoto}
          allPhotos={photos}
          goalId={goalId}
          onClose={() => setViewerPhoto(null)}
          onPhotoChange={setViewerPhoto}
        />
      )}
    </>
  );
});

// ─── Full-screen photo viewer ─────────────────────────────────

interface PhotoViewerProps {
  photo: GoalPhoto;
  allPhotos: GoalPhoto[];
  goalId: string;
  onClose: () => void;
  onPhotoChange: (photo: GoalPhoto) => void;
}

function PhotoViewer({ photo, allPhotos, goalId, onClose, onPhotoChange }: PhotoViewerProps) {
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((s) => s.user);
  const deletePhoto = useDeleteGoalPhoto(goalId);
  const { showAlert } = useAlert();
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const { data: reactions = [] } = useGoalPhotoReactions(photo.id);
  const toggleReaction = useTogglePhotoReaction(photo.id);

  const isUploader = currentUser?.id === photo.uploaded_by;

  const currentIndex = allPhotos.findIndex((p) => p.id === photo.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allPhotos.length - 1;

  const handleDelete = () => {
    showAlert({
      title: 'Delete Photo',
      message: 'Remove this photo from the gallery?',
      icon: 'trash-2',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deletePhoto.mutate(photo, {
              onSuccess: () => {
                // Move to adjacent photo or close
                if (hasNext) {
                  onPhotoChange(allPhotos[currentIndex + 1]);
                } else if (hasPrev) {
                  onPhotoChange(allPhotos[currentIndex - 1]);
                } else {
                  onClose();
                }
              },
              onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
            });
          },
        },
      ],
    });
  };

  const handleReactionSelect = (reactionType: string) => {
    const existing = reactions.find((r) => r.reaction_type === reactionType);
    toggleReaction.mutate({ reactionType, currentlyReacted: existing?.reacted_by_me ?? false });
  };

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent>
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
        {/* Top bar */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <Pressable
            className="w-9 h-9 rounded-full bg-white/10 items-center justify-center"
            onPress={onClose}
          >
            <Feather name="x" size={18} color="#FFF" />
          </Pressable>

          <Text className="text-white text-sm font-medium">
            {currentIndex + 1} / {allPhotos.length}
          </Text>

          {isUploader ? (
            <Pressable
              className="w-9 h-9 rounded-full bg-white/10 items-center justify-center"
              onPress={handleDelete}
              disabled={deletePhoto.isPending}
            >
              {deletePhoto.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Feather name="trash-2" size={16} color="#FFF" />
              )}
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {/* Main image with prev/next nav */}
        <View className="flex-1 items-center justify-center px-12">
          <Image
            source={{ uri: photo.storage_url }}
            style={{ width: SCREEN_WIDTH - 24, height: SCREEN_WIDTH - 24, borderRadius: 12 }}
            resizeMode="contain"
          />
        </View>

        {/* Left / right nav arrows */}
        {hasPrev && (
          <Pressable
            className="absolute left-2 top-1/2 w-10 h-10 rounded-full bg-white/15 items-center justify-center"
            onPress={() => onPhotoChange(allPhotos[currentIndex - 1])}
            style={{ marginTop: -20 }}
          >
            <Feather name="chevron-left" size={20} color="#FFF" />
          </Pressable>
        )}
        {hasNext && (
          <Pressable
            className="absolute right-2 top-1/2 w-10 h-10 rounded-full bg-white/15 items-center justify-center"
            onPress={() => onPhotoChange(allPhotos[currentIndex + 1])}
            style={{ marginTop: -20 }}
          >
            <Feather name="chevron-right" size={20} color="#FFF" />
          </Pressable>
        )}

        {/* Bottom: uploader + reactions */}
        <View style={{ paddingBottom: insets.bottom + 12 }} className="px-4">
          {/* Uploader name */}
          {photo.uploader_profile && (
            <Text className="text-white/60 text-xs text-center mb-3">
              Added by {photo.uploader_profile.display_name}
            </Text>
          )}

          {/* Reaction strip */}
          <View className="flex-row items-center justify-center flex-wrap" style={{ gap: 8 }}>
            {reactions.map((r) => (
              <Pressable
                key={r.reaction_type}
                onPress={() => toggleReaction.mutate({ reactionType: r.reaction_type, currentlyReacted: r.reacted_by_me })}
                className={`flex-row items-center px-3 py-1.5 rounded-full ${r.reacted_by_me ? 'bg-white/25' : 'bg-white/10'}`}
              >
                <Text className="text-base">{r.reaction_type}</Text>
                <Text className="text-white text-xs font-semibold ml-1">{r.count}</Text>
              </Pressable>
            ))}

            {/* Add reaction button */}
            <Pressable
              className="w-9 h-9 rounded-full bg-white/10 items-center justify-center"
              onPress={() => setShowReactionPicker(true)}
            >
              <Text className="text-white text-lg">+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ReactionPicker
        visible={showReactionPicker}
        onSelect={handleReactionSelect}
        onClose={() => setShowReactionPicker(false)}
      />
    </Modal>
  );
}
