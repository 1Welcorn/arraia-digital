const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const defaultProducts = [
  // Comidas
  { id: '1', nome: 'PASTEL', preco: 10.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/comida.png' },
  { id: '2', nome: 'CACHORRO QUENTE', preco: 10.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/comida.png' },
  { id: '3', nome: 'PIPOCA', preco: 3.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/comida.png' },
  { id: '4', nome: 'ESPETINHO', preco: 10.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/comida.png' },
  { id: '5', nome: 'MILHO VERDE COZIDO', preco: 10.00, categoria: 'COMIDAS', cor_ficha: 'bg-amber-500 text-slate-900 border-amber-400', ativo: 1, imagem: '/images/comida.png' },
  
  // Doces
  { id: '6', nome: 'CANJICA', preco: 7.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doce.png' },
  { id: '7', nome: 'CHURROS', preco: 13.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doce.png' },
  { id: '8', nome: 'DOCES JUNINOS', preco: 1.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doce.png' },
  { id: '9', nome: 'BRIGADEIRO/BEIJINHO', preco: 5.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doce.png' },
  { id: '10', nome: 'ALGODÃO DOCE', preco: 5.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doce.png' },
  { id: '11', nome: 'BOLO DE POTE', preco: 10.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doce.png' },
  { id: '12', nome: 'BOLO DE FATIA', preco: 5.00, categoria: 'DOCES', cor_ficha: 'bg-rose-600 text-white border-rose-400', ativo: 1, imagem: '/images/doce.png' },

  // Bebidas
  { id: '13', nome: 'CHOCOLATE QUENTE', preco: 5.00, categoria: 'BEBIDAS', cor_ficha: 'bg-blue-600 text-white border-blue-400', ativo: 1, imagem: '/images/bebida.png' },
  { id: '14', nome: 'REFRIGERANTE', preco: 4.00, categoria: 'BEBIDAS', cor_ficha: 'bg-blue-600 text-white border-blue-400', ativo: 1, imagem: '/images/bebida.png' },
  { id: '15', nome: 'ÁGUA', preco: 4.00, categoria: 'BEBIDAS', cor_ficha: 'bg-blue-600 text-white border-blue-400', ativo: 1, imagem: '/images/bebida.png' },

  // Jogos (Brincadeiras)
  { id: '16', nome: 'PESCARIA', preco: 6.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
  { id: '17', nome: 'CADEIA', preco: 1.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
  { id: '18', nome: 'ARGOLA', preco: 6.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
  { id: '19', nome: 'BOCA DO CAIPIRA', preco: 6.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
  { id: '20', nome: 'COTONETE', preco: 6.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
  { id: '21', nome: 'TOURO MECÂNICO', preco: 10.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
  { id: '22', nome: 'PINTURA ARTÍSTICA', preco: 5.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
  { id: '23', nome: 'CARTELA DE BINGO', preco: 15.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' }
];

async function main() {
  console.log('Apagando SaleItems vinculados...');
  await prisma.saleItem.deleteMany({});
  console.log('Apagando Sales...');
  await prisma.sale.deleteMany({});
  console.log('Apagando produtos antigos...');
  await prisma.product.deleteMany({});

  console.log('Inserindo novos produtos...');
  for (const p of defaultProducts) {
    await prisma.product.create({ data: p });
  }
  console.log('Pronto!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
