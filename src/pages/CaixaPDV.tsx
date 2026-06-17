import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wifi,
  WifiOff,
  LogOut,
  Settings,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  QrCode,
  User,
  Activity,
  ArrowRight,
  Store,

  CreditCard,
  Bell,
  BellRing,
  BellOff,
  MessageSquare,
  X,
  ChevronDown,
  Lock,
  Key,
  Send
} from 'lucide-react';
import { authLocalService } from '../services/authLocalService';
import type { UserSession } from '../services/authLocalService';
import { syncEngine } from '../services/syncEngine';
import { apiClient } from '../services/apiClient';
import { productRepository } from '../repository/productRepository';
import { saleRepository } from '../repository/saleRepository';
import type { LocalCaixaSession } from '../repository/saleRepository';
import { messageRepository } from '../repository/messageRepository';
import { userRepository, sha256 } from '../repository/userRepository';
import { db } from '../database/DatabaseConnection';
import type { Produto } from '../database/DatabaseConnection';
import { useLiveQuery } from 'dexie-react-hooks';
import { pixService } from '../services/pixService';

interface CartItem {
  product: Produto;
  quantity: number;
}

export function CaixaPDV() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserSession | null>(null);
  const [products, setProducts] = useState<Produto[]>([]);
  const [activeSession, setActiveSession] = useState<LocalCaixaSession | undefined>(undefined);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeTab, setActiveTab] = useState<'tudo' | 'comida' | 'bebida' | 'doce' | 'jogo'>('tudo');

  // Mensagens
  const mensagensLivres = useLiveQuery(
    () => db.mensagens
      .filter(m => m.tipo === 'GERAL' || m.destinatarioEmail === user?.email)
      .reverse()
      .sortBy('timestamp'),
    [user?.email]
  ) || [];
  const mensagensNaoLidas = mensagensLivres.filter(m => !m.lida);
  const [mensagensModalOpen, setMensagensModalOpen] = useState(false);
  const [novaMensagemAdmin, setNovaMensagemAdmin] = useState('');
  
  const handleSendMessageToAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagemAdmin.trim()) return;
    try {
      await messageRepository.enviarMensagemIndividual(
        user?.nome || 'Operador de Caixa', 
        'ADMIN', 
        novaMensagemAdmin
      );
      setNovaMensagemAdmin('');
      alert('Mensagem enviada com sucesso para a coordenação!');
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar mensagem.');
    }
  };

  // Estados de Abertura de Caixa
  const [openingBalance, setOpeningBalance] = useState<string>('');
  const [adminPin, setAdminPin] = useState('');
  const [adminPinClose, setAdminPinClose] = useState('');
  
  // Pagamento & Troco
  const [cashPaid, setCashPaid] = useState<string>('');
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pixCode, setPixCode] = useState('');
  const [pixQrDataUrl, setPixQrDataUrl] = useState('');
  const [cartaoModalOpen, setCartaoModalOpen] = useState(false);
  const [dinheiroModalOpen, setDinheiroModalOpen] = useState(false);
  const [vendaSucessoModalOpen, setVendaSucessoModalOpen] = useState(false);
  const [fechamentoSucessoModalOpen, setFechamentoSucessoModalOpen] = useState(false);
  const [ultimoRelatorioText, setUltimoRelatorioText] = useState('');
  const [ultimaVendaCart, setUltimaVendaCart] = useState<CartItem[]>([]);
  const [ultimaVendaMethod, setUltimaVendaMethod] = useState<string>('');

  // Sangria
  const [sangriaModalOpen, setSangriaModalOpen] = useState(false);
  const [sangriaValue, setSangriaValue] = useState('');
  const [sangriaReason, setSangriaReason] = useState('');

  // Suprimento
  const [suprimentoModalOpen, setSuprimentoModalOpen] = useState(false);
  const [suprimentoValue, setSuprimentoValue] = useState('');
  const [suprimentoReason, setSuprimentoReason] = useState('');

  // Fechamento de Caixa / Acerto Final
  const [closeCaixaModalOpen, setCloseCaixaModalOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [caixaStats, setCaixaStats] = useState({
    vendasDinheiro: 0,
    vendasPix: 0,
    vendasCartao: 0,
    totalSangrias: 0,
    totalSuprimentos: 0,
    dinheiroEstimado: 0
  });
  
  // Configurações da Escola (Pix)
  const [schoolPixKey, setSchoolPixKey] = useState(localStorage.getItem('pix_key') || '12345678000199');
  const [schoolPixName, setSchoolPixName] = useState(localStorage.getItem('pix_name') || 'APMF ESCOLA ESTADUAL');
  const [schoolPixCity, setSchoolPixCity] = useState(localStorage.getItem('pix_city') || 'CURITIBA');
  
  const [configPixModalOpen, setConfigPixModalOpen] = useState(false);
  const [pixConfigEdit, setPixConfigEdit] = useState({ key: '', name: '', city: '' });

  // Status de Sincronização
  const [syncStatus, setSyncStatus] = useState({ online: false, syncing: false, pendingCount: 0 });

  // Mensagens
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mobile Layout
  const [isCartOpenMobile, setIsCartOpenMobile] = useState(false);
  const [isTopAdminMenuOpen, setIsTopAdminMenuOpen] = useState(false);

  useEffect(() => {
    // Carrega usuário
    const currentUser = authLocalService.getCurrentUser();
    if (!currentUser) {
      navigate('/');
      return;
    }
    setUser(currentUser);

    // Puxa PIX Global da API (Nuvem)
    apiClient.get('/settings/pix').then((res: any) => {
      if (res.data && res.data.key) {
        setSchoolPixKey(res.data.key);
        setSchoolPixName(res.data.name);
        setSchoolPixCity(res.data.city);
        localStorage.setItem('pix_key', res.data.key);
        localStorage.setItem('pix_name', res.data.name);
        localStorage.setItem('pix_city', res.data.city);
      }
    }).catch(() => {});

    // Carrega produtos
    loadInitialData();

    // Inscreve no Sync Engine
    const unsubscribe = syncEngine.subscribe((status) => {
      setSyncStatus(status);
    });

    // Inicia auto-sincronização a cada 15 segundos se estiver online
    syncEngine.startAutoSync(15000);

    return () => {
      unsubscribe();
      syncEngine.stopAutoSync();
    };
  }, [navigate]);

  const loadInitialData = async () => {
    try {
      setError('');
      // Carrega produtos
      const loadedProducts = await productRepository.getAllProducts();
      setProducts(loadedProducts);

      // Carrega sessão ativa do caixa
      const session = await saleRepository.getActiveCaixaSession();
      setActiveSession(session);
    } catch (err: any) {
      setError('Erro ao carregar dados locais.');
      console.error(err);
    }
  };

  const handleAbrirCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedBalance = parseFloat(openingBalance.replace(',', '.'));
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      setError('Informe um valor de abertura válido, sô!');
      return;
    }

    if (!adminPin) {
      setError('A assinatura (PIN) do Gerente é obrigatória para abrir o caixa!');
      return;
    }

    if (!user) return;

    try {
      const pinHash = await sha256(adminPin);
      const allUsers = await userRepository.getAllUsers();
      const adminAuth = allUsers.find(u => 
        (u.nivel_acesso === 'SUPER_ADMIN' || u.nivel_acesso === 'ADMIN_OPERACIONAL') && 
        u.pin_acesso === pinHash
      );

      if (!adminAuth) {
        setError('PIN inválido ou usuário sem permissão de Gerência!');
        return;
      }

      await saleRepository.openCaixa(user.email, parsedBalance);
      await loadInitialData();
      setOpeningBalance('');
      setAdminPin('');
    } catch (err: any) {
      setError(err.message || 'Erro ao abrir caixa.');
    }
  };

  const loadCaixaStats = async () => {
    if (!activeSession) return;
    try {
      const salesList = await saleRepository.getAllSales();
      const sessionSales = salesList.filter(
        (s) => new Date(s.criado_em).getTime() >= activeSession.timestampAbertura
      );

      const vDinheiro = sessionSales
        .filter((s) => s.metodo_pagamento === 'DINHEIRO')
        .reduce((acc, s) => acc + s.valor_total, 0);

      const vPix = sessionSales
        .filter((s) => s.metodo_pagamento === 'PIX_LOCAL')
        .reduce((acc, s) => acc + s.valor_total, 0);

      const vCartao = sessionSales
        .filter((s) => s.metodo_pagamento === 'CARTAO')
        .reduce((acc, s) => acc + s.valor_total, 0);

      const tSangrias = (activeSession.sangrias || [])
        .reduce((acc, s) => acc + s.valor, 0);

      const tSuprimentos = (activeSession.suprimentos || [])
        .reduce((acc, s) => acc + s.valor, 0);

      const dEstimado = activeSession.valorAbertura + vDinheiro + tSuprimentos - tSangrias;

      setCaixaStats({
        vendasDinheiro: vDinheiro,
        vendasPix: vPix,
        vendasCartao: vCartao,
        totalSangrias: tSangrias,
        totalSuprimentos: tSuprimentos,
        dinheiroEstimado: dEstimado
      });
    } catch (err) {
      console.error('Erro ao carregar estatísticas do caixa:', err);
    }
  };

  const handleOpenFecharCaixaModal = async () => {
    setError('');
    setCountedCash('');
    setCloseNotes('');
    setAdminPinClose('');
    await loadCaixaStats();
    setCloseCaixaModalOpen(true);
  };

  const handleConfirmarFecharCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedContado = parseFloat(countedCash.replace(',', '.'));
    if (isNaN(parsedContado) || parsedContado < 0) {
      setError('Informe o valor físico contado em dinheiro, sô!');
      return;
    }

    if (!adminPinClose) {
      setError('A assinatura (PIN) do Gerente é obrigatória para fechar o caixa!');
      return;
    }

    try {
      const pinHash = await sha256(adminPinClose);
      const allUsers = await userRepository.getAllUsers();
      const adminAuth = allUsers.find(u => 
        (u.nivel_acesso === 'SUPER_ADMIN' || u.nivel_acesso === 'ADMIN_OPERACIONAL') && 
        u.pin_acesso === pinHash
      );

      if (!adminAuth) {
        setError('PIN inválido ou usuário sem permissão de Gerência!');
        return;
      }

      const salesList = await saleRepository.getAllSales();
      const sessionSales = salesList.filter(
        (s) => new Date(s.criado_em).getTime() >= (activeSession?.timestampAbertura || 0)
      );

      const vDinheiro = sessionSales
        .filter((s) => s.metodo_pagamento === 'DINHEIRO')
        .reduce((acc, s) => acc + s.valor_total, 0);

      const vPix = sessionSales
        .filter((s) => s.metodo_pagamento === 'PIX_LOCAL')
        .reduce((acc, s) => acc + s.valor_total, 0);

      const vCartao = sessionSales
        .filter((s) => s.metodo_pagamento === 'CARTAO')
        .reduce((acc, s) => acc + s.valor_total, 0);

      const tSangrias = (activeSession?.sangrias || [])
        .reduce((acc, s) => acc + s.valor, 0);

      const tSuprimentos = (activeSession?.suprimentos || [])
        .reduce((acc, s) => acc + s.valor, 0);

      const dEstimado = (activeSession?.valorAbertura || 0) + vDinheiro + tSuprimentos - tSangrias;
      const dif = parsedContado - dEstimado;

      let msgFechamento = closeNotes.trim();
      if (!msgFechamento) {
        msgFechamento = `Caixa fechado. Contado: R$ ${parsedContado.toFixed(2)} (Estimado: R$ ${dEstimado.toFixed(2)}). Divergência: R$ ${dif.toFixed(2)}.`;
      }

      await saleRepository.closeCaixa(
        parsedContado,
        msgFechamento,
        vDinheiro,
        vPix,
        activeSession?.sangrias || [],
        parsedContado,
        dif,
        activeSession?.suprimentos || [],
        vCartao
      );

      // GERAR RELATORIO DE BACKUP DE SEGURANCA
      let reportText = `===========================================
RELATORIO DE FECHAMENTO DE CAIXA (BACKUP DE SEGURANCA)
===========================================
Operador: ${activeSession?.operadorEmail || 'Desconhecido'}
Data de Abertura: ${new Date(activeSession?.timestampAbertura || Date.now()).toLocaleString()}
Data de Fechamento: ${new Date().toLocaleString()}
-------------------------------------------
1. RESUMO FINANCEIRO ESTIMADO (SISTEMA)
Valor de Abertura: R$ ${(activeSession?.valorAbertura || 0).toFixed(2)}
Vendas em Dinheiro: R$ ${vDinheiro.toFixed(2)}
Vendas em Pix: R$ ${vPix.toFixed(2)}
Vendas em Cartao: R$ ${vCartao.toFixed(2)}
Total de Suprimentos (+): R$ ${tSuprimentos.toFixed(2)}
Total de Sangrias (-): R$ ${tSangrias.toFixed(2)}
-------------------------------------------
> TOTAL ESTIMADO EM GAVETA (Dinheiro + Abertura + Sup - San): R$ ${dEstimado.toFixed(2)}
-------------------------------------------
2. CONTAGEM REAL (OPERADOR/GERENTE)
Valor Contado na Gaveta: R$ ${parsedContado.toFixed(2)}
Divergencia (Falta/Sobra): R$ ${dif.toFixed(2)}
-------------------------------------------
Observacoes do Fechamento:
${msgFechamento}
===========================================
ARQUIVO DE SEGURANCA GERADO LOCALMENTE - GUARDE ESTE ARQUIVO.
===========================================`;

      // Remove acentos para evitar quebra de codificação no txt de celulares
      reportText = reportText.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Forçar o download do arquivo de texto
      const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Fechamento_Caixa_${new Date().toISOString().slice(0,10).replace(/-/g, '')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setUltimoRelatorioText(reportText);
      setCloseCaixaModalOpen(false);
      setFechamentoSucessoModalOpen(true);
      await loadInitialData();
      setCart([]);
      setCashPaid('');
      setSuccess(`Caixa fechado com sucesso! Relatório de segurança baixado.`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      console.error(err);
      setError('Falha interna: ' + (err.message || JSON.stringify(err)));
    }
  };

  const handleRegistrarSangria = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedVal = parseFloat(sangriaValue.replace(',', '.'));
    if (isNaN(parsedVal) || parsedVal <= 0) {
      setError('Informe um valor de sangria válido, sô!');
      return;
    }

    if (!sangriaReason.trim()) {
      setError('Por favor, informe a justificativa da sangria!');
      return;
    }

    // Verifica se há dinheiro em espécie suficiente estimado em caixa
    const statsSales = await saleRepository.getAllSales();
    const sessionSales = statsSales.filter(
      (s) => new Date(s.criado_em).getTime() >= (activeSession?.timestampAbertura || 0)
    );
    const vDinheiro = sessionSales
      .filter((s) => s.metodo_pagamento === 'DINHEIRO')
      .reduce((acc, s) => acc + s.valor_total, 0);
    const tSangrias = (activeSession?.sangrias || []).reduce((acc, s) => acc + s.valor, 0);
    const tSuprimentos = (activeSession?.suprimentos || []).reduce((acc, s) => acc + s.valor, 0);
    const dinheiroDisponivel = (activeSession?.valorAbertura || 0) + vDinheiro + tSuprimentos - tSangrias;

    if (parsedVal > dinheiroDisponivel) {
      setError(`Eita! Não dá pra tirar R$ ${parsedVal.toFixed(2)} se só tem R$ ${dinheiroDisponivel.toFixed(2)} em dinheiro na gaveta!`);
      return;
    }

    try {
      const updatedSession = await saleRepository.registrarSangria(parsedVal, sangriaReason.trim());
      setActiveSession(updatedSession);
      setSangriaModalOpen(false);
      setSangriaValue('');
      setSangriaReason('');
      setSuccess(`Sangria de R$ ${parsedVal.toFixed(2)} registrada com sucesso!`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError('Erro ao registrar sangria.');
    }
  };

  const handleRegistrarSuprimento = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedVal = parseFloat(suprimentoValue.replace(',', '.'));
    if (isNaN(parsedVal) || parsedVal <= 0) {
      setError('Informe um valor de suprimento válido, sô!');
      return;
    }

    if (!suprimentoReason.trim()) {
      setError('Por favor, informe a justificativa do suprimento!');
      return;
    }

    try {
      const updatedSession = await saleRepository.registrarSuprimento(parsedVal, suprimentoReason.trim());
      setActiveSession(updatedSession);
      setSuprimentoModalOpen(false);
      setSuprimentoValue('');
      setSuprimentoReason('');
      setSuccess(`Suprimento de R$ ${parsedVal.toFixed(2)} registrado com sucesso!`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError('Erro ao registrar suprimento.');
    }
  };

  // Carrinho
  const handleAddToCart = (product: Produto) => {
    if (product.ativo === 0) {
      alert('Eita! Esse item está desativado no momento!');
      return;
    }

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { product, quantity: 1 }];
    });
  };

  const handleIncrementCart = (productId: string) => {
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: i.quantity + 1 } : i))
    );
  };

  const handleDecrementCart = (productId: string) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product.id === productId) {
            return { ...i, quantity: i.quantity - 1 };
          }
          return i;
        })
        .filter((i) => i.quantity > 0)
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const handleLogout = () => {
    if (cart.length > 0 && !window.confirm('Existe uma venda aberta. Deseja sair mesmo assim?')) return;
    authLocalService.logout();
    navigate('/login');
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.product.preco * item.quantity, 0);

  // Troco

  const handleQuickCash = (amount: number) => {
    setCashPaid((prev) => {
      const current = parseFloat(prev.replace(',', '.')) || 0;
      return (current + amount).toString();
    });
  };

  // Finalização da Venda (Dinheiro)
  const handleFinalizarDinheiro = () => {
    if (cart.length === 0) return;
    setError('');
    setCashPaid(''); // Reseta pro cara digitar o valor no modal
    setDinheiroModalOpen(true);
  };

  const handleConfirmarVendaDinheiro = async () => {
    setError('');
    const parsedPaid = parseFloat(cashPaid.replace(',', '.'));

    if (isNaN(parsedPaid) || parsedPaid < cartTotal) {
      setError('Valor pago em dinheiro é insuficiente, sô!');
      return;
    }

    try {
      const items = cart.map((item) => ({
        produtoId: item.product.id,
        quantidade: item.quantity,
        precoUnitario: item.product.preco,
      }));

      await saleRepository.createSale(
        cartTotal,
        'DINHEIRO',
        items,
        user?.email || '',
        undefined,
        parsedPaid,
        parsedPaid - cartTotal
      );

      // Recarrega produtos
      await loadInitialData();
      
      // Limpa venda
      setUltimaVendaCart([...cart]);
      setUltimaVendaMethod('DINHEIRO');
      setCart([]);
      setCashPaid('');
      setDinheiroModalOpen(false);
      setVendaSucessoModalOpen(true);
    } catch (err: any) {
      setError('Erro ao salvar a venda.');
    }
  };

  // Finalização da Venda (Pix)
  const handleGerarPix = async () => {
    if (cart.length === 0) return;
    setError('');

    const parsedPaid = parseFloat(cashPaid.replace(',', '.')) || cartTotal;
    const valorPix = parsedPaid > cartTotal ? parsedPaid : cartTotal;

    try {
      // Gera o código do Pix estático utilizando o serviço local offline com o valor correto
      const code = pixService.generatePixCode(
        schoolPixKey,
        valorPix,
        schoolPixName,
        schoolPixCity
      );
      setPixCode(code);
      setPixModalOpen(true);

      // Gera a url base64 do QRCode offline
      const dataUrl = await pixService.generateQrCodeDataUrl(code);
      setPixQrDataUrl(dataUrl);
    } catch (err: any) {
      setError('Erro ao gerar QR Code Pix offline.');
      console.error(err);
    }
  };

  const handleConfirmarVendaPix = async () => {
    try {
      const items = cart.map((item) => ({
        produtoId: item.product.id,
        quantidade: item.quantity,
        precoUnitario: item.product.preco,
      }));

      const parsedPaid = parseFloat(cashPaid.replace(',', '.')) || cartTotal;
      const valorPix = parsedPaid > cartTotal ? parsedPaid : cartTotal;
      const troco = valorPix - cartTotal;

      await saleRepository.createSale(
        cartTotal,
        'PIX_LOCAL',
        items,
        user?.email || '',
        pixCode,
        valorPix,
        troco
      );

      await loadInitialData();

      setUltimaVendaCart([...cart]);
      setUltimaVendaMethod('PIX');
      setCart([]);
      setCashPaid('');
      setPixModalOpen(false);
      setVendaSucessoModalOpen(true);
    } catch (err: any) {
      setError('Erro ao salvar a venda Pix.');
    }
  };

  const handleFinalizarCartao = () => {
    if (cart.length === 0) return;
    setCartaoModalOpen(true);
  };

  const handleConfirmarVendaCartao = async () => {
    setError('');
    try {
      const items = cart.map((item) => ({
        produtoId: item.product.id,
        quantidade: item.quantity,
        precoUnitario: item.product.preco,
      }));

      await saleRepository.createSale(
        cartTotal,
        'CARTAO',
        items,
        user?.email || '',
        undefined,
        cartTotal,
        0
      );

      await loadInitialData();
      
      // Limpa venda
      setUltimaVendaCart([...cart]);
      setUltimaVendaMethod('CARTÃO');
      setCart([]);
      setCashPaid('');
      setCartaoModalOpen(false);
      setVendaSucessoModalOpen(true);
    } catch (err: any) {
      setError('Erro ao salvar a venda Cartão.');
    }
  };

  // Filtragem dos produtos
  const filteredProducts = products.filter((p) => {
    if (activeTab === 'tudo') return true;
    if (activeTab === 'comida') return p.categoria === 'COMIDAS';
    if (activeTab === 'bebida') return p.categoria === 'BEBIDAS';
    if (activeTab === 'doce') return p.categoria === 'DOCES';
    if (activeTab === 'jogo') return p.categoria === 'JOGOS';
    return true;
  });

  // Ordenação dos produtos
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    // Ordenar por cor_ficha (classe Tailwind, e.g. "bg-amber-500") e se for a mesma, por nome
    const colorA = a.cor_ficha.split(' ')[0] || '';
    const colorB = b.cor_ficha.split(' ')[0] || '';
    const colorCompare = colorA.localeCompare(colorB);
    if (colorCompare !== 0) return colorCompare;
    return a.nome.localeCompare(b.nome);
  });

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 text-white select-none">
      
      {/* HEADER DO OPERADOR */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-2 md:px-6 py-1.5 md:py-4 shadow-md gap-2 shrink-0">
        <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
          <span className="text-xl md:text-3xl">🔥</span>
          <div className="hidden sm:block">
            <h1 className="text-base md:text-xl font-bold tracking-tight text-amber-500 leading-tight">Arraiá Digital</h1>
            <p className="text-[9px] md:text-xs text-slate-400 leading-tight">Escola Ativa • Frente de Caixa</p>
          </div>
        </div>

        {/* STATUS DE SINCRONIZAÇÃO E REDE */}
        {/* STATUS DE SINCRONIZAÇÃO E REDE */}
        <div className="flex items-center gap-2 md:gap-4 flex-shrink min-w-0 justify-end">
          <div className={`flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-semibold whitespace-nowrap ${
            syncStatus.online ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            {syncStatus.online ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="hidden sm:inline">{syncStatus.online ? 'Online' : 'Offline'}</span>
          </div>

          {syncStatus.pendingCount > 0 && (
            <button
              onClick={() => syncEngine.syncNow()}
              disabled={syncStatus.syncing || !syncStatus.online}
              className={`flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-bold transition-all whitespace-nowrap ${
                syncStatus.online 
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Activity size={14} className={syncStatus.syncing ? 'animate-spin' : ''} />
              <span>{syncStatus.syncing ? 'Sync...' : <><span className="sm:hidden">{syncStatus.pendingCount}</span><span className="hidden sm:inline">{syncStatus.pendingCount} pendentes</span></>}</span>
            </button>
          )}

          {/* PERFIS & CONFIG */}
          {/* PERFIS & CONFIG */}
          <div className="flex items-center gap-2 md:gap-4 border-l border-slate-800 pl-2 md:pl-4 flex-shrink-0">
            {/* SINO DE NOTIFICAÇÕES */}
            <div className="relative">
              <button
                onClick={() => setMensagensModalOpen(true)}
                className={`p-1.5 md:p-2 rounded-xl border transition-colors cursor-pointer ${
                  mensagensNaoLidas.length > 0
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-500 hover:bg-rose-500/30 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
                }`}
              >
                {mensagensNaoLidas.length > 0 ? (
                  <BellRing size={16} className="md:w-5 md:h-5" />
                ) : (
                  <Bell size={16} className="md:w-5 md:h-5" />
                )}
                
                {mensagensNaoLidas.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-[16px] md:min-w-[20px] md:h-[20px] px-1 rounded-full bg-rose-500 text-white text-[8px] md:text-[10px] font-black border-2 border-slate-950">
                    {mensagensNaoLidas.length}
                  </span>
                )}
              </button>
            </div>

            <span className="flex items-center gap-1 text-xs md:text-sm font-medium text-slate-300 ml-1 md:ml-2 whitespace-nowrap">
              <User size={14} className="text-amber-500 md:w-4 md:h-4" />
              <span className="max-w-[70px] md:max-w-none truncate">{user?.nome.split(' ')[0]}</span>
              <span className="hidden lg:inline text-slate-500">
                ({user?.role === 'SUPER_ADMIN' ? 'Super Admin' : user?.role === 'ADMIN_OPERACIONAL' ? 'Admin' : 'Operador'})
              </span>
            </span>

            {authLocalService.checkRole('ADMIN_OPERACIONAL') && (
              <button
                onClick={() => navigate('/admin')}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                title="Painel de Controle"
              >
                <Settings size={18} />
              </button>
            )}

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg bg-red-950/40 text-rose-400 border border-rose-950/50 hover:bg-rose-900/40 transition-colors cursor-pointer"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ÁREA PRINCIPAL */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* TELA DE ABERTURA DE CAIXA (SE NÃO ABERTO) */}
        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-900 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.03)_0%,transparent_70%)]">
            <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-slate-950 p-8 shadow-2xl backdrop-blur-md">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 mb-3 border border-amber-500/20">
                  <Store size={32} />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">ABERTURA DE CAIXA</h2>
                <p className="text-sm text-slate-400 mt-1">Insira o valor em dinheiro para troco inicial na gaveta.</p>
              </div>

              <form onSubmit={handleAbrirCaixa} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-1.5">Valor Inicial em Dinheiro (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-lg font-bold text-slate-500">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-11 pr-4 py-3 text-xl font-bold text-white placeholder-slate-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    Assinatura do Gerente (PIN)
                    <span className="text-[10px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded border border-rose-500/20 uppercase tracking-wider font-black">Obrigatório</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-slate-500"><Key size={18} /></span>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="••••••"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-11 pr-4 py-3 text-xl tracking-widest font-bold text-white placeholder-slate-600 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2 text-center font-medium">Requer autorização de um Admin ou Gerente.</p>
                </div>

                {error && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-medium rounded-xl text-center">
                    ⚠️ {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 transform rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-lg font-bold text-white shadow-lg transition-all active:scale-[0.98] hover:brightness-110 cursor-pointer"
                >
                  Abrir Caixa <ArrowRight size={18} />
                </button>
              </form>

              {user?.role !== 'OPERADOR_CAIXA' && (
                <div className="mt-6 pt-4 border-t border-slate-800 flex justify-center">
                  <button
                    onClick={() => navigate('/admin')}
                    className="text-xs font-semibold text-amber-500/70 hover:text-amber-500 transition-colors"
                  >
                    Acessar Painel Gerencial Admin
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          
          // OPERAÇÃO DO CAIXA (PDV GRID + CARRINHO)
          <>
            {/* GRID DE PRODUTOS */}
            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden relative">
              
              {/* FILTROS E ORDENAÇÃO */}
              <div className="flex items-center justify-between gap-4 mb-4 bg-slate-950/30 p-2.5 rounded-2xl border border-slate-800/60 pb-2">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 flex-1">
                  {(['tudo', 'comida', 'bebida', 'doce', 'jogo'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-5 py-3 rounded-xl text-sm font-black capitalize transition-all duration-150 border cursor-pointer whitespace-nowrap ${
                        activeTab === tab
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md scale-105'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {tab === 'tudo' ? '🌟 Tudo' : tab === 'comida' ? '🌽 Comidas' : tab === 'bebida' ? '🥤 Bebidas' : tab === 'doce' ? '🍭 Doces' : '🎣 Brincadeiras'}
                    </button>
                  ))}
                </div>

                {/* MENU ADMINISTRATIVO DO CAIXA (Substitui o Ordenar Por) */}
                <div className="relative z-50 flex items-center border-l border-slate-850 pl-4 flex-shrink-0">
                  <button
                    onClick={() => setIsTopAdminMenuOpen(!isTopAdminMenuOpen)}
                    className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-300 px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Settings size={14} />
                    <span className="hidden sm:inline">Gerenciamento do Caixa</span>
                    <span className="sm:hidden">Caixa</span>
                    <ChevronDown size={14} className={`transition-transform ${isTopAdminMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isTopAdminMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsTopAdminMenuOpen(false)}></div>
                      <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in flex flex-col p-1">
                        <button
                          onClick={() => {
                            setIsTopAdminMenuOpen(false);
                            setError('');
                            setSuprimentoValue('');
                            setSuprimentoReason('');
                            setSuprimentoModalOpen(true);
                          }}
                          className="flex items-center gap-2 text-left w-full px-3 py-2.5 text-xs font-bold text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        >
                          <Plus size={14} /> Suprimento de Caixa
                        </button>
                        <button
                          onClick={() => {
                            setIsTopAdminMenuOpen(false);
                            setError('');
                            setSangriaValue('');
                            setSangriaReason('');
                            setSangriaModalOpen(true);
                          }}
                          className="flex items-center gap-2 text-left w-full px-3 py-2.5 text-xs font-bold text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        >
                          <Minus size={14} /> Realizar Sangria
                        </button>
                        <div className="h-px bg-slate-800 my-1"></div>
                        <button
                          onClick={() => {
                            setIsTopAdminMenuOpen(false);
                            handleOpenFecharCaixaModal();
                          }}
                          className="flex items-center gap-2 text-left w-full px-3 py-2.5 text-xs font-bold text-slate-300 hover:bg-rose-950 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                        >
                          <Lock size={14} /> Abrir / Fechar Caixa
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* MENSAGEM DE SUCESSO OU ERRO NO CAIXA */}
              {success && (
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold rounded-xl text-center animate-fade-in shadow">
                  ✅ {success}
                </div>
              )}
              {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-semibold rounded-xl text-center shadow">
                  ⚠️ {error}
                </div>
              )}

              {/* LISTA DE PRODUTOS */}
              <div className="flex-1 overflow-y-auto pr-1 pb-64 lg:pb-6 flex flex-col sm:grid sm:grid-cols-2 xl:grid-cols-4 gap-3 content-start">
                {sortedProducts.map((product) => {
                  const inCartQty = cart.find((item) => item.product.id === product.id)?.quantity || 0;
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      key={product.id}
                      onClick={() => {
                        if (product.ativo !== 0) handleAddToCart(product);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          if (product.ativo !== 0) handleAddToCart(product);
                        }
                      }}
                      className={`group relative flex items-start gap-3 p-3 rounded-2xl border text-left active:scale-[0.98] shadow-md select-none transition-transform duration-100 ${
                        product.ativo === 0
                          ? 'opacity-40 bg-slate-950 border-slate-900 cursor-not-allowed'
                          : `${product.cor_ficha} cursor-pointer hover:-translate-y-0.5 hover:shadow-lg`
                      }`}
                    >
                      {/* Lado Esquerdo: Textos e Botões (Bloco Simples) */}
                      <div className="flex-1 min-w-0">
                        <div className="mb-2">
                          <span className="block font-black text-base sm:text-lg leading-tight line-clamp-2 text-white drop-shadow-sm">
                            {product.nome}
                          </span>
                          <span className="block text-xs opacity-80 font-black uppercase mt-1 tracking-wider">
                            {product.categoria}
                          </span>
                        </div>

                        <div className="font-black text-lg sm:text-xl tracking-tight text-white drop-shadow mb-2">
                          R$ {product.preco.toFixed(2)}
                        </div>
                        
                        {/* Controles de Quantidade Kiosk */}
                        {inCartQty > 0 && (
                          <div className="flex items-center justify-between bg-black/40 rounded-lg p-1.5 w-full z-20" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => handleDecrementCart(product.id)} className="w-8 h-8 flex items-center justify-center text-white bg-white/10 rounded-md active:bg-white/30 hover:bg-white/20 cursor-pointer">
                              <Minus size={18} />
                            </button>
                            <span className="font-black text-white text-base">{inCartQty}x</span>
                            <button type="button" onClick={() => handleIncrementCart(product.id)} className="w-8 h-8 flex items-center justify-center text-white bg-white/10 rounded-md active:bg-white/30 hover:bg-white/20 cursor-pointer">
                              <Plus size={18} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Lado Direito: Imagem */}
                      {product.imagem && (
                        <div className={`w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl overflow-hidden border border-black/15 bg-slate-900/10 flex items-center justify-center shadow-inner ${inCartQty > 0 ? 'opacity-30 md:opacity-100' : ''}`}>
                          <img src={product.imagem} alt={product.nome} className="w-full h-full object-contain drop-shadow-md scale-110" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CARRINHO DE COMPRAS & TROCO (PAINEL DIREITO NO DESKTOP / OVERLAY NO MOBILE) */}
            <div className={`
              fixed inset-0 z-50 lg:static lg:inset-auto lg:z-auto
              ${isCartOpenMobile ? 'flex' : 'hidden lg:flex'}
              w-full lg:w-96 border-l border-slate-800 bg-slate-950 flex-col shadow-2xl
            `}>
              
              {/* HEADER MOBILE FECHAR */}
              <div className="lg:hidden p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                <span className="font-extrabold text-lg text-white">Sacola de Vendas</span>
                <button 
                  onClick={() => setIsCartOpenMobile(false)}
                  className="p-2 bg-slate-800 rounded-full text-slate-300 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* TOPO DO CARRINHO (DESKTOP) */}
              <div className="hidden lg:flex p-4 border-b border-slate-800 items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="text-amber-500" size={20} />
                  <span className="font-extrabold text-lg">Comandas / Sacola</span>
                </div>
                <span className="bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-0.5 rounded-lg text-xs font-bold">
                  {cart.reduce((a, b) => a + b.quantity, 0)} itens
                </span>
              </div>

              {/* LISTAGEM DE ITENS */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                    <span className="text-4xl">🧺</span>
                    <p className="text-sm font-semibold">Carrinho vazio, sô!</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex items-center justify-between bg-slate-900/50 p-3 rounded-xl border border-slate-900 hover:border-slate-800 transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-bold text-sm text-white truncate leading-tight">
                          {item.product.nome}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 font-medium">
                          R$ {item.product.preco.toFixed(2)} x {item.quantity}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleDecrementCart(item.product.id)}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer active:scale-95 shadow-sm"
                        >
                          <Minus size={20} />
                        </button>
                        <span className="text-lg font-black w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleIncrementCart(item.product.id)}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer active:scale-95 shadow-sm"
                        >
                          <Plus size={20} />
                        </button>
                        <button
                          onClick={() => handleRemoveFromCart(item.product.id)}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-950/60 hover:bg-red-900/50 text-rose-400 ml-2 transition-colors cursor-pointer active:scale-95 shadow-sm"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* ALERTA DE ITENS ESPECIAIS (KIT FICHAS) */}
              {cart.some(item => item.product.nome.toUpperCase().includes('KIT FICHAS')) && (
                <div className="mx-4 mb-4 p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse">
                  <div className="flex items-start gap-2">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <p className="text-xs font-black">AVISO IMPORTANTE!</p>
                      <p className="text-[11px] leading-tight mt-0.5 font-medium text-amber-200/90">
                        Lembre-se de oferecer os itens especiais destacados com estrela (⭐) para esse cliente!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TOTAIS E CÁLCULO DE TROCO */}
              <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-4">
                
                {/* SUB-TOTAL */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-400">Total Geral</span>
                  <span className="text-3xl font-black text-amber-500 tracking-tight">
                    R$ {cartTotal.toFixed(2)}
                  </span>
                </div>

                {/* PAINEL DE DINHEIRO & TROCO REMOVIDO DAQUI (AGORA ESTÁ NO MODAL) */}

                {/* BOTÕES DE FINALIZAÇÃO */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <button
                    onClick={handleFinalizarDinheiro}
                    disabled={cart.length === 0}
                    className={`flex md:flex-col items-center justify-center gap-3 md:gap-1.5 py-4 md:py-3 rounded-xl text-sm md:text-xs font-black transition-all active:scale-[0.98] ${
                      cart.length > 0
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <DollarSign size={20} /> Dinheiro
                  </button>
                  
                  <button
                    onClick={handleGerarPix}
                    disabled={cart.length === 0}
                    className={`flex md:flex-col items-center justify-center gap-3 md:gap-1.5 py-4 md:py-3 rounded-xl text-sm md:text-xs font-black transition-all active:scale-[0.98] ${
                      cart.length > 0
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-lg cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <QrCode size={20} /> Pix Offline
                  </button>

                  <button
                    onClick={handleFinalizarCartao}
                    disabled={cart.length === 0}
                    className={`flex md:flex-col items-center justify-center gap-3 md:gap-1.5 py-4 md:py-3 rounded-xl text-sm md:text-xs font-black transition-all active:scale-[0.98] ${
                      cart.length > 0
                        ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <CreditCard size={20} /> Cartão
                  </button>
                </div>

                {/* INFORMAÇÕES DA SESSÃO */}
                <div className="pt-2.5 border-t border-slate-800">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Abertura: {new Date(activeSession.timestampAbertura).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <span className="text-[10px] text-slate-500 font-semibold">Caixa: {activeSession.operadorEmail.split('@')[0]}</span>
                  </div>
                </div>

              </div>
            </div>

            {/* KIOSK MODE: BARRA FLUTUANTE DE PAGAMENTO (APENAS MOBILE) */}
            {!isCartOpenMobile && (
              <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 p-4 pb-6 flex flex-col gap-3 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                
                <div className="flex items-center justify-between mb-1">
                  <button onClick={() => setIsCartOpenMobile(true)} className="flex items-center gap-2 text-amber-500 font-bold active:scale-95 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                    <ShoppingCart size={18} />
                    <span>Sacola ({cart.reduce((a, b) => a + b.quantity, 0)})</span>
                  </button>
                  <span className="text-3xl font-black text-amber-500 tracking-tight">R$ {cartTotal.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={handleFinalizarDinheiro} 
                    disabled={cart.length === 0}
                    className={`p-3 rounded-xl text-xs font-bold flex flex-col items-center gap-1 active:scale-[0.98] shadow-lg transition-colors ${
                      cart.length > 0 ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}>
                    <DollarSign size={20} /> Dinheiro
                  </button>
                  <button 
                    onClick={handleGerarPix} 
                    disabled={cart.length === 0}
                    className={`p-3 rounded-xl text-xs font-bold flex flex-col items-center gap-1 active:scale-[0.98] shadow-lg transition-colors ${
                      cart.length > 0 ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}>
                    <QrCode size={20} /> Pix
                  </button>
                  <button 
                    onClick={handleFinalizarCartao} 
                    disabled={cart.length === 0}
                    className={`p-3 rounded-xl text-xs font-bold flex flex-col items-center gap-1 active:scale-[0.98] shadow-lg transition-colors ${
                      cart.length > 0 ? 'bg-purple-600 text-white hover:bg-purple-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}>
                    <CreditCard size={20} /> Cartão
                  </button>
                </div>

              </div>
            )}
          </>
        )}
      </main>

      {/* MODAL PIX OFFLINE */}
      {pixModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-scale-up text-center">
            
            <h3 className="text-lg font-black text-white">PAGAMENTO VIA PIX</h3>
            <p className="text-xs text-slate-400 mt-1">Peça para o cliente escanear o QR Code abaixo</p>

            <div className="my-5 flex justify-center p-3 bg-white rounded-xl shadow-inner w-fit mx-auto">
              {pixQrDataUrl ? (
                <img src={pixQrDataUrl} alt="QR Code Pix" className="w-56 h-56" />
              ) : (
                <div className="w-56 h-56 bg-slate-100 animate-pulse rounded flex items-center justify-center text-slate-400">
                  Gerando QR Code...
                </div>
              )}
            </div>

            <div className="space-y-2">
              {(() => {
                const parsedPaid = parseFloat(cashPaid.replace(',', '.')) || cartTotal;
                const valorPix = parsedPaid > cartTotal ? parsedPaid : cartTotal;
                const trocoPix = valorPix - cartTotal;
                return (
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5 text-left">
                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span>Valor da Conta:</span>
                      <span className="font-bold text-slate-300">R$ {cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-extrabold border-t border-slate-900 pt-2.5">
                      <span className="text-amber-500">Valor do QR Code Pix:</span>
                      <span className="text-lg font-black text-amber-500">R$ {valorPix.toFixed(2)}</span>
                    </div>
                    {trocoPix > 0 && (
                      <div className="mt-2 p-3 bg-emerald-950/45 border border-emerald-500/30 rounded-xl flex flex-col items-center justify-center animate-pulse">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Troco em Dinheiro a Devolver</span>
                        <span className="text-xl font-black text-emerald-300 mt-1">R$ {trocoPix.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* DADOS PIX */}
              <div className="bg-slate-950 p-2 text-left rounded-lg text-[10px] text-slate-400 space-y-1 relative">
                <button 
                  onClick={() => {
                    setPixConfigEdit({ key: schoolPixKey, name: schoolPixName, city: schoolPixCity });
                    setConfigPixModalOpen(true);
                  }}
                  className="absolute top-2 right-2 text-blue-400 hover:text-blue-300 font-bold px-3 py-1.5 bg-slate-900 rounded-md cursor-pointer border border-slate-700 shadow-sm transition-all active:scale-95"
                >
                  ⚙️ Editar Pix
                </button>
                <p><span className="font-bold text-slate-300">Recebedor:</span> {schoolPixName}</p>
                <p><span className="font-bold text-slate-300">Cidade:</span> {schoolPixCity}</p>
                <p><span className="font-bold text-slate-300">Chave:</span> {schoolPixKey}</p>
              </div>

              {/* COPIA E COLA */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(pixCode);
                    alert('Código Pix copiado com sucesso!');
                  }}
                  className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-all cursor-pointer"
                >
                  Copiar Código Pix
                </button>
              </div>
            </div>

            {/* AÇÕES */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setPixModalOpen(false)}
                className="py-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-bold transition-all cursor-pointer"
              >
                Voltar/Cancelar
              </button>
              
              <button
                onClick={handleConfirmarVendaPix}
                className="py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:brightness-115 text-sm font-bold transition-all cursor-pointer shadow-lg"
              >
                Pago e Confirmado!
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL SUPRIMENTO DE CAIXA */}
      {suprimentoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleRegistrarSuprimento} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-scale-up">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>📥</span> SUPRIMENTO DE CAIXA (REFORÇO)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Adicione moedas ou cédulas na gaveta física para reforçar o fundo de troco.
            </p>

            <div className="my-4 space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Valor do Suprimento (R$)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-sm font-bold text-slate-500">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={suprimentoValue}
                    onChange={(e) => setSuprimentoValue(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-4 py-2.5 text-lg font-bold text-white focus:outline-none focus:border-amber-400"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Justificativa / Motivo</label>
                <textarea
                  placeholder="Ex: Adição de R$ 50,00 em moedas de 1 real"
                  value={suprimentoReason}
                  onChange={(e) => setSuprimentoReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white h-20 focus:outline-none focus:border-amber-400 resize-none"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium rounded-xl text-center">
                ⚠️ {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSuprimentoModalOpen(false)}
                className="py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:brightness-110 text-xs font-bold transition-all cursor-pointer shadow-lg"
              >
                Confirmar Suprimento
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL SANGRIA DE CAIXA */}
      {sangriaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleRegistrarSangria} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-scale-up">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>💸</span> SANGRIA DE CAIXA (RETIRADA)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Retire dinheiro da gaveta física para segurança ou troco de outras barracas.
            </p>

            <div className="my-4 space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Valor da Retirada (R$)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-sm font-bold text-slate-500">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={sangriaValue}
                    onChange={(e) => setSangriaValue(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-4 py-2.5 text-lg font-bold text-white focus:outline-none focus:border-amber-400"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Justificativa / Motivo</label>
                <textarea
                  placeholder="Ex: Retirada de R$ 150 para o cofre central"
                  value={sangriaReason}
                  onChange={(e) => setSangriaReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white h-20 focus:outline-none focus:border-amber-400 resize-none"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium rounded-xl text-center">
                ⚠️ {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSangriaModalOpen(false)}
                className="py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:brightness-110 text-xs font-bold transition-all cursor-pointer shadow-lg"
              >
                Confirmar Retirada
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL FECHAMENTO E ACERTO FINAL */}
      {closeCaixaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleConfirmarFecharCaixa} className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-scale-up">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>🔒</span> FECHAMENTO DE CAIXA & ACERTO FINAL
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Conclua o turno para troca de funcionário. Faça a contagem física do dinheiro em caixa.
            </p>

            {/* PAINEL DE CONTABILIDADE */}
            <div className="my-4 bg-slate-950 p-4 rounded-xl border border-slate-800 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Fundo de Abertura:</span>
                <span className="font-bold text-slate-300">R$ {activeSession?.valorAbertura.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-emerald-400">
                <span>(+) Vendas em Dinheiro:</span>
                <span className="font-bold">R$ {caixaStats.vendasDinheiro.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-emerald-400">
                <span>(+) Suprimentos (Reforços):</span>
                <span className="font-bold">R$ {caixaStats.totalSuprimentos.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-rose-400">
                <span>(-) Sangrias (Retiradas):</span>
                <span className="font-bold">R$ {caixaStats.totalSangrias.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-900 pt-2 text-sm font-extrabold text-white">
                <span>(=) Saldo Estimado em Espécie:</span>
                <span className="text-amber-500">R$ {caixaStats.dinheiroEstimado.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 pt-1 text-[10px]">
                <span>(Informativo) Vendas em Pix:</span>
                <span>R$ {caixaStats.vendasPix.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 text-[10px]">
                <span>(Informativo) Vendas em Cartão:</span>
                <span>R$ {caixaStats.vendasCartao.toFixed(2)}</span>
              </div>
            </div>

            {/* DIGITAÇÃO DO VALOR REAL CONTADO */}
            <div className="mb-4 text-left space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">Dinheiro Físico Contado (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-sm font-bold text-emerald-500">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                      className="w-full rounded-xl border border-emerald-500/30 bg-slate-950 pl-10 pr-4 py-2.5 text-lg font-bold text-emerald-400 focus:outline-none focus:border-emerald-400"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 flex justify-between">
                    Assinatura (PIN)
                    <span className="text-[10px] bg-rose-500/10 text-rose-400 px-1 rounded uppercase">Obrigatório</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-slate-500"><Key size={16} /></span>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="••••••"
                      value={adminPinClose}
                      onChange={(e) => setAdminPinClose(e.target.value.replace(/\D/g, ''))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-4 py-2.5 text-lg tracking-widest font-bold text-white focus:outline-none focus:border-rose-400"
                    />
                  </div>
                </div>
              </div>

              {/* DIVERGÊNCIA CALCULADA EM TEMPO REAL */}
              {(() => {
                const parsedContado = parseFloat(countedCash.replace(',', '.'));
                if (isNaN(parsedContado)) return null;
                const diff = parsedContado - caixaStats.dinheiroEstimado;
                return (
                  <div className={`p-2.5 rounded-lg text-center text-xs font-bold border ${
                    diff === 0 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : diff > 0 
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}>
                    {diff === 0 ? (
                      <span>🤠 Tudo certo! Dinheiro contado bate exatamente com o sistema!</span>
                    ) : diff > 0 ? (
                      <span>🤠 Sobra de caixa: Há R$ {diff.toFixed(2)} a mais na gaveta.</span>
                    ) : (
                      <span>⚠️ Quebra de caixa: Estão faltando R$ {Math.abs(diff).toFixed(2)} na gaveta!</span>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Observações do Fechamento</label>
                <textarea
                  placeholder="Ex: Tudo certo no turno da tarde. Troca realizada com o operador Pedro."
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-xs text-white h-16 focus:outline-none focus:border-amber-400 resize-none"
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium rounded-xl text-center">
                ⚠️ {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCloseCaixaModalOpen(false)}
                className="py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Voltar ao PDV
              </button>
              <button
                type="submit"
                className="py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-white hover:brightness-110 text-xs font-bold transition-all cursor-pointer shadow-lg"
              >
                Confirmar Fechamento
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL CARTÃO DE CRÉDITO/DÉBITO GIGANTE */}
      {cartaoModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl rounded-3xl border-2 border-indigo-500/50 bg-slate-900 p-8 md:p-12 shadow-[0_0_50px_rgba(99,102,241,0.2)] animate-scale-up text-center flex flex-col items-center">
            
            <div className="w-24 h-24 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mb-6 shadow-inner border border-indigo-500/30">
              <CreditCard size={48} />
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-white mb-2">Máquina de Cartão</h2>
            <p className="text-lg md:text-xl text-slate-400 mb-8">Passe o cartão na maquininha física com o valor abaixo:</p>

            <div className="bg-slate-950 px-8 py-6 rounded-2xl border-2 border-indigo-500/30 shadow-inner w-full max-w-sm mb-10">
              <span className="block text-sm font-bold text-indigo-400 mb-1 uppercase tracking-widest">Valor a Cobrar</span>
              <span className="text-5xl md:text-6xl font-black text-white">
                <span className="text-3xl text-slate-500 mr-2">R$</span>
                {cartTotal.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <button
                onClick={() => setCartaoModalOpen(false)}
                className="py-5 md:py-6 rounded-2xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xl font-bold transition-all cursor-pointer"
              >
                Cancelar Venda
              </button>
              
              <button
                onClick={handleConfirmarVendaCartao}
                className="py-5 md:py-6 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-[1.02] active:scale-95 text-xl font-black transition-all cursor-pointer shadow-xl shadow-indigo-900/40"
              >
                PAGO E APROVADO! ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DINHEIRO GIGANTE */}
      {dinheiroModalOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl rounded-3xl border-2 border-emerald-500/50 bg-slate-900 p-8 md:p-12 shadow-[0_0_50px_rgba(16,185,129,0.2)] animate-scale-up text-center flex flex-col items-center">
            
            <div className="w-24 h-24 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-6 shadow-inner border border-emerald-500/30">
              <span className="text-5xl">💵</span>
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-white mb-2">Pagamento à Vista</h2>
            <p className="text-lg md:text-xl text-slate-400 mb-8">Digite o valor entregue pelo cliente para calcular o troco:</p>

            <div className="bg-slate-950 px-8 py-6 rounded-2xl border-2 border-emerald-500/30 shadow-inner w-full max-w-md mb-8 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Valor da Compra</span>
                <span className="text-2xl font-black text-white">R$ {cartTotal.toFixed(2)}</span>
              </div>
              
              <div className="flex flex-col border-b border-slate-800 pb-4 pt-2">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-bold text-emerald-600 uppercase tracking-widest">Dinheiro Recebido</span>
                  <div className="relative w-1/2">
                    <span className="absolute left-3 top-3 text-emerald-600 font-black">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={cashPaid}
                      onChange={(e) => {
                        setCashPaid(e.target.value);
                        setError('');
                      }}
                      autoFocus
                      className="w-full text-right rounded-xl border border-emerald-500/50 bg-slate-900 pl-10 pr-4 py-3 text-2xl font-black text-emerald-400 focus:outline-none focus:border-emerald-300 shadow-inner"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 20, 50].map((val) => (
                    <button
                      key={val}
                      onClick={() => {
                        handleQuickCash(val);
                        setError('');
                      }}
                      className="py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      +{val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-bold text-amber-500 uppercase tracking-widest">Troco a Devolver</span>
                <span className="text-5xl md:text-6xl font-black text-amber-400 animate-pulse">
                  <span className="text-3xl text-amber-600 mr-2">R$</span>
                  {(() => {
                    const pd = parseFloat(cashPaid.replace(',', '.'));
                    if (isNaN(pd) || pd < cartTotal) return '0.00';
                    return (pd - cartTotal).toFixed(2);
                  })()}
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-4 text-rose-400 text-sm font-bold bg-rose-500/10 px-4 py-2 rounded-lg border border-rose-500/20">
                ⚠️ {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <button
                onClick={() => setDinheiroModalOpen(false)}
                className="py-5 md:py-6 rounded-2xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xl font-bold transition-all cursor-pointer"
              >
                Voltar / Corrigir
              </button>
              
              <button
                onClick={handleConfirmarVendaDinheiro}
                disabled={(() => {
                   const pd = parseFloat(cashPaid.replace(',', '.'));
                   return isNaN(pd) || pd < cartTotal;
                })()}
                className={`py-5 md:py-6 rounded-2xl text-xl font-black transition-all shadow-xl ${
                  (() => {
                   const pd = parseFloat(cashPaid.replace(',', '.'));
                   return isNaN(pd) || pd < cartTotal;
                  })()
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-2 border-slate-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-[1.02] active:scale-95 cursor-pointer shadow-emerald-900/40'
                }`}
              >
                TROCO ENTREGUE! ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE MENSAGENS */}
      {mensagensModalOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/60 backdrop-blur-sm" onClick={() => setMensagensModalOpen(false)}>
          <div className="w-full max-w-sm h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-slide-left" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl">
                  <MessageSquare size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Avisos</h3>
                  <p className="text-xs text-slate-400">Mensagens da coordenação</p>
                </div>
              </div>
              <button 
                onClick={() => setMensagensModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {mensagensLivres.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50">
                  <BellOff size={48} className="mb-4" />
                  <p>Nenhum aviso recebido.</p>
                </div>
              ) : (
                mensagensLivres.map(msg => (
                  <div 
                    key={msg.id} 
                    className={`p-4 rounded-2xl border transition-all ${
                      !msg.lida 
                        ? 'bg-slate-800 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)]' 
                        : 'bg-slate-900/50 border-slate-800 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider ${
                        msg.tipo === 'GERAL' ? 'bg-amber-500/20 text-amber-500' : 'bg-rose-500/20 text-rose-500'
                      }`}>
                        {msg.tipo === 'GERAL' ? 'Aviso Geral' : 'Direto para você'}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    <p className={`text-sm mb-3 ${!msg.lida ? 'text-slate-200 font-medium' : 'text-slate-400'}`}>
                      {msg.conteudo}
                    </p>

                    <div className="flex items-center justify-between mt-4">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Por: {msg.remetente}</span>
                      {!msg.lida && (
                        <button 
                          onClick={() => messageRepository.marcarComoLida(msg.id)}
                          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 py-1 px-2 bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                        >
                          Marcar como lido ✓
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* CAIXA DE MENSAGEM PARA ADMIN */}
            <div className="p-4 border-t border-slate-800 bg-slate-950">
              <form onSubmit={handleSendMessageToAdmin} className="flex flex-col gap-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mandar recado para a coordenação</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={novaMensagemAdmin}
                    onChange={e => setNovaMensagemAdmin(e.target.value)}
                    placeholder="Preciso de troco, etc..." 
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                    required
                  />
                  <button 
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 rounded-xl font-bold transition-all flex items-center justify-center shadow-lg shadow-amber-500/20 cursor-pointer shrink-0"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE SUCESSO E RESUMO DA VENDA */}
      {vendaSucessoModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-3xl border-2 border-emerald-500/50 bg-slate-900 p-6 md:p-8 shadow-[0_0_50px_rgba(16,185,129,0.3)] animate-scale-up flex flex-col">
            
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4 shadow-inner border border-emerald-500/30">
                <span className="text-4xl">🎉</span>
              </div>
              <h2 className="text-3xl font-black text-white">Venda Concluída!</h2>
              <p className="text-emerald-400 font-bold mt-1 uppercase tracking-widest text-sm">Pago via {ultimaVendaMethod}</p>
            </div>

            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 mb-6 flex-1 overflow-y-auto max-h-[40vh]">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">Fichas a entregar ao cliente</h3>
              <div className="space-y-2">
                {ultimaVendaCart.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-800/50">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold shadow-inner flex-shrink-0"
                        style={{ backgroundColor: item.product.cor_ficha?.split(' ')[0]?.replace('bg-', '') || '#cbd5e1' }}
                      >
                        {item.quantity}x
                      </div>
                      <span className="font-bold text-slate-200 truncate">
                        {item.product.nome} <span className="text-slate-400 font-normal text-sm">(R$ {(item.product.preco * item.quantity).toFixed(2)})</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">


              <button
                onClick={() => {
                  setVendaSucessoModalOpen(false);
                  setUltimaVendaCart([]);
                }}
                className="w-full py-5 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 text-xl font-black transition-all cursor-pointer shadow-xl shadow-emerald-900/40 uppercase tracking-wider"
              >
                Próximo Cliente ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUCESSO DE FECHAMENTO (WHATSAPP RELATÓRIO) */}
      {fechamentoSucessoModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-3xl border-2 border-emerald-500/50 bg-slate-900 p-6 md:p-8 shadow-[0_0_50px_rgba(16,185,129,0.3)] animate-scale-up flex flex-col">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4 shadow-inner border border-emerald-500/30">
                <span className="text-4xl">✅</span>
              </div>
              <h2 className="text-3xl font-black text-white">Caixa Fechado!</h2>
              <p className="text-emerald-400 font-bold mt-1 text-sm">O turno foi encerrado e os dados salvos.</p>
            </div>

            <div className="flex flex-col gap-3">
              <a
                href={`https://wa.me/5543999567378?text=${encodeURIComponent(ultimoRelatorioText)}`}
                className="w-full py-4 rounded-2xl bg-[#25D366] text-white hover:bg-[#1ebd5a] active:scale-95 text-lg font-black transition-all cursor-pointer shadow-lg shadow-green-900/40 flex items-center justify-center gap-2 uppercase tracking-wide"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-circle"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>
                Enviar Relatório p/ WhatsApp
              </a>

              <button
                onClick={() => {
                  setFechamentoSucessoModalOpen(false);
                }}
                className="w-full py-5 rounded-2xl bg-slate-800 text-white hover:bg-slate-700 active:scale-95 text-xl font-black transition-all cursor-pointer shadow-xl shadow-slate-900/40 uppercase tracking-wider"
              >
                Voltar à Tela Inicial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAR PIX */}
      {configPixModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-scale-up text-left">
            <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
              <span>⚙️</span> Configurar Chave Pix
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Chave Pix (CPF, CNPJ, Celular ou Email)</label>
                <input
                  type="text"
                  value={pixConfigEdit.key}
                  onChange={e => setPixConfigEdit({...pixConfigEdit, key: e.target.value.trim()})}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                  placeholder="Ex: 12345678000199"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Nome do Recebedor (Sem acentos)</label>
                <input
                  type="text"
                  value={pixConfigEdit.name}
                  onChange={e => setPixConfigEdit({...pixConfigEdit, name: e.target.value.toUpperCase()})}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                  placeholder="Ex: APMF ESCOLA"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Cidade</label>
                <input
                  type="text"
                  value={pixConfigEdit.city}
                  onChange={e => setPixConfigEdit({...pixConfigEdit, city: e.target.value.toUpperCase()})}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                  placeholder="Ex: CURITIBA"
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfigPixModalOpen(false)}
                className="py-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setSchoolPixKey(pixConfigEdit.key);
                  setSchoolPixName(pixConfigEdit.name);
                  setSchoolPixCity(pixConfigEdit.city);
                  localStorage.setItem('pix_key', pixConfigEdit.key);
                  localStorage.setItem('pix_name', pixConfigEdit.name);
                  localStorage.setItem('pix_city', pixConfigEdit.city);
                  
                  setConfigPixModalOpen(false);
                  setPixModalOpen(false); // Fecha o modal do Pix original para forçar gerar um novo
                  
                  setTimeout(() => alert('Pix atualizado! Clique em "Pix Offline" de novo para gerar seu novo QR Code com as novas chaves.'), 200);
                }}
                className="py-3 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 text-sm font-bold transition-all cursor-pointer"
              >
                Salvar Pix
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
