import QRCode from 'qrcode';

// Função para limpar string conforme as regras do padrão Pix (apenas ASCII, sem acentos, maiúsculas)
function cleanString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^A-Za-z0-9 ]/g, '') // Mantém apenas letras e números
    .toUpperCase();
}

// Formata campo no padrão EMV (ID + Tamanho com 2 dígitos + Valor)
function formatField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

// Calcula o checksum CRC16 CCITT (polinômio 0x1021, valor inicial 0xFFFF)
export function calculateCRC16(str: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      const bit = ((code >> (7 - j)) & 1) === 1;
      const c15 = ((crc >> 15) & 1) === 1;
      crc <<= 1;
      if (c15 !== bit) {
        crc ^= polynomial;
      }
    }
  }

  crc &= 0xffff;
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Normaliza a chave Pix para os padrões exigidos pelo Banco Central
function normalizePixKey(key: string): string {
  let k = key.trim();
  
  // Se for email, retorna minúsculo e sem pontuação a mais
  if (k.includes('@')) return k.toLowerCase();
  
  // Se for EVP (chave aleatória UUID)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return k.toLowerCase();
  
  // Extrai apenas números
  let digits = k.replace(/\D/g, '');
  
  // Se for telefone/celular (Ex: 11999999999) - O padrão Pix exige +55 no começo
  if (digits.length === 11) return '+55' + digits;
  if (digits.length === 12 || digits.length === 13) {
    if (digits.startsWith('55')) return '+' + digits;
  }
  
  // Se for CPF (11) ou CNPJ (14), retorna apenas números
  if (digits.length === 11 || digits.length === 14) return digits;
  
  // Se nada der match perfeitamente, tenta mandar o que o usuário digitou
  return k;
}

export const pixService = {
  // Gera o código Pix Copia e Cola (Payload completo)
  generatePixCode(
    chavePix: string,
    valor: number,
    recebedorNome: string = 'ARRAIA DIGITAL',
    recebedorCidade: string = 'CURITIBA'
  ): string {
    const cleanedNome = cleanString(recebedorNome).substring(0, 25) || 'LOJA';
    const cleanedCidade = cleanString(recebedorCidade).substring(0, 15) || 'CIDADE';

    // 00 - Payload Format Indicator (Fixo: 01)
    const payloadFormat = formatField('00', '01');

    // 26 - Merchant Account Information (Contém a chave Pix)
    const gui = formatField('00', 'br.gov.bcb.pix');
    const key = formatField('01', normalizePixKey(chavePix));
    const merchantAccountInfo = formatField('26', gui + key);

    // 52 - Merchant Category Code (Fixo: 0000)
    const merchantCategory = formatField('52', '0000');

    // 53 - Transaction Currency (Fixo: 986 para Real BRL)
    const currency = formatField('53', '986');

    // 54 - Transaction Amount (Valor com duas casas decimais)
    const amountStr = valor.toFixed(2);
    const amount = formatField('54', amountStr);

    // 58 - Country Code (Fixo: BR)
    const country = formatField('58', 'BR');

    // 59 - Merchant Name (Nome da escola / recebedor)
    const merchantName = formatField('59', cleanedNome);

    // 60 - Merchant City (Cidade da escola)
    const merchantCity = formatField('60', cleanedCidade);

    // 62 - Additional Data Field Template (TxID padrão offline)
    const txid = formatField('05', '***'); // Indica TxID indefinido/estático livre
    const additionalData = formatField('62', txid);

    // Monta a string base excluindo o CRC
    const basePayload =
      payloadFormat +
      merchantAccountInfo +
      merchantCategory +
      currency +
      amount +
      country +
      merchantName +
      merchantCity +
      additionalData +
      '6304'; // ID 63, tamanho 04 para o CRC

    // Calcula o CRC16 da base
    const crc = calculateCRC16(basePayload);

    return basePayload + crc;
  },

  // Renderiza o QR Code em um elemento Canvas HTML (Offline)
  async drawQrCodeToCanvas(canvas: HTMLCanvasElement, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      QRCode.toCanvas(
        canvas,
        text,
        {
          width: 280,
          margin: 1,
          color: {
            dark: '#1e293b', // Slate 800 para boa leitura
            light: '#ffffff',
          },
        },
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
    });
  },

  // Gera uma representação base64 (Data URI) do QR Code para tags img
  async generateQrCodeDataUrl(text: string): Promise<string> {
    return QRCode.toDataURL(text, {
      width: 280,
      margin: 1,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
    });
  }
};
