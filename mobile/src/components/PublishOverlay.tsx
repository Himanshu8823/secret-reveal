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

  // Tick pops in when the phase flips to published.
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
        <View
          className="items-center bg-surface px-8 py-7"
          style={{ borderRadius: radius.lg, minWidth: 220, ...elevation[2] }}
        >
          {done ? (
            <Animated.View style={{ transform: [{ scale: tickScale }] }}>
              <Ionicons
                name="checkmark-circle"
                size={52}
                color={colors.semantic.success}
              />
            </Animated.View>
          ) : (
            <Animated.View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 3,
                // One light segment on an otherwise faint ring reads as
                // motion without needing a spinner asset.
                borderColor: colors.border.DEFAULT,
                borderTopColor: colors.brand.primary,
                transform: [{ rotate }],
              }}
            />
          )}

          <Text variant="bodyStrong" tone="primary" className="mt-4 text-center">
            {done ? 'Published' : 'Publishing post…'}
          </Text>
          <Text variant="caption" tone="secondary" className="mt-1 text-center">
            {done ? 'Your post is live' : 'Hang tight, this only takes a moment'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
