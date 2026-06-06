import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Iniciando limpeza dos dados de teste no Servidor...');
  
  // Apagar itens da venda primeiro (chaves estrangeiras)
  const deletedSaleItems = await prisma.saleItem.deleteMany({});
  console.log(`✅ Apagados ${deletedSaleItems.count} Itens de Vendas.`);

  // Apagar vendas
  const deletedSales = await prisma.sale.deleteMany({});
  console.log(`✅ Apagadas ${deletedSales.count} Vendas.`);

  // Apagar sessões
  const deletedSessions = await prisma.caixaSession.deleteMany({});
  console.log(`✅ Apagadas ${deletedSessions.count} Sessões de Caixa.`);

  // Apagar mensagens
  const deletedMessages = await prisma.message.deleteMany({});
  console.log(`✅ Apagadas ${deletedMessages.count} Mensagens.`);

  console.log('🎉 Modo de Teste zerado no Servidor! Prontos para a festa oficial!');
}

main()
  .catch(e => {
    console.error('❌ Erro durante a limpeza:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
