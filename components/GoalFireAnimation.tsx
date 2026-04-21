import React, { useEffect, useRef, useState } from 'react';
import { View, Animated as RNAnimated } from 'react-native';
import LottieView from 'lottie-react-native';

const fireSticks = require('../assets/lottie/fire-sticks.json');
const fireEmbers = require('../assets/lottie/fire-embers.json');
const fireSmall = require('../assets/lottie/fire-small.json');
const fireRaging = require('../assets/lottie/fire-raging.json');

const DECAY_RATE = 0.3;
const PROGRESS_WEIGHT = 0.6;
const RECENCY_WEIGHT = 0.4;

function computeRecencyFactor(lastActionAt: string | null): number {
  if (!lastActionAt) return 0;
  const ms = Date.now() - new Date(lastActionAt).getTime();
  const days = Math.max(0, ms / (1000 * 60 * 60 * 24));
  return Math.exp(-DECAY_RATE * days);
}

function computeHeatScore(progress: number, lastActionAt: string | null | undefined): number {
  const progressFactor = Math.min(progress, 100) / 100;
  if (lastActionAt === undefined) return progressFactor;
  const recencyFactor = computeRecencyFactor(lastActionAt);
  return progressFactor * PROGRESS_WEIGHT + recencyFactor * RECENCY_WEIGHT;
}

function getFireStage(heatScore: number): number {
  if (heatScore >= 0.75) return 3;
  if (heatScore >= 0.50) return 2;
  if (heatScore >= 0.25) return 1;
  return 0;
}

const FIRE_SOURCES = [fireSticks, fireEmbers, fireSmall, fireRaging];

const GREY_COLOR_FILTERS = [
  { keypath: 'Fill 92', color: '#9CA3AF' },
  { keypath: 'Shape Layer 3', color: '#9CA3AF' },
  { keypath: 'Shape Layer 2', color: '#B0B7C3' },
  { keypath: 'Shape Layer 1', color: '#D1D5DB' },
];

interface GoalFireAnimationProps {
  progress: number;
  lastActionAt?: string | null;
  size?: number;
}

export function GoalFireAnimation({ progress, lastActionAt, size = 48 }: GoalFireAnimationProps) {
  const heatScore = computeHeatScore(progress, lastActionAt);
  const stage = getFireStage(heatScore);
  const [current, setCurrent] = useState(stage);
  const [previous, setPrevious] = useState<number | null>(null);
  const fadeIn = useRef(new RNAnimated.Value(1)).current;
  const fadeOut = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (stage !== current) {
      setPrevious(current);
      setCurrent(stage);
      fadeIn.setValue(0);
      fadeOut.setValue(1);

      RNAnimated.parallel([
        RNAnimated.timing(fadeIn, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        RNAnimated.timing(fadeOut, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => setPrevious(null));
    }
  }, [stage]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outgoing animation (crossfade out) */}
      {previous !== null && (
        <RNAnimated.View
          style={{ position: 'absolute', width: size, height: size, opacity: fadeOut }}
        >
          <LottieView
            key={`prev-${previous}`}
            source={FIRE_SOURCES[previous]}
            autoPlay
            loop
            style={{ width: size, height: size }}
            colorFilters={previous === 0 ? GREY_COLOR_FILTERS : undefined}
          />
        </RNAnimated.View>
      )}
      {/* Current animation (crossfade in) */}
      <RNAnimated.View
        style={{ width: size, height: size, opacity: previous !== null ? fadeIn : 1 }}
      >
        <LottieView
          key={`current-${current}`}
          source={FIRE_SOURCES[current]}
          autoPlay
          loop
          style={{ width: size, height: size }}
          colorFilters={current === 0 ? GREY_COLOR_FILTERS : undefined}
        />
      </RNAnimated.View>
    </View>
  );
}
