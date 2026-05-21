import { useState, useMemo } from 'react';
import { View, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { T as Text } from './T';
import { useTheme, type ColorPalette } from '../contexts/ThemeContext';
import { RADIUS, SPACE } from '../theme/tokens';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

const STEPS = [
  {
    emoji: '👋',
    titulo: 'Bem-vindo!',
    sub: 'Seu controle financeiro começa aqui',
    desc: 'Registre receitas e despesas, acompanhe relatórios, defina metas e tenha visão real do seu dinheiro — tudo em um só lugar.',
  },
  {
    emoji: '🏦',
    titulo: 'Contas & Cartões',
    sub: 'Centralize tudo em um lugar',
    desc: 'Vá em Metas → Minhas contas. Adicione conta corrente, poupança ou cartão de crédito. O saldo e a fatura são calculados automaticamente.',
  },
  {
    emoji: '🏷️',
    titulo: 'Categorias do seu jeito',
    sub: 'Use as padrão ou crie as suas',
    desc: 'Além de Alimentação, Transporte e outras padrão, crie categorias próprias em Metas → Minhas categorias. Escolha nome e emoji.',
  },
  {
    emoji: '🚀',
    titulo: 'Pronto para começar!',
    sub: 'Toque em + para o primeiro lançamento',
    desc: 'Adicione receitas e despesas, filtre por mês, exporte relatórios e deixe que as recorrentes se lancem automaticamente.',
  },
];

export function Onboarding({ visible, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const cur = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function dismiss() { onDismiss(); setStep(0); }
  function next()    { isLast ? dismiss() : setStep(p => p + 1); }
  function back()    { setStep(p => p - 1); }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.card}>

          {/* Pular */}
          {!isLast && (
            <TouchableOpacity style={s.skip} onPress={dismiss}>
              <Text style={s.skipText}>Pular</Text>
            </TouchableOpacity>
          )}

          {/* Emoji */}
          <View style={s.emojiBox}>
            <Text style={s.emojiText}>{cur.emoji}</Text>
          </View>

          {/* Dots */}
          <View style={s.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[s.dot, i === step && s.dotActive]} />
            ))}
          </View>

          {/* Conteúdo */}
          <Text style={s.titulo}>{cur.titulo}</Text>
          <Text style={s.sub}>{cur.sub}</Text>
          <Text style={s.desc}>{cur.desc}</Text>

          {/* Botões */}
          <View style={s.btnRow}>
            {step > 0 && (
              <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={back}>
                <Text style={[s.btnText, { color: C.label }]}>← Voltar</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.btn, s.btnPrimary, step === 0 && { flex: 1 }]} onPress={next}>
              <Text style={[s.btnText, { color: C.primaryDark }]}>
                {isLast ? '🚀  Começar' : 'Próximo →'}
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: C.bgCard,
      borderRadius: 24,
      padding: SPACE['3xl'],
      width: '100%',
      maxWidth: 420,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    skip: {
      alignSelf: 'flex-end',
      paddingVertical: 4,
      paddingHorizontal: 8,
      marginBottom: 4,
    },
    skipText: { fontSize: 13, color: C.textLight },
    emojiBox: {
      width: 88,
      height: 88,
      borderRadius: 24,
      backgroundColor: C.brandBg,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 22,
    },
    emojiText: { fontSize: 40, lineHeight: 48 },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 22,
    },
    dot: {
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: C.borderLight,
    },
    dotActive: { width: 24, backgroundColor: C.brand },
    titulo: {
      fontSize: 22, fontWeight: '700', color: C.text,
      textAlign: 'center', marginBottom: 6, letterSpacing: -0.5,
    },
    sub: {
      fontSize: 14, fontWeight: '600', color: C.brand,
      textAlign: 'center', marginBottom: 12,
    },
    desc: {
      fontSize: 14, color: C.label, textAlign: 'center',
      lineHeight: 22, marginBottom: 30,
    },
    btnRow: { flexDirection: 'row', gap: 10 },
    btn: {
      borderRadius: RADIUS.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    btnPrimary:   { flex: 2, backgroundColor: C.brand },
    btnSecondary: { flex: 1, backgroundColor: C.bgAccent },
    btnText: { fontSize: 15, fontWeight: '700' },
  });
}
