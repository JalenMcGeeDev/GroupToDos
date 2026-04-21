import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useGoalReactions, useToggleReaction, type AggregatedReaction } from '../hooks/use-reactions';
import { isGifReaction, getGifId, getGifPreviewUrl, getGifUrl } from '../hooks/use-giphy';
import { COLORS } from '../constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ReactionBarProps {
  goalId: string;
}

export function ReactionBar({ goalId }: ReactionBarProps) {
  const { data: reactions = [] } = useGoalReactions(goalId);
  const toggleReaction = useToggleReaction();
  const [selectedGif, setSelectedGif] = useState<AggregatedReaction | null>(null);

  if (reactions.length === 0) return null;

  const handleRemoveReaction = () => {
    if (selectedGif) {
      toggleReaction.mutate({
        goalId,
        reactionType: selectedGif.reaction_type,
        isReacted: true,
      });
      setSelectedGif(null);
    }
  };

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}
        className="flex-row"
      >
        {reactions.map((reaction) => (
          <ReactionPill
            key={reaction.reaction_type}
            reaction={reaction}
            onPress={() => {
              if (isGifReaction(reaction.reaction_type)) {
                setSelectedGif(reaction);
              } else {
                toggleReaction.mutate({
                  goalId,
                  reactionType: reaction.reaction_type,
                  isReacted: reaction.reacted_by_me,
                });
              }
            }}
          />
        ))}
      </ScrollView>

      {/* Fullscreen GIF viewer modal */}
      {selectedGif && (
        <Modal transparent animationType="fade" statusBarTranslucent>
          <Pressable
            className="flex-1 bg-black/85 justify-center items-center"
            onPress={() => setSelectedGif(null)}
          >
            <Pressable onPress={() => {/* prevent dismiss */}}>
              {/* Close button */}
              <Pressable
                className="absolute top-0 right-0 z-10 w-9 h-9 rounded-full bg-white/15 items-center justify-center"
                style={{ marginTop: -44 }}
                onPress={() => setSelectedGif(null)}
              >
                <Feather name="x" size={18} color="#fff" />
              </Pressable>

              {/* GIF */}
              <View
                className="rounded-2xl overflow-hidden bg-black"
                style={{ width: SCREEN_WIDTH - 48 }}
              >
                <Image
                  source={{ uri: getGifUrl(getGifId(selectedGif.reaction_type)) }}
                  style={{ width: SCREEN_WIDTH - 48, aspectRatio: 1 }}
                  contentFit="contain"
                  autoplay
                />
              </View>

              {/* Attribution */}
              <View className="mt-4 items-center">
                <Text className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2">
                  Reacted by
                </Text>
                <View className="flex-row flex-wrap justify-center" style={{ gap: 6 }}>
                  {selectedGif.users.map((user) => (
                    <View
                      key={user.id}
                      className="flex-row items-center bg-white/10 rounded-full px-3 py-1.5"
                    >
                      {user.avatar_url ? (
                        <Image
                          source={{ uri: user.avatar_url }}
                          style={{ width: 20, height: 20, borderRadius: 10 }}
                        />
                      ) : (
                        <View className="w-5 h-5 rounded-full bg-white/20 items-center justify-center">
                          <Text className="text-white text-[9px] font-bold">
                            {user.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                          </Text>
                        </View>
                      )}
                      <Text className="text-white text-sm ml-1.5">
                        {user.display_name ?? 'Unknown'}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Remove reaction button */}
                {selectedGif.reacted_by_me && (
                  <Pressable
                    className="mt-5 flex-row items-center bg-red-500/20 border border-red-400/40 rounded-full px-5 py-2.5"
                    onPress={handleRemoveReaction}
                  >
                    <Feather name="trash-2" size={14} color="#F87171" />
                    <Text className="text-red-400 text-sm font-semibold ml-2">
                      Remove Reaction
                    </Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

function ReactionPill({
  reaction,
  onPress,
}: {
  reaction: AggregatedReaction;
  onPress: () => void;
}) {
  const isGif = isGifReaction(reaction.reaction_type);

  return (
    <Pressable
      className={`flex-row items-center rounded-full px-2.5 py-1 border ${
        reaction.reacted_by_me ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
      }`}
      onPress={onPress}
    >
      {isGif ? (
        <Image
          source={{ uri: getGifPreviewUrl(getGifId(reaction.reaction_type)) }}
          style={{ width: 18, height: 18, borderRadius: 3 }}
          contentFit="cover"
          autoplay
        />
      ) : (
        <Text style={{ fontSize: 14 }}>{reaction.reaction_type}</Text>
      )}
      <Text
        className={`text-xs font-semibold ml-1 ${
          reaction.reacted_by_me ? 'text-blue-600' : 'text-gray-500'
        }`}
      >
        {reaction.count}
      </Text>
    </Pressable>
  );
}
