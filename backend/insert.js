require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
client.connect().then(() => {
  client.query(`INSERT INTO "User" (email, nome, pin_acesso, role) VALUES ('willians.souza@gmail.com', 'Willians Souza', '1234', 'SUPER_ADMIN') ON CONFLICT (email) DO NOTHING;`)
  .then(() => {
    console.log('User inserted!');
    client.end();
  }).catch(e => {
    console.error(e);
    client.end();
  });
});
