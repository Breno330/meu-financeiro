import type { TransacaoOFX } from '../types';

export function adivinharCategoria(desc: string): string {
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

export function parseOFX(conteudo: string): TransacaoOFX[] {
  let blocos: string[] = [];
  const xmlBlocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi);
  if (xmlBlocos && xmlBlocos.length > 0) {
    blocos = xmlBlocos;
  } else {
    const partes = conteudo.split(/<STMTTRN>/i);
    blocos = partes.slice(1).map(p => '<STMTTRN>' + p.split(/<\/BANKTRANLIST>|<STMTTRN>/i)[0]);
  }
  return blocos.map((bloco, i) => {
    const get = (tag: string) => {
      const m = bloco.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const valor = parseFloat(get('TRNAMT').replace(',', '.')) || 0;
    const desc = get('MEMO') || get('NAME') || 'Transação';
    const raw = get('DTPOSTED').substring(0, 8);
    const data = raw.length === 8
      ? `${raw.substring(6,8)}/${raw.substring(4,6)}/${raw.substring(0,4)}`
      : new Date().toLocaleDateString('pt-BR');
    return {
      id: `ofx_${i}_${Date.now()}`,
      descricao: desc,
      valor: Math.abs(valor),
      tipo: valor >= 0 ? 'receita' : 'despesa',
      categoria: adivinharCategoria(desc),
      data,
      selecionada: true,
    } as TransacaoOFX;
  }).filter(t => t.valor > 0);
}
