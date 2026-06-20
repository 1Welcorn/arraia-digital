import express from 'express';
import cors from 'cors';
// @ts-ignore
import pg from 'pg';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

dotenv.config();
const { Client } = pg;

const app = express();

let prisma: any;
try {
  prisma = new PrismaClient();
} catch (e: any) {
  console.error("Prisma failed to init:", e);
}

// Middleware
app.use(cors());
app.use(express.json());

const getDbUrl = () => {
  let url = process.env.DATABASE_URL || '';
  return url.replace(/^['"]+/, '').replace(/['"]+$/, '').trim();
};

app.get('/api/health', async (req, res) => {
  let dbStatus = "Unknown";
  try {
    const client = new Client({ connectionString: getDbUrl() });
    await client.connect();
    await client.end();
    dbStatus = "Connected OK";
  } catch(e: any) {
    dbStatus = e.message || String(e);
  }

  res.json({ 
    status: 'ok', 
    dbUrl: process.env.DATABASE_URL ? "SET" : "MISSING", 
    directUrl: process.env.DIRECT_URL ? "SET" : "MISSING",
    dbConnection: dbStatus,
    cwd: process.cwd(),
    dirname: __dirname
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'arraia-secreto-super-seguro';

// ==========================================
// ROTA DE AUTENTICAÇÃO
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const client = new Client({ connectionString: getDbUrl() });
  try {
    const { email, pin_acesso } = req.body;

    if (!email || !pin_acesso) {
      return res.status(400).json({ error: 'Email e PIN são obrigatórios' });
    }

    await client.connect();
    const result = await client.query('SELECT * FROM "User" WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || user.pin_acesso !== pin_acesso) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Gera o token JWT
    const token = jwt.sign(
      { email: user.email, role: user.role, nome: user.nome },
      JWT_SECRET,
      { expiresIn: '12h' } // Token válido pelo tempo da festa
    );

    res.json({
      token,
      user: {
        email: user.email,
        nome: user.nome,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// ==========================================
// CONFIGURAÇÕES GLOBAIS (PIX)
// Leitura e gravação de configurações Globais (via banco)
const DEFAULT_PIX = { key: '77673945000107', name: 'Associação de pais,mestres e funcionários do Colégio Estadual Nossa Senhora de Lourdes', city: 'CURITIBA' };

app.get('/api/settings/pix', async (req, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'global_pix' } });
    if (setting) {
      res.json(JSON.parse(setting.value));
    } else {
      res.json(DEFAULT_PIX);
    }
  } catch(e) {
    res.json(DEFAULT_PIX);
  }
});

app.post('/api/settings/pix', async (req, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'global_pix' } });
    let currentPix = DEFAULT_PIX;
    if (setting) {
      currentPix = JSON.parse(setting.value);
    }
    
    const newPix = { ...currentPix, ...req.body };
    
    await prisma.systemSetting.upsert({
      where: { key: 'global_pix' },
      update: { value: JSON.stringify(newPix) },
      create: { key: 'global_pix', value: JSON.stringify(newPix) }
    });
    
    res.json({ success: true, config: newPix });
  } catch(e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==========================================
// MIDDLEWARE DE PROTEÇÃO (JWT)
// ==========================================
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  // Chave Mestra para sincronização offline-first
  if (token === 'arraia_digital_2026_super_secret') {
    req.user = { email: 'sync@arraia.com', role: 'SUPER_ADMIN' };
    return next();
  }

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ==========================================
// ROTAS DE SINCRONIZAÇÃO (PULL)
// ==========================================

// Puxar lista de usuários (Whitelist) - Rota ABERTA para novos tablets
app.get('/api/sync/users', async (req, res) => {
  const client = new Client({ connectionString: getDbUrl() });
  try {
    await client.connect();
    const result = await client.query('SELECT * FROM "User"');
    res.json(result.rows);
  } catch (error: any) {
    console.error("Erro no sync users:", error);
    res.status(500).json({ error: 'Erro ao buscar usuários', details: error.message || String(error) });
  } finally {
    try { await client.end(); } catch(e) {}
  }
});

// Obter lista de mensagens - Rota Antiga (refeita mais abaixo de forma melhorada)

// Enviar mensagem para a Nuvem
app.post('/api/sync/messages', authenticateToken, async (req: any, res) => {
  try {
    const msg = req.body;
    await prisma.message.upsert({
      where: { id: msg.id },
      update: { lida: msg.lida },
      create: {
        id: msg.id,
        tipo: msg.tipo,
        destinatarioEmail: msg.destinatarioEmail || null,
        remetente: msg.remetente,
        conteudo: msg.conteudo,
        timestamp: msg.timestamp,
        lida: msg.lida || false
      }
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao salvar mensagem:', error);
    res.status(500).json({ error: 'Erro ao salvar mensagem' });
  }
});

// Resetar banco
app.post('/api/sync/reset', authenticateToken, async (req, res) => {
  try {
    // Apaga todas as vendas e sessões
    await prisma.$executeRaw`DELETE FROM "SaleItem"`;
    await prisma.$executeRaw`DELETE FROM "Sale"`;
    await prisma.$executeRaw`DELETE FROM "CaixaSession"`;
    
    res.json({ message: 'Banco de dados resetado com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao resetar banco' });
  }
});

// Puxar produtos mais recentes
app.get('/api/sync/products', authenticateToken, async (req, res) => {
  try {
    const products = await prisma.product.findMany();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// Puxar mensagens
app.get('/api/sync/messages', authenticateToken, async (req: any, res) => {
  try {
    const email = req.query.email || req.user.email;
    const isAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN_OPERACIONAL';
    
    const whereClause = isAdmin ? {} : {
      OR: [
        { tipo: 'GERAL' },
        { destinatarioEmail: email }
      ]
    };

    const messages = await prisma.message.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: 50 // Limitando às ultimas 50
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Puxar sessões de caixa (para o Admin)
app.get('/api/sync/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await prisma.$queryRaw`SELECT * FROM "CaixaSession"`;
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar sessões de caixa', details: error.message });
  }
});

// Puxar vendas (para o Admin)
app.get('/api/sync/sales', authenticateToken, async (req, res) => {
  try {
    const sales: any[] = await prisma.$queryRaw`SELECT * FROM "Sale"`;
    const items: any[] = await prisma.$queryRaw`SELECT * FROM "SaleItem"`;
    
    // Attach items to their respective sales manually
    const salesWithItems = sales.map(sale => ({
      ...sale,
      itens: items.filter(item => item.sale_id === sale.id)
    }));
    
    res.json(salesWithItems);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar vendas', details: error.message });
  }
});

// ==========================================
// ROTAS DE SINCRONIZAÇÃO (PUSH)
// ==========================================

// Sincronizar usuários (Admin -> Nuvem)
app.post('/api/sync/users', authenticateToken, async (req, res) => {
  try {
    const users = req.body;
    if (!Array.isArray(users)) return res.status(400).json({ error: 'Body deve ser um array' });
    const client = new Client({ connectionString: getDbUrl() });
    await client.connect();

    for (const u of users) {
      await client.query(
        `INSERT INTO "User" (email, nome, pin_acesso, role, created_at) 
         VALUES ($1, $2, $3, $4, now()) 
         ON CONFLICT (email) DO UPDATE 
         SET nome = EXCLUDED.nome, pin_acesso = EXCLUDED.pin_acesso, role = EXCLUDED.role`,
        [u.email, u.nome, u.pin_acesso, u.nivel_acesso]
      );
    }
    await client.end();
    res.json({ success: true });
  } catch (error) {
    console.error('Erro no sync de usuários:', error);
    res.status(500).json({ error: 'Erro interno ao sincronizar usuários' });
  }
});

// Apagar usuário da Nuvem
app.delete('/api/sync/users/:email', authenticateToken, async (req: any, res) => {
  try {
    const { email } = req.params;
    const client = new Client({ connectionString: getDbUrl() });
    await client.connect();
    await client.query(`DELETE FROM "User" WHERE email = $1`, [email.toLowerCase()]);
    await client.end();
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    res.status(500).json({ error: 'Erro interno ao deletar usuário' });
  }
});

// Sincronizar produtos (Admin -> Nuvem)
app.post('/api/sync/products', authenticateToken, async (req, res) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) return res.status(400).json({ error: 'Body deve ser um array' });

    for (const p of products) {
      await prisma.product.upsert({
        where: { id: p.id },
        update: { nome: p.nome, categoria: p.categoria, preco: p.preco, cor_ficha: p.cor_ficha, ativo: p.ativo, imagem: p.imagem },
        create: { id: p.id, nome: p.nome, categoria: p.categoria, preco: p.preco, cor_ficha: p.cor_ficha, ativo: p.ativo, imagem: p.imagem }
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro no sync de produtos:', error);
    res.status(500).json({ error: 'Erro interno ao sincronizar produtos' });
  }
});

// Receber array de vendas do modo offline (PDV -> Nuvem)
app.post('/api/sync/sales', authenticateToken, async (req, res) => {
  try {
    const vendas = req.body; // Array de Venda
    if (!Array.isArray(vendas)) return res.status(400).json({ error: 'Body deve ser um array' });

    let syncedCount = 0;

    // Usando transactions ou upsert para ser Idempotente
    for (const venda of vendas) {
      // Verifica se já existe para não duplicar (Idempotência)
      const exists = await prisma.sale.findUnique({ where: { id: venda.id } });
      if (!exists) {
        await prisma.sale.create({
          data: {
            id: venda.id,
            device_id: venda.device_id,
            valor_total: venda.valor_total,
            metodo_pagamento: venda.metodo_pagamento,
            codigo_pix: venda.codigo_pix_utilizado,
            valor_pago: venda.valor_pago,
            troco: venda.troco,
            criado_em: venda.criado_em,
            items: {
              create: venda.itens.map((item: any) => ({
                id: item.id,
                produto_id: item.produto_id,
                quantidade: item.quantidade,
                preco_unitario: item.preco_unitario
              }))
            }
          }
        });
        syncedCount++;
      }
    }

    res.json({ success: true, syncedCount });
  } catch (error) {
    console.error('Erro no sync de vendas:', error);
    res.status(500).json({ error: 'Erro interno ao sincronizar vendas' });
  }
});

// Sincronizar sessões (Upload do Caixa)
app.post('/api/sync/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = req.body; // Array
    if (!Array.isArray(sessions)) return res.status(400).json({ error: 'Body deve ser um array' });

    for (const s of sessions) {
      // Usar $executeRaw para fazer o upsert
      await prisma.$executeRaw`
        INSERT INTO "CaixaSession" (
          id, "operadorEmail", status, "valorAbertura", "valorFechamento",
          "timestampAbertura", "timestampFechamento", observacoes, "sangriasJson", "suprimentosJson"
        ) VALUES (
          ${s.id}, ${s.operadorEmail}, ${s.status}, ${s.valorAbertura}, ${s.valorFechamento || null},
          ${s.timestampAbertura}, ${s.timestampFechamento || null}, ${s.observacoes || ''}, ${JSON.stringify(s.sangrias || [])}, ${JSON.stringify(s.suprimentos || [])}
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          "valorFechamento" = EXCLUDED."valorFechamento",
          "timestampFechamento" = EXCLUDED."timestampFechamento",
          observacoes = EXCLUDED.observacoes,
          "sangriasJson" = EXCLUDED."sangriasJson",
          "suprimentosJson" = EXCLUDED."suprimentosJson",
          synced_at = NOW()
      `;
    }

    res.json({ success: true, count: sessions.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao sincronizar sessões', details: error.message });
  }
});

// ==========================================
// ROTA DE LIMPEZA DE TESTES (SUPER_ADMIN)
// ==========================================
app.post('/api/reset-test-data', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Acesso negado. Apenas SUPER_ADMIN pode zerar o banco.' });
  }
  try {
    // Apaga os dados transacionais e mantém os cadastrais (Usuários e Produtos)
    await prisma.$executeRaw`DELETE FROM "SaleItem"`;
    await prisma.$executeRaw`DELETE FROM "Sale"`;
    await prisma.$executeRaw`DELETE FROM "CaixaSession"`;
    await prisma.$executeRaw`DELETE FROM "Message"`;
    res.json({ success: true, message: 'Dados de teste apagados com sucesso!' });
  } catch (err) {
    console.error('Erro ao resetar testes:', err);
    res.status(500).json({ error: 'Erro interno ao limpar banco' });
  }
});

// Inicialização
const PORT = process.env.PORT || 3001;

// Só sobe a porta ativamente se estiver rodando local (A Vercel gerencia a porta sozinha)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor de Sincronização rodando na porta ${PORT}`);
  });
}

export default app;
