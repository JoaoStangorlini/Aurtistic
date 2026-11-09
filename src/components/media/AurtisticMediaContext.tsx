// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { refreshTenantTicketAction } from '@/app/(dashboard)/servidor/actions';
import { buildTenantStreamUrl } from '@/lib/edge-urls';
import { NoteEditorDrawer } from '@/components/servidor/NoteEditorDrawer';
import { InPlaceFilePreviewModal } from './InPlaceFilePreviewModal';
import type { ExifMetadata } from '@/types';

export interface MediaTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  relativePath: string;
  streamUrl?: string;
  itemTicket?: string;
  durationSeconds?: number;
}

export interface InPlaceNoteState {
  isOpen: boolean;
  folderPath: string;
  relativePath?: string | null;
  filename?: string;
  linkedTaskId?: string | null;
}

export interface InPlacePreviewState {
  isOpen: boolean;
  relativePath: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  itemTicket?: string;
  exifData?: ExifMetadata;
}

export interface AurtisticMediaContextType {
  // Áudio Player State
  currentTrack: MediaTrack | null;
  playlist: MediaTrack[];
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isDockVisible: boolean;
  isDockExpanded: boolean;
  mediaTicket: string | null;
  vaultTicket: string | null;
  activeTicket: string | null;
  getWriteTicket: () => Promise<string | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  lockedSrc: string;

  // Ações de Áudio
  playTrack: (track: MediaTrack, newPlaylist?: MediaTrack[]) => void;
  playAudioInPlace: (item: {
    relativePath: string;
    filename: string;
    artist?: string;
    itemTicket?: string;
  }) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  setVolume: (val: number) => void;
  toggleMute: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  closeDock: () => void;
  setDockExpanded: (expanded: boolean) => void;
  setPlaylist: (tracks: MediaTrack[]) => void;
  handleAudioError: () => Promise<void>;

  // InPlaceMediaHost Ações
  openNoteInPlace: (params: {
    relativePath?: string | null;
    folderPath?: string;
    filename?: string;
    linkedTaskId?: string | null;
  }) => void;
  closeNoteInPlace: () => void;
  openPhotoInPlace: (params: {
    relativePath: string;
    filename: string;
    mimeType?: string;
    sizeBytes?: number;
    itemTicket?: string;
    exifData?: ExifMetadata;
  }) => void;
  closePhotoInPlace: () => void;
}

const AurtisticMediaContext = createContext<AurtisticMediaContextType | null>(null);

export function useAurtisticMedia() {
  const ctx = useContext(AurtisticMediaContext);
  if (!ctx) {
    throw new Error('useAurtisticMedia deve ser utilizado dentro de um AurtisticMediaProvider');
  }
  return ctx;
}

export interface AurtisticMediaProviderProps {
  children: React.ReactNode;
  initialMediaTicket?: string;
  initialVaultTicket?: string;
  serverUrl?: string;
}

