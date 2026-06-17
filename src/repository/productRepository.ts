import { db } from '../database/DatabaseConnection';
import type { Produto } from '../database/DatabaseConnection';
import { apiClient } from '../services/apiClient';

export const productRepository = {
  async seedDefaultProducts(): Promise<void> {
    const count = await db.produtos.count();
    
    // Limpeza forçada de produtos antigos do cache do navegador
    const allExisting = await db.produtos.toArray();
    for (const p of allExisting) {
      if (!p.id.startsWith('prod_')) {
        await db.produtos.delete(p.id);
      }
    }
    
    const product1 = await db.produtos.get('prod_1');
    const needsUpdate = count !== 22 || !product1 || product1.nome !== 'PASTEL' || product1.imagem !== '/images/pastel.png';
    
    if (needsUpdate) {
      await db.produtos.clear();
      
      const defaultProducts: Produto[] = [
        // Comidas
        { id: 'prod_1', nome: 'PASTEL', preco: 10.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/pastel.png' },
        { id: 'prod_2', nome: 'CACHORRO QUENTE', preco: 10.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/cachorro-quente.png' },
        { id: 'prod_3', nome: 'PIPOCA', preco: 3.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/pipoca.png' },
        { id: 'prod_4', nome: 'ESPETINHO', preco: 10.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/espetinho.png' },
        { id: 'prod_5', nome: 'MILHO VERDE COZIDO', preco: 10.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/milho-verde.png' },
        
        // Doces
        { id: 'prod_6', nome: 'CANJICA', preco: 7.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/canjica.png' },
        { id: 'prod_7', nome: 'CHURROS', preco: 13.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/churros.png' },
        { id: 'prod_8', nome: 'DOCES JUNINOS', preco: 1.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doces-juninos.png' },
        { id: 'prod_9', nome: 'BRIGADEIRO/BEIJINHO', preco: 5.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/beijinho-brigadeiro.png' },
        { id: 'prod_10', nome: 'ALGODÃO DOCE', preco: 5.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/algodao-doce.png' },
        { id: 'prod_11', nome: 'BOLO DE POTE', preco: 10.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/bolo-de-pote.png' },
        { id: 'prod_12', nome: 'BOLO DE FATIA', preco: 5.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/bolo-de-fatia.png' },

        // Bebidas
        { id: 'prod_13', nome: 'CHOCOLATE QUENTE', preco: 5.00, categoria: 'BEBIDAS', cor_ficha: 'bg-blue-600 text-white border-blue-400', ativo: 1, imagem: '/images/chocolate-quente.png' },
        { id: 'prod_14', nome: 'REFRIGERANTE', preco: 4.00, categoria: 'BEBIDAS', cor_ficha: 'bg-blue-600 text-white border-blue-400', ativo: 1, imagem: '/images/refrigerante.png' },
        { id: 'prod_15', nome: 'ÁGUA', preco: 4.00, categoria: 'BEBIDAS', cor_ficha: 'bg-blue-600 text-white border-blue-400', ativo: 1, imagem: '/images/agua.png' },

        // Jogos (Brincadeiras)
        { id: 'prod_16', nome: 'PESCARIA', preco: 6.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/pescaria.png' },
        { id: 'prod_17', nome: 'CADEIA', preco: 1.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/cadeia.png' },
        { id: 'prod_18', nome: 'ARGOLA', preco: 6.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/argola.png' },
        { id: 'prod_19', nome: 'BOCA DO CAIPIRA', preco: 6.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/boca-do-caipira.png' },
        { id: 'prod_20', nome: 'COTONETE', preco: 6.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/cotonete.png' },
        { id: 'prod_21', nome: 'TOURO MECÂNICO', preco: 10.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/touro-mecanico.png' },
        { id: 'prod_22', nome: 'PINTURA ARTÍSTICA', preco: 5.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
      ];

      await db.produtos.bulkAdd(defaultProducts);
      console.log('Produtos semeados via Dexie com sucesso!');
    } else {
      // Garante que todos os produtos existentes ganham suas respectivas imagens e cores padronizadas
      const existing = await db.produtos.toArray();
      let updatedCount = 0;
      for (const prod of existing) {
        let changed = false;
        
        if (!prod.imagem) {
          if (prod.categoria === 'COMIDAS') prod.imagem = '/images/comida.png';
          else if (prod.categoria === 'BEBIDAS') prod.imagem = '/images/bebida.png';
          else if (prod.categoria === 'DOCES') prod.imagem = '/images/doce.png';
          else if (prod.categoria === 'JOGOS') prod.imagem = '/images/jogo.png';
          changed = true;
        }

        const expectedColor = 
          prod.categoria === 'COMIDAS' ? 'bg-amber-500 text-slate-900 border-amber-400' :
          prod.categoria === 'BEBIDAS' ? 'bg-blue-600 text-white border-blue-400' :
          prod.categoria === 'DOCES' ? 'bg-rose-600 text-white border-rose-400' :
          'bg-purple-600 text-white border-purple-400';

        if (prod.cor_ficha !== expectedColor) {
          prod.cor_ficha = expectedColor;
          changed = true;
        }
        
        if (changed) {
          await db.produtos.put(prod);
          apiClient.post('/sync/products', [prod]).catch(() => {});
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        console.log(`Atualizados ${updatedCount} produtos com imagens/cores padronizadas.`);
      }
    }
  },

  async getAllProducts(): Promise<Produto[]> {
    await this.seedDefaultProducts();
    return db.produtos.toArray();
  },

  async getProductById(id: string): Promise<Produto | undefined> {
    await this.seedDefaultProducts();
    return db.produtos.get(id);
  },

  async saveProduct(product: Produto): Promise<string> {
    await db.produtos.put(product);
    return product.id;
  },

  async deleteProduct(id: string): Promise<void> {
    await db.produtos.delete(id);
  }
};
