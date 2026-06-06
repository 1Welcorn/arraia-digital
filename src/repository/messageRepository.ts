import { db } from '../database/DatabaseConnection';
import type { Mensagem } from '../database/DatabaseConnection';

// Helper para gerar UUIDv4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const messageRepository = {
  async enviarMensagemGeral(remetente: string, conteudo: string): Promise<string> {
    const msg: Mensagem = {
      id: generateUUID(),
      tipo: 'GERAL',
      remetente,
      conteudo,
      lida: false, 
      timestamp: Date.now()
    };
    await db.mensagens.put(msg);
    return msg.id;
  },

  async enviarMensagemIndividual(remetente: string, destinatarioEmail: string, conteudo: string): Promise<string> {
    const msg: Mensagem = {
      id: generateUUID(),
      tipo: 'INDIVIDUAL',
      destinatarioEmail,
      remetente,
      conteudo,
      lida: false,
      timestamp: Date.now()
    };
    await db.mensagens.put(msg);
    return msg.id;
  },

  async marcarComoLida(id: string): Promise<void> {
    const msg = await db.mensagens.get(id);
    if (msg) {
      msg.lida = true;
      await db.mensagens.put(msg);
    }
  },
  
  async apagarMensagem(id: string): Promise<void> {
    await db.mensagens.delete(id);
  }
};
