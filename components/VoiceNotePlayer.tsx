import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { supabase } from '../lib/supabase';
import { COLORS } from '../constants';

interface VoiceNotePlayerProps {
  storagePath: string; // e.g. "user-id/1714123456789.m4a"
}

export function VoiceNotePlayer({ storagePath }: VoiceNotePlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const player = useAudioPlayer(signedUrl ?? undefined);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from('voice-notes')
      .createSignedUrl(storagePath, 3600)
      .then(({ data, error }) => {
        if (!cancelled && !error && data?.signedUrl) {
          setSignedUrl(data.signedUrl);
        }
      });
    return () => { cancelled = true; };
  }, [storagePath]);

  const isPlaying = status.playing;
  const currentTime = status.currentTime ?? 0;
  const duration = status.duration ?? 0;

  const handleToggle = () => {
    if (!signedUrl) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const formatTime = (secs: number) => {
    if (!isFinite(secs) || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const displayTime = isPlaying ? formatTime(currentTime) : formatTime(duration);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#F7F5F2',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minWidth: 180,
        maxWidth: 260,
      }}
    >
      {/* Play / Pause */}
      <Pressable
        onPress={handleToggle}
        disabled={!signedUrl}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: signedUrl ? COLORS.primary : '#D4D4D4',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather
          name={isPlaying ? 'pause' : 'play'}
          size={14}
          color="#fff"
          style={{ marginLeft: isPlaying ? 0 : 2 }}
        />
      </Pressable>

      {/* Progress track */}
      <View style={{ flex: 1 }}>
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: '#E5E0D8',
            overflow: 'hidden',
            marginBottom: 4,
          }}
        >
          <View
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              backgroundColor: COLORS.primary,
              borderRadius: 2,
            }}
          />
        </View>
        <Text style={{ fontSize: 11, color: '#A39B92' }}>{displayTime}</Text>
      </View>
    </View>
  );
}
