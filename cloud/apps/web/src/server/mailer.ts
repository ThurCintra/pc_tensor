export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

/**
 * Envio de e-mail pela API do Resend (RESEND_API_KEY). Sem chave configurada, em desenvolvimento,
 * o e-mail sai no log do servidor para dar para testar o fluxo; em produção sem chave, falha.
 */
export const sendMail: Mailer = async (mail) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') throw new Error('RESEND_API_KEY não configurada.');
    console.info(`[mailer] Para: ${mail.to}\nAssunto: ${mail.subject}\n\n${mail.text}`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text }),
  });
  if (!response.ok) throw new Error(`Falha ao enviar e-mail (${response.status}).`);
};
