import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
let prisma: any;
let prismaError: string = "";
try {
  prisma = new PrismaClient({ url: process.env.DATABASE_URL });
} catch (e: any) {
  prismaError = e.message || String(e);
}

// Middleware
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    hasPrisma: !!prisma, 
    prismaError,
    dbUrl: process.env.DATABASE_URL ? "SET" : "MISSING", 
    directUrl: process.env.DIRECT_URL ? "SET" : "MISSING",
    cwd: process.cwd(),
    dirname: __dirname
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'arraia-secreto-super-seguro';

// ==========================================
// ROTA DE AUTENTICAÇÃO
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, pin_acesso } = req.body;

    if (!email || !pin_acesso) {
      return res.status(400).json({ error: 'Email e PIN são obrigatórios' });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

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
// ==========================================
const SETTINGS_FILE = path.join(__dirname, '..', 'settings.json');

const getSettings = () => {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    } catch(e) { }
  }
  return { pix: { key: '12345678000199', name: 'APMF ESCOLA ESTADUAL', city: 'CURITIBA' } };
};

const saveSettings = (data: any) => {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
};

app.get('/api/settings/pix', (req, res) => {
  res.json(getSettings().pix);
});

app.post('/api/settings/pix', (req, res) => {
  const settings = getSettings();
  settings.pix = { ...settings.pix, ...req.body };
  saveSettings(settings);
  res.json({ success: true, config: settings.pix });
});

// ==========================================
// MIDDLEWARE DE PROTEÇÃO (JWT)
// ==========================================
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
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
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuários' });
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
    const email = req.user.email;
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { tipo: 'GERAL' },
          { destinatarioEmail: email }
        ]
      },
      orderBy: { timestamp: 'desc' },
      take: 50 // Limitando às ultimas 50
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
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

    for (const u of users) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: { nome: u.nome, pin_acesso: u.pin_acesso, role: u.nivel_acesso },
        create: { email: u.email, nome: u.nome, pin_acesso: u.pin_acesso, role: u.nivel_acesso }
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro no sync de usuários:', error);
    res.status(500).json({ error: 'Erro interno ao sincronizar usuários' });
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

// Sincronizar sessões de caixa
app.post('/api/sync/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = req.body; // Array
    if (!Array.isArray(sessions)) return res.status(400).json({ error: 'Body deve ser um array' });

    for (const s of sessions) {
      // Upsert: cria ou atualiza se já existe (ex: abriu o caixa, depois fechou)
      await prisma.caixaSession.upsert({
        where: { id: s.id },
        update: {
          status: s.status,
          valorFechamento: s.valorFechamento,
          timestampFechamento: s.timestampFechamento,
          observacoes: s.observacoes,
          sangriasJson: JSON.stringify(s.sangrias || []),
          suprimentosJson: JSON.stringify(s.suprimentos || []),
          synced_at: new Date()
        },
        create: {
          id: s.id,
          operadorEmail: s.operadorEmail,
          status: s.status,
          valorAbertura: s.valorAbertura,
          valorFechamento: s.valorFechamento,
          timestampAbertura: s.timestampAbertura,
          timestampFechamento: s.timestampFechamento,
          observacoes: s.observacoes,
          sangriasJson: JSON.stringify(s.sangrias || []),
          suprimentosJson: JSON.stringify(s.suprimentos || [])
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro no sync de sessoes:', error);
    res.status(500).json({ error: 'Erro ao sincronizar sessoes' });
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
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.caixaSession.deleteMany();
    await prisma.message.deleteMany();
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
