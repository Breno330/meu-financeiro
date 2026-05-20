import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { supabase } from '../supabase';
import { C, CATEGORIAS, ICONES_CAT, MESES } from '../constants';
import { fmt, confirmar } from '../utils/format';
import type { Transacao, Meta, Recorrente, Tipo } from '../types';

type Props = {
  transacoes: Transacao[];
  metas: Meta[];
  recorrentes: Recorrente[];
  setMetas: React.Dispatch<React.SetStateAction<Meta[]>>;
  setRecorrentes: React.Dispatch<React.SetStateAction<Recorrente[]>>;
  calcularAlertas: (txs: Transacao[], mts: Meta[]) => void;
  mostrarToast: (msg: string) => void;
};

export function TelaMetas({ transacoes, metas, recorrentes, setMetas, setRecorrentes, calcularAlertas, mostrarToast }: Props) {
  const hoje = new Date();

  // Meta form
  const [metaTipo, setMetaTipo] = useState<'saldo' | 'categoria'>('saldo');
  const [metaCat, setMetaCat] = useState('Alimentação');
  const [metaVal, setMetaVal] = useState('');
  const [salvandoMeta, setSalvandoMeta] = useState(false);

  // Recorrente form
  const [recDesc, setRecDesc] = useState('');
  const [recVal, setRecVal] = useState('');
  const [recTipo, setRecTipo] = useState<Tipo>('despesa');
  const [recCat, setRecCat] = useState('Alimentação');
  const [salvandoRec, setSalvandoRec] = useState(false);
  const [recEhParcelado, setRecEhParcelado] = useState(false);
  const [recParcelas, setRecParcelas] = useState('');
  const [limpandoDupl, setLimpandoDupl] = useState(false);

  const txAtual = transacoes.filter(t => {
    const p = t.data?.split('/');
    return p && parseInt(p[1]) - 1 === hoje.getMonth() && parseInt(p[2]) === hoje.getFullYear();
  });
  const recAtual = txAtual.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
  const despAtual = txAtual.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
  const saldoAtual = recAtual - despAtual;

  const metasMes = metas.filter(m => m.mes === hoje.getMonth() && m.ano === hoje.getFullYear());

  function getProgMeta(m: Meta) {
    if (m.tipo === 'saldo') return { atual: saldoAtual, max: m.valor, pct: Math.min(Math.max(saldoAtual / m.valor * 100, 0), 100), ok: saldoAtual >= m.valor };
    const g = txAtual.filter(t => t.tipo === 'despesa' && t.categoria === m.categoria).reduce((s, t) => s + Number(t.valor), 0);
    return { atual: g, max: m.valor, pct: Math.min(g / m.valor * 100, 100), ok: g <= m.valor };
  }

  async function adicionarMeta() {
    const v = parseFloat(metaVal.replace(/\./g, '').replace(',', '.'));
    if (isNaN(v) || v <= 0) { mostrarToast('⚠️ Informe um valor válido para a meta.'); return; }
    setSalvandoMeta(true);
    try {
      const { data, error } = await supabase.from('metas').insert({
        tipo: metaTipo, categoria: metaTipo === 'categoria' ? metaCat : null,
        valor: v, mes: hoje.getMonth(), ano: hoje.getFullYear(),
      }).select();
      if (error) throw error;
      const novas = [...metas, data[0]];
      setMetas(novas); setMetaVal('');
      calcularAlertas(transacoes, novas);
      mostrarToast('🎯 Meta salva!');
    } catch (err: any) {
      mostrarToast(`❌ Erro ao salvar meta: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvandoMeta(false);
    }
  }

  async function removerMeta(id: string) {
    confirmar('Excluir meta', 'Deseja remover esta meta?', async () => {
      const { error } = await supabase.from('metas').delete().eq('id', id);
      if (error) { mostrarToast(`❌ Erro ao remover meta: ${error.message}`); return; }
      const novas = metas.filter(m => m.id !== id);
      setMetas(novas);
      calcularAlertas(transacoes, novas);
      mostrarToast('🗑 Meta removida');
    });
  }

  async function adicionarRecorrente() {
    const v = parseFloat(recVal.replace(/\./g, '').replace(',', '.'));
    if (!recDesc.trim() || isNaN(v) || v <= 0) { mostrarToast('⚠️ Preencha descrição e valor corretamente.'); return; }
    const parcTotal = recEhParcelado ? parseInt(recParcelas) : null;
    if (recEhParcelado && (!parcTotal || parcTotal < 2)) { mostrarToast('⚠️ Informe ao menos 2 parcelas.'); return; }
    setSalvandoRec(true);
    try {
      const { data, error } = await supabase.from('recorrentes').insert({
        descricao: recDesc.trim(), valor: v, tipo: recTipo, categoria: recCat, ativo: true,
        parcelas_total: parcTotal, parcelas_restantes: parcTotal,
      }).select();
      if (error) throw error;
      setRecorrentes([...recorrentes, data[0]]);
      setRecDesc(''); setRecVal(''); setRecParcelas(''); setRecEhParcelado(false);
      mostrarToast('🔄 Recorrente adicionada!');
    } catch (err: any) {
      mostrarToast(`❌ Erro ao salvar recorrente: ${err.message ?? 'tente novamente'}`);
    } finally {
      setSalvandoRec(false);
    }
  }

  async function removerRecorrente(id: string) {
    confirmar('Remover recorrente', 'Deseja remover esta despesa recorrente?', async () => {
      const { error } = await supabase.from('recorrentes').update({ ativo: false }).eq('id', id);
      if (error) { mostrarToast(`❌ Erro ao remover: ${error.message}`); return; }
      setRecorrentes(recorrentes.filter(r => r.id !== id));
      mostrarToast('🗑 Recorrente removida');
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
        mostrarToast(`🗑 ${idsApagar.length} duplicata${idsApagar.length > 1 ? 's removidas' : ' removida'}!`);
        setLimpandoDupl(false);
      }
    );
  }, [transacoes, metas, recorrentes, mostrarToast]);

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

      <View style={s.pageHeader}>
        <View><Text style={s.greeting}>Acompanhe seus</Text><Text style={s.pageTitle}>Metas & Alertas</Text></View>
        <View style={[s.avatar, { backgroundColor: C.metaBg }]}><Text style={[s.avatarText, { color: C.metaText }]}>🎯</Text></View>
      </View>

      <TouchableOpacity
        style={{ alignSelf: 'center', marginTop: 8, marginBottom: 4, opacity: limpandoDupl ? 0.4 : 1 }}
        onPress={limparDuplicatas} disabled={limpandoDupl}
      >
        <Text style={{ fontSize: 11, color: C.textLight }}>🧹 remover duplicatas do mês</Text>
      </TouchableOpacity>

      {/* Metas do mês */}
      {metasMes.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitulo}>Metas de {MESES[hoje.getMonth()]}</Text>
          {metasMes.map(m => {
            const p = getProgMeta(m);
            return (
              <View key={m.id} style={s.metaItem}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={s.metaLabel}>{m.tipo === 'saldo' ? '💰 Meta de saldo' : `${ICONES_CAT[m.categoria || '']} Limite ${m.categoria}`}</Text>
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

      {/* Formulário nova meta */}
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

      {/* Recorrentes */}
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
            <View style={[s.txIcone, { backgroundColor: r.tipo === 'receita' ? C.receitaBg : C.despesaBg }]}>
              <Text style={{ fontSize: 14 }}>{ICONES_CAT[r.categoria]}</Text>
            </View>
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
            <TouchableOpacity onPress={() => removerRecorrente(r.id)} style={{ padding: 4 }}>
              <Text style={{ color: C.textLight, fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TextInput style={s.input} placeholder="Descrição (ex: Celular Samsung)" placeholderTextColor={C.textLight} value={recDesc} onChangeText={setRecDesc}/>
        <TextInput style={s.input} placeholder="Valor (ex: 1500,00)" placeholderTextColor={C.textLight} value={recVal} onChangeText={setRecVal} keyboardType="decimal-pad"/>
        <View style={s.row}>
          <TouchableOpacity style={[s.tipoBtn, recTipo === 'despesa' && { backgroundColor: C.despesa, borderColor: C.despesa }]} onPress={() => setRecTipo('despesa')}>
            <Text style={[s.tipoBtnText, recTipo === 'despesa' && { color: '#fff' }]}>Despesa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tipoBtn, recTipo === 'receita' && { backgroundColor: C.receita, borderColor: C.receita }]} onPress={() => setRecTipo('receita')}>
            <Text style={[s.tipoBtnText, recTipo === 'receita' && { color: '#fff' }]}>Receita</Text>
          </TouchableOpacity>
        </View>

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
            placeholder="Número de parcelas (ex: 12)" placeholderTextColor={C.textLight}
            value={recParcelas} onChangeText={setRecParcelas} keyboardType="number-pad"
          />
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
          {CATEGORIAS.map(c => (
            <TouchableOpacity key={c} style={[s.catBtn, recCat === c && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setRecCat(c)}>
              <Text style={[s.catBtnText, recCat === c && { color: '#fff' }]}>{ICONES_CAT[c]} {c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={[s.btn, { backgroundColor: C.primary, opacity: salvandoRec ? 0.6 : 1 }]} onPress={adicionarRecorrente} disabled={salvandoRec}>
          <Text style={[s.btnText, { color: '#fff' }]}>{salvandoRec ? 'Salvando...' : `+ Adicionar ${recEhParcelado ? `(${recParcelas || '?'}x)` : 'recorrente'}`}</Text>
        </TouchableOpacity>
      </View>

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
  section: { backgroundColor: C.bgCard, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sectionTitulo: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 14 },
  metaItem: { backgroundColor: C.bg, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: C.borderLight },
  metaLabel: { fontSize: 14, fontWeight: '600', color: C.text },
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
  txItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, marginHorizontal: 16, marginBottom: 6, borderRadius: 12, padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  txIcone: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 14, fontWeight: '500', color: C.text },
  txMeta: { fontSize: 12, color: C.label, marginTop: 2 },
  txValor: { fontSize: 14, fontWeight: '600' },
  borderLight: { borderColor: C.borderLight },
});
