import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { COLORS } from '../constants';

const RECORDER_HEIGHT = 300;
const MAX_SECONDS = 30;

export type IntentionMode = 'video' | 'voice' | 'text';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

interface Props {
  mode: IntentionMode;
  text: string;
  onModeChange: (m: IntentionMode) => void;
  onTextChange: (t: string) => void;
  onMediaCaptured: (localUri: string) => void;
  onMediaCleared: () => void;
}

// ---------------------------------------------------------------------------
// Video preview sub-component (mounted only when a URI is ready)
// ---------------------------------------------------------------------------

function VideoPreview({
  uri,
  durationSeconds,
  facing,
  onRetake,
}: {
  uri: string;
  durationSeconds: number;
  facing: 'front' | 'back';
  onRetake: () => void;
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <View style={{ height: RECORDER_HEIGHT, borderRadius: 20, overflow: 'hidden' }}>
      <VideoView
        player={player}
        style={{ flex: 1 }}
        contentFit="cover"
        nativeControls={false}
      />
      {/* Bottom overlay */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          padding: 16,
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="check-circle" size={15} color="#4ADE80" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
            {formatTime(durationSeconds)} recorded
          </Text>
        </View>
        <Pressable
          onPress={onRetake}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: 'rgba(255,255,255,0.2)',
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 20,
          }}
        >
          <Feather name="refresh-cw" size={13} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Retake</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IntentionRecorder({
  mode,
  text,
  onModeChange,
  onTextChange,
  onMediaCaptured,
  onMediaCleared,
}: Props) {
  // Permissions
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  // Video state
  const cameraRef = useRef<CameraView>(null);
  const [videoPhase, setVideoPhase] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [localVideoUri, setLocalVideoUri] = useState<string | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [videoSeconds, setVideoSeconds] = useState(0);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Voice state
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [voicePhase, setVoicePhase] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [localVoiceUri, setLocalVoiceUri] = useState<string | null>(null);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceStoppedRef = useRef(false);

  // Voice playback preview
  const voicePlayer = useAudioPlayer(
    voicePhase === 'preview' && localVoiceUri ? localVoiceUri : undefined
  );
  const voiceStatus = useAudioPlayerStatus(voicePlayer);

  // Reset recording state when mode changes
  useEffect(() => {
    setVideoPhase('idle');
    setLocalVideoUri(null);
    setVideoSeconds(0);
    setVoicePhase('idle');
    setLocalVoiceUri(null);
    setVoiceSeconds(0);
    voiceStoppedRef.current = false;
    if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null; }
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
  }, [mode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    };
  }, []);

  // ── Video handlers ────────────────────────────────────────────────────────

  const startVideoRecording = useCallback(async () => {
    if (!cameraRef.current) return;
    setVideoPhase('recording');
    setVideoSeconds(0);
    videoTimerRef.current = setInterval(() => {
      setVideoSeconds((prev) => prev + 1);
    }, 1000);
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: MAX_SECONDS });
      if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null; }
      if (result?.uri) {
        setLocalVideoUri(result.uri);
        setVideoPhase('preview');
        onMediaCaptured(result.uri);
      } else {
        setVideoPhase('idle');
        setVideoSeconds(0);
      }
    } catch {
      if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null; }
      setVideoPhase('idle');
      setVideoSeconds(0);
    }
  }, [onMediaCaptured]);

  const stopVideoRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  const retakeVideo = useCallback(() => {
    setLocalVideoUri(null);
    setVideoPhase('idle');
    setVideoSeconds(0);
    onMediaCleared();
  }, [onMediaCleared]);

  // ── Voice handlers ────────────────────────────────────────────────────────

  const stopVoiceRecording = useCallback(async () => {
    if (voiceStoppedRef.current) return;
    voiceStoppedRef.current = true;
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    try { await audioRecorder.stop(); } catch {}
    const uri = audioRecorder.uri;
    if (uri) {
      setLocalVoiceUri(uri);
      setVoicePhase('preview');
      onMediaCaptured(uri);
    } else {
      setVoicePhase('idle');
    }
  }, [audioRecorder, onMediaCaptured]);

  const startVoiceRecording = useCallback(async () => {
    voiceStoppedRef.current = false;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setVoicePhase('recording');
      setVoiceSeconds(0);
      voiceTimerRef.current = setInterval(() => {
        setVoiceSeconds((prev) => {
          if (prev >= MAX_SECONDS - 1) {
            stopVoiceRecording();
            return MAX_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (e) {
      console.warn('Failed to start voice recording:', e);
    }
  }, [audioRecorder, stopVoiceRecording]);

  const retakeVoice = useCallback(() => {
    try { voicePlayer.pause(); } catch {}
    setLocalVoiceUri(null);
    setVoicePhase('idle');
    setVoiceSeconds(0);
    voiceStoppedRef.current = false;
    onMediaCleared();
  }, [voicePlayer, onMediaCleared]);

  // ── Render ────────────────────────────────────────────────────────────────

  const cameraGranted = cameraPermission?.granted && micPermission?.granted;

  return (
    <View>
      {/* Mode tabs */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: '#EEEAE4',
          borderRadius: 14,
          padding: 3,
          marginBottom: 16,
        }}
      >
        {(['video', 'voice', 'text'] as IntentionMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => onModeChange(m)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 9,
              borderRadius: 11,
              backgroundColor: mode === m ? '#fff' : 'transparent',
              gap: 5,
              shadowColor: '#000',
              shadowOpacity: mode === m ? 0.06 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
              elevation: mode === m ? 1 : 0,
            }}
          >
            <Feather
              name={m === 'video' ? 'video' : m === 'voice' ? 'mic' : 'edit-2'}
              size={14}
              color={mode === m ? COLORS.text : COLORS.textTertiary}
            />
            <Text
              style={{
                fontSize: 13,
                fontWeight: mode === m ? '600' : '500',
                color: mode === m ? COLORS.text : COLORS.textTertiary,
              }}
            >
              {m === 'video' ? 'Video' : m === 'voice' ? 'Voice' : 'Text'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── VIDEO ── */}
      {mode === 'video' && (
        <>
          {!cameraGranted ? (
            // Permissions not yet granted
            <View
              style={{
                height: RECORDER_HEIGHT,
                backgroundColor: '#111',
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
              }}
            >
              <Feather name="video-off" size={32} color="#555" />
              <Text
                style={{
                  color: '#888',
                  fontSize: 15,
                  textAlign: 'center',
                  lineHeight: 22,
                }}
              >
                Camera and microphone access{'\n'}needed to record a video
              </Text>
              <Pressable
                onPress={async () => {
                  await requestCameraPermission();
                  await requestMicPermission();
                }}
                style={{
                  marginTop: 4,
                  backgroundColor: COLORS.primary,
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>
                  Allow Access
                </Text>
              </Pressable>
            </View>
          ) : videoPhase === 'preview' && localVideoUri ? (
            // Video confirmed — show playback preview
            <VideoPreview
              uri={localVideoUri}
              durationSeconds={videoSeconds}
              facing={facing}
              onRetake={retakeVideo}
            />
          ) : (
            // Camera view (idle or recording)
            <View style={{ height: RECORDER_HEIGHT, borderRadius: 20, overflow: 'hidden' }}>
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing={facing}
                mode="video"
                mirror={facing === 'front'}
              />
              {/* Overlay */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              >
                {videoPhase === 'idle' ? (
                  <>
                    {/* Flip camera */}
                    <Pressable
                      onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                      style={{
                        position: 'absolute',
                        top: 14,
                        right: 14,
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: 'rgba(0,0,0,0.45)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="refresh-cw" size={17} color="#fff" />
                    </Pressable>
                    {/* Record button */}
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 20,
                        left: 0,
                        right: 0,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.75)',
                          fontSize: 12,
                          marginBottom: 10,
                        }}
                      >
                        Tap to record · 30s max
                      </Text>
                      <Pressable
                        onPress={startVideoRecording}
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: 34,
                          borderWidth: 3,
                          borderColor: '#fff',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 26,
                            backgroundColor: '#EF4444',
                          }}
                        />
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    {/* Recording timer */}
                    <View
                      style={{
                        position: 'absolute',
                        top: 14,
                        left: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: 'rgba(239,68,68,0.85)',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                        gap: 6,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: '#fff',
                        }}
                      />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                        {formatTime(videoSeconds)}
                      </Text>
                    </View>
                    {/* Progress bar */}
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        backgroundColor: 'rgba(255,255,255,0.25)',
                      }}
                    >
                      <View
                        style={{
                          height: '100%',
                          width: `${(videoSeconds / MAX_SECONDS) * 100}%`,
                          backgroundColor: '#EF4444',
                        }}
                      />
                    </View>
                    {/* Stop button */}
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 20,
                        left: 0,
                        right: 0,
                        alignItems: 'center',
                      }}
                    >
                      <Pressable
                        onPress={stopVideoRecording}
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: 34,
                          borderWidth: 3,
                          borderColor: '#fff',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 4,
                            backgroundColor: '#fff',
                          }}
                        />
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </View>
          )}
        </>
      )}

      {/* ── VOICE ── */}
      {mode === 'voice' && (
        <View
          style={{
            height: RECORDER_HEIGHT,
            backgroundColor: '#F9F7F5',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: COLORS.borderLight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {voicePhase === 'idle' && (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={startVoiceRecording}
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 8,
                }}
              >
                <Feather name="mic" size={36} color="#fff" />
              </Pressable>
              <Text style={{ fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' }}>
                Tap to record
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.textTertiary }}>
                Up to 30 seconds
              </Text>
            </View>
          )}

          {voicePhase === 'recording' && (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: '#EF4444',
                  }}
                />
                <Text
                  style={{
                    fontSize: 30,
                    fontWeight: '700',
                    color: COLORS.text,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {formatTime(voiceSeconds)}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: COLORS.textTertiary, marginBottom: 20 }}>
                Recording…
              </Text>
              <View
                style={{
                  width: 200,
                  height: 4,
                  backgroundColor: COLORS.borderLight,
                  borderRadius: 2,
                  marginBottom: 24,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${(voiceSeconds / MAX_SECONDS) * 100}%`,
                    backgroundColor: '#EF4444',
                    borderRadius: 2,
                  }}
                />
              </View>
              <Pressable
                onPress={stopVoiceRecording}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: '#EF4444',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 3,
                    backgroundColor: '#fff',
                  }}
                />
              </Pressable>
            </View>
          )}

          {voicePhase === 'preview' && (
            <View style={{ alignItems: 'center', gap: 16, paddingHorizontal: 24, width: '100%' }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Feather name="check-circle" size={17} color="#16A34A" />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '600',
                    color: COLORS.text,
                  }}
                >
                  Voice note ready · {formatTime(voiceSeconds)}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (voiceStatus.playing) {
                    voicePlayer.pause();
                  } else {
                    voicePlayer.play();
                  }
                }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather
                  name={voiceStatus.playing ? 'pause' : 'play'}
                  size={26}
                  color="#fff"
                />
              </Pressable>
              <Pressable
                onPress={retakeVoice}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Feather name="refresh-cw" size={14} color={COLORS.textTertiary} />
                <Text
                  style={{
                    fontSize: 14,
                    color: COLORS.textTertiary,
                    fontWeight: '500',
                  }}
                >
                  Retake
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* ── TEXT ── */}
      {mode === 'text' && (
        <TextInput
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: text.trim() ? COLORS.primary : COLORS.border,
            padding: 16,
            fontSize: 16,
            color: COLORS.text,
            minHeight: 120,
            textAlignVertical: 'top',
            lineHeight: 24,
          }}
          placeholder="What's your intention for today?"
          placeholderTextColor={COLORS.textTertiary}
          multiline
          value={text}
          onChangeText={onTextChange}
          maxLength={500}
        />
      )}
    </View>
  );
}
