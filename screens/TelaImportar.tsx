import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../supabase';
import { C, CATEGORIAS, ICONES_CAT } from '../constants';
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

export function TelaImportar({ transacoes, metas, setTransacoes, calcularAlertas, mostrarToast, setAba }: Props) {
  const [txOFX, setTxOFX] = useState<TransacaoOFX[]>([]);
  const [arquivoNome, setArquivoNome] = useState('');
  const [salvandoOFX, setSalvandoOFX] = useState(false);
  const [instrucaoExpandida, setInstrucaoExpandida] = useState(false);

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
      mostrarToast(`✅ ${data?.length ?? 0} transações importadas!`);
    } catch (err: any) {
      mostrarToast(`❌ Erro ao importar: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvandoOFX(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1 }}>
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
            {[
              '1. Abra o app do Nubank',
              '2. Vá em Extrato',
              '3. Toque nos três pontinhos (···)',
              '4. Selecione "Exportar extrato"',
              '5. Escolha o formato OFX',
              '6. Salve e importe aqui',
            ].map((l, i) => <Text key={i} style={s.infoTexto}>{l}</Text>)}
          </View>
        )}
      </TouchableOpacity>

      {txOFX.length === 0 && (
        <>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.primary, margin: 16, padding: 18, flexDirection: 'row', justifyContent: 'center', gap: 10 }]}
            onPress={selecionarOFX}
          >
            <Text style={{ fontSize: 20 }}>📂</Text>
            <Text style={[s.btnText, { color: '#fff', fontSize: 15 }]}>Selecionar arquivo .OFX</Text>
          </TouchableOpacity>
          <View style={s.vazioContainer}>
            <Text style={s.vazioEmoji}>📂</Text>
            <Text style={s.vazioTitulo}>Nenhum arquivo carregado</Text>
            <Text style={s.vazioSub}>Selecione um arquivo .OFX exportado do seu banco para importar as transações automaticamente.</Text>
          </View>
        </>
      )}

      {txOFX.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
            <View>
              <Text style={s.txDesc}>📄 {arquivoNome}</Text>
              <Text style={s.txMeta}>{txOFX.length} transações · {selOFX} selecionadas</Text>
            </View>
            <TouchableOpacity onPress={() => { setTxOFX([]); setArquivoNome(''); }} style={s.filtroBtn}>
              <Text style={s.filtroBtnText}>Limpar</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
            <TouchableOpacity onPress={() => setTxOFX(txOFX.map(t => ({ ...t, selecionada: true })))} style={[s.btn, { flex: 1, backgroundColor: C.bgAccent, padding: 8 }]}>
              <Text style={[s.btnText, { color: C.primaryDark }]}>Selecionar todas</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTxOFX(txOFX.map(t => ({ ...t, selecionada: false })))} style={[s.btn, { flex: 1, backgroundColor: C.bgAccent, padding: 8 }]}>
              <Text style={[s.btnText, { color: C.primaryDark }]}>Desmarcar</Text>
            </TouchableOpacity>
          </View>
          {txOFX.map(t => (
            <View key={t.id} style={[s.txItem, !t.selecionada && { opacity: 0.4 }]}>
              <TouchableOpacity
                onPress={() => setTxOFX(txOFX.map(x => x.id === t.id ? { ...x, selecionada: !x.selecionada } : x))}
                style={[s.checkbox, t.selecionada && { backgroundColor: C.primary, borderColor: C.primary }]}
              >
                {t.selecionada && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
              </TouchableOpacity>
              <View style={s.txInfo}>
                <Text style={s.txDesc} numberOfLines={1}>{t.descricao}</Text>
                <Text style={s.txMeta}>{t.data}</Text>
                {t.selecionada && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {CATEGORIAS.map(c => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setTxOFX(txOFX.map(x => x.id === t.id ? { ...x, categoria: c } : x))}
                        style={[s.catBtn, { paddingHorizontal: 8, paddingVertical: 3 }, t.categoria === c && { backgroundColor: C.primary, borderColor: C.primary }]}
                      >
                        <Text style={[s.catBtnText, { fontSize: 10 }, t.categoria === c && { color: '#fff' }]}>{ICONES_CAT[c]} {c}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
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
          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.receita, margin: 16, padding: 16, opacity: selOFX === 0 || salvandoOFX ? 0.5 : 1 }]}
            onPress={salvarOFX} disabled={selOFX === 0 || salvandoOFX}
          >
            {salvandoOFX
              ? <ActivityIndicator color="#fff"/>
              : <Text style={[s.btnText, { color: '#fff', fontSize: 15 }]}>💾 Salvar {selOFX} transações</Text>
            }
          </TouchableOpacity>
        </>
      )}

      <View style={{ height: 100 }}/>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 12 },
  greeting: { fontSize: 13, color: C.label },
  pageTitle: { fontSize: 22, fontWeight: '700', color: C.text },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  infoBox: { margin: 16, borderRadius: 12, padding: 16, marginBottom: 8, backgroundColor: C.bgAccent, borderWidth: 0.5, borderColor: C.border },
  infoTitulo: { fontSize: 14, fontWeight: '600', color: C.text },
  infoTexto: { fontSize: 13, lineHeight: 22, color: C.label },
  btn: { borderRadius: 10, padding: 12, alignItems: 'center' },
  btnText: { fontSize: 14, fontWeight: '600' },
  catBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 0.5, borderColor: C.border, marginRight: 6, backgroundColor: C.bg },
  catBtnText: { fontSize: 12, color: C.label },
  filtroBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, borderWidth: 0.5, borderColor: C.border, backgroundColor: C.bgCard },
  filtroBtnText: { fontSize: 13, color: C.label },
  txItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, marginHorizontal: 16, marginBottom: 6, borderRadius: 12, padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 14, fontWeight: '500', color: C.text },
  txMeta: { fontSize: 12, color: C.label, marginTop: 2 },
  txValor: { fontSize: 14, fontWeight: '600' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  vazioContainer: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  vazioEmoji: { fontSize: 48, marginBottom: 12 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 6 },
  vazioSub: { fontSize: 14, color: C.textLight, textAlign: 'center', lineHeight: 22 },
});
