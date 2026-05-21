import { useState, useCallback, useMemo } from 'react';
import { View, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';

// Ativa LayoutAnimation no Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LAYOUT_ANIM = {
  duration: 280,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};
import { T as Text } from '../components/T';
import {
  Target, Plus, X as XIcon, ChevronDown, ChevronUp,
  RefreshCw, Wallet, Trash2, CheckCircle, AlertTriangle,
  TrendingUp, TrendingDown,
} from 'lucide-react-native';
import { supabase } from '../supabase';
import { CATEGORIAS, MESES, CONTA_TIPOS, CONTA_CORES } from '../constants';
import { CatIcon } from '../constants/catIcons';
import { useTheme, type ColorPalette } from '../contexts/ThemeContext';
import { fmt, confirmar } from '../utils/format';
import type { Transacao, Meta, Recorrente, Tipo, Conta, Categoria } from '../types';
import { RADIUS, SHADOW, SPACE, TYPE } from '../theme/tokens';

type Props = {
  transacoes: Transacao[];
  metas: Meta[];
  recorrentes: Recorrente[];
  contas: Conta[];
  categoriasCustom: Categoria[];
  setMetas: React.Dispatch<React.SetStateAction<Meta[]>>;
  setRecorrentes: React.Dispatch<React.SetStateAction<Recorrente[]>>;
  setContas: React.Dispatch<React.SetStateAction<Conta[]>>;
  setCategoriasCustom: React.Dispatch<React.SetStateAction<Categoria[]>>;
  calcularAlertas: (txs: Transacao[], mts: Meta[]) => void;
  mostrarToast: (msg: string) => void;
};

