import { useState, useMemo } from 'react';
import { View, TouchableOpacity, ScrollView, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { T as Text } from '../components/T';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import {
  FileDown, FolderOpen, CheckCircle, CircleCheck,
  Landmark, ArrowDownToLine, RefreshCw, X as XIcon,
} from 'lucide-react-native';
import { supabase } from '../supabase';
import { CATEGORIAS } from '../constants';
import { CatIcon } from '../constants/catIcons';
import { useTheme, type ColorPalette } from '../contexts/ThemeContext';
import { fmt } from '../utils/format';
import { parseOFX } from '../utils/ofx';
import type { Transacao, Meta, TransacaoOFX, Aba } from '../types';

type Props = {
  transacoes: Transacao[];
  metas: Meta[];
  setTransacoes: React.Dispatch<React.SetStateAction<Transacao[]>>;
  calcularAlertas: (txs: Transacao[], mts: Meta[]) => void;
  mostrarToast: (msg: string) => void;
  setAba: (aba: Aba) => void;
};

const STEPS = [
  { num: '1', text: 'Abra o app do seu banco e acesse o Extrato' },
  { num: '2', text: 'Exporte no formato OFX (arquivo bancário padrão)' },
  { num: '3', text: 'Selecione o arquivo aqui e importe em um toque' },
];

const BANKS = [
  { name: 'Nubank',   path: 'Extrato → ··· → Exportar extrato → OFX' },
  { name: 'Itaú',    path: 'Extrato → Exportar → OFX' },
  { name: 'Bradesco', path: 'Internet Banking → Extrato → Exportar' },
  { name: 'C6 Bank', path: 'Extrato → Compartilhar → OFX' },
];

export function TelaImportar({ transacoes, metas, setTransacoes, calcularAlertas, mostrarToast, setAba }: Props) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [txOFX, setTxOFX] = useState<TransacaoOFX[]>([]);
  const [arquivoNome, setArquivoNome] = useState('');
  const [salvandoOFX, setSalvandoOFX] = useState(false);

  const selOFX = useMemo(() => txOFX.filter(t => t.selecionada).length, [txOFX]);

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

  async function salvarOFX() {
    const sel = txOFX.filter(t => t.selecionada);
    if (!sel.length) return;
    setSalvandoOFX(true);
    try {
      const { data, error } = await supabase.from('transacoes')
        .insert(sel.map(({ id: _id, selecionada: _sel, ...r }) => r))
        .select();
      if (error) throw error;
      const novas = [...(data ?? []), ...transacoes];
      setTransacoes(novas);
      setTxOFX([]); setArquivoNome('');
      setAba('lancamentos');
      calcularAlertas(novas, metas);
      mostrarToast(`${data?.length ?? 0} transações importadas com sucesso!`);
    } catch (err: any) {
      mostrarToast(`Erro ao importar: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvandoOFX(false);
    }
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (txOFX.length === 0) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* ── Ilustração ── */}
        <View style={s.illWrapper}>
          {/* Anel externo decorativo */}
          <View style={s.illRing} />
          {/* Container central */}
          <View style={s.illCenter}>
            <FileDown size={44} color={C.brand} strokeWidth={1.5} />
          </View>
          {/* Badge banco */}
          <View style={[s.illBadge, { top: 18, right: 28 }]}>
            <Landmark size={13} color={C.label} strokeWidth={2} />
          </View>
          {/* Badge check */}
          <View style={[s.illBadge, { bottom: 18, left: 28, backgroundColor: C.receitaBg }]}>
            <CheckCircle size={13} color={C.receita} strokeWidth={2.5} />
          </View>
        </View>

        {/* ── Título ── */}
        <View style={{ paddingHorizontal: 32, alignItems: 'center', marginBottom: 28 }}>
          <Text style={s.emptyTitle}>Importe seu extrato bancário</Text>
          <Text style={s.emptySub}>
            Traga suas transações direto do banco em segundos — sem digitar nada manualmente.
          </Text>
        </View>

        {/* ── Passos ── */}
        <View style={s.stepsCard}>
          <Text style={s.stepsLabel}>Como funciona</Text>
          {STEPS.map((step, i) => (
            <View key={i} style={[s.stepRow, i < STEPS.length - 1 && s.stepRowBorder]}>
              <View style={s.stepNum}>
                <Text style={s.stepNumText}>{step.num}</Text>
              </View>
              <Text style={s.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>

        {/* ── CTA ── */}
        <TouchableOpacity style={s.ctaBtn} onPress={selecionarOFX} activeOpacity={0.85}>
          <FolderOpen size={18} color={C.primaryDark} strokeWidth={2.2} />
          <Text style={s.ctaBtnText}>Selecionar arquivo .OFX</Text>
        </TouchableOpacity>

        {/* ── Bancos suportados ── */}
        <View style={s.banksCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Landmark size={13} color={C.label} strokeWidth={2} />
            <Text style={s.banksTitle}>Como exportar do seu banco</Text>
          </View>
          {BANKS.map((b, i) => (
            <View key={i} style={[s.bankRow, i < BANKS.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: C.borderLight }]}>
              <Text style={s.bankName}>{b.name}</Text>
              <Text style={s.bankPath}>{b.path}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    );
  }

  // ── Estado: arquivo carregado ────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

      {/* Header do arquivo */}
      <View style={s.fileHeader}>
        <View style={s.fileHeaderIcon}>
          <FileDown size={20} color={C.brand} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.fileHeaderName} numberOfLines={1}>{arquivoNome}</Text>
          <Text style={s.fileHeaderMeta}>{txOFX.length} transações · {selOFX} selecionadas</Text>
        </View>
        <TouchableOpacity
          onPress={() => { setTxOFX([]); setArquivoNome(''); }}
          style={s.fileHeaderClose}
        >
          <XIcon size={16} color={C.label} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Ações em massa */}
      <View style={s.massActions}>
        <TouchableOpacity
          onPress={() => setTxOFX(txOFX.map(t => ({ ...t, selecionada: true })))}
          style={s.massBtn}
        >
          <CircleCheck size={13} color={C.label} strokeWidth={2} />
          <Text style={s.massBtnText}>Selecionar todas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTxOFX(txOFX.map(t => ({ ...t, selecionada: false })))}
          style={s.massBtn}
        >
          <XIcon size={13} color={C.label} strokeWidth={2} />
          <Text style={s.massBtnText}>Desmarcar</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de transações */}
      {txOFX.map(t => (
        <View key={t.id} style={[s.txItem, !t.selecionada && { opacity: 0.4 }]}>
          <TouchableOpacity
            onPress={() => setTxOFX(txOFX.map(x => x.id === t.id ? { ...x, selecionada: !x.selecionada } : x))}
            style={[s.checkbox, t.selecionada && { backgroundColor: C.brand, borderColor: C.brand }]}
          >
            {t.selecionada && <CheckCircle size={13} color={C.primaryDark} strokeWidth={2.5} />}
          </TouchableOpacity>
          <View style={s.txInfo}>
            <Text style={s.txDesc} numberOfLines={1}>{t.descricao}</Text>
            <Text style={s.txMeta}>{t.data}</Text>
            {t.selecionada && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {CATEGORIAS.map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setTxOFX(txOFX.map(x => x.id === t.id ? { ...x, categoria: c } : x))}
                    style={[s.catBtn, t.categoria === c && { backgroundColor: C.brand, borderColor: C.brand }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <CatIcon
                        categoria={c}
                        size={10}
                        color={t.categoria === c ? C.primaryDark : C.label}
                        strokeWidth={2}
                      />
                      <Text style={[s.catBtnText, t.categoria === c && { color: C.primaryDark }]}>{c}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            {t.selecionada && (
              <TouchableOpacity
                onPress={() => setTxOFX(txOFX.map(x => x.id === t.id ? { ...x, tipo: x.tipo === 'despesa' ? 'receita' : 'despesa' } : x))}
                style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: t.tipo === 'receita' ? C.receitaBg : C.despesaBg }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: t.tipo === 'receita' ? C.receita : C.despesa }}>
                  {t.tipo === 'receita' ? '↑ Receita' : '↓ Despesa'}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[s.txValor, { color: t.tipo === 'receita' ? C.receita : C.despesa }]}>
              {t.tipo === 'receita' ? '+' : '-'} {fmt(t.valor)}
            </Text>
          </View>
        </View>
      ))}

      {/* Botão importar */}
      <TouchableOpacity
        style={[s.importBtn, { opacity: selOFX === 0 || salvandoOFX ? 0.5 : 1 }]}
        onPress={salvarOFX}
        disabled={selOFX === 0 || salvandoOFX}
      >
        {salvandoOFX
          ? <ActivityIndicator color={C.primaryDark} />
          : (
            <>
              <ArrowDownToLine size={18} color={C.primaryDark} strokeWidth={2.2} />
              <Text style={s.importBtnText}>Importar {selOFX} transação{selOFX !== 1 ? 'ões' : ''}</Text>
            </>
          )
        }
      </TouchableOpacity>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    // ── Empty state ──────────────────────────────────────────────────────
    illWrapper: {
      width: 160, height: 160, alignSelf: 'center',
      marginTop: 40, marginBottom: 28,
      alignItems: 'center', justifyContent: 'center',
    },
    illRing: {
      position: 'absolute',
      width: 160, height: 160, borderRadius: 80,
      backgroundColor: C.brandBg,
      borderWidth: 1, borderColor: 'rgba(246,166,35,0.20)',
    },
    illCenter: {
      width: 88, height: 88, borderRadius: 24,
      backgroundColor: C.bgCard,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.10,
      shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
      elevation: 6,
      borderWidth: 1, borderColor: C.border,
    },
    illBadge: {
      position: 'absolute',
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: C.bgCard,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.08,
      shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
      elevation: 4,
      borderWidth: 1, borderColor: C.border,
    },
    emptyTitle: {
      fontSize: 22, fontWeight: '700', color: C.text,
      letterSpacing: -0.5, textAlign: 'center', marginBottom: 10,
    },
    emptySub: {
      fontSize: 14, color: C.label, textAlign: 'center',
      lineHeight: 22,
    },
    stepsCard: {
      marginHorizontal: 16, marginBottom: 16,
      backgroundColor: C.bgCard, borderRadius: 16,
      padding: 16,
      shadowColor: '#000', shadowOpacity: 0.05,
      shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    stepsLabel: {
      fontSize: 11, fontWeight: '700', color: C.textLight,
      textTransform: 'uppercase', letterSpacing: 0.8,
      marginBottom: 14,
    },
    stepRow: {
      flexDirection: 'row', alignItems: 'center',
      gap: 12, paddingVertical: 10,
    },
    stepRowBorder: {
      borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
    },
    stepNum: {
      width: 28, height: 28, borderRadius: 99,
      backgroundColor: C.brandBg,
      alignItems: 'center', justifyContent: 'center',
    },
    stepNumText: {
      fontSize: 13, fontWeight: '800', color: C.brand,
    },
    stepText: {
      flex: 1, fontSize: 13, color: C.text, lineHeight: 20,
    },
    ctaBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, marginHorizontal: 16, marginBottom: 16,
      backgroundColor: C.brand, borderRadius: 14,
      paddingVertical: 16,
      shadowColor: C.brandDark, shadowOpacity: 0.35,
      shadowRadius: 12, shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    ctaBtnText: {
      fontSize: 15, fontWeight: '700', color: C.primaryDark,
    },
    banksCard: {
      marginHorizontal: 16,
      backgroundColor: C.bgCard, borderRadius: 16,
      padding: 16,
      shadowColor: '#000', shadowOpacity: 0.05,
      shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    banksTitle: {
      fontSize: 12, fontWeight: '600', color: C.label,
    },
    bankRow: {
      paddingVertical: 10,
    },
    bankName: {
      fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2,
    },
    bankPath: {
      fontSize: 12, color: C.textLight, lineHeight: 18,
    },

    // ── Arquivo carregado ────────────────────────────────────────────────
    fileHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      margin: 16, marginBottom: 8,
      backgroundColor: C.bgCard, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: C.brandBg,
      shadowColor: '#000', shadowOpacity: 0.05,
      shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    fileHeaderIcon: {
      width: 40, height: 40, borderRadius: 10,
      backgroundColor: C.brandBg,
      alignItems: 'center', justifyContent: 'center',
    },
    fileHeaderName: {
      fontSize: 14, fontWeight: '600', color: C.text,
    },
    fileHeaderMeta: {
      fontSize: 12, color: C.label, marginTop: 2,
    },
    fileHeaderClose: {
      padding: 6, borderRadius: 8,
    },
    massActions: {
      flexDirection: 'row', gap: 8,
      paddingHorizontal: 16, marginBottom: 8,
    },
    massBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 6,
      backgroundColor: C.bgCard, borderRadius: 10,
      paddingVertical: 8,
      borderWidth: 0.5, borderColor: C.border,
    },
    massBtnText: { fontSize: 12, fontWeight: '500', color: C.label },
    txItem: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.bgCard, marginHorizontal: 16, marginBottom: 6,
      borderRadius: 12, padding: 12, gap: 10,
      shadowColor: '#000', shadowOpacity: 0.06,
      shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    txInfo: { flex: 1 },
    txDesc: { fontSize: 14, fontWeight: '500', color: C.text },
    txMeta: { fontSize: 12, color: C.label, marginTop: 2 },
    txValor: { fontSize: 14, fontWeight: '600' },
    checkbox: {
      width: 24, height: 24, borderRadius: 7,
      borderWidth: 1.5, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },
    catBtn: {
      paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: 99, borderWidth: 0.5,
      borderColor: C.border, marginRight: 6,
      backgroundColor: C.bg,
    },
    catBtnText: { fontSize: 11, color: C.label },
    importBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, margin: 16, marginTop: 8,
      backgroundColor: C.brand, borderRadius: 14, paddingVertical: 16,
      shadowColor: C.brandDark, shadowOpacity: 0.35,
      shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6,
    },
    importBtnText: {
      fontSize: 15, fontWeight: '700', color: C.primaryDark,
    },
  });
}
