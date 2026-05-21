import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, TouchableOpacity, Image, Animated,
  StyleSheet, SafeAreaView, ActivityIndicator, Platform,
} from 'react-native';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';
import {
  useFonts,
  Inter_400Regular, Inter_500Medium,
  Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { Home, BarChart2, Target, Download, LogOut, Sun, Moon } from 'lucide-react-native';

import { ThemeProvider, useTheme, type ColorPalette } from './contexts/ThemeContext';
import { useToast } from './hooks/useToast';
import { useBreakpoint } from './hooks/useBreakpoint';
import { T } from './components/T';
import type { Transacao, Meta, Recorrente, Aba } from './types';

import { TelaLogin } from './screens/TelaLogin';
import { TelaLancamentos } from './screens/TelaLancamentos';
import { TelaResumo } from './screens/TelaResumo';
import { TelaMetas } from './screens/TelaMetas';
import { TelaImportar } from './screens/TelaImportar';

// ── Raiz: injeta ThemeProvider ───────────────────────────────────────────────

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

// ── AppInner: lógica e UI (tem acesso ao contexto de tema) ───────────────────

function AppInner() {
  const hoje = new Date();
  const { C, isDark, toggleTheme } = useTheme();
  const { sidebarWidth, isMobile } = useBreakpoint();

  const s = useMemo(() => makeStyles(C), [C]);

  // ── Fontes ──────────────────────────────────────────────────────────────────
  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium,
    Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
  });

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

  // ── Animações de tela e toast ───────────────────────────────────────────────
  const screenAnim = useRef(new Animated.Value(1)).current;
  const isFirstRender = useRef(true);
  const toastAnim = useRef(new Animated.Value(0)).current;

  // Fade-in suave ao trocar de aba
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    screenAnim.setValue(0);
    Animated.timing(screenAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [aba]);

  // Toast: slide-up + fade
  useEffect(() => {
    Animated.spring(toastAnim, {
      toValue: toastVisible ? 1 : 0,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
  }, [toastVisible]);

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
  if (authCarregando || !fontsLoaded) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={C.primary} />
    </SafeAreaView>
  );

  if (!session) return <TelaLogin />;

  const ICON_COLOR_ACTIVE = C.brand;
  const ICON_COLOR = 'rgba(255,255,255,0.50)';
  const ICON_SIZE  = 20;

  const TABS: { key: Aba; Icon: React.ComponentType<any>; label: string }[] = [
    { key: 'lancamentos', Icon: Home,     label: 'Início'  },
    { key: 'resumo',      Icon: BarChart2, label: 'Resumo'  },
    { key: 'metas',       Icon: Target,   label: alertas.length > 0 ? 'Metas ●' : 'Metas' },
    { key: 'importar',    Icon: Download, label: 'Extrato' },
  ];

  const compact = sidebarWidth === 64;

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Layout com sidebar web ── */}
      <View style={{ flex: 1, flexDirection: 'row' }}>

        {/* Sidebar — só web */}
        {Platform.OS === 'web' && (
          <View style={[s.sidebar, { width: sidebarWidth }]}>

            {/* Logo + toggle de tema */}
            <View style={[s.sidebarLogo, compact && { justifyContent: 'center', paddingHorizontal: 0 }]}>
              {compact ? (
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
                  <T style={{ fontSize: 16 }}>$</T>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Image
                    source={require('./assets/logo-dark.svg')}
                    style={{ width: 148, height: 69 }}
                    resizeMode="contain"
                  />
                </View>
              )}
              {!compact && (
                <TouchableOpacity onPress={toggleTheme} style={{ padding: 4, borderRadius: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  {isDark
                    ? <Sun size={16} color="rgba(255,255,255,0.7)" strokeWidth={1.8} />
                    : <Moon size={16} color="rgba(255,255,255,0.7)" strokeWidth={1.8} />
                  }
                </TouchableOpacity>
              )}
            </View>

            {/* Nav items */}
            {TABS.map(({ key, Icon, label }) => {
              const active = aba === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.sidebarItem, active && s.sidebarItemAtivo, compact && { justifyContent: 'center' }]}
                  onPress={() => setAba(key)}
                >
                  <Icon size={ICON_SIZE} color={active ? ICON_COLOR_ACTIVE : ICON_COLOR} strokeWidth={active ? 2.2 : 1.8} />
                  {!compact && (
                    <T style={[s.sidebarLabel, active && s.sidebarLabelAtivo]}>{label}</T>
                  )}
                  {compact && alertas.length > 0 && key === 'metas' && (
                    <View style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: C.despesa }} />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={{ flex: 1 }}/>

            {/* Toggle tema compacto */}
            {compact && (
              <TouchableOpacity
                style={[s.sidebarItem, { justifyContent: 'center' }]}
                onPress={toggleTheme}
              >
                {isDark
                  ? <Sun size={ICON_SIZE} color={ICON_COLOR} strokeWidth={1.8} />
                  : <Moon size={ICON_SIZE} color={ICON_COLOR} strokeWidth={1.8} />
                }
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.sidebarItem, compact && { justifyContent: 'center' }]}
              onPress={() => supabase.auth.signOut()}
            >
              <LogOut size={ICON_SIZE} color={ICON_COLOR} strokeWidth={1.8} />
              {!compact && <T style={s.sidebarLabel}>Sair</T>}
            </TouchableOpacity>
          </View>
        )}

        {/* Conteúdo principal */}
        <View style={{ flex: 1, backgroundColor: C.bg }}>

          {/* Alertas */}
          {alertas.length > 0 && (
            <TouchableOpacity style={s.alertaBanner} onPress={() => setShowAlertas(!showAlertas)}>
              <T style={s.alertaBannerText}>🚨 {alertas.length} alerta{alertas.length > 1 ? 's' : ''} — toque para ver</T>
            </TouchableOpacity>
          )}
          {showAlertas && alertas.map((a, i) => <T key={i} style={s.alertaItem}>{a}</T>)}

          {/* Telas — wrapped em Animated.View para fade suave na troca de aba */}
          <Animated.View style={{ flex: 1, opacity: screenAnim }}>
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
          </Animated.View>
        </View>
      </View>

      {/* Toast — sempre montado, animado via opacity + translateY */}
      <Animated.View
        style={[s.toast, {
          opacity: toastAnim,
          transform: [{
            translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
          }],
        }]}
        pointerEvents="none"
      >
        <T style={s.toastText}>{toastMsg}</T>
      </Animated.View>

      {/* Tab bar — só mobile */}
      {Platform.OS !== 'web' && (
        <View style={s.tabBar}>
          {TABS.map(({ key, Icon, label }) => {
            const active = aba === key;
            return (
              <TouchableOpacity key={key} style={[s.tabItem, active && s.tabItemAtivo]} onPress={() => setAba(key)}>
                <Icon size={22} color={active ? C.brand : C.textLight} strokeWidth={active ? 2.2 : 1.8} />
                <T style={[s.tabLabel, active && s.tabLabelAtivo]}>{label}</T>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

    </SafeAreaView>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    // Tab bar
    tabBar: { flexDirection: 'row', backgroundColor: C.bgCard, borderTopWidth: 0.5, borderTopColor: C.borderLight, paddingBottom: Platform.OS === 'ios' ? 0 : 4, paddingTop: 8 },
    tabItem: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
    tabItemAtivo: { borderTopWidth: 2, borderTopColor: C.brand, marginTop: -8, paddingTop: 12 },
    tabLabel: { fontSize: 10, color: C.textLight, fontWeight: '400' },
    tabLabelAtivo: { color: C.brand, fontWeight: '600' },

    // Toast
    toast: { position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: C.primaryDeep, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
    toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },

    // Sidebar
    sidebar: { backgroundColor: C.primaryDeep, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 12 },
    sidebarLogo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
    sidebarLogoText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    sidebarItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, paddingLeft: 14, borderRadius: 10, marginBottom: 4, borderLeftWidth: 2.5, borderLeftColor: 'transparent' },
    sidebarItemAtivo: { backgroundColor: C.brandBg, borderLeftWidth: 2.5, borderLeftColor: C.brand },
    sidebarLabel: { fontSize: 14, fontWeight: '400', color: 'rgba(255,255,255,0.60)' },
    sidebarLabelAtivo: { color: C.brand, fontWeight: '600' },

    // Alertas
    alertaBanner: { backgroundColor: '#E24B4A', padding: 10, alignItems: 'center' },
    alertaBannerText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    alertaItem: { fontSize: 13, color: '#A32D2D', lineHeight: 22, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#FCEBEB' },
  });
}
