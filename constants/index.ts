export const CATEGORIAS = ['Alimentação','Transporte','Moradia','Saúde','Lazer','Educação','Salário','Outros'];

export const CORES_CAT: Record<string,string> = {
  Alimentação:'#10B981', Transporte:'#0EA5E9', Moradia:'#F59E0B',
  Saúde:'#EC4899', Lazer:'#8B5CF6', Educação:'#14B8A6', Salário:'#10B981', Outros:'#64748B',
};

export const ICONES_CAT: Record<string,string> = {
  Alimentação:'🍽', Transporte:'🚗', Moradia:'🏠', Saúde:'💊',
  Lazer:'🎮', Educação:'📚', Salário:'💼', Outros:'📌',
};

export const CONTA_TIPOS: { key: string; label: string; icone: string }[] = [
  { key: 'corrente',     label: 'Conta Corrente', icone: '🏦' },
  { key: 'poupanca',     label: 'Poupança',        icone: '🐷' },
  { key: 'carteira',     label: 'Carteira',        icone: '👛' },
  { key: 'investimento', label: 'Investimento',    icone: '📈' },
];

export const CONTA_CORES = ['#0EA5E9','#10B981','#F59E0B','#8B5CF6','#F43F5E','#64748B','#EC4899','#14B8A6'];

export const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

export const C = {
  bg: '#F8FAFC', bgCard: '#FFFFFF', bgAccent: '#F1F5F9',
  primary: '#1E293B', primaryDark: '#0F172A', primaryDeep: '#0F172A',
  border: '#E2E8F0', borderLight: '#F1F5F9',
  receita: '#10B981', receitaBg: '#ECFDF5',
  despesa: '#F43F5E', despesaBg: '#FFF1F2',
  metaBg: '#F1F5F9', metaBorder: '#94A3B8', metaText: '#1E293B',
  text: '#0F172A', label: '#64748B', textLight: '#94A3B8',
};
