import { useEffect, useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { colors, radius } from '../theme';
import { Text } from './ui';

export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'other';

export function kindOf(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'other';
}

/**
 * Poster frame for a remote video. expo-video-thumbnails decodes the first
 * frame; until it lands (or if it fails — some codecs/containers can't be
 * decoded client-side) we fall back to a neutral placeholder so the tile
 * never renders empty.
 */
function useVideoPoster(url: string, enabled: boolean) {
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(url, { time: 1000, quality: 0.6 })
      .then((r) => {
        if (!cancelled) setPoster(r.uri);
      })
      .catch(() => {
        // Non-fatal: the placeholder below covers it.
      });
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);

  return poster;
}

type Props = {
  url: string;
  mimeType: string;
  /** Optional filename shown on document/audio tiles. */
  name?: string | null;
  /** Stable key so the image cache recycles correctly in lists. */
  recyclingKey?: string;
  onPress?: () => void;
  /** Fill the parent instead of imposing a 16:9 box. */
  fill?: boolean;
};

/**
 * One attachment rendered as a tappable tile. Images show the image,
 * videos show their poster frame under a play badge, and audio/PDF get a
 * labelled card — matching how mainstream feed apps preview non-image
 * media without autoplaying anything in a list.
 */
export function MediaTile({ url, mimeType, name, recyclingKey, onPress, fill }: Props) {
  const kind = kindOf(mimeType);
  const poster = useVideoPoster(url, kind === 'video');

  const frameStyle = fill
    ? ({ width: '100%', height: '100%' } as const)
    // PDF card is a single icon+filename row, not a media frame — the
    // shared 16:9 box left a lot of empty space under it.
    : kind === 'pdf'
      ? ({ width: '100%', height: 72 } as const)
      : ({ width: '100%', aspectRatio: 16 / 9 } as const);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={
        kind === 'image' ? 'Open image'
        : kind === 'video' ? 'Play video'
        : kind === 'audio' ? `Audio attachment${name ? `: ${name}` : ''}`
        : `Document${name ? `: ${name}` : ''}`
      }
      style={[
        frameStyle,
        {
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surface.muted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border.DEFAULT,
        },
      ]}
    >
      {kind === 'image' ? (
        <Image
          source={{ uri: url }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={recyclingKey}
        />
      ) : kind === 'video' ? (
        <View style={{ width: '100%', height: '100%' }}>
          {poster ? (
            <Image
              source={{ uri: poster }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              recyclingKey={recyclingKey}
            />
          ) : (
            <View style={styles.centerFill}>
              <Ionicons name="videocam" size={28} color={colors.text.tertiary} />
            </View>
          )}
          {/* Play badge sits above whichever of the two rendered. */}
          <View style={styles.playBadgeWrap} pointerEvents="none">
            <View style={styles.playBadge}>
              <Ionicons name="play" size={22} color={colors.text.onDark} />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.docCard}>
          <View
            style={[
              styles.docIcon,
              { backgroundColor: kind === 'audio' ? colors.pill.infoBg : colors.pill.warningBg },
            ]}
          >
            <Ionicons
              name={kind === 'audio' ? 'musical-notes' : 'document-text'}
              size={22}
              color={colors.brand.primary}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {name ?? (kind === 'audio' ? 'Audio' : 'Document')}
            </Text>
            <Text variant="caption" tone="secondary" className="mt-0.5">
              {kind === 'audio' ? 'Tap to play' : 'Tap to open'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playBadgeWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 52,
    height: 52,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingLeft: 3, // optically centre the triangle
  },
  docCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface.bg,
  },
  docIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
