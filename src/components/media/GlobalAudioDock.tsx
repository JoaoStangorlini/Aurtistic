// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import { useAurtisticMedia } from './AurtisticMediaContext';

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function GlobalAudioDock() {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
    isMuted,
    isDockVisible,
    isDockExpanded,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    closeDock,
    setDockExpanded,
    playlist,
    playTrack,
  } = useAurtisticMedia();

  if (!isDockVisible || !currentTrack) return null;

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      role="region"
      aria-label="Reprodutor de Áudio Global Aurtistic"
      className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[90] w-[95%] max-w-2xl transition-all duration-300 ease-out"
    >
      <div className="bg-surface/95 backdrop-blur-xl border border-border-subtle hover:border-[#9D4EDD]/40 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.7)] p-3 md:p-4 text-fg">
        {/* Barra de Progresso Superior (Seekbar) */}
        <div className="relative w-full group mb-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.5}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            aria-label="Posição da faixa"
            className="w-full h-1.5 bg-surface-hover rounded-full appearance-none cursor-pointer accent-[#FFCC00] focus:outline-none focus:ring-1 focus:ring-[#FFCC00]"
            style={{
              background: `linear-gradient(to right, #FFCC00 ${progressPercent}%, #2D2D2D ${progressPercent}%)`,
            }}
          />
          <div className="flex justify-between items-center text-[10px] text-fg-secondary mt-1 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Linha Principal de Controles */}
        <div className="flex items-center justify-between gap-3">
          {/* Metadados da Faixa */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-lg bg-app border border-border-subtle flex items-center justify-center shrink-0 overflow-hidden relative">
              {currentTrack.coverUrl ? (
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-[#FFCC00] text-[20px]">
                  music_note
                </span>
              )}
              {isBuffering && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="material-symbols-outlined text-fg text-[16px] animate-spin">
                    progress_activity
                  </span>
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="text-xs md:text-sm font-bold truncate text-[#E5E2E1]">
                {currentTrack.title}
              </h4>
              <p className="text-[11px] text-fg-muted truncate">
                {currentTrack.artist || currentTrack.album || 'Servidor Aurtistic'}
              </p>
            </div>
          </div>

          {/* Botões de Ação Central (Prev / Play / Next) */}
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            {playlist.length > 1 && (
              <button
                type="button"
                onClick={prevTrack}
                className="w-8 h-8 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
                title="Faixa anterior"
              >
                <span className="material-symbols-outlined text-[20px]">skip_previous</span>
              </button>
            )}

            <button
              type="button"
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] flex items-center justify-center font-bold shadow-md hover:scale-105 transition-all"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
              aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
            >
              <span className="material-symbols-outlined text-[24px]">
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

            {playlist.length > 1 && (
              <button
                type="button"
                onClick={nextTrack}
                className="w-8 h-8 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
                title="Próxima faixa"
              >
                <span className="material-symbols-outlined text-[20px]">skip_next</span>
              </button>
            )}
          </div>

          {/* Controles Laterais (Volume, Expandir, Fechar) */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Volume (Oculto em telas mobile estreitas) */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className="text-fg-muted hover:text-fg transition-colors"
                title={isMuted ? 'Desmutar' : 'Mutar'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isMuted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
                </span>
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                aria-label="Volume do áudio"
                className="w-14 h-1 bg-surface-hover rounded-full appearance-none cursor-pointer accent-[#9D4EDD]"
              />
            </div>

            {/* Alternar detalhes da fila */}
            {playlist.length > 1 && (
              <button
                type="button"
                onClick={() => setDockExpanded(!isDockExpanded)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isDockExpanded
                    ? 'text-[#9D4EDD] bg-[#9D4EDD]/10'
                    : 'text-fg-muted hover:text-fg hover:bg-surface-hover'
                }`}
                title="Ver lista de reprodução"
              >
                <span className="material-symbols-outlined text-[18px]">queue_music</span>
              </button>
            )}

            {/* Fechar Dock */}
            <button
              type="button"
              onClick={closeDock}
              className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-[#db4437] hover:bg-[#db4437]/10 transition-colors"
              title="Fechar reprodutor"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Fila Expansível de Reprodução */}
        {isDockExpanded && playlist.length > 1 && (
          <div className="mt-3 pt-3 border-t border-border-subtle max-h-48 overflow-y-auto space-y-1">
            <p className="text-[10px] uppercase font-bold text-fg-muted tracking-wider mb-2">
              Fila de Reprodução ({playlist.length} faixas)
            </p>
            {playlist.map((track, idx) => {
              const isCurrent = track.id === currentTrack.id;
              return (
                <div
                  key={`${track.id}_${idx}`}
                  onClick={() => !isCurrent && playTrack(track)}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-[#9D4EDD]/20 text-[#9D4EDD] font-bold'
                      : 'hover:bg-surface-hover text-fg-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="material-symbols-outlined text-[14px]">
                      {isCurrent ? (isPlaying ? 'equalizer' : 'pause') : 'music_note'}
                    </span>
                    <span className="truncate">{track.title}</span>
                  </div>
                  {track.durationSeconds && (
                    <span className="text-[10px] text-fg-muted font-mono">
                      {formatTime(track.durationSeconds)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
