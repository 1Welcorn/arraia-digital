require('dotenv').config();
const { Client } = require('pg');
const c = new Client({connectionString: process.env.DATABASE_URL});
c.connect().then(()=>c.query('SELECT nome, preco FROM "Product"')).then(r=>{console.log(r.rows); c.end()});
