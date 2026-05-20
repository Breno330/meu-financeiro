import { View } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { T as Text } from './T';
import { useTheme } from '../contexts/ThemeContext';
import { fmt, fmtSaldo } from '../utils/format';
import { MESES } from '../constants';

type Props = {
  receitas: number;
  despesas: number;
  mes: number;
  ano: number;
  heroFontSize?: number;
  /** % de variação das receitas vs mês anterior (null = sem dados) */
  pctRec?: number | null;
  /** % de variação das despesas vs mês anterior (null = sem dados) */
  pctDesp?: number | null;
  /** Label curto do mês anterior (ex: "Abr") */
  mesPrevLabel?: string;
  style?: object;
};

export function HeroCard({
  receitas,
  despesas,
  mes,
  ano,
  heroFontSize = 38,
  pctRec = null,
  pctDesp = null,
  mesPrevLabel,
  style,
}: Props) {
  const { C } = useTheme();

  const saldo      = receitas - despesas;
  const isPositive = saldo >= 0;

  // Cores semânticas rígidas — não suaves
  const saldoColor  = isPositive ? '#FFFFFF'                  : '#EF4444';
  const badgeColor  = isPositive ? '#34D399'                  : '#EF4444';
  const badgeBg     = isPositive ? 'rgba(52,211,153,0.12)'   : 'rgba(239,68,68,0.12)';
  const badgeBorder = isPositive ? 'rgba(52,211,153,0.28)'   : 'rgba(239,68,68,0.28)';

  // Barra proporcional
  const total       = receitas + despesas || 1;
  const flexRec     = receitas / total;
  const flexDesp    = despesas / total;
  const pctRecLabel = Math.round((receitas / total) * 100);
  const pctDespLabel= 100 - pctRecLabel;

  const mesLabel    = MESES[mes].substring(0, 3).toUpperCase();
  const prevLabel   = mesPrevLabel ?? MESES[mes === 0 ? 11 : mes - 1].substring(0, 3);

  return (
    <View style={[{
      backgroundColor: C.primaryDeep,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.07)',
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    }, style]}>

      {/* ── Linha 1: rótulo + badge ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          fontWeight: '600',
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}>
          SALDO · {mesLabel} {ano}
        </Text>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 99,
          backgroundColor: badgeBg,
          borderWidth: 1,
          borderColor: badgeBorder,
        }}>
          {isPositive
            ? <TrendingUp  size={12} color={badgeColor} strokeWidth={2.5} />
            : <TrendingDown size={12} color={badgeColor} strokeWidth={2.5} />
          }
          <Text style={{ fontSize: 11, fontWeight: '700', color: badgeColor }}>
            {isPositive ? 'Superávit' : 'Déficit'}
          </Text>
        </View>
      </View>

      {/* ── Linha 2: valor principal ── */}
      <Text style={{
        fontSize: heroFontSize,
        fontWeight: '800',
        color: saldoColor,
        letterSpacing: -1.5,
        lineHeight: heroFontSize * 1.18,
        marginBottom: 20,
      }}>
        {fmtSaldo(saldo)}
      </Text>

      {/* ── Linha 3: painel receitas | despesas ── */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
      }}>

        {/* Receitas */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#34D399' }} />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)', fontWeight: '500', letterSpacing: 0.3 }}>
              Receitas
            </Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4, letterSpacing: -0.3 }}>
            {fmt(receitas)}
          </Text>
          {pctRec !== null && (
            <Text style={{ fontSize: 11, fontWeight: '500', color: pctRec >= 0 ? '#34D399' : '#FCA5A5' }}>
              {pctRec >= 0 ? '▲' : '▼'} {Math.abs(Math.round(pctRec))}% vs {prevLabel}
            </Text>
          )}
        </View>

        {/* Divisor vertical */}
        <View style={{
          width: 1,
          alignSelf: 'stretch',
          backgroundColor: 'rgba(255,255,255,0.10)',
          marginHorizontal: 14,
        }} />

        {/* Despesas */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#F87171' }} />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)', fontWeight: '500', letterSpacing: 0.3 }}>
              Despesas
            </Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4, letterSpacing: -0.3 }}>
            {fmt(despesas)}
          </Text>
          {pctDesp !== null && (
            <Text style={{ fontSize: 11, fontWeight: '500', color: pctDesp > 0 ? '#FCA5A5' : '#34D399' }}>
              {pctDesp > 0 ? '▲' : '▼'} {Math.abs(Math.round(pctDesp))}% vs {prevLabel}
            </Text>
          )}
        </View>
      </View>

      {/* ── Linha 4: barra proporcional ── */}
      {(receitas > 0 || despesas > 0) && (
        <View>
          <View style={{
            flexDirection: 'row',
            height: 5,
            borderRadius: 3,
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.07)',
            marginBottom: 7,
          }}>
            <View style={{ flex: flexRec,  backgroundColor: '#34D399' }} />
            <View style={{ flex: flexDesp, backgroundColor: '#F87171' }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#34D399' }}>
              ● Rec {pctRecLabel}%
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#F87171' }}>
              Desp {pctDespLabel}% ●
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
