import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  DollarSign,
  QrCode,
  ArrowLeft,
  RefreshCw,
  Package,
  Layers,
  UserCheck,
  Settings,
  ChevronRight,
  CreditCard,
  MessageSquare,
  Send,
  AlertTriangle,
  Printer
} from 'lucide-react';
import { authLocalService } from '../services/authLocalService';
import type { UserSession } from '../services/authLocalService';
import { productRepository } from '../repository/productRepository';
import { saleRepository } from '../repository/saleRepository';
import type { LocalCaixaSession } from '../repository/saleRepository';
import { messageRepository } from '../repository/messageRepository';
import { db } from '../database/DatabaseConnection';
import type { Produto, Venda, ItemVenda } from '../database/DatabaseConnection';
import { syncEngine } from '../services/syncEngine';
import { apiClient } from '../services/apiClient';

export function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserSession | null>(null);
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'financas' | 'produtos' | 'vendas' | 'mensagens'>('financas');
  
  // Database data
  const [products, setProducts] = useState<Produto[]>([]);
  const [sales, setSales] = useState<Venda[]>([]);
  const [saleItemsMap, setSaleItemsMap] = useState<Record<string, ItemVenda[]>>({});
  const [caixaSessions, setCaixaSessions] = useState<LocalCaixaSession[]>([]);
  const [activeSession, setActiveSession] = useState<LocalCaixaSession | undefined>(undefined);
  
  // Sync Status
  const [syncStatus, setSyncStatus] = useState({ online: false, syncing: false, pendingCount: 0 });
  
  // Product Edit Modal state
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);
  
  const [globalPixModalOpen, setGlobalPixModalOpen] = useState(false);
  const [globalPixConfig, setGlobalPixConfig] = useState({ key: '', name: '', city: '' });
  
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCategory, setProdCategory] = useState<'COMIDAS' | 'BEBIDAS' | 'DOCES' | 'JOGOS'>('COMIDAS');
  const [prodAtivo, setProdAtivo] = useState(1);

  // Messages state
  const [msgDestinatario, setMsgDestinatario] = useState<string>('GERAL');
  const [msgConteudo, setMsgConteudo] = useState<string>('');

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgConteudo.trim()) return;
    
    try {
      if (msgDestinatario === 'GERAL') {
        await messageRepository.enviarMensagemGeral(user?.nome || 'Coordenação', msgConteudo);
      } else {
        await messageRepository.enviarMensagemIndividual(user?.nome || 'Coordenação', msgDestinatario, msgConteudo);
      }
      alert('Mensagem enviada com sucesso para ' + (msgDestinatario === 'GERAL' ? 'todos os caixas!' : msgDestinatario));
      setMsgConteudo('');
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar mensagem.');
    }
  };

  const handleResetSystem = async () => {
    if (user?.role !== 'SUPER_ADMIN') {
      alert('Apenas administradores supremos (SUPER_ADMIN) podem resetar o sistema.');
      return;
    }
    
    const confirmacao = window.confirm(
      '⚠️ ATENÇÃO EXTREMA: Você está prestes a APAGAR DEFINITIVAMENTE todas as Vendas, Sessões de Caixa e Mensagens deste tablet e do Servidor na Nuvem.\n\nProdutos e Usuários serão preservados.\n\nDeseja limpar os dados de teste e iniciar o modo oficial?'
    );
    
    if (!confirmacao) return;

    try {
      setSyncStatus(prev => ({ ...prev, syncing: true }));
      
      // 1. Limpa na nuvem (removido o /api extra porque o apiClient já o embute)
      await apiClient.post('/reset-test-data');
      
      // 2. Limpa no banco local (Dexie)
      await db.vendas.clear();
      await db.sessoes_caixa.clear();
      await db.mensagens.clear();
      
      alert('✅ Limpeza concluída com sucesso! O sistema foi zerado para o modo oficial.');
      window.location.reload();
    } catch (e: any) {
      console.error(e);
      alert('Erro ao limpar os dados: ' + (e.response?.data?.error || e.message));
    } finally {
      setSyncStatus(prev => ({ ...prev, syncing: false }));
    }
  };

  useEffect(() => {
    // Apenas admins ou super_admins podem acessar
    const currentUser = authLocalService.getCurrentUser();
    if (!currentUser || !authLocalService.checkRole('ADMIN_OPERACIONAL')) {
      navigate('/pdv');
      return;
    }
    setUser(currentUser);

    loadData();
    apiClient.get('/settings/pix').then(res => setGlobalPixConfig(res.data)).catch(() => {});

    const unsubscribe = syncEngine.subscribe((status) => {
      setSyncStatus((prev) => {
        // Se acabou de sincronizar com sucesso, recarrega a tela na hora
        if (prev.syncing && !status.syncing && !status.error) {
          loadData();
        }
        return status;
      });
    });

    // Auto-refresh: A cada 10 segundos recarrega o que tem no banco local (IndexedDB)
    // E a cada 20 segundos força uma puxada na nuvem
    const refreshInterval = setInterval(() => {
      loadData();
    }, 10000);

    const syncInterval = setInterval(() => {
      if (syncEngine.online) {
        syncEngine.syncNow();
      }
    }, 20000);

    return () => {
      unsubscribe();
      clearInterval(refreshInterval);
      clearInterval(syncInterval);
    };
  }, [navigate]);

  const loadData = async () => {
    try {
      const allProducts = await productRepository.getAllProducts();
      setProducts(allProducts);

      // Tenta buscar vendas da Nuvem Global primeiro
      let allSales: any[] = [];
      let allItems: any[] = [];
      const userStr = localStorage.getItem('user_session');
      const userObj = userStr ? JSON.parse(userStr) : null;
      
      try {
        const API_URL = import.meta.env.VITE_API_URL || window.location.origin + '/api';
        const res = await fetch(`${API_URL}/sync/sales`, {
          headers: {
            'Authorization': `Bearer ${userObj?.pin_acesso}`
          }
        });
        
        if (res.ok) {
          const cloudSales = await res.json();
          // Converte do formato Cloud para o formato Local esperado na tabela
          allSales = cloudSales.map((cs: any) => ({
            id: cs.id,
            device_id: cs.device_id,
            valor_total: cs.valor_total,
            metodo_pagamento: cs.metodo_pagamento,
            codigo_pix_utilizado: cs.codigo_pix_utilizado,
            valor_pago: cs.valor_pago,
            troco: cs.troco,
            criado_em: cs.criado_em,
            status_sync: 'synced'
          }));
          
          for (const cs of cloudSales) {
            if (cs.items) {
              for (const ci of cs.items) {
                allItems.push({
                  id: ci.id,
                  venda_id: cs.id,
                  produto_id: ci.produto_id,
                  quantidade: ci.quantidade,
                  preco_unitario: ci.preco_unitario
                });
              }
            }
          }
        } else {
          throw new Error('Falha na nuvem');
        }
      } catch (err) {
        // Fallback para disco local em caso de erro
        console.warn("Lendo vendas do disco local como fallback...", err);
        allSales = await saleRepository.getAllSales();
        allItems = await db.itens_venda.toArray();
      }

      // Ordena por data decrescente (mais recente primeiro)
      allSales.sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
      setSales(allSales);

      // Carrega itens de venda e agrupa por venda_id
      const itemsMap: Record<string, ItemVenda[]> = {};
      for (const item of allItems) {
        if (!itemsMap[item.venda_id]) {
          itemsMap[item.venda_id] = [];
        }
        itemsMap[item.venda_id].push(item);
      }
      setSaleItemsMap(itemsMap);

      // Caixa
      const active = await saleRepository.getActiveCaixaSession();
      setActiveSession(active);

      // Puxa do banco local Dexie que agora é populado com as sessões da Nuvem
      const allSessions = await db.sessoes_caixa.toArray();
      // Filtra para remover a sessão ativa atual deste próprio dispositivo, pois ela já é mostrada na parte de cima
      const past = allSessions.filter(s => active ? s.id !== active.id : true);
      
      // Ordena por data decrescente (mais recente primeiro)
      past.sort((a, b) => b.timestampAbertura - a.timestampAbertura);
      
      setCaixaSessions(past);
    } catch (err) {
      console.error('Erro ao carregar dados do admin:', err);
    }
  };

  // Estatísticas financeiras gerais
  const totalDinheiro = sales
    .filter((s) => s.metodo_pagamento === 'DINHEIRO')
    .reduce((acc, s) => acc + s.valor_total, 0);

  const totalPix = sales
    .filter((s) => s.metodo_pagamento === 'PIX_LOCAL')
    .reduce((acc, s) => acc + s.valor_total, 0);

  const totalCartao = sales
    .filter((s) => s.metodo_pagamento === 'CARTAO')
    .reduce((acc, s) => acc + s.valor_total, 0);

  const totalFaturamento = totalDinheiro + totalPix + totalCartao;

  // Estatísticas do caixa atual
  const totalCaixaAtual = activeSession
    ? sales
        .filter((s) => new Date(s.criado_em).getTime() >= activeSession.timestampAbertura)
        .reduce((acc, s) => acc + s.valor_total, 0)
    : 0;

  const totalDinheiroCaixaAtual = activeSession
    ? sales
        .filter((s) => new Date(s.criado_em).getTime() >= activeSession.timestampAbertura && s.metodo_pagamento === 'DINHEIRO')
        .reduce((acc, s) => acc + s.valor_total, 0)
    : 0;

  const totalPixCaixaAtual = activeSession
    ? sales
        .filter((s) => new Date(s.criado_em).getTime() >= activeSession.timestampAbertura && s.metodo_pagamento === 'PIX_LOCAL')
        .reduce((acc, s) => acc + s.valor_total, 0)
    : 0;

  const totalCartaoCaixaAtual = activeSession
    ? sales
        .filter((s) => new Date(s.criado_em).getTime() >= activeSession.timestampAbertura && s.metodo_pagamento === 'CARTAO')
        .reduce((acc, s) => acc + s.valor_total, 0)
    : 0;

  const totalSangriasCaixaAtual = activeSession
    ? (activeSession.sangrias || []).reduce((acc, s) => acc + s.valor, 0)
    : 0;

  const totalSuprimentosCaixaAtual = activeSession
    ? (activeSession.suprimentos || []).reduce((acc, s) => acc + s.valor, 0)
    : 0;

  const dinheiroEstimadoCaixaAtual = activeSession
    ? activeSession.valorAbertura + totalDinheiroCaixaAtual + totalSuprimentosCaixaAtual - totalSangriasCaixaAtual
    : 0;

  // Editar Produto
  const handleEditProductClick = (product: Produto) => {
    setEditingProduct(product);
    setProdName(product.nome);
    setProdPrice(product.preco.toString());
    setProdCategory(product.categoria as any);
    setProdAtivo(product.ativo);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const parsedPrice = parseFloat(prodPrice.replace(',', '.'));
    if (isNaN(parsedPrice)) {
      alert('Valor de preço inválido!');
      return;
    }

    try {
      const updated: Produto = {
        ...editingProduct,
        nome: prodName,
        preco: parsedPrice,
        categoria: prodCategory,
        ativo: prodAtivo,
      };

      await productRepository.saveProduct(updated);
      setEditingProduct(null);
      await loadData();

      // Dispara a sincronização imediatamente para Nuvem
      syncEngine.syncNow().catch(() => {});
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar produto.');
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 text-white select-none">
      
      {/* HEADER DO DASHBOARD */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4 shadow-md">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/pdv')}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Painel do Gerente
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold">
                Admin
              </span>
            </h1>
            <p className="text-xs text-slate-400">Relatórios, Caixa e Estoque</p>
          </div>
        </div>

        {/* CONTROLE DE SYNC */}
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              await syncEngine.syncNow();
              await loadData();
            }}
            disabled={syncStatus.syncing || !syncStatus.online}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              syncStatus.online
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <RefreshCw size={14} className={syncStatus.syncing ? 'animate-spin' : ''} />
            <span>{syncStatus.syncing ? 'Sincronizando...' : 'Sincronizar Vendas'}</span>
          </button>

          {user?.role === 'SUPER_ADMIN' && (
            <button
              onClick={() => navigate('/super-admin')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-all cursor-pointer"
            >
              <Settings size={14} />
              <span>TI Whitelist</span>
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-all cursor-pointer print-hidden"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Imprimir Relatório</span>
          </button>
        </div>
      </header>

      {/* ÁREA CENTRAL */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* MENU LATERAL */}
        <nav className="w-64 border-r border-slate-800 bg-slate-950 p-4 space-y-2">
          <button
            onClick={() => setActiveTab('financas')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'financas'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <TrendingUp size={16} /> Financeiro e Caixa
            </span>
            <ChevronRight size={14} />
          </button>

          <button
            onClick={() => setActiveTab('produtos')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'produtos'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Package size={16} /> Produtos e Preços
            </span>
            <ChevronRight size={14} />
          </button>

          <button
            onClick={() => setActiveTab('vendas')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'vendas'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Layers size={16} /> Histórico de Vendas
            </span>
            <ChevronRight size={14} />
          </button>

          <button
            onClick={() => setActiveTab('mensagens')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'mensagens'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <MessageSquare size={16} /> Avisos e Mensagens
            </span>
            <ChevronRight size={14} />
          </button>
        </nav>

        {/* CONTEÚDO PRINCIPAL */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-900 bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.5)_0%,transparent_10%)]">
          
          {/* TAB 1: FINANÇAS & CAIXA */}
          {activeTab === 'financas' && (
            <div className="space-y-6">
              
              {/* HEADER DE FINANCAS COM BOTAO PIX */}
              <div className="flex justify-between items-center print-hidden bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div>
                  <h3 className="text-sm font-bold text-white">Chave Pix Global</h3>
                  <p className="text-[11px] text-slate-400">Essa configuração será distribuída para todos os Tablets do evento automaticamente.</p>
                </div>
                <button
                  onClick={() => setGlobalPixModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all cursor-pointer shadow-lg flex items-center gap-2"
                >
                  <span>⚙️</span> Editar Pix Global
                </button>
              </div>

              {/* CARDS COM METRICAS */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                  <p className="text-xs font-bold text-slate-400">FATURAMENTO TOTAL</p>
                  <h3 className="text-3xl font-black text-white mt-2">R$ {totalFaturamento.toFixed(2)}</h3>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>Soma Dinheiro + Pix + Cartão</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                  <p className="text-xs font-bold text-slate-400">RECEBIDO EM DINHEIRO</p>
                  <h3 className="text-3xl font-black text-emerald-400 mt-2">R$ {totalDinheiro.toFixed(2)}</h3>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-2">
                    <DollarSign size={12} className="text-emerald-400" />
                    <span>Dinheiro em Espécie</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                  <p className="text-xs font-bold text-slate-400">RECEBIDO EM PIX</p>
                  <h3 className="text-3xl font-black text-cyan-400 mt-2">R$ {totalPix.toFixed(2)}</h3>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-2">
                    <QrCode size={12} className="text-cyan-400" />
                    <span>Qr Code Dinâmico</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                  <p className="text-xs font-bold text-slate-400">RECEBIDO EM CARTÃO</p>
                  <h3 className="text-3xl font-black text-purple-400 mt-2">R$ {totalCartao.toFixed(2)}</h3>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-2">
                    <CreditCard size={12} className="text-purple-400" />
                    <span>Crédito ou Débito</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                  <p className="text-xs font-bold text-slate-400">SYNC PENDENTE</p>
                  <h3 className={`text-3xl font-black mt-2 ${syncStatus.pendingCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {syncStatus.pendingCount} vendas
                  </h3>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-2">
                    <span>Aguardando rede para nuvem</span>
                  </div>
                </div>
              </div>

              {/* CARD DETALHADO DO CAIXA ATUAL */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <h3 className="text-lg font-black text-white mb-4">Sessão de Caixa Ativa</h3>
                {activeSession ? (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400">OPERADOR</p>
                      <p className="text-base font-bold text-white flex items-center gap-1.5">
                        <UserCheck size={16} className="text-amber-500" /> {activeSession.operadorEmail.split('@')[0]}
                      </p>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400">FUNDO DE ABERTURA</p>
                      <p className="text-base font-bold text-white">R$ {activeSession.valorAbertura.toFixed(2)}</p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400">REFORÇOS (SUPRIMENTOS)</p>
                      <p className="text-base font-bold text-emerald-400">
                        R$ {((activeSession.suprimentos || []).reduce((acc, s) => acc + s.valor, 0)).toFixed(2)}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400">RETIRADAS (SANGRIAS)</p>
                      <p className="text-base font-bold text-rose-400">
                        R$ {((activeSession.sangrias || []).reduce((acc, s) => acc + s.valor, 0)).toFixed(2)}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400">VENDAS TOTAIS NO TURNO</p>
                      <p className="text-lg font-black text-amber-500">R$ {totalCaixaAtual.toFixed(2)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-center text-slate-400">
                    Nenhum caixa aberto neste dispositivo. Vá para a tela de vendas para abrir o caixa.
                  </div>
                )}
              </div>

              {/* HISTÓRICO DE SESSÕES ANTERIORES */}
              <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800">
                  <h3 className="text-base font-black">Histórico de Fechamento de Caixa</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400 text-xs font-bold uppercase border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-3">Abertura / Operador</th>
                        <th className="px-6 py-3">Fundo Inicial</th>
                        <th className="px-6 py-3">Movimentações (Reforço/Retirada)</th>
                        <th className="px-6 py-3">Faturamento Dinheiro / Pix</th>
                        <th className="px-6 py-3">Acerto (Contado vs Estimado)</th>
                        <th className="px-6 py-3">Status / Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {activeSession && (
                        <tr className="hover:bg-slate-900/30 text-xs">
                          <td className="px-6 py-4">
                            <span className="font-semibold text-white block">{new Date(activeSession.timestampAbertura).toLocaleString()}</span>
                            <span className="text-[10px] text-slate-400">{activeSession.operadorEmail}</span>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold">R$ {activeSession.valorAbertura.toFixed(2)}</td>
                          <td className="px-6 py-4 font-mono text-xs">
                            <span className="text-emerald-400 block font-semibold">
                              📥 +R$ {((activeSession.suprimentos || []).reduce((acc, s) => acc + s.valor, 0)).toFixed(2)}
                            </span>
                            <span className="text-rose-400 block font-semibold">
                              💸 -R$ {((activeSession.sangrias || []).reduce((acc, s) => acc + s.valor, 0)).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono">
                            <span className="text-emerald-400 block font-semibold">💸 Din: R$ {totalDinheiroCaixaAtual.toFixed(2)}</span>
                            <span className="text-cyan-400 block font-semibold">⚡ Pix: R$ {totalPixCaixaAtual.toFixed(2)}</span>
                            <span className="text-purple-400 block font-semibold">💳 Car: R$ {totalCartaoCaixaAtual.toFixed(2)}</span>
                          </td>
                          <td className="px-6 py-4 font-mono">
                            <span className="block text-[10px] text-slate-500">Estimado: R$ {dinheiroEstimadoCaixaAtual.toFixed(2)}</span>
                            <span className="block text-[9px] text-amber-500 font-semibold italic">Aguardando contagem...</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 block w-fit mb-1.5">
                              ABERTO / NESTE TABLET
                            </span>
                          </td>
                        </tr>
                      )}
                      {caixaSessions.map((session, index) => {
                        const totalS = (session.sangrias || []).reduce((acc, s) => acc + s.valor, 0);
                        const totalSup = (session.suprimentos || []).reduce((acc, s) => acc + s.valor, 0);
                        const isForSession = (s: Venda) => {
                          const time = new Date(s.criado_em).getTime();
                          const afterOpen = time >= session.timestampAbertura;
                          const beforeClose = !session.timestampFechamento || time <= session.timestampFechamento;
                          const isSameOperator = s.device_id === session.operadorEmail || s.device_id === 'device-local-tablet';
                          return afterOpen && beforeClose && isSameOperator;
                        };

                        const vDin = sales.filter(s => isForSession(s) && s.metodo_pagamento === 'DINHEIRO').reduce((acc, s) => acc + s.valor_total, 0);
                        const vPix = sales.filter(s => isForSession(s) && s.metodo_pagamento === 'PIX_LOCAL').reduce((acc, s) => acc + s.valor_total, 0);
                        const vCar = sales.filter(s => isForSession(s) && s.metodo_pagamento === 'CARTAO').reduce((acc, s) => acc + s.valor_total, 0);

                        const est = session.valorAbertura + vDin + totalSup - totalS;
                        return (
                          <tr key={index} className="hover:bg-slate-900/30 text-xs">
                            <td className="px-6 py-4">
                              <span className="font-semibold text-white block">
                                {new Date(session.timestampAbertura).toLocaleString()}
                                {session.timestampFechamento && (
                                  <span className="block text-[9px] text-slate-500 font-normal">
                                    Fechamento: {new Date(session.timestampFechamento).toLocaleString()}
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] text-slate-400">{session.operadorEmail}</span>
                            </td>
                            <td className="px-6 py-4 font-mono">R$ {session.valorAbertura.toFixed(2)}</td>
                            <td className="px-6 py-4 font-mono text-xs">
                              <span className="text-emerald-400 block font-semibold" title={`${session.suprimentos?.length || 0} reforços`}>
                                📥 +R$ {totalSup.toFixed(2)}
                              </span>
                              <span className="text-rose-400 block font-semibold" title={`${session.sangrias?.length || 0} retiradas`}>
                                💸 -R$ {totalS.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono">
                              <span className="text-emerald-400 block font-semibold">💸 Din: R$ {vDin.toFixed(2)}</span>
                              <span className="text-cyan-400 block font-semibold">⚡ Pix: R$ {vPix.toFixed(2)}</span>
                              <span className="text-purple-400 block font-semibold">💳 Car: R$ {vCar.toFixed(2)}</span>
                            </td>
                            <td className="px-6 py-4">
                              {session.valorFechamento != null ? (
                                <div className="space-y-0.5 font-mono">
                                  <span className="block font-semibold">Contado: R$ {session.valorFechamento.toFixed(2)}</span>
                                  <span className="block text-[10px] text-slate-500">Estimado: R$ {est.toFixed(2)}</span>
                                  {session.diferenca != null && (
                                    <span className={`block text-[10px] font-bold ${
                                      session.diferenca === 0 
                                        ? 'text-emerald-400' 
                                        : session.diferenca > 0 
                                        ? 'text-amber-400' 
                                        : 'text-rose-400'
                                    }`}>
                                      {session.diferenca === 0 
                                        ? 'Sem divergência 🤠' 
                                        : session.diferenca > 0 
                                        ? `Sobra: +R$ ${session.diferenca.toFixed(2)}` 
                                        : `Divergência: R$ ${session.diferenca.toFixed(2)} ⚠️`}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-6 py-4 max-w-xs">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold block w-fit mb-1.5 ${session.status === 'aberto' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                                {session.status === 'aberto' ? 'ABERTO EM OUTRO CAIXA' : 'FECHADO'}
                              </span>
                              <span className="text-[10px] text-slate-400 leading-snug block italic line-clamp-2" title={session.observacoes}>
                                {session.observacoes}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: PRODUTOS */}
          {activeTab === 'produtos' && (
            <div className="space-y-6">
              
              <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-base font-black flex items-center gap-2">
                    <Package size={18} className="text-amber-500" /> Tabela de Preços e Ativação de Produtos
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400 text-xs font-bold uppercase border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-3">Produto</th>
                        <th className="px-6 py-3">Categoria</th>
                        <th className="px-6 py-3">Preço Unitário</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {products.map((prod) => (
                        <tr key={prod.id} className="hover:bg-slate-900/30">
                          <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                            <span className={`w-3.5 h-3.5 rounded-full border border-white/10 ${prod.cor_ficha.split(' ')[0]}`} />
                            {prod.nome}
                          </td>
                          <td className="px-6 py-4 text-xs font-bold uppercase text-slate-400">{prod.categoria}</td>
                          <td className="px-6 py-4 font-mono font-bold text-amber-500">R$ {prod.preco.toFixed(2)}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                              prod.ativo === 1 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}>
                              {prod.ativo === 1 ? 'ATIVO' : 'DESATIVADO'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => handleEditProductClick(prod)}
                              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-all cursor-pointer"
                            >
                              Editar Produto
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: VENDAS */}
          {activeTab === 'vendas' && (
            <div className="space-y-6">
              
              <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
                <div className="px-6 py-4 border-b border-slate-800">
                  <h3 className="text-base font-black">Histórico Geral de Fichas Emitidas</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400 text-xs font-bold uppercase border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-3">Código/Hora</th>
                        <th className="px-6 py-3">Itens Vendidos</th>
                        <th className="px-6 py-3">Faturamento</th>
                        <th className="px-6 py-3">Forma PGTO</th>
                        <th className="px-6 py-3">Dispositivo</th>
                        <th className="px-6 py-3">Sincronizado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {sales.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-slate-500 font-bold">
                            Nenhuma venda registrada ainda, compadre!
                          </td>
                        </tr>
                      ) : (
                        sales.map((sale) => {
                          const items = saleItemsMap[sale.id] || [];
                          return (
                            <tr key={sale.id} className="hover:bg-slate-900/30">
                              <td className="px-6 py-4 font-mono text-xs">
                                <span className="font-bold text-white">#{sale.id.substring(0, 8)}...</span>
                                <span className="block text-[10px] text-slate-500">
                                  {new Date(sale.criado_em).toLocaleTimeString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-xs max-w-xs">
                                <ul className="space-y-0.5">
                                  {items.map((it) => {
                                    const prodName = products.find(p => p.id === it.produto_id)?.nome || 'Produto Indefinido';
                                    return (
                                      <li key={it.id} className="truncate text-slate-300 font-medium">
                                        <span className="font-bold text-amber-500">{it.quantidade}x</span> {prodName}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-bold text-white">R$ {sale.valor_total.toFixed(2)}</span>
                                {sale.valor_pago != null && sale.valor_pago > sale.valor_total && (
                                  <span className="block text-[10px] text-slate-400 mt-0.5 leading-tight">
                                    Pago: R$ {sale.valor_pago.toFixed(2)}<br/>
                                    Troco: R$ {sale.troco?.toFixed(2)}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                                  sale.metodo_pagamento === 'DINHEIRO' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                    : sale.metodo_pagamento === 'PIX_LOCAL'
                                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {sale.metodo_pagamento}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-xs text-slate-400">{sale.device_id}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  sale.status_sync === 'synced' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400 animate-pulse'
                                }`}>
                                  {sale.status_sync === 'synced' ? 'SIM' : 'PENDENTE'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: MENSAGENS */}
          {activeTab === 'mensagens' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-slate-950 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-xl max-w-2xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl">
                    <MessageSquare size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white">Central de Avisos</h2>
                    <p className="text-sm text-slate-400">Envie avisos gerais ou diretos para os operadores de caixa.</p>
                  </div>
                </div>

                <form onSubmit={handleSendMessage} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-2">Para quem?</label>
                    <select 
                      value={msgDestinatario}
                      onChange={(e) => setMsgDestinatario(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3.5 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                    >
                      <option value="GERAL">📣 TODOS OS CAIXAS (Aviso Geral)</option>
                      <option value="willians">👤 Willians (willians)</option>
                      <option value="vendedor1">👤 Vendedor 1 (vendedor1)</option>
                      <option value="caixa2">👤 Caixa 2 (caixa2)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-2">Mensagem</label>
                    <textarea 
                      value={msgConteudo}
                      onChange={(e) => setMsgConteudo(e.target.value)}
                      placeholder="Escreva seu aviso aqui (ex: 'Fichas de pipoca acabaram')..."
                      className="w-full h-36 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3.5 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
                      required
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    className="flex items-center justify-center gap-2 w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/20 cursor-pointer"
                  >
                    <Send size={18} /> Enviar Mensagem
                  </button>
                </form>
              </div>

              {/* ZONA DE PERIGO (RESET) */}
              <div className="mt-16 pt-8 border-t border-rose-500/20 max-w-2xl">
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4 text-left">
                    <div className="p-3 bg-rose-500/20 text-rose-500 rounded-2xl shadow-[0_0_15px_rgba(244,63,94,0.3)]">
                      <AlertTriangle size={28} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-rose-500">Zona de Perigo</h3>
                      <p className="text-sm text-rose-400/80">Apaga todas as vendas de teste do Servidor e deste Tablet.</p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleResetSystem}
                    disabled={syncStatus.syncing}
                    className="w-full md:w-auto px-6 py-3 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-500 active:scale-95 transition-all shadow-lg shadow-rose-900/50 flex-shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {syncStatus.syncing ? 'Limpando...' : 'Zerar Sistema'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* MODAL DE EDICAO DE PRODUTO */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleSaveProduct} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-scale-up">
            
            <h3 className="text-lg font-black text-white mb-4">Editar Configurações do Produto</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Nome do Produto</label>
                <input
                  type="text"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Preço (R$)</label>
                  <input
                    type="text"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Ativo no PDV</label>
                  <select
                    value={prodAtivo}
                    onChange={(e) => setProdAtivo(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value={1}>Sim (Ativo)</option>
                    <option value={0}>Não (Desativado)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Categoria</label>
                <select
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="COMIDAS">Comidas (🌽)</option>
                  <option value="BEBIDAS">Bebidas (🥤)</option>
                  <option value="DOCES">Doces (🍭)</option>
                  <option value="JOGOS">Brincadeiras/Fichas (🎣)</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 text-sm font-bold transition-all cursor-pointer shadow-lg"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL CONFIG PIX GERAL */}
      {globalPixModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-scale-up text-left">
            <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
              <span>🌍</span> Configurar Pix Global
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Chave Pix (CPF, CNPJ, Celular ou Email)</label>
                <input
                  type="text"
                  value={globalPixConfig.key}
                  onChange={e => setGlobalPixConfig({...globalPixConfig, key: e.target.value.trim()})}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Nome do Recebedor (Sem acentos)</label>
                <input
                  type="text"
                  value={globalPixConfig.name}
                  onChange={e => setGlobalPixConfig({...globalPixConfig, name: e.target.value.toUpperCase()})}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Cidade</label>
                <input
                  type="text"
                  value={globalPixConfig.city}
                  onChange={e => setGlobalPixConfig({...globalPixConfig, city: e.target.value.toUpperCase()})}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setGlobalPixModalOpen(false)}
                className="py-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    await apiClient.post('/settings/pix', globalPixConfig);
                    setGlobalPixModalOpen(false);
                    alert('Pix Global Salvo com sucesso! Quando os caixas abrirem, eles pegarão essa configuração automaticamente da nuvem.');
                  } catch(e) {
                    alert('Erro de Conexão. Verifique se o servidor principal está rodando.');
                  }
                }}
                className="py-3 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 text-sm font-bold transition-all cursor-pointer"
              >
                Salvar p/ Todos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
