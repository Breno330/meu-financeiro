import { useState, useMemo, useCallback, useRef } from 'react';
import {
  View, TextInput, TouchableOpacity, ScrollView,
  Animated, Modal, KeyboardAvoidingView, Platform, StyleSheet, Alert,
} from 'react-native';
import { Skeleton } from '../components/Skeleton';
import { T as Text } from '../components/T';
import { HeroCard } from '../components/HeroCard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { supabase } from '../supabase';
import {
  ArrowUpRight, ArrowDownRight, Tag, TrendingUp, TrendingDown,
  Pencil, X as XIcon, Search, Share2, Wallet, FileText,
  Table2, CheckCircle, AlertTriangle, Plus,
} from 'lucide-react-native';
import { MesSeletor } from '../components/MesSeletor';
import { AppInput } from '../components/AppInput';
import { CATEGORIAS, MESES, CORES_CAT } from '../constants';
import { CatIcon } from '../constants/catIcons';
import { useTheme, type ColorPalette } from '../contexts/ThemeContext';
import { fmt, fmtSaldo, saudacao, confirmar } from '../utils/format';
import { useBreakpoint } from '../hooks/useBreakpoint';
import type { Transacao, Meta, Tipo } from '../types';
import { RADIUS, SHADOW, SPACE, TYPE } from '../theme/tokens';

type Props = {
  transacoes: Transacao[];
  metas: Meta[];
  setTransacoes: React.Dispatch<React.SetStateAction<Transacao[]>>;
  calcularAlertas: (txs: Transacao[], mts: Meta[]) => void;
  mostrarToast: (msg: string) => void;
  carregando: boolean;
  mesSel: number;
  anoSel: number;
  navMes: (delta: number) => void;
};

