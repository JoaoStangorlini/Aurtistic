// Este programa é um software livre (Licença AGPLv3)
/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import type {
  EdgeTrashItem,
  EdgeVaultEntry,
  ShareLinkRow,
  Task,
  UserFileIndexRow,
  UserStorageProfile,
} from '@/types';
import {
  computeUnindexedDiskEntries,
  createTenantFolderDirect,
  deleteTenantEntryDirect,
  emptyTenantTrashDirect,
  fetchTenantDirectory,
  fetchTenantTrashDirect,
  renameOrMoveTenantEntryDirect,
  restoreTenantTrashItemDirect,
} from '@/lib/edge-client';
import {
  buildTenantStreamUrl,
  buildTenantThumbUrl,
  buildTenantZipUrl,
  formatStorageBytes,
} from '@/lib/edge-urls';
import { useTenantTicketRefresh } from '@/hooks/useTenantTicketRefresh';
import {
  createShareLinkAction,
  deleteShareLinkAction,
  reconcileFolderIndexAction,
  syncUserFileIndexAction,
  refreshOrganizationTicketAction,
  requestEventQuotaBoostAction,
  cascadeFolderUpdateAction,
  updateFileEcosystemLinksAction,
} from '@/app/(dashboard)/servidor/actions';
import {
  type UploadItem,
  extractFilesFromDataTransfer,
  extractFilesFromFileList,
  extractFilesFromZip,
} from '@/lib/file-upload-helpers';
import { StorageQuotaCard } from './StorageQuotaCard';
import { NoteEditorDrawer } from './NoteEditorDrawer';
import { PinLockModal } from './PinLockModal';
import { FileEcosystemMenu } from './FileEcosystemMenu';
import { AdminQuotaGovernancePanel } from './AdminQuotaGovernancePanel';
import { VaultIdeTreeSidebar } from './VaultIdeTreeSidebar';
import { VaultIdeWorkbench } from './VaultIdeWorkbench';
import { VaultPreviewPanel } from './VaultPreviewPanel';
import { VaultUploadManagerModal } from './VaultUploadManagerModal';
import {
  VaultContextMenu,
  type FolderCustomMeta,
} from './VaultContextMenu';
import { VaultActionDialog } from './VaultActionDialog';

export interface UserOrganizationVaultOption {
  id: string;
  name: string;
  slug: string;
  role: string;
  can_upload_vault: boolean;
  quotaBytes: number;
  usedBytes: number;
  boostActive: boolean;
  boostExpiresAt?: string | null;
  boostReason?: string | null;
}

export interface UserVaultWorkspaceProps {
  profile: UserStorageProfile;
  isApprovedForStorage: boolean;
  effectiveQuotaBytes: number;
  hasActiveEventBoost: boolean;
  initialVaultTicket: string;
  serverUrl: string;
  initialIndexedFiles: UserFileIndexRow[];
  initialShareLinks: ShareLinkRow[];
  userTasks: Task[];
  userOrganizations?: UserOrganizationVaultOption[];
}

type ActiveTab = 'vault' | 'shares' | 'trash' | 'admin_quotas' | 'admin_telemetry';

type VaultLayoutMode = 'grid' | 'list' | 'ide';

function getInitialVaultLayout(): VaultLayoutMode {
  if (typeof window === 'undefined') return 'grid';
  try {
    const saved = localStorage.getItem('aurtistic_vault_layout_mode');
    if (saved === 'grid' || saved === 'list' || saved === 'ide') return saved;
  } catch {}
  return 'grid';
}

function getInitialPreviewOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem('aurtistic_vault_preview_open');
    if (saved !== null) return saved === 'true';
    return window.innerWidth >= 1280;
  } catch {
    return false;
  }
}

