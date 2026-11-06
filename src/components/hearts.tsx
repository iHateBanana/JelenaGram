import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { colors, palette, useTheme } from '@/lib/theme';

type Heart = { id: number; x: number; y: number; drift: number; rise: number; size: number; delay: number; tint: number };

const MAX_HEARTS = 90;
const HeartsContext = createContext<{ burst: (x: number, y: number) => void }>({ burst: () => {} });

export const useHearts = () => useContext(HeartsContext);

function FloatingHeart({ heart, onDone }: { heart: Heart; onDone: (id: number) => void }) {
  useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 1500 + Math.random() * 700,
      delay: heart.delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => onDone(heart.id));
  }, [progress, heart, onDone]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -heart.rise] });
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, heart.drift, heart.drift * 0.4],
  });
  const opacity = progress.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 0.9, 0] });
  const scale = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.4, 1.15, 0.9] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: heart.x - heart.size / 2,
        top: heart.y - heart.size / 2,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}>
      <MaterialIcons name="favorite" size={heart.size} color={heart.tint % 3 === 0 ? palette.blush : palette.rose} />
    </Animated.View>
  );
}

export function HeartsProvider({ children }: { children: ReactNode }) {
  const [hearts, setHearts] = useState<Heart[]>([]);
  const nextId = useRef(0);
  const { height } = useWindowDimensions();

  const burst = useCallback(
    (x: number, y: number) => {
      const count = 2 + Math.floor(Math.random() * 2);
      setHearts((prev) => {
        const added: Heart[] = Array.from({ length: count }, () => ({
          id: nextId.current++,
          x: x + (Math.random() - 0.5) * 30,
          y,
          drift: (Math.random() - 0.5) * 240,
          rise: Math.min(height * 0.9, 220 + Math.random() * 520),
          size: 18 + Math.random() * 26,
          delay: Math.random() * 120,
          tint: Math.floor(Math.random() * 6),
        }));
        return [...prev, ...added].slice(-MAX_HEARTS);
      });
    },
    [height],
  );

  const done = useCallback((id: number) => setHearts((prev) => prev.filter((h) => h.id !== id)), []);
  const value = useMemo(() => ({ burst }), [burst]);

  return (
    <HeartsContext.Provider value={value}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {hearts.map((h) => (
          <FloatingHeart key={h.id} heart={h} onDone={done} />
        ))}
      </View>
    </HeartsContext.Provider>
  );
}
