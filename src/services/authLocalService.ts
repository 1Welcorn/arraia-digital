import { userRepository, sha256 } from '../repository/userRepository';

export interface UserSession {
  email: string;
  nome: string;
  role: 'SUPER_ADMIN' | 'ADMIN_OPERACIONAL' | 'OPERADOR_CAIXA';
}

const SESSION_KEY = 'arraia_digital_session';

export const authLocalService = {
  async login(email: string, pin: string): Promise<UserSession> {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error('E-mail caipira não cadastrado na whitelist, sô!');
    }

    if (user.ativo === 0) {
      throw new Error('Este usuário está inativo, fale com a direção!');
    }

    // Calcula o hash em SHA-256 e compara
    const inputPinHash = await sha256(pin);
    if (user.pin_acesso !== inputPinHash) {
      throw new Error('PIN de acesso incorreto! Tente de novo, compadre.');
    }

    const session: UserSession = {
      email: user.email,
      nome: user.nome,
      role: user.nivel_acesso,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  },

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
  },

  getCurrentUser(): UserSession | null {
    const sessionStr = localStorage.getItem(SESSION_KEY);
    if (!sessionStr) return null;
    try {
      return JSON.parse(sessionStr) as UserSession;
    } catch {
      this.logout();
      return null;
    }
  },

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  },

  // Hierarquia de segurança: SUPER_ADMIN > ADMIN_OPERACIONAL > OPERADOR_CAIXA
  checkRole(requiredRole: 'SUPER_ADMIN' | 'ADMIN_OPERACIONAL' | 'OPERADOR_CAIXA'): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    const rolesPriority = {
      SUPER_ADMIN: 3,
      ADMIN_OPERACIONAL: 2,
      OPERADOR_CAIXA: 1,
    };

    const userPriority = rolesPriority[user.role] || 0;
    const requiredPriority = rolesPriority[requiredRole] || 0;

    return userPriority >= requiredPriority;
  }
};
