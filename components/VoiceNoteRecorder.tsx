import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Sentry from '@sentry/react-native';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import { COLORS } from '../constants';

const MAX_SECONDS = 30;

interface VoiceNoteRecorderProps {
  onSend: (voiceUrl: string) => void;
  onCancel: () => void;
}

export function VoiceNoteRecorder({ onSend, onCancel }: VoiceNoteRecorderProps) {
  const user = useAuthStore((s) => s.user);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [phase, setPhase] = useState<'starting' | 'recording' | 'recorded' | 'uploading' | 'error'>('starting');
  const [elapsed, setElapsed] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  // Local playback player (only active during 'recorded' phase)
  const localPlayer = useAudioPlayer(localUri ?? undefined);
  const localStatus = useAudioPlayerStatus(localPlayer);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Stop recording and move to review phase
  const handleStop = useCallback(async () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    stopTimer();

    try {
      await recorder.stop();
    } catch {
      // Already stopped or never started
    }

    const uri = recorder.uri;
    if (!uri || !user) {
      onCancel();
      return;
    }

    setLocalUri(uri);
    setPhase('recorded');
  }, [recorder, user, onCancel]);

  // Upload and send after review
  const handleSend = useCallback(async () => {
    if (!localUri || !user) { onCancel(); return; }

    // Stop playback if playing
    try { localPlayer.pause(); } catch {}

    setPhase('uploading');

    try {
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: 'base64',
      });
      const ext = (localUri.split('.').pop()?.split('?')[0] || 'm4a').toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const contentType = ext === 'm4a' || ext === 'mp4' ? 'audio/m4a' : `audio/${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(path, decode(base64), { contentType });

      if (uploadError) throw uploadError;

      onSend(path);
    } catch (e) {
      console.warn('Voice note upload failed:', e);
      Sentry.captureException(e, { tags: { context: 'voiceNoteUpload' } });
      setPhase('error');
    }
  }, [localUri, user, localPlayer, onSend, onCancel]);

  // Discard the recording
  const handleDiscard = useCallback(() => {
    try { localPlayer.pause(); } catch {}
    setLocalUri(null);
    onCancel();
  }, [localPlayer, onCancel]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          if (!cancelled) setPermissionDenied(true);
          return;
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        await recorder.prepareToRecordAsync();
        if (cancelled) return;

        recorder.record();
        if (cancelled) return;

        setPhase('recording');
        setElapsed(0);

        timerRef.current = setInterval(() => {
          setElapsed((s) => {
            const next = s + 1;
            if (next >= MAX_SECONDS) {
              stopTimer();
              handleStop();
              return MAX_SECONDS;
            }
            return next;
          });
        }, 1000);
      } catch (e) {
        console.warn('Failed to start recording:', e);
        Sentry.captureException(e, { tags: { context: 'voiceNoteStartRecording' } });
        if (!cancelled) onCancel();
      }
    })();

    return () => {
      cancelled = true;
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = async () => {
    if (!stoppedRef.current) {
      stoppedRef.current = true;
      stopTimer();
      try { await recorder.stop(); } catch {}
    }
    onCancel();
  };

  const formatTime = (secs: number) => {
    if (!isFinite(secs) || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Permission denied ──────────────────────────────────────────
  if (permissionDenied) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, color: '#A39B92' }}>Microphone access denied</Text>
        <Pressable onPress={onCancel}>
          <Feather name="x" size={20} color="#A39B92" />
        </Pressable>
      </View>
    );
  }

  // ── Upload error ───────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
        <Feather name="alert-circle" size={16} color="#EF4444" />
        <Text style={{ flex: 1, fontSize: 13, color: '#EF4444' }}>Upload failed. Try again?</Text>
        <Pressable
          onPress={() => setPhase('recorded')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: 4 }}
        >
          <Feather name="refresh-cw" size={16} color={COLORS.primary} />
        </Pressable>
        <Pressable onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={20} color="#A39B92" />
        </Pressable>
      </View>
    );
  }

  // ── Uploading ──────────────────────────────────────────────────
  if (phase === 'uploading') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={{ fontSize: 13, color: '#A39B92' }}>Sending…</Text>
      </View>
    );
  }

  // ── Starting ───────────────────────────────────────────────────
  if (phase === 'starting') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={{ flex: 1, fontSize: 13, color: '#A39B92' }}>Preparing…</Text>
        <Pressable onPress={handleCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={20} color="#A39B92" />
        </Pressable>
      </View>
    );
  }

  // ── Review (recorded, not yet sent) ───────────────────────────
  if (phase === 'recorded') {
    const isPlaying = localStatus.playing;
    const currentTime = localStatus.currentTime ?? 0;
    const duration = localStatus.duration ?? 0;
    const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
    const displayTime = isPlaying ? formatTime(currentTime) : formatTime(duration);

    const handleTogglePlayback = () => {
      if (isPlaying) {
        localPlayer.pause();
      } else {
        localPlayer.seekTo(0);
        localPlayer.play();
      }
    };

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
        {/* Discard */}
        <Pressable onPress={handleDiscard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="trash-2" size={18} color="#EF4444" />
        </Pressable>

        {/* Play / Pause */}
        <Pressable
          onPress={handleTogglePlayback}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: COLORS.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather
            name={isPlaying ? 'pause' : 'play'}
            size={13}
            color="#fff"
            style={{ marginLeft: isPlaying ? 0 : 2 }}
          />
        </Pressable>

        {/* Progress + time */}
        <View style={{ flex: 1 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: '#F4F0EB',
              overflow: 'hidden',
              marginBottom: 3,
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

        {/* Send */}
        <Pressable
          onPress={handleSend}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: COLORS.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="send" size={15} color="#fff" />
        </Pressable>
      </View>
    );
  }

  // ── Recording ──────────────────────────────────────────────────
  const remaining = MAX_SECONDS - elapsed;
  const progress = elapsed / MAX_SECONDS;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
      <Pressable onPress={handleCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={20} color="#A39B92" />
      </Pressable>

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
        <View
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#F4F0EB',
            overflow: 'hidden',
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
        <Text style={{ fontSize: 12, color: '#A39B92', minWidth: 32 }}>
          {formatTime(remaining)}
        </Text>
      </View>

      <Pressable
        onPress={handleStop}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: COLORS.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="stop-circle" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}
