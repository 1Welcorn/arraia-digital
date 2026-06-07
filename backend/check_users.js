require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
client.connect().then(() => {
  client.query(`SELECT * FROM "User"`)
  .then(res => {
    console.log(res.rows);
    client.end();
  }).catch(e => {
    console.error(e);
    client.end();
  });
});
