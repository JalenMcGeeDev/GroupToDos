import React, { useEffect, useRef } from 'react';
import { Text, Pressable, Dimensions, Modal } from 'react-native';
import LottieView from 'lottie-react-native';
import { Audio } from 'expo-av';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { usePreferencesStore } from '../stores/preferences-store';
import { useCelebrationStore } from '../stores/celebration-store';
import { getSoundSource } from '../constants/celebration-sounds';

const confettiSource = require('../assets/lottie/celebration-confetti.json');

const DISPLAY_DURATION = 3000;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');

export function CelebrationOverlay() {
  const visible = useCelebrationStore((s) => s.visible);
  const hide = useCelebrationStore((s) => s.hide);
  const soundRef = useRef<Audio.Sound | null>(null);
  const celebrationSound = usePreferencesStore((s) => s.celebrationSound);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;
    const soundSource = getSoundSource(celebrationSound);

    // Play the selected celebration sound
    (async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(soundSource, {
          shouldPlay: true,
          volume: 0.8,
        });
        if (!mounted) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
      } catch (e) {
        console.warn('Celebration sound failed:', e);
      }
    })();

    // Dismiss after 3 seconds
    const timeout = setTimeout(() => {
      if (mounted) handleDismiss();
    }, DISPLAY_DURATION);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      cleanupSound();
    };
  }, [visible]);

  const cleanupSound = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        // Ignore cleanup errors
      }
      soundRef.current = null;
    }
  };

  const handleDismiss = () => {
    cleanupSound();
    hide();
  };

  if (!visible) return null;

  return (
    <Modal transparent statusBarTranslucent animationType="fade" visible={visible}>
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(300)}
        style={{
          flex: 1,
        }}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={handleDismiss}
        >
          {/* Confetti animation — fills the entire screen */}
          <LottieView
            source={confettiSource}
            autoPlay
            loop
            speed={1}
            style={{
              position: 'absolute',
              width: SCREEN_WIDTH,
              height: SCREEN_HEIGHT,
            }}
          />

          {/* Center congratulatory text */}
          <Text style={{ fontSize: 64 }}>🎉</Text>
          <Text
            style={{
              fontSize: 32,
              fontWeight: '800',
              color: '#FFFFFF',
              textAlign: 'center',
              marginTop: 12,
              textShadowColor: 'rgba(0,0,0,0.4)',
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 6,
            }}
          >
            Goal Complete!
          </Text>
          <Text
            style={{
              fontSize: 18,
              color: '#E5E5E5',
              textAlign: 'center',
              marginTop: 6,
              textShadowColor: 'rgba(0,0,0,0.3)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 4,
            }}
          >
            Amazing work — you did it!
          </Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
