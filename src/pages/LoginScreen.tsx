import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authLocalService } from '../services/authLocalService';

export function LoginScreen() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');

  // Se já estiver logado, redireciona direto
  useEffect(() => {
    if (authLocalService.isAuthenticated()) {
      const user = authLocalService.getCurrentUser();
      if (user?.role === 'OPERADOR_CAIXA') {
        navigate('/pdv');
      } else {
        navigate('/admin');
      }
    }
  }, [navigate]);

  const handleAutocompletarEmail = () => {
    if (!usuario.includes('@')) {
      setUsuario(prev => prev.trim() + '@escola.pr.gov.br');
    }
  };

  const handleEntrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    const emailCompleto = usuario.includes('@') ? usuario.trim() : `${usuario.trim()}@escola.pr.gov.br`;
    
    if (!usuario || !pin) {
      setErro('Preencha todos os campos, sô!');
      return;
    }

    try {
      const session = await authLocalService.login(emailCompleto, pin);
      console.log('Tentando logar com:', emailCompleto, pin);
      if (session.role === 'OPERADOR_CAIXA') {
        navigate('/pdv');
      } else {
        navigate('/admin');
      }
    } catch (err: any) {
      setErro(err.message || 'Erro ao realizar login.');
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-600 via-orange-600 to-red-700 p-4">
      
      {/* Efeito decorativo de fundo simulando faíscas da fogueira */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_70%)] animate-pulse" />

      {/* Cartão de Login com efeito Vidro Fosco (Glassmorphism) */}
      <div className="z-10 w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-md">
        
        <div className="mb-6 text-center">
          <span className="text-4xl">🔥</span>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">ARRAIÁ DIGITAL</h1>
          <p className="text-sm text-amber-200">Painel de Vendas e Controle de Caixa</p>
        </div>

        <form onSubmit={handleEntrar} className="space-y-5">
          
          {/* Campo de E-mail */}
          <div>
            <label className="block text-sm font-medium text-white mb-1">E-mail Institucional</label>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="nome.sobrenome"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/20 px-4 py-3 text-lg text-white placeholder-white/50 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
              />
              <button
                type="button"
                onClick={handleAutocompletarEmail}
                className="self-start rounded-lg bg-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/40 transition-colors"
              >
                + @escola.pr.gov.br
              </button>
            </div>
          </div>

          {/* Campo do PIN */}
          <div>
            <label className="block text-sm font-medium text-white mb-1">PIN de Acesso</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} // Só aceita números
              className="w-full text-center tracking-widest rounded-xl border border-white/20 bg-white/20 px-4 py-3 text-2xl text-white placeholder-white/30 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
            />
          </div>

          {/* Alerta de Erro */}
          {erro && (
            <div className="rounded-xl bg-red-500/80 p-3 text-center text-sm font-medium text-white shadow-lg">
              ⚠️ {erro}
            </div>
          )}

          {/* Botão de Entrada */}
          <button
            type="submit"
            className="w-full transform rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-lg font-bold text-white shadow-lg transition-all active:scale-[0.98] hover:brightness-110"
          >
            Entrar no Arraiá
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/60">
          <span>v1.5.0 - Offline Ready</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            Escola Ativa
          </span>
        </div>

      </div>
    </div>
  );
}
