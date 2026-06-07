import { db } from '../database/DatabaseConnection';
import type { Venda, ItemVenda, SessaoCaixa, SangriaInfo, SuprimentoInfo } from '../database/DatabaseConnection';
import { VendaRepository } from './VendaRepository';

const vendaRepo = new VendaRepository();

export type LocalCaixaSession = SessaoCaixa;
export type { SangriaInfo, SuprimentoInfo };

const ACTIVE_CAIXA_KEY = 'arraia_active_caixa_session';
const PAST_CAIXA_SESSIONS_KEY = 'arraia_past_caixa_sessions';

// Helper para gerar UUIDv4 para as sessões migradas e novas
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const saleRepository = {
  // --- Operações de Venda ---
  async createSale(
    valorTotal: number,
    metodoPagamento: 'DINHEIRO' | 'PIX_LOCAL' | 'CORTESIA' | 'CARTAO',
    itens: { produtoId: string; quantidade: number; precoUnitario: number }[],
    _operadorEmail: string, // Guardado para compatibilidade, o operador é identificado na sessão
    codigoPixUtilizado?: string,
    valorPago?: number,
    troco?: number
  ): Promise<string> {
    return vendaRepo.salvarVendaLocal({
      device_id: _operadorEmail || 'device-local-tablet',
      valor_total: valorTotal,
      metodo_pagamento: metodoPagamento,
      codigo_pix_utilizado: codigoPixUtilizado,
      valor_pago: valorPago,
      troco: troco,
      itens: itens.map(i => ({
        produto_id: i.produtoId,
        quantidade: i.quantidade,
        preco_unitario: i.precoUnitario
      }))
    });
  },

  async getVendaById(id: string): Promise<Venda | undefined> {
    return db.vendas.get(id);
  },

  async getAllSales(): Promise<Venda[]> {
    return db.vendas.toArray();
  },

  async getSaleItems(vendaId: string): Promise<ItemVenda[]> {
    return db.itens_venda.where('venda_id').equals(vendaId).toArray();
  },

  async getPendingSyncSales(): Promise<Venda[]> {
    return db.vendas.where('status_sync').equals('pending').toArray();
  },

  async markAsSynced(id: string): Promise<void> {
    const venda = await this.getVendaById(id);
    if (venda) {
      venda.status_sync = 'synced';
      await db.vendas.put(venda);
    }
  },

  // --- Operações de Caixa (Gerenciadas localmente em LocalStorage para manter compatibilidade com o schema do Dexie) ---
  async getActiveCaixaSession(): Promise<LocalCaixaSession | undefined> {
    const sessionStr = localStorage.getItem(ACTIVE_CAIXA_KEY);
    if (!sessionStr) return undefined;
    try {
      return JSON.parse(sessionStr) as LocalCaixaSession;
    } catch {
      localStorage.removeItem(ACTIVE_CAIXA_KEY);
      return undefined;
    }
  },

  async openCaixa(operadorEmail: string, valorAbertura: number): Promise<void> {
    const active = await this.getActiveCaixaSession();
    if (active) {
      throw new Error('Já existe um caixa aberto no dispositivo, sô!');
    }

    const session: LocalCaixaSession = {
      id: generateUUID(),
      operadorEmail,
      status: 'aberto',
      valorAbertura,
      timestampAbertura: Date.now(),
    };

    localStorage.setItem(ACTIVE_CAIXA_KEY, JSON.stringify(session));
  },

  async closeCaixa(
    valorFechamento: number,
    observacoes?: string,
    vendasDinheiro?: number,
    vendasPix?: number,
    sangrias?: SangriaInfo[],
    valorContado?: number,
    diferenca?: number,
    suprimentos?: SuprimentoInfo[],
    vendasCartao?: number
  ): Promise<void> {
    const active = await this.getActiveCaixaSession();
    if (!active) {
      throw new Error('Não há caixa aberto para fechar!');
    }

    const closedSession: SessaoCaixa = {
      ...active,
      id: active.id || generateUUID(), // Salva a pátria se for uma sessão aberta em versões antigas
      status: 'fechado',
      valorFechamento,
      timestampFechamento: Date.now(),
      observacoes,
      vendasDinheiro,
      vendasPix,
      vendasCartao,
      sangrias: sangrias || active.sangrias,
      suprimentos: suprimentos || active.suprimentos,
      valorContado,
      diferenca
    };

    // Salva a sessão encerrada no Dexie para histórico infinito sem problemas de cota
    await db.sessoes_caixa.put(closedSession);

    // Limpa caixa ativo do cache leve
    localStorage.removeItem(ACTIVE_CAIXA_KEY);
  },

  async registrarSangria(valor: number, justificativa: string): Promise<LocalCaixaSession> {
    const active = await this.getActiveCaixaSession();
    if (!active) {
      throw new Error('Não há caixa aberto para registrar sangria, sô!');
    }

    const novaSangria: SangriaInfo = {
      valor,
      justificativa,
      timestamp: Date.now()
    };

    const sangriasAtualizadas = active.sangrias ? [...active.sangrias, novaSangria] : [novaSangria];
    const sessionAtualizada: LocalCaixaSession = {
      ...active,
      sangrias: sangriasAtualizadas
    };

    localStorage.setItem(ACTIVE_CAIXA_KEY, JSON.stringify(sessionAtualizada));
    return sessionAtualizada;
  },

  async registrarSuprimento(valor: number, justificativa: string): Promise<LocalCaixaSession> {
    const active = await this.getActiveCaixaSession();
    if (!active) {
      throw new Error('Não há caixa aberto para registrar suprimento, sô!');
    }

    const novoSuprimento: SuprimentoInfo = {
      valor,
      justificativa,
      timestamp: Date.now()
    };

    const suprimentosAtualizados = active.suprimentos ? [...active.suprimentos, novoSuprimento] : [novoSuprimento];
    const sessionAtualizada: LocalCaixaSession = {
      ...active,
      suprimentos: suprimentosAtualizados
    };

    localStorage.setItem(ACTIVE_CAIXA_KEY, JSON.stringify(sessionAtualizada));
    return sessionAtualizada;
  },

  async migrateOldSessionsToDexie(): Promise<void> {
    const pastStr = localStorage.getItem(PAST_CAIXA_SESSIONS_KEY);
    if (!pastStr) return;
    try {
      const pastSessions = JSON.parse(pastStr) as SessaoCaixa[];
      if (pastSessions.length > 0) {
        // Gera IDs unicos para sessoes legadas e salva no banco Dexie em lote
        const sessionsWithId = pastSessions.map(s => ({
          ...s,
          id: s.id || generateUUID()
        }));
        await db.sessoes_caixa.bulkPut(sessionsWithId);
        console.log(`[Database Migration] Migrated ${sessionsWithId.length} past sessions to Dexie.`);
      }
      localStorage.removeItem(PAST_CAIXA_SESSIONS_KEY);
    } catch (err) {
      console.error('Failed to migrate past sessions to Dexie', err);
    }
  },

  async getAllPastCaixaSessions(): Promise<SessaoCaixa[]> {
    await this.migrateOldSessionsToDexie();
    const sessoes = await db.sessoes_caixa.orderBy('timestampAbertura').reverse().toArray();
    return sessoes;
  }
};
