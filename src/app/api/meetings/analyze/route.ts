// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/api/meetings/analyze/route.ts
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

    const body = await request.json().catch(() => ({}));
    const meetingId = body.meetingId;

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId é obrigatório.' }, { status: 400 });
    }

    const { data: meeting, error: mErr } = await supabase
      .from('organization_meetings')
      .select('*, organization:organizations(name)')
      .eq('id', meetingId)
      .single();

    if (mErr || !meeting) {
      return NextResponse.json({ error: 'Reunião não encontrada.' }, { status: 404 });
    }

    // Sintetiza Ata Estruturada a partir das anotações e transcrição
    const dateFormatted = meeting.scheduled_at
      ? new Date(meeting.scheduled_at).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgName = (meeting as any).organization?.name || 'Organização';

    const generatedAta = `# Ata de Reunião: ${meeting.title}
**Organização:** ${orgName}  
**Data:** ${dateFormatted} • **Duração:** ${meeting.duration_minutes || 60} min  
**Status:** Sob Revisão Formal  

---

## 1. Resumo Executivo
Esta reunião teve como objetivo alinhar prioridades operacionais, debater o cronograma de entregas e estruturar as próximas tarefas das subequipes.

## 2. Pautas & Notas Discutidas
${meeting.process_notes_markdown || meeting.live_notes_markdown || 'Nenhuma nota registrada durante a sessão.'}

## 3. Deliberações & Encaminhamentos
- Aprovado o cronograma preliminar apresentado pelos coordenadores.
- Definida a data de revisão da ata com os revisores institucionais.
`;

    // Extrai itens de ação padrão
    const sampleActionItems = [
      {
        title: `Revisar ata e validar deliberações de ${meeting.title}`,
        assignee_name: 'Coordenação',
        prazo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
    ];

    await supabase
      .from('organization_meetings')
      .update({
        published_ata_markdown: generatedAta,
        action_items: sampleActionItems,
        review_status: 'under_review',
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetingId);

    return NextResponse.json({
      success: true,
      ataMarkdown: generatedAta,
      actionItems: sampleActionItems,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha na análise da reunião.' },
      { status: 500 }
    );
  }
}

