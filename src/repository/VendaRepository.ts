import { db, type Venda, type ItemVenda } from '../database/DatabaseConnection';

interface NovoItemInput {
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
}

interface NovaVendaInput {
  device_id: string;
  valor_total: number;
  metodo_pagamento: 'DINHEIRO' | 'PIX_LOCAL' | 'CORTESIA' | 'CARTAO';
  codigo_pix_utilizado?: string;
  valor_pago?: number;
  troco?: number;
  itens: NovoItemInput[];
}

export class VendaRepository {
  /**
   * Salva a venda e todos os seus itens dentro de uma transação ACID nativa do navegador.
   * Se faltar luz, bateria ou o app fechar no meio, nada de lixo fica salvo no banco!
   */
  public async salvarVendaLocal(dados: NovaVendaInput): Promise<string> {
    const vendaId = crypto.randomUUID();
    const dataCriacao = new Date().toISOString();

    // Inicia a transação de Leitura e Escrita ('rw') nas tabelas afetadas
    await db.transaction('rw', [db.vendas, db.itens_venda], async () => {
      
      // 1. Monta o objeto da venda mestre
      const novaVenda: Venda = {
        id: vendaId,
        device_id: dados.device_id,
        valor_total: dados.valor_total,
        metodo_pagamento: dados.metodo_pagamento,
        codigo_pix_utilizado: dados.codigo_pix_utilizado,
        valor_pago: dados.valor_pago,
        troco: dados.troco,
        criado_em: dataCriacao,
        status_sync: 'pending' // Nasce pendente para o motor de sync enviar depois
      };

      // 2. Insere a venda mestre no IndexedDB
      await db.vendas.add(novaVenda);

      // 3. Prepara e insere os itens do carrinho
      const itensParaInserir: ItemVenda[] = dados.itens.map(item => ({
        id: crypto.randomUUID(),
        venda_id: vendaId, // Amarra com o ID da venda de cima
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario
      }));

      // Insere todos os itens de uma vez só (alta performance)
      await db.itens_venda.bulkAdd(itensParaInserir);
    });

    console.log(`🎉 Venda ${vendaId} gravada com segurança no armazenamento do dispositivo!`);
    return vendaId;
  }
}
