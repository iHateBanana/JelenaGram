import { Alert, Platform } from 'react-native';

export type DialogEvent =
  | { kind: 'toast'; title: string; body?: string }
  | { kind: 'confirm'; title: string; message: string; confirmText: string; resolve: (ok: boolean) => void };

const listeners = new Set<(event: DialogEvent) => void>();

/** Used by DialogHost, which draws these messages on screen. */
export function subscribeDialogs(listener: (event: DialogEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows a short message that disappears by itself. */
export function notify(title: string, body?: string) {
  for (const listener of listeners) listener({ kind: 'toast', title, body });
}

export function confirm(title: string, message: string, confirmText = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      for (const listener of listeners) listener({ kind: 'confirm', title, message, confirmText, resolve });
    });
  }
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
