import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Verifica se já está rodando como aplicativo instalado
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    // Detecta se é iPhone/iPad (iOS não permite instalação por botão, só pelo menu nativo)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isIosDevice) {
      setIsIOS(true);
      // Mostra o aviso para usuários de iOS a menos que eles já tenham dispensado antes
      const dismissed = localStorage.getItem('ios_install_dismissed');
      if (!dismissed) {
        setShowPrompt(true);
      }
    }

    // Escuta o gatilho oficial do Android/Chrome para instalar
    const handleBeforeInstallPrompt = (e: any) => {
      // Impede o banner feio padrão do Chrome de aparecer
      e.preventDefault();
      // Salva o evento para acionarmos depois no nosso botão bonitão
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Abre a tela de instalação nativa do Android
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    if (isIOS) {
      localStorage.setItem('ios_install_dismissed', 'true');
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-5 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col gap-3 relative">
        <button 
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
        >
          <X size={18} />
        </button>
        
        <div className="flex items-center gap-4 pr-6">
          <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
            <Download size={24} className="text-slate-950" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm">Instalar Arraiá Digital</h3>
            <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">Adicione o sistema à sua tela inicial para acesso super rápido e sem barra de navegação.</p>
          </div>
        </div>

        {isIOS ? (
          <div className="mt-3 bg-slate-950/80 rounded-xl p-3.5 border border-slate-800 text-xs text-slate-300 flex items-center justify-center gap-2.5 text-center">
            <span>Toque em</span>
            <Share size={16} className="text-blue-500" />
            <span>e depois</span>
            <span className="font-bold text-white bg-slate-800 px-2.5 py-1 rounded-md">Adicionar à Tela de Início</span>
          </div>
        ) : (
          <button 
            onClick={handleInstallClick}
            className="w-full mt-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-500/20"
          >
            Instalar Aplicativo Agora
          </button>
        )}
      </div>
    </div>
  );
}
