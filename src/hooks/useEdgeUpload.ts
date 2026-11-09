// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useState, useCallback } from 'react';
import { uploadTenantFileDirect } from '@/lib/edge-client';
import { syncUserFileIndexAction, type EcosystemLinksPatch } from '@/app/(dashboard)/servidor/actions';

export interface UseEdgeUploadOptions {
  ticket: string;
  serverUrl?: string;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

export function useEdgeUpload({
  ticket,
  serverUrl,
  onSuccess,
  onError,
}: UseEdgeUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);

  const uploadFiles = useCallback(
    async (
      fileList: FileList | File[] | null,
      targetFolder: string,
      ecosystemLinks?: EcosystemLinksPatch
    ) => {
      if (!fileList || fileList.length === 0) return { ok: false, count: 0 };
      setUploading(true);
      setProgressStatus(`Iniciando upload de ${fileList.length} arquivo(s)...`);

      const folder = targetFolder || 'Arquivos';
      const isPortfolioFolder = folder === 'Portfolio' || folder.startsWith('Portfolio/');
      const isCurriculumFolder = folder === 'Curriculo' || folder.startsWith('Curriculo/');

      try {
        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          setProgressStatus(`Enviando ${i + 1}/${fileList.length}: ${file.name}...`);

          const mutation = await uploadTenantFileDirect({
            file,
            folderPath: folder,
            ticket,
            serverUrl,
          });

          await syncUserFileIndexAction({
            mutation,
            ecosystemLinks: {
              ...(isPortfolioFolder ? { showInPortfolio: true, visibility: 'public' } : {}),
              ...(isCurriculumFolder ? { showInCurriculum: true, visibility: 'public' } : {}),
              ...ecosystemLinks,
            },
          });
        }

        setProgressStatus(null);
        onSuccess?.();
        return { ok: true, count: fileList.length };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        setProgressStatus(null);
        onError?.(error);
        return { ok: false, error: error.message };
      } finally {
        setUploading(false);
      }
    },
    [ticket, serverUrl, onSuccess, onError]
  );

  return {
    uploading,
    progressStatus,
    uploadFiles,
  };
}

