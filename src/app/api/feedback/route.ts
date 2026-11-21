// Este programa é um software livre (Licença AGPLv3)
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@/utils/supabase/server';

const FEEDBACK_WINDOW_MS = 10 * 60 * 1000;
const FEEDBACK_MAX_REQUESTS = 5;
const feedbackRateMap = new Map<string, number[]>();

function checkFeedbackRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (feedbackRateMap.get(key) || []).filter((ts) => now - ts < FEEDBACK_WINDOW_MS);
  if (timestamps.length >= FEEDBACK_MAX_REQUESTS) {
    feedbackRateMap.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  feedbackRateMap.set(key, timestamps);
  return true;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Autenticação necessária para enviar feedback.' }, { status: 401 });
    }

    if (!checkFeedbackRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Muitos envios seguidos. Aguarde alguns minutos e tente novamente.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const tipo = String(body?.tipo || '').trim().slice(0, 60);
    const descricao = String(body?.descricao || '').trim().slice(0, 4000);
    const logInfo = String(body?.logInfo || '').trim().slice(0, 4000);
    const verifiedEmail = user.email || String(body?.userEmail || 'Desconhecido').slice(0, 160);

    if (!tipo || !descricao) {
      return NextResponse.json({ error: 'Tipo e descrição são obrigatórios.' }, { status: 400 });
    }

    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailUser || !emailPass) {
      console.error('Credenciais de email não configuradas no ambiente.');
      return NextResponse.json({ error: 'Erro de configuração do servidor.' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    const mailOptions = {
      from: emailUser,
      to: emailUser, // Mandando para si mesmo como notificação do app
      subject: `[Aurtistic Feedback] Novo Relatório: ${tipo}`,
      text: `
Usuário ID: ${user.id}
Usuário (Email): ${verifiedEmail}
Tipo: ${tipo}

Descrição do Feedback/Bug:
${descricao}

Logs Adicionais:
${logInfo || 'Nenhum log enviado.'}
      `,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true, message: 'Feedback enviado com sucesso!' });
  } catch (error: any) {
    console.error('Erro ao enviar feedback via email:', error);
    return NextResponse.json({ error: 'Erro interno ao tentar enviar feedback.' }, { status: 500 });
  }
}
