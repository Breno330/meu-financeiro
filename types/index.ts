export type Tipo = 'receita' | 'despesa';
export type Aba = 'lancamentos' | 'resumo' | 'metas' | 'importar';
export type ContaTipo = 'corrente' | 'poupanca' | 'carteira' | 'investimento' | 'cartao';

export type Conta = {
  id: string;
  nome: string;
  tipo: ContaTipo;
  saldo_inicial: number;
  cor: string;
  ativo: boolean;
  limite?: number | null;
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
};

export type Transacao = {
  id: string;
  descricao: string;
  valor: number;
  tipo: Tipo;
  categoria: string;
  data: string;
  conta_id?: string | null;
  criado_em?: string;
  parcela_atual?: number | null;
  parcelas_total?: number | null;
};

export type Meta = {
  id: string;
  tipo: 'saldo' | 'categoria';
  categoria?: string;
  valor: number;
  mes: number;
  ano: number;
};

export type Categoria = {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  ativo: boolean;
};

export type Recorrente = {
  id: string;
  descricao: string;
  valor: number;
  tipo: Tipo;
  categoria: string;
  ativo: boolean;
  parcelas_total?: number | null;
  parcelas_restantes?: number | null;
};

export type TransacaoOFX = {
  id: string;
  descricao: string;
  valor: number;
  tipo: Tipo;
  categoria: string;
  data: string;
  selecionada: boolean;
};
