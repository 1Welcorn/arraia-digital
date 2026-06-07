const fetch = require('node-fetch');

async function test() {
  const res = await fetch('https://arraia-digital.vercel.app/api/sync/users/teste@escola.pr.gov.br', {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer arraia_digital_2026_super_secret'
    }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text);
}
test();
