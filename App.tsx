import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Modal,
} from 'react-native';
import { supabase } from './supabase';

type Tipo = 'receita' | 'despesa';
type Aba = 'lancamentos' | 'resumo' | 'metas' | 'importar';
type Transacao = { id: string; descricao: string; valor: number; tipo: Tipo; categoria: string; data: string; criado_em?: string; };
type Meta = { id: string; tipo: 'saldo' | 'categoria'; categoria?: string; valor: number; mes: number; ano: number; };
type Recorrente = { id: string; descricao: string; valor: number; tipo: Tipo; categoria: string; ativo: boolean; };
type TransacaoOFX = { id: string; descricao: string; valor: number; tipo: Tipo; categoria: string; data: string; selecionada: boolean; };

const CATEGORIAS = ['Alimentação','Transporte','Moradia','Saúde','Lazer','Educação','Salário','Outros'];
const CORES_CAT: Record<string,string> = {
  Alimentação:'#1D9E75', Transporte:'#378ADD', Moradia:'#BA7517',
  Saúde:'#D4537E', Lazer:'#7F77DD', Educação:'#639922', Salário:'#1D9E75', Outros:'#888780',
};
const ICONES_CAT: Record<string,string> = {
  Alimentação:'🍽', Transporte:'🚗', Moradia:'🏠', Saúde:'💊',
  Lazer:'🎮', Educação:'📚', Salário:'💼', Outros:'📌',
};
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const C = {
  bg: '#F0F5FC', bgCard: '#FFFFFF', bgAccent: '#E6F1FB',
  primary: '#378ADD', primaryDark: '#185FA5', primaryDeep: '#0C447C',
  border: '#B5D4F4', borderLight: '#D6E8F8',
  receita: '#1D9E75', receitaBg: '#E1F5EE',
  despesa: '#E24B4A', despesaBg: '#FCEBEB',
  metaBg: '#EEEDFE', metaBorder: '#7F77DD', metaText: '#3C3489',
  text: '#1a1a18', label: '#185FA5', textLight: '#5890bb',
};

function fmt(v: number) { return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
function mesAno(m: number, a: number) { return MESES[m] + ' ' + a; }

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
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  return blocos.map((bloco, i) => {
    const get = (tag: string) => { const m = bloco.match(new RegExp(`<${tag}>(.*?)[\\n<]`, 'i')); return m ? m[1].trim() : ''; };
    const valor = parseFloat(get('TRNAMT').replace(',', '.')) || 0;
    const desc = get('MEMO') || get('NAME') || 'Transação';
    const raw = get('DTPOSTED').substring(0, 8);
    const data = raw.length === 8 ? `${raw.substring(6,8)}/${raw.substring(4,6)}/${raw.substring(0,4)}` : new Date().toLocaleDateString('pt-BR');
    return { id: `ofx_${i}_${Date.now()}`, descricao: desc, valor: Math.abs(valor), tipo: valor >= 0 ? 'receita' : 'despesa', categoria: adivinharCategoria(desc), data, selecionada: true };
  });
}

