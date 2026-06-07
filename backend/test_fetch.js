fetch('https://arraia-digital.vercel.app/api/sync/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify([{email: 'test-fetch@gmail.com', nome: 'Test', pin_acesso: '123', nivel_acesso: 'OPERADOR_CAIXA'}])
})
.then(res => res.text())
.then(console.log)
.catch(console.error);
