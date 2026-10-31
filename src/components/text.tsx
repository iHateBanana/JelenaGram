import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

export const fonts = {
  heading: 'PlayfairDisplay_700Bold_Italic',
  headingRegular: 'PlayfairDisplay_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

function familyFor(weight: unknown) {
  const w = String(weight ?? '400');
  if (w === 'bold' || w === '700' || w === '800' || w === '900') return fonts.bold;
  if (w === '600') return fonts.semibold;
  if (w === '500') return fonts.medium;
  return fonts.regular;
}

function withFont(style: unknown) {
  const flat = StyleSheet.flatten(style as never) as { fontFamily?: string; fontWeight?: string } | undefined;
  if (flat?.fontFamily) return flat;
  const { fontWeight, ...rest } = flat ?? {};
  return { ...rest, fontFamily: familyFor(fontWeight) };
}

export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={withFont(style) as never} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  const flat = withFont(style);
  return <RNTextInput {...props} style={flat as never} />;
}
