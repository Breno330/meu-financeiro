import { useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export function AppInput({ style, onFocus, onBlur, ...props }: TextInputProps) {
  const { C } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      style={[
        style,
        focused && { borderColor: C.brand, borderWidth: 1.5 },
      ]}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e)  => { setFocused(false); onBlur?.(e); }}
      {...props}
    />
  );
}
