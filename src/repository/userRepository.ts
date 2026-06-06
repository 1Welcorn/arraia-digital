import { db } from '../database/DatabaseConnection';
import type { UsuarioSistema } from '../database/DatabaseConnection';

export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const userRepository = {
  async seedDefaultUsers(): Promise<void> {
    const count = await db.usuarios_sistema.count();
    if (count === 0) {
      const superAdminPin = await sha256('112233');
      const adminPin = await sha256('445566');
      const operadorPin = await sha256('123456');

      await db.usuarios_sistema.bulkAdd([
        {
          email: 'super.admin@escola.pr.gov.br',
          nome: 'Super Admin - Diretor',
          pin_acesso: superAdminPin,
          nivel_acesso: 'SUPER_ADMIN',
          ativo: 1,
        },
        {
          email: 'gerente.festa@escola.pr.gov.br',
          nome: 'Prof. Gerente de Caixa',
          pin_acesso: adminPin,
          nivel_acesso: 'ADMIN_OPERACIONAL',
          ativo: 1,
        },
        {
          email: 'operador.caixa@escola.pr.gov.br',
          nome: 'Operador Voluntário',
          pin_acesso: operadorPin,
          nivel_acesso: 'OPERADOR_CAIXA',
          ativo: 1,
        }
      ]);

      console.log('Usuários semeados via Dexie com sucesso!');
    }

    // Garante que o e-mail do Willians esteja na whitelist para testes locais
    const williansEmail = 'willians.souza@escola.pr.gov.br';
    const hasWillians = await db.usuarios_sistema.get(williansEmail);
    if (!hasWillians) {
      const williansPin = await sha256('123456');
      await db.usuarios_sistema.put({
        email: williansEmail,
        nome: 'Willians Souza - Diretor',
        pin_acesso: williansPin,
        nivel_acesso: 'SUPER_ADMIN',
        ativo: 1,
      });
      console.log(`Usuário ${williansEmail} adicionado com sucesso!`);
    }
  },

  async findByEmail(email: string): Promise<UsuarioSistema | undefined> {
    await this.seedDefaultUsers();
    return db.usuarios_sistema.get(email.trim().toLowerCase());
  },

  async getAllUsers(): Promise<UsuarioSistema[]> {
    await this.seedDefaultUsers();
    return db.usuarios_sistema.toArray();
  },

  async saveUser(user: UsuarioSistema): Promise<string> {
    user.email = user.email.trim().toLowerCase();
    await db.usuarios_sistema.put(user);
    return user.email;
  },

  async deleteUser(email: string): Promise<void> {
    await db.usuarios_sistema.delete(email.trim().toLowerCase());
  },
};
