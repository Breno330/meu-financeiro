import React from 'react';
import {
  Utensils, Car, Home, HeartPulse, Gamepad2,
  BookOpen, Briefcase, Tag, type LucideIcon,
} from 'lucide-react-native';

const MAP: Record<string, LucideIcon> = {
  Alimentação: Utensils,
  Transporte:  Car,
  Moradia:     Home,
  Saúde:       HeartPulse,
  Lazer:       Gamepad2,
  Educação:    BookOpen,
  Salário:     Briefcase,
  Outros:      Tag,
};

type Props = {
  categoria: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function CatIcon({ categoria, size = 16, color = '#64748B', strokeWidth = 1.8 }: Props) {
  const Icon = MAP[categoria] ?? Tag;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