export function TelaLancamentos({ transacoes, metas, setTransacoes, calcularAlertas, mostrarToast, carregando, mesSel, anoSel, navMes }: Props) {
  const hoje = new Date();
  const { heroFontSize, statCardWidth, isMobile, isDesktop, showRightPanel, rightPanelWidth } = useBreakpoint();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  // Filtros — mês/ano vêm de props (compartilhado com TelaResumo via App.tsx)
  const filtroMes = mesSel;
  const filtroAno = anoSel;
  const [filtro, setFiltro] = useState<'todas' | Tipo>('todas');
  const [busca, setBusca] = useState('');

  // Novo lançamento
  const [showFormModal, setShowFormModal] = useState(false);
  const [desc, setDesc] = useState('');
  const [val, setVal] = useState('');
  const [tipo, setTipo] = useState<Tipo>('despesa');
  const [cat, setCat] = useState('Alimentação');
  const [salvando, setSalvando] = useState(false);

  // Edição
  const [txEditando, setTxEditando] = useState<Transacao | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editVal, setEditVal] = useState('');
  const [editTipo, setEditTipo] = useState<Tipo>('despesa');
  const [editCat, setEditCat] = useState('Alimentação');
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  // Data do lançamento
  const [dataLanc, setDataLanc]         = useState(hoje.toLocaleDateString('pt-BR'));
  const [editDataLanc, setEditDataLanc] = useState('');

  // Hover (desktop)
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // FAB bounce
  const fabScale = useRef(new Animated.Value(1)).current;

  // Export
  const [showExportMenu, setShowExportMenu] = useState(false);

  // ── Derivações ──────────────────────────────────────────────────────────────
  const dados = useMemo(() => {
    const txFiltroMes = transacoes.filter(t => {
      const p = t.data?.split('/');
      return p && parseInt(p[1]) - 1 === filtroMes && parseInt(p[2]) === filtroAno;
    });
    const recFiltroMes = txFiltroMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despFiltroMes = txFiltroMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
    const saldoFiltroMes = recFiltroMes - despFiltroMes;

    const filtroMesAntIdx = filtroMes === 0 ? 11 : filtroMes - 1;
    const filtroAnoAntIdx = filtroMes === 0 ? filtroAno - 1 : filtroAno;
    const txMesAnt = transacoes.filter(t => {
      const p = t.data?.split('/');
      return p && parseInt(p[1]) - 1 === filtroMesAntIdx && parseInt(p[2]) === filtroAnoAntIdx;
    });
    const recMesAnt = txMesAnt.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despMesAnt = txMesAnt.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
    const pctRec = recMesAnt > 0 ? ((recFiltroMes - recMesAnt) / recMesAnt * 100) : null;
    const pctDesp = despMesAnt > 0 ? ((despFiltroMes - despMesAnt) / despMesAnt * 100) : null;

    const catMapFiltro: Record<string, number> = {};
    txFiltroMes.filter(t => t.tipo === 'despesa').forEach(t => { catMapFiltro[t.categoria] = (catMapFiltro[t.categoria] || 0) + Number(t.valor); });
    const catsFiltro = Object.entries(catMapFiltro).sort((a, b) => b[1] - a[1]);
    const maiorCat = catsFiltro[0];

    const visiveis = transacoes.filter(t => {
      const p = t.data?.split('/');
      const noMes = p && parseInt(p[1]) - 1 === filtroMes && parseInt(p[2]) === filtroAno;
      const matchTipo = filtro === 'todas' || t.tipo === filtro;
      const matchBusca = !busca || t.descricao.toLowerCase().includes(busca.toLowerCase()) || t.categoria.toLowerCase().includes(busca.toLowerCase());
      return noMes && matchTipo && matchBusca;
    });

    const txAgrupadas = visiveis.reduce((acc, t) => {
      if (!acc[t.data]) acc[t.data] = [];
      acc[t.data].push(t);
      return acc;
    }, {} as Record<string, Transacao[]>);

    const datasOrdenadas = Object.keys(txAgrupadas).sort((a, b) => {
      const [da, ma, ya] = a.split('/').map(Number);
      const [db, mb, yb] = b.split('/').map(Number);
      return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
    });

    return { txFiltroMes, recFiltroMes, despFiltroMes, saldoFiltroMes, filtroMesAntIdx, pctRec, pctDesp, maiorCat, catsFiltro, visiveis, txAgrupadas, datasOrdenadas };
  }, [transacoes, filtroMes, filtroAno, filtro, busca]);

  const { txFiltroMes, recFiltroMes, despFiltroMes, saldoFiltroMes, filtroMesAntIdx, pctRec, pctDesp, maiorCat, catsFiltro, visiveis, txAgrupadas, datasOrdenadas } = dados;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const formatarDataGrupo = useCallback((dataStr: string): string => {
    const hojeStr = hoje.toLocaleDateString('pt-BR');
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    const ontemStr = ontem.toLocaleDateString('pt-BR');
    if (dataStr === hojeStr) return 'Hoje';
    if (dataStr === ontemStr) return 'Ontem';
    const p = dataStr.split('/');
    if (p.length === 3) return `${parseInt(p[0])} de ${MESES[parseInt(p[1]) - 1]}`;
    return dataStr;
  }, [hoje]);

  async function adicionar() {
    const v = parseFloat(val.replace(/\./g, '').replace(',', '.'));
    if (!desc.trim() || isNaN(v) || v <= 0 || !validarDataLanc(dataLanc)) { mostrarToast('⚠️ Preencha todos os campos corretamente.'); return; }
    setSalvando(true);
    try {
      const { data, error } = await supabase.from('transacoes').insert({
        descricao: desc.trim(), valor: v, tipo, categoria: cat,
        data: dataLanc,
      }).select();
      if (error) throw error;
      const novas = [data[0], ...transacoes];
      setTransacoes(novas);
      setDesc(''); setVal(''); setDataLanc(hoje.toLocaleDateString('pt-BR'));
      calcularAlertas(novas, metas);
      setShowFormModal(false);
      mostrarToast('✅ Lançamento adicionado!');
    } catch (err: any) {
      mostrarToast(`❌ Erro ao salvar: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    confirmar('Excluir lançamento', 'Tem certeza que deseja excluir este lançamento?', async () => {
      const { error } = await supabase.from('transacoes').delete().eq('id', id);
      if (error) { mostrarToast(`❌ Erro ao excluir: ${error.message}`); return; }
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
    setEditDataLanc(t.data);
  }

  async function salvarEdicao() {
    if (!txEditando) return;
    const v = parseFloat(editVal.replace(/\./g, '').replace(',', '.'));
    if (!editDesc.trim() || isNaN(v) || v <= 0 || !validarDataLanc(editDataLanc)) { mostrarToast('⚠️ Preencha todos os campos corretamente.'); return; }
    setSalvandoEdit(true);
    try {
      const { data, error } = await supabase.from('transacoes')
        .update({ descricao: editDesc.trim(), valor: v, tipo: editTipo, categoria: editCat, data: editDataLanc })
        .eq('id', txEditando.id).select();
      if (error) throw error;
      const novas = transacoes.map(t => t.id === txEditando.id ? data[0] : t);
      setTransacoes(novas);
      calcularAlertas(novas, metas);
      setTxEditando(null);
      mostrarToast('✏️ Lançamento atualizado!');
    } catch (err: any) {
      mostrarToast(`❌ Erro ao editar: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvandoEdit(false);
    }
  }

  async function exportarCSV() {
    setShowExportMenu(false);
    const cab = 'Data,Descrição,Tipo,Categoria,Valor\n';
    const linhas = txFiltroMes.map(t => `${t.data},"${t.descricao}",${t.tipo},${t.categoria},${t.valor}`).join('\n');
    if (!linhas) { Alert.alert('Sem dados', 'Nenhum lançamento no período selecionado.'); return; }
    const path = FileSystem.documentDirectory + `financeiro_${MESES[filtroMes]}_${filtroAno}.csv`;
    await FileSystem.writeAsStringAsync(path, cab + linhas, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Exportar relatório' });
  }

  async function exportarPDF() {
    setShowExportMenu(false);
    if (!txFiltroMes.length) { Alert.alert('Sem dados', 'Nenhum lançamento no período selecionado.'); return; }
    const totalReceitas = txFiltroMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const totalDespesas = txFiltroMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
    const saldo = totalReceitas - totalDespesas;
    const linhas = txFiltroMes.map(t => `<tr><td>${t.data}</td><td>${t.descricao}</td><td>${ICONES_CAT[t.categoria]} ${t.categoria}</td><td style="color:${t.tipo === 'receita' ? '#16a34a' : '#dc2626'}">${t.tipo === 'receita' ? '+' : '-'} ${fmt(t.valor)}</td></tr>`).join('');
    const html = `<html><head><meta charset="utf-8"/><style>body{font-family:Arial,sans-serif;padding:24px;color:#1e293b}h1{color:#1d4ed8;font-size:22px;margin-bottom:4px}.periodo{color:#64748b;font-size:14px;margin-bottom:20px}.resumo{display:flex;gap:16px;margin-bottom:24px}.card{flex:1;padding:12px 16px;border-radius:8px}.card.receita{background:#dcfce7}.card.despesa{background:#fee2e2}.card.saldo{background:#dbeafe}.card label{font-size:11px;color:#64748b;display:block}.card span{font-size:16px;font-weight:bold}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#1d4ed8;color:white;padding:8px 10px;text-align:left}td{padding:7px 10px;border-bottom:1px solid #e2e8f0}tr:nth-child(even) td{background:#f8fafc}</style></head><body><h1>Relatório Financeiro</h1><div class="periodo">${MESES[filtroMes]} de ${filtroAno}</div><div class="resumo"><div class="card receita"><label>Receitas</label><span>${fmt(totalReceitas)}</span></div><div class="card despesa"><label>Despesas</label><span>${fmt(totalDespesas)}</span></div><div class="card saldo"><label>Saldo</label><span style="color:${saldo >= 0 ? '#16a34a' : '#dc2626'}">${fmtSaldo(saldo)}</span></div></div><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody></table></body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar PDF' });
  }

  // ── Render row (reutilizado em desktop e mobile) ───────────────────────────
  function renderTxRow(t: Transacao) {
    const isHovered = isDesktop && hoveredId === t.id;
    return (
      <View
        key={t.id}
        style={[s.txItem, isHovered && s.txItemHovered]}
        // @ts-ignore — React Native Web aceita onMouseEnter/onMouseLeave
        onMouseEnter={isDesktop ? () => setHoveredId(t.id) : undefined}
        onMouseLeave={isDesktop ? () => setHoveredId(null) : undefined}
      >
        <View style={[s.txIcone, { backgroundColor: t.tipo === 'receita' ? C.receitaBg : C.despesaBg }]}>
          <CatIcon
            categoria={t.categoria}
            size={18}
            color={t.tipo === 'receita' ? C.receita : C.despesa}
            strokeWidth={1.8}
          />
        </View>
        <View style={s.txInfo}>
          <Text style={s.txDesc}>{t.descricao}</Text>
          <Text style={s.txMeta}>{t.categoria}</Text>
        </View>
        <Text style={[s.txValor, { color: t.tipo === 'receita' ? C.receita : C.despesa }]}>
          {t.tipo === 'receita' ? '+' : '-'} {fmt(t.valor)}
        </Text>
        {/* Ações — visíveis sempre no mobile, só no hover no desktop */}
        <View style={[s.txAcoes, { opacity: !isDesktop || isHovered ? 1 : 0 }]}>
          <TouchableOpacity onPress={() => abrirEdicao(t)} style={s.txAcaoBtn}>
            <Pencil size={14} color={isHovered ? C.brand : C.label} strokeWidth={1.8} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remover(t.id)} style={s.txAcaoBtn}>
            <XIcon size={14} color={isHovered ? C.despesa : C.textLight} strokeWidth={1.8} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      {/* ── Modal: editar lançamento ── */}
      <Modal visible={!!txEditando} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalBox}>
              <View style={s.modalHandle}/>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Pencil size={16} color={C.brand} strokeWidth={2} />
                <Text style={s.modalTitulo}>Editar lançamento</Text>
              </View>
              <AppInput style={s.input} placeholder="Descrição" placeholderTextColor={C.textLight} value={editDesc} onChangeText={setEditDesc}/>
              <AppInput style={s.input} placeholder="Valor (ex: 2450,00)" placeholderTextColor={C.textLight} value={editVal} onChangeText={setEditVal} keyboardType="decimal-pad"/>
              <AppInput
                style={s.input}
                placeholder="Data (DD/MM/AAAA)"
                placeholderTextColor={C.textLight}
                value={editDataLanc}
                onChangeText={(t) => setEditDataLanc(fmtDataInput(t))}
                keyboardType="decimal-pad"
                maxLength={10}
              />
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
                  <TouchableOpacity key={c} style={[s.catBtn, editCat === c && { backgroundColor: C.brand, borderColor: C.brand }]} onPress={() => setEditCat(c)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <CatIcon categoria={c} size={12} color={editCat === c ? C.primaryDark : C.label} strokeWidth={2} />
                      <Text style={[s.catBtnText, editCat === c && { color: C.primaryDark }]}>{c}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.bgAccent }]} onPress={() => setTxEditando(null)}>
                  <Text style={[s.btnText, { color: C.primaryDark }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { flex: 2, backgroundColor: C.brand, opacity: salvandoEdit ? 0.6 : 1 }]} onPress={salvarEdicao} disabled={salvandoEdit}>
                  <Text style={[s.btnText, { color: C.primaryDark }]}>{salvandoEdit ? 'Salvando...' : 'Salvar alterações'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Modal: novo lançamento ── */}
      <Modal visible={showFormModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalBox}>
              <View style={s.modalHandle}/>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Plus size={16} color={C.brand} strokeWidth={2} />
                <Text style={s.modalTitulo}>Novo lançamento</Text>
              </View>
              <AppInput style={s.input} placeholder="Descrição" placeholderTextColor={C.textLight} value={desc} onChangeText={setDesc}/>
              <AppInput style={s.input} placeholder="Valor (ex: 2450,00)" placeholderTextColor={C.textLight} value={val} onChangeText={setVal} keyboardType="decimal-pad"/>
              <AppInput
                style={s.input}
                placeholder="Data (DD/MM/AAAA)"
                placeholderTextColor={C.textLight}
                value={dataLanc}
                onChangeText={(t) => setDataLanc(fmtDataInput(t))}
                keyboardType="decimal-pad"
                maxLength={10}
              />
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
                  <TouchableOpacity key={c} style={[s.catBtn, cat === c && { backgroundColor: C.brand, borderColor: C.brand }]} onPress={() => setCat(c)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <CatIcon categoria={c} size={12} color={cat === c ? C.primaryDark : C.label} strokeWidth={2} />
                      <Text style={[s.catBtnText, cat === c && { color: C.primaryDark }]}>{c}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.bgAccent }]} onPress={() => { setShowFormModal(false); setDesc(''); setVal(''); setDataLanc(hoje.toLocaleDateString('pt-BR')); }}>
                  <Text style={[s.btnText, { color: C.primaryDark }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { flex: 2, backgroundColor: C.brand, opacity: salvando ? 0.6 : 1 }]} onPress={adicionar} disabled={salvando}>
                  <Text style={[s.btnText, { color: C.primaryDark }]}>{salvando ? 'Salvando...' : 'Salvar lançamento'}</Text>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Share2 size={16} color={C.brand} strokeWidth={2} />
              <Text style={s.modalTitulo}>Exportar relatório</Text>
            </View>
            <Text style={s.modalSub}>{MESES[filtroMes]} de {filtroAno}</Text>
            <TouchableOpacity style={[s.exportOpcao, { borderColor: C.receita }]} onPress={exportarCSV}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.receitaBg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Table2 size={22} color={C.receita} strokeWidth={1.8} />
              </View>
              <Text style={[s.exportOpcaoTitulo, { color: C.receita }]}>Planilha CSV</Text>
              <Text style={s.exportOpcaoSub}>Abrir no Excel ou Google Sheets</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.exportOpcao, { borderColor: C.despesa }]} onPress={exportarPDF}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.despesaBg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <FileText size={22} color={C.despesa} strokeWidth={1.8} />
              </View>
              <Text style={[s.exportOpcaoTitulo, { color: C.despesa }]}>Relatório PDF</Text>
              <Text style={s.exportOpcaoSub}>Com resumo e tabela completa</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Conteúdo ── */}

      {/* Header — sempre largura total */}
      <View style={s.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.greeting}>{saudacao()}</Text>
          <Text style={s.pageTitle}>Minhas Finanças</Text>
        </View>
        {(Platform.OS !== 'web' || isMobile) && (
          <TouchableOpacity style={s.avatar} onPress={() => supabase.auth.signOut()}>
            <Text style={s.avatarText}>↩</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Seletor de mês — fora do split, sempre visível */}
      <MesSeletor
        mes={filtroMes}
        ano={filtroAno}
        onPrev={() => navMes(-1)}
        onNext={() => navMes(1)}
        style={{ marginTop: 0 }}
      />

      {showRightPanel ? (
        /* ── MEDIUM / DESKTOP: duas colunas ── */
        <View style={{ flex: 1, flexDirection: 'row', overflow: 'hidden' }}>

          {/* Coluna esquerda — conteúdo principal */}
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

            {/* Hero */}
            <HeroCard
              receitas={recFiltroMes}
              despesas={despFiltroMes}
              mes={filtroMes}
              ano={filtroAno}
              heroFontSize={heroFontSize}
              pctRec={pctRec}
              pctDesp={pctDesp}
              mesPrevLabel={MESES[filtroMesAntIdx].substring(0, 3)}
              style={{ marginHorizontal: 16, marginBottom: 12 }}
            />

            {/* Stat cards — grid de 4 colunas no desktop */}
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 14 }}>
              <View style={[s.statCard, { flex: 1 }]}>
                <View style={[s.statIcone, { backgroundColor: C.receitaBg }]}>
                  <ArrowUpRight size={16} color={C.receita} strokeWidth={2} />
                </View>
                <Text style={s.statLabel}>Receitas</Text>
                <Text style={[s.statVal, { color: C.receita }]}>{fmt(recFiltroMes)}</Text>
                {pctRec !== null && <Text style={[s.statPct, { color: pctRec >= 0 ? C.receita : C.despesa }]}>{pctRec >= 0 ? '+' : ''}{Math.round(pctRec)}% vs {MESES[filtroMesAntIdx].substring(0, 3)}</Text>}
              </View>
              <View style={[s.statCard, { flex: 1 }]}>
                <View style={[s.statIcone, { backgroundColor: C.despesaBg }]}>
                  <ArrowDownRight size={16} color={C.despesa} strokeWidth={2} />
                </View>
                <Text style={s.statLabel}>Despesas</Text>
                <Text style={[s.statVal, { color: C.despesa }]}>{fmt(despFiltroMes)}</Text>
                {pctDesp !== null && <Text style={[s.statPct, { color: pctDesp > 0 ? C.despesa : C.receita }]}>{pctDesp > 0 ? '+' : ''}{Math.round(pctDesp)}% vs {MESES[filtroMesAntIdx].substring(0, 3)}</Text>}
              </View>
              <View style={[s.statCard, { flex: 1 }]}>
                <View style={[s.statIcone, { backgroundColor: C.bgAccent }]}>
                  <Tag size={16} color={C.label} strokeWidth={1.8} />
                </View>
                <Text style={s.statLabel}>Maior categoria</Text>
                <Text style={[s.statVal, { color: C.text, fontSize: 14 }]}>{maiorCat ? maiorCat[0] : '—'}</Text>
                {maiorCat && <Text style={s.statPct}>{fmt(maiorCat[1])}</Text>}
              </View>
              <View style={[s.statCard, { flex: 1 }]}>
                <View style={[s.statIcone, { backgroundColor: saldoFiltroMes >= 0 ? C.receitaBg : C.despesaBg }]}>
                  {saldoFiltroMes >= 0
                    ? <TrendingUp   size={16} color={C.receita} strokeWidth={2} />
                    : <TrendingDown size={16} color={C.despesa} strokeWidth={2} />
                  }
                </View>
                <Text style={s.statLabel}>Previsto fechar</Text>
                <Text style={[s.statVal, { color: saldoFiltroMes >= 0 ? C.receita : C.despesa, fontSize: 14 }]}>{fmtSaldo(saldoFiltroMes)}</Text>
                <Text style={[s.statPct, { color: saldoFiltroMes >= 0 ? C.receita : C.despesa }]}>{saldoFiltroMes >= 0 ? 'Superávit' : 'Déficit'}</Text>
              </View>
            </View>

            {/* Busca + exportar */}
            <View style={s.buscaRow}>
              <View style={s.buscaInput}>
                <Search size={14} color={C.textLight} strokeWidth={2} style={{ marginRight: 6 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 13, color: C.text }}
                  placeholder="Buscar transação..." placeholderTextColor={C.textLight}
                  value={busca} onChangeText={setBusca}
                />
                {busca.length > 0 && (
                  <TouchableOpacity onPress={() => setBusca('')}>
                    <Text style={{ color: C.textLight, fontSize: 13 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={s.exportBtn} onPress={() => setShowExportMenu(true)}>
                <Share2 size={15} color="#fff" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Filtros */}
            <View style={[s.filtros, { paddingTop: 0 }]}>
              {(['todas', 'receita', 'despesa'] as const).map(f => (
                <TouchableOpacity key={f} style={[s.filtroBtn, filtro === f && { backgroundColor: C.brand, borderColor: C.brand }]} onPress={() => setFiltro(f)}>
                  <Text style={[s.filtroBtnText, filtro === f && { color: C.primaryDark }]}>
                    {f === 'todas' ? 'Todas' : f === 'receita' ? 'Receitas' : 'Despesas'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Lista */}
            {carregando ? (
              <SkeletonList s={s} />
            ) : visiveis.length === 0 ? (
              <View style={s.vazioContainer}>
                <View style={[s.vazioEmoji, { backgroundColor: C.bgAccent, borderRadius: 20 }]}>
                <Wallet size={40} color={C.textLight} strokeWidth={1.5} />
              </View>
                <Text style={s.vazioTitulo}>{busca ? 'Nenhum resultado' : 'Nenhum lançamento'}</Text>
                <Text style={s.vazioSub}>{busca ? `Nenhuma transação encontrada para "${busca}".` : `Clique em + para adicionar sua primeira transação de ${MESES[filtroMes]}.`}</Text>
              </View>
            ) : (
              datasOrdenadas.map(dataKey => (
                <View key={dataKey}>
                  <Text style={s.dataGrupoHeader}>{formatarDataGrupo(dataKey)}</Text>
                  {txAgrupadas[dataKey].map(t => renderTxRow(t))}
                </View>
              ))
            )}
            <View style={{ height: 100 }}/>
          </ScrollView>

          {/* ── Coluna direita — painel contextual ── */}
          <View style={[s.rightPanel, { width: rightPanelWidth }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingTop: 12 }}>

              {/* Gastos por categoria */}
              <Text style={s.panelSection}>Gastos por Categoria</Text>
              {catsFiltro.length === 0 ? (
                <Text style={{ fontSize: 13, color: C.textLight, marginBottom: 24 }}>Nenhum gasto em {MESES[filtroMes]}.</Text>
              ) : (
                catsFiltro.slice(0, 6).map(([cat, val]) => {
                  const pctBar = catsFiltro[0][1] > 0 ? val / catsFiltro[0][1] : 0;
                  const pctDesp = despFiltroMes > 0 ? val / despFiltroMes : 0;
                  return (
                    <View key={cat} style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <CatIcon categoria={cat} size={13} color={CORES_CAT[cat] || C.label} strokeWidth={2} />
                          <Text style={{ fontSize: 13, color: C.text }}>{cat}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }}>{fmt(val)}</Text>
                      </View>
                      <View style={{ height: 4, backgroundColor: C.bgAccent, borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ height: 4, width: `${Math.round(pctBar * 100)}%` as any, backgroundColor: CORES_CAT[cat] || C.despesa, borderRadius: 2 }} />
                      </View>
                      <Text style={{ fontSize: 11, color: C.textLight, marginTop: 4 }}>
                        {Math.round(pctDesp * 100)}% das despesas
                      </Text>
                    </View>
                  );
                })
              )}

              {/* Metas do mês */}
              {(() => {
                const metasMes = metas.filter(m => m.mes === filtroMes && m.ano === filtroAno);
                if (metasMes.length === 0) return null;
                return (
                  <View style={{ marginTop: 8 }}>
                    <Text style={s.panelSection}>Metas do Mês</Text>
                    {metasMes.map((meta, i) => {
                      let atual = 0;
                      let pct = 0;
                      if (meta.tipo === 'saldo') {
                        atual = saldoFiltroMes;
                        pct = meta.valor > 0 ? Math.min(Math.max(atual / meta.valor, 0), 1) : 0;
                      } else if (meta.tipo === 'categoria' && meta.categoria) {
                        atual = txFiltroMes.filter(t => t.tipo === 'despesa' && t.categoria === meta.categoria).reduce((s, t) => s + Number(t.valor), 0);
                        pct = meta.valor > 0 ? Math.min(atual / meta.valor, 1) : 0;
                      }
                      const ok = meta.tipo === 'saldo' ? atual >= meta.valor : atual <= meta.valor;
                      const barColor = ok ? C.receita : (pct > 0.8 ? '#F59E0B' : C.despesa);
                      return (
                        <View key={i} style={{ marginBottom: 16 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <View style={{ flex: 1 }}>
                              {meta.tipo === 'saldo' ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                  <Wallet size={13} color={C.label} strokeWidth={1.8} />
                                  <Text style={{ fontSize: 13, color: C.text }}>Saldo mínimo</Text>
                                </View>
                              ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                  <CatIcon categoria={meta.categoria || ''} size={13} color={C.label} strokeWidth={1.8} />
                                  <Text style={{ fontSize: 13, color: C.text }}>{meta.categoria}</Text>
                                </View>
                              )}
                            </View>
                            {ok
                              ? <CheckCircle size={14} color={C.receita} strokeWidth={2} />
                              : <AlertTriangle size={14} color={C.despesa} strokeWidth={2} />
                            }
                          </View>
                          <View style={{ height: 4, backgroundColor: C.bgAccent, borderRadius: 2, overflow: 'hidden' }}>
                            <View style={{ height: 4, width: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor, borderRadius: 2 }} />
                          </View>
                          <Text style={{ fontSize: 11, color: C.textLight, marginTop: 4 }}>
                            {fmt(Math.abs(atual))} de {fmt(meta.valor)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

            </ScrollView>
          </View>
        </View>

      ) : (

        /* ── MOBILE: coluna única ── */
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

          <HeroCard
            receitas={recFiltroMes}
            despesas={despFiltroMes}
            mes={filtroMes}
            ano={filtroAno}
            heroFontSize={heroFontSize}
            pctRec={pctRec}
            pctDesp={pctDesp}
            mesPrevLabel={MESES[filtroMesAntIdx].substring(0, 3)}
            style={{ marginHorizontal: 16, marginBottom: 12 }}
          />

          {/* Stat cards — scroll horizontal no mobile */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <View style={[s.statCard, { width: statCardWidth }]}>
              <View style={[s.statIcone, { backgroundColor: C.receitaBg }]}>
                <ArrowUpRight size={16} color={C.receita} strokeWidth={2} />
              </View>
              <Text style={s.statLabel}>Receitas</Text>
              <Text style={[s.statVal, { color: C.receita }]}>{fmt(recFiltroMes)}</Text>
              {pctRec !== null && <Text style={[s.statPct, { color: pctRec >= 0 ? C.receita : C.despesa }]}>{pctRec >= 0 ? '+' : ''}{Math.round(pctRec)}% vs {MESES[filtroMesAntIdx].substring(0, 3)}</Text>}
            </View>
            <View style={[s.statCard, { width: statCardWidth }]}>
              <View style={[s.statIcone, { backgroundColor: C.despesaBg }]}>
                <ArrowDownRight size={16} color={C.despesa} strokeWidth={2} />
              </View>
              <Text style={s.statLabel}>Despesas</Text>
              <Text style={[s.statVal, { color: C.despesa }]}>{fmt(despFiltroMes)}</Text>
              {pctDesp !== null && <Text style={[s.statPct, { color: pctDesp > 0 ? C.despesa : C.receita }]}>{pctDesp > 0 ? '+' : ''}{Math.round(pctDesp)}% vs {MESES[filtroMesAntIdx].substring(0, 3)}</Text>}
            </View>
            <View style={[s.statCard, { width: statCardWidth }]}>
              <View style={[s.statIcone, { backgroundColor: C.bgAccent }]}>
                <Tag size={16} color={C.label} strokeWidth={1.8} />
              </View>
              <Text style={s.statLabel}>Maior categoria</Text>
              <Text style={[s.statVal, { color: C.text, fontSize: 14 }]}>{maiorCat ? maiorCat[0] : '—'}</Text>
              {maiorCat && <Text style={s.statPct}>{fmt(maiorCat[1])}</Text>}
            </View>
            <View style={[s.statCard, { width: statCardWidth }]}>
              <View style={[s.statIcone, { backgroundColor: saldoFiltroMes >= 0 ? C.receitaBg : C.despesaBg }]}>
                {saldoFiltroMes >= 0
                  ? <TrendingUp   size={16} color={C.receita} strokeWidth={2} />
                  : <TrendingDown size={16} color={C.despesa} strokeWidth={2} />
                }
              </View>
              <Text style={s.statLabel}>Previsto fechar</Text>
              <Text style={[s.statVal, { color: saldoFiltroMes >= 0 ? C.receita : C.despesa, fontSize: 14 }]}>{fmtSaldo(saldoFiltroMes)}</Text>
              <Text style={[s.statPct, { color: saldoFiltroMes >= 0 ? C.receita : C.despesa }]}>{saldoFiltroMes >= 0 ? 'Superávit' : 'Déficit'}</Text>
            </View>
          </ScrollView>

          {/* Busca + exportar */}
          <View style={s.buscaRow}>
            <View style={s.buscaInput}>
              <Search size={14} color={C.textLight} strokeWidth={2} style={{ marginRight: 6 }} />
              <TextInput
                style={{ flex: 1, fontSize: 13, color: C.text }}
                placeholder="Buscar transação..." placeholderTextColor={C.textLight}
                value={busca} onChangeText={setBusca}
              />
              {busca.length > 0 && (
                <TouchableOpacity onPress={() => setBusca('')}>
                  <Text style={{ color: C.textLight, fontSize: 13 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={s.exportBtn} onPress={() => setShowExportMenu(true)}>
              <Share2 size={15} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Filtros */}
          <View style={[s.filtros, { paddingTop: 0 }]}>
            {(['todas', 'receita', 'despesa'] as const).map(f => (
              <TouchableOpacity key={f} style={[s.filtroBtn, filtro === f && { backgroundColor: C.brand, borderColor: C.brand }]} onPress={() => setFiltro(f)}>
                <Text style={[s.filtroBtnText, filtro === f && { color: C.primaryDark }]}>
                  {f === 'todas' ? 'Todas' : f === 'receita' ? 'Receitas' : 'Despesas'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Lista agrupada */}
          {carregando ? (
            <SkeletonList s={s} />
          ) : visiveis.length === 0 ? (
            <View style={s.vazioContainer}>
              <View style={[s.vazioEmoji, { backgroundColor: C.bgAccent, borderRadius: 20 }]}>
                <Wallet size={40} color={C.textLight} strokeWidth={1.5} />
              </View>
              <Text style={s.vazioTitulo}>{busca ? 'Nenhum resultado' : 'Nenhum lançamento'}</Text>
              <Text style={s.vazioSub}>{busca ? `Nenhuma transação encontrada para "${busca}".` : `Toque em + para adicionar sua primeira transação de ${MESES[filtroMes]}.`}</Text>
            </View>
          ) : (
            datasOrdenadas.map(dataKey => (
              <View key={dataKey}>
                <Text style={s.dataGrupoHeader}>{formatarDataGrupo(dataKey)}</Text>
                {txAgrupadas[dataKey].map(t => renderTxRow(t))}
              </View>
            ))
          )}
          <View style={{ height: 100 }}/>
        </ScrollView>
      )}

      {/* FAB — spring bounce no press */}
      <Animated.View style={[s.fab, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity
          style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setShowFormModal(true)}
          onPressIn={() =>
            Animated.spring(fabScale, { toValue: 0.88, useNativeDriver: true, speed: 300, bounciness: 0 }).start()
          }
          onPressOut={() =>
            Animated.spring(fabScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start()
          }
          activeOpacity={1}
        >
          <Text style={s.fabText}>＋</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

// ── Helpers de data ──────────────────────────────────────────────────────────
function fmtDataInput(text: string): string {
  const n = text.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0,2)}/${n.slice(2)}`;
  return `${n.slice(0,2)}/${n.slice(2,4)}/${n.slice(4)}`;
}

function validarDataLanc(d: string): boolean {
  const p = d.split('/');
  if (p.length !== 3 || p[2].length !== 4) return false;
  const dia = parseInt(p[0]), mes = parseInt(p[1]), ano = parseInt(p[2]);
  return dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 2000;
}

// ── Skeleton list — substitui ActivityIndicator durante carregamento ──────────
function SkeletonList({ s }: { s: ReturnType<typeof makeStyles> }) {
  const WIDTHS = ['62%', '78%', '55%', '70%', '48%', '65%', '72%'] as const;
  const SUB_W  = ['38%', '50%', '30%', '45%', '35%', '42%', '38%'] as const;
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      {/* Fake date header */}
      <Skeleton width={90} height={10} radius={4} style={{ marginBottom: 12, marginTop: 8 }} />
      {WIDTHS.map((w, i) => (
        <View key={i} style={[s.txItem, { marginBottom: 6 }]}>
          <Skeleton width={36} height={36} radius={10} />
          <View style={{ flex: 1, gap: 7 }}>
            <Skeleton width={w} height={13} radius={4} />
            <Skeleton width={SUB_W[i]} height={11} radius={4} />
          </View>
          <Skeleton width={54} height={13} radius={4} />
        </View>
      ))}
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: SPACE.xl, paddingBottom: 12 },
  rightPanel: { width: 300, backgroundColor: C.bgCard, borderLeftWidth: 1, borderLeftColor: C.border },
  panelSection: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 16, marginTop: 4, letterSpacing: -0.2 },
  greeting: { fontSize: 13, color: C.label },
  pageTitle: { fontSize: 22, fontWeight: '700', color: C.text },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  statCard: { backgroundColor: C.bgCard, borderRadius: RADIUS.card, padding: 14, marginRight: 10, width: 150, ...SHADOW.sm },
  statIcone: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statLabel: { fontSize: 11, color: C.textLight, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  statVal: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  statPct: { fontSize: 11, color: C.textLight },
  buscaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  buscaInput: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderWidth: 1, borderColor: C.border },
  exportBtn: { backgroundColor: C.brand, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', justifyContent: 'center' },
  filtros: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
  filtroBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 0.5, borderColor: C.border, backgroundColor: C.bgCard },
  filtroBtnText: { fontSize: 13, color: C.label },
  dataGrupoHeader: { fontSize: 12, fontWeight: '700', color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  txItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, marginHorizontal: 16, marginBottom: 6, borderRadius: 12, padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  txItemHovered: { backgroundColor: C.bgAccent },
  txAcoes: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  txAcaoBtn: { padding: 6, borderRadius: 7 },
  txIcone: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 14, fontWeight: '500', color: C.text },
  txMeta: { fontSize: 12, color: C.label, marginTop: 2 },
  txValor: { fontSize: 14, fontWeight: '600' },
  vazioContainer: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  vazioEmoji: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 6 },
  vazioSub: { fontSize: 14, color: C.textLight, textAlign: 'center', lineHeight: 22 },
  input: { borderWidth: 0.5, borderColor: C.border, borderRadius: RADIUS.md, padding: 10, fontSize: 14, marginBottom: 8, color: C.text, backgroundColor: C.bg },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tipoBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', backgroundColor: C.bg },
  tipoBtnText: { fontSize: 13, fontWeight: '500', color: C.label },
  catScroll: { marginBottom: 12 },
  catBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 0.5, borderColor: C.border, marginRight: 6, backgroundColor: C.bg },
  catBtnText: { fontSize: 12, color: C.label },
  btn: { borderRadius: RADIUS.md, padding: SPACE.md, alignItems: 'center' },
  btnText: { fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: C.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderTopWidth: 0.5, borderTopColor: C.borderLight },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderLight, alignSelf: 'center', marginBottom: 16 },
  modalTitulo: { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 4 },
  modalSub: { fontSize: 13, color: C.label, marginBottom: 12 },
  exportOpcao: { borderWidth: 1.5, borderRadius: RADIUS.card, padding: 16, marginBottom: 10, alignItems: 'center' },
  exportOpcaoTitulo: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  exportOpcaoSub: { fontSize: 12, color: C.textLight },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', shadowColor: C.brandDark, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  fabText: { fontSize: 28, color: '#fff', lineHeight: 34, marginTop: -2 },
  });
}
