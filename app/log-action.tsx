import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useGoal } from '../hooks/use-goals';
import { useLogAction } from '../hooks/use-activity';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import { COLORS } from '../constants';
import { useAlert } from '../components/AlertProvider';
import type { SubGoal } from '../lib/types';

export default function LogActionScreen() {
  const { goalId, groupId } = useLocalSearchParams<{ goalId: string; groupId?: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: goal } = useGoal(goalId!);
  const logAction = useLogAction();

  const [selectedSubGoal, setSelectedSubGoal] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { showAlert } = useAlert();

  const allSubGoals = goal ? flattenSubGoals(goal.sub_goals ?? []) : [];
  const leafSubGoals = allSubGoals.filter(
    (sg) => !sg.children?.length || sg.children.length === 0
  );

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    if (!user) return null;

    const ext = uri.split('.').pop() ?? 'jpg';
    const fileName = `${user.id}/${Date.now()}.${ext}`;

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from('action-media')
      .upload(fileName, blob, { contentType: `image/${ext}` });

    if (error) {
      console.error('Upload error:', error);
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
          showAlert({
            title: 'Logged! \uD83C\uDF89',
            message: 'Great job! Your action has been recorded.',
            icon: 'check-circle',
            buttons: [{ text: 'OK', onPress: () => router.back() }],
          });
        },
        onError: (err) => {
          setUploading(false);
          showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' });
        },
      }
    );
  };

  const isSubmitting = logAction.isPending || uploading;

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
        className="absolute bottom-0 left-0 right-0 bg-white px-6 py-5"
        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 3 }}
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