export function AurtisticMediaProvider({
  children,
  initialMediaTicket,
  initialVaultTicket,
  serverUrl,
}: AurtisticMediaProviderProps) {
  // Estado do Player de Áudio
  const [currentTrack, setCurrentTrack] = useState<MediaTrack | null>(null);
  const [playlist, setPlaylist] = useState<MediaTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isDockVisible, setIsDockVisible] = useState(false);
  const [isDockExpanded, setIsDockExpanded] = useState(false);
  const [lockedSrc, setLockedSrc] = useState<string>('');

  // [CORREÇÃO SPRINT 5]: Separação entre MediaTicket (readOnly: true, TTL 2h) e VaultTicket (readOnly: false, TTL 15m)
  const [activeMediaTicket, setActiveMediaTicket] = useState<string | null>(initialMediaTicket || null);
  const [activeVaultTicket, setActiveVaultTicket] = useState<string | null>(initialVaultTicket || null);
  const latestMediaTicketRef = useRef<string | null>(initialMediaTicket || null);
  const latestVaultTicketRef = useRef<string | null>(initialVaultTicket || null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);

  // Estados do InPlaceMediaHost
  const [noteState, setNoteState] = useState<InPlaceNoteState>({
    isOpen: false,
    folderPath: 'Arquivos',
  });
  const [previewState, setPreviewState] = useState<InPlacePreviewState>({
    isOpen: false,
    relativePath: '',
    filename: '',
  });

  // Constrói URL assinada para reprodução (usa ticket de mídia com TTL de 2h)
  const buildPlayableUrl = useCallback(
    (track: MediaTrack, forcedTicket?: string) => {
      if (track.streamUrl && !forcedTicket) return track.streamUrl;
      const ticketToUse = forcedTicket || track.itemTicket || latestMediaTicketRef.current || '';
      return buildTenantStreamUrl(track.relativePath, ticketToUse, { serverUrl });
    },
    [serverUrl]
  );

  // Renovação periódica de ticket de mídia (readOnly: true -> TTL 2h)
  const refreshMediaTicket = useCallback(async (): Promise<string | null> => {
    try {
      const res = await refreshTenantTicketAction({
        purpose: 'vault',
        readOnly: true, // Garante TTL de 2 horas (MEDIA_READONLY_TICKET_TTL_MS)
      });
      if (res.ok) {
        const rawToken = res.ticket.ticket;
        latestMediaTicketRef.current = rawToken;
        setActiveMediaTicket(rawToken);
        return rawToken;
      }
    } catch (err) {
      console.warn('[AurtisticMediaContext] Falha na renovação do ticket de mídia:', err);
    }
    return null;
  }, []);

  // Renovação periódica de ticket de cofre/escrita (readOnly: false -> TTL 15m)
  const refreshVaultTicket = useCallback(async (): Promise<string | null> => {
    try {
      const res = await refreshTenantTicketAction({
        purpose: 'vault',
        readOnly: false, // Permite escrita (upload e notas .md)
      });
      if (res.ok) {
        const rawToken = res.ticket.ticket;
        latestVaultTicketRef.current = rawToken;
        setActiveVaultTicket(rawToken);
        return rawToken;
      }
    } catch (err) {
      console.warn('[AurtisticMediaContext] Falha na renovação do ticket de escrita:', err);
    }
    return null;
  }, []);

  const getWriteTicket = useCallback(async (): Promise<string | null> => {
    if (latestVaultTicketRef.current) return latestVaultTicketRef.current;
    return refreshVaultTicket();
  }, [refreshVaultTicket]);

  // Renovação a cada 10 MINUTOS (10 * 60 * 1000) e listener de visibilitychange
  useEffect(() => {
    const interval = setInterval(() => {
      void refreshMediaTicket();
      void refreshVaultTicket();
    }, 10 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshMediaTicket();
        void refreshVaultTicket();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [refreshMediaTicket, refreshVaultTicket]);

  // Recuperação de erro de áudio (faixa > 2h ou queda temporária)
  const handleAudioError = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const savedTime = audio.currentTime || 0;
    const newTicket = await refreshMediaTicket();
    if (!newTicket) return;

    const freshUrl = buildPlayableUrl(currentTrack, newTicket);
    setLockedSrc(freshUrl);
    audio.src = freshUrl;
    audio.load();

    requestAnimationFrame(() => {
      audio.currentTime = savedTime;
      audio.play().catch(() => {});
    });
  }, [currentTrack, refreshMediaTicket, buildPlayableUrl]);

  const playTrack = useCallback(
    (track: MediaTrack, newPlaylist?: MediaTrack[]) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (newPlaylist && newPlaylist.length > 0) {
        setPlaylist(newPlaylist);
      }

      currentTrackIdRef.current = track.id;
      setCurrentTrack(track);
      setIsDockVisible(true);

      const targetSrc = buildPlayableUrl(track);
      // NUNCA muta lockedSrc se for a mesma faixa tocando!
      if (audio.src !== targetSrc) {
        setLockedSrc(targetSrc);
        audio.src = targetSrc;
        audio.load();
      }

      audio.play().catch((err) => {
        console.warn('[GlobalAudioDock] Falha ao iniciar reprodução:', err);
      });
    },
    [buildPlayableUrl]
  );

  const playAudioInPlace = useCallback(
    (item: { relativePath: string; filename: string; artist?: string; itemTicket?: string }) => {
      playTrack({
        id: item.relativePath,
        title: item.filename.replace(/\.[^.]+$/, ''),
        artist: item.artist || 'Aurtistic Storage',
        relativePath: item.relativePath,
        itemTicket: item.itemTicket,
      });
    },
    [playTrack]
  );

  const handleNextTrack = useCallback(() => {
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
      playTrack(playlist[currentIndex + 1]);
    }
  }, [currentTrack, playlist, playTrack]);

  const handlePrevTrack = useCallback(() => {
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex > 0) {
      playTrack(playlist[currentIndex - 1]);
    }
  }, [currentTrack, playlist, playTrack]);

  const handleAudioErrorRef = useRef(handleAudioError);
  useEffect(() => {
    handleAudioErrorRef.current = handleAudioError;
  }, [handleAudioError]);

  const handleNextTrackRef = useRef(handleNextTrack);
  useEffect(() => {
    handleNextTrackRef.current = handleNextTrack;
  }, [handleNextTrack]);

  // Inicializa o elemento HTMLAudioElement uma única vez
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onEnded = () => {
      setIsPlaying(false);
      handleNextTrackRef.current();
    };
    const onError = () => {
      setIsBuffering(false);
      setIsPlaying(false);
      void handleAudioErrorRef.current();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }, [isPlaying]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || 0));
    setCurrentTime(audio.currentTime);
  }, []);

  const setVolume = useCallback((val: number) => {
    const audio = audioRef.current;
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (audio) {
      audio.volume = clamped;
      if (clamped > 0 && audio.muted) {
        audio.muted = false;
        setIsMuted(false);
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMuted = !audio.muted;
    audio.muted = nextMuted;
    setIsMuted(nextMuted);
  }, []);

  const closeDock = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    setLockedSrc('');
    setIsPlaying(false);
    setIsDockVisible(false);
    setCurrentTrack(null);
  }, []);

  // InPlaceMediaHost Controles
  const openNoteInPlace = useCallback(
    (params: {
      relativePath?: string | null;
      folderPath?: string;
      filename?: string;
      linkedTaskId?: string | null;
    }) => {
      setNoteState({
        isOpen: true,
        folderPath: params.folderPath || (params.relativePath ? params.relativePath.split('/')[0] : 'Arquivos'),
        initialRelativePath: params.relativePath,
        initialFilename: params.filename,
        linkedTaskId: params.linkedTaskId,
      } as InPlaceNoteState);
    },
    []
  );

  const closeNoteInPlace = useCallback(() => {
    setNoteState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openPhotoInPlace = useCallback(
    (params: {
      relativePath: string;
      filename: string;
      mimeType?: string;
      sizeBytes?: number;
      itemTicket?: string;
      exifData?: ExifMetadata;
    }) => {
      setPreviewState({
        isOpen: true,
        relativePath: params.relativePath,
        filename: params.filename,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        itemTicket: params.itemTicket || latestMediaTicketRef.current || undefined,
        exifData: params.exifData,
      });
    },
    []
  );

  const closePhotoInPlace = useCallback(() => {
    setPreviewState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const contextValue = useMemo<AurtisticMediaContextType>(
    () => ({
      currentTrack,
      playlist,
      isPlaying,
      isBuffering,
      currentTime,
      duration,
      volume,
      isMuted,
      isDockVisible,
      isDockExpanded,
      mediaTicket: activeMediaTicket,
      vaultTicket: activeVaultTicket,
      activeTicket: activeMediaTicket,
      getWriteTicket,
      audioRef,
      lockedSrc,
      playTrack,
      playAudioInPlace,
      togglePlay,
      pause,
      resume,
      seek,
      setVolume,
      toggleMute,
      nextTrack: handleNextTrack,
      prevTrack: handlePrevTrack,
      closeDock,
      setDockExpanded: setIsDockExpanded,
      setPlaylist,
      handleAudioError,
      openNoteInPlace,
      closeNoteInPlace,
      openPhotoInPlace,
      closePhotoInPlace,
    }),
    [
      currentTrack,
      playlist,
      isPlaying,
      isBuffering,
      currentTime,
      duration,
      volume,
      isMuted,
      isDockVisible,
      isDockExpanded,
      activeMediaTicket,
      activeVaultTicket,
      getWriteTicket,
      lockedSrc,
      playTrack,
      playAudioInPlace,
      togglePlay,
      pause,
      resume,
      seek,
      setVolume,
      toggleMute,
      handleNextTrack,
      handlePrevTrack,
      closeDock,
      setPlaylist,
      handleAudioError,
      openNoteInPlace,
      closeNoteInPlace,
      openPhotoInPlace,
      closePhotoInPlace,
    ]
  );

  return (
    <AurtisticMediaContext.Provider value={contextValue}>
      {children}

      {/* Host Global de Notas In-Place: usa activeVaultTicket para salvar sem 403 */}
      {noteState.isOpen && (
        <NoteEditorDrawer
          isOpen={noteState.isOpen}
          onClose={closeNoteInPlace}
          folderPath={noteState.folderPath}
          initialRelativePath={noteState.relativePath}
          initialFilename={noteState.filename}
          ticket={activeVaultTicket || activeMediaTicket || ''}
          serverUrl={serverUrl}
          linkedTaskId={noteState.linkedTaskId}
        />
      )}

      {/* Host Global de Fotos e Mídias In-Place: usa ticket com TTL 2h */}
      {previewState.isOpen && (
        <InPlaceFilePreviewModal
          isOpen={previewState.isOpen}
          onClose={closePhotoInPlace}
          relativePath={previewState.relativePath}
          filename={previewState.filename}
          mimeType={previewState.mimeType}
          sizeBytes={previewState.sizeBytes}
          ticket={previewState.itemTicket || activeMediaTicket || ''}
          serverUrl={serverUrl}
          exifData={previewState.exifData}
        />
      )}
    </AurtisticMediaContext.Provider>
  );
}
