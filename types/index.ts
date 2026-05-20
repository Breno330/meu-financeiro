export type Tipo = 'receita' | 'despesa';
export type Aba = 'lancamentos' | 'resumo' | 'metas' | 'importar';

export type Transacao = {
  id: string;
  descricao: string;
  valor: number;
  tipo: Tipo;
  categoria: string;
  data: string;
  criado_em?: string;
};

export type Meta = {
  id: string;
  tipo: 'saldo' | 'categoria';
  categoria?: string;
  valor: number;
  mes: number;
  ano: number;
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
