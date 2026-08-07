import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { tipo, descricao, userEmail, logInfo } = await req.json();

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
Usuário (Email): ${userEmail || 'Desconhecido'}
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
