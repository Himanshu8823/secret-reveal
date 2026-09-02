import { useEffect } from 'react';
import { Modal, Pressable, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

/**
 * Full-screen video playback. expo-video gives us native controls, PiP and
 * background-audio handling; we only own the chrome around it.
 *
 * The player is created once per mounted modal and released by the hook on
 * unmount, so a closed modal never keeps decoding in the background.
 */
export function VideoPlayerModal({ visible, uri, onClose }: Props) {
  const player = useVideoPlayer(uri ?? '', (p) => {
    p.loop = false;
  });

  // Autoplay when opened, hard-pause when dismissed — otherwise audio can
  // keep running behind the closed modal.
  useEffect(() => {
    if (visible && uri) {
      player.play();
    } else {
      player.pause();
    }
  }, [visible, uri, player]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close video"
              hitSlop={12}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={26} color={colors.text.onDark} />
            </Pressable>
          </View>

          <View style={styles.playerWrap}>
            {uri ? (
              <VideoView
                player={player}
                style={styles.player}
                contentFit="contain"
                nativeControls
                allowsFullscreen
                allowsPictureInPicture
              />
            ) : null}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  playerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  player: { width: '100%', aspectRatio: 16 / 9 },
});
