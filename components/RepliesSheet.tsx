import React, { useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import {
  useGoalRawReactions,
  useAddReaction,
  useRemoveReaction,
  type RawReactionItem,
} from '../hooks/use-reactions';
import { useGoalComments, useAddGoalComment, useAddVoiceNoteComment, useDeleteGoalComment } from '../hooks/use-comments';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { useAuthStore } from '../stores/auth-store';
import { isGifReaction, getGifId, getGifPreviewUrl, getGifUrl } from '../hooks/use-giphy';
import { ReactionPicker } from './ReactionPicker';
import { COLORS } from '../constants';
import { useAlert } from './AlertProvider';
import type { Comment } from '../lib/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────

type FeedItem =
  | { kind: 'reaction'; data: RawReactionItem }
  | { kind: 'comment'; data: Comment & { isOwn: boolean } };

// ─── Helpers ──────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ─── Shared Avatar ────────────────────────────────────────────

function Avatar({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#F4F0EB',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: COLORS.primary }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Reaction feed row ────────────────────────────────────────

function ReactionRow({
  item,
  onExpandGif,
  onRemove,
}: {
  item: RawReactionItem;
  onExpandGif: (item: RawReactionItem) => void;
  onRemove: (item: RawReactionItem) => void;
}) {
  const isGif = isGifReaction(item.reaction_type);
  const name = item.profile?.display_name ?? 'Unknown';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
      <Avatar url={item.profile?.avatar_url} name={name} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#1F1B17', marginRight: 6 }}>
            {name}
          </Text>
          <Text style={{ fontSize: 11, color: '#A39B92' }}>{formatTime(item.created_at)}</Text>
          {item.isOwn && (
            <Pressable
              onPress={() => onRemove(item)}
              hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
              style={{ marginLeft: 'auto' }}
            >
              <Feather name="trash-2" size={12} color="#D0C8C0" />
            </Pressable>
          )}
        </View>

        {isGif ? (
          <Pressable onPress={() => onExpandGif(item)}>
            <Image
              source={{ uri: getGifPreviewUrl(getGifId(item.reaction_type)) }}
              style={{ width: 140, height: 140, borderRadius: 12 }}
              contentFit="cover"
              autoplay
            />
            <View
              style={{
                position: 'absolute',
                bottom: 6,
                right: 6,
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderRadius: 4,
                paddingHorizontal: 5,
                paddingVertical: 2,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                GIF
              </Text>
            </View>
          </Pressable>
        ) : (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: '#F7F5F2',
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 26 }}>{item.reaction_type}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Comment feed row ─────────────────────────────────────────

function CommentFeedRow({
  item,
  onDelete,
}: {
  item: Comment & { isOwn: boolean };
  onDelete: () => void;
}) {
  const name = item.profile?.display_name ?? 'Unknown';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
      <Avatar url={item.profile?.avatar_url} name={name} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#1F1B17', marginRight: 6 }}>
            {name}
          </Text>
          <Text style={{ fontSize: 11, color: '#A39B92' }}>{formatTime(item.created_at)}</Text>
          {item.isOwn && (
            <Pressable
              onPress={onDelete}
              hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
              style={{ marginLeft: 'auto' }}
            >
              <Feather name="trash-2" size={12} color="#D0C8C0" />
            </Pressable>
          )}
        </View>
        {item.voice_url ? (
          <VoiceNotePlayer storagePath={item.voice_url} />
        ) : (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: '#F7F5F2',
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 8,
              maxWidth: SCREEN_WIDTH - 100,
            }}
          >
            <Text style={{ fontSize: 14, color: '#3D3530', lineHeight: 20 }}>{item.body}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── GIF fullscreen viewer ────────────────────────────────────

function GifViewer({ item, onClose }: { item: RawReactionItem; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.9)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <Pressable
            style={{
              position: 'absolute',
              top: -52,
              right: 0,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
            onPress={onClose}
          >
            <Feather name="x" size={18} color="#fff" />
          </Pressable>
          <View
            style={{
              width: SCREEN_WIDTH - 48,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: '#000',
            }}
          >
            <Image
              source={{ uri: getGifUrl(getGifId(item.reaction_type)) }}
              style={{ width: SCREEN_WIDTH - 48, aspectRatio: 1 }}
              contentFit="contain"
              autoplay
            />
          </View>
          <Text
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: 12,
              textAlign: 'center',
              marginTop: 12,
            }}
          >
            sent by {item.profile?.display_name ?? 'Unknown'}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main sheet ───────────────────────────────────────────────

interface RepliesSheetProps {
  visible: boolean;
  onClose: () => void;
  goalId: string;
}

export function RepliesSheet({ visible, onClose, goalId }: RepliesSheetProps) {
  const { data: rawReactions = [], isLoading: reactionsLoading } = useGoalRawReactions(goalId);
  const { data: comments = [], isLoading: commentsLoading } = useGoalComments(goalId);
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();
  const addComment = useAddGoalComment();
  const addVoiceNote = useAddVoiceNoteComment();
  const deleteComment = useDeleteGoalComment();
  const currentUser = useAuthStore((s) => s.user);
  const { showAlert } = useAlert();

  const [commentText, setCommentText] = useState('');
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [expandedGif, setExpandedGif] = useState<RawReactionItem | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const isLoading = reactionsLoading || commentsLoading;

  // Merge reactions + comments into a single chronological list
  const feedItems = useMemo((): FeedItem[] => {
    const items: FeedItem[] = [
      ...rawReactions.map((r) => ({ kind: 'reaction' as const, data: r })),
      ...comments.map((c) => ({
        kind: 'comment' as const,
        data: { ...c, isOwn: c.user_id === currentUser?.id },
      })),
    ];
    items.sort(
      (a, b) =>
        new Date(a.data.created_at).getTime() - new Date(b.data.created_at).getTime()
    );
    return items;
  }, [rawReactions, comments, currentUser?.id]);

  const handleSendComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed || addComment.isPending) return;
    addComment.mutate({ goalId, body: trimmed });
    setCommentText('');
  };

  const handleReactionSelect = (reactionType: string) => {
    addReaction.mutate({ goalId, reactionType });
    setShowReactionPicker(false);
  };

  const handleVoiceNoteSend = (voiceUrl: string) => {
    setIsRecording(false);
    addVoiceNote.mutate({ goalId, voiceUrl }, {
      onError: (err: any) => {
        console.error('Voice note comment insert failed:', err);
        showAlert({ title: 'Send failed', message: 'Could not save your voice note. Please try again.', icon: 'alert-circle' });
      },
    });
  };

  return (
    <>
      <ReactionPicker
        visible={showReactionPicker}
        onSelect={handleReactionSelect}
        onClose={() => setShowReactionPicker(false)}
      />

      {expandedGif && (
        <GifViewer item={expandedGif} onClose={() => setExpandedGif(null)} />
      )}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            {/* Backdrop */}
            <Pressable
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
              }}
              onPress={onClose}
            />

            {/* Sheet */}
            <View
              style={{
                backgroundColor: '#fff',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: SCREEN_HEIGHT * 0.82,
              }}
            >
              {/* Drag handle */}
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#ECE7E1' }} />
              </View>

              {/* Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 20,
                  paddingTop: 4,
                  paddingBottom: 14,
                }}
              >
                <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: '#1F1B17' }}>
                  Replies
                  {feedItems.length > 0 && (
                    <Text style={{ fontSize: 15, fontWeight: '400', color: '#A39B92' }}>
                      {'  '}{feedItems.length}
                    </Text>
                  )}
                </Text>
                <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={20} color="#A39B92" />
                </Pressable>
              </View>

              <View style={{ height: 1, backgroundColor: '#F4F0EB' }} />

              {/* Feed */}
              <ScrollView
                style={{ flexGrow: 0 }}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingTop: 16,
                  paddingBottom: 8,
                }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 32 }} />
                ) : feedItems.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <Feather name="message-circle" size={40} color="#ECE7E1" />
                    <Text style={{ color: '#A39B92', marginTop: 12, fontSize: 14 }}>
                      No replies yet. Be the first!
                    </Text>
                  </View>
                ) : (
                  feedItems.map((item) =>
                    item.kind === 'reaction' ? (
                      <ReactionRow
                        key={`r-${item.data.id}`}
                        item={item.data}
                        onExpandGif={setExpandedGif}
                        onRemove={(r) => removeReaction.mutate({ goalId, reactionType: r.reaction_type })}
                      />
                    ) : (
                      <CommentFeedRow
                        key={`c-${item.data.id}`}
                        item={item.data}
                        onDelete={() => deleteComment.mutate({ commentId: item.data.id, goalId })}
                      />
                    )
                  )
                )}
              </ScrollView>

              {/* Compose bar */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: (insets.bottom > 0 ? insets.bottom : 12),
                  borderTopWidth: 1,
                  borderTopColor: '#F4F0EB',
                  gap: 8,
                }}
              >
                {isRecording ? (
                  <VoiceNoteRecorder
                    onSend={handleVoiceNoteSend}
                    onCancel={() => setIsRecording(false)}
                  />
                ) : (
                  <>
                    <Pressable
                      onPress={() => setShowReactionPicker(true)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: '#F7F5F2',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>😀</Text>
                    </Pressable>

                    <TextInput
                      ref={inputRef}
                      value={commentText}
                      onChangeText={setCommentText}
                      placeholder="Add a comment…"
                      placeholderTextColor="#A39B92"
                      returnKeyType="send"
                      onSubmitEditing={handleSendComment}
                      style={{
                        flex: 1,
                        height: 40,
                        backgroundColor: '#F7F5F2',
                        borderRadius: 20,
                        paddingHorizontal: 16,
                        fontSize: 14,
                        color: '#1F1B17',
                      }}
                    />

                    {commentText.trim() ? (
                      <Pressable
                        onPress={handleSendComment}
                        disabled={addComment.isPending}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          backgroundColor: COLORS.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Feather name="send" size={16} color="#fff" />
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => setIsRecording(true)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          backgroundColor: '#F7F5F2',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Feather name="mic" size={18} color={COLORS.primary} />
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
