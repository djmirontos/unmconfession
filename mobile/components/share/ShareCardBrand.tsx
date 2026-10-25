import { StyleSheet, Text, View } from 'react-native';

/**
 * Share card brand colors: fixed, the same in light and dark theme (the image leaves the app).
 * Swap here to restyle every card.
 */
export const SHARE_COLORS = {
  bg: '#141638',
  glow: 'rgba(99, 102, 241, 0.22)',
  panel: 'rgba(255, 255, 255, 0.06)',
  hairline: 'rgba(255, 255, 255, 0.12)',
  text: '#F4F5FF',
  textDim: '#A8ADD6',
  accent: '#818CF8',
  chipBg: 'rgba(129, 140, 248, 0.18)',
  chipText: '#DCE0FF',
  // Chips laid over a photo: the card background, mostly opaque, readable on any photo.
  overlay: 'rgba(20, 22, 56, 0.78)',
  lost: '#FF8F80',
  found: '#6EE7A8',
} as const;

export const BRAND_NAME = 'UNM Freedom Confessions';

/**
 * The logo slot of every share card. A text wordmark for now; swap in the resized logo
 * image here at the branding step (keep it about 20 dp tall).
 */
export function ShareCardLogo() {
  return (
    <View style={styles.row}>
      <View style={styles.mark} />
      <Text allowFontScaling={false} style={styles.wordmark}>
        {BRAND_NAME}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 10, height: 10, borderRadius: 5, backgroundColor: SHARE_COLORS.accent },
  wordmark: { color: SHARE_COLORS.text, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
});
