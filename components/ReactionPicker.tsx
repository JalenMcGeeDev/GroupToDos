import React, { useEffect } from 'react';
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator, FlatList, Keyboard, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useGiphySearch, encodeGifReaction } from '../hooks/use-giphy';
import { REACTION_EMOJIS } from '../constants/reactions';
import { COLORS } from '../constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface ReactionPickerProps {
  visible: boolean;
  onSelect: (reactionType: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ visible, onSelect, onClose }: ReactionPickerProps) {
  const { displayGifs, isLoading, query, search, fetchTrending } = useGiphySearch();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      fetchTrending();
    }
  }, [visible]);

  if (!visible) return null;

  const handleSelectGif = (gifId: string) => {
    Keyboard.dismiss();
    onSelect(encodeGifReaction(gifId));
    onClose();
  };

  const handleSelectEmoji = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  // Calculate how tall the GIF grid can be to fill ~65% of the screen
  const emojiSectionHeight = 90; // label + row + margin
  const searchBarHeight = 70;    // label + input + margin
  const chromeHeight = 50;       // handle bar + attribution + padding
  const fixedContentHeight = emojiSectionHeight + searchBarHeight + chromeHeight + insets.bottom + 20;
  const gifGridHeight = Math.min(SCREEN_HEIGHT * 0.65 - fixedContentHeight, 340);

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30 justify-end" onPress={onClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
          <Pressable
            className="bg-white rounded-t-2xl px-5 pt-5"
            style={{ paddingBottom: insets.bottom + 12 }}
            onPress={() => {/* prevent dismiss */}}
          >
            {/* Handle bar */}
            <View className="items-center mb-4">
              <View className="w-10 h-1 rounded-full bg-gray-200" />
            </View>

            {/* Quick Emoji reactions */}
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Quick Emoji
            </Text>
            <View className="flex-row justify-between mb-5">
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center"
                  onPress={() => handleSelectEmoji(emoji)}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {/* GIF search */}
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              React with a GIF
            </Text>
            <View
              className="flex-row items-center rounded-xl px-3 mb-3"
              style={{ backgroundColor: '#F5F5F5', height: 40 }}
            >
              <Text style={{ fontSize: 14, color: '#A3A3A3', marginRight: 6 }}>🔍</Text>
              <TextInput
                className="flex-1 text-base text-gray-900"
                placeholder="Search GIPHY..."
                placeholderTextColor="#A3A3A3"
                value={query}
                onChangeText={search}
                autoCorrect={false}
                returnKeyType="search"
              />
            </View>

            {/* GIF grid */}
            <View style={{ height: gifGridHeight }}>
              {isLoading && displayGifs.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : (
                <FlatList
                  data={displayGifs}
                  keyExtractor={(item) => item.id}
                  numColumns={3}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6 }}
                  columnWrapperStyle={{ gap: 6 }}
                  renderItem={({ item }) => (
                    <Pressable
                      style={{ flex: 1 / 3, aspectRatio: 1, borderRadius: 10, overflow: 'hidden' }}
                      onPress={() => handleSelectGif(item.id)}
                    >
                      <Image
                        source={{ uri: item.previewUrl }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        autoplay
                      />
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View className="flex-1 items-center justify-center">
                      <Text className="text-base text-gray-400">
                        {query ? 'No GIFs found' : 'Loading...'}
                      </Text>
                    </View>
                  }
                />
              )}
            </View>

            {/* Giphy attribution */}
            <View className="items-center mt-3">
              <Text className="text-[10px] text-gray-400">Powered by GIPHY</Text>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
