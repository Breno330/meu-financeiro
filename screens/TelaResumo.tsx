import { useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { T as Text } from '../components/T';
import { HeroCard } from '../components/HeroCard';
import { MESES, CORES_CAT } from '../constants';
import {
  ArrowUpRight, ArrowDownRight, Wallet, Calendar,
  TrendingUp, TrendingDown, BarChart2, Lightbulb,
  Tag, AlertTriangle, CheckCircle,
} from 'lucide-react-native';
import { useTheme, type ColorPalette } from '../contexts/ThemeContext';
import { fmt, fmtSaldo } from '../utils/format';
import { GraficoPizza } from '../components/GraficoPizza';
import { useBreakpoint } from '../hooks/useBreakpoint';
import type { Transacao, Meta } from '../types';

type Props = {
  transacoes: Transacao[];
  metas: Meta[];
};

export function TelaResumo({ transacoes, metas }: Props) {
  const hoje = new Date();
  const [mesSel, setMesSel] = useState(hoje.getMonth());
  const [anoSel, setAnoSel] = useState(hoje.getFullYear());
  const { heroFontSize, statCardWidth } = useBreakpoint();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  function txDoMes(m: number, a: number) {
    return transacoes.filter(t => {
      const p = t.data?.split('/');
      return p && parseInt(p[1]) - 1 === m && parseInt(p[2]) === a;
    });
  }

  const dados = useMemo(() => {
    const txMes = txDoMes(mesSel, anoSel);
    const receitasMes = txMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despesasMes = txMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
    const saldoMes = receitasMes - despesasMes;

    const catMap: Record<string, number> = {};
    txMes.filter(t => t.tipo === 'despesa').forEach(t => { catMap[t.categoria] = (catMap[t.categoria] || 0) + Number(t.valor); });
    const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    const txAtual = txDoMes(hoje.getMonth(), hoje.getFullYear());
    const saldoAtual = txAtual.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0)
      - txAtual.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

    const mesSeldAnt = mesSel === 0 ? 11 : mesSel - 1;
    const anoSelAnt = mesSel === 0 ? anoSel - 1 : anoSel;
    const txMesSelAnt = txDoMes(mesSeldAnt, anoSelAnt);
    const recMesSelAnt = txMesSelAnt.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despMesSelAnt = txMesSelAnt.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
    const pctRecSel = recMesSelAnt > 0 ? (receitasMes - recMesSelAnt) / recMesSelAnt * 100 : null;
    const pctDespSel = despMesSelAnt > 0 ? (despesasMes - despMesSelAnt) / despMesSelAnt * 100 : null;

    const tendencia = Array.from({ length: 4 }, (_, i) => {
      let m = mesSel - (3 - i), a = anoSel;
      while (m < 0) { m += 12; a--; }
      const txM = txDoMes(m, a);
      const rec = txM.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
      const desp = txM.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
      return { label: MESES[m].substring(0, 3), rec, desp };
    });
    const tendMax = Math.max(...tendencia.map(t => Math.max(t.rec, t.desp)), 1);

    const diasNoMes = new Date(anoSel, mesSel + 1, 0).getDate();
    const mediaDiaria = despesasMes > 0 ? despesasMes / diasNoMes : 0;
    const totalRecDesp = receitasMes + despesasMes;
    const pctRecTotal = totalRecDesp > 0 ? Math.round(receitasMes / totalRecDesp * 100) : 0;
    const pctDespTotal = totalRecDesp > 0 ? Math.round(despesasMes / totalRecDesp * 100) : 0;
    const gastouPctAMais = receitasMes > 0 ? Math.round((despesasMes - receitasMes) / receitasMes * 100) : null;

    type InsightType = 'up' | 'down' | 'tag' | 'warn' | 'ok';
    const insightsRaw: { tipo: InsightType; texto: string }[] = [];
    if (pctDespSel !== null && Math.abs(pctDespSel) > 5)
      insightsRaw.push(pctDespSel > 0
        ? { tipo: 'up',  texto: `Despesas aumentaram ${Math.round(pctDespSel)}% vs ${MESES[mesSeldAnt]}.` }
        : { tipo: 'down', texto: `Despesas caíram ${Math.abs(Math.round(pctDespSel))}% vs ${MESES[mesSeldAnt]}. Ótimo!` });
    if (cats.length > 0 && despesasMes > 0)
      insightsRaw.push({ tipo: 'tag', texto: `${cats[0][0]} foi sua maior despesa (${Math.round(cats[0][1] / despesasMes * 100)}% do total).` });
    if (saldoMes < 0)
      insightsRaw.push({ tipo: 'warn', texto: `Você gastou ${fmt(Math.abs(saldoMes))} a mais do que recebeu.` });
    else if (saldoMes > 0 && receitasMes > 0)
      insightsRaw.push({ tipo: 'ok', texto: `Você economizou ${fmt(saldoMes)} (${Math.round(saldoMes / receitasMes * 100)}% da receita).` });
    const insights = insightsRaw.slice(0, 3);

    return {
      receitasMes, despesasMes, saldoMes, cats, saldoAtual,
      mesSeldAnt, pctRecSel, pctDespSel,
      tendencia, tendMax, diasNoMes, mediaDiaria,
      pctRecTotal, pctDespTotal, gastouPctAMais,
      insights,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transacoes, metas, mesSel, anoSel]);

  const {
    receitasMes, despesasMes, saldoMes, cats,
    mesSeldAnt, pctRecSel, pctDespSel,
    tendencia, tendMax, diasNoMes, mediaDiaria,
    pctRecTotal, pctDespTotal, gastouPctAMais, insights,
  } = dados;

  function navMes(delta: number) {
    if (delta < 0) {
      if (mesSel === 0) { setMesSel(11); setAnoSel(a => a - 1); }
      else setMesSel(m => m - 1);
    } else {
      if (mesSel === 11) { setMesSel(0); setAnoSel(a => a + 1); }
      else setMesSel(m => m + 1);
    }
  }

  return (
    <ScrollView style={{ flex: 1 }}>

      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.5 }}>Resumo Financeiro</Text>
          <Text style={{ fontSize: 13, color: C.label, marginTop: 3 }}>Acompanhe sua saúde financeira de forma simples e inteligente.</Text>
        </View>
        <View style={s.mesSeletor}>
          <TouchableOpacity onPress={() => navMes(-1)}>
            <Text style={{ color: C.brand, fontSize: 16, paddingHorizontal: 4 }}>‹</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Calendar size={13} color={C.label} strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{MESES[mesSel].substring(0, 3)} {anoSel}</Text>
            </View>
          <TouchableOpacity onPress={() => navMes(1)}>
            <Text style={{ color: C.brand, fontSize: 16, paddingHorizontal: 4 }}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Linha 1: Hero + Receitas vs Despesas ── */}
      <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 }}>

        {/* Hero — saldo */}
        <HeroCard
          receitas={receitasMes}
          despesas={despesasMes}
          mes={mesSel}
          ano={anoSel}
          heroFontSize={heroFontSize}
          pctRec={pctRecSel}
          pctDesp={pctDespSel}
          mesPrevLabel={MESES[mesSeldAnt].substring(0, 3)}
          style={{ flex: 1 }}
        />

        {/* Receitas vs Despesas */}
        <View style={[s.section, { flex: 1.4 }]}>
          <Text style={s.sectionTitulo}>Receitas vs Despesas</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 16 }}>
              <View>
                <Text style={{ fontSize: 11, color: C.label, marginBottom: 4 }}>Receitas</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.receita }}>{fmt(receitasMes)}</Text>
                <Text style={{ fontSize: 11, color: C.label, marginTop: 2 }}>{pctRecTotal}% do total</Text>
                <View style={{ height: 5, backgroundColor: C.bgAccent, borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                  <View style={{ height: 5, backgroundColor: C.receita, borderRadius: 3, width: `${pctRecTotal}%` as any }}/>
                </View>
              </View>
              <View>
                <Text style={{ fontSize: 11, color: C.label, marginBottom: 4 }}>Despesas</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.despesa }}>{fmt(despesasMes)}</Text>
                <Text style={{ fontSize: 11, color: C.label, marginTop: 2 }}>{pctDespTotal}% do total</Text>
                <View style={{ height: 5, backgroundColor: C.bgAccent, borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                  <View style={{ height: 5, backgroundColor: C.despesa, borderRadius: 3, width: `${pctDespTotal}%` as any }}/>
                </View>
              </View>
            </View>
            {(receitasMes > 0 || despesasMes > 0) && (
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <GraficoPizza
                  dados={[['Receitas', receitasMes], ['Despesas', despesasMes]]}
                  colors={[C.receita, C.despesa]}
                  size={130}
                  centerLabel={`${pctDespTotal}%`}
                  centerSub="Desp."
                />
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ── Linha 2: 4 cards de stats ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <View style={[s.statCard, { width: statCardWidth }]}>
          <View style={[s.statIcone, { backgroundColor: C.receitaBg }]}>
            <ArrowUpRight size={16} color={C.receita} strokeWidth={2} />
          </View>
          <Text style={s.statLabel}>Receitas</Text>
          <Text style={[s.statVal, { color: C.receita }]}>{fmt(receitasMes)}</Text>
          {pctRecSel !== null && (
            <Text style={[s.statPct, { color: pctRecSel >= 0 ? C.receita : C.despesa }]}>
              {pctRecSel >= 0 ? '▲' : '▼'} {Math.abs(Math.round(pctRecSel))}% vs {MESES[mesSeldAnt].substring(0, 3)}
            </Text>
          )}
        </View>
        <View style={[s.statCard, { width: statCardWidth }]}>
          <View style={[s.statIcone, { backgroundColor: C.despesaBg }]}>
            <ArrowDownRight size={16} color={C.despesa} strokeWidth={2} />
          </View>
          <Text style={s.statLabel}>Despesas</Text>
          <Text style={[s.statVal, { color: C.despesa }]}>{fmt(despesasMes)}</Text>
          {pctDespSel !== null && (
            <Text style={[s.statPct, { color: pctDespSel > 0 ? C.despesa : C.receita }]}>
              {pctDespSel > 0 ? '▲' : '▼'} {Math.abs(Math.round(pctDespSel))}% vs {MESES[mesSeldAnt].substring(0, 3)}
            </Text>
          )}
        </View>
        <View style={[s.statCard, { width: statCardWidth }]}>
          <View style={[s.statIcone, { backgroundColor: saldoMes >= 0 ? C.receitaBg : C.despesaBg }]}>
            {saldoMes >= 0
              ? <TrendingUp size={16} color={C.receita} strokeWidth={2} />
              : <TrendingDown size={16} color={C.despesa} strokeWidth={2} />
            }
          </View>
          <Text style={s.statLabel}>Diferença</Text>
          <Text style={[s.statVal, { color: saldoMes >= 0 ? C.receita : C.despesa }]}>{fmtSaldo(saldoMes)}</Text>
          <Text style={[s.statPct, { color: saldoMes >= 0 ? C.receita : C.despesa }]}>
            {saldoMes >= 0 ? 'Superávit' : `Déficit de ${gastouPctAMais ?? 0}%`}
          </Text>
        </View>
        <View style={[s.statCard, { width: statCardWidth }]}>
          <View style={[s.statIcone, { backgroundColor: C.bgAccent }]}>
            <Calendar size={16} color={C.label} strokeWidth={1.8} />
          </View>
          <Text style={s.statLabel}>Média diária</Text>
          <Text style={[s.statVal, { color: C.text }]}>{mediaDiaria > 0 ? fmt(mediaDiaria) : '—'}</Text>
          <Text style={s.statPct}>Baseado nos {diasNoMes} dias</Text>
        </View>
      </ScrollView>

      {/* ── Linha 3: Evolução + Categorias ── */}
      <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 }}>

        {/* Evolução */}
        <View style={[s.section, { flex: 1 }]}>
          <Text style={s.sectionTitulo}>Evolução dos últimos 4 meses</Text>

          {tendencia.every(t => t.rec === 0 && t.desp === 0) ? (
            /* ── Empty state ── */
            <View style={{ alignItems: 'center', paddingVertical: 28 }}>
              <View style={{
                width: 52, height: 52, borderRadius: 14,
                backgroundColor: C.bgAccent,
                alignItems: 'center', justifyContent: 'center', marginBottom: 10,
              }}>
                <BarChart2 size={24} color={C.textLight} strokeWidth={1.5} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.label, marginBottom: 4 }}>
                Sem dados para exibir
              </Text>
              <Text style={{ fontSize: 12, color: C.textLight, textAlign: 'center', lineHeight: 18 }}>
                Adicione transações nos últimos{'\n'}4 meses para ver a evolução.
              </Text>
            </View>
          ) : (
            /* ── Gráfico de barras ── */
            <>
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <View style={{ width: 48 }}>
                  {[tendMax, tendMax * 0.75, tendMax * 0.5, tendMax * 0.25, 0].map((v, i) => (
                    <Text key={i} style={{ fontSize: 9, color: C.textLight, textAlign: 'right', paddingRight: 4, height: 20, lineHeight: 20 }}>
                      {v > 999 ? `R$${Math.round(v / 1000)}k` : v > 0 ? `R$${Math.round(v)}` : 'R$0'}
                    </Text>
                  ))}
                </View>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 100 }}>
                  {tendencia.map((t, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 100 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 90 }}>
                        <View style={{ width: 10, height: Math.max((t.rec / tendMax) * 90, t.rec > 0 ? 4 : 0), backgroundColor: C.receita, borderRadius: 3 }}/>
                        <View style={{ width: 10, height: Math.max((t.desp / tendMax) * 90, t.desp > 0 ? 4 : 0), backgroundColor: C.despesa, borderRadius: 3 }}/>
                      </View>
                      <Text style={{ fontSize: 10, color: C.textLight, marginTop: 6 }}>{t.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.receita }}/>
                  <Text style={{ fontSize: 12, color: C.label }}>Receitas</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.despesa }}/>
                  <Text style={{ fontSize: 12, color: C.label }}>Despesas</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Categorias */}
        <View style={[s.section, { flex: 1 }]}>
          <Text style={s.sectionTitulo}>Despesas por categoria</Text>
          {cats.length > 0 ? (
            <>
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <GraficoPizza
                  dados={cats}
                  size={160}
                  centerLabel={fmt(despesasMes)}
                  centerSub="Total"
                />
              </View>
              {cats.map(([c, v]) => {
                const pct = despesasMes > 0 ? Math.round(v / despesasMes * 100) : 0;
                const cor = CORES_CAT[c] || C.primary;
                return (
                  <View key={c} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: cor }}/>
                    <Text style={{ flex: 1, fontSize: 12, color: C.label }}>{c}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: C.text, width: 36, textAlign: 'right' }}>{pct}%</Text>
                  </View>
                );
              })}
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: C.bgAccent, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <BarChart2 size={26} color={C.textLight} strokeWidth={1.5} />
              </View>
              <Text style={{ fontSize: 13, color: C.textLight }}>Sem despesas em {MESES[mesSel]}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Linha 4: Insights ── */}
      {insights.length > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Lightbulb size={16} color={C.text} strokeWidth={2} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: C.text }}>Insights para você</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {insights.map((insight, i) => {
              const isNeg = insight.tipo === 'warn' || insight.tipo === 'up';
              const borderColor = isNeg ? C.despesa : C.receita;
              const iconColor   = isNeg ? C.despesa : C.receita;
              const IconComp =
                insight.tipo === 'up'   ? TrendingUp :
                insight.tipo === 'down' ? TrendingDown :
                insight.tipo === 'tag'  ? Tag :
                insight.tipo === 'warn' ? AlertTriangle :
                CheckCircle;
              return (
                <View key={i} style={{ flex: 1, backgroundColor: C.bgCard, borderRadius: 14, padding: 14, borderLeftWidth: 3, borderLeftColor: borderColor, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isNeg ? C.despesaBg : C.receitaBg, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                    <IconComp size={16} color={iconColor} strokeWidth={2} />
                  </View>
                  <Text style={{ fontSize: 12, color: C.text, lineHeight: 18, fontWeight: '500' }}>{insight.texto}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ height: 100 }}/>
    </ScrollView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
  mesSeletor: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgCard, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: C.border },
  section: { backgroundColor: C.bgCard, marginBottom: 0, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sectionTitulo: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 14 },
  statCard: { backgroundColor: C.bgCard, borderRadius: 14, padding: 14, marginRight: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  statIcone: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statLabel: { fontSize: 11, color: C.textLight, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  statVal: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  statPct: { fontSize: 11, color: C.textLight },
  });
}
