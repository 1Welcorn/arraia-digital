import { db } from '../database/DatabaseConnection';
import type { Produto } from '../database/DatabaseConnection';
import { apiClient } from '../services/apiClient';

export const productRepository = {
  async seedDefaultProducts(): Promise<void> {
    const count = await db.produtos.count();
    if (count === 0) {
      const defaultProducts: Produto[] = [
        { id: '1', nome: 'Pamonha Quentinha', preco: 8.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/comida.png' },
        { id: '2', nome: 'Quentão Aromático', preco: 6.00, categoria: 'BEBIDAS', cor_ficha: 'bg-blue-600 text-white border-blue-400', ativo: 1, imagem: '/images/bebida.png' },
        { id: '3', nome: 'Pastel de Carne/Queijo', preco: 7.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/comida.png' },
        { id: '4', nome: 'Pipoca na Manteiga', preco: 4.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/comida.png' },
        { id: '5', nome: 'Canjica Cremosa', preco: 6.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doce.png' },
        { id: '6', nome: 'Cachorro Quente', preco: 8.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/comida.png' },
        { id: '7', nome: 'Bolo de Milho', preco: 5.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doce.png' },
        { id: '8', nome: 'Refrigerante Lata', preco: 5.00, categoria: 'BEBIDAS', cor_ficha: 'bg-blue-600 text-white border-blue-400', ativo: 1, imagem: '/images/bebida.png' },
        { id: '9', nome: 'Água Mineral', preco: 3.00, categoria: 'BEBIDAS', cor_ficha: 'bg-blue-600 text-white border-blue-400', ativo: 1, imagem: '/images/bebida.png' },
        { id: '10', nome: 'Pescaria Caipira', preco: 5.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
        { id: '11', nome: 'Boca do Palhaço', preco: 5.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
        { id: '12', nome: 'Argolas', preco: 5.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
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
