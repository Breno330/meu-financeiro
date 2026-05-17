import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';
import Svg, { Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Tipo = 'receita' | 'despesa';
type Aba = 'lancamentos' | 'resumo' | 'metas' | 'importar';
type Transacao = { id: string; descricao: string; valor: number; tipo: Tipo; categoria: string; data: string; criado_em?: string; };
type Meta = { id: string; tipo: 'saldo' | 'categoria'; categoria?: string; valor: number; mes: number; ano: number; };
type Recorrente = { id: string; descricao: string; valor: number; tipo: Tipo; categoria: string; ativo: boolean; parcelas_total?: number | null; parcelas_restantes?: number | null; };
type TransacaoOFX = { id: string; descricao: string; valor: number; tipo: Tipo; categoria: string; data: string; selecionada: boolean; };

const CATEGORIAS = ['Alimentação','Transporte','Moradia','Saúde','Lazer','Educação','Salário','Outros'];
const CORES_CAT: Record<string,string> = {
  Alimentação:'#10B981', Transporte:'#0EA5E9', Moradia:'#F59E0B',
  Saúde:'#EC4899', Lazer:'#8B5CF6', Educação:'#14B8A6', Salário:'#10B981', Outros:'#64748B',
};
const ICONES_CAT: Record<string,string> = {
  Alimentação:'🍽', Transporte:'🚗', Moradia:'🏠', Saúde:'💊',
  Lazer:'🎮', Educação:'📚', Salário:'💼', Outros:'📌',
};
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const C = {
  bg: '#F8FAFC', bgCard: '#FFFFFF', bgAccent: '#F1F5F9',
  primary: '#1E293B', primaryDark: '#0F172A', primaryDeep: '#0F172A',
  border: '#E2E8F0', borderLight: '#F1F5F9',
  receita: '#10B981', receitaBg: '#ECFDF5',
  despesa: '#F43F5E', despesaBg: '#FFF1F2',
  metaBg: '#F1F5F9', metaBorder: '#94A3B8', metaText: '#1E293B',
  text: '#0F172A', label: '#64748B', textLight: '#94A3B8',
};

function fmt(v: number) { return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
function fmtSaldo(v: number) { return (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
function mesAno(m: number, a: number) { return MESES[m] + ' ' + a; }
function saudacao() { const h = new Date().getHours(); if (h < 12) return 'Bom dia,'; if (h < 18) return 'Boa tarde,'; return 'Boa noite,'; }

function confirmar(titulo: string, mensagem: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${titulo}\n\n${mensagem}`)) onConfirm();
  } else {
    Alert.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

function adivinharCategoria(desc: string): string {
  const d = desc.toUpperCase();
  if (d.match(/IFOOD|RAPPI|RESTAURANTE|MERCADO|SUPERMERCADO|PADARIA|ACAI|PIZZA|BURGER|CAFE/)) return 'Alimentação';
  if (d.match(/UBER|99|POSTO|COMBUSTIVEL|ESTACIONAMENTO|METRO|ONIBUS|TAXI/)) return 'Transporte';
  if (d.match(/ALUGUEL|CONDOMINIO|LUZ|ENERGIA|AGUA|GAS|INTERNET|CLARO|VIVO|TIM/)) return 'Moradia';
  if (d.match(/FARMACIA|MEDICO|HOSPITAL|CLINICA|DENTISTA|ACADEMIA|SMARTFIT/)) return 'Saúde';
  if (d.match(/NETFLIX|SPOTIFY|AMAZON|DISNEY|STEAM|CINEMA|HBO|APPLE/)) return 'Lazer';
  if (d.match(/ESCOLA|FACULDADE|CURSO|UDEMY|ALURA/)) return 'Educação';
  if (d.match(/SALARIO|PAGAMENTO|PIX RECEBIDO/)) return 'Salário';
  return 'Outros';
}

function parseOFX(conteudo: string): TransacaoOFX[] {
  let blocos: string[] = [];
  const xmlBlocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi);
  if (xmlBlocos && xmlBlocos.length > 0) {
    blocos = xmlBlocos;
  } else {
    const partes = conteudo.split(/<STMTTRN>/i);
    blocos = partes.slice(1).map(p => '<STMTTRN>' + p.split(/<\/BANKTRANLIST>|<STMTTRN>/i)[0]);
  }
  return blocos.map((bloco, i) => {
    const get = (tag: string) => { const m = bloco.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i')); return m ? m[1].trim() : ''; };
    const valor = parseFloat(get('TRNAMT').replace(',', '.')) || 0;
    const desc = get('MEMO') || get('NAME') || 'Transação';
    const raw = get('DTPOSTED').substring(0, 8);
    const data = raw.length === 8 ? `${raw.substring(6,8)}/${raw.substring(4,6)}/${raw.substring(0,4)}` : new Date().toLocaleDateString('pt-BR');
    return { id: `ofx_${i}_${Date.now()}`, descricao: desc, valor: Math.abs(valor), tipo: valor >= 0 ? 'receita' : 'despesa', categoria: adivinharCategoria(desc), data, selecionada: true };
  }).filter(t => t.valor > 0);
}

function GraficoPizza({ dados }: { dados: [string, number][] }) {
  const total = dados.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;
  const SIZE = 200, R = 80, cx = 100, cy = 100;
  let ang = -Math.PI / 2;
  const fatias = dados.map(([cat, val]) => {
    const sweep = (val / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang);
    ang += sweep;
    const x2 = cx + R * Math.cos(ang), y2 = cy + R * Math.sin(ang);
    const large = sweep > Math.PI ? 1 : 0;
    return { cat, val, color: CORES_CAT[cat] || '#888', d: `M${cx} ${cy} L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2}Z` };
  });
  return (
    <View style={{ alignItems: 'center', marginBottom: 8 }}>
      <Svg width={SIZE} height={SIZE}>
        {fatias.map(f => <Path key={f.cat} d={f.d} fill={f.color} />)}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 }}>
        {fatias.map(f => (
          <View key={f.cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: f.color }} />
            <Text style={{ fontSize: 12, color: C.label }}>{f.cat} {Math.round(f.val/total*100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TelaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState<'login' | 'cadastro'>('login');
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    if (!email.trim() || !senha) { Alert.alert('Preencha todos os campos'); return; }
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) Alert.alert('Erro ao entrar', error.message);
    setCarregando(false);
  }

  async function cadastrar() {
    if (!email.trim() || !senha) { Alert.alert('Preencha todos os campos'); return; }
    if (senha.length < 6) { Alert.alert('Senha fraca', 'A senha deve ter pelo menos 6 caracteres.'); return; }
    setCarregando(true);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
    if (error) Alert.alert('Erro ao cadastrar', error.message);
    else Alert.alert('Conta criada!', 'Verifique seu e-mail para confirmar o cadastro.');
    setCarregando(false);
  }

  const inputStyle = {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 10,
    padding: 13, fontSize: 14 as const, marginBottom: 16,
    color: C.text, backgroundColor: C.bg,
  };

  const features = [
    { icon: '📊', text: 'Resumo visual do mês' },
    { icon: '🔄', text: 'Lançamentos recorrentes automáticos' },
    { icon: '🎯', text: 'Metas e alertas de gastos' },
  ];

  const LP = {
    bg: '#F5F3FF',
    accent: '#7C3AED',
    accentLight: '#EDE9FE',
    accentMid: '#DDD6FE',
    text: '#0F172A',
    label: '#64748B',
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LP.bg }}>
        <View style={{ flex: 1, flexDirection: 'row' }}>

          {/* ── Painel esquerdo — branding ── */}
          <View style={{ flex: 1.1, backgroundColor: LP.bg, paddingHorizontal: 56, paddingVertical: 48, justifyContent: 'space-between' }}>

            {/* Logo topo */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: LP.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>💰</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: LP.text }}>Meu Financeiro</Text>
            </View>

            {/* Headline block */}
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 32 }}>
              {/* Badge */}
              <View style={{ alignSelf: 'flex-start', backgroundColor: LP.accentLight, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginBottom: 22 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: LP.accent }}>Organize. Planeje. Conquiste.</Text>
              </View>

              {/* Título */}
              <Text style={{ fontSize: 42, fontWeight: '800', color: LP.text, lineHeight: 52, letterSpacing: -1, marginBottom: 16 }}>
                {'Sua vida financeira\nem '}
                <Text style={{ color: LP.accent }}>um só lugar</Text>
              </Text>

              {/* Subtítulo */}
              <Text style={{ fontSize: 15, color: LP.label, lineHeight: 26, marginBottom: 40, maxWidth: 380 }}>
                Acompanhe receitas, despesas, metas e tenha clareza total sobre seu dinheiro.
              </Text>

              {/* Features */}
              {[
                { icon: '📈', title: 'Visão completa', desc: 'Tenha controle de todas as suas finanças' },
                { icon: '🎯', title: 'Metas inteligentes', desc: 'Defina objetivos e acompanhe seu progresso' },
                { icon: '🔒', title: 'Seguro e privado', desc: 'Seus dados protegidos com segurança' },
              ].map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: LP.accentLight, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 19 }}>{f.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: LP.text, marginBottom: 2 }}>{f.title}</Text>
                    <Text style={{ fontSize: 12, color: LP.label }}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Mini mockup do app */}
            <View style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 220, backgroundColor: '#fff', borderRadius: 18, padding: 16, shadowColor: LP.accent, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10, borderWidth: 1, borderColor: LP.accentMid }}>
                <Text style={{ fontSize: 10, color: LP.label, marginBottom: 3 }}>Saldo atual</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: LP.text }}>R$ 2.560,75</Text>
                  <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                    <Text style={{ fontSize: 9, color: '#10B981', fontWeight: '700' }}>+12,5%</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 10, color: LP.label, marginBottom: 10 }}>Resumo do mês</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                  <View>
                    <Text style={{ fontSize: 9, color: '#10B981', fontWeight: '600', marginBottom: 2 }}>Receitas</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: LP.text }}>R$ 4.350,00</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 9, color: '#F43F5E', fontWeight: '600', marginBottom: 2 }}>Despesas</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: LP.text }}>R$ 1.789,25</Text>
                  </View>
                </View>
                {/* Mini barras */}
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end', height: 32 }}>
                  {[40, 65, 45, 80, 55, 90, 50].map((h, i) => (
                    <View key={i} style={{ flex: 1, justifyContent: 'flex-end' }}>
                      <View style={{ height: Math.round(h * 0.32), backgroundColor: i === 5 ? LP.accent : LP.accentLight, borderRadius: 3 }}/>
                    </View>
                  ))}
                </View>
              </View>
            </View>

          </View>

          {/* ── Painel direito — formulário ── */}
          <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 64, borderLeftWidth: 1, borderLeftColor: LP.accentMid }}>
            <View style={{ width: '100%', maxWidth: 380 }}>

              <Text style={{ fontSize: 28, fontWeight: '700', color: LP.text, letterSpacing: -0.5, marginBottom: 6 }}>
                {modo === 'login' ? 'Bem-vindo de volta' : 'Criar conta'}
              </Text>
              <Text style={{ fontSize: 14, color: LP.label, marginBottom: 36 }}>
                {modo === 'login' ? 'Entre na sua conta para continuar' : 'Crie sua conta gratuitamente'}
              </Text>

              <Text style={{ fontSize: 13, fontWeight: '600', color: LP.text, marginBottom: 7 }}>E-mail</Text>
              <TextInput
                style={[inputStyle, { borderColor: LP.accentMid }]}
                placeholder="seu@email.com"
                placeholderTextColor={C.textLight}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={{ fontSize: 13, fontWeight: '600', color: LP.text, marginBottom: 7 }}>Senha</Text>
              <TextInput
                style={[inputStyle, { borderColor: LP.accentMid, marginBottom: 28 }]}
                placeholder="••••••••"
                placeholderTextColor={C.textLight}
                value={senha}
                onChangeText={setSenha}
                secureTextEntry
              />

              <TouchableOpacity
                style={{ backgroundColor: LP.accent, borderRadius: 10, padding: 15, alignItems: 'center', opacity: carregando ? 0.6 : 1, marginBottom: 20 }}
                onPress={modo === 'login' ? entrar : cadastrar}
                disabled={carregando}
              >
                {carregando
                  ? <ActivityIndicator color="#fff"/>
                  : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{modo === 'login' ? 'Entrar' : 'Criar conta'}</Text>
                }
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
                <Text style={{ fontSize: 14, color: LP.label }}>
                  {modo === 'login' ? 'Não tem conta?' : 'Já tem conta?'}
                </Text>
                <TouchableOpacity onPress={() => setModo(modo === 'login' ? 'cadastro' : 'login')}>
                  <Text style={{ fontSize: 14, color: LP.accent, fontWeight: '700' }}>
                    {modo === 'login' ? 'Cadastre-se' : 'Entrar'}
                  </Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>

        </View>
      </SafeAreaView>
    );
  }

  // Layout mobile
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.primaryDark }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        {/* Hero topo */}
        <View style={{ paddingTop: 52, paddingBottom: 44, paddingHorizontal: 28, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 30 }}>💰</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#fff', letterSpacing: -0.5, marginBottom: 6 }}>Meu Financeiro</Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>Controle suas finanças com facilidade</Text>
        </View>

        {/* Card do formulário sobreposto */}
        <View style={{ flex: 1, backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.4, marginBottom: 4 }}>
            {modo === 'login' ? 'Entrar na conta' : 'Criar conta'}
          </Text>
          <Text style={{ fontSize: 13, color: C.label, marginBottom: 24 }}>
            {modo === 'login' ? 'Bem-vindo de volta 👋' : 'Preencha os dados abaixo'}
          </Text>

          <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 7 }}>E-mail</Text>
          <TextInput
            style={inputStyle}
            placeholder="seu@email.com"
            placeholderTextColor={C.textLight}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 7 }}>Senha</Text>
          <TextInput
            style={[inputStyle, { marginBottom: 28 }]}
            placeholder="••••••••"
            placeholderTextColor={C.textLight}
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
          />

          <TouchableOpacity
            style={{ backgroundColor: C.primary, borderRadius: 12, padding: 15, alignItems: 'center', opacity: carregando ? 0.6 : 1 }}
            onPress={modo === 'login' ? entrar : cadastrar}
            disabled={carregando}
          >
            {carregando
              ? <ActivityIndicator color="#fff"/>
              : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{modo === 'login' ? 'Entrar' : 'Criar conta'}</Text>
            }
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 20 }}>
            <Text style={{ fontSize: 14, color: C.label }}>{modo === 'login' ? 'Não tem conta?' : 'Já tem conta?'}</Text>
            <TouchableOpacity onPress={() => setModo(modo === 'login' ? 'cadastro' : 'login')}>
              <Text style={{ fontSize: 14, color: C.primary, fontWeight: '700' }}>{modo === 'login' ? 'Cadastre-se' : 'Entrar'}</Text>
            </TouchableOpacity>
          </View>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  const hoje = new Date();
  const [session, setSession] = useState<Session | null>(null);
  const [authCarregando, setAuthCarregando] = useState(true);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>('lancamentos');
  const [desc, setDesc] = useState('');
  const [val, setVal] = useState('');
  const [tipo, setTipo] = useState<Tipo>('despesa');
  const [cat, setCat] = useState('Alimentação');
  const [filtro, setFiltro] = useState<'todas' | Tipo>('todas');
  const [salvando, setSalvando] = useState(false);
  const [mesSel, setMesSel] = useState(hoje.getMonth());
  const [anoSel, setAnoSel] = useState(hoje.getFullYear());
  const [alertas, setAlertas] = useState<string[]>([]);
  const [showAlertas, setShowAlertas] = useState(false);
  const [metaTipo, setMetaTipo] = useState<'saldo' | 'categoria'>('saldo');
  const [metaCat, setMetaCat] = useState('Alimentação');
  const [metaVal, setMetaVal] = useState('');
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [recDesc, setRecDesc] = useState('');
  const [recVal, setRecVal] = useState('');
  const [recTipo, setRecTipo] = useState<Tipo>('despesa');
  const [recCat, setRecCat] = useState('Alimentação');
  const [salvandoRec, setSalvandoRec] = useState(false);
  const [recEhParcelado, setRecEhParcelado] = useState(false);
  const [recParcelas, setRecParcelas] = useState('');
  const [busca, setBusca] = useState('');
  const [txOFX, setTxOFX] = useState<TransacaoOFX[]>([]);
  const [arquivoNome, setArquivoNome] = useState('');
  const [salvandoOFX, setSalvandoOFX] = useState(false);
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth());
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear());
  const [txEditando, setTxEditando] = useState<Transacao | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editVal, setEditVal] = useState('');
  const [editTipo, setEditTipo] = useState<Tipo>('despesa');
  const [editCat, setEditCat] = useState('Alimentação');
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  // UX improvements
  const [showFormModal, setShowFormModal] = useState(false);
  const [limpandoDupl, setLimpandoDupl] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [instrucaoExpandida, setInstrucaoExpandida] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function limparDuplicatas() {
    setLimpandoDupl(true);
    const mesStr = String(hoje.getMonth() + 1).padStart(2, '0');
    const anoStr = String(hoje.getFullYear());
    const dataAlvo = `01/${mesStr}/${anoStr}`;
    const descRec = new Set(recorrentes.map(r => r.descricao.toLowerCase().trim()));
    // Encontra pares duplicados: mesma descrição + mesmo mês → mantém o mais antigo, apaga o mais recente
    const candidatas = transacoes.filter(t =>
      t.data === dataAlvo && descRec.has(t.descricao.toLowerCase().trim())
    );
    // Agrupa por descrição
    const porDesc: Record<string, Transacao[]> = {};
    candidatas.forEach(t => {
      const k = t.descricao.toLowerCase().trim();
      porDesc[k] = [...(porDesc[k] || []), t];
    });
    const idsApagar: string[] = [];
    Object.values(porDesc).forEach(grupo => {
      if (grupo.length > 1) {
        // Apaga todos exceto o primeiro (mais antigo pelo criado_em)
        const ordenados = [...grupo].sort((a, b) => (a.criado_em || '') < (b.criado_em || '') ? -1 : 1);
        ordenados.slice(1).forEach(t => idsApagar.push(t.id));
      }
    });
    if (idsApagar.length === 0) {
      Alert.alert('Nenhuma duplicata', 'Não foram encontradas transações duplicadas neste mês.');
      setLimpandoDupl(false);
      return;
    }
    confirmar(
      `Remover ${idsApagar.length} duplicata${idsApagar.length > 1 ? 's' : ''}`,
      `Foram encontradas ${idsApagar.length} transação(ões) duplicadas com data 01/${mesStr}/${anoStr}. Deseja removê-las?`,
      async () => {
        await supabase.from('transacoes').delete().in('id', idsApagar);
        const novas = transacoes.filter(t => !idsApagar.includes(t.id));
        setTransacoes(novas);
        calcularAlertas(novas, metas);
        mostrarToast(`🗑 ${idsApagar.length} duplicata${idsApagar.length > 1 ? 's removidas' : ' removida'}!`);
        setLimpandoDupl(false);
      }
    );
  }

  function mostrarToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthCarregando(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) carregarTudo(); }, [session]);

  async function carregarTudo() {
    setCarregando(true);
    const [r1, r2, r3] = await Promise.all([
      supabase.from('transacoes').select('*').order('criado_em', { ascending: false }),
      supabase.from('metas').select('*'),
      supabase.from('recorrentes').select('*').eq('ativo', true),
    ]);

    let todasTx: Transacao[] = r1.data || [];
    const todasMetas = r2.data || [];
    const todasRec = r3.data || [];

    setMetas(todasMetas);
    setRecorrentes(todasRec);

    // Auto-lança recorrentes se nenhuma delas já existir no mês atual
    if (todasRec.length > 0) {
      const mesStr = String(hoje.getMonth() + 1).padStart(2, '0');
      const anoStr = String(hoje.getFullYear());
      // Dedup: considera descrição base (antes do " (X/Y)") para evitar falsos negativos
      const txMesDesc = todasTx
        .filter(t => { const p = t.data?.split('/'); return p && p[1] === mesStr && p[2] === anoStr; })
        .map(t => t.descricao.toLowerCase().trim().replace(/\s*\(\d+\/\d+\)$/, ''));
      const descMesSet = new Set(txMesDesc);
      const paraInserir = todasRec.filter(r => !descMesSet.has(r.descricao.toLowerCase().trim()));

      if (paraInserir.length > 0) {
        const novasTx: Transacao[] = [];
        for (const r of paraInserir) {
          // Monta descrição com número da parcela se for parcelado
          let descricao = r.descricao;
          if (r.parcelas_total && r.parcelas_restantes) {
            const atual = r.parcelas_total - r.parcelas_restantes + 1;
            descricao = `${r.descricao} (${atual}/${r.parcelas_total})`;
          }
          const { data: ins } = await supabase.from('transacoes').insert({
            descricao, valor: r.valor, tipo: r.tipo,
            categoria: r.categoria, data: `01/${mesStr}/${anoStr}`,
          }).select();
          if (ins?.[0]) novasTx.push(ins[0]);

          // Atualiza parcelas restantes
          if (r.parcelas_restantes != null) {
            const restantes = r.parcelas_restantes - 1;
            if (restantes <= 0) {
              await supabase.from('recorrentes').update({ ativo: false }).eq('id', r.id);
            } else {
              await supabase.from('recorrentes').update({ parcelas_restantes: restantes }).eq('id', r.id);
            }
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
    setCarregando(false);
  }

  function calcularAlertas(txs: Transacao[], mts: Meta[]) {
    const novos: string[] = [];
    const txM = txs.filter(t => { const p = t.data?.split('/'); return p && parseInt(p[1])-1 === hoje.getMonth() && parseInt(p[2]) === hoje.getFullYear(); });
    const rec = txM.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
    const desp = txM.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
    mts.filter(m => m.mes === hoje.getMonth() && m.ano === hoje.getFullYear()).forEach(m => {
      if (m.tipo === 'saldo') { const sd = rec-desp; if (sd < m.valor) novos.push(`⚠️ Saldo ${fmt(sd)} abaixo da meta de ${fmt(m.valor)}`); }
      if (m.tipo === 'categoria' && m.categoria) {
        const g = txM.filter(t => t.tipo === 'despesa' && t.categoria === m.categoria).reduce((s,t) => s+Number(t.valor), 0);
        if (g > m.valor) novos.push(`🚨 ${m.categoria}: ${fmt(g)} (limite ${fmt(m.valor)})`);
        else if (g > m.valor * 0.8) novos.push(`⚠️ ${m.categoria}: ${Math.round(g/m.valor*100)}% do limite`);
      }
    });
    setAlertas(novos);
  }

  async function adicionar() {
    const v = parseFloat(val.replace(/\./g,'').replace(',','.'));
    if (!desc || isNaN(v) || v <= 0) return;
    setSalvando(true);
    const { data, error } = await supabase.from('transacoes').insert({ descricao: desc, valor: v, tipo, categoria: cat, data: hoje.toLocaleDateString('pt-BR') }).select();
    if (data) {
      const novas = [data[0], ...transacoes];
      setTransacoes(novas);
      setDesc('');
      setVal('');
      calcularAlertas(novas, metas);
      setShowFormModal(false);
      mostrarToast('✅ Lançamento adicionado!');
    }
    if (error) Alert.alert('Erro ao salvar', error.message);
    setSalvando(false);
  }

  async function remover(id: string) {
    confirmar('Excluir lançamento', 'Tem certeza que deseja excluir este lançamento?', async () => {
      await supabase.from('transacoes').delete().eq('id', id);
      const novas = transacoes.filter(t => t.id !== id);
      setTransacoes(novas);
      calcularAlertas(novas, metas);
      mostrarToast('🗑 Lançamento excluído');
    });
  }

  function abrirEdicao(t: Transacao) {
    setTxEditando(t);
    setEditDesc(t.descricao);
    setEditVal(String(t.valor).replace('.', ','));
    setEditTipo(t.tipo);
    setEditCat(t.categoria);
  }

  async function salvarEdicao() {
    if (!txEditando) return;
    const v = parseFloat(editVal.replace(/\./g,'').replace(',','.'));
    if (!editDesc.trim() || isNaN(v) || v <= 0) { Alert.alert('Dados inválidos', 'Preencha descrição e valor corretamente.'); return; }
    setSalvandoEdit(true);
    const { data, error } = await supabase.from('transacoes').update({ descricao: editDesc.trim(), valor: v, tipo: editTipo, categoria: editCat }).eq('id', txEditando.id).select();
    if (error) { Alert.alert('Erro ao editar', error.message); }
    else if (data) {
      const novas = transacoes.map(t => t.id === txEditando.id ? data[0] : t);
      setTransacoes(novas); calcularAlertas(novas, metas);
      setTxEditando(null);
      mostrarToast('✏️ Lançamento atualizado!');
    }
    setSalvandoEdit(false);
  }

  async function adicionarMeta() {
    const v = parseFloat(metaVal.replace(/\./g,'').replace(',','.'));
    if (isNaN(v) || v <= 0) return;
    setSalvandoMeta(true);
    const { data } = await supabase.from('metas').insert({ tipo: metaTipo, categoria: metaTipo === 'categoria' ? metaCat : null, valor: v, mes: hoje.getMonth(), ano: hoje.getFullYear() }).select();
    if (data) { const novas = [...metas, data[0]]; setMetas(novas); setMetaVal(''); calcularAlertas(transacoes, novas); mostrarToast('🎯 Meta salva!'); }
    setSalvandoMeta(false);
  }

  async function removerMeta(id: string) {
    confirmar('Excluir meta', 'Deseja remover esta meta?', async () => {
      await supabase.from('metas').delete().eq('id', id);
      const novas = metas.filter(m => m.id !== id);
      setMetas(novas);
      calcularAlertas(transacoes, novas);
    });
  }

  async function adicionarRecorrente() {
    const v = parseFloat(recVal.replace(/\./g,'').replace(',','.'));
    if (!recDesc || isNaN(v) || v <= 0) return;
    const parcTotal = recEhParcelado ? parseInt(recParcelas) : null;
    if (recEhParcelado && (!parcTotal || parcTotal < 2)) {
      Alert.alert('Parcelas inválidas', 'Informe ao menos 2 parcelas.');
      return;
    }
    setSalvandoRec(true);
    const { data } = await supabase.from('recorrentes').insert({
      descricao: recDesc, valor: v, tipo: recTipo, categoria: recCat, ativo: true,
      parcelas_total: parcTotal, parcelas_restantes: parcTotal,
    }).select();
    if (data) {
      setRecorrentes([...recorrentes, data[0]]);
      setRecDesc(''); setRecVal(''); setRecParcelas(''); setRecEhParcelado(false);
      mostrarToast('🔄 Recorrente adicionada!');
    }
    setSalvandoRec(false);
  }

  async function removerRecorrente(id: string) {
    confirmar('Remover recorrente', 'Deseja remover esta despesa recorrente?', async () => {
      await supabase.from('recorrentes').update({ ativo: false }).eq('id', id);
      setRecorrentes(recorrentes.filter(r => r.id !== id));
      mostrarToast('🗑 Recorrente removida');
    });
  }

  async function salvarOFX() {
    const sel = txOFX.filter(t => t.selecionada);
    if (!sel.length) return;
    setSalvandoOFX(true);
    const { data, error } = await supabase.from('transacoes').insert(sel.map(({ id, selecionada, ...r }) => r)).select();
    if (error) {
      Alert.alert('Erro ao salvar', error.message);
    } else if (data && data.length > 0) {
      const novas = [...data, ...transacoes];
      setTransacoes(novas);
      setTxOFX([]);
      setArquivoNome('');
      setAba('lancamentos');
      calcularAlertas(novas, metas);
      mostrarToast(`✅ ${data.length} transações importadas!`);
    }
    setSalvandoOFX(false);
  }

  async function exportarCSV() {
    setShowExportMenu(false);
    const cab = 'Data,Descrição,Tipo,Categoria,Valor\n';
    const linhas = transacoes
      .filter(t => { const p = t.data?.split('/'); return p && parseInt(p[1])-1 === filtroMes && parseInt(p[2]) === filtroAno; })
      .map(t => `${t.data},"${t.descricao}",${t.tipo},${t.categoria},${t.valor}`)
      .join('\n');
    if (!linhas) { Alert.alert('Sem dados', 'Nenhum lançamento no período selecionado.'); return; }
    const path = FileSystem.documentDirectory + `financeiro_${MESES[filtroMes]}_${filtroAno}.csv`;
    await FileSystem.writeAsStringAsync(path, cab + linhas, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Exportar relatório' });
  }

  async function exportarPDF() {
    setShowExportMenu(false);
    const txMesFiltro = transacoes.filter(t => { const p = t.data?.split('/'); return p && parseInt(p[1])-1 === filtroMes && parseInt(p[2]) === filtroAno; });
    if (!txMesFiltro.length) { Alert.alert('Sem dados', 'Nenhum lançamento no período selecionado.'); return; }
    const totalReceitas = txMesFiltro.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const totalDespesas = txMesFiltro.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
    const saldo = totalReceitas - totalDespesas;
    const linhas = txMesFiltro.map(t => `
      <tr>
        <td>${t.data}</td>
        <td>${t.descricao}</td>
        <td>${ICONES_CAT[t.categoria]} ${t.categoria}</td>
        <td style="color:${t.tipo === 'receita' ? '#16a34a' : '#dc2626'}">${t.tipo === 'receita' ? '+' : '-'} ${fmt(t.valor)}</td>
      </tr>`).join('');
    const html = `
      <html><head><meta charset="utf-8"/>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; }
        h1 { color: #1d4ed8; font-size: 22px; margin-bottom: 4px; }
        .periodo { color: #64748b; font-size: 14px; margin-bottom: 20px; }
        .resumo { display: flex; gap: 16px; margin-bottom: 24px; }
        .card { flex: 1; padding: 12px 16px; border-radius: 8px; }
        .card.receita { background: #dcfce7; }
        .card.despesa { background: #fee2e2; }
        .card.saldo { background: #dbeafe; }
        .card label { font-size: 11px; color: #64748b; display: block; }
        .card span { font-size: 16px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #1d4ed8; color: white; padding: 8px 10px; text-align: left; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) td { background: #f8fafc; }
      </style></head>
      <body>
        <h1>Relatório Financeiro</h1>
        <div class="periodo">${MESES[filtroMes]} de ${filtroAno}</div>
        <div class="resumo">
          <div class="card receita"><label>Receitas</label><span>${fmt(totalReceitas)}</span></div>
          <div class="card despesa"><label>Despesas</label><span>${fmt(totalDespesas)}</span></div>
          <div class="card saldo"><label>Saldo</label><span style="color:${saldo >= 0 ? '#16a34a' : '#dc2626'}">${fmtSaldo(saldo)}</span></div>
        </div>
        <table>
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar PDF' });
  }

  async function selecionarOFX() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setArquivoNome(asset.name);
      let conteudo = '';
      try {
        conteudo = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      } catch {
        conteudo = await FileSystem.readAsStringAsync(asset.uri);
      }
      const transacoesOFX = parseOFX(conteudo);
      if (transacoesOFX.length === 0) {
        Alert.alert('Arquivo não reconhecido', `Nenhuma transação encontrada.\n\nPrimeiros 200 chars:\n${conteudo.substring(0, 200)}`);
        return;
      }
      setTxOFX(transacoesOFX);
    } catch (e: any) {
      Alert.alert('Erro ao ler arquivo', e?.message || String(e));
    }
  }

  function txDoMes(m: number, a: number) { return transacoes.filter(t => { const p = t.data?.split('/'); return p && parseInt(p[1])-1 === m && parseInt(p[2]) === a; }); }

  // Resumo tab
  const txMes = txDoMes(mesSel, anoSel);
  const receitasMes = txMes.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
  const despesasMes = txMes.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
  const saldoMes = receitasMes - despesasMes;
  const catMap: Record<string,number> = {};
  txMes.filter(t => t.tipo === 'despesa').forEach(t => { catMap[t.categoria] = (catMap[t.categoria]||0)+Number(t.valor); });
  const cats = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
  const maxCat = cats.length > 0 ? cats[0][1] : 1;

  // Mês atual (hero)
  const txAtual = txDoMes(hoje.getMonth(), hoje.getFullYear());
  const recAtual = txAtual.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
  const despAtual = txAtual.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
  const saldoAtual = recAtual - despAtual;
  const metasMes = metas.filter(m => m.mes === hoje.getMonth() && m.ano === hoje.getFullYear());

  // Mês do filtro (lancamentos tab)
  const txFiltroMes = txDoMes(filtroMes, filtroAno);
  const recFiltroMes = txFiltroMes.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
  const despFiltroMes = txFiltroMes.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
  const saldoFiltroMes = recFiltroMes - despFiltroMes;

  // Mês anterior para comparação %
  const filtroMesAntIdx = filtroMes === 0 ? 11 : filtroMes - 1;
  const filtroAnoAntIdx = filtroMes === 0 ? filtroAno - 1 : filtroAno;
  const txMesAnt = txDoMes(filtroMesAntIdx, filtroAnoAntIdx);
  const recMesAnt = txMesAnt.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
  const despMesAnt = txMesAnt.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
  const pctRec = recMesAnt > 0 ? ((recFiltroMes - recMesAnt) / recMesAnt * 100) : null;
  const pctDesp = despMesAnt > 0 ? ((despFiltroMes - despMesAnt) / despMesAnt * 100) : null;

  // Maior categoria do filtro
  const catMapFiltro: Record<string,number> = {};
  txFiltroMes.filter(t => t.tipo === 'despesa').forEach(t => { catMapFiltro[t.categoria] = (catMapFiltro[t.categoria]||0)+Number(t.valor); });
  const catsFiltro = Object.entries(catMapFiltro).sort((a,b) => b[1]-a[1]);
  const maiorCat = catsFiltro[0];

  // Transações visíveis com busca
  const visiveis = transacoes.filter(t => {
    const p = t.data?.split('/');
    const noMes = p && parseInt(p[1])-1 === filtroMes && parseInt(p[2]) === filtroAno;
    const matchTipo = filtro === 'todas' || t.tipo === filtro;
    const matchBusca = !busca || t.descricao.toLowerCase().includes(busca.toLowerCase()) || t.categoria.toLowerCase().includes(busca.toLowerCase());
    return noMes && matchTipo && matchBusca;
  });

  // Agrupamento por data
  function formatarDataGrupo(dataStr: string): string {
    const hojeStr = hoje.toLocaleDateString('pt-BR');
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    const ontemStr = ontem.toLocaleDateString('pt-BR');
    if (dataStr === hojeStr) return 'Hoje';
    if (dataStr === ontemStr) return 'Ontem';
    const p = dataStr.split('/');
    if (p.length === 3) return `${parseInt(p[0])} de ${MESES[parseInt(p[1])-1]}`;
    return dataStr;
  }
  const txAgrupadas = visiveis.reduce((acc, t) => { if (!acc[t.data]) acc[t.data] = []; acc[t.data].push(t); return acc; }, {} as Record<string, Transacao[]>);
  const datasOrdenadas = Object.keys(txAgrupadas).sort((a, b) => {
    const [da,ma,ya] = a.split('/').map(Number);
    const [db,mb,yb] = b.split('/').map(Number);
    return new Date(yb,mb-1,db).getTime() - new Date(ya,ma-1,da).getTime();
  });

  const selOFX = txOFX.filter(t => t.selecionada).length;

  // Dados para aba Resumo
  const mesSeldAnt = mesSel === 0 ? 11 : mesSel - 1;
  const anoSelAnt  = mesSel === 0 ? anoSel - 1 : anoSel;
  const txMesSelAnt   = txDoMes(mesSeldAnt, anoSelAnt);
  const recMesSelAnt  = txMesSelAnt.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
  const despMesSelAnt = txMesSelAnt.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
  const pctRecSel  = recMesSelAnt  > 0 ? (receitasMes  - recMesSelAnt)  / recMesSelAnt  * 100 : null;
  const pctDespSel = despMesSelAnt > 0 ? (despesasMes  - despMesSelAnt) / despMesSelAnt * 100 : null;

  // Tendência histórica — 4 meses
  const tendencia = Array.from({ length: 4 }, (_, i) => {
    let m = mesSel - (3 - i), a = anoSel;
    while (m < 0) { m += 12; a--; }
    const txM = txDoMes(m, a);
    const rec  = txM.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
    const desp = txM.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
    return { label: MESES[m].substring(0, 3), rec, desp };
  });
  const tendMax = Math.max(...tendencia.map(t => Math.max(t.rec, t.desp)), 1);

  // Insights automáticos
  const insights: string[] = (() => {
    const r: string[] = [];
    if (pctDespSel !== null && Math.abs(pctDespSel) > 5)
      r.push(pctDespSel > 0
        ? `📈 Despesas aumentaram ${Math.round(pctDespSel)}% vs ${MESES[mesSeldAnt]}.`
        : `📉 Despesas caíram ${Math.abs(Math.round(pctDespSel))}% vs ${MESES[mesSeldAnt]}. Ótimo!`);
    if (cats.length > 0 && despesasMes > 0)
      r.push(`🏷 ${cats[0][0]} foi sua maior despesa (${Math.round(cats[0][1] / despesasMes * 100)}% do total).`);
    if (saldoMes < 0)
      r.push(`⚠️ Você gastou ${fmt(Math.abs(saldoMes))} a mais do que recebeu.`);
    else if (saldoMes > 0 && receitasMes > 0)
      r.push(`✅ Você economizou ${fmt(saldoMes)} (${Math.round(saldoMes / receitasMes * 100)}% da receita).`);
    return r.slice(0, 3);
  })();

  function getProgMeta(m: Meta) {
    if (m.tipo === 'saldo') return { atual: saldoAtual, max: m.valor, pct: Math.min(Math.max(saldoAtual/m.valor*100,0),100), ok: saldoAtual >= m.valor };
    const g = txAtual.filter(t => t.tipo === 'despesa' && t.categoria === m.categoria).reduce((s,t) => s+Number(t.valor), 0);
    return { atual: g, max: m.valor, pct: Math.min(g/m.valor*100,100), ok: g <= m.valor };
  }

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

      {/* ── Modal: editar lançamento ── */}
      <Modal visible={!!txEditando} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalBox}>
              <View style={s.modalHandle}/>
              <Text style={s.modalTitulo}>✏️ Editar lançamento</Text>
              <TextInput style={s.input} placeholder="Descrição" placeholderTextColor={C.textLight} value={editDesc} onChangeText={setEditDesc}/>
              <TextInput style={s.input} placeholder="Valor (ex: 2450,00)" placeholderTextColor={C.textLight} value={editVal} onChangeText={setEditVal} keyboardType="decimal-pad"/>
              <View style={s.row}>
                <TouchableOpacity style={[s.tipoBtn, editTipo === 'receita' && { backgroundColor: C.receita, borderColor: C.receita }]} onPress={() => setEditTipo('receita')}>
                  <Text style={[s.tipoBtnText, editTipo === 'receita' && { color: '#fff' }]}>Receita</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.tipoBtn, editTipo === 'despesa' && { backgroundColor: C.despesa, borderColor: C.despesa }]} onPress={() => setEditTipo('despesa')}>
                  <Text style={[s.tipoBtnText, editTipo === 'despesa' && { color: '#fff' }]}>Despesa</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.catScroll, { marginBottom: 12 }]}>
                {CATEGORIAS.map(c => (
                  <TouchableOpacity key={c} style={[s.catBtn, editCat === c && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setEditCat(c)}>
                    <Text style={[s.catBtnText, editCat === c && { color: '#fff' }]}>{ICONES_CAT[c]} {c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.bgAccent }]} onPress={() => setTxEditando(null)}>
                  <Text style={[s.btnText, { color: C.primaryDark }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { flex: 2, backgroundColor: C.primary, opacity: salvandoEdit ? 0.6 : 1 }]} onPress={salvarEdicao} disabled={salvandoEdit}>
                  <Text style={[s.btnText, { color: '#fff' }]}>{salvandoEdit ? 'Salvando...' : 'Salvar alterações'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>


      {/* ── Modal: novo lançamento (FAB) ── */}
      <Modal visible={showFormModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalBox}>
              <View style={s.modalHandle}/>
              <Text style={s.modalTitulo}>➕ Novo lançamento</Text>
              <TextInput style={s.input} placeholder="Descrição" placeholderTextColor={C.textLight} value={desc} onChangeText={setDesc}/>
              <TextInput style={s.input} placeholder="Valor (ex: 2450,00)" placeholderTextColor={C.textLight} value={val} onChangeText={setVal} keyboardType="decimal-pad"/>
              <View style={s.row}>
                <TouchableOpacity style={[s.tipoBtn, tipo === 'receita' && { backgroundColor: C.receita, borderColor: C.receita }]} onPress={() => setTipo('receita')}>
                  <Text style={[s.tipoBtnText, tipo === 'receita' && { color: '#fff' }]}>↑ Receita</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.tipoBtn, tipo === 'despesa' && { backgroundColor: C.despesa, borderColor: C.despesa }]} onPress={() => setTipo('despesa')}>
                  <Text style={[s.tipoBtnText, tipo === 'despesa' && { color: '#fff' }]}>↓ Despesa</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
                {CATEGORIAS.map(c => (
                  <TouchableOpacity key={c} style={[s.catBtn, cat === c && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setCat(c)}>
                    <Text style={[s.catBtnText, cat === c && { color: '#fff' }]}>{ICONES_CAT[c]} {c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.bgAccent }]} onPress={() => { setShowFormModal(false); setDesc(''); setVal(''); }}>
                  <Text style={[s.btnText, { color: C.primaryDark }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { flex: 2, backgroundColor: C.primary, opacity: salvando ? 0.6 : 1 }]} onPress={adicionar} disabled={salvando}>
                  <Text style={[s.btnText, { color: '#fff' }]}>{salvando ? 'Salvando...' : 'Salvar lançamento'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Modal: exportar ── */}
      <Modal visible={showExportMenu} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowExportMenu(false)}>
          <View style={[s.modalBox, { paddingBottom: 24 }]}>
            <View style={s.modalHandle}/>
            <Text style={s.modalTitulo}>📤 Exportar relatório</Text>
            <Text style={s.modalSub}>{MESES[filtroMes]} de {filtroAno}</Text>
            <TouchableOpacity style={[s.exportOpcao, { borderColor: C.receita }]} onPress={exportarCSV}>
              <Text style={{ fontSize: 28, marginBottom: 4 }}>📊</Text>
              <Text style={[s.exportOpcaoTitulo, { color: C.receita }]}>Planilha CSV</Text>
              <Text style={s.exportOpcaoSub}>Abrir no Excel ou Google Sheets</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.exportOpcao, { borderColor: C.despesa }]} onPress={exportarPDF}>
              <Text style={{ fontSize: 28, marginBottom: 4 }}>📄</Text>
              <Text style={[s.exportOpcaoTitulo, { color: C.despesa }]}>Relatório PDF</Text>
              <Text style={s.exportOpcaoSub}>Com resumo e tabela completa</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Layout principal com sidebar web ── */}
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

          {/* ── Alertas ── */}
          {alertas.length > 0 && (
            <TouchableOpacity style={s.alertaBanner} onPress={() => setShowAlertas(!showAlertas)}>
              <Text style={s.alertaBannerText}>🚨 {alertas.length} alerta{alertas.length > 1 ? 's' : ''} — toque para ver</Text>
            </TouchableOpacity>
          )}
          {showAlertas && alertas.map((a, i) => <Text key={i} style={s.alertaItem}>{a}</Text>)}

      {/* ── Aba: Início ── */}
      {aba === 'lancamentos' && (
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={s.pageHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.greeting}>{saudacao()} 👋</Text>
              <Text style={s.pageTitle}>Minhas Finanças</Text>
              <Text style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>Aqui está o resumo das suas finanças</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {/* Seletor de mês */}
              <View style={s.mesSeletorHeader}>
                <TouchableOpacity onPress={() => filtroMes === 0 ? (setFiltroMes(11), setFiltroAno(filtroAno-1)) : setFiltroMes(filtroMes-1)}>
                  <Text style={{ color: C.primary, fontSize: 16, paddingHorizontal: 4 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{MESES[filtroMes].substring(0,3)} {filtroAno}</Text>
                <TouchableOpacity onPress={() => filtroMes === 11 ? (setFiltroMes(0), setFiltroAno(filtroAno+1)) : setFiltroMes(filtroMes+1)}>
                  <Text style={{ color: C.primary, fontSize: 16, paddingHorizontal: 4 }}>›</Text>
                </TouchableOpacity>
              </View>
              {Platform.OS !== 'web' && (
                <TouchableOpacity style={s.avatar} onPress={() => supabase.auth.signOut()}>
                  <Text style={s.avatarText}>↩</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Hero card */}
          <View style={s.heroCard}>
            <View style={s.heroCircle1} pointerEvents="none"/>
            <View style={s.heroCircle2} pointerEvents="none"/>
            <Text style={s.heroLabel}>SALDO ATUAL</Text>
            <Text style={[s.heroVal, { color: saldoFiltroMes >= 0 ? '#FFFFFF' : '#FCA5A5' }]}>{fmtSaldo(saldoFiltroMes)}</Text>
            <View style={[s.heroBadge, { backgroundColor: saldoFiltroMes >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)' }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: saldoFiltroMes >= 0 ? '#6EE7B7' : '#FCA5A5' }}>
                {saldoFiltroMes >= 0 ? '✓ Superávit neste mês' : '↓ Déficit neste mês'}
              </Text>
            </View>
            <View style={s.heroRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroSubLabel}>RECEITAS</Text>
                <Text style={s.heroSubVal}>{fmt(recFiltroMes)}</Text>
                {pctRec !== null && <Text style={{ fontSize: 11, color: pctRec >= 0 ? '#6EE7B7' : '#FCA5A5', marginTop: 2 }}>{pctRec >= 0 ? '▲' : '▼'} {Math.abs(Math.round(pctRec))}% vs mês ant.</Text>}
              </View>
              <View style={s.heroDivider}/>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={s.heroSubLabel}>DESPESAS</Text>
                <Text style={s.heroSubVal}>{fmt(despFiltroMes)}</Text>
                {pctDesp !== null && <Text style={{ fontSize: 11, color: pctDesp > 0 ? '#FCA5A5' : '#6EE7B7', marginTop: 2 }}>{pctDesp > 0 ? '▲' : '▼'} {Math.abs(Math.round(pctDesp))}% vs mês ant.</Text>}
              </View>
            </View>
          </View>

          {/* Stats row — 4 cards */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <View style={s.statCard}>
              <View style={[s.statIcone, { backgroundColor: C.receitaBg }]}><Text>↑</Text></View>
              <Text style={s.statLabel}>Receitas</Text>
              <Text style={[s.statVal, { color: C.receita }]}>{fmt(recFiltroMes)}</Text>
              {pctRec !== null && <Text style={[s.statPct, { color: pctRec >= 0 ? C.receita : C.despesa }]}>{pctRec >= 0 ? '+' : ''}{Math.round(pctRec)}% vs {MESES[filtroMesAntIdx].substring(0,3)}</Text>}
            </View>
            <View style={s.statCard}>
              <View style={[s.statIcone, { backgroundColor: C.despesaBg }]}><Text>↓</Text></View>
              <Text style={s.statLabel}>Despesas</Text>
              <Text style={[s.statVal, { color: C.despesa }]}>{fmt(despFiltroMes)}</Text>
              {pctDesp !== null && <Text style={[s.statPct, { color: pctDesp > 0 ? C.despesa : C.receita }]}>{pctDesp > 0 ? '+' : ''}{Math.round(pctDesp)}% vs {MESES[filtroMesAntIdx].substring(0,3)}</Text>}
            </View>
            <View style={s.statCard}>
              <View style={[s.statIcone, { backgroundColor: C.bgAccent }]}><Text>🏷</Text></View>
              <Text style={s.statLabel}>Maior categoria</Text>
              <Text style={[s.statVal, { color: C.text, fontSize: 14 }]}>{maiorCat ? maiorCat[0] : '—'}</Text>
              {maiorCat && <Text style={s.statPct}>{fmt(maiorCat[1])}</Text>}
            </View>
            <View style={s.statCard}>
              <View style={[s.statIcone, { backgroundColor: C.bgAccent }]}><Text>💰</Text></View>
              <Text style={s.statLabel}>Previsto fechar</Text>
              <Text style={[s.statVal, { color: saldoFiltroMes >= 0 ? C.receita : C.despesa, fontSize: 14 }]}>{fmtSaldo(saldoFiltroMes)}</Text>
              <Text style={[s.statPct, { color: saldoFiltroMes >= 0 ? C.receita : C.despesa }]}>{saldoFiltroMes >= 0 ? 'Superávit' : 'Déficit'}</Text>
            </View>
          </ScrollView>

          {/* Busca + filtros + exportar */}
          <View style={s.buscaRow}>
            <View style={s.buscaInput}>
              <Text style={{ fontSize: 14, color: C.textLight, marginRight: 6 }}>🔍</Text>
              <TextInput
                style={{ flex: 1, fontSize: 13, color: C.text }}
                placeholder="Buscar transação..."
                placeholderTextColor={C.textLight}
                value={busca}
                onChangeText={setBusca}
              />
              {busca.length > 0 && (
                <TouchableOpacity onPress={() => setBusca('')}>
                  <Text style={{ color: C.textLight, fontSize: 13 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={s.exportBtn} onPress={() => setShowExportMenu(true)}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>📤</Text>
            </TouchableOpacity>
          </View>
          <View style={[s.filtros, { paddingTop: 0 }]}>
            {(['todas','receita','despesa'] as const).map(f => (
              <TouchableOpacity key={f} style={[s.filtroBtn, filtro === f && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setFiltro(f)}>
                <Text style={[s.filtroBtnText, filtro === f && { color: '#fff' }]}>{f === 'todas' ? 'Todas' : f === 'receita' ? 'Receitas' : 'Despesas'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Lista agrupada por data */}
          {carregando ? (
            <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }}/>
          ) : visiveis.length === 0 ? (
            <View style={s.vazioContainer}>
              <Text style={s.vazioEmoji}>💸</Text>
              <Text style={s.vazioTitulo}>{busca ? 'Nenhum resultado' : 'Nenhum lançamento'}</Text>
              <Text style={s.vazioSub}>{busca ? `Nenhuma transação encontrada para "${busca}".` : `Toque no botão + para adicionar sua primeira transação de ${MESES[filtroMes]}.`}</Text>
            </View>
          ) : (
            datasOrdenadas.map(dataKey => (
              <View key={dataKey}>
                <Text style={s.dataGrupoHeader}>{formatarDataGrupo(dataKey)}</Text>
                {txAgrupadas[dataKey].map(t => (
                  <View key={t.id} style={s.txItem}>
                    <View style={[s.txIcone, { backgroundColor: t.tipo === 'receita' ? C.receitaBg : C.despesaBg }]}>
                      <Text style={{ fontSize: 16 }}>{ICONES_CAT[t.categoria]}</Text>
                    </View>
                    <View style={s.txInfo}>
                      <Text style={s.txDesc}>{t.descricao}</Text>
                      <Text style={s.txMeta}>{t.categoria}</Text>
                    </View>
                    <Text style={[s.txValor, { color: t.tipo === 'receita' ? C.receita : C.despesa }]}>{t.tipo === 'receita' ? '+' : '-'} {fmt(t.valor)}</Text>
                    <TouchableOpacity onPress={() => abrirEdicao(t)} style={{ padding: 4 }}><Text style={{ fontSize: 15 }}>✏️</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => remover(t.id)} style={{ padding: 4 }}><Text style={{ color: C.textLight, fontSize: 14 }}>✕</Text></TouchableOpacity>
                  </View>
                ))}
              </View>
            ))
          )}
          <View style={{ height: 100 }}/>
        </ScrollView>
      )}

      {/* ── Aba: Resumo ── */}
      {aba === 'resumo' && (
        <ScrollView style={s.scroll}>

          {/* Header */}
          <View style={s.pageHeader}>
            <View>
              <Text style={s.greeting}>Análise mensal</Text>
              <Text style={s.pageTitle}>Resumo</Text>
            </View>
            <View style={s.mesSeletorHeader}>
              <TouchableOpacity onPress={() => mesSel === 0 ? (setMesSel(11), setAnoSel(anoSel-1)) : setMesSel(mesSel-1)}>
                <Text style={{ color: C.primary, fontSize: 16, paddingHorizontal: 4 }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{MESES[mesSel].substring(0,3)} {anoSel}</Text>
              <TouchableOpacity onPress={() => mesSel === 11 ? (setMesSel(0), setAnoSel(anoSel+1)) : setMesSel(mesSel+1)}>
                <Text style={{ color: C.primary, fontSize: 16, paddingHorizontal: 4 }}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Hero do resumo */}
          <View style={s.heroCard}>
            <View style={s.heroCircle1} pointerEvents="none"/>
            <View style={s.heroCircle2} pointerEvents="none"/>
            <Text style={s.heroLabel}>SALDO DE {MESES[mesSel].toUpperCase()}</Text>
            <Text style={[s.heroVal, { color: saldoMes >= 0 ? '#fff' : '#FCA5A5' }]}>{fmtSaldo(saldoMes)}</Text>
            <View style={[s.heroBadge, { backgroundColor: saldoMes >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)' }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: saldoMes >= 0 ? '#6EE7B7' : '#FCA5A5' }}>
                {saldoMes >= 0 ? '✓ Superávit neste mês' : '↓ Déficit neste mês'}
              </Text>
            </View>
            <View style={s.heroRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroSubLabel}>RECEITAS</Text>
                <Text style={s.heroSubVal}>{fmt(receitasMes)}</Text>
                {pctRecSel !== null && <Text style={{ fontSize: 11, color: pctRecSel >= 0 ? '#6EE7B7' : '#FCA5A5', marginTop: 2 }}>{pctRecSel >= 0 ? '▲' : '▼'} {Math.abs(Math.round(pctRecSel))}% vs mês ant.</Text>}
              </View>
              <View style={s.heroDivider}/>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={s.heroSubLabel}>DESPESAS</Text>
                <Text style={s.heroSubVal}>{fmt(despesasMes)}</Text>
                {pctDespSel !== null && <Text style={{ fontSize: 11, color: pctDespSel > 0 ? '#FCA5A5' : '#6EE7B7', marginTop: 2 }}>{pctDespSel > 0 ? '▲' : '▼'} {Math.abs(Math.round(pctDespSel))}% vs mês ant.</Text>}
              </View>
            </View>
          </View>

          {/* Receitas vs Despesas */}
          {(receitasMes > 0 || despesasMes > 0) && (
            <View style={s.section}>
              <Text style={s.sectionTitulo}>Receitas vs Despesas</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1, backgroundColor: C.receitaBg, borderRadius: 10, padding: 10 }}>
                  <Text style={{ fontSize: 11, color: C.receita, fontWeight: '600', marginBottom: 2 }}>RECEITAS</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: C.receita }}>{fmt(receitasMes)}</Text>
                  <Text style={{ fontSize: 11, color: C.label, marginTop: 2 }}>{receitasMes > 0 ? Math.round(receitasMes/(receitasMes+despesasMes)*100) : 0}% do total</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: C.despesaBg, borderRadius: 10, padding: 10 }}>
                  <Text style={{ fontSize: 11, color: C.despesa, fontWeight: '600', marginBottom: 2 }}>DESPESAS</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: C.despesa }}>{fmt(despesasMes)}</Text>
                  <Text style={{ fontSize: 11, color: C.label, marginTop: 2 }}>{despesasMes > 0 ? Math.round(despesasMes/(receitasMes+despesasMes)*100) : 0}% do total</Text>
                </View>
              </View>
              <View style={[s.barComp, { height: 20, borderRadius: 10 }]}>
                {receitasMes > 0 && <View style={[s.barSeg, { flex: receitasMes, backgroundColor: C.receita }]}/>}
                {despesasMes > 0 && <View style={[s.barSeg, { flex: despesasMes, backgroundColor: C.despesa }]}/>}
              </View>
            </View>
          )}

          {/* Tendência histórica */}
          <View style={s.section}>
            <Text style={s.sectionTitulo}>Evolução — últimos 4 meses</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 80, marginBottom: 8 }}>
              {tendencia.map((t, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 60 }}>
                    <View style={{ width: 10, height: Math.max((t.rec / tendMax) * 60, t.rec > 0 ? 4 : 0), backgroundColor: C.receita, borderRadius: 3 }}/>
                    <View style={{ width: 10, height: Math.max((t.desp / tendMax) * 60, t.desp > 0 ? 4 : 0), backgroundColor: C.despesa, borderRadius: 3 }}/>
                  </View>
                  <Text style={{ fontSize: 10, color: C.textLight, marginTop: 4 }}>{t.label}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.receita }}/><Text style={{ fontSize: 12, color: C.label }}>Receitas</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.despesa }}/><Text style={{ fontSize: 12, color: C.label }}>Despesas</Text></View>
            </View>
          </View>

          {/* Despesas por categoria */}
          {cats.length > 0 ? (
            <View style={s.section}>
              <Text style={s.sectionTitulo}>Despesas por categoria</Text>
              <GraficoPizza dados={cats} />
              <View style={{ marginTop: 8 }}>
                {cats.map(([c, v]) => {
                  const pct = despesasMes > 0 ? Math.round(v / despesasMes * 100) : 0;
                  const cor = CORES_CAT[c] || C.primary;
                  return (
                    <View key={c} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: cor + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13 }}>{ICONES_CAT[c]}</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: C.label, width: 80 }}>{c}</Text>
                      <View style={{ flex: 1, height: 8, backgroundColor: C.bgAccent, borderRadius: 4, overflow: 'hidden' }}>
                        <View style={{ height: 8, borderRadius: 4, width: `${pct}%` as any, backgroundColor: cor }}/>
                      </View>
                      <Text style={{ fontSize: 11, color: C.label, width: 30, textAlign: 'right' }}>{pct}%</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, width: 78, textAlign: 'right' }}>{fmt(v)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={s.vazioContainer}>
              <Text style={s.vazioEmoji}>📊</Text>
              <Text style={s.vazioTitulo}>Sem despesas</Text>
              <Text style={s.vazioSub}>Nenhuma despesa registrada em {mesAno(mesSel, anoSel)}.</Text>
            </View>
          )}

          {/* Insights automáticos */}
          {insights.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitulo}>💡 Insights</Text>
              {insights.map((insight, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: i < insights.length - 1 ? 0.5 : 0, borderBottomColor: C.borderLight }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.bgAccent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 16 }}>{insight.substring(0, 2)}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, color: C.label, lineHeight: 20, paddingTop: 8 }}>{insight.substring(2).trim()}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 100 }}/>
        </ScrollView>
      )}

      {/* ── Aba: Metas ── */}
      {aba === 'metas' && (
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.pageHeader}>
            <View><Text style={s.greeting}>Acompanhe seus</Text><Text style={s.pageTitle}>Metas & Alertas</Text></View>
            <View style={[s.avatar, { backgroundColor: C.metaBg }]}><Text style={[s.avatarText, { color: C.metaText }]}>🎯</Text></View>
          </View>
          <TouchableOpacity
            style={{ alignSelf: 'center', marginTop: 8, marginBottom: 4, opacity: limpandoDupl ? 0.4 : 1 }}
            onPress={limparDuplicatas}
            disabled={limpandoDupl}
          >
            <Text style={{ fontSize: 11, color: C.textLight }}>🧹 remover duplicatas do mês</Text>
          </TouchableOpacity>

          {metasMes.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitulo}>Metas de {MESES[hoje.getMonth()]}</Text>
              {metasMes.map(m => {
                const p = getProgMeta(m);
                return (
                  <View key={m.id} style={s.metaItem}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={s.metaLabel}>{m.tipo === 'saldo' ? '💰 Meta de saldo' : `${ICONES_CAT[m.categoria||'']} Limite ${m.categoria}`}</Text>
                      <TouchableOpacity onPress={() => removerMeta(m.id)}><Text style={{ color: C.textLight, fontSize: 14 }}>✕</Text></TouchableOpacity>
                    </View>
                    <View style={{ height: 10, backgroundColor: C.bgAccent, borderRadius: 5, overflow: 'hidden' }}>
                      <View style={{ height: 10, borderRadius: 5, width: `${p.pct}%` as any, backgroundColor: p.ok ? C.receita : C.despesa }}/>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ fontSize: 12, color: C.label }}>{m.tipo === 'saldo' ? `Saldo: ${fmt(p.atual)}` : `Gasto: ${fmt(p.atual)}`}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: p.ok ? C.receita : C.despesa }}>{Math.round(p.pct)}% {p.ok ? '✓' : '⚠️'}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>Meta: {fmt(m.valor)}</Text>
                  </View>
                );
              })}
            </View>
          )}
          <View style={s.form}>
            <Text style={s.formTitulo}>+ Nova meta para {MESES[hoje.getMonth()]}</Text>
            <View style={s.row}>
              <TouchableOpacity style={[s.tipoBtn, metaTipo === 'saldo' && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setMetaTipo('saldo')}>
                <Text style={[s.tipoBtnText, metaTipo === 'saldo' && { color: '#fff' }]}>💰 Saldo mínimo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.tipoBtn, metaTipo === 'categoria' && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setMetaTipo('categoria')}>
                <Text style={[s.tipoBtnText, metaTipo === 'categoria' && { color: '#fff' }]}>🏷 Por categoria</Text>
              </TouchableOpacity>
            </View>
            {metaTipo === 'categoria' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
                {CATEGORIAS.filter(c => c !== 'Salário').map(c => (
                  <TouchableOpacity key={c} style={[s.catBtn, metaCat === c && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setMetaCat(c)}>
                    <Text style={[s.catBtnText, metaCat === c && { color: '#fff' }]}>{ICONES_CAT[c]} {c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TextInput style={s.input} placeholder={metaTipo === 'saldo' ? 'Saldo mínimo (R$)' : 'Limite máximo (R$)'} placeholderTextColor={C.textLight} value={metaVal} onChangeText={setMetaVal} keyboardType="decimal-pad"/>
            <TouchableOpacity style={[s.btn, { backgroundColor: C.primary, opacity: salvandoMeta ? 0.6 : 1 }]} onPress={adicionarMeta} disabled={salvandoMeta}>
              <Text style={[s.btnText, { color: '#fff' }]}>{salvandoMeta ? 'Salvando...' : 'Salvar meta'}</Text>
            </TouchableOpacity>
          </View>
          <View style={s.form}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={s.formTitulo}>🔄 Despesas recorrentes</Text>
              {recorrentes.length > 0 && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.4 }}>Total mensal</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: C.despesa }}>
                    {fmt(recorrentes.filter(r => r.tipo === 'despesa').reduce((s, r) => s + Number(r.valor), 0))}
                  </Text>
                  {recorrentes.some(r => r.tipo === 'receita') && (
                    <Text style={{ fontSize: 12, fontWeight: '600', color: C.receita }}>
                      + {fmt(recorrentes.filter(r => r.tipo === 'receita').reduce((s, r) => s + Number(r.valor), 0))}
                    </Text>
                  )}
                </View>
              )}
            </View>
            {recorrentes.length === 0 && (
              <Text style={{ fontSize: 13, color: C.textLight, marginBottom: 12, fontStyle: 'italic' }}>Nenhuma recorrente cadastrada ainda.</Text>
            )}
            {recorrentes.map(r => (
              <View key={r.id} style={[s.txItem, { marginHorizontal: 0, marginBottom: 6 }]}>
                <View style={[s.txIcone, { backgroundColor: r.tipo === 'receita' ? C.receitaBg : C.despesaBg }]}><Text style={{ fontSize: 14 }}>{ICONES_CAT[r.categoria]}</Text></View>
                <View style={s.txInfo}>
                  <Text style={s.txDesc}>{r.descricao}</Text>
                  <Text style={s.txMeta}>
                    {r.categoria}
                    {r.parcelas_total ? `  ·  ${r.parcelas_restantes}/${r.parcelas_total} parcelas restantes` : '  ·  Mensal'}
                  </Text>
                  {r.parcelas_total && (
                    <View style={{ height: 4, backgroundColor: C.borderLight, borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.primary, width: `${Math.round(((r.parcelas_total - (r.parcelas_restantes ?? 0)) / r.parcelas_total) * 100)}%` as any }}/>
                    </View>
                  )}
                </View>
                <Text style={[s.txValor, { color: r.tipo === 'receita' ? C.receita : C.despesa }]}>{fmt(r.valor)}</Text>
                <TouchableOpacity onPress={() => removerRecorrente(r.id)} style={{ padding: 4 }}><Text style={{ color: C.textLight, fontSize: 14 }}>✕</Text></TouchableOpacity>
              </View>
            ))}
            <TextInput style={s.input} placeholder="Descrição (ex: Celular Samsung)" placeholderTextColor={C.textLight} value={recDesc} onChangeText={setRecDesc}/>
            <TextInput style={s.input} placeholder="Valor (ex: 1500,00)" placeholderTextColor={C.textLight} value={recVal} onChangeText={setRecVal} keyboardType="decimal-pad"/>
            <View style={s.row}>
              <TouchableOpacity style={[s.tipoBtn, recTipo === 'despesa' && { backgroundColor: C.despesa, borderColor: C.despesa }]} onPress={() => setRecTipo('despesa')}><Text style={[s.tipoBtnText, recTipo === 'despesa' && { color: '#fff' }]}>Despesa</Text></TouchableOpacity>
              <TouchableOpacity style={[s.tipoBtn, recTipo === 'receita' && { backgroundColor: C.receita, borderColor: C.receita }]} onPress={() => setRecTipo('receita')}><Text style={[s.tipoBtnText, recTipo === 'receita' && { color: '#fff' }]}>Receita</Text></TouchableOpacity>
            </View>

            {/* Toggle parcelado */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}
              onPress={() => { setRecEhParcelado(!recEhParcelado); setRecParcelas(''); }}
            >
              <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: recEhParcelado ? C.primary : C.borderLight, justifyContent: 'center', paddingHorizontal: 2 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignSelf: recEhParcelado ? 'flex-end' : 'flex-start', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 }}/>
              </View>
              <Text style={{ fontSize: 13, color: C.label }}>É parcelado?</Text>
            </TouchableOpacity>
            {recEhParcelado && (
              <TextInput
                style={[s.input, { borderColor: C.primary }]}
                placeholder="Número de parcelas (ex: 12)"
                placeholderTextColor={C.textLight}
                value={recParcelas}
                onChangeText={setRecParcelas}
                keyboardType="number-pad"
              />
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
              {CATEGORIAS.map(c => <TouchableOpacity key={c} style={[s.catBtn, recCat === c && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setRecCat(c)}><Text style={[s.catBtnText, recCat === c && { color: '#fff' }]}>{ICONES_CAT[c]} {c}</Text></TouchableOpacity>)}
            </ScrollView>
            <TouchableOpacity style={[s.btn, { backgroundColor: C.primary, opacity: salvandoRec ? 0.6 : 1 }]} onPress={adicionarRecorrente} disabled={salvandoRec}>
              <Text style={[s.btnText, { color: '#fff' }]}>{salvandoRec ? 'Salvando...' : `+ Adicionar ${recEhParcelado ? `(${recParcelas || '?'}x)` : 'recorrente'}`}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 100 }}/>
        </ScrollView>
      )}

      {/* ── Aba: Extrato (OFX) ── */}
      {aba === 'importar' && (
        <ScrollView style={s.scroll}>
          <View style={s.pageHeader}>
            <View><Text style={s.greeting}>Importe seu extrato</Text><Text style={s.pageTitle}>Importar Extrato</Text></View>
            <View style={[s.avatar, { backgroundColor: C.bgAccent }]}><Text style={[s.avatarText, { color: C.primaryDark }]}>📥</Text></View>
          </View>

          {/* Instruções colapsáveis */}
          <TouchableOpacity style={s.infoBox} onPress={() => setInstrucaoExpandida(!instrucaoExpandida)} activeOpacity={0.8}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.infoTitulo}>📱 Como exportar do Nubank</Text>
              <Text style={{ fontSize: 18, color: C.primaryDark }}>{instrucaoExpandida ? '▲' : '▼'}</Text>
            </View>
            {instrucaoExpandida && (
              <View style={{ marginTop: 10 }}>
                {['1. Abra o app do Nubank','2. Vá em Extrato','3. Toque nos três pontinhos (···)','4. Selecione "Exportar extrato"','5. Escolha o formato OFX','6. Salve e importe aqui'].map((l,i) => <Text key={i} style={s.infoTexto}>{l}</Text>)}
              </View>
            )}
          </TouchableOpacity>

          {txOFX.length === 0 && (
            <TouchableOpacity style={[s.btn, { backgroundColor: C.primary, margin: 16, padding: 18, flexDirection: 'row', justifyContent: 'center', gap: 10 }]} onPress={selecionarOFX}>
              <Text style={{ fontSize: 20 }}>📂</Text>
              <Text style={[s.btnText, { color: '#fff', fontSize: 15 }]}>Selecionar arquivo .OFX</Text>
            </TouchableOpacity>
          )}
          {txOFX.length === 0 && (
            <View style={s.vazioContainer}>
              <Text style={s.vazioEmoji}>📂</Text>
              <Text style={s.vazioTitulo}>Nenhum arquivo carregado</Text>
              <Text style={s.vazioSub}>Selecione um arquivo .OFX exportado do seu banco para importar as transações automaticamente.</Text>
            </View>
          )}
          {txOFX.length > 0 && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
                <View><Text style={s.txDesc}>📄 {arquivoNome}</Text><Text style={s.txMeta}>{txOFX.length} transações · {selOFX} selecionadas</Text></View>
                <TouchableOpacity onPress={() => { setTxOFX([]); setArquivoNome(''); }} style={s.filtroBtn}><Text style={s.filtroBtnText}>Limpar</Text></TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
                <TouchableOpacity onPress={() => setTxOFX(txOFX.map(t => ({...t, selecionada: true})))} style={[s.btn, { flex: 1, backgroundColor: C.bgAccent, padding: 8 }]}><Text style={[s.btnText, { color: C.primaryDark }]}>Selecionar todas</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setTxOFX(txOFX.map(t => ({...t, selecionada: false})))} style={[s.btn, { flex: 1, backgroundColor: C.bgAccent, padding: 8 }]}><Text style={[s.btnText, { color: C.primaryDark }]}>Desmarcar</Text></TouchableOpacity>
              </View>
              {txOFX.map(t => (
                <View key={t.id} style={[s.txItem, !t.selecionada && { opacity: 0.4 }]}>
                  <TouchableOpacity onPress={() => setTxOFX(txOFX.map(x => x.id === t.id ? {...x, selecionada: !x.selecionada} : x))} style={[s.checkbox, t.selecionada && { backgroundColor: C.primary, borderColor: C.primary }]}>
                    {t.selecionada && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
                  </TouchableOpacity>
                  <View style={s.txInfo}>
                    <Text style={s.txDesc} numberOfLines={1}>{t.descricao}</Text>
                    <Text style={s.txMeta}>{t.data}</Text>
                    {t.selecionada && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                        {CATEGORIAS.map(c => <TouchableOpacity key={c} onPress={() => setTxOFX(txOFX.map(x => x.id === t.id ? {...x, categoria: c} : x))} style={[s.catBtn, { paddingHorizontal: 8, paddingVertical: 3 }, t.categoria === c && { backgroundColor: C.primary, borderColor: C.primary }]}><Text style={[s.catBtnText, { fontSize: 10 }, t.categoria === c && { color: '#fff' }]}>{ICONES_CAT[c]} {c}</Text></TouchableOpacity>)}
                      </ScrollView>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {t.selecionada && (
                      <TouchableOpacity onPress={() => setTxOFX(txOFX.map(x => x.id === t.id ? {...x, tipo: x.tipo === 'despesa' ? 'receita' : 'despesa'} : x))} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: t.tipo === 'receita' ? C.receitaBg : C.despesaBg }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: t.tipo === 'receita' ? C.receita : C.despesa }}>{t.tipo === 'receita' ? '↑ Receita' : '↓ Despesa'}</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={[s.txValor, { color: t.tipo === 'receita' ? C.receita : C.despesa }]}>{t.tipo === 'receita' ? '+' : '-'} {fmt(t.valor)}</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={[s.btn, { backgroundColor: C.receita, margin: 16, padding: 16, opacity: selOFX === 0 || salvandoOFX ? 0.5 : 1 }]} onPress={salvarOFX} disabled={selOFX === 0 || salvandoOFX}>
                {salvandoOFX ? <ActivityIndicator color="#fff"/> : <Text style={[s.btnText, { color: '#fff', fontSize: 15 }]}>💾 Salvar {selOFX} transações</Text>}
              </TouchableOpacity>
            </>
          )}
          <View style={{ height: 100 }}/>
        </ScrollView>
      )}

        </View>{/* fim conteúdo principal */}
      </View>{/* fim layout row */}

      {/* ── FAB (só mobile) ── */}
      {Platform.OS !== 'web' && (
        <TouchableOpacity style={s.fab} onPress={() => setShowFormModal(true)} activeOpacity={0.85}>
          <Text style={s.fabText}>＋</Text>
        </TouchableOpacity>
      )}

      {/* FAB web — fixo no canto */}
      {Platform.OS === 'web' && (
        <TouchableOpacity style={[s.fab, { bottom: 24 }]} onPress={() => setShowFormModal(true)} activeOpacity={0.85}>
          <Text style={s.fabText}>＋</Text>
        </TouchableOpacity>
      )}

      {/* ── Toast ── */}
      {toastVisible && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* ── Tab bar (só mobile) ── */}
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

const sl = StyleSheet.create({
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12, color: C.text, backgroundColor: C.bgCard },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },

  // Tab bar (bottom)
  tabBar: { flexDirection: 'row', backgroundColor: C.bgCard, borderTopWidth: 0.5, borderTopColor: C.borderLight, paddingBottom: Platform.OS === 'ios' ? 0 : 4, paddingTop: 6 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabItemAtivo: { borderTopWidth: 2, borderTopColor: C.primary, marginTop: -6, paddingTop: 10 },
  tabIcon: { fontSize: 20, marginBottom: 2 },
  tabLabel: { fontSize: 10, color: C.textLight },
  tabLabelAtivo: { color: C.primary, fontWeight: '600' },

  // FAB
  fab: { position: 'absolute', right: 20, bottom: 72, width: 58, height: 58, borderRadius: 29, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primaryDeep, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  fabText: { fontSize: 28, color: '#fff', lineHeight: 34, marginTop: -2 },

  // Toast
  toast: { position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: C.primaryDeep, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Sidebar (web)
  sidebar: { width: 220, backgroundColor: C.primaryDeep, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 12 },
  sidebarLogo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  sidebarLogoText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  sidebarItemAtivo: { backgroundColor: 'rgba(255,255,255,0.15)' },
  sidebarIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  sidebarLabel: { fontSize: 14, color: 'rgba(255,255,255,0.65)' },
  sidebarLabelAtivo: { color: '#fff', fontWeight: '600' },

  // Page headers
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 12 },
  greeting: { fontSize: 13, color: C.label },
  pageTitle: { fontSize: 22, fontWeight: '700', color: C.text },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  mesSeletorHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgCard, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: C.border },

  // Stats row
  statCard: { backgroundColor: C.bgCard, borderRadius: 14, padding: 14, marginRight: 10, width: 150, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  statIcone: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statLabel: { fontSize: 11, color: C.textLight, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  statVal: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  statPct: { fontSize: 11, color: C.textLight },

  // Search
  buscaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  buscaInput: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  exportBtn: { backgroundColor: C.primaryDark, borderRadius: 10, padding: 10, alignItems: 'center', justifyContent: 'center' },

  // Date group header
  dataGrupoHeader: { fontSize: 12, fontWeight: '700', color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },

  // Hero badge
  heroBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 16 },

  // Hero card
  heroCard: { backgroundColor: C.primary, marginHorizontal: 16, borderRadius: 20, padding: 22, marginBottom: 12, shadowColor: C.primaryDeep, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10, overflow: 'hidden' },
  heroCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#334155', opacity: 0.6, top: -60, right: -50 },
  heroCircle2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#475569', opacity: 0.4, bottom: -30, left: -20 },
  heroLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 4, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },
  heroVal: { fontSize: 36, fontWeight: '700', color: '#fff', letterSpacing: -1, marginBottom: 18 },
  heroRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 12 },
  heroSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 },
  heroSubVal: { fontSize: 15, fontWeight: '600', color: '#fff' },
  heroDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 20 },

  // Forms
  form: { backgroundColor: C.bgCard, margin: 16, borderRadius: 16, padding: 16, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  formTitulo: { fontSize: 15, fontWeight: '600', marginBottom: 12, color: C.text },
  input: { borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 8, color: C.text, backgroundColor: C.bg },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tipoBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: C.bg },
  tipoBtnText: { fontSize: 13, fontWeight: '500', color: C.label },
  catScroll: { marginBottom: 12 },
  catBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 0.5, borderColor: C.border, marginRight: 6, backgroundColor: C.bg },
  catBtnText: { fontSize: 12, color: C.label },
  btn: { borderRadius: 10, padding: 12, alignItems: 'center' },
  btnText: { fontSize: 14, fontWeight: '600' },

  // Filters
  filtros: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
  filtroBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, borderWidth: 0.5, borderColor: C.border, backgroundColor: C.bgCard },
  filtroBtnText: { fontSize: 13, color: C.label },

  // Transaction list
  txItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, marginHorizontal: 16, marginBottom: 6, borderRadius: 12, padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  txIcone: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 14, fontWeight: '500', color: C.text },
  txMeta: { fontSize: 12, color: C.label, marginTop: 2 },
  txValor: { fontSize: 14, fontWeight: '600' },

  // Empty state
  vazioContainer: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  vazioEmoji: { fontSize: 48, marginBottom: 12 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 6 },
  vazioSub: { fontSize: 14, color: C.textLight, textAlign: 'center', lineHeight: 22 },

  // Month nav
  mesNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  mesBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: C.border },
  mesBtnText: { fontSize: 22, color: C.primary, lineHeight: 26 },
  mesTitulo: { fontSize: 18, fontWeight: '600', color: C.text, textTransform: 'capitalize' },

  // Charts/rings
  ringRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingHorizontal: 16, marginBottom: 16 },
  ringItem: { alignItems: 'center' },
  ring: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, marginBottom: 6 },
  ringLabel: { fontSize: 11, color: C.label, marginBottom: 2 },
  ringVal: { fontSize: 13, fontWeight: '600' },
  section: { backgroundColor: C.bgCard, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sectionTitulo: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 14 },
  barComp: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 4 },
  barSeg: { height: 14 },

  // Goals
  metaItem: { backgroundColor: C.bg, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: C.borderLight },
  metaLabel: { fontSize: 14, fontWeight: '600', color: C.text },

  // Alerts
  alertaBanner: { backgroundColor: '#E24B4A', padding: 10, alignItems: 'center' },
  alertaBannerText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  alertaItem: { fontSize: 13, color: '#A32D2D', lineHeight: 22, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#FCEBEB' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: C.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderTopWidth: 0.5, borderTopColor: C.borderLight },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderLight, alignSelf: 'center', marginBottom: 16 },
  modalTitulo: { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 4 },
  modalSub: { fontSize: 13, color: C.label, marginBottom: 12 },
  recItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.borderLight, borderRadius: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  // Export modal
  exportOpcao: { borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 10, alignItems: 'center' },
  exportOpcaoTitulo: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  exportOpcaoSub: { fontSize: 12, color: C.textLight },

  // OFX info box
  infoBox: { margin: 16, borderRadius: 12, padding: 16, marginBottom: 8, backgroundColor: C.bgAccent, borderWidth: 0.5, borderColor: C.border },
  infoTitulo: { fontSize: 14, fontWeight: '600', color: C.text },
  infoTexto: { fontSize: 13, lineHeight: 22, color: C.label },
});
