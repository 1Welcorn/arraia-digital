import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  UserPlus,
  Trash2,
  Download,
  Upload,
  Shield,
  Key,
  Mail,
  User
} from 'lucide-react';
import { authLocalService } from '../services/authLocalService';
import { userRepository, sha256 } from '../repository/userRepository';
import { db } from '../database/DatabaseConnection';
import { apiClient } from '../services/apiClient';
import type { UsuarioSistema } from '../database/DatabaseConnection';
import { syncEngine } from '../services/syncEngine';

export function SuperDashboard() {
  const navigate = useNavigate();
  
  // Whitelist users
  const [users, setUsers] = useState<UsuarioSistema[]>([]);
  
  // Form states
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN_OPERACIONAL' | 'OPERADOR_CAIXA'>('OPERADOR_CAIXA');
  
  // Alerts
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  
  // File import ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Apenas super_admins podem acessar
    const user = authLocalService.getCurrentUser();
    if (!user || user.nivel_acesso !== 'SUPER_ADMIN') {
      navigate('/login');
      return;
    }
    loadUsers();
  }, [navigate]);

  const loadUsers = async () => {
    try {
      const allUsers = await userRepository.getAllUsers();
      setUsers(allUsers);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAutocompleteEmail = () => {
    if (!newEmail.includes('@')) {
      setNewEmail((prev) => prev.trim() + '@escola.pr.gov.br');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const emailCompleto = newEmail.includes('@') ? newEmail.trim().toLowerCase() : `${newEmail.trim().toLowerCase()}@escola.pr.gov.br`;

    if (!newEmail || !newName || !newPin) {
      setError('Preencha todos os campos do voluntário, sô!');
      return;
    }

    if (newPin.length < 4 || isNaN(Number(newPin))) {
      setError('O PIN deve conter pelo menos 4 números!');
      return;
    }

    try {
      // Gera o hash do PIN offline
      const pinHash = await sha256(newPin);
      
      await userRepository.saveUser({
        email: emailCompleto,
        nome: newName,
        pin_acesso: pinHash,
        nivel_acesso: newRole,
        ativo: 1,
      });

      // Dispara a sincronização imediatamente para jogar a pessoa na Nuvem (Whitelist Dinâmica)
      syncEngine.syncNow().catch(() => {});

      setNewEmail('');
      setNewName('');
      setNewPin('');
      setNewRole('OPERADOR_CAIXA');
      setSuccess('Voluntário cadastrado na whitelist com sucesso!');
      await loadUsers();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError('Erro ao salvar voluntário.');
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (!window.confirm(`Tem certeza que deseja remover ${email}?`)) return;
    
    // 1. Apaga na nuvem primeiro
    try {
      await apiClient.delete(`/sync/users/${email}`);
    } catch (cloudErr) {
      console.warn('Erro ao apagar na nuvem, ou usuário já não existia lá:', cloudErr);
    }
    
    // 2. Apaga localmente
    await db.usuarios_sistema.delete(email);
    
    // 3. Força sincronização
    syncEngine.syncNow().catch(() => {});
    
    loadUsers();
    setSuccess(`Usuário ${email} removido com sucesso.`);
    setTimeout(() => setSuccess(''), 4000);
  };

  const handleResetPin = async (email: string) => {
    const newPin = window.prompt(`Digite o NOVO PIN de 4 a 6 números para ${email}:`);
    if (!newPin) return; // cancelou
    
    if (newPin.length < 4 || isNaN(Number(newPin))) {
      alert('O PIN deve conter pelo menos 4 números e apenas números!');
      return;
    }

    try {
      const pinHash = await sha256(newPin);
      await db.usuarios_sistema.update(email, { pin_acesso: pinHash });
      
      // Força a sincronização para jogar o novo PIN na nuvem (que usará o Upsert do nosso backend)
      syncEngine.syncNow().catch(() => {});
      
      setSuccess(`PIN de ${email} alterado com sucesso!`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      console.error(err);
      alert('Erro ao redefinir PIN.');
    }
  };

  // --- EXPORTAR BANCO DE DADOS EM JSON (Backup Offline) ---
  const handleExportBackup = async () => {
    try {
      const usuarios = await db.usuarios_sistema.toArray();
      const produtos = await db.produtos.toArray();
      const vendas = await db.vendas.toArray();
      const itens_venda = await db.itens_venda.toArray();

      const backupObj = {
        app: 'arraia-digital-pdv-dexie',
        version: '1.5.0',
        exportedAt: Date.now(),
        data: {
          usuarios,
          produtos,
          vendas,
          itens_venda,
        },
      };

      const jsonString = JSON.stringify(backupObj, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_arraia_digital_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Erro ao exportar backup.');
    }
  };

  // --- IMPORTAR BANCO DE DADOS EM JSON (Backup Offline) ---
  const handleImportBackup = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('ATENÇÃO: Importar um backup substituirá ou mesclará os dados locais atuais. Deseja prosseguir?')) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const backup = JSON.parse(text);

        if (backup.app !== 'arraia-digital-pdv-dexie') {
          alert('Arquivo de backup inválido ou incompatível!');
          return;
        }

        const data = backup.data;

        // Limpa e importa tabelas do Dexie em uma transação atômica
        await db.transaction('rw', [db.usuarios_sistema, db.produtos, db.vendas, db.itens_venda], async () => {
          if (data.usuarios) {
            await db.usuarios_sistema.clear();
            await db.usuarios_sistema.bulkAdd(data.usuarios);
          }
          if (data.produtos) {
            await db.produtos.clear();
            await db.produtos.bulkAdd(data.produtos);
          }
          if (data.vendas) {
            await db.vendas.clear();
            await db.vendas.bulkAdd(data.vendas);
          }
          if (data.itens_venda) {
            await db.itens_venda.clear();
            await db.itens_venda.bulkAdd(data.itens_venda);
          }
        });

        setSuccess('Backup importado e restaurado com sucesso via Dexie!');
        await loadUsers();
        setTimeout(() => setSuccess(''), 5000);
      } catch (err) {
        console.error(err);
        alert('Erro ao ler ou processar arquivo de backup.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 text-white select-none">
      
      {/* HEADER */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4 shadow-md">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Segurança e TI
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-rose-400 border border-red-500/20 font-bold">
                Super Admin
              </span>
            </h1>
            <p className="text-xs text-slate-400">Whitelist de Professores/Voluntários e Backups Físicos</p>
          </div>
        </div>
      </header>

      {/* ÁREA CENTRAL */}
      <main className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 align-content-start">
        
        {/* COLUNA 1: ADICIONAR VOLUNTÁRIO */}
        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 h-fit space-y-4">
          <h2 className="text-base font-black text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <UserPlus size={18} className="text-amber-500" /> Adicionar Voluntário à Whitelist
          </h2>

          <form onSubmit={handleAddUser} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Nome Completo</label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-500">
                  <User size={16} />
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Ex: Prof. Willians"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">E-mail Institucional</label>
              <div className="flex flex-col gap-1.5">
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-500">
                    <Mail size={16} />
                  </span>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="email.institucional"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAutocompleteEmail}
                  className="self-start px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-amber-500 transition-colors"
                >
                  + @escola.pr.gov.br
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">PIN Numérico de Acesso</label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-500">
                  <Key size={16} />
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Mínimo 4 números"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-white tracking-widest focus:outline-none focus:border-amber-400"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Nível de Permissão (Role)</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewRole('OPERADOR_CAIXA')}
                  className={`py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                    newRole === 'OPERADOR_CAIXA'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  Caixa Operador
                </button>
                <button
                  type="button"
                  onClick={() => setNewRole('ADMIN_OPERACIONAL')}
                  className={`py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                    newRole === 'ADMIN_OPERACIONAL'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  Gerente Admin
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-xl text-center">
                ⚠️ {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl text-center">
                ✅ {success}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:brightness-110 font-bold transition-all shadow-lg cursor-pointer"
            >
              Adicionar Voluntário
            </button>
          </form>
        </div>

        {/* COLUNA 2 e 3: LISTA DA WHITELIST E RECUPERAÇÃO FÍSICA */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* BANCO DE DADOS & RECUPERAÇÃO FÍSICA */}
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-base font-black text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Shield size={18} className="text-rose-400" /> Ferramentas de Recuperação Física (Offline-First)
            </h2>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              Em caso de queda completa de conexão e falha estrutural do hardware, você pode exportar todo o faturamento local e a whitelist em um arquivo JSON criptográfico para transferir e restaurar em outro tablet instantaneamente.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={handleExportBackup}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-850 hover:border-slate-700 text-sm font-bold text-slate-200 transition-all cursor-pointer shadow"
              >
                <Download size={16} className="text-amber-500" /> Exportar Backup JSON
              </button>

              <button
                onClick={handleImportBackup}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-850 hover:border-slate-700 text-sm font-bold text-slate-200 transition-all cursor-pointer shadow"
              >
                <Upload size={16} className="text-cyan-400" /> Importar Backup JSON
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
            </div>
          </div>

          {/* LISTA DA WHITELIST */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
            <div className="px-6 py-4 border-b border-slate-800">
              <h3 className="text-base font-black">Whitelist de Professores & Operadores</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-400 text-xs font-bold uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3">Nome</th>
                    <th className="px-6 py-3">E-mail Institucional</th>
                    <th className="px-6 py-3">Permissão</th>
                    <th className="px-6 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {users.map((u) => (
                    <tr key={u.email} className="hover:bg-slate-900/30">
                      <td className="px-6 py-4 font-bold text-white">{u.nome}</td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-300">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.nivel_acesso === 'SUPER_ADMIN'
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                            : u.nivel_acesso === 'ADMIN_OPERACIONAL'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {u.nivel_acesso}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleResetPin(u.email)}
                            title="Redefinir PIN"
                            className="p-1.5 rounded-lg bg-indigo-950/35 hover:bg-indigo-950/70 border border-indigo-900/30 text-indigo-400 hover:text-white transition-colors cursor-pointer"
                          >
                            <Key size={14} />
                          </button>
                          {u.nivel_acesso !== 'SUPER_ADMIN' && (
                            <button
                              onClick={() => handleDeleteUser(u.email)}
                              title="Remover Usuário"
                              className="p-1.5 rounded-lg bg-red-950/35 hover:bg-red-950/70 border border-red-900/30 text-rose-400 hover:text-white transition-colors cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </main>

    </div>
  );
}
