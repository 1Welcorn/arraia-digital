require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
client.connect().then(() => {
  client.query(`DELETE FROM "User" WHERE email = 'willians.souza@gmail.com';`)
  .then(() => {
    console.log('User deleted!');
    client.end();
  }).catch(e => {
    console.error(e);
    client.end();
  });
});
