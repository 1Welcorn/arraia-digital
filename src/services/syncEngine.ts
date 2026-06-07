import { saleRepository } from '../repository/saleRepository';
import { db } from '../database/DatabaseConnection';
import { apiClient } from './apiClient';
import { authLocalService } from './authLocalService';

type SyncCallback = (status: { online: boolean; syncing: boolean; pendingCount: number }) => void;

class SyncEngineManager {
  private isSyncing = false;
  private listeners: Set<SyncCallback> = new Set();
  private syncIntervalId: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleConnectionChange());
      window.addEventListener('offline', () => this.handleConnectionChange());
    }
  }

  get online(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : false;
  }

  // Registra um ouvinte para atualizações de status de sincronização
  subscribe(callback: SyncCallback): () => void {
    this.listeners.add(callback);
    // Notifica imediatamente o assinante com o status atual
    this.notify(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private async notify(callback?: SyncCallback) {
    const pendingSales = await saleRepository.getPendingSyncSales();
    const status = {
      online: this.online,
      syncing: this.isSyncing,
      pendingCount: pendingSales.length,
    };

    if (callback) {
      callback(status);
    } else {
      this.listeners.forEach((listener) => listener(status));
    }
  }

  private handleConnectionChange() {
    console.log(`Conexão alterada: ${this.online ? 'ONLINE' : 'OFFLINE'}`);
    this.notify();
    if (this.online) {
      this.syncNow();
    }
  }

  // Inicia sincronização automática periódica (ex: a cada 30 segundos se online)
  startAutoSync(intervalMs = 30000) {
    this.stopAutoSync();
    this.syncNow();
    this.syncIntervalId = setInterval(() => {
      if (this.online) {
        this.syncNow();
      }
    }, intervalMs);
  }

  stopAutoSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  // Puxa apenas a Whitelist de Usuários (usado na tela de login)
  async syncUsersOnly(): Promise<void> {
    if (!this.online) return;
    try {
      const usersRes = await apiClient.get('/sync/users?t=' + Date.now());
      if (usersRes.data && Array.isArray(usersRes.data)) {
        const mappedUsers = usersRes.data.map((u: any) => ({
          email: u.email,
          nome: u.nome,
          pin_acesso: u.pin_acesso,
          nivel_acesso: u.role,
          ativo: 1
        }));
        await db.usuarios_sistema.bulkPut(mappedUsers);
      }
    } catch (err) {
      console.warn('[Sync] Falha ao baixar Whitelist de usuários da nuvem');
    }
  }

  // Executa a sincronização bi-direcional completa (Push/Pull)
  async syncNow(): Promise<void> {
    if (this.isSyncing) return;
    if (!this.online) {
      this.notify();
      return;
    }

    this.isSyncing = true;
    this.notify();

    try {
      // 1. PUSH DE VENDAS
      const pendingSales = await saleRepository.getPendingSyncSales();
      if (pendingSales.length > 0) {
        console.log(`[Sync] Enviando ${pendingSales.length} venda(s) para a nuvem...`);
        // Precisamos anexar os itens em cada venda antes de enviar
        const salesWithItems = await Promise.all(pendingSales.map(async (sale) => {
          const items = await saleRepository.getSaleItems(sale.id);
          return { ...sale, itens: items };
        }));

        const res = await apiClient.post('/sync/sales', salesWithItems);
        if (res.data?.success) {
          // Marca todas como sincronizadas no banco local
          for (const sale of pendingSales) {
            if (sale.id) await saleRepository.markAsSynced(sale.id);
          }
          console.log(`[Sync] Vendas sincronizadas com sucesso: ${res.data.syncedCount}`);
        }
      }

      // 2. PUSH DE SESSÕES DE CAIXA
      // Envia todo o histórico local para a nuvem. O Backend usa UPSERT (Idempotência)
      const allSessions = await saleRepository.getAllPastCaixaSessions();
      const activeSession = await saleRepository.getActiveCaixaSession();
      const sessionsToSync = [...allSessions];
      if (activeSession) {
        sessionsToSync.push(activeSession);
      }

      if (sessionsToSync.length > 0) {
        console.log(`[Sync] Sincronizando ${sessionsToSync.length} sessões de caixa...`);
        await apiClient.post('/sync/sessions', sessionsToSync);
      }

      // 2.1 PUSH DE USUÁRIOS (Whitelist)
      const allUsers = await db.usuarios_sistema.toArray();
      if (allUsers.length > 0) {
        console.log(`[Sync] Enviando ${allUsers.length} usuários para a nuvem...`);
        try { await apiClient.post('/sync/users', allUsers); } catch(e) {}
      }

      // 2.2 PUSH DE PRODUTOS
      const allProducts = await db.produtos.toArray();
      if (allProducts.length > 0) {
        console.log(`[Sync] Enviando ${allProducts.length} produtos para a nuvem...`);
        try { await apiClient.post('/sync/products', allProducts); } catch(e) {}
      }

      // 3. PULL DE PRODUTOS
      try {
        const prodRes = await apiClient.get('/sync/products?t=' + Date.now());
        if (prodRes.data && Array.isArray(prodRes.data)) {
          await db.produtos.bulkPut(prodRes.data);
        }
      } catch (err) {
        console.warn('[Sync] Falha ao baixar produtos atualizados da nuvem');
      }

      // 4. PULL DE MENSAGENS
      try {
        const user = authLocalService.getCurrentUser();
        const baseMsgUrl = user?.email ? `/sync/messages?email=${encodeURIComponent(user.email)}` : '/sync/messages';
        const msgUrl = baseMsgUrl + (baseMsgUrl.includes('?') ? '&t=' : '?t=') + Date.now();
        const msgRes = await apiClient.get(msgUrl);
        if (msgRes.data && Array.isArray(msgRes.data)) {
          // Atualiza o banco local apenas com as mensagens mais recentes
          await db.mensagens.bulkPut(msgRes.data);
        }
      } catch (err) {
        console.warn('[Sync] Falha ao buscar novas mensagens');
      }

      // Se for ADMIN ou SUPER_ADMIN, vamos puxar todas as vendas e sessões também
      const currentUser = authLocalService.getCurrentUser();
      if (currentUser && (currentUser.role === 'ADMIN_OPERACIONAL' || currentUser.role === 'SUPER_ADMIN')) {
        // PULL DE SESSÕES DE CAIXA
        try {
          const sessRes = await apiClient.get('/sync/sessions?t=' + Date.now());
          if (sessRes.data && Array.isArray(sessRes.data)) {
            const mappedSessions = sessRes.data.map((s: any) => ({
              id: s.id,
              operadorEmail: s.operadorEmail,
              status: s.status,
              valorAbertura: s.valorAbertura,
              valorFechamento: s.valorFechamento,
              timestampAbertura: s.timestampAbertura,
              timestampFechamento: s.timestampFechamento,
              observacoes: s.observacoes,
              sangrias: JSON.parse(s.sangriasJson || '[]'),
              suprimentos: JSON.parse(s.suprimentosJson || '[]'),
            }));
            await db.sessoes_caixa.bulkPut(mappedSessions);
          }
        } catch (err) {
          console.warn('[Sync] Falha ao buscar sessões de caixa', err);
        }

        // PULL DE VENDAS
        try {
          const salesRes = await apiClient.get('/sync/sales?t=' + Date.now());
          if (salesRes.data && Array.isArray(salesRes.data)) {
            const vendas = [];
            const itens = [];
            for (const s of salesRes.data) {
              vendas.push({
                id: s.id,
                device_id: s.device_id,
                valor_total: s.valor_total,
                metodo_pagamento: s.metodo_pagamento,
                codigo_pix_utilizado: s.codigo_pix,
                valor_pago: s.valor_pago,
                troco: s.troco,
                criado_em: s.criado_em,
                status_sync: 'synced'
              });
              if (s.items && Array.isArray(s.items)) {
                for (const it of s.items) {
                  itens.push({
                    id: it.id,
                    venda_id: it.venda_id,
                    produto_id: it.produto_id,
                    quantidade: it.quantidade,
                    preco_unitario: it.preco_unitario
                  });
                }
              }
            }
            await db.vendas.bulkPut(vendas as any);
            await db.itens_venda.bulkPut(itens as any);
          }
        } catch (err) {
          console.warn('[Sync] Falha ao buscar vendas', err);
        }
      }

      // 5. PULL DE USUÁRIOS
      await this.syncUsersOnly();

    } catch (err) {
      console.error('[Sync] Falha geral na sincronização com a Nuvem:', err);
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }
}

export const syncEngine = new SyncEngineManager();