export function UserVaultWorkspace({
  profile,
  isApprovedForStorage,
  effectiveQuotaBytes,
  hasActiveEventBoost,
  initialVaultTicket,
  serverUrl,
  initialIndexedFiles,
  initialShareLinks,
  userTasks,
  userOrganizations = [],
}: UserVaultWorkspaceProps) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgVaultTicket, setOrgVaultTicket] = useState<string | null>(null);

  // Modal Boost Evento
  const [isBoostModalOpen, setIsBoostModalOpen] = useState(false);
  const [boostEventName, setBoostEventName] = useState('');
  const [boostDays, setBoostDays] = useState(14);
  const [boostGb, setBoostGb] = useState(50);
  const [boostTargetScope, setBoostTargetScope] = useState<'personal' | 'org'>('personal');
  const [isSubmittingBoost, setIsSubmittingBoost] = useState(false);
  const [boostFeedback, setBoostFeedback] = useState<string | null>(null);

  const selectedOrg = useMemo(() => {
    return userOrganizations.find((o) => o.id === selectedOrgId) || null;
  }, [userOrganizations, selectedOrgId]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('vault');
  const [currentFolder, setCurrentFolder] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('folder');
      if (p) return p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    }
    return '';
  });
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ name: string; path: string }>>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('folder');
      if (p) {
        const clean = p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const parts = clean.split('/');
        const crumbs = [{ name: 'Meus Arquivos', path: '' }];
        let cur = '';
        for (const pt of parts) {
          cur = cur ? `${cur}/${pt}` : pt;
          crumbs.push({ name: pt, path: cur });
        }
        return crumbs;
      }
    }
    return [{ name: 'Meus Arquivos', path: '' }];
  });
  const [folders, setFolders] = useState<EdgeVaultEntry[]>([]);
  const [files, setFiles] = useState<EdgeVaultEntry[]>([]);
  const [usedBytes, setUsedBytes] = useState(profile.used_bytes || 0);
  const [isEdgeOnline, setIsEdgeOnline] = useState<boolean | null>(null);
  const [isHdConnected, setIsHdConnected] = useState<boolean | null>(null);
  const [loadingDir, setLoadingDir] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  // PINs desbloqueados nesta sessão
  const [unlockedPins, setUnlockedPins] = useState<string[]>([]);
  const { ticket, refreshTicket } = useTenantTicketRefresh(initialVaultTicket, 'vault', {
    unlockedPins,
    readOnly: !isApprovedForStorage,
  });

  const activeTicket = selectedOrgId && orgVaultTicket ? orgVaultTicket : ticket;

  // Índice local dos 4 Pilares
  const [indexedFiles] = useState<UserFileIndexRow[]>(initialIndexedFiles);
  const indexedMap = useMemo(() => {
    const map = new Map<string, UserFileIndexRow>();
    for (const row of indexedFiles) {
      map.set(row.relative_path, row);
    }
    return map;
  }, [indexedFiles]);

  // Upload e criação de pastas/notas
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const noteInputRef = useRef<HTMLInputElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragCounter = useRef(0);

  // Gerenciador de Uploads (Pop-up de Confirmação & Dock Minimizado)
  const [uploadManagerOpen, setUploadManagerOpen] = useState(false);
  const [uploadManagerInitialItems, setUploadManagerInitialItems] = useState<UploadItem[]>([]);

  const handleOpenUploadManager = (items?: UploadItem[]) => {
    setUploadManagerInitialItems(items || []);
    setUploadManagerOpen(true);
  };

  // Prevenção global de comportamento padrão do navegador em Drag & Drop
  // Evita que soltar arquivos fora da área específica abra arquivos em nova aba ou exiba cursor proibido
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);

    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, []);

  // Fecha o menu suspenso de ações ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setIsAddMenuOpen(false);
      }
    }
    if (isAddMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isAddMenuOpen]);

  // Gaveta de notas .md / .txt
  const [noteDrawerOpen, setNoteDrawerOpen] = useState(false);
  const [editingNotePath, setEditingNotePath] = useState<string | null>(null);

  // Modal de PIN
  const [pinModal, setPinModal] = useState<{
    isOpen: boolean;
    mode: 'unlock' | 'set' | 'remove';
    folderPath: string;
    pinHint?: string;
  }>({ isOpen: false, mode: 'unlock', folderPath: '' });

  // Diálogo e Alertas Nativos da Plataforma (Substitui window.confirm e window.prompt)
  const [actionDialog, setActionDialog] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    mode?: 'confirm' | 'prompt' | 'danger';
    icon?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    defaultValue?: string;
    placeholder?: string;
    onConfirm: (val?: string) => void;
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {},
  });

  // Lixeira (.trash)
  const [trashItems, setTrashItems] = useState<EdgeTrashItem[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(false);

  // Links de Clientes (/s/[token])
  const [shareLinks, setShareLinks] = useState<ShareLinkRow[]>(initialShareLinks);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareFolder, setShareFolder] = useState('');
  const [shareTitle, setShareTitle] = useState('');
  const [sharePin, setSharePin] = useState('');
  const [shareCreating, setShareCreating] = useState(false);

  // Preview rápido de foto/áudio/vídeo
  const [previewEntry, setPreviewEntry] = useState<EdgeVaultEntry | null>(null);

  // Modos de Layout e Painel de Inspeção Estilo VS Code
  const [layoutMode, setLayoutMode] = useState<VaultLayoutMode>(getInitialVaultLayout);
  const [isPreviewOpen, setIsPreviewOpen] = useState(getInitialPreviewOpen);
  const [selectedEntry, setSelectedEntry] = useState<EdgeVaultEntry | null>(null);
  const [openIdeTabs, setOpenIdeTabs] = useState<EdgeVaultEntry[]>([]);
  const [activeIdeTabPath, setActiveIdeTabPath] = useState<string | null>(null);

  const handleSetLayoutMode = (mode: VaultLayoutMode) => {
    setLayoutMode(mode);
    try {
      localStorage.setItem('aurtistic_vault_layout_mode', mode);
    } catch {}
  };

  const handleTogglePreview = () => {
    setIsPreviewOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('aurtistic_vault_preview_open', String(next));
      } catch {}
      return next;
    });
  };

  const handleSelectEntryForPreview = (entry: EdgeVaultEntry) => {
    setSelectedEntry(entry);
    if (!isPreviewOpen && layoutMode !== 'ide') {
      setIsPreviewOpen(true);
    }
    if (layoutMode === 'ide') {
      // Pastas nunca devem ser abertas como abas de arquivo na bancada IDE
      if (entry.kind === 'folder') return;
      setOpenIdeTabs((prev) => {
        if (!prev.some((t) => t.relativePath === entry.relativePath)) {
          return [...prev, entry];
        }
        return prev;
      });
      setActiveIdeTabPath(entry.relativePath);
    }
  };

  const handleCloseIdeTab = (e: React.MouseEvent, tabPath: string) => {
    e.stopPropagation();
    setOpenIdeTabs((prev) => {
      const next = prev.filter((t) => t.relativePath !== tabPath);
      if (activeIdeTabPath === tabPath) {
        const nextActive = next.length > 0 ? next[next.length - 1] : null;
        setActiveIdeTabPath(nextActive ? nextActive.relativePath : null);
        setSelectedEntry(nextActive);
      }
      return next;
    });
  };

  // Multi-seleção, Teclado & Menu de Contexto
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const lastSelectedPathRef = useRef<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'file' | 'folder' | 'selection' | 'background';
    entry?: EdgeVaultEntry;
  } | null>(null);

  // Metadados Visuais de Pastas (Cores, Ícones Customizados e Favoritos)
  const metaStorageKey = `aurtistic_vault_folder_meta_${selectedOrgId || 'personal'}`;
  const [folderMetaMap, setFolderMetaMap] = useState<Record<string, FolderCustomMeta>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('aurtistic_vault_folder_meta_personal');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const saveFolderMeta = (updated: Record<string, FolderCustomMeta>) => {
    setFolderMetaMap(updated);
    try {
      localStorage.setItem(metaStorageKey, JSON.stringify(updated));
    } catch {}
  };

  const handleUpdateFolderColor = (folderPath: string, colorHex: string) => {
    const updated = {
      ...folderMetaMap,
      [folderPath]: {
        ...(folderMetaMap[folderPath] || {}),
        color: colorHex,
      },
    };
    saveFolderMeta(updated);
  };

  const handleUpdateFolderIcon = (folderPath: string, iconName: string) => {
    const updated = {
      ...folderMetaMap,
      [folderPath]: {
        ...(folderMetaMap[folderPath] || {}),
        icon: iconName,
      },
    };
    saveFolderMeta(updated);
  };

  const handleToggleFolderFavorite = (folder: EdgeVaultEntry) => {
    const current = Boolean(folderMetaMap[folder.relativePath]?.isFavorite);
    const updated = {
      ...folderMetaMap,
      [folder.relativePath]: {
        ...(folderMetaMap[folder.relativePath] || {}),
        isFavorite: !current,
      },
    };
    saveFolderMeta(updated);
  };

  // Seleção por Arrastar o Mouse (Marquee / Rubberband)
  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const isMarqueeDragging = useRef(false);
  const workspaceContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!marqueeBox) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMarqueeBox((prev) => (prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null));

      const x1 = Math.min(marqueeBox.startX, e.clientX);
      const x2 = Math.max(marqueeBox.startX, e.clientX);
      const y1 = Math.min(marqueeBox.startY, e.clientY);
      const y2 = Math.max(marqueeBox.startY, e.clientY);

      if (x2 - x1 > 5 || y2 - y1 > 5) {
        const elements = document.querySelectorAll('[data-vault-path]');
        const newlySelected = new Set<string>();

        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const intersects =
            rect.left < x2 && rect.right > x1 && rect.top < y2 && rect.bottom > y1;
          if (intersects) {
            const path = el.getAttribute('data-vault-path');
            if (path) newlySelected.add(path);
          }
        });

        setSelectedPaths(newlySelected);
      }
    };

    const handleMouseUp = () => {
      setMarqueeBox(null);
      isMarqueeDragging.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [marqueeBox]);

  const handleWorkspaceMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('[data-no-marquee]') ||
      target.closest('[data-vault-path]')
    ) {
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      setSelectedPaths(new Set());
    }
    setContextMenu(null);

    isMarqueeDragging.current = true;
    setMarqueeBox({
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    });
  };

  const handleItemSelect = (path: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
      lastSelectedPathRef.current = path;
    } else if (e.shiftKey && lastSelectedPathRef.current) {
      e.preventDefault();
      const allPaths = [...folders.map((f) => f.relativePath), ...files.map((f) => f.relativePath)];
      const lastIdx = allPaths.indexOf(lastSelectedPathRef.current);
      const currIdx = allPaths.indexOf(path);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const range = allPaths.slice(start, end + 1);
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          range.forEach((p) => next.add(p));
          return next;
        });
      }
    } else {
      setSelectedPaths(new Set([path]));
      lastSelectedPathRef.current = path;
    }
  };

  const resolveFallbackFolderListing = useCallback(
    (targetFolder: string) => {
      const cleanTarget = String(targetFolder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const isPort =
        cleanTarget.toLowerCase() === 'portfolio' ||
        cleanTarget.toLowerCase().startsWith('portfolio/') ||
        cleanTarget.toLowerCase() === 'portifolio' ||
        cleanTarget.toLowerCase().startsWith('portifolio/');

      const targetPrefix = cleanTarget ? `${cleanTarget}/` : '';
      const matchingFiles: EdgeVaultEntry[] = [];
      const subfolderNames = new Set<string>();

      indexedMap.forEach((row, relPath) => {
        const cleanRel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        if (!cleanTarget) {
          // Raiz
          const parts = cleanRel.split('/');
          if (parts.length === 1) {
            matchingFiles.push({
              name: row.filename || parts[0],
              relativePath: cleanRel,
              isDirectory: false,
              sizeBytes: row.size_bytes || 0,
              mimeType: row.mime_type || 'application/octet-stream',
              kind: (row.mime_type?.startsWith('image/') ? 'image' : 'other') as EdgeVaultEntry['kind'],
              modifiedAt: row.updated_at || new Date().toISOString(),
            });
          } else if (parts.length > 1) {
            subfolderNames.add(parts[0]);
          }
        } else {
          // Subpasta (ex.: Portfolio ou Portfolio/Sub)
          if (cleanRel.toLowerCase().startsWith(targetPrefix.toLowerCase())) {
            const rest = cleanRel.slice(targetPrefix.length);
            const parts = rest.split('/');
            if (parts.length === 1) {
              matchingFiles.push({
                name: row.filename || parts[0],
                relativePath: cleanRel,
                isDirectory: false,
                sizeBytes: row.size_bytes || 0,
                mimeType: row.mime_type || 'application/octet-stream',
                kind: (row.mime_type?.startsWith('image/') ? 'image' : 'other') as EdgeVaultEntry['kind'],
                modifiedAt: row.updated_at || new Date().toISOString(),
              });
            } else if (parts.length > 1) {
              subfolderNames.add(parts[0]);
            }
          } else if (isPort && row.show_in_portfolio && !cleanRel.includes('/')) {
            matchingFiles.push({
              name: row.filename || cleanRel,
              relativePath: cleanRel,
              isDirectory: false,
              sizeBytes: row.size_bytes || 0,
              mimeType: row.mime_type || 'application/octet-stream',
              kind: (row.mime_type?.startsWith('image/') ? 'image' : 'other') as EdgeVaultEntry['kind'],
              modifiedAt: row.updated_at || new Date().toISOString(),
            });
          }
        }
      });

      // Na raiz, assegura que a pasta virtual Portfolio esteja presente
      if (!cleanTarget) {
        subfolderNames.add('Portfolio');
      }

      const segments = cleanTarget ? cleanTarget.split('/') : [];
      const breadcrumbs = [
        { name: selectedOrg ? selectedOrg.name : 'Meus Arquivos', path: '' },
        ...segments.map((seg, i) => ({
          name: i === 0 && (seg.toLowerCase() === 'portfolio' || seg.toLowerCase() === 'portifolio') ? 'Portfólio' : seg,
          path: segments.slice(0, i + 1).join('/'),
        })),
      ];

      return {
        currentFolder: cleanTarget,
        breadcrumbs,
        folders: Array.from(subfolderNames).map((sub) => ({
          name: sub === 'Portfolio' || sub === 'portfolio' ? 'Portfólio' : sub,
          relativePath: cleanTarget ? `${cleanTarget}/${sub}` : sub,
          isDirectory: true,
          sizeBytes: 0,
          mimeType: 'inode/directory',
          kind: 'folder' as const,
          modifiedAt: new Date().toISOString(),
        })),
        files: matchingFiles,
      };
    },
    [indexedMap, selectedOrg]
  );

  const loadDirectory = useCallback(
    async (targetFolder: string, activeTicketToUse = activeTicket, quiet = false) => {
      if (!isApprovedForStorage && profile.storage_role !== 'admin') return;
      if (!quiet) setLoadingDir(true);
      setDirError(null);
      try {
        const res = await fetchTenantDirectory(targetFolder, activeTicketToUse, { serverUrl });
        setIsEdgeOnline(true);
        if (typeof res.hdConnected === 'boolean') {
          setIsHdConnected(res.hdConnected);
        }

        if (res.isLocked) {
          setPinModal({
            isOpen: true,
            mode: 'unlock',
            folderPath: targetFolder,
            pinHint: res.pinHint,
          });
          if (!quiet) setLoadingDir(false);
          return;
        }

        setCurrentFolder(res.currentFolder);
        setSelectedPaths(new Set());
        setBreadcrumbs(
          res.breadcrumbs || [
            {
              name: selectedOrg ? selectedOrg.name : 'Meus Arquivos',
              path: '',
            },
          ]
        );
        setFolders(res.folders || []);
        setFiles(res.files || []);
        if (typeof res.total_used_bytes === 'number') {
          setUsedBytes(res.total_used_bytes);
        }

        // Auto-Heal silencioso: se houver arquivos no disco ainda não indexados no Supabase
        const missing = computeUnindexedDiskEntries(res, indexedMap);
        if (missing.length > 0 || typeof res.total_used_bytes === 'number') {
          void reconcileFolderIndexAction({
            missingEntries: missing,
            totalUsedBytes: res.total_used_bytes,
            organizationId: selectedOrgId || undefined,
          });
        }
      } catch (err: unknown) {
        setIsEdgeOnline(false);
        // Fallback Resiliente via Cache Indexado do Supabase
        const fallback = resolveFallbackFolderListing(targetFolder);
        if (fallback.files.length > 0 || fallback.folders.length > 0 || Boolean(targetFolder)) {
          setCurrentFolder(fallback.currentFolder);
          setSelectedPaths(new Set());
          setBreadcrumbs(fallback.breadcrumbs);
          setFolders(fallback.folders);
          setFiles(fallback.files);
          setDirError(null);
        } else {
          setDirError(err instanceof Error ? err.message : 'Servidor temporariamente inacessível.');
        }
      } finally {
        if (!quiet) setLoadingDir(false);
      }
    },
    [isApprovedForStorage, profile.storage_role, activeTicket, serverUrl, indexedMap, selectedOrg, selectedOrgId, resolveFallbackFolderListing]
  );

  const handleSwitchScope = async (orgId: string | null) => {
    if (orgId === selectedOrgId) return;
    setSelectedOrgId(orgId);
    setCurrentFolder('');
    setSelectedPaths(new Set());

    // Atualiza metadados customizados de pastas para o novo escopo
    try {
      const scopeKey = `aurtistic_vault_folder_meta_${orgId || 'personal'}`;
      const saved = localStorage.getItem(scopeKey);
      setFolderMetaMap(saved ? JSON.parse(saved) : {});
    } catch {
      setFolderMetaMap({});
    }

    if (!orgId) {
      setOrgVaultTicket(null);
      setUsedBytes(profile.used_bytes || 0);
      setBreadcrumbs([{ name: 'Meus Arquivos', path: '' }]);
      await loadDirectory('', ticket);
    } else {
      const org = userOrganizations.find((o) => o.id === orgId);
      if (org) {
        setUsedBytes(org.usedBytes);
        setBreadcrumbs([{ name: org.name, path: '' }]);
      }
      setLoadingDir(true);
      const res = await refreshOrganizationTicketAction({
        organizationId: orgId,
        unlockedPins,
      });
      if (res.ok && res.session?.vaultTicket?.ticket) {
        setOrgVaultTicket(res.session.vaultTicket.ticket);
        await loadDirectory('', res.session.vaultTicket.ticket);
      } else {
        setDirError(res.error || 'Falha ao acessar o cofre da organização.');
        setLoadingDir(false);
      }
    }
  };

  useEffect(() => {
    const handleEnsurePreview = () => {
      setIsPreviewOpen(true);
    };
    window.addEventListener('aurtistic:ensure-preview-open', handleEnsurePreview);
    return () => window.removeEventListener('aurtistic:ensure-preview-open', handleEnsurePreview);
  }, []);

  useEffect(() => {
    let ignore = false;
    if (activeTab === 'vault' && (isApprovedForStorage || profile.storage_role === 'admin')) {
      fetchTenantDirectory(currentFolder, activeTicket, { serverUrl })
        .then((res) => {
          if (ignore) return;
          setIsEdgeOnline(true);
          if (typeof res.hdConnected === 'boolean') {
            setIsHdConnected(res.hdConnected);
          }
          setDirError(null);

          if (res.isLocked) {
            setPinModal({
              isOpen: true,
              mode: 'unlock',
              folderPath: currentFolder,
              pinHint: res.pinHint,
            });
            setLoadingDir(false);
            return;
          }

          setCurrentFolder(res.currentFolder);
          setSelectedPaths(new Set());
          setBreadcrumbs(
            res.breadcrumbs || [
              {
                name: selectedOrg ? selectedOrg.name : 'Meus Arquivos',
                path: '',
              },
            ]
          );
          setFolders(res.folders || []);
          setFiles(res.files || []);
          if (typeof res.total_used_bytes === 'number') {
            setUsedBytes(res.total_used_bytes);
          }

          const missing = computeUnindexedDiskEntries(res, indexedMap);
          if (missing.length > 0 || typeof res.total_used_bytes === 'number') {
            void reconcileFolderIndexAction({
              missingEntries: missing,
              totalUsedBytes: res.total_used_bytes,
              organizationId: selectedOrgId || undefined,
            });
          }
          setLoadingDir(false);
        })
        .catch((err: unknown) => {
          if (ignore) return;
          setIsEdgeOnline(false);
          const fallback = resolveFallbackFolderListing(currentFolder);
          if (fallback.files.length > 0 || fallback.folders.length > 0 || Boolean(currentFolder)) {
            setCurrentFolder(fallback.currentFolder);
            setSelectedPaths(new Set());
            setBreadcrumbs(fallback.breadcrumbs);
            setFolders(fallback.folders);
            setFiles(fallback.files);
            setDirError(null);
          } else {
            setDirError(err instanceof Error ? err.message : 'Servidor temporariamente inacessível.');
          }
          setLoadingDir(false);
        });
    }
    return () => {
      ignore = true;
    };
  }, [activeTab, currentFolder, isApprovedForStorage, profile.storage_role, activeTicket, serverUrl, indexedMap, selectedOrgId, selectedOrg, resolveFallbackFolderListing]);

  // Monitoramento contínuo em tempo real do status do nó Fire TV e montagem do HD USB
  useEffect(() => {
    let ignore = false;
    const checkServerStatus = async () => {
      try {
        const base = serverUrl || 'https://storage.hublabdiv.com.br';
        const res = await fetch(`${base}/api/status`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (!ignore) {
            setIsEdgeOnline(true);
            if (typeof data.hdConnected === 'boolean') {
              setIsHdConnected(data.hdConnected);
            }
          }
        }
      } catch {
        if (!ignore) {
          setIsEdgeOnline(false);
        }
      }
    };

    void checkServerStatus();
    const interval = setInterval(checkServerStatus, 3000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [serverUrl]);

  const loadTrash = useCallback(async () => {
    setLoadingTrash(true);
    try {
      const res = await fetchTenantTrashDirect({ ticket: activeTicket, serverUrl });
      setTrashItems(res.items || []);
      if (typeof res.total_used_bytes === 'number') setUsedBytes(res.total_used_bytes);
    } catch (err: unknown) {
      setDirError(err instanceof Error ? err.message : 'Erro ao carregar lixeira.');
    } finally {
      setLoadingTrash(false);
    }
  }, [activeTicket, serverUrl]);

  const handleUploadItems = (items: UploadItem[]) => {
    handleOpenUploadManager(items);
  };

  const handleUploadFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const items = extractFilesFromFileList(fileList);
    handleUploadItems(items);
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadStatus(`Descompactando ${file.name} no navegador...`);
    setDirError(null);
    try {
      const items = await extractFilesFromZip(file);
      if (items.length === 0) {
        setDirError('Nenhum arquivo válido encontrado no pacote .zip.');
        return;
      }
      handleOpenUploadManager(items);
    } catch (err: unknown) {
      setDirError(err instanceof Error ? err.message : 'Falha ao descompactar .zip.');
    } finally {
      if (zipInputRef.current) zipInputRef.current.value = '';
      setUploading(false);
      setUploadStatus(null);
    }
  };

  const handleNoteUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(e.target.files);
      if (noteInputRef.current) noteInputRef.current.value = '';
    }
  };

  const handleCreateFolder = () => {
    setActionDialog({
      isOpen: true,
      mode: 'prompt',
      icon: 'create_new_folder',
      title: 'Nova Pasta',
      description: 'Digite o nome da pasta a ser criada no diretório atual.',
      placeholder: 'Ex: Sessão Fotográfica / Apresentações',
      confirmLabel: 'Criar Pasta',
      onConfirm: (name) => {
        setActionDialog((prev) => ({ ...prev, isOpen: false }));
        if (name && name.trim()) {
          void executeCreateFolder(name.trim());
        }
      },
    });
  };

  const executeCreateFolder = async (folderName: string) => {
    const newFolderPath = currentFolder ? `${currentFolder}/${folderName}` : folderName;
    // Otimista: exibe imediatamente no estado local
    setFolders((prev) => [
      ...prev,
      {
        name: folderName,
        relativePath: newFolderPath,
        kind: 'folder',
        isDirectory: true,
        mimeType: 'inode/directory',
        sizeBytes: 0,
        modifiedAt: new Date().toISOString(),
        hasPin: false,
      },
    ]);

    try {
      const mutation = await createTenantFolderDirect({
        parentFolder: currentFolder,
        name: folderName,
        ticket: activeTicket,
        serverUrl,
      });
      void syncUserFileIndexAction({
        mutation,
        organizationId: selectedOrgId || undefined,
      }).catch((e) => console.warn('Sync Supabase new folder warning:', e));
      await loadDirectory(currentFolder, activeTicket, true);
    } catch (err: unknown) {
      setFolders((prev) => prev.filter((f) => f.relativePath !== newFolderPath));
      setDirError(err instanceof Error ? err.message : 'Erro ao criar pasta.');
    }
  };

  const handleRenameEntry = (entry: EdgeVaultEntry) => {
    setActionDialog({
      isOpen: true,
      mode: 'prompt',
      icon: 'drive_file_rename_outline',
      title: `Renomear ${entry.kind === 'folder' ? 'Pasta' : 'Arquivo'}`,
      description: `Digite o novo nome para "${entry.name}".`,
      defaultValue: entry.name,
      confirmLabel: 'Salvar Novo Nome',
      onConfirm: (newName) => {
        setActionDialog((prev) => ({ ...prev, isOpen: false }));
        if (newName && newName.trim() && newName.trim() !== entry.name) {
          void executeRenameEntry(entry, newName.trim());
        }
      },
    });
  };

  const executeRenameEntry = async (entry: EdgeVaultEntry, newName: string) => {
    const parent = entry.relativePath.split('/').slice(0, -1).join('/');
    const newPath = parent ? `${parent}/${newName}` : newName;
    const prevFolders = [...folders];
    const prevFiles = [...files];

    // Otimista: atualiza o nome imediatamente na UI
    if (entry.kind === 'folder') {
      setFolders((prev) =>
        prev.map((f) => (f.relativePath === entry.relativePath ? { ...f, name: newName, relativePath: newPath } : f))
      );
    } else {
      setFiles((prev) =>
        prev.map((f) => (f.relativePath === entry.relativePath ? { ...f, name: newName, relativePath: newPath } : f))
      );
    }

    try {
      const mutation = await renameOrMoveTenantEntryDirect({
        oldPath: entry.relativePath,
        newPath,
        ticket: activeTicket,
        serverUrl,
      });
      void syncUserFileIndexAction({
        mutation,
        organizationId: selectedOrgId || undefined,
      }).catch((e) => console.warn('Sync Supabase rename warning:', e));
      if (entry.kind === 'folder') {
        void cascadeFolderUpdateAction({
          oldPath: entry.relativePath,
          newPath,
        }).catch((e) => console.warn('Cascade Supabase rename warning:', e));
      }
      await loadDirectory(currentFolder, activeTicket, true);
    } catch (err: unknown) {
      setFolders(prevFolders);
      setFiles(prevFiles);
      setDirError(err instanceof Error ? err.message : 'Erro ao renomear.');
    }
  };

  const handleDeleteEntry = (entry: EdgeVaultEntry) => {
    setActionDialog({
      isOpen: true,
      mode: 'danger',
      icon: 'delete',
      title: 'Mover para a Lixeira?',
      description: `Tem certeza que deseja mover "${entry.name}" para a Lixeira? Os itens poderão ser restaurados na aba Lixeira.`,
      confirmLabel: 'Mover para Lixeira',
      onConfirm: () => {
        setActionDialog((prev) => ({ ...prev, isOpen: false }));
        void executeDeleteEntry(entry);
      },
    });
  };

  const executeDeleteEntry = async (entry: EdgeVaultEntry) => {
    const targetPath = entry.relativePath;
    // OTIMISTA IMEDIATO (0ms): some da tela no mesmo frame do clique!
    const prevFolders = [...folders];
    const prevFiles = [...files];
    if (entry.kind === 'folder') {
      setFolders((prev) => prev.filter((f) => f.relativePath !== targetPath));
    } else {
      setFiles((prev) => prev.filter((f) => f.relativePath !== targetPath));
    }
    if (selectedEntry?.relativePath === targetPath) {
      setSelectedEntry(null);
    }
    setOpenIdeTabs((prev) => prev.filter((t) => t.relativePath !== targetPath));
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      next.delete(targetPath);
      return next;
    });

    try {
      const mutation = await deleteTenantEntryDirect({
        relativePath: targetPath,
        permanent: false,
        ticket: activeTicket,
        serverUrl,
      });

      if (typeof mutation.total_used_bytes === 'number') {
        setUsedBytes(mutation.total_used_bytes);
      }

      // Supabase sync em background (não bloqueia resposta ao usuário)
      void syncUserFileIndexAction({
        mutation,
        organizationId: selectedOrgId || undefined,
      }).catch((e) => console.warn('Sync Supabase delete warning:', e));

      if (entry.kind === 'folder') {
        void cascadeFolderUpdateAction({
          oldPath: targetPath,
          isDelete: true,
        }).catch((e) => console.warn('Cascade Supabase delete warning:', e));
      }

      // Reconcilia silenciosamente
      await loadDirectory(currentFolder, activeTicket, true);
    } catch (err: unknown) {
      // Reverte se houve erro real no servidor de arquivos
      setFolders(prevFolders);
      setFiles(prevFiles);
      setDirError(err instanceof Error ? err.message : 'Erro ao mover para lixeira.');
    }
  };

  const handleDownloadBatchZip = () => {
    if (selectedPaths.size === 0) return;
    const url = buildTenantZipUrl(currentFolder, ticket, {
      serverUrl,
      paths: Array.from(selectedPaths),
    });
    window.open(url, '_blank');
  };

  const handleDownloadFolderZip = (folderPath: string) => {
    const url = buildTenantZipUrl(folderPath, ticket, { serverUrl });
    window.open(url, '_blank');
  };

  const handleToggleFileFavorite = async (file: EdgeVaultEntry) => {
    const indexRow = indexedMap.get(file.relativePath);
    const nextVal = !Boolean(indexRow?.is_favorite);
    try {
      await updateFileEcosystemLinksAction({
        relativePath: file.relativePath,
        filename: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        patch: {
          isFavorite: nextVal,
        },
      });
      await loadDirectory(currentFolder);
    } catch (err) {
      console.error('Erro ao atualizar favorito do arquivo:', err);
    }
  };

  const executeBatchDelete = useCallback(async () => {
    if (selectedPaths.size === 0) return;
    const targets = new Set(selectedPaths);
    setSelectedPaths(new Set());

    // 1. OTIMISTA IMEDIATO (0ms): todos os itens selecionados somem no mesmo frame
    const prevFolders = [...folders];
    const prevFiles = [...files];
    setFolders((prev) => prev.filter((f) => !targets.has(f.relativePath)));
    setFiles((prev) => prev.filter((f) => !targets.has(f.relativePath)));
    if (selectedEntry && targets.has(selectedEntry.relativePath)) {
      setSelectedEntry(null);
    }
    setOpenIdeTabs((prev) => prev.filter((t) => !targets.has(t.relativePath)));

    try {
      // 2. Executa exclusões em paralelo no servidor de arquivos (não sequencial)
      const results = await Promise.allSettled(
        Array.from(targets).map(async (path) => {
          const isFolder = prevFolders.some((f) => f.relativePath === path);
          const mutation = await deleteTenantEntryDirect({
            relativePath: path,
            permanent: false,
            ticket: activeTicket,
            serverUrl,
          });

          // Supabase sync e cascades em background (não bloqueia UI)
          void syncUserFileIndexAction({
            mutation,
            organizationId: selectedOrgId || undefined,
          }).catch((err) => console.warn('Sync user file index warning:', err));

          if (isFolder) {
            void cascadeFolderUpdateAction({
              oldPath: path,
              isDelete: true,
            }).catch((err) => console.warn('Cascade folder update warning:', err));
          }

          return mutation;
        })
      );

      // Atualiza bytes usados com a última mutação bem-sucedida
      for (const res of results) {
        if (res.status === 'fulfilled' && typeof res.value.total_used_bytes === 'number') {
          setUsedBytes(res.value.total_used_bytes);
        }
      }

      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount > 0) {
        setDirError(`${failedCount} item(ns) não puderam ser excluídos no servidor.`);
      }

      // 3. Reconciliação silenciosa em background (sem loading spinner)
      await loadDirectory(currentFolder, activeTicket, true);
    } catch (err: unknown) {
      // Reverte estado se houver falha de rede total
      setFolders(prevFolders);
      setFiles(prevFiles);
      setDirError(err instanceof Error ? err.message : 'Erro ao excluir itens selecionados.');
    }
  }, [selectedPaths, folders, files, selectedEntry, activeTicket, serverUrl, selectedOrgId, currentFolder, loadDirectory]);

  const handleBatchDelete = useCallback(() => {
    if (selectedPaths.size === 0) return;
    const count = selectedPaths.size;
    setActionDialog({
      isOpen: true,
      mode: 'danger',
      icon: 'delete_sweep',
      title: 'Mover Itens Selecionados para a Lixeira?',
      description: `Tem certeza que deseja mover ${count} item(ns) selecionado(s) para a Lixeira? Os arquivos e pastas poderão ser restaurados na aba Lixeira.`,
      confirmLabel: `Mover ${count} item(ns) para Lixeira`,
      onConfirm: () => {
        setActionDialog((prev) => ({ ...prev, isOpen: false }));
        void executeBatchDelete();
      },
    });
  }, [selectedPaths, executeBatchDelete]);

  const handleMoveToPortfolio = useCallback(
    async (entry: EdgeVaultEntry) => {
      const isAlreadyInPortfolio =
        entry.relativePath.toLowerCase() === 'portfolio' ||
        entry.relativePath.toLowerCase().startsWith('portfolio/') ||
        entry.relativePath.toLowerCase().startsWith('portifolio/');

      const targetRelPath = isAlreadyInPortfolio
        ? entry.relativePath
        : `Portfolio/${entry.name}`;

      try {
        if (!isAlreadyInPortfolio) {
          const mutation = await renameOrMoveTenantEntryDirect({
            oldPath: entry.relativePath,
            newPath: targetRelPath,
            ticket: activeTicket,
            serverUrl,
          });

          void syncUserFileIndexAction({
            mutation,
            organizationId: selectedOrgId || undefined,
          }).catch((err) => console.warn('Sync move to portfolio warning:', err));
        }

        await updateFileEcosystemLinksAction({
          relativePath: targetRelPath,
          filename: entry.name,
          mimeType: entry.mimeType,
          sizeBytes: entry.sizeBytes,
          patch: {
            showInPortfolio: true,
            visibility: 'public',
          },
        });

        await loadDirectory(currentFolder, activeTicket, true);
      } catch (err: unknown) {
        console.warn('[MoveToPortfolio] Fallback de vínculo no Supabase:', err);
        try {
          await updateFileEcosystemLinksAction({
            relativePath: entry.relativePath,
            filename: entry.name,
            mimeType: entry.mimeType,
            sizeBytes: entry.sizeBytes,
            patch: {
              showInPortfolio: true,
              visibility: 'public',
            },
          });
          await loadDirectory(currentFolder, activeTicket, true);
        } catch {}
      }
    },
    [activeTicket, currentFolder, loadDirectory, selectedOrgId, serverUrl]
  );

  const handleBatchMoveToPortfolio = useCallback(async () => {
    if (selectedPaths.size === 0) return;
    const targets = Array.from(selectedPaths);
    setSelectedPaths(new Set());

    for (const relPath of targets) {
      const fileEntry = files.find((f) => f.relativePath === relPath);
      const name = fileEntry?.name || relPath.split('/').pop() || 'arquivo';
      const isAlready =
        relPath.toLowerCase() === 'portfolio' ||
        relPath.toLowerCase().startsWith('portfolio/') ||
        relPath.toLowerCase().startsWith('portifolio/');
      const targetRel = isAlready ? relPath : `Portfolio/${name}`;

      try {
        if (!isAlready) {
          const mutation = await renameOrMoveTenantEntryDirect({
            oldPath: relPath,
            newPath: targetRel,
            ticket: activeTicket,
            serverUrl,
          });

          void syncUserFileIndexAction({
            mutation,
            organizationId: selectedOrgId || undefined,
          }).catch(() => {});
        }

        await updateFileEcosystemLinksAction({
          relativePath: targetRel,
          filename: name,
          patch: {
            showInPortfolio: true,
            visibility: 'public',
          },
        });
      } catch (err) {
        console.warn(`[BatchMovePortfolio] Falha ao mover ${relPath}:`, err);
        try {
          await updateFileEcosystemLinksAction({
            relativePath: relPath,
            patch: {
              showInPortfolio: true,
              visibility: 'public',
            },
          });
        } catch {}
      }
    }

    await loadDirectory(currentFolder, activeTicket, true);
  }, [selectedPaths, files, activeTicket, serverUrl, selectedOrgId, currentFolder, loadDirectory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('input, textarea, [contenteditable="true"]'))
      ) {
        return;
      }

      if (e.key === 'Escape') {
        setSelectedPaths(new Set());
        setContextMenu(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPaths.size > 0) {
          e.preventDefault();
          void handleBatchDelete();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        if (activeTab === 'vault') {
          e.preventDefault();
          const all = new Set<string>();
          folders.forEach((f) => all.add(f.relativePath));
          files.forEach((f) => all.add(f.relativePath));
          setSelectedPaths(all);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPaths, folders, files, activeTab, handleBatchDelete]);

  const handleRestoreTrashItem = async (item: EdgeTrashItem) => {
    try {
      const mutation = await restoreTenantTrashItemDirect({
        trashId: item.trashId,
        ticket: activeTicket,
        serverUrl,
      });
      await syncUserFileIndexAction({
        mutation,
        organizationId: selectedOrgId || undefined,
      });
      await loadTrash();
    } catch (err: unknown) {
      setDirError(err instanceof Error ? err.message : 'Erro ao restaurar arquivo.');
    }
  };

  const handleEmptyTrash = (trashId?: string) => {
    setActionDialog({
      isOpen: true,
      mode: 'danger',
      icon: 'delete_forever',
      title: trashId ? 'Excluir Item Permanentemente?' : 'Esvaziar Toda a Lixeira?',
      description: trashId
        ? 'Excluir este item permanentemente e liberar espaço em disco imediatamente? Esta ação não pode ser desfeita.'
        : 'Todos os arquivos e pastas da Lixeira serão permanentemente destruídos e o espaço será liberado. Esta ação não pode ser desfeita.',
      confirmLabel: trashId ? 'Excluir Permanentemente' : 'Esvaziar Lixeira',
      onConfirm: () => {
        setActionDialog((prev) => ({ ...prev, isOpen: false }));
        void executeEmptyTrash(trashId);
      },
    });
  };

  const executeEmptyTrash = async (trashId?: string) => {
    try {
      const res = await emptyTenantTrashDirect({ trashId, ticket: activeTicket, serverUrl });
      setUsedBytes(res.total_used_bytes);
      await loadTrash();
    } catch (err: unknown) {
      setDirError(err instanceof Error ? err.message : 'Erro ao esvaziar lixeira.');
    }
  };

  const handlePinModalSuccess = async (
    folderPath: string,
    mode: 'unlock' | 'set' | 'remove'
  ) => {
    setPinModal((prev) => ({ ...prev, isOpen: false }));
    if (mode === 'unlock') {
      const nextPins = Array.from(new Set([...unlockedPins, folderPath]));
      setUnlockedPins(nextPins);
      const refreshed = await refreshTicket();
      await loadDirectory(folderPath, refreshed?.ticket || ticket);
    } else {
      await loadDirectory(currentFolder);
    }
  };

  const handleCreateShareLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareFolder || !shareTitle.trim()) return;
    setShareCreating(true);
    try {
      const res = await createShareLinkAction({
        folderPath: shareFolder,
        albumTitle: shareTitle.trim(),
        mode: 'proofing',
        pin: sharePin.trim() || undefined,
        allowDownload: true,
        autoCreateTask: true,
      });
      if (!res.ok) {
        setDirError(res.error || 'Erro ao criar link.');
      } else if (res.shareLink) {
        setShareLinks((prev) => [res.shareLink as ShareLinkRow, ...prev]);
        setShareModalOpen(false);
        setShareTitle('');
        setSharePin('');
        setActiveTab('shares');
      }
    } finally {
      setShareCreating(false);
    }
  };

  const handleDeleteShareLink = async (id: string) => {
    const res = await deleteShareLinkAction(id);
    if (res.ok) {
      setShareLinks((prev) => prev.filter((s) => s.id !== id));
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={async (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          const items = await extractFilesFromDataTransfer(e.dataTransfer);
          if (items.length > 0) {
            handleOpenUploadManager(items);
          }
        }
      }}
      className="min-h-full flex flex-col p-4 md:p-8 bg-app space-y-6 pb-28 text-fg"
    >
      {/* Alternador Macro Unificado: Organizações & Arquivos */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border-subtle rounded-2xl px-4 py-2.5 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Aba Gestão:
          </span>
          <div className="flex items-center gap-1 bg-app p-1 rounded-xl border border-border-subtle">
            <Link
              href="/labdiv"
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-fg-secondary hover:text-fg transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">domain</span>
              <span>Equipe & Projetos</span>
            </Link>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-[#FFCC00] text-[#121212] shadow-sm">
              <span className="material-symbols-outlined text-[16px]">folder_special</span>
              <span>Cofre de Arquivos</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('aurtistic:relaunch-onboarding'));
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--accent-secondary,#FFCC00)]/30 bg-[var(--accent-secondary,#FFCC00)]/10 text-[var(--accent-secondary,#FFCC00)] hover:bg-[var(--accent-secondary,#FFCC00)]/20 text-xs font-bold transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">tune</span>
          <span>Personalizar Módulos</span>
        </button>
      </div>

      {/* Seletor de Escopo: Cofre Pessoal vs Org Vault */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border-subtle rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-fg-muted uppercase tracking-wider mr-1">
            Escopo do Cofre:
          </span>
          <button
            type="button"
            onClick={() => handleSwitchScope(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              selectedOrgId === null
                ? 'bg-[#FFCC00] text-[#121212] shadow-sm font-black'
                : 'bg-surface text-fg-secondary hover:text-fg hover:bg-surface-hover border border-border-subtle'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">person</span>
            <span>Meu Cofre Pessoal</span>
          </button>

          {userOrganizations.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => handleSwitchScope(org.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                selectedOrgId === org.id
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-black shadow-md'
                  : 'bg-surface text-fg-secondary hover:text-fg hover:bg-surface-hover border border-border-subtle'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">domain</span>
              <span>Cofre {org.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-current font-mono">
                Compartilhado
              </span>
            </button>
          ))}

          {userOrganizations.length === 0 && (
            <Link
              href="/labdiv"
              className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-dashed border-border-subtle hover:border-[var(--accent-secondary,#FFCC00)] text-fg-muted hover:text-fg transition-colors"
              title="Conectar ou criar organização para habilitar o cofre compartilhado"
            >
              <span className="material-symbols-outlined text-[16px] text-[var(--accent-secondary,#FFCC00)]">domain_add</span>
              <span>+ Conectar Organização</span>
            </Link>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setBoostTargetScope(selectedOrgId ? 'org' : 'personal');
            setIsBoostModalOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-[#9D4EDD]/40 bg-[#9D4EDD]/10 px-3 py-1.5 text-xs font-bold text-[#E0AAFF] hover:bg-[#9D4EDD]/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">bolt</span>
          Pedir Boost de Evento
        </button>
      </div>

      {/* Topo: Cartão Calmo de Quota e Status do Servidor */}
      <div data-tour="vault-quota-card" className="space-y-3">
        <StorageQuotaCard
          usedBytes={selectedOrg ? selectedOrg.usedBytes : usedBytes}
          effectiveQuotaBytes={selectedOrg ? selectedOrg.quotaBytes : effectiveQuotaBytes}
          baseQuotaBytes={selectedOrg ? selectedOrg.quotaBytes : profile.quota_limit_bytes}
          approvalStatus={profile.approval_status}
          storageRole={profile.storage_role}
          hasActiveEventBoost={selectedOrg ? selectedOrg.boostActive : hasActiveEventBoost}
          tempQuotaExpiresAt={selectedOrg ? selectedOrg.boostExpiresAt : profile.temp_quota_expires_at}
          tempQuotaReason={selectedOrg ? selectedOrg.boostReason : profile.temp_quota_reason}
          isEdgeOnline={isEdgeOnline}
          isHdConnected={isHdConnected}
          publicSlug={profile.public_slug}
          orgName={selectedOrg ? selectedOrg.name : null}
        />

        {isEdgeOnline && isHdConnected === false && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-start gap-3 text-xs text-rose-300">
            <span className="material-symbols-outlined text-[20px] text-rose-400 shrink-0 mt-0.5">
              warning
            </span>
            <div className="flex-1">
              <div className="font-bold text-rose-200">
                HD USB Externo Desconectado no Fire TV Stick
              </div>
              <div className="text-rose-300/90 mt-0.5 leading-relaxed">
                O servidor está operando na memória interna de contingência (~800 MB livres). Se o HD terminou de formatar no Fire TV, reconecte o cabo OTG ou verifique a alimentação USB. O status é atualizado automaticamente a cada 3 segundos assim que for detectado.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navegação de Abas do Espaço */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3" data-tour="vault-tabs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
              activeTab === 'vault'
                ? 'bg-[#FFCC00] text-[#121212]'
                : 'bg-surface text-fg-secondary hover:text-fg hover:bg-surface-hover border border-border-subtle'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {selectedOrg ? 'domain' : 'folder_special'}
            </span>
            <span>{selectedOrg ? `Cofre ${selectedOrg.name}` : 'Meu Espaço'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shares')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
              activeTab === 'shares'
                ? 'bg-[#FFCC00] text-[#121212]'
                : 'bg-surface text-fg-secondary hover:text-fg hover:bg-surface-hover border border-border-subtle'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">share</span>
            Links de Clientes ({shareLinks.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('trash');
              void loadTrash();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
              activeTab === 'trash'
                ? 'bg-[#FFCC00] text-[#121212]'
                : 'bg-surface text-fg-secondary hover:text-fg hover:bg-surface-hover border border-border-subtle'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
            Lixeira
          </button>

          {profile.storage_role === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('admin_quotas')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                  activeTab === 'admin_quotas'
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'bg-surface text-[#E0AAFF] hover:bg-[#9D4EDD]/20 border border-[#9D4EDD]/40'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">group</span>
                Quotas Admin (25 GB / Eventos)
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('admin_telemetry')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                  activeTab === 'admin_telemetry'
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'bg-surface text-[#E0AAFF] hover:bg-[#9D4EDD]/20 border border-[#9D4EDD]/40'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">monitoring</span>
                Telemetria HW
              </button>
            </>
          )}
        </div>
      </div>

      {/* Estado Acolhedor para Conta Pendente de Aprovação */}
      {!isApprovedForStorage && profile.storage_role !== 'admin' && activeTab === 'vault' && (
        <div className="bg-surface border border-border-subtle rounded-2xl p-8 text-center max-w-2xl mx-auto my-8 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#FFCC00]/10 border border-[#FFCC00]/30 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[#FFCC00] text-[36px]">
              hourglass_top
            </span>
          </div>
          <h2 className="text-xl font-bold text-fg">
            Seu Espaço de 25 GB está Aguardando Liberação
          </h2>
          <p className="text-sm text-fg-secondary leading-relaxed">
            Você já pode utilizar livremente o Gerenciador de Tarefas, seu Resumo e seu Currículo!
            Assim que o administrador aprovar seu acesso ao servidor, seu espaço dedicado será ativado com <strong className="text-[#FFCC00]">25 GB</strong> de armazenamento isolado para você criar suas pastas e arquivos livremente.
          </p>
        </div>
      )}

      {/* ABA 1: EXPLORER DO COFRE ("MEU ESPAÇO") */}
      {activeTab === 'vault' && (isApprovedForStorage || profile.storage_role === 'admin') && (
        <div className="space-y-4">
          {/* Barra de Ferramentas e Caminho do Arquivo */}
          <div className="bg-surface border border-border-subtle rounded-2xl p-3.5 sm:p-4 space-y-3">
            {/* Linha 1: Controles de Exibição e Ações Principais */}
            <div className="flex flex-wrap items-center justify-between gap-3" data-tour="vault-actions">
              {/* Seletor de Layout (Grade / Lista / IDE) + Toggle do Painel de Inspeção */}
              <div className="flex items-center gap-1 bg-app p-1 rounded-xl border border-border-subtle" data-tour="vault-layout-switcher">
                <button
                  type="button"
                  onClick={() => handleSetLayoutMode('grid')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    layoutMode === 'grid'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-bold shadow-sm'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                  }`}
                  title="Visualização em Grade com Miniaturas"
                >
                  <span className="material-symbols-outlined text-[16px]">grid_view</span>
                  <span className="hidden sm:inline">Grade</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetLayoutMode('list')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    layoutMode === 'list'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-bold shadow-sm'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                  }`}
                  title="Visualização em Lista Detalhada"
                >
                  <span className="material-symbols-outlined text-[16px]">view_list</span>
                  <span className="hidden sm:inline">Lista</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetLayoutMode('ide')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    layoutMode === 'ide'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-bold shadow-sm'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                  }`}
                  title="Visualização Estilo IDE com Árvore Lateral e Abas"
                >
                  <span className="material-symbols-outlined text-[16px]">terminal</span>
                  <span className="hidden sm:inline">IDE</span>
                </button>

                <div className="w-[1px] h-4 bg-border-subtle mx-0.5" />

                <button
                  type="button"
                  onClick={handleTogglePreview}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    isPreviewOpen
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] font-bold shadow-sm'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                  }`}
                  title={isPreviewOpen ? 'Ocultar Painel Lateral (Alt+P)' : 'Abrir Painel Lateral (Alt+P)'}
                >
                  <span className="material-symbols-outlined text-[18px]">view_sidebar</span>
                  <span className="hidden sm:inline">Painel</span>
                </button>
              </div>

              {/* Ações da Pasta: Compartilhar, Baixar e Botão [+ Novo] */}
              <div className="flex items-center gap-2 flex-wrap">
                {currentFolder && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShareFolder(currentFolder);
                        setShareTitle(currentFolder.split('/').pop() || 'Álbum');
                        setShareModalOpen(true);
                      }}
                      className="px-3 py-2 rounded-xl bg-[#9D4EDD]/15 hover:bg-[#9D4EDD]/25 text-[#9D4EDD] dark:text-[#E0AAFF] border border-[#9D4EDD]/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">share</span>
                      <span className="hidden md:inline">Compartilhar c/ Cliente</span>
                    </button>

                    <a
                      href={buildTenantZipUrl(currentFolder, ticket, { serverUrl })}
                      className="px-3 py-2 rounded-xl bg-app hover:bg-surface-hover text-fg-secondary hover:text-fg border border-border-subtle text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">folder_zip</span>
                      <span className="hidden md:inline">Baixar .ZIP</span>
                    </a>
                  </>
                )}

                {/* Inputs Ocultos de Envio */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleUploadFiles(e.target.files)}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  // @ts-expect-error webkitdirectory suportado em navegadores modernos
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      handleUploadFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  className="hidden"
                  onChange={(e) => void handleZipUpload(e)}
                />
                <input
                  ref={noteInputRef}
                  type="file"
                  accept=".md,.markdown,.txt"
                  className="hidden"
                  onChange={(e) => void handleNoteUpload(e)}
                />

                {/* Botão Único [+] com Menu Suspenso de Ações */}
                <div className="relative" ref={addMenuRef}>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => setIsAddMenuOpen((prev) => !prev)}
                    className="px-3.5 py-2 rounded-xl bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
                    title="Adicionar ou Criar (+)"
                  >
                    <span className="material-symbols-outlined text-[20px] font-bold leading-none">
                      add
                    </span>
                    <span className="font-bold hidden sm:inline">
                      {uploading ? 'Enviando...' : 'Novo'}
                    </span>
                    <span className="material-symbols-outlined text-[16px] leading-none transition-transform duration-200">
                      {isAddMenuOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>

                  {isAddMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-72 rounded-2xl bg-surface border border-border-subtle shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
                    >
                      <div className="px-3 py-2 border-b border-border-subtle/60 mb-1">
                        <p className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
                          Adicionar ao Cofre
                        </p>
                        <p className="text-xs text-fg-secondary truncate">
                          {currentFolder ? `📁 /${currentFolder}` : '📁 Raiz do Cofre'}
                        </p>
                      </div>

                      {/* 1. Subir arquivo ZIP e descompactar */}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={uploading}
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          zipInputRef.current?.click();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-fg hover:bg-surface-hover flex items-center gap-2.5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#FFCC00]/15 flex items-center justify-center text-[#FFCC00] group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">folder_zip</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-fg group-hover:text-[#FFCC00] transition-colors">
                            Subir arquivo ZIP e descompactar
                          </p>
                          <p className="text-[10px] text-fg-muted truncate">
                            Extrai pastas e arquivos automaticamente
                          </p>
                        </div>
                      </button>

                      {/* 2. Subir arquivo único (ou múltiplos) */}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={uploading}
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-fg hover:bg-surface-hover flex items-center gap-2.5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[var(--accent-secondary)]/15 flex items-center justify-center text-[var(--accent-secondary)] group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">upload_file</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-fg group-hover:text-[var(--accent-secondary)] transition-colors">
                            Subir um arquivo único (ou múltiplos)
                          </p>
                          <p className="text-[10px] text-fg-muted truncate">
                            Fotos, vídeos, PDFs ou documentos avulsos
                          </p>
                        </div>
                      </button>

                      {/* 3. Subir pasta (ou múltiplas) */}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={uploading}
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          folderInputRef.current?.click();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-fg hover:bg-surface-hover flex items-center gap-2.5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#00E5FF]/15 flex items-center justify-center text-[#00E5FF] group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">drive_folder_upload</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-fg group-hover:text-[#00E5FF] transition-colors">
                            Subir pasta (ou múltiplas)
                          </p>
                          <p className="text-[10px] text-fg-muted truncate">
                            Preserva hierarquia completa. Permite enfileirar múltiplas pastas ou arrastar juntas
                          </p>
                        </div>
                      </button>

                      {/* 4. Subir uma nota */}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={uploading}
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          noteInputRef.current?.click();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-fg hover:bg-surface-hover flex items-center gap-2.5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#9D4EDD]/15 flex items-center justify-center text-[#9D4EDD] group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">note_add</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-fg group-hover:text-[#9D4EDD] transition-colors">
                            Subir uma nota (.md)
                          </p>
                          <p className="text-[10px] text-fg-muted truncate">
                            Importar arquivo markdown do computador
                          </p>
                        </div>
                      </button>

                      {/* 4b. Criar nova nota (.md) */}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={uploading}
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          setEditingNotePath(null);
                          setNoteDrawerOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-fg hover:bg-surface-hover flex items-center gap-2.5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#9D4EDD]/15 flex items-center justify-center text-[#9D4EDD] group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">edit_note</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-fg group-hover:text-[#9D4EDD] transition-colors">
                            Criar nova nota (.md)
                          </p>
                          <p className="text-[10px] text-fg-muted truncate">
                            Abrir editor markdown no navegador
                          </p>
                        </div>
                      </button>

                      <div className="border-t border-border-subtle/60 my-1" />

                      {/* 5. Criar uma pasta */}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={uploading}
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          void handleCreateFolder();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-fg hover:bg-surface-hover flex items-center gap-2.5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center text-fg group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-fg group-hover:text-[var(--accent-primary)] transition-colors">
                            Criar uma pasta
                          </p>
                          <p className="text-[10px] text-fg-muted truncate">
                            Criar novo diretório no caminho atual
                          </p>
                        </div>
                      </button>

                      {/* 6. Abrir Gerenciador de Uploads */}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          handleOpenUploadManager([]);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-fg hover:bg-surface-hover flex items-center gap-2.5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/15 flex items-center justify-center text-[var(--accent-primary)] group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-fg group-hover:text-[var(--accent-primary)] transition-colors">
                            Gerenciador de Uploads
                          </p>
                          <p className="text-[10px] text-fg-muted truncate">
                            Painel de envio com fila e minimização
                          </p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Linha 2: Caminho do Arquivo / Pasta (Breadcrumbs com > e Espaço Total) */}
            <div className="pt-2.5 border-t border-border-subtle/70 flex items-center gap-2 text-xs overflow-x-auto hide-scrollbar">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-app border border-border-subtle text-fg-muted shrink-0 select-none">
                <span className="material-symbols-outlined text-[16px] text-[var(--accent-secondary)]">
                  folder_open
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider">Caminho:</span>
              </div>

              <div className="flex items-center gap-1 flex-nowrap">
                {breadcrumbs.map((bc, idx) => (
                  <React.Fragment key={bc.path || 'root'}>
                    {idx > 0 && (
                      <span className="text-fg-muted font-bold px-1 select-none text-[13px] leading-none">
                        &gt;
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void loadDirectory(bc.path)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                        idx === breadcrumbs.length - 1
                          ? 'bg-surface-hover text-[var(--accent-primary)] border border-border-subtle shadow-xs'
                          : 'text-fg-secondary hover:text-fg hover:bg-surface-hover/60'
                      }`}
                    >
                      {bc.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {uploadStatus && (
            <div className="p-3 rounded-xl bg-[#9D4EDD]/15 border border-[#9D4EDD]/40 text-xs text-[#E0AAFF] font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
              {uploadStatus}
            </div>
          )}

          {dirError && (
            <div className="p-3 rounded-xl bg-[#F14343]/10 border border-[#F14343]/40 text-xs text-[#ffb4ab]">
              {dirError}
            </div>
          )}

          {/* CONTÊINER PRINCIPAL: Split View (IDE Tree + Conteúdo + Painel de Inspeção) com Suporte a Drag & Drop */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounter.current++;
              setIsDraggingFiles(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
              }
              setIsDraggingFiles(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounter.current--;
              if (dragCounter.current <= 0) {
                setIsDraggingFiles(false);
              }
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounter.current = 0;
              setIsDraggingFiles(false);
              if (e.dataTransfer) {
                const items = await extractFilesFromDataTransfer(e.dataTransfer);
                if (items.length > 0) {
                  handleOpenUploadManager(items);
                }
              }
            }}
            className="flex border border-border-subtle rounded-2xl bg-surface overflow-hidden min-h-[620px] relative"
          >
            {/* Overlay Visual de Drag & Drop para Pastas e Arquivos */}
            {isDraggingFiles && (
              <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm border-2 border-dashed border-[#FFCC00] rounded-2xl flex flex-col items-center justify-center p-6 text-center pointer-events-none animate-in fade-in duration-200">
                <div className="w-16 h-16 rounded-2xl bg-[#FFCC00]/15 border border-[#FFCC00]/30 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[36px] text-[#FFCC00] animate-bounce">
                    drive_folder_upload
                  </span>
                </div>
                <h3 className="text-base font-bold text-fg mb-1">
                  Solte arquivos ou pastas para enviar
                </h3>
                <p className="text-xs text-fg-muted font-mono">
                  Destino: <span className="text-[#FFCC00] font-bold">/{currentFolder || 'raiz'}</span>
                </p>
                <p className="text-[11px] text-fg-secondary mt-2">
                  Hierarquia de pastas e subálbuns preservada automaticamente
                </p>
              </div>
            )}
            {/* Sidebar no Modo IDE */}
            {layoutMode === 'ide' && (
              <VaultIdeTreeSidebar
                currentFolder={currentFolder}
                folders={folders}
                files={files}
                unlockedPins={unlockedPins}
                ticket={ticket}
                serverUrl={serverUrl}
                onSelectFolder={(folderPath, folderEntry) => {
                  const resolvedPath = folderPath || (folderEntry as unknown as { path?: string })?.path || folderEntry?.name || '';
                  if (folderEntry?.hasPin && !unlockedPins.includes(resolvedPath)) {
                    setPinModal({
                      isOpen: true,
                      mode: 'unlock',
                      folderPath: resolvedPath,
                    });
                    return;
                  }
                  setCurrentFolder(resolvedPath);
                  void loadDirectory(resolvedPath);
                }}
                onSelectFile={(f) => handleSelectEntryForPreview(f)}
                selectedFilePath={activeIdeTabPath || (selectedEntry?.kind !== 'folder' ? selectedEntry?.relativePath : null)}
                selectedFolderPath={currentFolder}
                onCreateNote={() => {
                  setEditingNotePath(null);
                  setNoteDrawerOpen(true);
                }}
                onCreateFolder={handleCreateFolder}
                onUpload={() => fileInputRef.current?.click()}
                onContextMenu={(e, type, entry) => {
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    type,
                    entry,
                  });
                }}
              />
            )}

            {/* Área Central de Trabalho */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Barra de Abas Estilo VS Code (no Modo IDE) */}
              {layoutMode === 'ide' && (
                <div className="h-10 flex items-center gap-1 px-3 bg-elevated/60 border-b border-border-subtle overflow-x-auto hide-scrollbar text-xs">
                  {openIdeTabs.map((tab) => {
                    const isActive = activeIdeTabPath === tab.relativePath;
                    return (
                      <div
                        key={tab.relativePath}
                        onClick={() => {
                          setActiveIdeTabPath(tab.relativePath);
                          setSelectedEntry(tab);
                        }}
                        className={`h-full flex items-center gap-1.5 px-3 border-b-2 cursor-pointer transition-colors group ${
                          isActive
                            ? 'border-[var(--accent-primary)] bg-surface text-[var(--accent-primary)] font-bold'
                            : 'border-transparent text-fg-muted hover:text-fg hover:bg-surface/50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {tab.kind === 'note'
                            ? 'edit_note'
                            : tab.kind === 'image'
                              ? 'image'
                              : tab.kind === 'audio'
                                ? 'audiotrack'
                                : 'description'}
                        </span>
                        <span className="truncate max-w-[140px]">{tab.name}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCloseIdeTab(e, tab.relativePath)}
                          className="p-0.5 rounded hover:bg-surface-hover text-fg-muted hover:text-fg ml-1 opacity-60 group-hover:opacity-100"
                        >
                          <span className="material-symbols-outlined text-[13px]">close</span>
                        </button>
                      </div>
                    );
                  })}
                  {openIdeTabs.length === 0 && (
                    <div className="flex items-center gap-1.5 text-fg-muted italic text-[11px] px-1 select-none">
                      <span className="material-symbols-outlined text-[14px]">terminal</span>
                      <span>Bancada de Edição (Nenhum arquivo aberto)</span>
                    </div>
                  )}
                </div>
              )}

              {/* Conteúdo: No modo IDE usa VaultIdeWorkbench; no modo Grade/Lista usa Pastas e Arquivos */}
              {layoutMode === 'ide' ? (
                <VaultIdeWorkbench
                  activeEntry={openIdeTabs.find((t) => t.relativePath === activeIdeTabPath) || null}
                  ticket={activeTicket}
                  serverUrl={serverUrl}
                  indexedRow={activeIdeTabPath ? indexedMap.get(activeIdeTabPath) : undefined}
                  availableTasks={userTasks}
                  currentFolder={currentFolder}
                  onCreateNote={() => {
                    setEditingNotePath(null);
                    setNoteDrawerOpen(true);
                  }}
                  onCreateFolder={handleCreateFolder}
                  onUpload={() => fileInputRef.current?.click()}
                  onUploadZip={() => zipInputRef.current?.click()}
                  onCloseActiveTab={() => {
                    if (activeIdeTabPath) {
                      handleCloseIdeTab(null as unknown as React.MouseEvent, activeIdeTabPath);
                    }
                  }}
                  onNoteSaved={() => void loadDirectory(currentFolder, activeTicket, true)}
                  onFileDrop={async (e) => {
                    if (e.dataTransfer) {
                      const items = await extractFilesFromDataTransfer(e.dataTransfer);
                      if (items.length > 0) {
                        handleOpenUploadManager(items);
                      }
                    }
                  }}
                />
              ) : (
                /* Conteúdo: Pastas e Arquivos (Modo Grade e Lista) */
                <div
                  ref={workspaceContainerRef}
                onMouseDown={handleWorkspaceMouseDown}
                onContextMenu={(e) => {
                  const target = e.target as HTMLElement;
                  if (!target.closest('[data-vault-path]')) {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      type: 'background',
                    });
                  }
                }}
                className="flex-1 overflow-y-auto p-4 space-y-6 relative select-none vault-workspace-bg"
              >
                {/* Pastas */}
                {folders.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted mb-2.5">
                      Pastas ({folders.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {folders.map((folder) => {
                        const folderPath = folder.relativePath || (folder as unknown as { path?: string })?.path || folder.name;
                        const isSelected = selectedPaths.has(folderPath);
                        const meta = folderMetaMap[folderPath];
                        const customColor = meta?.color;
                        const customIcon = meta?.icon || (
                          folder.name === 'Portfolio' || folder.name === 'Portfólio'
                            ? 'photo_library'
                            : folder.name === 'Curriculo'
                              ? 'verified'
                              : folder.name === 'Projetos'
                                ? 'workspaces'
                                : 'folder'
                        );
                        const isFavorite = Boolean(meta?.isFavorite);

                        return (
                          <div
                            key={folderPath}
                            data-vault-path={folderPath}
                            onClick={(e) => {
                              if (e.ctrlKey || e.metaKey || e.shiftKey || selectedPaths.size > 0) {
                                handleItemSelect(folderPath, e);
                                return;
                              }
                              if (folder.hasPin && !unlockedPins.includes(folderPath)) {
                                setPinModal({
                                  isOpen: true,
                                  mode: 'unlock',
                                  folderPath,
                                });
                                return;
                              }
                              void loadDirectory(folderPath);
                            }}
                            onDoubleClick={() => {
                              if (folder.hasPin && !unlockedPins.includes(folderPath)) {
                                setPinModal({
                                  isOpen: true,
                                  mode: 'unlock',
                                  folderPath,
                                });
                                return;
                              }
                              void loadDirectory(folderPath);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (selectedPaths.size > 1 && selectedPaths.has(folderPath)) {
                                setContextMenu({ x: e.clientX, y: e.clientY, type: 'selection' });
                              } else {
                                setSelectedPaths(new Set([folderPath]));
                                setContextMenu({ x: e.clientX, y: e.clientY, type: 'folder', entry: folder });
                              }
                            }}
                            className={`group bg-surface hover:bg-surface border rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer transition-all relative ${
                              isSelected
                                ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/5'
                                : 'border-border-subtle hover:border-[var(--accent-primary)]/50'
                            }`}
                            style={customColor ? { borderLeftColor: customColor, borderLeftWidth: '4px' } : undefined}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Checkbox de seleção */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPaths((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(folderPath)) next.delete(folderPath);
                                    else next.add(folderPath);
                                    return next;
                                  });
                                }}
                                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-opacity ${
                                  isSelected
                                    ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white opacity-100'
                                    : 'border-border-subtle hover:border-fg-muted opacity-0 group-hover:opacity-100 bg-surface'
                                }`}
                                title="Selecionar pasta"
                              >
                                {isSelected && (
                                  <span className="material-symbols-outlined text-[13px] font-bold">check</span>
                                )}
                              </button>

                              {/* Ícone com cor customizada */}
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                                style={{
                                  backgroundColor: customColor ? `${customColor}15` : 'var(--color-app, #19181f)',
                                  borderColor: customColor ? `${customColor}40` : 'var(--border-subtle, #333)',
                                }}
                              >
                                <span
                                  className="material-symbols-outlined text-[22px]"
                                  style={{ color: customColor || 'var(--accent-primary, #FFCC00)' }}
                                >
                                  {folder.hasPin
                                    ? folder.isUnlocked
                                      ? 'lock_open'
                                      : 'lock'
                                    : customIcon}
                                </span>
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold text-fg truncate">{folder.name}</span>
                                  {isFavorite && (
                                    <span className="material-symbols-outlined text-[14px] text-[#FFCC00] shrink-0" title="Pasta Favorita">
                                      star
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-fg-muted">
                                  {folder.hasPin ? 'Protegida por PIN' : 'Pasta'}
                                </div>
                              </div>
                            </div>

                            {/* Ações Rápidas (Favorito, PIN, 3 Pontinhos) */}
                            <div
                              className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleFolderFavorite(folder)}
                                title={isFavorite ? 'Remover dos Favoritos' : 'Favoritar Pasta'}
                                className={`p-1.5 rounded-lg hover:bg-surface-hover transition-colors ${
                                  isFavorite ? 'text-[#FFCC00]' : 'text-fg-muted hover:text-[#FFCC00]'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[17px]">
                                  {isFavorite ? 'star' : 'star_outline'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setPinModal({
                                    isOpen: true,
                                    mode: folder.hasPin ? 'remove' : 'set',
                                    folderPath,
                                  })
                                }
                                title={folder.hasPin ? 'Remover PIN' : 'Proteger pasta com PIN'}
                                className="p-1.5 rounded-lg hover:bg-surface-hover text-fg-secondary hover:text-[var(--accent-primary)] transition-colors"
                              >
                                <span className="material-symbols-outlined text-[17px]">
                                  {folder.hasPin ? 'lock' : 'enhanced_encryption'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setContextMenu({
                                    x: rect.right,
                                    y: rect.bottom,
                                    type: 'folder',
                                    entry: folder,
                                  });
                                }}
                                title="Opções da Pasta (Renomear, Cor, Ícone, Excluir...)"
                                className="p-1.5 rounded-lg hover:bg-surface-hover text-fg-secondary hover:text-fg transition-colors"
                              >
                                <span className="material-symbols-outlined text-[17px]">more_vert</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Arquivos */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted mb-2.5">
                    Arquivos ({files.length})
                  </h3>

                  {loadingDir ? (
                    <div className="py-12 text-center text-sm text-fg-secondary">
                      Carregando arquivos do servidor...
                    </div>
                  ) : files.length === 0 ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer) {
                          e.dataTransfer.dropEffect = 'copy';
                        }
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer) {
                          const items = await extractFilesFromDataTransfer(e.dataTransfer);
                          if (items.length > 0) {
                            handleOpenUploadManager(items);
                          }
                        }
                      }}
                      className="bg-surface border-2 border-dashed border-border-subtle hover:border-[var(--accent-primary)]/60 rounded-2xl p-8 sm:p-12 text-center space-y-4 transition-all"
                    >
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center text-[var(--accent-primary)]">
                        <span className="material-symbols-outlined text-[36px]">
                          cloud_upload
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-bold text-fg">Esta pasta ainda está vazia</p>
                        <p className="text-xs text-fg-secondary max-w-md mx-auto">
                          Arraste múltiplos arquivos ou pastas diretamente para esta área, ou utilize uma das ações rápidas abaixo:
                        </p>
                      </div>

                      {/* Ações Diretas no Empty State */}
                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover text-fg border border-border-subtle text-xs font-bold transition-all flex items-center gap-2 shadow-sm hover:border-[var(--accent-secondary)]"
                          title="Subir um ou múltiplos arquivos"
                        >
                          <span className="material-symbols-outlined text-[18px] text-[var(--accent-secondary)]">
                            upload_file
                          </span>
                          <span>Subir Arquivos</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => folderInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover text-fg border border-border-subtle text-xs font-bold transition-all flex items-center gap-2 shadow-sm hover:border-[#00E5FF]"
                          title="Subir pasta completa preservando subpastas"
                        >
                          <span className="material-symbols-outlined text-[18px] text-[#00E5FF]">
                            drive_folder_upload
                          </span>
                          <span>Subir Pasta (ou Múltiplas)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => zipInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover text-fg border border-border-subtle text-xs font-bold transition-all flex items-center gap-2 shadow-sm hover:border-[#FFCC00]"
                          title="Subir arquivo .ZIP e descompactar no servidor"
                        >
                          <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">
                            folder_zip
                          </span>
                          <span>Subir Pacote .ZIP</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingNotePath(null);
                            setNoteDrawerOpen(true);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover text-fg border border-border-subtle text-xs font-bold transition-all flex items-center gap-2 shadow-sm hover:border-[#9D4EDD]"
                          title="Criar uma nova nota Markdown rápida"
                        >
                          <span className="material-symbols-outlined text-[18px] text-[#9D4EDD]">
                            edit_note
                          </span>
                          <span>Nova Nota (.md)</span>
                        </button>
                      </div>
                    </div>
                  ) : layoutMode === 'list' ? (
                    /* Visualização em Lista Tabular */
                    <div className="border border-border-subtle rounded-xl overflow-x-auto bg-surface">
                      <table className="w-full text-left text-xs min-w-[640px]">
                        <thead className="bg-surface-hover text-fg-muted uppercase tracking-wider border-b border-border-subtle">
                          <tr>
                            <th className="py-2.5 px-3">Nome</th>
                            <th className="py-2.5 px-3">Tipo</th>
                            <th className="py-2.5 px-3">Tamanho</th>
                            <th className="py-2.5 px-3">Modificado</th>
                            <th className="py-2.5 px-3 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {files.map((file) => {
                            const indexRow = indexedMap.get(file.relativePath);
                            const isSelected = selectedPaths.has(file.relativePath) || selectedEntry?.relativePath === file.relativePath;
                            const isFavorite = Boolean(indexRow?.is_favorite);

                            return (
                              <tr
                                key={file.relativePath}
                                data-vault-path={file.relativePath}
                                onClick={(e) => {
                                  if (e.ctrlKey || e.metaKey || e.shiftKey || selectedPaths.size > 0) {
                                    handleItemSelect(file.relativePath, e);
                                    return;
                                  }
                                  handleSelectEntryForPreview(file);
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (selectedPaths.size > 1 && selectedPaths.has(file.relativePath)) {
                                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'selection' });
                                  } else {
                                    setSelectedPaths(new Set([file.relativePath]));
                                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'file', entry: file });
                                  }
                                }}
                                className={`cursor-pointer transition-colors ${
                                  selectedPaths.has(file.relativePath)
                                    ? 'bg-[var(--accent-primary)]/15 text-fg'
                                    : isSelected
                                      ? 'bg-[var(--accent-primary)]/10 text-fg'
                                      : 'hover:bg-surface-hover text-fg'
                                }`}
                              >
                                <td className="py-2 px-3 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPaths((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(file.relativePath)) next.delete(file.relativePath);
                                        else next.add(file.relativePath);
                                        return next;
                                      });
                                    }}
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-opacity ${
                                      selectedPaths.has(file.relativePath)
                                        ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white opacity-100'
                                        : 'border-border-subtle hover:border-fg-muted opacity-40 hover:opacity-100 bg-surface'
                                    }`}
                                  >
                                    {selectedPaths.has(file.relativePath) && (
                                      <span className="material-symbols-outlined text-[11px] font-bold">check</span>
                                    )}
                                  </button>

                                  <span className="material-symbols-outlined text-[16px] text-[var(--accent-primary)] shrink-0">
                                    {file.kind === 'note'
                                      ? 'edit_note'
                                      : file.kind === 'image'
                                        ? 'image'
                                        : file.kind === 'audio'
                                          ? 'audiotrack'
                                          : 'description'}
                                  </span>
                                  <span className="font-semibold text-fg truncate max-w-xs" title={file.name}>
                                    {file.name}
                                  </span>
                                  {isFavorite && (
                                    <span className="material-symbols-outlined text-[13px] text-[#FFCC00] shrink-0" title="Favorito">
                                      star
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 capitalize text-fg-muted">{file.kind}</td>
                                <td className="py-2 px-3 font-mono text-fg-muted">{formatStorageBytes(file.sizeBytes)}</td>
                                <td className="py-2 px-3 text-fg-muted">
                                  {file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString('pt-BR') : '-'}
                                </td>
                                <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleFileFavorite(file)}
                                      title={isFavorite ? 'Remover dos Favoritos' : 'Favoritar Arquivo'}
                                      className={`p-1 rounded hover:bg-surface-hover ${
                                        isFavorite ? 'text-[#FFCC00]' : 'text-fg-muted hover:text-[#FFCC00]'
                                      }`}
                                    >
                                      <span className="material-symbols-outlined text-[16px]">
                                        {isFavorite ? 'star' : 'star_outline'}
                                      </span>
                                    </button>
                                    <a
                                      href={buildTenantStreamUrl(file.relativePath, ticket, { serverUrl, download: true })}
                                      className="p-1 rounded text-fg-secondary hover:text-fg hover:bg-surface-hover"
                                      title="Download direto"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">download</span>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setContextMenu({
                                          x: rect.right,
                                          y: rect.bottom,
                                          type: 'file',
                                          entry: file,
                                        });
                                      }}
                                      title="Opções do Arquivo"
                                      className="p-1 rounded text-fg-secondary hover:text-fg hover:bg-surface-hover"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">more_vert</span>
                                    </button>
                                    <FileEcosystemMenu
                                      entry={file}
                                      indexRow={indexRow}
                                      availableTasks={userTasks}
                                      onUpdated={() => void loadDirectory(currentFolder)}
                                      onRequestRename={handleRenameEntry}
                                      onRequestDelete={handleDeleteEntry}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* Visualização em Grade de Cards */
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                      {files.map((file) => {
                        const indexRow = indexedMap.get(file.relativePath);
                        const isImage = file.kind === 'image';
                        const isNote = file.kind === 'note';
                        const thumbUrl = isImage
                          ? buildTenantThumbUrl(file.relativePath, ticket, { serverUrl })
                          : null;
                        const isSelected = selectedPaths.has(file.relativePath) || selectedEntry?.relativePath === file.relativePath;
                        const isFavorite = Boolean(indexRow?.is_favorite);

                        return (
                          <div
                            key={file.relativePath}
                            data-vault-path={file.relativePath}
                            onClick={(e) => {
                              if (e.ctrlKey || e.metaKey || e.shiftKey || selectedPaths.size > 0) {
                                handleItemSelect(file.relativePath, e);
                                return;
                              }
                              handleSelectEntryForPreview(file);
                              if (isNote) {
                                setEditingNotePath(file.relativePath);
                                setNoteDrawerOpen(true);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (selectedPaths.size > 1 && selectedPaths.has(file.relativePath)) {
                                setContextMenu({ x: e.clientX, y: e.clientY, type: 'selection' });
                              } else {
                                setSelectedPaths(new Set([file.relativePath]));
                                setContextMenu({ x: e.clientX, y: e.clientY, type: 'file', entry: file });
                              }
                            }}
                            className={`group bg-surface hover:bg-surface border rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all relative ${
                              selectedPaths.has(file.relativePath)
                                ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/50'
                                : isSelected
                                  ? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]'
                                  : 'border-border-subtle hover:border-[var(--accent-primary)]/50'
                            }`}
                          >
                            {/* Área Visual / Miniatura Passe-Partout */}
                            <div className="h-40 bg-app flex items-center justify-center relative p-2 overflow-hidden">
                              {/* Checkbox de Seleção no canto superior esquerdo */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPaths((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(file.relativePath)) next.delete(file.relativePath);
                                    else next.add(file.relativePath);
                                    return next;
                                  });
                                }}
                                className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                  selectedPaths.has(file.relativePath)
                                    ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white opacity-100'
                                    : 'border-border-subtle hover:border-fg-muted opacity-0 group-hover:opacity-100 bg-surface/80 backdrop-blur-sm'
                                }`}
                                title="Selecionar arquivo"
                              >
                                {selectedPaths.has(file.relativePath) && (
                                  <span className="material-symbols-outlined text-[13px] font-bold">check</span>
                                )}
                              </button>

                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={file.name}
                                  loading="lazy"
                                  className="max-h-full max-w-full object-contain rounded"
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    if (!target.dataset.fallback) {
                                      target.dataset.fallback = 'true';
                                      target.src = buildTenantStreamUrl(file.relativePath, ticket, { serverUrl });
                                    }
                                  }}
                                />
                              ) : (
                                <span className="material-symbols-outlined text-[42px] text-[var(--accent-primary)]">
                                  {isNote
                                    ? 'description'
                                    : file.kind === 'audio'
                                      ? 'headphones'
                                      : file.kind === 'video'
                                        ? 'movie'
                                        : file.kind === 'pdf'
                                          ? 'picture_as_pdf'
                                          : 'insert_drive_file'}
                                </span>
                              )}

                              {/* Badges dos 4 Pilares (deslocadas para a direita do checkbox) */}
                              <div className="absolute top-2 left-9 flex flex-wrap gap-1">
                                {indexRow?.show_in_portfolio && (
                                  <span className="px-2 py-0.5 rounded bg-[#FFCC00] text-[#121212] text-[10px] font-extrabold">
                                    Portfólio
                                  </span>
                                )}
                                {indexRow?.show_in_curriculum && (
                                  <span className="px-2 py-0.5 rounded bg-[var(--accent-primary)] text-white text-[10px] font-extrabold">
                                    Currículo
                                  </span>
                                )}
                                {(indexRow?.linked_task_ids?.length || 0) > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500 text-[#121212] text-[10px] font-extrabold">
                                    {indexRow!.linked_task_ids.length} Tarefa(s)
                                  </span>
                                )}
                              </div>

                              {/* Ações no Topo Direito (Favorito, 3 Pontinhos, Sinergia Hub) */}
                              <div className="absolute top-2 right-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleFileFavorite(file)}
                                  title={isFavorite ? 'Remover dos Favoritos' : 'Favoritar Arquivo'}
                                  className={`p-1.5 rounded-lg bg-app/80 hover:bg-surface-hover border border-border-subtle transition-colors ${
                                    isFavorite ? 'text-[#FFCC00]' : 'text-fg-secondary hover:text-[#FFCC00]'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[17px]">
                                    {isFavorite ? 'star' : 'star_outline'}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setContextMenu({
                                      x: rect.right,
                                      y: rect.bottom,
                                      type: 'file',
                                      entry: file,
                                    });
                                  }}
                                  title="Mais Opções (3 pontinhos)"
                                  className="p-1.5 rounded-lg bg-app/80 hover:bg-surface-hover text-fg-secondary hover:text-fg border border-border-subtle transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[17px]">more_vert</span>
                                </button>

                                <FileEcosystemMenu
                                  entry={file}
                                  indexRow={indexRow}
                                  availableTasks={userTasks}
                                  onUpdated={() => void loadDirectory(currentFolder)}
                                  onRequestRename={handleRenameEntry}
                                  onRequestDelete={handleDeleteEntry}
                                />
                              </div>
                            </div>

                            {/* Rodapé do Card */}
                            <div className="p-3 flex items-center justify-between gap-2 border-t border-border-subtle">
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-fg truncate" title={file.name}>
                                  {file.name}
                                </div>
                                <div className="text-[11px] text-fg-muted">
                                  {formatStorageBytes(file.sizeBytes)}
                                </div>
                              </div>

                              <a
                                href={buildTenantStreamUrl(file.relativePath, ticket, {
                                  serverUrl,
                                  download: true,
                                })}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-hover"
                                title="Baixar original"
                              >
                                <span className="material-symbols-outlined text-[18px]">download</span>
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>

            {/* Painel Lateral de Inspeção & Metadados (Alt+P) */}
            <VaultPreviewPanel
              entry={selectedEntry}
              isOpen={isPreviewOpen}
              onClose={() => setIsPreviewOpen(false)}
              ticket={ticket}
              serverUrl={serverUrl}
              indexedRow={selectedEntry ? indexedMap.get(selectedEntry.relativePath) : undefined}
              availableTasks={userTasks}
              onOpenNoteEditor={(relPath) => {
                setEditingNotePath(relPath);
                setNoteDrawerOpen(true);
              }}
              onOpenEcosystemMenu={(entry) => handleSelectEntryForPreview(entry)}
              onEcosystemUpdated={() => void loadDirectory(currentFolder)}
            />
          </div>
        </div>
      )}

      {/* ABA 2: LINKS DE CLIENTES (/s/[token]) */}
      {activeTab === 'shares' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-fg">
                Links de Aprovação e Entrega para Clientes (/s/[token])
              </h3>
              <p className="text-xs text-fg-secondary">
                Quando o cliente aprova fotos em um link, o Aurtistic cria automaticamente uma Tarefa vinculada aos arquivos escolhidos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShareFolder(currentFolder || 'Portfolio');
                setShareTitle('Seleção do Cliente');
                setShareModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] text-xs font-bold flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">add_link</span>
              Novo Link de Cliente
            </button>
          </div>

          {shareLinks.length === 0 ? (
            <div className="bg-surface border border-border-subtle rounded-xl p-8 text-center text-xs text-fg-secondary">
              Nenhum link de compartilhamento ativo.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shareLinks.map((sl) => (
                <div
                  key={sl.id}
                  className="bg-surface border border-border-subtle rounded-xl p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-fg">{sl.album_title}</h4>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          sl.is_submitted
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-[#9D4EDD]/15 text-[#E0AAFF] border border-[#9D4EDD]/30'
                        }`}
                      >
                        {sl.is_submitted
                          ? `Aprovado (${sl.selected_file_paths?.length || 0} fotos)`
                          : 'Aguardando Cliente'}
                      </span>
                    </div>
                    <p className="text-xs text-fg-secondary mt-1">Pasta: /{sl.folder_path}</p>
                    {sl.client_feedback && (
                      <p className="mt-2 p-2.5 rounded-lg bg-app border border-border-subtle text-xs text-fg-secondary">
                        <strong className="text-[#FFCC00]">{sl.client_name || 'Cliente'}:</strong>{' '}
                        {sl.client_feedback}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
                    <a
                      href={`/s/${sl.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#FFCC00] hover:underline font-bold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                      /s/{sl.token}
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleDeleteShareLink(sl.id)}
                      className="text-[#F14343] hover:underline font-bold"
                    >
                      Revogar Link
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 3: LIXEIRA ISOLADA POR USUÁRIO */}
      {activeTab === 'trash' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-fg">Lixeira do Meu Espaço</h3>
              <p className="text-xs text-fg-secondary">
                Restaure arquivos para sua pasta original ou esvazie a lixeira para liberar sua quota de 25 GB.
              </p>
            </div>
            {trashItems.length > 0 && (
              <button
                type="button"
                onClick={() => void handleEmptyTrash()}
                className="px-4 py-2 rounded-xl bg-[#F14343] hover:bg-[#d93636] text-white text-xs font-bold flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                Esvaziar Lixeira
              </button>
            )}
          </div>

          {loadingTrash ? (
            <div className="py-10 text-center text-xs text-fg-secondary">Carregando lixeira...</div>
          ) : trashItems.length === 0 ? (
            <div className="bg-surface border border-border-subtle rounded-xl p-8 text-center text-xs text-fg-secondary">
              Sua lixeira está limpa.
            </div>
          ) : (
            <div className="bg-surface border border-border-subtle rounded-xl divide-y divide-[#2D2D2D]">
              {trashItems.map((item) => (
                <div
                  key={item.trashId}
                  className="p-4 flex items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="font-bold text-fg">{item.name}</div>
                    <div className="text-fg-muted">
                      Origem: /{item.originalRelativePath} • {formatStorageBytes(item.sizeBytes)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRestoreTrashItem(item)}
                      className="px-3 py-1.5 rounded-lg bg-surface-hover hover:bg-emerald-500 hover:text-[#121212] text-fg font-bold transition-colors"
                    >
                      Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleEmptyTrash(item.trashId)}
                      className="px-3 py-1.5 rounded-lg bg-[#F14343]/15 hover:bg-[#F14343] text-[#ffb4ab] hover:text-fg font-bold transition-colors"
                    >
                      Apagar Definitivo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 4 & 5: PAINEL ADMIN DE GOVERNANÇA (25 GB / EVENTOS) & TELEMETRIA HW */}
      {profile.storage_role === 'admin' && activeTab === 'admin_quotas' && (
        <AdminQuotaGovernancePanel mode="governance" ticket={ticket} serverUrl={serverUrl} />
      )}

      {profile.storage_role === 'admin' && activeTab === 'admin_telemetry' && (
        <AdminQuotaGovernancePanel mode="telemetry" ticket={ticket} serverUrl={serverUrl} />
      )}

      {/* Gaveta de Notas .md / .txt */}
      <NoteEditorDrawer
        isOpen={noteDrawerOpen}
        onClose={() => setNoteDrawerOpen(false)}
        folderPath={currentFolder || ''}
        initialRelativePath={editingNotePath}
        ticket={ticket}
        serverUrl={serverUrl}
        onSaved={(mut) => {
          if (typeof mut.total_used_bytes === 'number') setUsedBytes(mut.total_used_bytes);
          void loadDirectory(currentFolder);
        }}
      />

      {/* Modal de PIN */}
      <PinLockModal
        isOpen={pinModal.isOpen}
        mode={pinModal.mode}
        folderPath={pinModal.folderPath}
        pinHint={pinModal.pinHint}
        ticket={ticket}
        serverUrl={serverUrl}
        onClose={() => setPinModal((p) => ({ ...p, isOpen: false }))}
        onSuccess={(fp, m) => void handlePinModalSuccess(fp, m)}
      />

      {/* Modal de Criar Share Link (/s/[token]) */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border border-border-subtle rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-fg">
              Criar Link de Seleção para Cliente (/s/[token])
            </h3>
            <form onSubmit={handleCreateShareLink} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-fg-secondary uppercase mb-1">
                  Pasta Compartilhada
                </label>
                <input
                  type="text"
                  value={shareFolder}
                  onChange={(e) => setShareFolder(e.target.value)}
                  className="w-full bg-app border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-fg-secondary uppercase mb-1">
                  Título do Álbum / Projeto
                </label>
                <input
                  type="text"
                  required
                  value={shareTitle}
                  onChange={(e) => setShareTitle(e.target.value)}
                  placeholder="Ex: Ensaio Marina • Seleção"
                  className="w-full bg-app border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-fg-secondary uppercase mb-1">
                  PIN de Proteção (Opcional, 4–8 dígitos)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={sharePin}
                  onChange={(e) => setSharePin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Deixe em branco para acesso direto"
                  className="w-full bg-app border border-border-subtle rounded-lg px-3 py-2 text-xs text-fg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShareModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-border-subtle text-xs font-bold text-fg-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={shareCreating}
                  className="px-4 py-2 rounded-lg bg-[#FFCC00] text-[#121212] text-xs font-bold"
                >
                  {shareCreating ? 'Gerando...' : 'Gerar Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Rápido de Visualização de Mídia */}
      {previewEntry && (
        <div
          onClick={() => setPreviewEntry(null)}
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 bg-app border-b border-border-subtle flex items-center justify-between">
              <div className="text-xs font-bold text-fg truncate">{previewEntry.name}</div>
              <button
                type="button"
                onClick={() => setPreviewEntry(null)}
                className="p-1 text-fg-secondary hover:text-fg"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-6 flex items-center justify-center max-h-[75vh] overflow-auto bg-app">
              {previewEntry.kind === 'image' ? (
                <img
                  src={buildTenantStreamUrl(previewEntry.relativePath, activeTicket, { serverUrl })}
                  alt={previewEntry.name}
                  className="max-h-[68vh] w-auto object-contain rounded"
                />
              ) : previewEntry.kind === 'audio' ? (
                <audio
                  controls
                  autoPlay
                  src={buildTenantStreamUrl(previewEntry.relativePath, activeTicket, { serverUrl })}
                  className="w-full max-w-md"
                />
              ) : previewEntry.kind === 'video' ? (
                <video
                  controls
                  autoPlay
                  src={buildTenantStreamUrl(previewEntry.relativePath, activeTicket, { serverUrl })}
                  className="max-h-[68vh] w-auto rounded"
                />
              ) : (
                <iframe
                  src={buildTenantStreamUrl(previewEntry.relativePath, activeTicket, { serverUrl })}
                  title={previewEntry.name}
                  className="w-full h-[65vh] rounded border border-border-subtle bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Solicitar Boost de Quota para Evento */}
      {isBoostModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#9D4EDD] text-[22px]">bolt</span>
                <h3 className="text-base font-bold text-fg">Solicitar Boost para Evento</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBoostModalOpen(false)}
                className="text-fg-muted hover:text-fg"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!boostEventName.trim()) return;
                setIsSubmittingBoost(true);
                setBoostFeedback(null);
                try {
                  const res = await requestEventQuotaBoostAction({
                    eventName: boostEventName.trim(),
                    durationDays: boostDays,
                    boostGb,
                    organizationId: boostTargetScope === 'org' && selectedOrgId ? selectedOrgId : null,
                  });
                  if (!res.ok) {
                    setBoostFeedback(`Erro: ${res.error || 'Falha ao solicitar boost'}`);
                  } else {
                    setBoostFeedback('✅ Boost ativado com sucesso!');
                    setTimeout(() => {
                      setIsBoostModalOpen(false);
                      setBoostFeedback(null);
                      setBoostEventName('');
                    }, 2000);
                  }
                } catch (err: unknown) {
                  setBoostFeedback(err instanceof Error ? err.message : 'Falha na solicitação.');
                } finally {
                  setIsSubmittingBoost(false);
                }
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Destino do Boost</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBoostTargetScope('personal')}
                    className={`flex-1 py-2 rounded-lg border font-bold transition-colors ${
                      boostTargetScope === 'personal'
                        ? 'border-[#FFCC00] bg-[#FFCC00]/10 text-[#FFCC00]'
                        : 'border-border-subtle bg-surface text-fg-muted hover:text-fg'
                    }`}
                  >
                    Meu Cofre Pessoal
                  </button>
                  {selectedOrg && (
                    <button
                      type="button"
                      onClick={() => setBoostTargetScope('org')}
                      className={`flex-1 py-2 rounded-lg border font-bold transition-colors ${
                        boostTargetScope === 'org'
                          ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                          : 'border-border-subtle bg-surface text-fg-muted hover:text-fg'
                      }`}
                    >
                      {selectedOrg.name}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nome do Evento / Motivo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Semana de Arte USP / Gravação de Vídeo"
                  value={boostEventName}
                  onChange={(e) => setBoostEventName(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-app p-2.5 text-xs text-fg placeholder-slate-600 focus:border-[#9D4EDD] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Espaço Adicional</label>
                  <select
                    value={boostGb}
                    onChange={(e) => setBoostGb(Number(e.target.value))}
                    className="w-full rounded-lg border border-border-subtle bg-app p-2.5 text-xs text-fg focus:border-[#9D4EDD] focus:outline-none"
                  >
                    <option value={25}>+25 GB</option>
                    <option value={50}>+50 GB (Padrão)</option>
                    <option value={100}>+100 GB</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Duração</label>
                  <select
                    value={boostDays}
                    onChange={(e) => setBoostDays(Number(e.target.value))}
                    className="w-full rounded-lg border border-border-subtle bg-app p-2.5 text-xs text-fg focus:border-[#9D4EDD] focus:outline-none"
                  >
                    <option value={7}>7 dias</option>
                    <option value={14}>14 dias (Recomendado)</option>
                    <option value={30}>30 dias</option>
                  </select>
                </div>
              </div>

              {boostFeedback && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-medium ${
                    boostFeedback.startsWith('✅')
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                  }`}
                >
                  {boostFeedback}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsBoostModalOpen(false)}
                  className="rounded-lg px-3 py-1.5 font-semibold text-slate-400 hover:text-fg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBoost || !boostEventName.trim()}
                  className="rounded-lg bg-[#9D4EDD] px-4 py-1.5 font-bold text-fg hover:bg-[#8338EC] disabled:opacity-50 transition-colors"
                >
                  {isSubmittingBoost ? 'Ativando...' : 'Ativar Boost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Gerenciador de Uploads (Pop-up de Confirmação & Dock Minimizado) */}
      <VaultUploadManagerModal
        isOpen={uploadManagerOpen}
        onClose={() => setUploadManagerOpen(false)}
        initialItems={uploadManagerInitialItems}
        currentFolder={currentFolder}
        ticket={activeTicket}
        serverUrl={serverUrl}
        selectedOrgId={selectedOrgId}
        onUploadFinished={({ successCount, newUsedBytes }) => {
          if (typeof newUsedBytes === 'number') {
            setUsedBytes(newUsedBytes);
          }
          if (successCount > 0) {
            void loadDirectory(currentFolder);
          }
        }}
      />

      {/* Barra de Ações em Lote para Seleção Múltipla */}
      {selectedPaths.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-surface/95 backdrop-blur-md border border-[var(--accent-primary)]/50 rounded-2xl shadow-2xl px-4 py-2.5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 pl-1 pr-3 border-r border-border-subtle">
            <span className="w-6 h-6 rounded-full bg-[var(--accent-primary)] text-white font-extrabold text-xs flex items-center justify-center">
              {selectedPaths.size}
            </span>
            <span className="text-xs font-bold text-fg">selecionado(s)</span>
          </div>

          <button
            type="button"
            onClick={() => void handleBatchMoveToPortfolio()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFCC00]/15 hover:bg-[#FFCC00]/25 text-[#FFCC00] text-xs font-bold border border-[#FFCC00]/40 transition-colors shadow-sm"
            title="Mover e publicar todos os arquivos selecionados na pasta do Portfólio"
          >
            <span className="material-symbols-outlined text-[16px]">photo_library</span>
            <span>Mandar para Portfólio</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadBatchZip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-app hover:bg-surface-hover text-fg text-xs font-semibold border border-border-subtle hover:border-[var(--accent-secondary)] transition-colors"
            title="Baixar todos os itens selecionados em um arquivo .ZIP"
          >
            <span className="material-symbols-outlined text-[16px] text-[var(--accent-secondary)]">
              folder_zip
            </span>
            <span>Baixar (.ZIP)</span>
          </button>

          <button
            type="button"
            onClick={() => void handleBatchDelete()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F14343]/10 hover:bg-[#F14343]/20 text-[#F14343] text-xs font-bold border border-[#F14343]/30 transition-colors"
            title="Mover todos os itens selecionados para a Lixeira"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            <span>Mover para Lixeira</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPaths(new Set())}
            className="p-1.5 rounded-xl text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors ml-1"
            title="Limpar seleção (Esc)"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Retângulo de Seleção por Arrastar (Marquee / Rubberband) */}
      {marqueeBox && (
        <div
          className="fixed pointer-events-none border-2 border-[var(--accent-primary)] bg-[var(--accent-primary)]/15 rounded-lg z-50 transition-none"
          style={{
            left: `${Math.min(marqueeBox.startX, marqueeBox.currentX)}px`,
            top: `${Math.min(marqueeBox.startY, marqueeBox.currentY)}px`,
            width: `${Math.abs(marqueeBox.currentX - marqueeBox.startX)}px`,
            height: `${Math.abs(marqueeBox.currentY - marqueeBox.startY)}px`,
          }}
        />
      )}

      {/* Menu de Contexto (Botão Direito & 3 Pontinhos) */}
      {contextMenu && (
        <VaultContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          entry={contextMenu.entry}
          selectedCount={selectedPaths.size}
          indexRow={contextMenu.entry ? indexedMap.get(contextMenu.entry.relativePath) : undefined}
          folderMeta={contextMenu.entry ? folderMetaMap[contextMenu.entry.relativePath] : undefined}
          availableTasks={userTasks}
          hasPin={contextMenu.entry?.hasPin}
          onClose={() => setContextMenu(null)}
          onOpenFolder={(path) => {
            if (contextMenu.entry?.hasPin && !unlockedPins.includes(path)) {
              setPinModal({ isOpen: true, mode: 'unlock', folderPath: path });
              return;
            }
            void loadDirectory(path);
          }}
          onPreviewFile={(entry) => handleSelectEntryForPreview(entry)}
          onDownload={(entry) => {
            const url = buildTenantStreamUrl(entry.relativePath, ticket, { serverUrl, download: true });
            window.open(url, '_blank');
          }}
          onDownloadZip={(folderPath) => handleDownloadFolderZip(folderPath)}
          onDownloadBatchZip={handleDownloadBatchZip}
          onRename={(entry) => void handleRenameEntry(entry)}
          onDelete={(entry) => void handleDeleteEntry(entry)}
          onBatchDelete={() => void handleBatchDelete()}
          onTogglePin={(entry) => {
            setPinModal({
              isOpen: true,
              mode: entry.hasPin ? 'remove' : 'set',
              folderPath: entry.relativePath,
            });
          }}
          onToggleFavorite={(entry) => {
            if (entry.kind === 'folder') {
              handleToggleFolderFavorite(entry);
            } else {
              void handleToggleFileFavorite(entry);
            }
          }}
          onUpdateFolderColor={(folderPath, colorHex) => handleUpdateFolderColor(folderPath, colorHex)}
          onUpdateFolderIcon={(folderPath, iconName) => handleUpdateFolderIcon(folderPath, iconName)}
          onTogglePortfolio={async (entry) => {
            const row = indexedMap.get(entry.relativePath);
            const nextVal = !Boolean(row?.show_in_portfolio);
            await updateFileEcosystemLinksAction({
              relativePath: entry.relativePath,
              filename: entry.name,
              mimeType: entry.mimeType,
              sizeBytes: entry.sizeBytes,
              patch: { showInPortfolio: nextVal, visibility: nextVal ? 'public' : row?.visibility || 'private' },
            });
            await loadDirectory(currentFolder);
          }}
          onMoveToPortfolio={(entry) => void handleMoveToPortfolio(entry)}
          onBatchMoveToPortfolio={() => void handleBatchMoveToPortfolio()}
          onToggleCurriculum={async (entry) => {
            const row = indexedMap.get(entry.relativePath);
            const nextVal = !Boolean(row?.show_in_curriculum);
            await updateFileEcosystemLinksAction({
              relativePath: entry.relativePath,
              filename: entry.name,
              mimeType: entry.mimeType,
              sizeBytes: entry.sizeBytes,
              patch: { showInCurriculum: nextVal },
            });
            await loadDirectory(currentFolder);
          }}
          onLinkTask={async (entry, taskId) => {
            const row = indexedMap.get(entry.relativePath);
            const currentTasks = row?.linked_task_ids || [];
            const isLinked = currentTasks.includes(taskId);
            await updateFileEcosystemLinksAction({
              relativePath: entry.relativePath,
              filename: entry.name,
              mimeType: entry.mimeType,
              sizeBytes: entry.sizeBytes,
              patch: isLinked ? { removeTaskIds: [taskId] } : { addTaskIds: [taskId] },
            });
            await loadDirectory(currentFolder);
          }}
          onCreateFolder={() => void handleCreateFolder()}
          onCreateNote={() => {
            setEditingNotePath(null);
            setNoteDrawerOpen(true);
          }}
          onUploadFiles={() => fileInputRef.current?.click()}
          onUploadFolder={() => folderInputRef.current?.click()}
          onUploadZip={() => zipInputRef.current?.click()}
          onRefresh={() => void loadDirectory(currentFolder)}
          onClearSelection={() => setSelectedPaths(new Set())}
        />
      )}

      {/* Diálogo de Ação / Confirmação Interno da Plataforma */}
      <VaultActionDialog
        isOpen={actionDialog.isOpen}
        title={actionDialog.title}
        description={actionDialog.description}
        mode={actionDialog.mode}
        icon={actionDialog.icon}
        confirmLabel={actionDialog.confirmLabel}
        cancelLabel={actionDialog.cancelLabel}
        defaultValue={actionDialog.defaultValue}
        placeholder={actionDialog.placeholder}
        onConfirm={actionDialog.onConfirm}
        onCancel={() => setActionDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

