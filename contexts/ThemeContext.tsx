import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Paletas ─────────────────────────────────────────────────────────────────

export const LIGHT = {
  bg: '#F8FAFC', bgCard: '#FFFFFF', bgAccent: '#F1F5F9',
  primary: '#1E293B', primaryDark: '#0F172A', primaryDeep: '#0F172A',
  border: '#E2E8F0', borderLight: '#F1F5F9',
  receita: '#10B981', receitaBg: '#ECFDF5',
  despesa: '#F43F5E', despesaBg: '#FFF1F2',
  metaBg: '#F1F5F9', metaBorder: '#94A3B8', metaText: '#1E293B',
  text: '#0F172A', label: '#64748B', textLight: '#94A3B8',
};

export const DARK = {
  bg: '#0F1117', bgCard: '#1A1D2E', bgAccent: '#1E2140',
  primary: '#6366F1', primaryDark: '#4338CA', primaryDeep: '#0D0F1A',
  border: '#2D3148', borderLight: '#1E2140',
  receita: '#34D399', receitaBg: '#064E3B',
  despesa: '#F87171', despesaBg: '#450A0A',
  metaBg: '#1E2140', metaBorder: '#4B5563', metaText: '#E2E8F0',
  text: '#F1F5F9', label: '#94A3B8', textLight: '#64748B',
};

export type ColorPalette = typeof LIGHT;

// ── Contexto ─────────────────────────────────────────────────────────────────

type ThemeCtx = { isDark: boolean; toggleTheme: () => void; C: ColorPalette };

const ThemeContext = createContext<ThemeCtx>({
  isDark: false,
  toggleTheme: () => {},
  C: LIGHT,
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('theme')
      .then(v => { if (v === 'dark') setIsDark(true); })
      .catch(() => {}); // silencioso caso localStorage esteja bloqueado
  }, []);

  function toggleTheme() {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem('theme', next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  }

  const value = useMemo(
    () => ({ isDark, toggleTheme, C: isDark ? DARK : LIGHT }) as ThemeCtx,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDark],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useTheme = () => useContext(ThemeContext);
