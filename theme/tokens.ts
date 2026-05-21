/**
 * Design Tokens — Meu Financeiro
 * Fonte única de verdade para tipografia, espaçamento, raios e sombras.
 * Cores ficam em ThemeContext (C.brand, C.receita, etc.).
 */

// ── Tipografia ─────────────────────────────────────────────────────────────
// 5 estilos canônicos. Usar como base e sobrepor `color` do tema.
export const TYPE = {
  /** Títulos de tela, valores heroicos */
  heading: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  /** Títulos de seção / card */
  subheading: {
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  /** Corpo principal — descrições, textos corridos */
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  /** Rótulo de campo, botão secundário, nav label */
  label: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  /** Metadados, legendas, datas, badges — ALL CAPS opcional */
  caption: {
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
  },
} as const;

// ── Espaçamento (múltiplos de 4) ───────────────────────────────────────────
export const SPACE = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  '2xl': 24,
  '3xl': 32,
} as const;

// ── Raios de borda ─────────────────────────────────────────────────────────
export const RADIUS = {
  sm:   6,   // chips pequenos, badges
  md:   10,  // inputs, botões
  card: 14,  // stat cards, list items
  lg:   16,  // cards de seção
  xl:   20,  // hero card, modais
  full: 99,  // pill / circular
} as const;

// ── Sombras (3 níveis) ─────────────────────────────────────────────────────
export const SHADOW = {
  /** Cards secundários, list items */
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** Cards de destaque, dropdowns */
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  /** Hero card, modais, FAB */
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const;

// ── Formas de botão (sem cor — cor vem de C.brand/C.receita/etc.) ──────────
/** Botão padrão — CTA, salvar, confirmar */
export const BTN = {
  borderRadius: RADIUS.md,
  padding: SPACE.md,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

/** Botão compacto — filtro, chip de categoria */
export const BTN_SM = {
  borderRadius: RADIUS.full,
  paddingVertical: SPACE.sm - 2,
  paddingHorizontal: SPACE.md,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

/** Botão ícone — ação em hover, toggle */
export const BTN_ICON = {
  borderRadius: RADIUS.sm,
  padding: SPACE.sm - 2,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

// ── Card base (sem cor) ────────────────────────────────────────────────────
export const CARD = {
  borderRadius: RADIUS.card,
  padding: SPACE.lg,
  ...SHADOW.sm,
} as const;

/** Card de seção — painéis maiores */
export const CARD_SECTION = {
  borderRadius: RADIUS.lg,
  padding: SPACE.lg,
  ...SHADOW.sm,
} as const;
