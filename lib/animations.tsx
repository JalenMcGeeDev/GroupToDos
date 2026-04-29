import React, { useEffect } from 'react';
import { ViewProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  Easing,
  interpolate,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  LinearTransition,
} from 'react-native-reanimated';

// ─── Timing presets ───────────────────────────────────────────
const DURATION = {
  fast: 200,
  normal: 300,
  slow: 500,
} as const;

const EASING = {
  smooth: Easing.bezier(0.25, 0.1, 0.25, 1),
  decelerate: Easing.out(Easing.cubic),
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

// ─── Entering / Exiting presets (for `entering` prop) ────────
export const entering = {
  fadeIn: FadeIn.duration(DURATION.normal).easing(EASING.smooth),
  fadeInDown: FadeInDown.duration(DURATION.normal).easing(EASING.decelerate),
  fadeInUp: FadeInUp.duration(DURATION.normal).easing(EASING.decelerate),
  slideInRight: SlideInRight.duration(DURATION.normal).easing(EASING.decelerate),
  /** Staggered fade+slide — pass the item index */
  stagger: (index: number, from: 'down' | 'up' = 'down') => {
    const Base = from === 'down' ? FadeInDown : FadeInUp;
    return Base.duration(DURATION.normal)
      .delay(index * 60)
      .easing(EASING.decelerate);
  },
};

export const exiting = {
  fadeOut: FadeOut.duration(DURATION.fast).easing(EASING.smooth),
  slideOutLeft: SlideOutLeft.duration(DURATION.normal).easing(EASING.smooth),
};

// ─── Layout transition preset ────────────────────────────────
export const layoutTransition = LinearTransition.duration(DURATION.normal).easing(EASING.smooth);

// ─── FadeInView ──────────────────────────────────────────────
// Wrapper that fades + translates its children on mount.
interface FadeInViewProps extends ViewProps {
  delay?: number;
  duration?: number;
  translateY?: number;
  children: React.ReactNode;
}

export function FadeInView({
  delay = 0,
  duration = DURATION.normal,
  translateY = 12,
  children,
  style,
  ...rest
}: FadeInViewProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: EASING.decelerate }),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [translateY, 0]) }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]} {...rest}>
      {children}
    </Animated.View>
  );
}

// ─── ScalePress ──────────────────────────────────────────────
// Wrap any pressable content — scales down on press, springs back.
interface ScalePressProps extends ViewProps {
  /** Scale factor when pressed (default 0.97) */
  scale?: number;
  children: React.ReactNode;
}

export function ScalePress({ scale = 0.97, children, style, ...rest }: ScalePressProps) {
  const pressed = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value }],
  }));

  return (
    <Animated.View
      style={[animatedStyle, style]}
      onTouchStart={() => {
        pressed.value = withTiming(scale, { duration: DURATION.fast });
      }}
      onTouchEnd={() => {
        pressed.value = withSpring(1, { damping: 15, stiffness: 150 });
      }}
      onTouchCancel={() => {
        pressed.value = withSpring(1, { damping: 15, stiffness: 150 });
      }}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}

// ─── AnimatedProgressBar ─────────────────────────────────────
// Smoothly animates width from 0 → target percentage.
interface AnimatedProgressBarProps {
  /** 0-100 */
  progress: number;
  /** Height in px (default 6) */
  height?: number;
  /** Track color (default #F5F5F5) */
  trackColor?: string;
  /** Fill color (default #D97757) */
  fillColor?: string;
  /** Border radius (default 999) */
  borderRadius?: number;
  delay?: number;
}

export function AnimatedProgressBar({
  progress,
  height = 6,
  trackColor = '#F5F5F5',
  fillColor = '#D97757',
  borderRadius = 999,
  delay = 200,
}: AnimatedProgressBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(
      delay,
      withTiming(Math.min(Math.max(progress, 0), 100), {
        duration: DURATION.slow,
        easing: EASING.decelerate,
      }),
    );
  }, [progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <Animated.View
      style={{
        height,
        borderRadius,
        backgroundColor: trackColor,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            height,
            borderRadius,
            backgroundColor: fillColor,
          },
          fillStyle,
        ]}
      />
    </Animated.View>
  );
}

// ─── PulseView ───────────────────────────────────────────────
// Gentle continuous pulse (great for live indicators / streak fire).
interface PulseViewProps extends ViewProps {
  /** If true, pulses continuously (default true) */
  active?: boolean;
  children: React.ReactNode;
}

export function PulseView({ active = true, children, style, ...rest }: PulseViewProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      scale.value = withSequence(
        withTiming(1.08, { duration: 600, easing: EASING.smooth }),
        withTiming(1, { duration: 600, easing: EASING.smooth }),
      );
      // Loop via interval — keeps it simple without worklet loops
      const interval = setInterval(() => {
        scale.value = withSequence(
          withTiming(1.08, { duration: 600, easing: EASING.smooth }),
          withTiming(1, { duration: 600, easing: EASING.smooth }),
        );
      }, 1200);
      return () => clearInterval(interval);
    } else {
      scale.value = withTiming(1, { duration: DURATION.fast });
    }
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]} {...rest}>
      {children}
    </Animated.View>
  );
}

// ─── Staggered list helper ───────────────────────────────────
// Use: <StaggerItem index={i}><YourCard /></StaggerItem>
interface StaggerItemProps extends ViewProps {
  index: number;
  children: React.ReactNode;
}

export function StaggerItem({ index, children, style, ...rest }: StaggerItemProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      index * 60,
      withTiming(1, { duration: DURATION.normal, easing: EASING.decelerate }),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [16, 0]) }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]} {...rest}>
      {children}
    </Animated.View>
  );
}

// Re-export Animated for convenience
export { Animated };
