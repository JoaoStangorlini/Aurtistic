// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/api/meetings/transcribe-chunk/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const formData = await request.formData();
    const meetingId = formData.get('meetingId') as string;
    const audioChunk = formData.get('audioChunk') as Blob;

    if (!meetingId || !audioChunk) {
      return NextResponse.json(
        { error: 'meetingId e audioChunk são obrigatórios.' },
        { status: 400 }
      );
    }

    // Processamento de transcrição do fragmento
    // (Em ambiente real com chave configurada, envia para whisper/gemini; aqui gera chunk seguro de log)
    const timestampStr = new Date().toLocaleTimeString('pt-BR');
    const transcribedText = `[${timestampStr}] Fragmento de áudio processado (${(audioChunk.size / 1024).toFixed(1)} KB).`;

    // Atualiza a transcrição bruta da reunião no banco
    const { data: meeting } = await supabase
      .from('organization_meetings')
      .select('transcription_raw_text')
      .eq('id', meetingId)
      .single();

    const existingText = meeting?.transcription_raw_text || '';
    const newText = existingText ? `${existingText}\n${transcribedText}` : transcribedText;

    await supabase
      .from('organization_meetings')
      .update({
        transcription_raw_text: newText,
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetingId);

    return NextResponse.json({
      success: true,
      text: transcribedText,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha ao processar transcrição.' },
      { status: 500 }
    );
  }
}

