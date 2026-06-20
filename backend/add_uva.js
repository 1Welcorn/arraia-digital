const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Adicionando Espetinho de Uva...');
  
  // Check if exists
  const existing = await prisma.product.findFirst({ where: { nome: 'ESPETINHO DE UVA' } });
  if (existing) {
    console.log('Já existe!');
    return;
  }
  
  await prisma.product.create({
    data: {
      id: '24',
      nome: 'ESPETINHO DE UVA',
      preco: 5.00,
      categoria: 'DOCES',
      cor_ficha: 'bg-rose-600 text-white border-rose-400',
      ativo: 1,
      imagem: '/images/doce.png'
    }
  });
  console.log('Espetinho de Uva adicionado com sucesso!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
