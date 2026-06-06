import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 select-none">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500"></div>
            <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
              <span className="text-4xl">🔥</span>
            </div>
            <h1 className="text-2xl font-black text-white mb-2">Eita, o arraiá tropeçou!</h1>
            <p className="text-slate-400 text-sm mb-6">
              Aconteceu um erro inesperado na tela. Fique tranquilo, suas vendas salvas no banco não foram perdidas.
            </p>
            
            <div className="bg-slate-950 rounded-xl p-4 mb-8 text-left border border-slate-800 overflow-x-auto">
              <p className="text-rose-400 font-mono text-[10px] whitespace-pre-wrap">
                {this.state.error?.toString()}
              </p>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 rounded-xl bg-amber-500 text-slate-950 font-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-900/20 active:scale-[0.98] cursor-pointer"
            >
              🔄 Tentar Novamente / Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
