/**
 * Drop-in replacement for React Native <Text> that automatically applies
 * the correct Inter variant based on the fontWeight in the style prop.
 *
 * Usage: just swap `import { Text } from 'react-native'`
 *        with   `import { T as Text } from '../components/T'`
 *
 * No other changes needed — fontWeight values are mapped automatically:
 *   '400' / normal  → Inter_400Regular
 *   '500'           → Inter_500Medium
 *   '600'           → Inter_600SemiBold
 *   '700' / bold    → Inter_700Bold
 *   '800'           → Inter_800ExtraBold
 */
import { Text, StyleSheet, type TextProps } from 'react-native';

const FONT_MAP: Record<string, string> = {
  '100': 'Inter_400Regular',
  '200': 'Inter_400Regular',
  '300': 'Inter_400Regular',
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_800ExtraBold',
};

export function T({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style);
  const weight = String(flat?.fontWeight ?? '400');
  const fontFamily = FONT_MAP[weight] ?? 'Inter_400Regular';
  return <Text style={[{ fontFamily }, style]} {...props} />;
}