export function TelaMetas({ transacoes, metas, recorrentes, contas, categoriasCustom, setMetas, setRecorrentes, setContas, setCategoriasCustom, calcularAlertas, mostrarToast }: Props) {
  const hoje = new Date();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  // Formulários colapsáveis
  const [showMetaForm,  setShowMetaForm]  = useState(false);
  const [showRecForm,   setShowRecForm]   = useState(false);
  const [showContaForm, setShowContaForm] = useState(false);
  const [showCatForm,   setShowCatForm]   = useState(false);

  // Categoria form
  const [catNome,     setCatNome]     = useState('');
  const [catIcone,    setCatIcone]    = useState('');
  const [catCor,      setCatCor]      = useState(CONTA_CORES[0]);
  const [salvandoCat, setSalvandoCat] = useState(false);

  // Conta form
  const [contaNome,       setContaNome]       = useState('');
  const [contaTipo,       setContaTipo]       = useState('corrente');
  const [contaSaldo,      setContaSaldo]      = useState('');
  const [contaLimite,     setContaLimite]     = useState('');
  const [contaFechamento, setContaFechamento] = useState('');
  const [contaVencimento, setContaVencimento] = useState('');
  const [contaCor,        setContaCor]        = useState(CONTA_CORES[0]);
  const [salvandoConta,   setSalvandoConta]   = useState(false);

  // Meta form
  const [metaTipo, setMetaTipo] = useState<'saldo' | 'categoria'>('saldo');
  const [metaCat, setMetaCat]   = useState('Alimentação');
  const [metaVal, setMetaVal]   = useState('');
  const [salvandoMeta, setSalvandoMeta] = useState(false);

  // Recorrente form
  const [recDesc, setRecDesc]   = useState('');
  const [recVal,  setRecVal]    = useState('');
  const [recTipo, setRecTipo]   = useState<Tipo>('despesa');
  const [recCat,  setRecCat]    = useState('Alimentação');
  const [recEhParcelado, setRecEhParcelado] = useState(false);
  const [recParcelas, setRecParcelas]       = useState('');
  const [salvandoRec, setSalvandoRec]       = useState(false);
  const [limpandoDupl, setLimpandoDupl]     = useState(false);

  // ── Toggles com animação ────────────────────────────────────────────────
  function toggleMeta() {
    LayoutAnimation.configureNext(LAYOUT_ANIM);
    setShowMetaForm(v => !v);
  }

  function toggleRec() {
    LayoutAnimation.configureNext(LAYOUT_ANIM);
    setShowRecForm(v => !v);
  }

  function toggleConta() {
    LayoutAnimation.configureNext(LAYOUT_ANIM);
    setShowContaForm(v => !v);
  }

  function toggleCat() {
    LayoutAnimation.configureNext(LAYOUT_ANIM);
    setShowCatForm(v => !v);
  }

  async function adicionarCategoria() {
    if (!catNome.trim())  { mostrarToast('Informe o nome da categoria.'); return; }
    if (!catIcone.trim()) { mostrarToast('Informe um emoji para a categoria.'); return; }
    setSalvandoCat(true);
    try {
      const { data, error } = await supabase.from('categorias').insert({
        nome: catNome.trim(), icone: catIcone.trim(), cor: catCor, ativo: true,
      }).select();
      if (error) throw error;
      setCategoriasCustom([...categoriasCustom, data[0]]);
      setCatNome(''); setCatIcone(''); setCatCor(CONTA_CORES[0]);
      LayoutAnimation.configureNext(LAYOUT_ANIM);
      setShowCatForm(false);
      mostrarToast('Categoria criada!');
    } catch (err: any) {
      mostrarToast(`Erro ao salvar categoria: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvandoCat(false);
    }
  }

  async function removerCategoria(id: string) {
    confirmar('Remover categoria', 'Esta categoria será removida. Lançamentos existentes mantêm o nome.', async () => {
      const { error } = await supabase.from('categorias').update({ ativo: false }).eq('id', id);
      if (error) { mostrarToast(`Erro: ${error.message}`); return; }
      setCategoriasCustom(categoriasCustom.filter(c => c.id !== id));
      mostrarToast('Categoria removida.');
    });
  }

  // ── Saldo calculado por conta ───────────────────────────────────────────
  function saldoConta(c: Conta): number {
    const txConta = transacoes.filter(t => t.conta_id === c.id);
    const rec  = txConta.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const desp = txConta.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
    return c.saldo_inicial + rec - desp;
  }

  function faturaCartao(c: Conta): number {
    const mes = hoje.getMonth();
    const ano = hoje.getFullYear();
    return transacoes
      .filter(t => t.conta_id === c.id && t.tipo === 'despesa')
      .filter(t => {
        const p = t.data?.split('/');
        return p && parseInt(p[1]) - 1 === mes && parseInt(p[2]) === ano;
      })
      .reduce((s, t) => s + Number(t.valor), 0);
  }

  async function adicionarConta() {
    if (!contaNome.trim()) { mostrarToast('Informe o nome da conta.'); return; }
    const isCartao = contaTipo === 'cartao';
    const lim  = isCartao ? (parseFloat(contaLimite.replace(/\./g, '').replace(',', '.')) || 0) : null;
    const fech = isCartao ? (parseInt(contaFechamento) || null) : null;
    const venc = isCartao ? (parseInt(contaVencimento) || null) : null;
    if (isCartao && !lim) { mostrarToast('Informe o limite do cartão.'); return; }
    const si = isCartao ? 0 : (parseFloat(contaSaldo.replace(/\./g, '').replace(',', '.')) || 0);
    setSalvandoConta(true);
    try {
      const payload: any = { nome: contaNome.trim(), tipo: contaTipo, saldo_inicial: si, cor: contaCor, ativo: true };
      if (isCartao) { payload.limite = lim; payload.dia_fechamento = fech; payload.dia_vencimento = venc; }
      const { data, error } = await supabase.from('contas').insert(payload).select();
      if (error) throw error;
      setContas([...contas, data[0]]);
      setContaNome(''); setContaSaldo(''); setContaLimite(''); setContaFechamento(''); setContaVencimento('');
      setContaCor(CONTA_CORES[0]); setContaTipo('corrente');
      LayoutAnimation.configureNext(LAYOUT_ANIM);
      setShowContaForm(false);
      mostrarToast('Conta criada!');
    } catch (err: any) {
      mostrarToast(`Erro ao salvar conta: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvandoConta(false);
    }
  }

  async function removerConta(id: string) {
    confirmar('Remover conta', 'A conta será removida. Os lançamentos vinculados não serão apagados.', async () => {
      const { error } = await supabase.from('contas').update({ ativo: false }).eq('id', id);
      if (error) { mostrarToast(`Erro: ${error.message}`); return; }
      setContas(contas.filter(c => c.id !== id));
      mostrarToast('Conta removida.');
    });
  }

  // ── Dados do mês atual ──────────────────────────────────────────────────
  const txAtual = transacoes.filter(t => {
    const p = t.data?.split('/');
    return p && parseInt(p[1]) - 1 === hoje.getMonth() && parseInt(p[2]) === hoje.getFullYear();
  });
  const recAtual   = txAtual.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
  const despAtual  = txAtual.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
  const saldoAtual = recAtual - despAtual;

  const metasMes = metas.filter(m => m.mes === hoje.getMonth() && m.ano === hoje.getFullYear());

  const totalRecRec  = recorrentes.filter(r => r.tipo === 'receita').reduce((s, r) => s + Number(r.valor), 0);
  const totalDespRec = recorrentes.filter(r => r.tipo === 'despesa').reduce((s, r) => s + Number(r.valor), 0);

  function getProgMeta(m: Meta) {
    if (m.tipo === 'saldo') {
      const pct = Math.min(Math.max(saldoAtual / m.valor * 100, 0), 100);
      return { atual: saldoAtual, pct, ok: saldoAtual >= m.valor };
    }
    const g = txAtual.filter(t => t.tipo === 'despesa' && t.categoria === m.categoria).reduce((s, t) => s + Number(t.valor), 0);
    return { atual: g, pct: Math.min(g / m.valor * 100, 100), ok: g <= m.valor };
  }

  // ── Handlers ────────────────────────────────────────────────────────────

  async function adicionarMeta() {
    const v = parseFloat(metaVal.replace(/\./g, '').replace(',', '.'));
    if (isNaN(v) || v <= 0) { mostrarToast('Informe um valor válido para a meta.'); return; }
    setSalvandoMeta(true);
    try {
      const { data, error } = await supabase.from('metas').insert({
        tipo: metaTipo, categoria: metaTipo === 'categoria' ? metaCat : null,
        valor: v, mes: hoje.getMonth(), ano: hoje.getFullYear(),
      }).select();
      if (error) throw error;
      const novas = [...metas, data[0]];
      setMetas(novas); setMetaVal('');
      LayoutAnimation.configureNext(LAYOUT_ANIM);
      setShowMetaForm(false);
      calcularAlertas(transacoes, novas);
      mostrarToast('Meta salva!');
    } catch (err: any) {
      mostrarToast(`Erro ao salvar meta: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvandoMeta(false);
    }
  }

  async function removerMeta(id: string) {
    confirmar('Excluir meta', 'Deseja remover esta meta?', async () => {
      const { error } = await supabase.from('metas').delete().eq('id', id);
      if (error) { mostrarToast(`Erro ao remover meta: ${error.message}`); return; }
      const novas = metas.filter(m => m.id !== id);
      setMetas(novas);
      calcularAlertas(transacoes, novas);
      mostrarToast('Meta removida.');
    });
  }

  async function adicionarRecorrente() {
    const v = parseFloat(recVal.replace(/\./g, '').replace(',', '.'));
    if (!recDesc.trim() || isNaN(v) || v <= 0) { mostrarToast('Preencha descrição e valor corretamente.'); return; }
    const parcTotal = recEhParcelado ? parseInt(recParcelas) : null;
    if (recEhParcelado && (!parcTotal || parcTotal < 2)) { mostrarToast('Informe ao menos 2 parcelas.'); return; }
    setSalvandoRec(true);
    try {
      const { data, error } = await supabase.from('recorrentes').insert({
        descricao: recDesc.trim(), valor: v, tipo: recTipo, categoria: recCat, ativo: true,
        parcelas_total: parcTotal, parcelas_restantes: parcTotal,
      }).select();
      if (error) throw error;
      setRecorrentes([...recorrentes, data[0]]);
      setRecDesc(''); setRecVal(''); setRecParcelas(''); setRecEhParcelado(false);
      LayoutAnimation.configureNext(LAYOUT_ANIM);
      setShowRecForm(false);
      mostrarToast('Recorrente adicionada!');
    } catch (err: any) {
      mostrarToast(`Erro ao salvar recorrente: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvandoRec(false);
    }
  }

  async function removerRecorrente(id: string) {
    confirmar('Remover recorrente', 'Deseja remover esta despesa recorrente?', async () => {
      const { error } = await supabase.from('recorrentes').update({ ativo: false }).eq('id', id);
      if (error) { mostrarToast(`Erro ao remover: ${error.message}`); return; }
      setRecorrentes(recorrentes.filter(r => r.id !== id));
      mostrarToast('Recorrente removida.');
    });
  }

  const limparDuplicatas = useCallback(async () => {
    setLimpandoDupl(true);
    const mesStr = String(hoje.getMonth() + 1).padStart(2, '0');
    const anoStr = String(hoje.getFullYear());
    const dataAlvo = `01/${mesStr}/${anoStr}`;
    const descRec = new Set(recorrentes.map(r => r.descricao.toLowerCase().trim()));
    const candidatas = transacoes.filter(t => t.data === dataAlvo && descRec.has(t.descricao.toLowerCase().trim()));
    const porDesc: Record<string, Transacao[]> = {};
    candidatas.forEach(t => { const k = t.descricao.toLowerCase().trim(); porDesc[k] = [...(porDesc[k] || []), t]; });
    const idsApagar: string[] = [];
    Object.values(porDesc).forEach(grupo => {
      if (grupo.length > 1) {
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
      `Foram encontradas ${idsApagar.length} transação(ões) duplicadas. Deseja removê-las?`,
      async () => {
        await supabase.from('transacoes').delete().in('id', idsApagar);
        mostrarToast(`${idsApagar.length} duplicata${idsApagar.length > 1 ? 's removidas' : ' removida'}!`);
        setLimpandoDupl(false);
      }
    );
  }, [transacoes, metas, recorrentes, mostrarToast]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

      {/* ── Header ── */}
      <View style={s.pageHeader}>
        <View>
          <Text style={s.greeting}>Planejamento financeiro</Text>
          <Text style={s.pageTitle}>Metas & Recorrentes</Text>
        </View>
        <View style={s.headerIcon}>
          <Target size={20} color={C.brand} strokeWidth={2} />
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 0 — CONTAS
      ══════════════════════════════════════════════════════════════════ */}
      {(() => {
        const bancarias = contas.filter(c => c.tipo !== 'cartao');
        const cartoes   = contas.filter(c => c.tipo === 'cartao');
        const saldoTotal = bancarias.reduce((acc, c) => acc + saldoConta(c), 0);
        const subTexto = contas.length === 0 ? 'Nenhuma conta cadastrada'
          : [
              bancarias.length > 0 && `${bancarias.length} conta${bancarias.length > 1 ? 's' : ''} · ${fmt(saldoTotal)}`,
              cartoes.length   > 0 && `${cartoes.length} cartão${cartoes.length > 1 ? 'ões' : ''}`,
            ].filter(Boolean).join('  ·  ');
        return (
      <View style={s.section}>

        {/* Cabeçalho */}
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>Minhas contas</Text>
            <Text style={s.sectionSub}>{subTexto}</Text>
          </View>
          <TouchableOpacity
            style={[s.addBtn, showContaForm && s.addBtnActive]}
            onPress={toggleConta}
          >
            {showContaForm
              ? <ChevronUp size={14} color={C.primaryDark} strokeWidth={2.5} />
              : <Plus      size={14} color={C.primaryDark} strokeWidth={2.5} />
            }
            <Text style={s.addBtnText}>{showContaForm ? 'Cancelar' : 'Nova conta'}</Text>
          </TouchableOpacity>
        </View>

        {/* Lista de contas */}
        {contas.length === 0 && !showContaForm && (
          <View style={s.emptySection}>
            <View style={s.emptySectionIcon}>
              <Wallet size={24} color={C.textLight} strokeWidth={1.5} />
            </View>
            <Text style={s.emptySectionTitle}>Sem contas cadastradas</Text>
            <Text style={s.emptySectionSub}>Adicione suas contas bancárias, poupança ou carteira para controlar seu saldo real.</Text>
          </View>
        )}

        {contas.map(c => {
          const tipoInfo = CONTA_TIPOS.find(t => t.key === c.tipo);
          if (c.tipo === 'cartao') {
            const fatura    = faturaCartao(c);
            const limite    = Number(c.limite) || 0;
            const disponivel = Math.max(limite - fatura, 0);
            const pctFatura = limite > 0 ? Math.min(fatura / limite, 1) : 0;
            const barColor  = pctFatura > 0.9 ? C.despesa : pctFatura > 0.7 ? '#F59E0B' : C.receita;
            return (
              <View key={c.id} style={[s.recItem, { borderLeftWidth: 3, borderLeftColor: c.cor, flexDirection: 'column', gap: 0 }]}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <View style={[s.recIcone, { backgroundColor: c.cor + '22' }]}>
                    <Text style={{ fontSize: 18 }}>💳</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.recDesc}>{c.nome}</Text>
                    <Text style={s.recMeta}>
                      Cartão de Crédito
                      {c.dia_fechamento ? `  ·  fecha dia ${c.dia_fechamento}` : ''}
                      {c.dia_vencimento ? `  ·  vence dia ${c.dia_vencimento}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removerConta(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Trash2 size={14} color={C.textLight} strokeWidth={1.8} />
                  </TouchableOpacity>
                </View>
                {/* Barra fatura/limite */}
                <View style={{ height: 6, backgroundColor: C.bgAccent, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: barColor, width: `${Math.round(pctFatura * 100)}%` as any }} />
                </View>
                {/* Números */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontSize: 10, color: C.textLight }}>Fatura</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.despesa }}>{fmt(fatura)}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: C.textLight }}>Limite</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.label }}>{fmt(limite)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10, color: C.textLight }}>Disponível</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.receita }}>{fmt(disponivel)}</Text>
                  </View>
                </View>
              </View>
            );
          }
          const saldo = saldoConta(c);
          return (
            <View key={c.id} style={[s.recItem, { borderLeftWidth: 3, borderLeftColor: c.cor }]}>
              {/* Ícone colorido */}
              <View style={[s.recIcone, { backgroundColor: c.cor + '22' }]}>
                <Text style={{ fontSize: 18 }}>{tipoInfo?.icone ?? '🏦'}</Text>
              </View>

              {/* Info */}
              <View style={{ flex: 1 }}>
                <Text style={s.recDesc}>{c.nome}</Text>
                <Text style={s.recMeta}>{tipoInfo?.label ?? c.tipo}</Text>
              </View>

              {/* Saldo */}
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[s.recValor, { color: saldo >= 0 ? C.receita : C.despesa }]}>
                  {fmt(saldo)}
                </Text>
                <TouchableOpacity onPress={() => removerConta(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Trash2 size={14} color={C.textLight} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* Formulário colapsável — nova conta */}
        {showContaForm && (
          <View style={s.inlineForm}>
            <View style={s.formDivider} />

            {/* Nome */}
            <Text style={s.formFieldLabel}>Nome da conta</Text>
            <TextInput
              style={s.input}
              placeholder="Ex: Nubank, Poupança Caixa…"
              placeholderTextColor={C.textLight}
              value={contaNome}
              onChangeText={setContaNome}
            />

            {/* Tipo */}
            <Text style={s.formFieldLabel}>Tipo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
              {CONTA_TIPOS.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[s.catBtn, contaTipo === t.key && { backgroundColor: C.brand, borderColor: C.brand }]}
                  onPress={() => setContaTipo(t.key)}
                >
                  <Text style={{ fontSize: 12 }}>{t.icone}</Text>
                  <Text style={[s.catBtnText, contaTipo === t.key && { color: C.primaryDark }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Saldo inicial ou Limite (dependendo do tipo) */}
            {contaTipo === 'cartao' ? (
              <>
                <Text style={s.formFieldLabel}>Limite do cartão (R$)</Text>
                <TextInput
                  style={s.input}
                  placeholder="5.000,00"
                  placeholderTextColor={C.textLight}
                  keyboardType="numeric"
                  value={contaLimite}
                  onChangeText={setContaLimite}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.formFieldLabel}>Dia de fechamento</Text>
                    <TextInput
                      style={s.input}
                      placeholder="ex: 25"
                      placeholderTextColor={C.textLight}
                      keyboardType="number-pad"
                      maxLength={2}
                      value={contaFechamento}
                      onChangeText={setContaFechamento}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.formFieldLabel}>Dia de vencimento</Text>
                    <TextInput
                      style={s.input}
                      placeholder="ex: 10"
                      placeholderTextColor={C.textLight}
                      keyboardType="number-pad"
                      maxLength={2}
                      value={contaVencimento}
                      onChangeText={setContaVencimento}
                    />
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={s.formFieldLabel}>Saldo inicial (R$)</Text>
                <TextInput
                  style={s.input}
                  placeholder="0,00"
                  placeholderTextColor={C.textLight}
                  keyboardType="numeric"
                  value={contaSaldo}
                  onChangeText={setContaSaldo}
                />
              </>
            )}

            {/* Cor */}
            <Text style={s.formFieldLabel}>Cor</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {CONTA_CORES.map(cor => (
                <TouchableOpacity
                  key={cor}
                  onPress={() => setContaCor(cor)}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: cor,
                    borderWidth: contaCor === cor ? 3 : 0,
                    borderColor: C.text,
                    transform: [{ scale: contaCor === cor ? 1.15 : 1 }],
                  }}
                />
              ))}
            </View>

            {/* Botão salvar */}
            <TouchableOpacity
              style={[s.ctaBtn, { opacity: salvandoConta ? 0.6 : 1 }]}
              onPress={adicionarConta}
              disabled={salvandoConta}
            >
              <Text style={s.ctaBtnText}>{salvandoConta ? 'Salvando…' : 'Salvar conta'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 0b — CATEGORIAS
      ══════════════════════════════════════════════════════════════════ */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>Minhas categorias</Text>
            <Text style={s.sectionSub}>
              {categoriasCustom.length === 0
                ? `${CATEGORIAS.length} categorias padrão`
                : `${CATEGORIAS.length} padrão + ${categoriasCustom.length} personalizada${categoriasCustom.length > 1 ? 's' : ''}`
              }
            </Text>
          </View>
          <TouchableOpacity
            style={[s.addBtn, showCatForm && s.addBtnActive]}
            onPress={toggleCat}
          >
            {showCatForm
              ? <ChevronUp size={14} color={C.primaryDark} strokeWidth={2.5} />
              : <Plus      size={14} color={C.primaryDark} strokeWidth={2.5} />
            }
            <Text style={s.addBtnText}>{showCatForm ? 'Cancelar' : 'Nova'}</Text>
          </TouchableOpacity>
        </View>

        {/* Chips das categorias padrão */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: categoriasCustom.length > 0 ? 10 : 0 }}>
          {CATEGORIAS.map(c => (
            <View key={c} style={s.catChip}>
              <CatIcon categoria={c} size={11} color={C.label} strokeWidth={2} />
              <Text style={s.catChipText}>{c}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Lista de categorias personalizadas */}
        {categoriasCustom.map(c => (
          <View key={c.id} style={[s.recItem, { borderLeftWidth: 3, borderLeftColor: c.cor }]}>
            <View style={[s.recIcone, { backgroundColor: c.cor + '22' }]}>
              <Text style={{ fontSize: 18 }}>{c.icone}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.recDesc}>{c.nome}</Text>
              <Text style={s.recMeta}>Personalizada</Text>
            </View>
            <TouchableOpacity onPress={() => removerCategoria(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Trash2 size={14} color={C.textLight} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Formulário colapsável — nova categoria */}
        {showCatForm && (
          <View style={s.inlineForm}>
            <View style={s.formDivider} />

            <Text style={s.formFieldLabel}>Nome</Text>
            <TextInput
              style={s.input}
              placeholder="Ex: Academia, Pets, Streaming..."
              placeholderTextColor={C.textLight}
              value={catNome}
              onChangeText={setCatNome}
            />

            <Text style={s.formFieldLabel}>Ícone (emoji)</Text>
            <TextInput
              style={s.input}
              placeholder="🏋️"
              placeholderTextColor={C.textLight}
              value={catIcone}
              onChangeText={setCatIcone}
            />

            <Text style={s.formFieldLabel}>Cor</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {CONTA_CORES.map(cor => (
                <TouchableOpacity
                  key={cor}
                  onPress={() => setCatCor(cor)}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: cor,
                    borderWidth: catCor === cor ? 3 : 0,
                    borderColor: C.text,
                    transform: [{ scale: catCor === cor ? 1.15 : 1 }],
                  }}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[s.ctaBtn, { opacity: salvandoCat ? 0.6 : 1 }]}
              onPress={adicionarCategoria}
              disabled={salvandoCat}
            >
              <Text style={s.ctaBtnText}>{salvandoCat ? 'Salvando...' : 'Salvar categoria'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 1 — METAS DO MÊS
      ══════════════════════════════════════════════════════════════════ */}
      <View style={s.section}>

        {/* Cabeçalho da seção */}
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>Metas de {MESES[hoje.getMonth()]}</Text>
            <Text style={s.sectionSub}>
              {metasMes.length === 0 ? 'Nenhuma meta definida' : `${metasMes.length} meta${metasMes.length > 1 ? 's' : ''} ativa${metasMes.length > 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.addBtn, showMetaForm && s.addBtnActive]}
            onPress={toggleMeta}
          >
            {showMetaForm
              ? <ChevronUp  size={14} color={C.primaryDark} strokeWidth={2.5} />
              : <Plus       size={14} color={C.primaryDark} strokeWidth={2.5} />
            }
            <Text style={s.addBtnText}>{showMetaForm ? 'Cancelar' : 'Nova meta'}</Text>
          </TouchableOpacity>
        </View>

        {/* Lista de metas */}
        {metasMes.length === 0 && !showMetaForm && (
          <View style={s.emptySection}>
            <View style={s.emptySectionIcon}>
              <Target size={24} color={C.textLight} strokeWidth={1.5} />
            </View>
            <Text style={s.emptySectionTitle}>Sem metas para {MESES[hoje.getMonth()]}</Text>
            <Text style={s.emptySectionSub}>Defina um saldo mínimo ou limite de gastos por categoria.</Text>
          </View>
        )}

        {metasMes.map(m => {
          const p = getProgMeta(m);
          const barColor = p.ok ? C.receita : (p.pct > 80 ? '#F59E0B' : C.despesa);
          return (
            <View key={m.id} style={s.metaItem}>
              {/* Header da meta */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <View style={[s.metaIcone, { backgroundColor: p.ok ? C.receitaBg : C.despesaBg }]}>
                  {m.tipo === 'saldo'
                    ? <Wallet size={14} color={p.ok ? C.receita : C.despesa} strokeWidth={2} />
                    : <CatIcon categoria={m.categoria || ''} size={14} color={p.ok ? C.receita : C.despesa} strokeWidth={2} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.metaLabel}>
                    {m.tipo === 'saldo' ? 'Saldo mínimo' : `Limite · ${m.categoria}`}
                  </Text>
                  <Text style={s.metaLabelSub}>
                    {m.tipo === 'saldo'
                      ? `Saldo atual: ${fmt(p.atual)}`
                      : `Gasto: ${fmt(p.atual)} de ${fmt(m.valor)}`
                    }
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {p.ok
                    ? <CheckCircle  size={16} color={C.receita} strokeWidth={2} />
                    : <AlertTriangle size={16} color={p.pct > 80 ? '#F59E0B' : C.despesa} strokeWidth={2} />
                  }
                  <TouchableOpacity onPress={() => removerMeta(m.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <XIcon size={14} color={C.textLight} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Barra de progresso */}
              <View style={{ height: 8, backgroundColor: C.bgAccent, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <View style={{ height: 8, borderRadius: 4, width: `${p.pct}%` as any, backgroundColor: barColor }} />
              </View>

              {/* Rodapé */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: C.textLight }}>
                  {Math.round(p.pct)}% {m.tipo === 'saldo' ? 'atingido' : 'utilizado'}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: barColor }}>
                  Meta: {fmt(m.valor)}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Formulário colapsável — nova meta */}
        {showMetaForm && (
          <View style={s.inlineForm}>
            <View style={s.formDivider} />

            {/* Tipo */}
            <Text style={s.formFieldLabel}>Tipo de meta</Text>
            <View style={s.row}>
              <TouchableOpacity
                style={[s.tipoBtn, metaTipo === 'saldo' && { backgroundColor: C.brand, borderColor: C.brand }]}
                onPress={() => setMetaTipo('saldo')}
              >
                <Wallet size={13} color={metaTipo === 'saldo' ? C.primaryDark : C.label} strokeWidth={2} />
                <Text style={[s.tipoBtnText, metaTipo === 'saldo' && { color: C.primaryDark }]}>Saldo mínimo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tipoBtn, metaTipo === 'categoria' && { backgroundColor: C.brand, borderColor: C.brand }]}
                onPress={() => setMetaTipo('categoria')}
              >
                <Target size={13} color={metaTipo === 'categoria' ? C.primaryDark : C.label} strokeWidth={2} />
                <Text style={[s.tipoBtnText, metaTipo === 'categoria' && { color: C.primaryDark }]}>Por categoria</Text>
              </TouchableOpacity>
            </View>

            {/* Categoria (só se tipo = categoria) */}
            {metaTipo === 'categoria' && (
              <>
                <Text style={s.formFieldLabel}>Categoria</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
                  {CATEGORIAS.filter(c => c !== 'Salário').map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[s.catBtn, metaCat === c && { backgroundColor: C.brand, borderColor: C.brand }]}
                      onPress={() => setMetaCat(c)}
                    >
                      <CatIcon categoria={c} size={11} color={metaCat === c ? C.primaryDark : C.label} strokeWidth={2} />
                      <Text style={[s.catBtnText, metaCat === c && { color: C.primaryDark }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Valor */}
            <Text style={s.formFieldLabel}>
              {metaTipo === 'saldo' ? 'Saldo mínimo desejado (R$)' : 'Limite máximo de gastos (R$)'}
            </Text>
            <TextInput
              style={s.input}
              placeholder="0,00"
              placeholderTextColor={C.textLight}
              value={metaVal}
              onChangeText={setMetaVal}
              keyboardType="decimal-pad"
            />

            <TouchableOpacity
              style={[s.ctaBtn, { opacity: salvandoMeta ? 0.6 : 1 }]}
              onPress={adicionarMeta}
              disabled={salvandoMeta}
            >
              <Text style={s.ctaBtnText}>{salvandoMeta ? 'Salvando...' : 'Salvar meta'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 2 — RECORRENTES
      ══════════════════════════════════════════════════════════════════ */}
      <View style={s.section}>

        {/* Cabeçalho da seção */}
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>Recorrentes</Text>
            <Text style={s.sectionSub}>
              {recorrentes.length === 0
                ? 'Nenhuma transação recorrente'
                : `${recorrentes.length} ativa${recorrentes.length > 1 ? 's' : ''}`}
            </Text>
          </View>
          {/* Totais badge */}
          {recorrentes.length > 0 && (
            <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
              {totalDespRec > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TrendingDown size={11} color={C.despesa} strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.despesa }}>{fmt(totalDespRec)}</Text>
                </View>
              )}
              {totalRecRec > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TrendingUp size={11} color={C.receita} strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.receita }}>{fmt(totalRecRec)}</Text>
                </View>
              )}
              <Text style={{ fontSize: 10, color: C.textLight }}>mensal</Text>
            </View>
          )}
          <TouchableOpacity
            style={[s.addBtn, showRecForm && s.addBtnActive]}
            onPress={toggleRec}
          >
            {showRecForm
              ? <ChevronUp size={14} color={C.primaryDark} strokeWidth={2.5} />
              : <Plus      size={14} color={C.primaryDark} strokeWidth={2.5} />
            }
            <Text style={s.addBtnText}>{showRecForm ? 'Cancelar' : 'Adicionar'}</Text>
          </TouchableOpacity>
        </View>

        {/* Lista de recorrentes */}
        {recorrentes.length === 0 && !showRecForm && (
          <View style={s.emptySection}>
            <View style={s.emptySectionIcon}>
              <RefreshCw size={24} color={C.textLight} strokeWidth={1.5} />
            </View>
            <Text style={s.emptySectionTitle}>Sem recorrentes cadastradas</Text>
            <Text style={s.emptySectionSub}>Adicione assinaturas, parcelas e salários para lançamento automático todo mês.</Text>
          </View>
        )}

        {recorrentes.map(r => {
          const progParc = r.parcelas_total
            ? Math.round(((r.parcelas_total - (r.parcelas_restantes ?? 0)) / r.parcelas_total) * 100)
            : null;
          return (
            <View key={r.id} style={s.recItem}>
              <View style={[s.recIcone, { backgroundColor: r.tipo === 'receita' ? C.receitaBg : C.despesaBg }]}>
                <CatIcon
                  categoria={r.categoria}
                  size={16}
                  color={r.tipo === 'receita' ? C.receita : C.despesa}
                  strokeWidth={1.8}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.recDesc}>{r.descricao}</Text>
                <Text style={s.recMeta}>
                  {r.categoria}
                  {r.parcelas_total
                    ? `  ·  ${r.parcelas_restantes}/${r.parcelas_total} restantes`
                    : '  ·  Mensal'
                  }
                </Text>
                {r.parcelas_total && (
                  <View style={{ marginTop: 5 }}>
                    <View style={{ height: 4, backgroundColor: C.borderLight, borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.brand, width: `${progParc}%` as any }} />
                    </View>
                    <Text style={{ fontSize: 10, color: C.textLight, marginTop: 3 }}>
                      {progParc}% pago
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[s.recValor, { color: r.tipo === 'receita' ? C.receita : C.despesa }]}>
                {r.tipo === 'receita' ? '+' : '-'} {fmt(r.valor)}
              </Text>
              <TouchableOpacity
                onPress={() => removerRecorrente(r.id)}
                style={s.recRemove}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <XIcon size={14} color={C.textLight} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Formulário colapsável — nova recorrente */}
        {showRecForm && (
          <View style={s.inlineForm}>
            <View style={s.formDivider} />

            <Text style={s.formFieldLabel}>Descrição</Text>
            <TextInput
              style={s.input}
              placeholder="ex: Netflix, Aluguel, Salário..."
              placeholderTextColor={C.textLight}
              value={recDesc}
              onChangeText={setRecDesc}
            />

            <Text style={s.formFieldLabel}>Valor</Text>
            <TextInput
              style={s.input}
              placeholder="0,00"
              placeholderTextColor={C.textLight}
              value={recVal}
              onChangeText={setRecVal}
              keyboardType="decimal-pad"
            />

            <Text style={s.formFieldLabel}>Tipo</Text>
            <View style={s.row}>
              <TouchableOpacity
                style={[s.tipoBtn, recTipo === 'despesa' && { backgroundColor: C.despesa, borderColor: C.despesa }]}
                onPress={() => setRecTipo('despesa')}
              >
                <TrendingDown size={13} color={recTipo === 'despesa' ? '#fff' : C.label} strokeWidth={2} />
                <Text style={[s.tipoBtnText, recTipo === 'despesa' && { color: '#fff' }]}>Despesa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tipoBtn, recTipo === 'receita' && { backgroundColor: C.receita, borderColor: C.receita }]}
                onPress={() => setRecTipo('receita')}
              >
                <TrendingUp size={13} color={recTipo === 'receita' ? '#fff' : C.label} strokeWidth={2} />
                <Text style={[s.tipoBtnText, recTipo === 'receita' && { color: '#fff' }]}>Receita</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.formFieldLabel}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
              {CATEGORIAS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[s.catBtn, recCat === c && { backgroundColor: C.brand, borderColor: C.brand }]}
                  onPress={() => setRecCat(c)}
                >
                  <CatIcon categoria={c} size={11} color={recCat === c ? C.primaryDark : C.label} strokeWidth={2} />
                  <Text style={[s.catBtnText, recCat === c && { color: C.primaryDark }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Toggle parcelado */}
            <TouchableOpacity
              style={s.toggleRow}
              onPress={() => { setRecEhParcelado(!recEhParcelado); setRecParcelas(''); }}
            >
              <View style={[s.toggleTrack, recEhParcelado && { backgroundColor: C.brand }]}>
                <View style={[s.toggleThumb, recEhParcelado && { alignSelf: 'flex-end' }]} />
              </View>
              <Text style={s.toggleLabel}>É parcelado?</Text>
            </TouchableOpacity>

            {recEhParcelado && (
              <TextInput
                style={[s.input, { borderColor: C.brand }]}
                placeholder="Número de parcelas (ex: 12)"
                placeholderTextColor={C.textLight}
                value={recParcelas}
                onChangeText={setRecParcelas}
                keyboardType="number-pad"
              />
            )}

            <TouchableOpacity
              style={[s.ctaBtn, { opacity: salvandoRec ? 0.6 : 1 }]}
              onPress={adicionarRecorrente}
              disabled={salvandoRec}
            >
              <Text style={s.ctaBtnText}>
                {salvandoRec ? 'Salvando...' : `Adicionar${recEhParcelado && recParcelas ? ` (${recParcelas}x)` : ''}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 3 — UTILITÁRIOS
      ══════════════════════════════════════════════════════════════════ */}
      <View style={s.utilSection}>
        <Text style={s.utilTitle}>Manutenção</Text>
        <TouchableOpacity
          style={[s.utilBtn, { opacity: limpandoDupl ? 0.5 : 1 }]}
          onPress={limparDuplicatas}
          disabled={limpandoDupl}
        >
          <View style={s.utilBtnIcon}>
            <Trash2 size={16} color={C.despesa} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.utilBtnLabel}>Limpar duplicatas do mês</Text>
            <Text style={s.utilBtnSub}>Remove lançamentos recorrentes duplicados de {MESES[hoje.getMonth()]}</Text>
          </View>
          <ChevronDown size={16} color={C.textLight} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    // ── Layout ──────────────────────────────────────────────────────────
    pageHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'flex-start', padding: SPACE.xl, paddingBottom: 12,
    },
    greeting: { fontSize: 13, color: C.label },
    pageTitle: { ...TYPE.heading, color: C.text },
    headerIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: C.brandBg,
      alignItems: 'center', justifyContent: 'center',
    },

    // ── Seções ──────────────────────────────────────────────────────────
    section: {
      backgroundColor: C.bgCard,
      marginHorizontal: 16, marginBottom: 12,
      borderRadius: 18, padding: SPACE.lg,
      shadowColor: '#000', shadowOpacity: 0.06,
      shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.2,
    },
    sectionSub: { fontSize: 12, color: C.textLight, marginTop: 2 },

    // Botão "+ Adicionar"
    addBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: C.brand, borderRadius: RADIUS.full,
      paddingVertical: 7, paddingHorizontal: 12,
    },
    addBtnActive: {
      backgroundColor: C.bgAccent,
    },
    addBtnText: { fontSize: 12, fontWeight: '700', color: C.primaryDark },

    // ── Empty states das seções ──────────────────────────────────────────
    emptySection: {
      alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16,
    },
    emptySectionIcon: {
      width: 52, height: 52, borderRadius: 14,
      backgroundColor: C.bgAccent,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 12,
    },
    emptySectionTitle: {
      fontSize: 14, fontWeight: '600', color: C.label, marginBottom: 6,
    },
    emptySectionSub: {
      fontSize: 12, color: C.textLight, textAlign: 'center', lineHeight: 18,
    },

    // ── Categorias chips ────────────────────────────────────────────────
    catChip: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5,
      paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: RADIUS.full, borderWidth: 0.5,
      borderColor: C.border, marginRight: 6,
      backgroundColor: C.bg,
    },
    catChipText: { fontSize: 11, color: C.label },

    // ── Metas ───────────────────────────────────────────────────────────
    metaItem: {
      backgroundColor: C.bg, borderRadius: 12,
      padding: SPACE.md, marginBottom: 8,
      borderWidth: 0.5, borderColor: C.borderLight,
    },
    metaIcone: {
      width: 32, height: 32, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center',
    },
    metaLabel: { fontSize: 13, fontWeight: '600', color: C.text },
    metaLabelSub: { fontSize: 11, color: C.label, marginTop: 1 },

    // ── Recorrentes ──────────────────────────────────────────────────────
    recItem: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.bg, borderRadius: 12,
      padding: SPACE.md, marginBottom: 8,
      borderWidth: 0.5, borderColor: C.borderLight,
    },
    recIcone: {
      width: 36, height: 36, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    recDesc: { fontSize: 14, fontWeight: '500', color: C.text },
    recMeta: { fontSize: 12, color: C.label, marginTop: 2 },
    recValor: { fontSize: 14, fontWeight: '700' },
    recRemove: { padding: 4 },

    // ── Formulário inline ────────────────────────────────────────────────
    inlineForm: { marginTop: 4 },
    formDivider: {
      height: 1, backgroundColor: C.borderLight, marginBottom: 16,
    },
    formFieldLabel: {
      fontSize: 12, fontWeight: '600', color: C.label,
      textTransform: 'uppercase', letterSpacing: 0.4,
      marginBottom: 8,
    },
    input: {
      borderWidth: 0.5, borderColor: C.border,
      borderRadius: RADIUS.md, padding: 11,
      fontSize: 14, marginBottom: 14,
      color: C.text, backgroundColor: C.bg,
    },
    row: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    tipoBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 6,
      borderWidth: 1, borderColor: C.border,
      borderRadius: RADIUS.md, padding: 10, backgroundColor: C.bg,
    },
    tipoBtnText: { fontSize: 13, fontWeight: '500', color: C.label },
    catScroll: { marginBottom: 14 },
    catBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: RADIUS.full, borderWidth: 0.5,
      borderColor: C.border, marginRight: 6, backgroundColor: C.bg,
    },
    catBtnText: { fontSize: 12, color: C.label },
    toggleRow: {
      flexDirection: 'row', alignItems: 'center',
      gap: 10, marginBottom: 14,
    },
    toggleTrack: {
      width: 40, height: 22, borderRadius: 11,
      backgroundColor: C.borderLight, justifyContent: 'center', paddingHorizontal: 2,
    },
    toggleThumb: {
      width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
      alignSelf: 'flex-start',
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2,
    },
    toggleLabel: { fontSize: 13, color: C.label },
    ctaBtn: {
      backgroundColor: C.brand, borderRadius: 12,
      paddingVertical: 13, alignItems: 'center',
    },
    ctaBtnText: { fontSize: 14, fontWeight: '700', color: C.primaryDark },

    // ── Utilitários ──────────────────────────────────────────────────────
    utilSection: {
      marginHorizontal: 16, marginBottom: 12,
    },
    utilTitle: {
      fontSize: 11, fontWeight: '700', color: C.textLight,
      textTransform: 'uppercase', letterSpacing: 0.8,
      marginBottom: 8, marginLeft: 4,
    },
    utilBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.bgCard, borderRadius: RADIUS.card, padding: 14,
      shadowColor: '#000', shadowOpacity: 0.04,
      shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    utilBtnIcon: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: C.despesaBg,
      alignItems: 'center', justifyContent: 'center',
    },
    utilBtnLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
    utilBtnSub:   { fontSize: 11, color: C.textLight },
  });
}
