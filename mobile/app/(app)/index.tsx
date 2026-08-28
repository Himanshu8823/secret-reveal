import { Redirect } from 'expo-router';

/**
 * Backwards-compat: expo-router's Tabs wants an `index` route. Redirect to
 * the Home tab so deep-links / refreshes on /(app) land somewhere sane.
 */
export default function AppIndex() {
  return <Redirect href="/(app)/home" />;
}
