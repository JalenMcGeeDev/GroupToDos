import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as ExpoImagePicker from 'expo-image-picker';

const isExpoGo = Constants.executionEnvironment === 'storeClient';
const CROP_THEME = { cropperToolbarColor: '#C15F3C', cropperToolbarWidgetColor: '#FFFFFF', cropperTitleColor: '#FFFFFF' };
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { GoalPhoto, GoalPhotoReaction, Profile } from '../lib/types';

// ─── Types ──────────────────────────────────────────────────

interface RawGoalPhoto {
  id: string;
  goal_id: string;
  uploaded_by: string;
  storage_url: string;
  created_at: string;
  uploader_profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
}

export interface AggregatedPhotoReaction {
  reaction_type: string;
  count: number;
  reacted_by_me: boolean;
}

// ─── Fetch gallery for a goal ────────────────────────────────

export function useGoalGallery(goalId: string | undefined) {
  return useQuery({
    queryKey: ['goal-gallery', goalId],
    queryFn: async (): Promise<GoalPhoto[]> => {
      const { data, error } = await supabase
        .from('goal_photos')
        .select(
          'id, goal_id, uploaded_by, storage_url, created_at, uploader_profile:profiles!goal_photos_uploaded_by_fkey(id, display_name, avatar_url)'
        )
        .eq('goal_id', goalId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as GoalPhoto[];
    },
    enabled: !!goalId,
  });
}

// ─── Add a photo ─────────────────────────────────────────────

export function useAddGoalPhoto(goalId: string | undefined) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (imageUri: string) => {
      if (!user || !goalId) throw new Error('Not authenticated');

      const ext = imageUri.split('.').pop()?.split('?')[0] ?? 'jpg';
      const fileName = `${goalId}/${user.id}/${Date.now()}.${ext}`;

      // expo-file-system requires the file:// scheme
      const fileUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: 'base64' as const,
      });

      const { error: uploadError } = await supabase.storage
        .from('goal-gallery')
        .upload(fileName, decode(base64), { contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('goal-gallery')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('goal_photos')
        .insert({
          goal_id: goalId,
          uploaded_by: user.id,
          storage_url: urlData.publicUrl,
        });

      if (insertError) throw insertError;

      return urlData.publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goal-gallery', goalId] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });
}

// ─── Pick image and upload ───────────────────────────────────

export async function pickAndUploadGalleryPhoto(
  addPhoto: ReturnType<typeof useAddGoalPhoto>
): Promise<boolean> {
  let uri: string | null = null;

  if (isExpoGo) {
    const picked = await ExpoImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });
    if (picked.canceled || !picked.assets[0]) return false;
    uri = picked.assets[0].uri;
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
    } catch {
      return false;
    }
  }

  if (!uri) return false;
  await addPhoto.mutateAsync(uri);
  return true;
}

// ─── Delete a photo ──────────────────────────────────────────

export function useDeleteGoalPhoto(goalId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (photo: GoalPhoto) => {
      // Derive storage path from public URL
      // URL pattern: .../goal-gallery/{goalId}/{userId}/{filename}
      const url = new URL(photo.storage_url);
      const pathParts = url.pathname.split('/goal-gallery/');
      const storagePath = pathParts[1];

      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from('goal-gallery')
          .remove([storagePath]);
        if (storageError) console.warn('Storage delete error:', storageError);
      }

      const { error } = await supabase
        .from('goal_photos')
        .delete()
        .eq('id', photo.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goal-gallery', goalId] });
    },
  });
}

// ─── Fetch reactions for a photo ─────────────────────────────

export function useGoalPhotoReactions(photoId: string | undefined) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['photo-reactions', photoId],
    queryFn: async (): Promise<AggregatedPhotoReaction[]> => {
      const { data, error } = await supabase
        .from('goal_photo_reactions')
        .select('id, photo_id, user_id, reaction_type, created_at')
        .eq('photo_id', photoId!);

      if (error) throw error;

      const raw = (data ?? []) as GoalPhotoReaction[];
      const grouped = new Map<string, AggregatedPhotoReaction>();

      for (const r of raw) {
        const existing = grouped.get(r.reaction_type);
        if (existing) {
          existing.count++;
          if (r.user_id === user?.id) existing.reacted_by_me = true;
        } else {
          grouped.set(r.reaction_type, {
            reaction_type: r.reaction_type,
            count: 1,
            reacted_by_me: r.user_id === user?.id,
          });
        }
      }

      return Array.from(grouped.values());
    },
    enabled: !!photoId,
  });
}

// ─── Toggle a photo reaction ─────────────────────────────────

export function useTogglePhotoReaction(photoId: string | undefined) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({
      reactionType,
      currentlyReacted,
    }: {
      reactionType: string;
      currentlyReacted: boolean;
    }) => {
      if (!user || !photoId) throw new Error('Not authenticated');

      if (currentlyReacted) {
        const { error } = await supabase
          .from('goal_photo_reactions')
          .delete()
          .eq('photo_id', photoId)
          .eq('user_id', user.id)
          .eq('reaction_type', reactionType);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('goal_photo_reactions')
          .insert({ photo_id: photoId, user_id: user.id, reaction_type: reactionType });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photo-reactions', photoId] });
    },
  });
}
