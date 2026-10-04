import { Redirect } from 'expo-router';

// Old bookmarks lead to execution reports; there is no pricing feature.
export default function RetiredRoute() {
  return <Redirect href="/(tabs)/reports" />;
}