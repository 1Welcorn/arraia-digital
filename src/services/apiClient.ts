import axios from 'axios';

// Em produção (Vercel), a API está no mesmo domínio sob /api.
// Em desenvolvimento, conectamos no 3001 para testes locais.
const isProd = import.meta.env.PROD || (window.location.hostname !== 'localhost' && !window.location.hostname.includes('192.168.'));
const API_URL = isProd ? '/api' : `http://${window.location.hostname}:3001/api`;

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para adicionar o token de segurança automaticamente
apiClient.interceptors.request.use((config) => {
  const sessionStr = localStorage.getItem('arraia_digital_session');
  if (sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      // O token será injetado caso a gente implemente o retorno de token no authLocalService
      if (session.token) {
        config.headers.Authorization = `Bearer ${session.token}`;
      }
    } catch (e) {
      console.warn('Erro ao ler a sessão para injetar token');
    }
  }
  return config;
});
