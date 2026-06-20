const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Adicionando Cartela de Bingo...');
  
  // Check if exists
  const existing = await prisma.product.findFirst({ where: { nome: 'CARTELA DE BINGO' } });
  if (existing) {
    console.log('Já existe!');
    return;
  }
  
  await prisma.product.create({
    data: {
      id: '23',
      nome: 'CARTELA DE BINGO',
      preco: 15.00,
      categoria: 'JOGOS',
      cor_ficha: 'bg-purple-600 text-white border-purple-400',
      ativo: 1,
      imagem: '/images/jogo.png'
    }
  });
  console.log('Cartela de Bingo adicionada com sucesso!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
