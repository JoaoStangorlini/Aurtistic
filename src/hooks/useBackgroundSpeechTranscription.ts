// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/hooks/useBackgroundSpeechTranscription.ts
'use client';

import { useState, useRef, useCallback } from 'react';

export interface UseBackgroundSpeechTranscriptionOptions {
  meetingId: string;
  onChunkTranscribed?: (text: string) => void;
  onError?: (err: Error) => void;
  onDisplayTrackEnded?: () => void;
}

export function useBackgroundSpeechTranscription({
  meetingId,
  onChunkTranscribed,
  onError,
  onDisplayTrackEnded,
}: UseBackgroundSpeechTranscriptionOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isProcessingLastChunk, setIsProcessingLastChunk] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const pendingFlushResolveRef = useRef<(() => void) | null>(null);

  const sendAudioChunkToServer = useCallback(
    async (blob: Blob): Promise<string> => {
      if (blob.size === 0) return '';
      const formData = new FormData();
      formData.append('meetingId', meetingId);
      formData.append('audioChunk', blob, 'chunk.webm');

      const res = await fetch('/api/meetings/transcribe-chunk', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Falha no upload do fragmento de áudio (${res.status})`);
      }

      const data = await res.json();
      return data.text || '';
    },
    [meetingId]
  );

  const startRecording = useCallback(
    async (includeSystemAudio: boolean = false) => {
      try {
        // [CORREÇÃO OBRIGATÓRIA 7.1]: AudioContext na taxa nativa do sistema (sem sampleRate fixo)
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const destination = audioCtx.createMediaStreamDestination();

        // 1. Microfone Local
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(destination);

        // 2. Áudio da Aba / Sistema (opcional para reuniões remotas)
        if (includeSystemAudio && navigator.mediaDevices.getDisplayMedia) {
          try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            });
            displayStreamRef.current = displayStream;

            const displayAudioTracks = displayStream.getAudioTracks();
            if (displayAudioTracks.length > 0) {
              const displaySource = audioCtx.createMediaStreamSource(
                new MediaStream(displayAudioTracks)
              );
              displaySource.connect(destination);

              // [CORREÇÃO OBRIGATÓRIA 7.2]: Listener onended na trilha de áudio do getDisplayMedia
              displayAudioTracks[0].onended = () => {
                onDisplayTrackEnded?.();
              };
            }
          } catch {
            // Se o usuário cancelar compartilhamento de tela, mantém o mic local ativo
          }
        }

        const combinedStream = destination.stream;
        combinedStreamRef.current = combinedStream;

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/mp4';

        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          audioBitsPerSecond: 48000,
        });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0) {
            try {
              const text = await sendAudioChunkToServer(e.data);
              if (text) {
                setTranscribedText((prev) => (prev ? `${prev}\n${text}` : text));
                onChunkTranscribed?.(text);
              }
            } catch (err: unknown) {
              onError?.(err instanceof Error ? err : new Error(String(err)));
            }
          }

          // Se estivermos em processo de flush e o gravador encerrou
          if (pendingFlushResolveRef.current) {
            pendingFlushResolveRef.current();
            pendingFlushResolveRef.current = null;
          }
        };

        // Dispara ciclo de 12 segundos por fragmento
        recorder.start(12000);
        setIsRecording(true);
      } catch (err: unknown) {
        onError?.(err instanceof Error ? err : new Error('Falha ao iniciar captura de áudio.'));
      }
    },
    [sendAudioChunkToServer, onChunkTranscribed, onError, onDisplayTrackEnded]
  );

  // [CORREÇÃO OBRIGATÓRIA 7.3]: stopAndFlushRecording() aguarda o retorno do último fragmento
  const stopAndFlushRecording = useCallback(async (): Promise<void> => {
    setIsProcessingLastChunk(true);

    await new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve();
        return;
      }

      pendingFlushResolveRef.current = resolve;
      recorder.stop();
    });

    // Encerra streams e AudioContext
    if (combinedStreamRef.current) {
      combinedStreamRef.current.getTracks().forEach((t) => t.stop());
      combinedStreamRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setIsProcessingLastChunk(false);
  }, []);

  return {
    isRecording,
    transcribedText,
    isProcessingLastChunk,
    startRecording,
    stopAndFlushRecording,
  };
}

