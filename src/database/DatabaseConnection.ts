import Dexie, { type Table } from 'dexie';

// --- INTERFACES DOS DADOS (TypeScript Types) ---
export interface UsuarioSistema {
  email: string;
  nome: string;
  pin_acesso: string;
  nivel_acesso: 'SUPER_ADMIN' | 'ADMIN_OPERACIONAL' | 'OPERADOR_CAIXA';
  ativo: number; // 1 para ativo, 0 para inativo
}

export interface Produto {
  id: string;
  nome: string;
  categoria: 'DOCES' | 'BEBIDAS' | 'JOGOS' | 'COMIDAS'; // Incluindo COMIDAS para compatibilidade com o cardápio
  preco: number;
  cor_ficha: string;
  ativo: number;
  imagem?: string;
}

export interface Venda {
  id: string; // UUID v4
  device_id: string;
  valor_total: number;
  metodo_pagamento: 'DINHEIRO' | 'PIX_LOCAL' | 'CORTESIA' | 'CARTAO';
  codigo_pix_utilizado?: string;
  valor_pago?: number;
  troco?: number;
  criado_em: string;
  status_sync: 'pending' | 'synced';
}

export interface ItemVenda {
  id: string; // UUID v4
  venda_id: string; // Chave estrangeira ligando à Venda
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
}

export interface Mensagem {
  id: string; // UUID v4
  tipo: 'GERAL' | 'INDIVIDUAL';
  destinatarioEmail?: string; // Preenchido apenas se for individual
  remetente: string;
  conteudo: string;
  lida: boolean;
  timestamp: number;
}

export interface SangriaInfo {
  valor: number;
  justificativa: string;
  timestamp: number;
}

export interface SuprimentoInfo {
  valor: number;
  justificativa: string;
  timestamp: number;
}

export interface SessaoCaixa {
  id: string; // UUID v4
  operadorEmail: string;
  status: 'aberto' | 'fechado';
  valorAbertura: number;
  valorFechamento?: number;
  timestampAbertura: number;
  timestampFechamento?: number;
  observacoes?: string;
  vendasDinheiro?: number;
  vendasPix?: number;
  vendasCartao?: number;
  sangrias?: SangriaInfo[];
  suprimentos?: SuprimentoInfo[];
  valorContado?: number;
  diferenca?: number;
}

// --- CLASSE PRINCIPAL DO BANCO DE DADOS ---
class ArraiaDatabase extends Dexie {
  // Declarando as tabelas e seus tipos
  usuarios_sistema!: Table<UsuarioSistema, string>;
  produtos!: Table<Produto, string>;
  vendas!: Table<Venda, string>;
  itens_venda!: Table<ItemVenda, string>;
  sessoes_caixa!: Table<SessaoCaixa, string>;
  mensagens!: Table<Mensagem, string>;

  constructor() {
    super('ArraiaDigitalDB');
    
    // Definindo o Schema V1
    this.version(1).stores({
      usuarios_sistema: 'email, pin_acesso',
      produtos: 'id, categoria',
      vendas: 'id, status_sync, criado_em',
      itens_venda: 'id, venda_id, produto_id'
    });

    // Definindo o Schema V2 (Adicionando controle de caixa)
    this.version(2).stores({
      usuarios_sistema: 'email, pin_acesso',
      produtos: 'id, categoria',
      vendas: 'id, status_sync, criado_em',
      itens_venda: 'id, venda_id, produto_id',
      sessoes_caixa: 'id, status, timestampAbertura, operadorEmail'
    });

    // Definindo o Schema V3 (Sistema de Comunicação Interna)
    this.version(3).stores({
      usuarios_sistema: 'email, pin_acesso',
      produtos: 'id, categoria',
      vendas: 'id, status_sync, criado_em',
      itens_venda: 'id, venda_id, produto_id',
      sessoes_caixa: 'id, status, timestampAbertura, operadorEmail',
      mensagens: 'id, tipo, destinatarioEmail, lida, timestamp'
    });
  }
}

// Exporta uma única instância do banco de dados para todo o aplicativo usar (Singleton)
export const db = new ArraiaDatabase();
