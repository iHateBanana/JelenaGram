import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { monthYear } from '@/lib/dates';
import type { Photo } from '@/lib/types';

type ViewerValue = { open: (photos: Photo[], index: number) => void };

const ViewerContext = createContext<ViewerValue>({ open: () => {} });

export const useViewer = () => useContext(ViewerContext);

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;
const TAP_SLOP = 8;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ photos: Photo[]; index: number } | null>(null);
  const open = useCallback((photos: Photo[], index: number) => {
    if (photos.length > 0) setState({ photos, index: clamp(index, 0, photos.length - 1) });
  }, []);
  const close = useCallback(() => setState(null), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <ViewerContext.Provider value={value}>
      {children}
      {state && <Viewer photos={state.photos} startIndex={state.index} onClose={close} />}
    </ViewerContext.Provider>
  );
}

function ViewerImage({ photo }: { photo: Photo }) {
  return (
    <Image
      source={{ uri: photo.url, cacheKey: photo.path }}
      placeholder={photo.thumbUrl ? { uri: photo.thumbUrl, cacheKey: photo.thumbKey } : undefined}
      placeholderContentFit="contain"
      cachePolicy="memory-disk"
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      recyclingKey={photo.id}
    />
  );
}

function Viewer({ photos, startIndex, onClose }: { photos: Photo[]; startIndex: number; onClose: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const [chrome, setChrome] = useState(true);

  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeY = useRef(new Animated.Value(0)).current;
  const cur = useRef({ scale: 1, x: 0, y: 0 });

  // The gesture handlers are created once, so they read current values from here.
  const latest = useRef({ index, photos, W, H, onClose });
  latest.current = { index, photos, W, H, onClose };

  const place = (s: number, x: number, y: number) => {
    cur.current = { scale: s, x, y };
    scale.setValue(s);
    tx.setValue(x);
    ty.setValue(y);
  };

  // How far a zoomed photo can move before its edge leaves the screen.
  const limits = (s: number) => {
    const { photos: list, index: i, W: w, H: h } = latest.current;
    const p = list[i];
    const ratio = p.width && p.height ? p.height / p.width : h / w;
    const imgW = Math.min(w, h / ratio);
    const imgH = imgW * ratio;
    return { x: Math.max(0, (imgW * s - w) / 2), y: Math.max(0, (imgH * s - h) / 2) };
  };

  const animateTo = (s: number, x: number, y: number) => {
    cur.current = { scale: s, x, y };
    Animated.parallel([
      Animated.timing(scale, { toValue: s, duration: 180, useNativeDriver: false }),
      Animated.timing(tx, { toValue: x, duration: 180, useNativeDriver: false }),
      Animated.timing(ty, { toValue: y, duration: 180, useNativeDriver: false }),
    ]).start();
  };

  const goTo = useCallback(
    (delta: number) => {
      const { index: i, photos: list, W: w } = latest.current;
      const next = i + delta;
      if (next < 0 || next >= list.length) {
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: false }).start();
        return;
      }
      Animated.timing(swipeX, { toValue: delta > 0 ? -w : w, duration: 160, useNativeDriver: false }).start(() => setIndex(next));
    },
    [swipeX],
  );

  // Before paint, so the next photo never flashes at the old position.
  useLayoutEffect(() => {
    swipeX.setValue(0);
    swipeY.setValue(0);
    cur.current = { scale: 1, x: 0, y: 0 };
    scale.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
  }, [index, swipeX, swipeY, scale, tx, ty]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latest.current.onClose();
      else if (e.key === 'ArrowRight') goTo(1);
      else if (e.key === 'ArrowLeft') goTo(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  const responder = useMemo(() => {
    const g = {
      count: 0,
      startDist: 1,
      startScale: 1,
      startFx: 0,
      startFy: 0,
      startX: 0,
      startY: 0,
      touchX: 0,
      touchY: 0,
      downX: 0,
      downY: 0,
      downAt: 0,
      axis: null as 'h' | 'v' | null,
      pinched: false,
      moved: false,
    };
    let lastTap = 0;
    let tapTimer: ReturnType<typeof setTimeout> | null = null;

    type Touch = { pageX: number; pageY: number };

    const begin = (touches: Touch[]) => {
      g.count = touches.length;
      g.startScale = cur.current.scale;
      g.startX = cur.current.x;
      g.startY = cur.current.y;
      const { W: w, H: h } = latest.current;
      if (touches.length >= 2) {
        const [a, b] = touches;
        g.startDist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
        g.startFx = (a.pageX + b.pageX) / 2 - w / 2;
        g.startFy = (a.pageY + b.pageY) / 2 - h / 2;
        g.pinched = true;
      } else if (touches.length === 1) {
        g.touchX = touches[0].pageX;
        g.touchY = touches[0].pageY;
      }
    };

    const onTap = (px: number, py: number) => {
      const now = Date.now();
      if (now - lastTap < DOUBLE_TAP_MS) {
        lastTap = 0;
        if (tapTimer) clearTimeout(tapTimer);
        if (cur.current.scale > 1) {
          animateTo(1, 0, 0);
        } else {
          const { W: w, H: h } = latest.current;
          const lim = limits(DOUBLE_TAP_SCALE);
          animateTo(
            DOUBLE_TAP_SCALE,
            clamp(-(px - w / 2) * (DOUBLE_TAP_SCALE - 1), -lim.x, lim.x),
            clamp(-(py - h / 2) * (DOUBLE_TAP_SCALE - 1), -lim.y, lim.y),
          );
        }
        return;
      }
      lastTap = now;
      tapTimer = setTimeout(() => setChrome((c) => !c), DOUBLE_TAP_MS);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const touches = e.nativeEvent.touches as unknown as Touch[];
        const first = touches[0] ?? e.nativeEvent;
        g.axis = null;
        g.pinched = false;
        g.moved = false;
        g.downX = first.pageX;
        g.downY = first.pageY;
        g.downAt = Date.now();
        begin(touches.length ? touches : [first]);
      },
      onPanResponderMove: (e) => {
        const raw = e.nativeEvent.touches as unknown as Touch[];
        const touches = raw.length ? raw : [e.nativeEvent as unknown as Touch];
        if (touches.length !== g.count) begin(touches);

        if (touches.length >= 2) {
          g.moved = true;
          const [a, b] = touches;
          const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
          const { W: w, H: h } = latest.current;
          const s = clamp((g.startScale * dist) / g.startDist, 1, MAX_SCALE);
          const fx = (a.pageX + b.pageX) / 2 - w / 2;
          const fy = (a.pageY + b.pageY) / 2 - h / 2;
          // Keeps the spot between the fingers under the fingers.
          const k = s / g.startScale;
          place(s, fx - (g.startFx - g.startX) * k, fy - (g.startFy - g.startY) * k);
          return;
        }

        const dx = touches[0].pageX - g.touchX;
        const dy = touches[0].pageY - g.touchY;
        if (Math.hypot(touches[0].pageX - g.downX, touches[0].pageY - g.downY) > TAP_SLOP) g.moved = true;

        if (cur.current.scale > 1) {
          const lim = limits(cur.current.scale);
          place(cur.current.scale, clamp(g.startX + dx, -lim.x, lim.x), clamp(g.startY + dy, -lim.y, lim.y));
          return;
        }
        if (!g.pinched && g.moved) {
          g.axis ??= Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
          if (g.axis === 'h') swipeX.setValue(dx);
          else swipeY.setValue(Math.max(0, dy));
        }
      },
      onPanResponderRelease: (e, gesture) => {
        g.count = 0;
        const end = e.nativeEvent as unknown as Touch;
        if (!g.moved && Date.now() - g.downAt < 400) {
          onTap(end.pageX ?? g.downX, end.pageY ?? g.downY);
          return;
        }
        if (cur.current.scale > 1 || g.pinched) {
          if (cur.current.scale < 1.05) {
            animateTo(1, 0, 0);
          } else {
            const lim = limits(cur.current.scale);
            animateTo(cur.current.scale, clamp(cur.current.x, -lim.x, lim.x), clamp(cur.current.y, -lim.y, lim.y));
          }
          return;
        }
        const { W: w } = latest.current;
        if (g.axis === 'h') {
          if (Math.abs(gesture.dx) > w * 0.2 || Math.abs(gesture.vx) > 0.4) goTo(gesture.dx < 0 ? 1 : -1);
          else Animated.spring(swipeX, { toValue: 0, useNativeDriver: false }).start();
        } else if (g.axis === 'v') {
          if (gesture.dy > 110 || gesture.vy > 0.6) latest.current.onClose();
          else Animated.spring(swipeY, { toValue: 0, useNativeDriver: false }).start();
        }
      },
    });
    // The handlers read everything that changes through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const photo = photos[index];
  const prev = photos[index - 1];
  const next = photos[index + 1];
  const backdrop = swipeY.interpolate({ inputRange: [0, 300], outputRange: [1, 0.35], extrapolate: 'clamp' });
  const wide = W >= 700;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.black, { opacity: backdrop }]} />
        <View
          {...responder.panHandlers}
          testID="photo-viewer-surface"
          style={[StyleSheet.absoluteFill, styles.surface, Platform.OS === 'web' && ({ touchAction: 'none', userSelect: 'none', cursor: 'grab' } as object)]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateX: swipeX }, { translateY: swipeY }] }]}>
            {prev && (
              <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: -W }] }]}>
                <ViewerImage photo={prev} />
              </View>
            )}
            <Animated.View
              key={photo.id}
              style={[StyleSheet.absoluteFill, { transform: [{ translateX: tx }, { translateY: ty }, { scale }] }]}>
              <ViewerImage photo={photo} />
            </Animated.View>
            {next && (
              <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: W }] }]}>
                <ViewerImage photo={next} />
              </View>
            )}
          </Animated.View>
        </View>

        {chrome && (
          <>
            <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
              <Pressable onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close photo">
                <MaterialIcons name="close" size={26} color="#fff" />
              </Pressable>
            </View>
            {wide && prev && (
              <Pressable onPress={() => goTo(-1)} style={[styles.iconBtn, styles.arrowLeft]} accessibilityRole="button" accessibilityLabel="Previous photo">
                <MaterialIcons name="chevron-left" size={32} color="#fff" />
              </Pressable>
            )}
            {wide && next && (
              <Pressable onPress={() => goTo(1)} style={[styles.iconBtn, styles.arrowRight]} accessibilityRole="button" accessibilityLabel="Next photo">
                <MaterialIcons name="chevron-right" size={32} color="#fff" />
              </Pressable>
            )}
            <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="none">
              <Text style={styles.caption} numberOfLines={1}>
                {photo.album.name}  ·  {monthYear(photo.taken_at)}
              </Text>
              {photos.length > 1 && (
                <Text style={styles.counter}>
                  {index + 1} / {photos.length}
                </Text>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  black: { backgroundColor: '#000' },
  surface: { overflow: 'hidden' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, alignItems: 'flex-end' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  arrowLeft: { position: 'absolute', left: 16, top: '50%', marginTop: -22 },
  arrowRight: { position: 'absolute', right: 16, top: '50%', marginTop: -22 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  caption: { color: '#fff', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  counter: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
});
