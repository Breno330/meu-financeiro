import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, Platform,
} from 'react-native';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

import { C, MESES } from './constants';
import { useToast } from './hooks/useToast';
import type { Transacao, Meta, Recorrente, Aba } from './types';

import { TelaLogin } from './screens/TelaLogin';
import { TelaLancamentos } from './screens/TelaLancamentos';
import { TelaResumo } from './screens/TelaResumo';
import { TelaMetas } from './screens/TelaMetas';
import { TelaImportar } from './screens/TelaImportar';

export default function App() {
  const hoje = new Date();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null);
  const [authCarregando, setAuthCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthCarregando(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // ── Dados compartilhados ────────────────────────────────────────────────────
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [alertas, setAlertas] = useState<string[]>([]);
  const [showAlertas, setShowAlertas] = useState(false);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<Aba>('lancamentos');
  const { toastMsg, toastVisible, mostrarToast } = useToast();

  useEffect(() => { if (session) carregarTudo(); }, [session]);

  // ── Carregamento inicial ────────────────────────────────────────────────────
  async function carregarTudo() {
    setCarregando(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        supabase.from('transacoes').select('*').order('criado_em', { ascending: false }),
        supabase.from('metas').select('*'),
        supabase.from('recorrentes').select('*').eq('ativo', true),
      ]);

      if (r1.error) throw new Error(`Transações: ${r1.error.message}`);
      if (r2.error) throw new Error(`Metas: ${r2.error.message}`);
      if (r3.error) throw new Error(`Recorrentes: ${r3.error.message}`);

      let todasTx: Transacao[] = r1.data || [];
      const todasMetas: Meta[] = r2.data || [];
      const todasRec: Recorrente[] = r3.data || [];

      setMetas(todasMetas);
      setRecorrentes(todasRec);

      // Auto-lança recorrentes se ainda não existirem no mês atual
      if (todasRec.length > 0) {
        const mesStr = String(hoje.getMonth() + 1).padStart(2, '0');
        const anoStr = String(hoje.getFullYear());
        const txMesDesc = todasTx
          .filter(t => { const p = t.data?.split('/'); return p && p[1] === mesStr && p[2] === anoStr; })
          .map(t => t.descricao.toLowerCase().trim().replace(/\s*\(\d+\/\d+\)$/, ''));
        const descMesSet = new Set(txMesDesc);
        const paraInserir = todasRec.filter(r => !descMesSet.has(r.descricao.toLowerCase().trim()));

        if (paraInserir.length > 0) {
          const novasTx: Transacao[] = [];
          for (const r of paraInserir) {
            let descricao = r.descricao;
            if (r.parcelas_total && r.parcelas_restantes) {
              const atual = r.parcelas_total - r.parcelas_restantes + 1;
              descricao = `${r.descricao} (${atual}/${r.parcelas_total})`;
            }
            const { data: ins, error: errIns } = await supabase.from('transacoes').insert({
              descricao, valor: r.valor, tipo: r.tipo,
              categoria: r.categoria, data: `01/${mesStr}/${anoStr}`,
            }).select();
            if (errIns) { console.error('Erro ao inserir recorrente:', errIns.message); continue; }
            if (ins?.[0]) novasTx.push(ins[0]);

            if (r.parcelas_restantes != null) {
              const restantes = r.parcelas_restantes - 1;
              if (restantes <= 0) await supabase.from('recorrentes').update({ ativo: false }).eq('id', r.id);
              else await supabase.from('recorrentes').update({ parcelas_restantes: restantes }).eq('id', r.id);
            }
          }
          if (novasTx.length > 0) {
            todasTx = [...novasTx, ...todasTx];
            mostrarToast(`🔄 ${novasTx.length} recorrente${novasTx.length > 1 ? 's lançadas' : ' lançada'} automaticamente`);
          }
        }
      }

      setTransacoes(todasTx);
      calcularAlertas(todasTx, todasMetas);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      mostrarToast(`❌ Erro ao carregar dados: ${msg}`);
      console.error('carregarTudo:', err);
    } finally {
      setCarregando(false);
    }
  }

  function calcularAlertas(txs: Transacao[], mts: Meta[]) {
    const novos: string[] = [];
    const txM = txs.filter(t => { const p = t.data?.split('/'); return p && parseInt(p[1]) - 1 === hoje.getMonth() && parseInt(p[2]) === hoje.getFullYear(); });
    const rec = txM.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const desp = txM.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
    mts.filter(m => m.mes === hoje.getMonth() && m.ano === hoje.getFullYear()).forEach(m => {
      if (m.tipo === 'saldo') {
        const sd = rec - desp;
        if (sd < m.valor) novos.push(`⚠️ Saldo R$${Math.round(sd)} abaixo da meta de R$${Math.round(m.valor)}`);
      }
      if (m.tipo === 'categoria' && m.categoria) {
        const g = txM.filter(t => t.tipo === 'despesa' && t.categoria === m.categoria).reduce((s, t) => s + Number(t.valor), 0);
        if (g > m.valor) novos.push(`🚨 ${m.categoria}: R$${Math.round(g)} (limite R$${Math.round(m.valor)})`);
        else if (g > m.valor * 0.8) novos.push(`⚠️ ${m.categoria}: ${Math.round(g / m.valor * 100)}% do limite`);
      }
    });
    setAlertas(novos);
  }

  // ── Estados de carregamento / auth ──────────────────────────────────────────
  if (authCarregando) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={C.primary} />
    </SafeAreaView>
  );

  if (!session) return <TelaLogin />;

  const TABS = [
    { key: 'lancamentos' as Aba, icon: '🏠', label: 'Início' },
    { key: 'resumo' as Aba,      icon: '📊', label: 'Resumo' },
    { key: 'metas' as Aba,       icon: '🎯', label: alertas.length > 0 ? 'Metas 🔴' : 'Metas' },
    { key: 'importar' as Aba,    icon: '📥', label: 'Extrato' },
  ];

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Layout com sidebar web ── */}
      <View style={{ flex: 1, flexDirection: 'row' }}>

        {/* Sidebar — só web */}
        {Platform.OS === 'web' && (
          <View style={s.sidebar}>
            <View style={s.sidebarLogo}>
              <Text style={{ fontSize: 22 }}>💰</Text>
              <Text style={s.sidebarLogoText}>Meu Financeiro</Text>
            </View>
            {TABS.map(item => (
              <TouchableOpacity key={item.key} style={[s.sidebarItem, aba === item.key && s.sidebarItemAtivo]} onPress={() => setAba(item.key)}>
                <Text style={s.sidebarIcon}>{item.icon}</Text>
                <Text style={[s.sidebarLabel, aba === item.key && s.sidebarLabelAtivo]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flex: 1 }}/>
            <TouchableOpacity style={s.sidebarItem} onPress={() => supabase.auth.signOut()}>
              <Text style={s.sidebarIcon}>↩</Text>
              <Text style={s.sidebarLabel}>Sair</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Conteúdo principal */}
        <View style={{ flex: 1 }}>

          {/* Alertas */}
          {alertas.length > 0 && (
            <TouchableOpacity style={s.alertaBanner} onPress={() => setShowAlertas(!showAlertas)}>
              <Text style={s.alertaBannerText}>🚨 {alertas.length} alerta{alertas.length > 1 ? 's' : ''} — toque para ver</Text>
            </TouchableOpacity>
          )}
          {showAlertas && alertas.map((a, i) => <Text key={i} style={s.alertaItem}>{a}</Text>)}

          {/* Telas */}
          {aba === 'lancamentos' && (
            <TelaLancamentos
              transacoes={transacoes} metas={metas}
              setTransacoes={setTransacoes} calcularAlertas={calcularAlertas}
              mostrarToast={mostrarToast} carregando={carregando}
            />
          )}
          {aba === 'resumo' && (
            <TelaResumo transacoes={transacoes} metas={metas} />
          )}
          {aba === 'metas' && (
            <TelaMetas
              transacoes={transacoes} metas={metas} recorrentes={recorrentes}
              setMetas={setMetas} setRecorrentes={setRecorrentes}
              calcularAlertas={calcularAlertas} mostrarToast={mostrarToast}
            />
          )}
          {aba === 'importar' && (
            <TelaImportar
              transacoes={transacoes} metas={metas}
              setTransacoes={setTransacoes} calcularAlertas={calcularAlertas}
              mostrarToast={mostrarToast} setAba={setAba}
            />
          )}
        </View>
      </View>

      {/* Toast */}
      {toastVisible && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Tab bar — só mobile */}
      {Platform.OS !== 'web' && (
        <View style={s.tabBar}>
          {TABS.map(item => (
            <TouchableOpacity key={item.key} style={[s.tabItem, aba === item.key && s.tabItemAtivo]} onPress={() => setAba(item.key)}>
              <Text style={s.tabIcon}>{item.icon}</Text>
              <Text style={[s.tabLabel, aba === item.key && s.tabLabelAtivo]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: C.bgCard, borderTopWidth: 0.5, borderTopColor: C.borderLight, paddingBottom: Platform.OS === 'ios' ? 0 : 4, paddingTop: 6 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabItemAtivo: { borderTopWidth: 2, borderTopColor: C.primary, marginTop: -6, paddingTop: 10 },
  tabIcon: { fontSize: 20, marginBottom: 2 },
  tabLabel: { fontSize: 10, color: C.textLight },
  tabLabelAtivo: { color: C.primary, fontWeight: '600' },

  // Toast
  toast: { position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: C.primaryDeep, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Sidebar
  sidebar: { width: 220, backgroundColor: C.primaryDeep, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 12 },
  sidebarLogo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  sidebarLogoText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  sidebarItemAtivo: { backgroundColor: 'rgba(255,255,255,0.15)' },
  sidebarIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  sidebarLabel: { fontSize: 14, color: 'rgba(255,255,255,0.65)' },
  sidebarLabelAtivo: { color: '#fff', fontWeight: '600' },

  // Alertas
  alertaBanner: { backgroundColor: '#E24B4A', padding: 10, alignItems: 'center' },
  alertaBannerText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  alertaItem: { fontSize: 13, color: '#A32D2D', lineHeight: 22, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#FCEBEB' },
});
