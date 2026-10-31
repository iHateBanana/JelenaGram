import AsyncStorage from '@react-native-async-storage/async-storage';

export type SeenKind = 'feed' | 'comments';

const key = (kind: SeenKind, me: string) => `jg.seen.${kind}.${me}`;

/** Last time the user looked at this area. First run starts "now" so nothing old shows as new. */
export async function getSeen(kind: SeenKind, me: string): Promise<string> {
  const stored = await AsyncStorage.getItem(key(kind, me));
  if (stored) return stored;
  const now = new Date().toISOString();
  await AsyncStorage.setItem(key(kind, me), now);
  return now;
}

export async function markSeen(kind: SeenKind, me: string): Promise<void> {
  await AsyncStorage.setItem(key(kind, me), new Date().toISOString());
}
