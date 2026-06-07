const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres.rgmunuygrtnjxoxgccja:1Belinha11%2A%2F%2A@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true' });

client.connect().then(() => {
  return client.query('SELECT * FROM "User"');
}).then(res => {
  console.log("USERS IN DB:", JSON.stringify(res.rows, null, 2));
  client.end();
}).catch(e => console.error(e));
