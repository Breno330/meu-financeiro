import { View, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { T as Text } from './T';
import { useTheme } from '../contexts/ThemeContext';
import { MESES } from '../constants';

type Props = {
  mes: number;
  ano: number;
  onPrev: () => void;
  onNext: () => void;
  style?: object;
};

export function MesSeletor({ mes, ano, onPrev, onNext, style }: Props) {
  const { C } = useTheme();

  const hoje = new Date();
  const isCurrent = mes === hoje.getMonth() && ano === hoje.getFullYear();

  return (
    <View style={[{
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: C.bgCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    }, style]}>

      {/* ── Seta esquerda ── */}
      <TouchableOpacity
        onPress={onPrev}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{
          width: 38, height: 38, borderRadius: 10,
          backgroundColor: C.brandBg,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronLeft size={18} color={C.brand} strokeWidth={2.5} />
      </TouchableOpacity>

      {/* ── Centro ── */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{
            fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.3,
          }}>
            {MESES[mes]}
          </Text>
          {isCurrent && (
            <View style={{
              backgroundColor: C.brandBg,
              borderRadius: 99,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderWidth: 1,
              borderColor: 'rgba(246,166,35,0.25)',
            }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.brand }}>
                Atual
              </Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, color: C.textLight, marginTop: 2, fontWeight: '500' }}>
          {ano}
        </Text>
      </View>

      {/* ── Seta direita ── */}
      <TouchableOpacity
        onPress={onNext}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{
          width: 38, height: 38, borderRadius: 10,
          backgroundColor: C.brandBg,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronRight size={18} color={C.brand} strokeWidth={2.5} />
      </TouchableOpacity>

    </View>
  );
}
