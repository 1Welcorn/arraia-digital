require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
client.connect().then(() => {
  client.query(`UPDATE "User" SET pin_acesso = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4' WHERE email = 'willians.souza@gmail.com';`)
  .then(() => {
    console.log('User pin updated to hash of 1234!');
    client.end();
  }).catch(e => {
    console.error(e);
    client.end();
  });
});
