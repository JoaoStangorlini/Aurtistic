// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect } from 'react';
import { buildTenantStreamUrl, formatStorageBytes } from '@/lib/edge-urls';
import type { ExifMetadata } from '@/types';

export interface InPlaceFilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  relativePath: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  ticket?: string;
  serverUrl?: string;
  exifData?: ExifMetadata;
}

export function InPlaceFilePreviewModal({
  isOpen,
  onClose,
  relativePath,
  filename,
  mimeType = 'application/octet-stream',
  sizeBytes,
  ticket = '',
  serverUrl,
  exifData,
}: InPlaceFilePreviewModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const streamUrl = buildTenantStreamUrl(relativePath, ticket, {
    serverUrl,
  });

  const isImage =
    mimeType.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|avif|gif|bmp)$/i.test(filename);
  const isVideo =
    mimeType.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(filename);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-file-title"
      data-darkroom="true"
      className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 md:p-6"
    >
      {/* Barra Superior */}
      <div className="w-full max-w-5xl flex items-center justify-between gap-4 py-2 border-b border-border-subtle text-fg">
        <div className="flex items-center gap-3 truncate">
          <span className="material-symbols-outlined text-[#FFCC00] text-[24px]">
            {isImage ? 'image' : isVideo ? 'movie' : 'description'}
          </span>
          <div className="truncate">
            <h3 id="preview-file-title" className="text-sm md:text-base font-bold truncate">
              {filename}
            </h3>
            <p className="text-[11px] text-fg-muted truncate">
              {relativePath} {sizeBytes ? `• ${formatStorageBytes(sizeBytes)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={streamUrl}
            download={filename}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-surface-hover hover:bg-[#3D3D3D] text-fg rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
            title="Download do arquivo original"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span className="hidden sm:inline">Baixar</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface hover:bg-surface-hover text-fg-muted hover:text-fg flex items-center justify-center transition-colors"
            title="Fechar visualizador (Esc)"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>

      {/* Conteúdo Central */}
      <div className="flex-1 w-full max-w-5xl flex items-center justify-center overflow-hidden my-4 relative">
        {isImage ? (
          <img
            src={streamUrl}
            alt={filename}
            className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl transition-transform"
          />
        ) : isVideo ? (
          <video
            src={streamUrl}
            controls
            autoPlay
            className="max-h-[75vh] max-w-full rounded-lg shadow-2xl bg-black"
          />
        ) : (
          <div className="text-center p-8 bg-surface border border-border-subtle rounded-2xl max-w-md">
            <span className="material-symbols-outlined text-[#FFCC00] text-[48px] mb-3">
              draft
            </span>
            <p className="text-sm font-bold text-fg mb-2">{filename}</p>
            <p className="text-xs text-fg-muted mb-6">
              Pré-visualização direta não disponível no navegador para este tipo de arquivo ({mimeType}).
            </p>
            <a
              href={streamUrl}
              download={filename}
              className="px-5 py-2.5 bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] font-bold text-xs rounded-xl inline-flex items-center gap-2 transition-colors shadow-md"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Baixar Arquivo Completo
            </a>
          </div>
        )}
      </div>

      {/* Metadados EXIF da Foto (se existirem) */}
      {exifData && (exifData.camera || exifData.lens || exifData.focal || exifData.aperture || exifData.iso) && (
        <div className="w-full max-w-5xl bg-surface/80 border border-border-subtle rounded-xl px-4 py-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-fg-secondary font-mono">
          {exifData.camera && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-[#FFCC00]">photo_camera</span>
              {exifData.camera}
            </span>
          )}
          {exifData.lens && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">camera</span>
              {exifData.lens}
            </span>
          )}
          {exifData.focal && <span>{exifData.focal}</span>}
          {exifData.aperture && <span>{exifData.aperture}</span>}
          {exifData.shutter && <span>{exifData.shutter}</span>}
          {exifData.iso && <span>ISO {exifData.iso}</span>}
        </div>
      )}
    </div>
  );
}
