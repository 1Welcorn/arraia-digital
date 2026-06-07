require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');

const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });

async function run() {
  await client.connect();
  
  // Apagar usuários de teste
  await client.query(`DELETE FROM "User" WHERE email IN ('gerente.festa@escola.pr.gov.br', 'operador.caixa@escola.pr.gov.br', 'super.admin@escola.pr.gov.br', 'willians.souza@hotmail.com')`);
  console.log('Usuários de teste apagados.');

  // Mudar PIN da Vanessa para 654321
  const pin = '654321';
  const hash = crypto.createHash('sha256').update(pin).digest('hex');
  await client.query(`UPDATE "User" SET pin_acesso = $1 WHERE email = 'vanessa.moreira@escola.pr.gov.br'`, [hash]);
  console.log('PIN da Vanessa atualizado para 654321');

  await client.end();
}

run();
