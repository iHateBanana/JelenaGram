import { colors } from '@/lib/theme';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

export const fonts = {
  heading: 'Fraunces_600SemiBold_Italic',
  headingRegular: 'Fraunces_600SemiBold_Italic',
  regular: 'Nunito_400Regular',
  medium: 'Nunito_700Bold',
  semibold: 'Nunito_700Bold',
  bold: 'Nunito_700Bold',
};

function familyFor(weight: unknown) {
  const w = String(weight ?? '400');
  if (w === 'bold' || w === '700' || w === '800' || w === '900') return fonts.bold;
  if (w === '600' || w === '500') return fonts.bold;
  return fonts.regular;
}

function withFont(style: unknown) {
  const flat = StyleSheet.flatten(style as never) as { fontFamily?: string; fontWeight?: string } | undefined;
  if (flat?.fontFamily) return flat;
  const { fontWeight, ...rest } = flat ?? {};
  return { ...rest, fontFamily: familyFor(fontWeight) };
}

export function Text({ style, ...props }: TextProps) {
  const flat = withFont(style) as { fontSize?: number; lineHeight?: number; color?: string };
  const body = flat.fontSize === undefined ? { fontSize: 18, lineHeight: 26 } : null;
  return <RNText {...props} style={[{ color: colors.text }, body, flat] as never} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  const flat = withFont(style);
  return <RNTextInput {...props} style={flat as never} />;
}
