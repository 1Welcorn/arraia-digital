import { saleRepository } from '../repository/saleRepository';
import { db } from '../database/DatabaseConnection';
import { apiClient } from './apiClient';

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

  // Executa a sincronização bi-direcional (Push/Pull)
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
        const res = await apiClient.post('/sync/sales', pendingSales);
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
      if (allSessions.length > 0) {
        console.log(`[Sync] Sincronizando ${allSessions.length} sessões de caixa...`);
        await apiClient.post('/sync/sessions', allSessions);
      }

      // 3. PULL DE PRODUTOS
      try {
        const prodRes = await apiClient.get('/sync/products');
        if (prodRes.data && Array.isArray(prodRes.data)) {
          await db.produtos.bulkPut(prodRes.data);
        }
      } catch (err) {
        console.warn('[Sync] Falha ao baixar produtos atualizados da nuvem');
      }

      // 4. PULL DE MENSAGENS
      try {
        const msgRes = await apiClient.get('/sync/messages');
        if (msgRes.data && Array.isArray(msgRes.data)) {
          // Atualiza o banco local apenas com as mensagens mais recentes
          await db.mensagens.bulkPut(msgRes.data);
        }
      } catch (err) {
        console.warn('[Sync] Falha ao buscar novas mensagens');
      }

    } catch (err) {
      console.error('[Sync] Falha geral na sincronização com a Nuvem:', err);
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }
}

export const syncEngine = new SyncEngineManager();
