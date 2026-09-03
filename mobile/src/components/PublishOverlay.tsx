import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './ui';
import { colors, radius, elevation } from '../theme';

export type PublishPhase = 'idle' | 'publishing' | 'published';

/**
 * Blocking overlay shown while a post is being published.
 *
 * Why not a percentage bar: by the time publish runs, every attachment has
 * already been uploaded (the composer blocks on `hasPendingUploads`), so the
 * only work left is one small JSON request. A 0-100% bar here would be a
 * timer animation pretending to be transfer progress. A spinner that turns
 * into a tick tells the truth and still answers "did it work?".
 *
 * The success state is held briefly by the caller before navigating, so the
 * confirmation is actually seen rather than flashing past on a fast network.
 */
export function PublishOverlay({ phase }: { phase: PublishPhase }) {
  const visible = phase !== 'idle';
  const done = phase === 'published';

  // Card entrance: a soft scale + fade in on open, instead of the RN Modal's
  // fade dropping a full-size card in place instantly — the sudden pop-in
  // read as jarring/disturbing rather than a considered transition.
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      cardScale.setValue(0.85);
      cardOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(cardScale, {
          toValue: 1,
          friction: 8,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, cardScale, cardOpacity]);

  // Tick pops in when the phase flips to published — a slight overshoot
  // (tension high, friction moderate) gives it a satisfying "landed" feel
  // rather than just snapping to full size.
  const tickScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (done) {
      tickScale.setValue(0);
      Animated.spring(tickScale, {
        toValue: 1,
        friction: 5,
        tension: 140,
        useNativeDriver: true,
      }).start();
    }
  }, [done, tickScale]);

  // Indeterminate ring while the request is in flight.
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible && !done) {
      const loop = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return () => loop.stop();
    }
    spin.setValue(0);
  }, [visible, done, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View
        className="flex-1 items-center justify-center px-10"
        style={{ backgroundColor: colors.surface.overlay }}
      >
        <Animated.View
          className="items-center bg-surface px-9 py-9"
          style={{
            borderRadius: radius.lg,
            minWidth: 240,
            maxWidth: 300,
            opacity: cardOpacity,
            transform: [{ scale: cardScale }],
            ...elevation[3],
          }}
        >
          <View
            className="items-center justify-center"
            style={{
              width: 64,
              height: 64,
              borderRadius: radius.full,
              backgroundColor: done ? colors.pill.successBg : colors.brand.primarySubtle,
              marginBottom: 4,
            }}
          >
            {done ? (
              <Animated.View style={{ transform: [{ scale: tickScale }] }}>
                <Ionicons
                  name="checkmark-circle"
                  size={40}
                  color={colors.semantic.success}
                />
              </Animated.View>
            ) : (
              <Animated.View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  borderWidth: 3,
                  // One light segment on an otherwise faint ring reads as
                  // motion without needing a spinner asset.
                  borderColor: colors.border.DEFAULT,
                  borderTopColor: colors.brand.primary,
                  transform: [{ rotate }],
                }}
              />
            )}
          </View>

          <Text variant="bodyStrong" tone="primary" className="mt-5 text-center">
            {done ? 'Published' : 'Publishing post…'}
          </Text>
          <Text variant="caption" tone="secondary" className="mt-1.5 text-center">
            {done ? 'Your post is live' : 'Hang tight, this only takes a moment'}
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}
