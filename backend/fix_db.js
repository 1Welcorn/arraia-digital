const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres.rgmunuygrtnjxoxgccja:1Belinha11%2A%2F%2A@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true' });

async function fixDB() {
  await client.connect();

  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update('654321').digest('hex');

  await client.query(`
    UPDATE "User" 
    SET pin_acesso = $1 
    WHERE email = 'vanessa.moreira@escola.pr.gov.br'
  `, [hash]);

  const res = await client.query('SELECT email, nome, pin_acesso FROM "User" WHERE email = $1', ['vanessa.moreira@escola.pr.gov.br']);
  console.log("Vanessa na Nuvem:", JSON.stringify(res.rows, null, 2));
  
  await client.end();
}

fixDB().catch(e => console.error(e));
