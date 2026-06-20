const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Adicionando Correios Elegantes...');
  
  const correios = [
    { id: '25', nome: 'CORREIO ELEGANTE (1 UND)', preco: 1.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
    { id: '26', nome: 'CORREIO ELEGANTE (2 UND)', preco: 2.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' },
    { id: '27', nome: 'CORREIO ELEGANTE (4 UND)', preco: 4.00, categoria: 'JOGOS', cor_ficha: 'bg-purple-600 text-white border-purple-400', ativo: 1, imagem: '/images/jogo.png' }
  ];
  
  for (const c of correios) {
    const existing = await prisma.product.findFirst({ where: { nome: c.nome } });
    if (!existing) {
      await prisma.product.create({ data: c });
      console.log(`${c.nome} adicionado com sucesso!`);
    } else {
      console.log(`${c.nome} já existe!`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