export default function App() {
  const hoje = new Date();
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
  const [showRecModal, setShowRecModal] = useState(false);
  const [recConfirmadas, setRecConfirmadas] = useState<Set<string>>(new Set());
  const [metaTipo, setMetaTipo] = useState<'saldo' | 'categoria'>('saldo');
  const [metaCat, setMetaCat] = useState('Alimentação');
  const [metaVal, setMetaVal] = useState('');
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [recDesc, setRecDesc] = useState('');
  const [recVal, setRecVal] = useState('');
  const [recTipo, setRecTipo] = useState<Tipo>('despesa');
  const [recCat, setRecCat] = useState('Alimentação');
  const [salvandoRec, setSalvandoRec] = useState(false);
  const [txOFX, setTxOFX] = useState<TransacaoOFX[]>([]);
  const [arquivoNome, setArquivoNome] = useState('');
  const [salvandoOFX, setSalvandoOFX] = useState(false);

  useEffect(() => { carregarTudo(); }, []);

  async function carregarTudo() {
    setCarregando(true);
    const [r1, r2, r3] = await Promise.all([
      supabase.from('transacoes').select('*').order('criado_em', { ascending: false }),
      supabase.from('metas').select('*'),
      supabase.from('recorrentes').select('*').eq('ativo', true),
    ]);
    if (r1.data) setTransacoes(r1.data);
    if (r2.data) setMetas(r2.data);
    if (r3.data) {
      setRecorrentes(r3.data);
      if (r3.data.length > 0) {
        const chave = `rec_${hoje.getMonth()}_${hoje.getFullYear()}`;
        if (!localStorage.getItem(chave)) setShowRecModal(true);
      }
    }
    setCarregando(false);
  }

  async function confirmarRecorrentes() {
    const sel = recorrentes.filter(r => recConfirmadas.has(r.id));
    if (sel.length > 0) {
      const ins = sel.map(r => ({ descricao: r.descricao, valor: r.valor, tipo: r.tipo, categoria: r.categoria, data: `01/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}` }));
      const { data } = await supabase.from('transacoes').insert(ins).select();
      if (data) setTransacoes(prev => [...data, ...prev]);
    }
    localStorage.setItem(`rec_${hoje.getMonth()}_${hoje.getFullYear()}`, '1');
    setShowRecModal(false);
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
    const { data } = await supabase.from('transacoes').insert({ descricao: desc, valor: v, tipo, categoria: cat, data: hoje.toLocaleDateString('pt-BR') }).select();
    if (data) { const novas = [data[0], ...transacoes]; setTransacoes(novas); setDesc(''); setVal(''); calcularAlertas(novas, metas); }
    setSalvando(false);
  }

  async function remover(id: string) {
    await supabase.from('transacoes').delete().eq('id', id);
    const novas = transacoes.filter(t => t.id !== id); setTransacoes(novas); calcularAlertas(novas, metas);
  }

  async function adicionarMeta() {
    const v = parseFloat(metaVal.replace(/\./g,'').replace(',','.'));
    if (isNaN(v) || v <= 0) return;
    setSalvandoMeta(true);
    const { data } = await supabase.from('metas').insert({ tipo: metaTipo, categoria: metaTipo === 'categoria' ? metaCat : null, valor: v, mes: hoje.getMonth(), ano: hoje.getFullYear() }).select();
    if (data) { const novas = [...metas, data[0]]; setMetas(novas); setMetaVal(''); calcularAlertas(transacoes, novas); }
    setSalvandoMeta(false);
  }

  async function removerMeta(id: string) {
    await supabase.from('metas').delete().eq('id', id);
    const novas = metas.filter(m => m.id !== id); setMetas(novas); calcularAlertas(transacoes, novas);
  }

  async function adicionarRecorrente() {
    const v = parseFloat(recVal.replace(/\./g,'').replace(',','.'));
    if (!recDesc || isNaN(v) || v <= 0) return;
    setSalvandoRec(true);
    const { data } = await supabase.from('recorrentes').insert({ descricao: recDesc, valor: v, tipo: recTipo, categoria: recCat, ativo: true }).select();
    if (data) { setRecorrentes([...recorrentes, data[0]]); setRecDesc(''); setRecVal(''); }
    setSalvandoRec(false);
  }

  async function removerRecorrente(id: string) {
    await supabase.from('recorrentes').update({ ativo: false }).eq('id', id);
    setRecorrentes(recorrentes.filter(r => r.id !== id));
  }

  async function salvarOFX() {
    const sel = txOFX.filter(t => t.selecionada);
    if (!sel.length) return;
    setSalvandoOFX(true);
    const { data } = await supabase.from('transacoes').insert(sel.map(({ id, selecionada, ...r }) => r)).select();
    if (data) { const novas = [...data, ...transacoes]; setTransacoes(novas); setTxOFX([]); setArquivoNome(''); setAba('lancamentos'); calcularAlertas(novas, metas); }
    setSalvandoOFX(false);
  }

  function selecionarOFX() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.ofx,.OFX';
    input.onchange = async (e: any) => { const f = e.target.files[0]; if (!f) return; setArquivoNome(f.name); setTxOFX(parseOFX(await f.text())); };
    input.click();
  }

  function txDoMes(m: number, a: number) { return transacoes.filter(t => { const p = t.data?.split('/'); return p && parseInt(p[1])-1 === m && parseInt(p[2]) === a; }); }
  const txMes = txDoMes(mesSel, anoSel);
  const receitasMes = txMes.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
  const despesasMes = txMes.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
  const saldoMes = receitasMes - despesasMes;
  const catMap: Record<string,number> = {};
  txMes.filter(t => t.tipo === 'despesa').forEach(t => { catMap[t.categoria] = (catMap[t.categoria]||0)+Number(t.valor); });
  const cats = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
  const maxCat = cats.length > 0 ? cats[0][1] : 1;
  const txAtual = txDoMes(hoje.getMonth(), hoje.getFullYear());
  const recAtual = txAtual.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
  const despAtual = txAtual.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
  const saldoAtual = recAtual - despAtual;
  const metasMes = metas.filter(m => m.mes === hoje.getMonth() && m.ano === hoje.getFullYear());
  const totalRec = transacoes.filter(t => t.tipo === 'receita').reduce((s,t) => s+Number(t.valor), 0);
  const totalDesp = transacoes.filter(t => t.tipo === 'despesa').reduce((s,t) => s+Number(t.valor), 0);
  const saldoGeral = totalRec - totalDesp;
  const visiveis = transacoes.filter(t => filtro === 'todas' || t.tipo === filtro);
  const selOFX = txOFX.filter(t => t.selecionada).length;

  function getProgMeta(m: Meta) {
    if (m.tipo === 'saldo') return { atual: saldoAtual, max: m.valor, pct: Math.min(Math.max(saldoAtual/m.valor*100,0),100), ok: saldoAtual >= m.valor };
    const g = txAtual.filter(t => t.tipo === 'despesa' && t.categoria === m.categoria).reduce((s,t) => s+Number(t.valor), 0);
    return { atual: g, max: m.valor, pct: Math.min(g/m.valor*100,100), ok: g <= m.valor };
  }

  return (
    <SafeAreaView style={s.safe}>
      <Modal visible={showRecModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitulo}>🔄 Recorrentes de {MESES[hoje.getMonth()]}</Text>
            <Text style={s.modalSub}>Selecione quais lançar este mês:</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {recorrentes.map(r => (
                <TouchableOpacity key={r.id} style={[s.recItem, recConfirmadas.has(r.id) && { backgroundColor: C.bgAccent }]}
                  onPress={() => setRecConfirmadas(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}>
                  <View style={[s.checkbox, recConfirmadas.has(r.id) && { backgroundColor: C.primary, borderColor: C.primary }]}>
                    {recConfirmadas.has(r.id) && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}><Text style={s.txDesc}>{r.descricao}</Text><Text style={s.txMeta}>{r.categoria}</Text></View>
                  <Text style={[s.txValor, { color: r.tipo === 'receita' ? C.receita : C.despesa }]}>{fmt(r.valor)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.bgAccent }]} onPress={() => { localStorage.setItem(`rec_${hoje.getMonth()}_${hoje.getFullYear()}`, '1'); setShowRecModal(false); }}>
                <Text style={[s.btnText, { color: C.primaryDark }]}>Pular</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 2, backgroundColor: C.primary }]} onPress={confirmarRecorrentes}>
                <Text style={[s.btnText, { color: '#fff' }]}>Lançar {recConfirmadas.size}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {alertas.length > 0 && (
        <TouchableOpacity style={s.alertaBanner} onPress={() => setShowAlertas(!showAlertas)}>
          <Text style={s.alertaBannerText}>🚨 {alertas.length} alerta{alertas.length > 1 ? 's' : ''} — toque para ver</Text>
        </TouchableOpacity>
      )}
      {showAlertas && alertas.map((a, i) => <Text key={i} style={s.alertaItem}>{a}</Text>)}

      <View style={s.abas}>
        {(['lancamentos','resumo','metas','importar'] as Aba[]).map(a => (
          <TouchableOpacity key={a} style={[s.aba, aba === a && s.abaAtiva]} onPress={() => setAba(a)}>
            <Text style={[s.abaText, aba === a && s.abaTextAtiva]}>
              {a === 'lancamentos' ? '📋' : a === 'resumo' ? '📊' : a === 'metas' ? '🎯' : '📥'}
              {' '}{a === 'lancamentos' ? 'Início' : a === 'resumo' ? 'Resumo' : a === 'metas' ? `Metas${alertas.length > 0 ? ' 🔴' : ''}` : 'OFX'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {aba === 'lancamentos' && (
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.pageHeader}>
            <View><Text style={s.greeting}>Bom dia,</Text><Text style={s.pageTitle}>Minhas Finanças</Text></View>
            <View style={s.avatar}><Text style={s.avatarText}>B</Text></View>
          </View>
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>Saldo total</Text>
            <Text style={s.heroVal}>{fmt(saldoGeral)}</Text>
            <View style={s.heroRow}>
              <View><Text style={s.heroSubLabel}>Receitas</Text><Text style={s.heroSubVal}>{fmt(totalRec)}</Text></View>
              <View style={s.heroDivider}/>
              <View><Text style={s.heroSubLabel}>Despesas</Text><Text style={s.heroSubVal}>{fmt(totalDesp)}</Text></View>
            </View>
          </View>
          <View style={s.form}>
            <Text style={s.formTitulo}>Novo lançamento</Text>
            <TextInput style={s.input} placeholder="Descrição" placeholderTextColor={C.textLight} value={desc} onChangeText={setDesc}/>
            <TextInput style={s.input} placeholder="Valor (ex: 2450,00)" placeholderTextColor={C.textLight} value={val} onChangeText={setVal} keyboardType="decimal-pad"/>
            <View style={s.row}>
              <TouchableOpacity style={[s.tipoBtn, tipo === 'receita' && { backgroundColor: C.receita, borderColor: C.receita }]} onPress={() => setTipo('receita')}>
                <Text style={[s.tipoBtnText, tipo === 'receita' && { color: '#fff' }]}>Receita</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.tipoBtn, tipo === 'despesa' && { backgroundColor: C.despesa, borderColor: C.despesa }]} onPress={() => setTipo('despesa')}>
                <Text style={[s.tipoBtnText, tipo === 'despesa' && { color: '#fff' }]}>Despesa</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
              {CATEGORIAS.map(c => (
                <TouchableOpacity key={c} style={[s.catBtn, cat === c && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setCat(c)}>
                  <Text style={[s.catBtnText, cat === c && { color: '#fff' }]}>{ICONES_CAT[c]} {c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[s.btn, { backgroundColor: C.primary, opacity: salvando ? 0.6 : 1 }]} onPress={adicionar} disabled={salvando}>
              <Text style={[s.btnText, { color: '#fff' }]}>{salvando ? 'Salvando...' : '+ Adicionar'}</Text>
            </TouchableOpacity>
          </View>
          <View style={s.filtros}>
            {(['todas','receita','despesa'] as const).map(f => (
              <TouchableOpacity key={f} style={[s.filtroBtn, filtro === f && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setFiltro(f)}>
                <Text style={[s.filtroBtnText, filtro === f && { color: '#fff' }]}>{f === 'todas' ? 'Todos' : f === 'receita' ? 'Receitas' : 'Despesas'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {carregando ? <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }}/> :
            visiveis.length === 0 ? <Text style={s.vazio}>Nenhum lançamento ainda.{'\n'}Adicione o primeiro acima! 👆</Text> :
            visiveis.map(t => (
              <View key={t.id} style={s.txItem}>
                <View style={[s.txIcone, { backgroundColor: t.tipo === 'receita' ? C.receitaBg : C.despesaBg }]}>
                  <Text style={{ fontSize: 16 }}>{ICONES_CAT[t.categoria]}</Text>
                </View>
                <View style={s.txInfo}><Text style={s.txDesc}>{t.descricao}</Text><Text style={s.txMeta}>{t.categoria} · {t.data}</Text></View>
                <Text style={[s.txValor, { color: t.tipo === 'receita' ? C.receita : C.despesa }]}>{t.tipo === 'receita' ? '+' : '-'} {fmt(t.valor)}</Text>
                <TouchableOpacity onPress={() => remover(t.id)} style={{ padding: 4 }}><Text style={{ color: '#aaa', fontSize: 14 }}>✕</Text></TouchableOpacity>
              </View>
            ))
          }
          <View style={{ height: 40 }}/>
        </ScrollView>
      )}

      {aba === 'resumo' && (
        <ScrollView style={s.scroll}>
          <View style={s.mesNav}>
            <TouchableOpacity onPress={() => mesSel === 0 ? (setMesSel(11), setAnoSel(anoSel-1)) : setMesSel(mesSel-1)} style={s.mesBtn}><Text style={s.mesBtnText}>‹</Text></TouchableOpacity>
            <Text style={s.mesTitulo}>{mesAno(mesSel, anoSel)}</Text>
            <TouchableOpacity onPress={() => mesSel === 11 ? (setMesSel(0), setAnoSel(anoSel+1)) : setMesSel(mesSel+1)} style={s.mesBtn}><Text style={s.mesBtnText}>›</Text></TouchableOpacity>
          </View>
          <View style={s.ringRow}>
            <View style={s.ringItem}>
              <View style={[s.ring, { backgroundColor: C.receitaBg, borderColor: C.receita }]}><Text style={{ fontSize: 16 }}>↑</Text></View>
              <Text style={s.ringLabel}>Receitas</Text>
              <Text style={[s.ringVal, { color: C.receita }]}>{fmt(receitasMes)}</Text>
            </View>
            <View style={s.ringItem}>
              <View style={[s.ring, { backgroundColor: C.despesaBg, borderColor: C.despesa }]}><Text style={{ fontSize: 16 }}>↓</Text></View>
              <Text style={s.ringLabel}>Despesas</Text>
              <Text style={[s.ringVal, { color: C.despesa }]}>{fmt(despesasMes)}</Text>
            </View>
            <View style={s.ringItem}>
              <View style={[s.ring, { backgroundColor: C.bgAccent, borderColor: C.primary }]}><Text style={{ fontSize: 16 }}>💰</Text></View>
              <Text style={s.ringLabel}>Saldo</Text>
              <Text style={[s.ringVal, { color: saldoMes >= 0 ? C.primary : C.despesa }]}>{fmt(saldoMes)}</Text>
            </View>
          </View>
          {(receitasMes > 0 || despesasMes > 0) && (
            <View style={s.section}>
              <Text style={s.sectionTitulo}>Receitas vs Despesas</Text>
              <View style={s.barComp}>
                {receitasMes > 0 && <View style={[s.barSeg, { flex: receitasMes, backgroundColor: C.receita }]}/>}
                {despesasMes > 0 && <View style={[s.barSeg, { flex: despesasMes, backgroundColor: C.despesa }]}/>}
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.receita }}/><Text style={{ fontSize: 13, color: C.label }}>Receitas {receitasMes > 0 ? Math.round(receitasMes/(receitasMes+despesasMes)*100) : 0}%</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.despesa }}/><Text style={{ fontSize: 13, color: C.label }}>Despesas {despesasMes > 0 ? Math.round(despesasMes/(receitasMes+despesasMes)*100) : 0}%</Text></View>
              </View>
            </View>
          )}
          {cats.length > 0 ? (
            <View style={s.section}>
              <Text style={s.sectionTitulo}>Despesas por categoria</Text>
              {cats.map(([c, v]) => (
                <View key={c} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                  <Text style={{ fontSize: 16, width: 24 }}>{ICONES_CAT[c]}</Text>
                  <Text style={{ fontSize: 13, color: C.label, width: 90 }}>{c}</Text>
                  <View style={{ flex: 1, height: 8, backgroundColor: C.bgAccent, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ height: 8, borderRadius: 4, width: `${Math.round(v/maxCat*100)}%` as any, backgroundColor: C.primary }}/>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: C.text, width: 80, textAlign: 'right' }}>{fmt(v)}</Text>
                </View>
              ))}
            </View>
          ) : <Text style={s.vazio}>Nenhuma despesa em {mesAno(mesSel, anoSel)}.</Text>}
          {txMes.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitulo}>Lançamentos ({txMes.length})</Text>
              {txMes.map(t => (
                <View key={t.id} style={[s.txItem, { marginHorizontal: 0 }]}>
                  <View style={[s.txIcone, { backgroundColor: t.tipo === 'receita' ? C.receitaBg : C.despesaBg }]}><Text style={{ fontSize: 14 }}>{ICONES_CAT[t.categoria]}</Text></View>
                  <View style={s.txInfo}><Text style={s.txDesc}>{t.descricao}</Text><Text style={s.txMeta}>{t.categoria} · {t.data}</Text></View>
                  <Text style={[s.txValor, { color: t.tipo === 'receita' ? C.receita : C.despesa }]}>{t.tipo === 'receita' ? '+' : '-'} {fmt(t.valor)}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 40 }}/>
        </ScrollView>
      )}

      {aba === 'metas' && (
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.pageHeader}>
            <View><Text style={s.greeting}>Acompanhe seus</Text><Text style={s.pageTitle}>Metas & Alertas</Text></View>
            <View style={[s.avatar, { backgroundColor: C.metaBg }]}><Text style={[s.avatarText, { color: C.metaText }]}>🎯</Text></View>
          </View>
          {metasMes.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitulo}>Metas de {MESES[hoje.getMonth()]}</Text>
              {metasMes.map(m => {
                const p = getProgMeta(m);
                return (
                  <View key={m.id} style={s.metaItem}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={s.metaLabel}>{m.tipo === 'saldo' ? '💰 Meta de saldo' : `${ICONES_CAT[m.categoria||'']} Limite ${m.categoria}`}</Text>
                      <TouchableOpacity onPress={() => removerMeta(m.id)}><Text style={{ color: '#aaa', fontSize: 14 }}>✕</Text></TouchableOpacity>
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
            <Text style={s.formTitulo}>🔄 Despesas recorrentes</Text>
            {recorrentes.map(r => (
              <View key={r.id} style={[s.txItem, { marginHorizontal: 0, marginBottom: 6 }]}>
                <View style={[s.txIcone, { backgroundColor: r.tipo === 'receita' ? C.receitaBg : C.despesaBg }]}><Text style={{ fontSize: 14 }}>{ICONES_CAT[r.categoria]}</Text></View>
                <View style={s.txInfo}><Text style={s.txDesc}>{r.descricao}</Text><Text style={s.txMeta}>{r.categoria}</Text></View>
                <Text style={[s.txValor, { color: r.tipo === 'receita' ? C.receita : C.despesa }]}>{fmt(r.valor)}</Text>
                <TouchableOpacity onPress={() => removerRecorrente(r.id)} style={{ padding: 4 }}><Text style={{ color: '#aaa', fontSize: 14 }}>✕</Text></TouchableOpacity>
              </View>
            ))}
            <TextInput style={s.input} placeholder="Descrição (ex: Aluguel)" placeholderTextColor={C.textLight} value={recDesc} onChangeText={setRecDesc}/>
            <TextInput style={s.input} placeholder="Valor (ex: 1500,00)" placeholderTextColor={C.textLight} value={recVal} onChangeText={setRecVal} keyboardType="decimal-pad"/>
            <View style={s.row}>
              <TouchableOpacity style={[s.tipoBtn, recTipo === 'despesa' && { backgroundColor: C.despesa, borderColor: C.despesa }]} onPress={() => setRecTipo('despesa')}><Text style={[s.tipoBtnText, recTipo === 'despesa' && { color: '#fff' }]}>Despesa</Text></TouchableOpacity>
              <TouchableOpacity style={[s.tipoBtn, recTipo === 'receita' && { backgroundColor: C.receita, borderColor: C.receita }]} onPress={() => setRecTipo('receita')}><Text style={[s.tipoBtnText, recTipo === 'receita' && { color: '#fff' }]}>Receita</Text></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
              {CATEGORIAS.map(c => <TouchableOpacity key={c} style={[s.catBtn, recCat === c && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setRecCat(c)}><Text style={[s.catBtnText, recCat === c && { color: '#fff' }]}>{ICONES_CAT[c]} {c}</Text></TouchableOpacity>)}
            </ScrollView>
            <TouchableOpacity style={[s.btn, { backgroundColor: C.primary, opacity: salvandoRec ? 0.6 : 1 }]} onPress={adicionarRecorrente} disabled={salvandoRec}>
              <Text style={[s.btnText, { color: '#fff' }]}>{salvandoRec ? 'Salvando...' : '+ Adicionar recorrente'}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }}/>
        </ScrollView>
      )}

      {aba === 'importar' && (
        <ScrollView style={s.scroll}>
          <View style={s.pageHeader}>
            <View><Text style={s.greeting}>Importe seu extrato</Text><Text style={s.pageTitle}>Importar OFX</Text></View>
            <View style={[s.avatar, { backgroundColor: C.bgAccent }]}><Text style={[s.avatarText, { color: C.primaryDark }]}>📥</Text></View>
          </View>
          <View style={[s.infoBox]}>
            <Text style={s.infoTitulo}>📱 Como exportar do Nubank</Text>
            {['1. Abra o app do Nubank','2. Vá em Extrato','3. Toque nos três pontinhos (···)','4. Selecione "Exportar extrato"','5. Escolha o formato OFX','6. Salve e importe aqui'].map((l,i) => <Text key={i} style={s.infoTexto}>{l}</Text>)}
          </View>
          {txOFX.length === 0 && (
            <TouchableOpacity style={[s.btn, { backgroundColor: C.primary, margin: 16, padding: 18, flexDirection: 'row', justifyContent: 'center', gap: 10 }]} onPress={selecionarOFX}>
              <Text style={{ fontSize: 20 }}>📂</Text>
              <Text style={[s.btnText, { color: '#fff', fontSize: 15 }]}>Selecionar arquivo .OFX</Text>
            </TouchableOpacity>
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
          <View style={{ height: 60 }}/>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F5FC' },
  scroll: { flex: 1 },
  abas: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#B5D4F4' },
  aba: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  abaAtiva: { borderBottomWidth: 2, borderBottomColor: '#378ADD' },
  abaText: { fontSize: 11, color: '#5890bb' },
  abaTextAtiva: { color: '#185FA5', fontWeight: '600' },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
  greeting: { fontSize: 13, color: '#185FA5' },
  pageTitle: { fontSize: 22, fontWeight: '600', color: '#1a1a18' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#378ADD', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  heroCard: { backgroundColor: '#378ADD', marginHorizontal: 16, borderRadius: 16, padding: 20, marginBottom: 16 },
  heroLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 6 },
  heroVal: { fontSize: 34, fontWeight: '600', color: '#fff', letterSpacing: -1, marginBottom: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  heroSubVal: { fontSize: 15, fontWeight: '500', color: '#fff' },
  heroDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 20 },
  form: { backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 0.5, borderColor: '#D6E8F8' },
  formTitulo: { fontSize: 15, fontWeight: '600', marginBottom: 12, color: '#1a1a18' },
  input: { borderWidth: 0.5, borderColor: '#B5D4F4', borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 8, color: '#1a1a18', backgroundColor: '#F7FAFD' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tipoBtn: { flex: 1, borderWidth: 1, borderColor: '#B5D4F4', borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: '#F7FAFD' },
  tipoBtnText: { fontSize: 13, fontWeight: '500', color: '#185FA5' },
  catScroll: { marginBottom: 12 },
  catBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 0.5, borderColor: '#B5D4F4', marginRight: 6, backgroundColor: '#F0F5FC' },
  catBtnText: { fontSize: 12, color: '#185FA5' },
  btn: { borderRadius: 10, padding: 12, alignItems: 'center' },
  btnText: { fontSize: 14, fontWeight: '600' },
  filtros: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
  filtroBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, borderWidth: 0.5, borderColor: '#B5D4F4', backgroundColor: '#fff' },
  filtroBtnText: { fontSize: 13, color: '#185FA5' },
  txItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 6, borderRadius: 12, padding: 12, gap: 10, borderWidth: 0.5, borderColor: '#D6E8F8' },
  txIcone: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 14, fontWeight: '500', color: '#1a1a18' },
  txMeta: { fontSize: 12, color: '#185FA5', marginTop: 2 },
  txValor: { fontSize: 14, fontWeight: '600' },
  vazio: { textAlign: 'center', color: '#5890bb', fontSize: 14, marginTop: 40, lineHeight: 24, paddingHorizontal: 20 },
  mesNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  mesBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#B5D4F4' },
  mesBtnText: { fontSize: 22, color: '#378ADD', lineHeight: 26 },
  mesTitulo: { fontSize: 18, fontWeight: '600', color: '#1a1a18', textTransform: 'capitalize' },
  ringRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingHorizontal: 16, marginBottom: 16 },
  ringItem: { alignItems: 'center' },
  ring: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, marginBottom: 6 },
  ringLabel: { fontSize: 11, color: '#185FA5', marginBottom: 2 },
  ringVal: { fontSize: 13, fontWeight: '600' },
  section: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: '#D6E8F8' },
  sectionTitulo: { fontSize: 15, fontWeight: '600', color: '#1a1a18', marginBottom: 14 },
  barComp: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 4 },
  barSeg: { height: 14 },
  metaItem: { backgroundColor: '#F7FAFD', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: '#D6E8F8' },
  metaLabel: { fontSize: 14, fontWeight: '600', color: '#1a1a18' },
  alertaBanner: { backgroundColor: '#E24B4A', padding: 10, alignItems: 'center' },
  alertaBannerText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  alertaItem: { fontSize: 13, color: '#A32D2D', lineHeight: 22, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#FCEBEB' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderTopWidth: 0.5, borderTopColor: '#B5D4F4' },
  modalTitulo: { fontSize: 18, fontWeight: '600', color: '#1a1a18', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#185FA5', marginBottom: 12 },
  recItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#D6E8F8', borderRadius: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#B5D4F4', alignItems: 'center', justifyContent: 'center' },
  infoBox: { margin: 16, borderRadius: 12, padding: 16, marginBottom: 8, backgroundColor: '#E6F1FB', borderWidth: 0.5, borderColor: '#B5D4F4' },
  infoTitulo: { fontSize: 14, fontWeight: '600', marginBottom: 10, color: '#0C447C' },
  infoTexto: { fontSize: 13, lineHeight: 22, color: '#185FA5' },
});
