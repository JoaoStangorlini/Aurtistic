// Este programa é um software livre (Licença AGPLv3)
/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
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
  createTenantFolderShortcutDirect,
  deleteTenantFolderShortcutDirect,
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
  requestOrgVaultAccessAction,
  cascadeFolderUpdateAction,
  updateFileEcosystemLinksAction,
  tagFolderDevicesAction,
  syncShortcutInSupabaseAction,
  removeShortcutFromSupabaseAction,
  getShortcutTargetFallbackEntriesAction,
} from '@/app/(dashboard)/servidor/actions';
import { useVaultUpload } from '@/contexts/VaultUploadContext';
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
import { GooglePhotosTimelineView } from '@/components/galeria/GooglePhotosTimelineView';
import type { GalleryTimelineItem } from '@/types/storage';
import { OrganizationMaterialSelector } from '@/components/organizacoes/OrganizationMaterialSelector';
import { OrganizationBrandProvider } from '@/components/organizacoes/OrganizationBrandProvider';
import { syncHubOrganizationsAction } from '@/app/(dashboard)/organizacoes/actions';
import { VaultPreviewPanel } from './VaultPreviewPanel';
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
  userName?: string;
  userAvatarUrl?: string | null;
  initialOrgId?: string | null;
  isEmbed?: boolean;
  isInline?: boolean;
}

type ActiveTab = 'vault' | 'shares' | 'trash' | 'admin_quotas' | 'admin_telemetry';

type VaultLayoutMode = 'grid' | 'list' | 'ide' | 'timeline';

function getInitialVaultLayout(): VaultLayoutMode {
  if (typeof window === 'undefined') return 'grid';
  try {
    const saved = localStorage.getItem('aurtistic_vault_layout_mode');
    if (saved === 'grid' || saved === 'list' || saved === 'ide' || saved === 'timeline') return saved;
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
  userName,
  userAvatarUrl = null,
  initialOrgId = null,
  isEmbed = false,
  isInline = false,
}: UserVaultWorkspaceProps) {
  const [isUrlInline] = useState(() => {
    if (typeof window === 'undefined') return false;
    const sp = new URLSearchParams(window.location.search);
    return sp.get('inline') === '1' || sp.get('embed') === '1';
  });
  const isEffectiveInline = isEmbed || isInline || isUrlInline;
  const [syncedOrgs, setSyncedOrgs] = useState<UserOrganizationVaultOption[] | null>(null);
  const localOrgs = syncedOrgs || userOrganizations;

  // Sincronização automática silenciosa com o HUB LabDiv (sem botão manual)
  useEffect(() => {
    let active = true;
    syncHubOrganizationsAction()
      .then((res) => {
        if (!active || !res.ok || !Array.isArray(res.organizations)) return;
        const formatted: UserOrganizationVaultOption[] = res.organizations.map((o: any) => ({
          id: o.id,
          name: o.name || 'Organização',
          slug: o.slug || 'labdiv',
          role: o.myRole || o.role || 'membro',
          can_upload_vault: o.canUploadOrgVault !== false,
          quotaBytes: o.storage_quota_bytes || 53687091200,
          usedBytes: o.storage_used_bytes || 0,
          boostActive: false,
          boostExpiresAt: null,
          boostReason: null,
        }));
        setSyncedOrgs(formatted);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(initialOrgId);
  const [orgVaultTicket, setOrgVaultTicket] = useState<{ orgId: string; ticket: string } | null>(null);
  // Guard to prevent race-condition when switching between personal/org scopes
  const [switchingScope, setSwitchingScope] = useState(false);

  // Modal Boost Evento
  const [isBoostModalOpen, setIsBoostModalOpen] = useState(false);
  const [boostEventName, setBoostEventName] = useState('');
  const [boostDays, setBoostDays] = useState(14);
  const [boostGb, setBoostGb] = useState(50);
  const [boostTargetScope, setBoostTargetScope] = useState<'personal' | 'org'>('personal');
  const [isSubmittingBoost, setIsSubmittingBoost] = useState(false);
  const [boostFeedback, setBoostFeedback] = useState<string | null>(null);

  const selectedOrg = useMemo(() => {
    return localOrgs.find((o) => o.id === selectedOrgId) || null;
  }, [localOrgs, selectedOrgId]);

  // Modal de Criação de Atalho Bidirecional (Org <-> Pessoal ou Pessoal <-> Pessoal)
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [shortcutViewMode, setShortcutViewMode] = useState<'breadcrumbs' | 'tree'>('breadcrumbs');
  const [shortcutSourceScope, setShortcutSourceScope] = useState<'personal' | string>('personal');
  const [shortcutTargetScope, setShortcutTargetScope] = useState<'current' | 'personal' | string>('current');
  const [shortcutTargetFolder, setShortcutTargetFolder] = useState('');
  const [shortcutAllowTargetPick, setShortcutAllowTargetPick] = useState(false);
  const [shortcutBrowserPath, setShortcutBrowserPath] = useState('');
  const [shortcutBrowserFolders, setShortcutBrowserFolders] = useState<{ name: string; relativePath: string }[]>([]);
  const [loadingPersonalFolders, setLoadingPersonalFolders] = useState(false);
  const [selectedPersonalFolder, setSelectedPersonalFolder] = useState('');
  const [shortcutDisplayName, setShortcutDisplayName] = useState('');
  const [isCreatingShortcut, setIsCreatingShortcut] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [shortcutTreeChildren, setShortcutTreeChildren] = useState<
    Record<string, { name: string; relativePath: string }[]>
  >({});
  const [expandedShortcutTreePaths, setExpandedShortcutTreePaths] = useState<string[]>([]);
  const [loadingTreePath, setLoadingTreePath] = useState<string | null>(null);
  const scopeTicketCacheRef = useRef<Record<string, string>>({});

  // Solicitação de Acesso ao Cofre de Organização
  const [requestingOrgAccess, setRequestingOrgAccess] = useState(false);
  const [orgAccessRequested, setOrgAccessRequested] = useState(false);

  const handleRequestOrgVaultAccess = async () => {
    if (!selectedOrgId) return;
    setRequestingOrgAccess(true);
    try {
      const res = await requestOrgVaultAccessAction({ organizationId: selectedOrgId });
      if (res.ok) {
        setOrgAccessRequested(true);
      } else {
        setDirError(res.error || 'Erro ao solicitar acesso de escrita no cofre.');
      }
    } finally {
      setRequestingOrgAccess(false);
    }
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>('vault');
  const defaultPersonalLabel = userName ? `Cofre ${userName}` : 'Meus Arquivos';

  const [currentFolder, setCurrentFolder] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('folder');
      if (p) return p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    }
    return '';
  });
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ name: string; path: string }>>(() => {
    const rootName = userName ? `Cofre ${userName}` : 'Meus Arquivos';
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('folder');
      if (p) {
        const clean = p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const parts = clean.split('/');
        const crumbs = [{ name: rootName, path: '' }];
        let cur = '';
        for (const pt of parts) {
          cur = cur ? `${cur}/${pt}` : pt;
          crumbs.push({ name: pt, path: cur });
        }
        return crumbs;
      }
    }
    return [{ name: rootName, path: '' }];
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

  const activeTicket = selectedOrgId
    ? orgVaultTicket?.orgId === selectedOrgId
      ? orgVaultTicket.ticket
      : ''
    : ticket;

  // Índice local dos 4 Pilares
  const [indexedFiles, setIndexedFiles] = useState<UserFileIndexRow[]>(initialIndexedFiles);
  const indexedMap = useMemo(() => {
    const map = new Map<string, UserFileIndexRow>();
    for (const row of indexedFiles) {
      map.set(row.relative_path, row);
    }
    return map;
  }, [indexedFiles]);

  // Fallback para o Modo Fotos (Timeline) estritamente isolado por escopo (+ fotos via atalhos)
  const fallbackTimelineItems = useMemo(() => {
    const list: GalleryTimelineItem[] = [];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.heic', '.mp4', '.mov'];
    const currentScopeOrgId = selectedOrgId || null;

    // Extrai regras de atalho pertencentes ao escopo ativo
    const activeShortcuts = indexedFiles
      .filter((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rowOrgId = (row as any).organization_id || null;
        if (rowOrgId !== currentScopeOrgId) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exif = ((row as any).exif_data || {}) as Record<string, unknown>;
        return row.mime_type === 'inode/directory+shortcut' || Boolean(exif.isShortcut);
      })
      .map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exif = ((row as any).exif_data || {}) as Record<string, unknown>;
        return {
          targetPath: String(exif.shortcutTarget || '')
            .replace(/\\/g, '/')
            .replace(/^\/+|\/+$/g, '')
            .toLowerCase(),
          targetOrgId: exif.targetOrgId ? String(exif.targetOrgId) : null,
          ownerUserId: exif.ownerUserId ? String(exif.ownerUserId) : null,
        };
      })
      .filter((s) => Boolean(s.targetPath));

    for (const row of indexedFiles) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rowOrgId = (row as any).organization_id || null;
      const cleanRel = String(row.relative_path || '')
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .toLowerCase();

      let belongsToActiveScope = rowOrgId === currentScopeOrgId;
      if (!belongsToActiveScope && activeShortcuts.length > 0) {
        belongsToActiveScope = activeShortcuts.some((sc) => {
          if (sc.targetOrgId !== rowOrgId) return false;
          if (sc.ownerUserId && row.user_id && row.user_id !== sc.ownerUserId) return false;
          if (cleanRel === sc.targetPath || cleanRel.startsWith(`${sc.targetPath}/`)) return true;
          if (!sc.targetOrgId && sc.targetPath === 'portfolio' && row.show_in_portfolio) return true;
          return false;
        });
      }
      if (!belongsToActiveScope) continue;

      const isMedia =
        row.mime_type?.startsWith('image/') ||
        row.mime_type?.startsWith('video/') ||
        imageExtensions.some((ext) => row.filename.toLowerCase().endsWith(ext));
      if (!isMedia) continue;
      list.push({
        id: row.id,
        relative_path: row.relative_path,
        filename: row.filename,
        mime_type: row.mime_type || 'image/jpeg',
        size_bytes: row.size_bytes || 0,
        captured_at: (row as any).captured_at || row.created_at || new Date().toISOString(),
        is_favorite: Boolean(row.is_favorite),
        album: row.album || '',
        device_source: (row as any).device_source || null,
        show_in_portfolio: Boolean(row.show_in_portfolio),
        signedThumbUrl: buildTenantThumbUrl(row.relative_path, activeTicket, { serverUrl }),
        signedStreamUrl: buildTenantStreamUrl(row.relative_path, activeTicket, { serverUrl }),
      });
    }

    if (list.length === 0) {
      for (const f of files) {
        const isMedia = imageExtensions.some((ext) => f.name.toLowerCase().endsWith(ext));
        if (!isMedia) continue;
        list.push({
          id: f.relativePath,
          relative_path: f.relativePath,
          filename: f.name,
          mime_type: f.name.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
          size_bytes: f.sizeBytes || 0,
          captured_at: f.modifiedAt || new Date().toISOString(),
          is_favorite: false,
          album: '',
          device_source: null,
          show_in_portfolio: false,
          signedThumbUrl: buildTenantThumbUrl(f.relativePath, activeTicket, { serverUrl }),
          signedStreamUrl: buildTenantStreamUrl(f.relativePath, activeTicket, { serverUrl }),
        });
      }
    }
    return list;
  }, [indexedFiles, files, activeTicket, serverUrl, selectedOrgId]);

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

  // Contexto Global de Uploads Persistentes
  const uploadCtx = useVaultUpload();

  const handleOpenUploadManager = (items?: UploadItem[]) => {
    uploadCtx.openModal(items, currentFolder, selectedOrgId);
  };

  // Redimensionamento do Painel de Inspeção (280px - 650px) e Modo PiP Flutuante
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 360;
    try {
      const saved = localStorage.getItem('aurtistic_vault_preview_panel_width');
      const parsed = saved ? parseInt(saved, 10) : 360;
      return !isNaN(parsed) && parsed >= 280 && parsed <= 650 ? parsed : 360;
    } catch {
      return 360;
    }
  });
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isDetachedPreview, setIsDetachedPreview] = useState(false);

  const handleStartResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingPanel(true);
    document.body.classList.add('select-none');

    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const nextWidth = Math.min(650, Math.max(280, startWidth + delta));
      setPanelWidth(nextWidth);
      try {
        localStorage.setItem('aurtistic_vault_preview_panel_width', String(nextWidth));
      } catch {}
    };

    const handleMouseUp = () => {
      setIsResizingPanel(false);
      document.body.classList.remove('select-none');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [panelWidth]);

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
    (targetFolder: string, overrideRows?: UserFileIndexRow[]) => {
      const cleanTarget = String(targetFolder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const sourceRows = overrideRows || indexedFiles;

      // Verifica se cleanTarget entra em algum atalho indexado no escopo atual
      let effectiveTargetFolder = cleanTarget;
      let effectiveScopeOrgId: string | null = selectedOrgId || null;

      if (cleanTarget) {
        for (const row of sourceRows) {
          const relPath = row.relative_path;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rOrg = (row as any).organization_id || null;
          if ((selectedOrgId || null) !== rOrg) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const exif = ((row as any).exif_data || {}) as Record<string, unknown>;
          const isSc = row.mime_type === 'inode/directory+shortcut' || Boolean(exif.isShortcut);
          if (!isSc) continue;

          const cleanScRel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
          if (
            cleanTarget.toLowerCase() === cleanScRel.toLowerCase() ||
            cleanTarget.toLowerCase().startsWith(`${cleanScRel.toLowerCase()}/`)
          ) {
            const remainder = cleanTarget.slice(cleanScRel.length).replace(/^\/+/, '');
            const baseTarget = String(exif.shortcutTarget || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
            effectiveTargetFolder = [baseTarget, remainder].filter(Boolean).join('/');
            effectiveScopeOrgId = exif.targetOrgId ? String(exif.targetOrgId) : null;
            break;
          }
        }
      }

      const isPort =
        effectiveTargetFolder.toLowerCase() === 'portfolio' ||
        effectiveTargetFolder.toLowerCase().startsWith('portfolio/') ||
        effectiveTargetFolder.toLowerCase() === 'portifolio' ||
        effectiveTargetFolder.toLowerCase().startsWith('portifolio/');

      const targetPrefix = effectiveTargetFolder ? `${effectiveTargetFolder}/` : '';
      const matchingFiles: EdgeVaultEntry[] = [];
      const subfolderNames = new Set<string>();
      const shortcutEntriesMap = new Map<string, EdgeVaultEntry>();

      sourceRows.forEach((row) => {
        const relPath = row.relative_path;
        // Separação estrita de escopo (respeita escopo alvo se dentro de um atalho)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rowOrgId = (row as any).organization_id || null;
        if (effectiveScopeOrgId) {
          if (rowOrgId !== effectiveScopeOrgId) return;
        } else {
          if (rowOrgId) return;
        }

        const cleanRel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exif = ((row as any).exif_data || {}) as Record<string, unknown>;
        const isScRow = row.mime_type === 'inode/directory+shortcut' || Boolean(exif.isShortcut);

        if (!effectiveTargetFolder) {
          // Raiz
          const parts = cleanRel.split('/');
          if (parts.length === 1) {
            if (isScRow || row.is_directory) {
              if (isScRow) {
                shortcutEntriesMap.set(parts[0], {
                  name: row.filename || parts[0],
                  relativePath: cleanTarget ? `${cleanTarget}/${parts[0]}` : parts[0],
                  isDirectory: true,
                  sizeBytes: 0,
                  mimeType: 'inode/directory+shortcut',
                  kind: 'folder',
                  modifiedAt: row.updated_at || new Date().toISOString(),
                  isShortcut: true,
                  shortcutType: exif.targetOrgId ? 'org_folder' : 'personal_folder',
                  shortcutTarget: String(exif.shortcutTarget || ''),
                  shortcutOwner: String(exif.shortcutOwner || 'Membro'),
                  targetOrgId: exif.targetOrgId ? String(exif.targetOrgId) : undefined,
                  targetOrgSlug: exif.targetOrgSlug ? String(exif.targetOrgSlug) : undefined,
                });
              } else {
                subfolderNames.add(parts[0]);
              }
            } else {
              matchingFiles.push({
                name: row.filename || parts[0],
                relativePath: cleanRel,
                isDirectory: false,
                sizeBytes: row.size_bytes || 0,
                mimeType: row.mime_type || 'application/octet-stream',
                kind: (row.mime_type?.startsWith('image/') ? 'image' : 'other') as EdgeVaultEntry['kind'],
                modifiedAt: row.updated_at || new Date().toISOString(),
              });
            }
          } else if (parts.length > 1) {
            subfolderNames.add(parts[0]);
          }
        } else {
          // Subpasta (ex.: Portfolio ou Portfolio/Sub ou dentro de atalho)
          if (cleanRel.toLowerCase().startsWith(targetPrefix.toLowerCase())) {
            const rest = cleanRel.slice(targetPrefix.length);
            const parts = rest.split('/').filter(Boolean);
            if (parts.length === 1) {
              if (isScRow || row.is_directory) {
                if (isScRow) {
                  shortcutEntriesMap.set(parts[0], {
                    name: row.filename || parts[0],
                    relativePath: cleanTarget ? `${cleanTarget}/${parts[0]}` : parts[0],
                    isDirectory: true,
                    sizeBytes: 0,
                    mimeType: 'inode/directory+shortcut',
                    kind: 'folder',
                    modifiedAt: row.updated_at || new Date().toISOString(),
                    isShortcut: true,
                    shortcutType: exif.targetOrgId ? 'org_folder' : 'personal_folder',
                    shortcutTarget: String(exif.shortcutTarget || ''),
                    shortcutOwner: String(exif.shortcutOwner || 'Membro'),
                    targetOrgId: exif.targetOrgId ? String(exif.targetOrgId) : undefined,
                    targetOrgSlug: exif.targetOrgSlug ? String(exif.targetOrgSlug) : undefined,
                  });
                } else {
                  subfolderNames.add(parts[0]);
                }
              } else {
                matchingFiles.push({
                  name: row.filename || parts[0],
                  relativePath: cleanRel,
                  isDirectory: false,
                  sizeBytes: row.size_bytes || 0,
                  mimeType: row.mime_type || 'application/octet-stream',
                  kind: (row.mime_type?.startsWith('image/') ? 'image' : 'other') as EdgeVaultEntry['kind'],
                  modifiedAt: row.updated_at || new Date().toISOString(),
                });
              }
            } else if (parts.length > 1) {
              subfolderNames.add(parts[0]);
            }
          } else if (!effectiveScopeOrgId && isPort && row.show_in_portfolio && !cleanRel.includes('/')) {
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

      // Na raiz PESSOAL (apenas se não houver organização selecionada e fora de atalho org), assegura pasta virtual Portfolio
      if (!cleanTarget && !selectedOrgId) {
        subfolderNames.add('Portfolio');
      }

      const segments = cleanTarget ? cleanTarget.split('/') : [];
      const breadcrumbs = [
        { name: selectedOrg ? selectedOrg.name : defaultPersonalLabel, path: '' },
        ...segments.map((seg, i) => ({
          name: i === 0 && (seg.toLowerCase() === 'portfolio' || seg.toLowerCase() === 'portifolio') ? 'Portfólio' : seg,
          path: segments.slice(0, i + 1).join('/'),
        })),
      ];

      const mergedFolders: EdgeVaultEntry[] = [];
      shortcutEntriesMap.forEach((scEntry) => mergedFolders.push(scEntry));
      Array.from(subfolderNames).forEach((sub) => {
        if (shortcutEntriesMap.has(sub)) return;
        mergedFolders.push({
          name: sub === 'Portfolio' || sub === 'portfolio' ? 'Portfólio' : sub,
          relativePath: cleanTarget ? `${cleanTarget}/${sub}` : sub,
          isDirectory: true,
          sizeBytes: 0,
          mimeType: 'inode/directory',
          kind: 'folder' as const,
          modifiedAt: new Date().toISOString(),
        });
      });

      return {
        currentFolder: cleanTarget,
        breadcrumbs,
        folders: mergedFolders,
        files: matchingFiles,
      };
    },
    [indexedFiles, selectedOrg, selectedOrgId, defaultPersonalLabel]
  );

  const mergeIndexedShortcuts = useCallback(
    (diskFolders: EdgeVaultEntry[], targetFolder: string, scopeOrgId: string | null): EdgeVaultEntry[] => {
      const cleanTarget = String(targetFolder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const existingNames = new Set(diskFolders.map((f) => f.name.toLowerCase()));
      const extraShortcuts: EdgeVaultEntry[] = [];

      for (const row of indexedFiles) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rOrg = (row as any).organization_id || null;
        if ((scopeOrgId || null) !== rOrg) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exif = ((row as any).exif_data || {}) as Record<string, unknown>;
        const isSc = row.mime_type === 'inode/directory+shortcut' || Boolean(exif.isShortcut);
        if (!isSc) continue;

        const cleanRel = String(row.relative_path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (!cleanRel) continue;
        if (scopeOrgId && (cleanRel.toLowerCase() === 'portfolio' || cleanRel.toLowerCase().startsWith('portfolio/'))) {
          continue;
        }
        const slashIdx = cleanRel.lastIndexOf('/');
        const parentDir = slashIdx === -1 ? '' : cleanRel.slice(0, slashIdx);
        if (parentDir.toLowerCase() !== cleanTarget.toLowerCase()) continue;

        const scName = row.filename || (slashIdx === -1 ? cleanRel : cleanRel.slice(slashIdx + 1));
        if (existingNames.has(scName.toLowerCase())) continue;
        existingNames.add(scName.toLowerCase());

        extraShortcuts.push({
          name: scName,
          relativePath: cleanRel,
          isDirectory: true,
          sizeBytes: 0,
          mimeType: 'inode/directory+shortcut',
          kind: 'folder',
          modifiedAt: row.updated_at || row.created_at || new Date().toISOString(),
          isShortcut: true,
          shortcutType: exif.targetOrgId ? 'org_folder' : 'personal_folder',
          shortcutTarget: String(exif.shortcutTarget || ''),
          shortcutOwner: String(exif.shortcutOwner || 'Membro'),
          targetOrgId: exif.targetOrgId ? String(exif.targetOrgId) : undefined,
          targetOrgSlug: exif.targetOrgSlug ? String(exif.targetOrgSlug) : undefined,
        });
      }

      return extraShortcuts.length > 0 ? [...extraShortcuts, ...diskFolders] : diskFolders;
    },
    [indexedFiles]
  );

  const loadDirectory = useCallback(
    async (targetFolder: string, activeTicketToUse = activeTicket, quiet = false) => {
      if (!isApprovedForStorage && profile.storage_role !== 'admin') return;
      if (!activeTicketToUse) return;
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
              name: selectedOrg ? selectedOrg.name : defaultPersonalLabel,
              path: '',
            },
          ]
        );
        setFolders(mergeIndexedShortcuts(res.folders || [], targetFolder, selectedOrgId));
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
        // Fallback Resiliente via Cache Indexado do Supabase (+ busca remota de itens de atalho cross-owner)
        let fallback = resolveFallbackFolderListing(targetFolder);
        const cleanTarget = String(targetFolder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        if (fallback.files.length === 0 && fallback.folders.length === 0 && cleanTarget) {
          const matchedShortcutRow = indexedFiles.find((row) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rOrg = (row as any).organization_id || null;
            if ((selectedOrgId || null) !== rOrg) return false;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const exif = ((row as any).exif_data || {}) as Record<string, unknown>;
            const isSc = row.mime_type === 'inode/directory+shortcut' || Boolean(exif.isShortcut);
            if (!isSc) return false;
            const scRel = String(row.relative_path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
            return cleanTarget.toLowerCase() === scRel || cleanTarget.toLowerCase().startsWith(`${scRel}/`);
          });

          if (matchedShortcutRow) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const exif = ((matchedShortcutRow as any).exif_data || {}) as Record<string, unknown>;
            const scRel = String(matchedShortcutRow.relative_path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
            const remainder = cleanTarget.slice(scRel.length).replace(/^\/+/, '');
            const baseTarget = String(exif.shortcutTarget || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
            const resolvedTargetRel = [baseTarget, remainder].filter(Boolean).join('/');
            try {
              const scRes = await getShortcutTargetFallbackEntriesAction({
                containerOrgId: selectedOrgId || null,
                targetOwnerId: exif.ownerUserId ? String(exif.ownerUserId) : null,
                targetOrgId: exif.targetOrgId ? String(exif.targetOrgId) : null,
                targetRelPath: resolvedTargetRel,
              });
              if (scRes.ok && scRes.entries.length > 0) {
                const existingIds = new Set(indexedFiles.map((r) => r.id));
                const nextMerged = [
                  ...indexedFiles,
                  ...scRes.entries.filter((r) => !existingIds.has(r.id)),
                ];
                setIndexedFiles(nextMerged);
                fallback = resolveFallbackFolderListing(targetFolder, nextMerged);
              }
            } catch {}
          }
        }

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
    [isApprovedForStorage, profile.storage_role, activeTicket, serverUrl, indexedMap, indexedFiles, selectedOrg, selectedOrgId, resolveFallbackFolderListing]
  );

  useEffect(() => {
    if (uploadCtx.lastCompletedUploadTime > 0) {
      if (typeof uploadCtx.lastUploadResults?.newUsedBytes === 'number') {
        setUsedBytes(uploadCtx.lastUploadResults.newUsedBytes);
      }
      if (uploadCtx.lastUploadResults?.successCount) {
        void loadDirectory(currentFolder);
      }
    }
  }, [uploadCtx.lastCompletedUploadTime, uploadCtx.lastUploadResults, currentFolder, loadDirectory]);

  const handleSwitchScope = async (orgId: string | null, force = false) => {
    if (!force && orgId === selectedOrgId && (!orgId || orgVaultTicket?.orgId === orgId)) return;
    setSwitchingScope(true);
    setSelectedOrgId(orgId);
    setOrgVaultTicket(null);
    setFolders([]);
    setFiles([]);
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

    try {
      if (!orgId) {
        setOrgVaultTicket(null);
        setUsedBytes(profile.used_bytes || 0);
        setBreadcrumbs([{ name: userName ? `Cofre ${userName}` : 'Meus Arquivos', path: '' }]);
        await loadDirectory('', ticket);
      } else {
        const org = localOrgs.find((o) => o.id === orgId);
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
          const nextOrgTicket = res.session.vaultTicket.ticket;
          setOrgVaultTicket({ orgId, ticket: nextOrgTicket });
          await loadDirectory('', nextOrgTicket);
        } else {
          setDirError(res.error || 'Falha ao acessar o cofre da organização.');
          setLoadingDir(false);
        }
      }
    } finally {
      setSwitchingScope(false);
    }
  };

  const handleTagFolderDevice = useCallback(
    async (
      folderPath: string,
      deviceCategory: 'camera' | 'mobile' | 'drone' | 'other',
      deviceName: string,
      recursive = true
    ) => {
      const updated = {
        ...folderMetaMap,
        [folderPath]: {
          ...(folderMetaMap[folderPath] || {}),
          deviceCategory,
          deviceName,
        },
      };
      saveFolderMeta(updated);

      try {
        await tagFolderDevicesAction({
          folderPath,
          deviceCategory,
          deviceName,
          recursive,
          organizationId: selectedOrgId || undefined,
        });
        void loadDirectory(currentFolder);
      } catch (err) {
        console.warn('[UserVaultWorkspace] Falha ao marcar dispositivo na pasta:', err);
      }
    },
    [folderMetaMap, saveFolderMeta, selectedOrgId, currentFolder, loadDirectory]
  );

  useEffect(() => {
    if (initialOrgId) {
      void handleSwitchScope(initialOrgId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrgId]);


  useEffect(() => {
    const handleEnsurePreview = () => {
      setIsPreviewOpen(true);
    };
    window.addEventListener('aurtistic:ensure-preview-open', handleEnsurePreview);
    return () => window.removeEventListener('aurtistic:ensure-preview-open', handleEnsurePreview);
  }, []);

  useEffect(() => {
    let ignore = false;
    // Abort auto-reload while switching between personal/org scope to avoid race condition
    if (switchingScope) return;
    if (selectedOrgId && !activeTicket) return;
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
                name: selectedOrg ? selectedOrg.name : defaultPersonalLabel,
                path: '',
              },
            ]
          );
          setFolders(mergeIndexedShortcuts(res.folders || [], currentFolder, selectedOrgId));
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
  }, [activeTicket, serverUrl, setUsedBytes, setDirError]);

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

  const resolveTicketForScope = useCallback(
    async (scopeId: string): Promise<string> => {
      if (scopeId === 'personal') return ticket;
      if (scopeId === selectedOrgId && orgVaultTicket?.orgId === scopeId) return orgVaultTicket.ticket;
      if (scopeTicketCacheRef.current[scopeId]) return scopeTicketCacheRef.current[scopeId];
      try {
        const res = await refreshOrganizationTicketAction({ organizationId: scopeId });
        const issued = res.ok ? res.session?.vaultTicket?.ticket : '';
        if (issued) {
          scopeTicketCacheRef.current[scopeId] = issued;
          return issued;
        }
      } catch {}
      return '';
    },
    [ticket, selectedOrgId, orgVaultTicket]
  );

  const fetchFoldersForScopeAndPath = useCallback(
    async (scopeId: string, folderPath: string): Promise<{ name: string; relativePath: string }[]> => {
      const cleanPath = String(folderPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const prefix = cleanPath ? `${cleanPath}/` : '';
      const folderMap = new Map<string, { name: string; relativePath: string }>();

      // 1. Coleta pastas indexadas no Supabase (inclui subpastas profundas e Portfólio)
      if (scopeId === 'personal' && !cleanPath) {
        folderMap.set('Portfolio', { name: 'Portfólio', relativePath: 'Portfolio' });
      }

      indexedMap.forEach((row, relPath) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rowOrgId = (row as any).organization_id || null;
        if (scopeId === 'personal') {
          if (rowOrgId) return;
        } else {
          if (rowOrgId !== scopeId) return;
        }

        const cleanRel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (!cleanPath) {
          const segs = cleanRel.split('/').filter(Boolean);
          if (segs.length > 1 || (segs.length === 1 && row.is_directory)) {
            const first = segs[0];
            if (!folderMap.has(first)) {
              folderMap.set(first, {
                name: first.toLowerCase() === 'portfolio' ? 'Portfólio' : first,
                relativePath: first,
              });
            }
          }
          if (scopeId === 'personal' && row.show_in_portfolio && row.album && row.album !== 'Geral') {
            // Albums em raiz ficam dentro de Portfolio
          }
        } else if (cleanRel.toLowerCase().startsWith(prefix.toLowerCase())) {
          const rest = cleanRel.slice(prefix.length);
          const segs = rest.split('/').filter(Boolean);
          if (segs.length > 1 || (segs.length === 1 && row.is_directory)) {
            const seg = segs[0];
            const childRel = `${cleanPath}/${seg}`;
            if (!folderMap.has(childRel)) {
              folderMap.set(childRel, { name: seg, relativePath: childRel });
            }
          }
        }

        if (
          scopeId === 'personal' &&
          cleanPath.toLowerCase() === 'portfolio' &&
          row.show_in_portfolio &&
          row.album &&
          row.album !== 'Geral' &&
          row.album !== 'Atalhos'
        ) {
          const albRel = `Portfolio/${row.album}`;
          if (!folderMap.has(albRel)) {
            folderMap.set(albRel, { name: row.album, relativePath: albRel });
          }
        }
      });

      // 2. Consulta Edge Server online para trazer pastas físicas em tempo real
      try {
        const scopeTicket = await resolveTicketForScope(scopeId);
        if (scopeTicket) {
          const res = await fetchTenantDirectory(cleanPath, scopeTicket, { serverUrl });
          for (const f of res.folders || []) {
            if (f.isShortcut) continue;
            const fRel = String(f.relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
            if (!fRel) continue;
            folderMap.set(fRel, {
              name: f.name || fRel.split('/').pop() || fRel,
              relativePath: fRel,
            });
          }
        }
      } catch {
        // Fallback resiliente mantendo o que veio de indexedMap
      }

      return Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    },
    [indexedMap, resolveTicketForScope, serverUrl]
  );

  const loadShortcutBrowserLevel = useCallback(
    async (scopeId: string, folderPath: string) => {
      setLoadingPersonalFolders(true);
      setShortcutBrowserPath(folderPath);
      try {
        const items = await fetchFoldersForScopeAndPath(scopeId, folderPath);
        setShortcutBrowserFolders(items);
        setShortcutTreeChildren((prev) => ({ ...prev, [folderPath]: items }));
      } catch (err: unknown) {
        setShortcutError(err instanceof Error ? err.message : 'Falha ao buscar pastas.');
      } finally {
        setLoadingPersonalFolders(false);
      }
    },
    [fetchFoldersForScopeAndPath]
  );

  const activeModalBrowseScope = shortcutAllowTargetPick
    ? shortcutTargetScope === 'current'
      ? selectedOrgId || 'personal'
      : shortcutTargetScope
    : shortcutSourceScope;

  const handleToggleShortcutTreeNode = async (nodeRelPath: string) => {
    const isExpanded = expandedShortcutTreePaths.includes(nodeRelPath);
    if (isExpanded) {
      setExpandedShortcutTreePaths((prev) => prev.filter((p) => p !== nodeRelPath));
      return;
    }
    setExpandedShortcutTreePaths((prev) => [...prev, nodeRelPath]);
    if (!(nodeRelPath in shortcutTreeChildren)) {
      setLoadingTreePath(nodeRelPath);
      try {
        const children = await fetchFoldersForScopeAndPath(activeModalBrowseScope, nodeRelPath);
        setShortcutTreeChildren((prev) => ({ ...prev, [nodeRelPath]: children }));
      } finally {
        setLoadingTreePath(null);
      }
    }
  };

  const handleSwitchShortcutSourceScope = (newScope: string) => {
    setShortcutSourceScope(newScope);
    setShortcutTreeChildren({});
    setExpandedShortcutTreePaths([]);
    setSelectedPersonalFolder('');
    void loadShortcutBrowserLevel(newScope, '');
  };

  const handleSwitchShortcutTargetScope = (newDestScope: string) => {
    setShortcutTargetScope(newDestScope);
    setShortcutTargetFolder('');
    setShortcutTreeChildren({});
    setExpandedShortcutTreePaths([]);
    void loadShortcutBrowserLevel(newDestScope, '');
  };

  const handleOpenCreateShortcutModal = async (opts?: {
    preselectedSourcePath?: string;
    preselectedSourceName?: string;
  }) => {
    setIsShortcutModalOpen(true);
    setShortcutError(null);
    setShortcutTreeChildren({});
    setExpandedShortcutTreePaths([]);
    setShortcutTargetFolder('');

    const currentScope = selectedOrgId || 'personal';
    if (opts?.preselectedSourcePath) {
      // Modo B: aberto pelo menu de contexto ("Criar Atalho...") — origem fixa, escolhe destino
      const cleanSrc = opts.preselectedSourcePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const baseLabel = opts.preselectedSourceName || cleanSrc.split('/').pop() || 'Pasta';
      const defaultDest =
        currentScope === 'personal' ? localOrgs[0]?.id || 'personal' : 'personal';

      setShortcutAllowTargetPick(true);
      setShortcutSourceScope(currentScope);
      setShortcutTargetScope(defaultDest);
      setSelectedPersonalFolder(cleanSrc);
      setShortcutDisplayName(`Atalho - ${baseLabel}`);

      await loadShortcutBrowserLevel(defaultDest, '');
    } else {
      // Modo A: aberto via "+ Novo Atalho" — destino é a pasta aberta, escolhe origem
      const defaultSource =
        currentScope === 'personal' ? localOrgs[0]?.id || 'personal' : 'personal';
      setShortcutAllowTargetPick(false);
      setShortcutTargetScope('current');
      setShortcutSourceScope(defaultSource);
      setSelectedPersonalFolder('');
      setShortcutDisplayName('');
      await loadShortcutBrowserLevel(defaultSource, '');
    }
  };

  const handleConfirmCreateShortcut = async () => {
    if (!selectedPersonalFolder) {
      setShortcutError('Selecione uma pasta de origem para criar o atalho.');
      return;
    }
    const baseSrcName = selectedPersonalFolder.split('/').pop() || 'Pasta';
    const cleanName = shortcutDisplayName.trim() || `Atalho - ${baseSrcName}`;
    setShortcutError(null);

    const resolvedTargetScope =
      shortcutTargetScope === 'current' ? selectedOrgId || 'personal' : shortcutTargetScope;
    const targetParentFolder = shortcutAllowTargetPick
      ? shortcutTargetFolder
      : resolvedTargetScope === (selectedOrgId || 'personal')
        ? currentFolder
        : '';

    // Proteção contra loop circular (mesma pasta ou ancestral/descendente direto no mesmo cofre)
    if (resolvedTargetScope === shortcutSourceScope) {
      const normSrc = selectedPersonalFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
      const normDst = targetParentFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
      if (normSrc && (normDst === normSrc || normDst.startsWith(`${normSrc}/`))) {
        setShortcutError(
          'Referência circular bloqueada: não é possível criar um atalho dentro da própria pasta de origem ou de suas subpastas.'
        );
        return;
      }
    }

    setIsCreatingShortcut(true);

    const srcOrg =
      shortcutSourceScope !== 'personal'
        ? localOrgs.find((o) => o.id === shortcutSourceScope)
        : null;

    try {
      const containerTicket = await resolveTicketForScope(resolvedTargetScope);
      if (containerTicket) {
        try {
          await createTenantFolderShortcutDirect({
            parentFolder: targetParentFolder,
            shortcutName: cleanName,
            personalFolderRelPath: selectedPersonalFolder,
            targetOrgSlug: srcOrg?.slug,
            targetOrgId: srcOrg?.id,
            ownerName: userName || 'Membro',
            ticket: containerTicket,
            serverUrl,
          });
        } catch {
          // Segue com persistência garantida em Supabase
        }
      }

      const syncRes = await syncShortcutInSupabaseAction({
        organizationId: resolvedTargetScope === 'personal' ? null : resolvedTargetScope,
        parentFolder: targetParentFolder,
        shortcutName: cleanName,
        targetRelPath: selectedPersonalFolder,
        targetOrgId: srcOrg?.id || null,
        targetOrgSlug: srcOrg?.slug || null,
        ownerName: userName || 'Membro',
      });

      const createdRelPath =
        syncRes.relativePath ||
        (targetParentFolder ? `${targetParentFolder}/${cleanName}` : cleanName);

      // Atualiza estado local indexado para resposta imediata mesmo offline
      const syntheticRow = {
        id: `sc-${Date.now()}`,
        user_id: profile.user_id,
        organization_id: resolvedTargetScope === 'personal' ? null : resolvedTargetScope,
        relative_path: createdRelPath,
        filename: cleanName,
        mime_type: 'inode/directory+shortcut',
        size_bytes: 0,
        is_directory: true,
        has_pin: false,
        visibility: 'private',
        show_in_portfolio: false,
        show_in_curriculum: false,
        album: 'Atalhos',
        category: 'Atalho',
        tags: [],
        is_favorite: false,
        linked_task_ids: [],
        exif_data: {
          isShortcut: true,
          shortcutType: srcOrg ? 'org_folder' : 'personal_folder',
          shortcutTarget: selectedPersonalFolder,
          shortcutOwner: userName || 'Membro',
          ownerUserId: profile.user_id,
          targetOrgId: srcOrg?.id || null,
          targetOrgSlug: srcOrg?.slug || null,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as UserFileIndexRow;

      setIndexedFiles((prev) => [
        ...prev.filter(
          (r) =>
            !(
              r.relative_path === createdRelPath &&
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((r as any).organization_id || null) ===
                (resolvedTargetScope === 'personal' ? null : resolvedTargetScope)
            )
        ),
        syntheticRow,
      ]);

      setIsShortcutModalOpen(false);
      if (resolvedTargetScope === (selectedOrgId || 'personal')) {
        await loadDirectory(currentFolder, activeTicket, true);
      }
    } catch (err: unknown) {
      setShortcutError(err instanceof Error ? err.message : 'Erro ao criar atalho.');
    } finally {
      setIsCreatingShortcut(false);
    }
  };

  const handleDeleteShortcut = async (folderPath: string, shortcutFile?: string) => {
    try {
      await removeShortcutFromSupabaseAction({
        organizationId: selectedOrgId || null,
        shortcutPath: folderPath,
      });
      setIndexedFiles((prev) =>
        prev.filter(
          (r) =>
            !(
              r.relative_path === folderPath &&
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((r as any).organization_id || null) === (selectedOrgId || null)
            )
        )
      );
      try {
        await deleteTenantFolderShortcutDirect({
          shortcutPath: shortcutFile || folderPath,
          ticket: activeTicket,
          serverUrl,
        });
      } catch {}
      await loadDirectory(currentFolder, activeTicket, true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao remover atalho.');
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
    if (entry.isShortcut) {
      setActionDialog({
        isOpen: true,
        mode: 'danger',
        icon: 'link_off',
        title: 'Remover Atalho?',
        description: `Deseja remover apenas o atalho "${entry.name}"? A pasta original e todos os arquivos originais permanecerão intactos.`,
        confirmLabel: 'Remover Atalho',
        onConfirm: () => {
          setActionDialog((prev) => ({ ...prev, isOpen: false }));
          void executeDeleteEntry(entry);
        },
      });
      return;
    }
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
    if (entry.isShortcut) {
      const explicitFile =
        (entry as any).shortcutFileRelativePath ||
        (entry as any).shortcutFileName ||
        entry.relativePath;
      await handleDeleteShortcut(entry.relativePath, explicitFile);
      return;
    }
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
  }, [
    selectedPaths,
    folders,
    files,
    selectedEntry,
    activeTicket,
    serverUrl,
    selectedOrgId,
    currentFolder,
    loadDirectory,
    setFolders,
    setFiles,
    setUsedBytes,
    setDirError,
  ]);

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
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        (target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable ||
            target.closest('input, textarea, select, [contenteditable="true"]'))) ||
        (activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.isContentEditable))
      ) {
        return;
      }

      // Atalhos de Layout Alt+1..4, Alt+B e Alt+P (Frente 2.2, 5.2, 6.4)
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') {
          e.preventDefault();
          handleSetLayoutMode('grid');
          return;
        } else if (e.key === '2') {
          e.preventDefault();
          handleSetLayoutMode('list');
          return;
        } else if (e.key === '3') {
          e.preventDefault();
          handleSetLayoutMode('ide');
          return;
        } else if (e.key === '4') {
          e.preventDefault();
          handleSetLayoutMode('timeline');
          return;
        } else if (e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          handleTogglePreview();
          return;
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          handleTogglePreview();
          return;
        }
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

  const vaultRouter = useRouter();
  const swipeHandlers = useSwipeTabs({
    enabled: !isEffectiveInline,
    onNext: () =>
      vaultRouter.push(selectedOrg ? `/labdiv?org=${encodeURIComponent(selectedOrg.slug)}` : '/labdiv'),
  });

  const vaultContent = (
    <div
      {...swipeHandlers}
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
      className={`relative z-10 min-h-full flex flex-col p-4 md:p-8 ${selectedOrg ? 'bg-transparent' : 'bg-app'} space-y-6 pb-28 text-fg`}
    >
      {/* Faixa 1: Switch Macro [ Cofre | Organizações | Studio ] acima de tudo */}
      {!isEffectiveInline && (
        <div className="flex justify-center shrink-0">
          <div className="inline-flex items-center p-1 bg-surface rounded-2xl border border-border-subtle shadow-md gap-1">
            <span className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black bg-[#FFCC00] text-[#121212] shadow-sm">
              <span className="material-symbols-outlined text-[16px]">folder_special</span>
              <span>Cofre</span>
            </span>
            <Link
              href={selectedOrg ? `/labdiv?org=${encodeURIComponent(selectedOrg.slug)}` : '/labdiv'}
              prefetch={true}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold text-fg-secondary hover:text-fg transition-colors"
              title="Alternar para Organizações & Bastidores"
            >
              <span className="material-symbols-outlined text-[16px]">domain</span>
              <span>Organizações</span>
            </Link>
            <Link
              href={selectedOrg ? `/labdiv?org=${encodeURIComponent(selectedOrg.slug)}&view=studio` : '/labdiv?view=studio'}
              prefetch={true}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold text-fg-secondary hover:text-fg transition-colors"
              title="Abrir HUB Studio (Criador Visual)"
            >
              <span className="material-symbols-outlined text-[16px]">palette</span>
              <span>Studio</span>
            </Link>
          </div>
        </div>
      )}

      {/* Faixa 2: Seção só com a Logo e o Switch de Conta (Pessoal / Organização) */}
      <div className="relative shrink-0 flex flex-wrap items-center justify-between gap-4 bg-surface border border-border-subtle rounded-2xl p-4 shadow-lg z-20">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 overflow-hidden p-1.5 shadow-inner">
            {!selectedOrg ? (
              userAvatarUrl ? (
                <img
                  src={userAvatarUrl}
                  alt={userName || 'Perfil Pessoal'}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <span className="material-symbols-outlined text-[24px] text-[var(--accent-secondary)]">person</span>
              )
            ) : selectedOrg.slug === 'labdiv' || selectedOrg.name?.toLowerCase().includes('labdiv') ? (
              <img src="/labdiv-logo.png" alt="LabDiv" className="w-full h-full object-contain" />
            ) : selectedOrg.slug === 'show-da-fisica' ? (
              <div className="w-full h-full flex flex-col items-center justify-center font-black text-center leading-none">
                <span className="text-[9px] text-[#ff1e1e]">SHOW</span>
                <span className="text-[8px] text-[#0066ff]">FÍSICA</span>
              </div>
            ) : selectedOrg.slug === 'hs' ? (
              <img src="/hs-logo.png" alt="Hackerspace" className="w-full h-full object-cover rounded-xl" />
            ) : (
              <span className="text-lg font-black text-[var(--accent-primary)]">
                {selectedOrg.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <OrganizationMaterialSelector
            organizations={localOrgs}
            selectedOrgId={selectedOrgId}
            onSelectOrg={(id) => handleSwitchScope(id)}
            allowPersonal={true}
            personalLabel={userName ? `Perfil ${userName}` : 'Pessoal'}
            personalAvatarUrl={userAvatarUrl}
            hideTriggerLogo={true}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setBoostTargetScope(selectedOrgId ? 'org' : 'personal');
            setIsBoostModalOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-xl border border-accent-primary/40 bg-accent-primary/10 px-3.5 py-2 text-xs font-bold text-accent-primary hover:bg-accent-primary/20 transition-colors cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">bolt</span>
          <span>Pedir Boost</span>
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
            <span>{selectedOrg ? `Cofre ${selectedOrg.name}` : (userName ? `Cofre ${userName}` : 'Meu Espaço')}</span>
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
                    ? 'bg-accent-primary text-on-accent-primary'
                    : 'bg-surface text-accent-primary hover:bg-accent-primary/20 border border-accent-primary/40'
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
                    ? 'bg-accent-primary text-on-accent-primary'
                    : 'bg-surface text-accent-primary hover:bg-accent-primary/20 border border-accent-primary/40'
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
          {/* Banner de Acesso Read-Only no Cofre de Organização se não aprovado */}
          {selectedOrg && !selectedOrg.can_upload_vault && profile.storage_role !== 'admin' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-500 text-[24px] shrink-0">
                  visibility
                </span>
                <div>
                  <p className="font-bold text-fg">
                    Acesso de Leitura no Cofre {selectedOrg.name}
                  </p>
                  <p className="text-fg-muted">
                    Você pode visualizar e baixar os arquivos compartilhados. Para enviar ou excluir arquivos, é necessária a aprovação de um administrador da organização.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={requestingOrgAccess || orgAccessRequested}
                onClick={() => void handleRequestOrgVaultAccess()}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/40 text-black font-bold flex items-center gap-1.5 transition-all shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {orgAccessRequested ? 'check' : 'key'}
                </span>
                <span>
                  {orgAccessRequested
                    ? 'Acesso Solicitado'
                    : requestingOrgAccess
                      ? 'Solicitando...'
                      : 'Solicitar Acesso de Envio'}
                </span>
              </button>
            </div>
          )}

          {/* Barra de Ferramentas e Caminho do Arquivo */}
          <div className="relative z-30 bg-surface border border-border-subtle rounded-2xl p-3.5 sm:p-4 space-y-3">
            {/* Linha 1: Controles de Exibição e Ações Principais */}
            <div className="flex flex-wrap items-center justify-between gap-3" data-tour="vault-actions">
              {/* Seletor de Layout (Grade / Lista / IDE / Fotos) + Toggle do Painel de Inspeção (Frente 2.2 e 5.2) */}
              <div className="flex items-center gap-1 bg-app p-1 rounded-xl border border-border-subtle" data-tour="vault-layout-switcher">
                <button
                  type="button"
                  onClick={() => handleSetLayoutMode('grid')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    layoutMode === 'grid'
                      ? 'bg-[var(--accent-primary)] text-white font-bold shadow-sm'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                  }`}
                  title="Grade de Miniaturas (Alt+1)"
                >
                  <span className="material-symbols-outlined text-[16px]">grid_view</span>
                  <span className="hidden sm:inline">Grade</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetLayoutMode('list')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    layoutMode === 'list'
                      ? 'bg-[var(--accent-primary)] text-white font-bold shadow-sm'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                  }`}
                  title="Lista Detalhada (Alt+2)"
                >
                  <span className="material-symbols-outlined text-[16px]">view_list</span>
                  <span className="hidden sm:inline">Lista</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetLayoutMode('ide')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    layoutMode === 'ide'
                      ? 'bg-[var(--accent-primary)] text-white font-bold shadow-sm ring-1 ring-[#FFCC00]/50'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                  }`}
                  title="Visualização IDE com Árvore Lateral e Abas (Alt+3)"
                >
                  <span className="material-symbols-outlined text-[16px]">terminal</span>
                  <span className="font-bold">IDE</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetLayoutMode('timeline')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    layoutMode === 'timeline'
                      ? 'bg-[var(--accent-primary)] text-white font-bold shadow-sm'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                  }`}
                  title="Fotos e Mídia em Linha do Tempo (Alt+4)"
                >
                  <span className="material-symbols-outlined text-[16px]">photo_library</span>
                  <span className="hidden sm:inline">Fotos</span>
                </button>

                <div className="w-[1px] h-4 bg-border-subtle mx-0.5" />

                <button
                  type="button"
                  onClick={handleTogglePreview}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isPreviewOpen
                      ? 'bg-[var(--accent-primary)] text-white font-bold shadow-sm'
                      : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                  }`}
                  title={isPreviewOpen ? 'Ocultar Painel Lateral (Alt+P / Alt+B)' : 'Abrir Painel Lateral (Alt+P / Alt+B)'}
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
                      className="px-3 py-2 rounded-xl bg-accent-primary/15 hover:bg-accent-primary/25 text-accent-primary border border-accent-primary/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
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

                {/* Botão Recarregar adjacente ao botão [+ Novo] */}
                <button
                  type="button"
                  onClick={() => void loadDirectory(currentFolder, activeTicket)}
                  disabled={loadingDir}
                  className="px-3 py-2 rounded-xl bg-app hover:bg-surface-hover text-fg-secondary hover:text-fg border border-border-subtle text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Recarregar Arquivos e Pastas"
                >
                  <span className={`material-symbols-outlined text-[18px] ${loadingDir ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                  <span className="hidden sm:inline">Recarregar</span>
                </button>

                {/* Botão Gerenciador de Uploads (Fora do menu + Novo, acompanha a fila em tempo real) */}
                <button
                  type="button"
                  onClick={() => handleOpenUploadManager([])}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                    uploadCtx.isUploading
                      ? 'bg-[var(--accent-primary)]/20 border-[var(--accent-primary)] text-[var(--accent-primary)]'
                      : uploadCtx.queue.length > 0
                        ? 'bg-surface border-border-subtle text-fg hover:border-[var(--accent-primary)]'
                        : 'bg-app hover:bg-surface-hover text-fg-secondary hover:text-fg border border-border-subtle'
                  }`}
                  title="Gerenciador de Uploads e Acompanhamento da Fila"
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      uploadCtx.isUploading ? 'animate-spin text-[var(--accent-primary)]' : ''
                    }`}
                  >
                    {uploadCtx.isUploading ? 'sync' : 'cloud_upload'}
                  </span>
                  <span className="hidden md:inline">Uploads</span>
                  {uploadCtx.queue.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--accent-primary)] text-white">
                      {uploadCtx.completedFiles}/{uploadCtx.totalFiles}
                    </span>
                  )}
                </button>

                {/* Botão Único [+] com Menu Suspenso de Ações */}
                <div className="relative" ref={addMenuRef}>
                  <button
                    type="button"
                    disabled={uploading || (Boolean(selectedOrg) && !selectedOrg?.can_upload_vault && profile.storage_role !== 'admin')}
                    onClick={() => setIsAddMenuOpen((prev) => !prev)}
                    className="px-3.5 py-2 rounded-xl bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
                    title={
                      selectedOrg && !selectedOrg?.can_upload_vault && profile.storage_role !== 'admin'
                        ? 'Cofre em modo apenas leitura. Solicite aprovação para enviar arquivos.'
                        : 'Adicionar ou Criar (+)'
                    }
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
                        <div className="w-8 h-8 rounded-lg bg-accent-primary/15 flex items-center justify-center text-accent-primary group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">note_add</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-fg group-hover:text-accent-primary transition-colors">
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
                        <div className="w-8 h-8 rounded-lg bg-accent-primary/15 flex items-center justify-center text-accent-primary group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">edit_note</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-fg group-hover:text-accent-primary transition-colors">
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

                      {/* 6. Atalho para Pasta (Bidirecional: Cofre da Organização <-> Cofre Pessoal) */}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={uploading}
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          void handleOpenCreateShortcutModal();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-fg hover:bg-surface-hover flex items-center gap-2.5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[18px]">add_link</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-amber-300 group-hover:text-amber-200 transition-colors">
                            {selectedOrgId ? 'Atalho para Pasta Pessoal' : 'Criar Atalho de Pasta'}
                          </p>
                          <p className="text-[10px] text-fg-muted truncate">
                            {selectedOrgId
                              ? 'Vincular pasta do espaço pessoal ou de outra org'
                              : 'Vincular pasta de organização ou pasta pessoal'}
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
            <div className="p-3 rounded-xl bg-accent-primary/15 border border-accent-primary/40 text-xs text-accent-primary font-bold flex items-center gap-2">
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
                ticket={activeTicket}
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

              {/* Conteúdo: Timeline Google Fotos, IDE ou Pastas */}
              {layoutMode === 'timeline' ? (
                <GooglePhotosTimelineView
                  organizationId={selectedOrgId}
                  fallbackItems={fallbackTimelineItems}
                  hideScopeSelector={true}
                />
              ) : layoutMode === 'ide' ? (
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
                        const customColor = folder.isShortcut ? '#f59e0b' : meta?.color;
                        const customIcon = folder.isShortcut
                          ? 'folder_shared'
                          : meta?.icon || (
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
                                <div className="text-[11px] text-fg-muted flex items-center gap-1.5 flex-wrap">
                                  {folder.isShortcut ? (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-bold">
                                      <span className="material-symbols-outlined text-[12px]">link</span>
                                      {folder.shortcutType === 'org_folder' ? 'Atalho Org' : 'Atalho Pessoal'} {folder.shortcutTarget ? `(${folder.shortcutTarget})` : ''}
                                    </span>
                                  ) : folder.hasPin ? (
                                    'Protegida por PIN'
                                  ) : (
                                    'Pasta'
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Ações Rápidas (Favorito, PIN, 3 Pontinhos) */}
                            <div
                              className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {folder.isShortcut && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteShortcut(folderPath)}
                                  title="Remover Atalho Pessoal do Cofre"
                                  className="p-1.5 rounded-lg text-amber-400 hover:text-red-400 hover:bg-surface-hover transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[17px]">link_off</span>
                                </button>
                              )}
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
                          className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover text-fg border border-border-subtle text-xs font-bold transition-all flex items-center gap-2 shadow-sm hover:border-accent-primary"
                          title="Criar uma nova nota Markdown rápida"
                        >
                          <span className="material-symbols-outlined text-[18px] text-accent-primary">
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

            {/* Divisor Arrastável de Redimensionamento */}
            {isPreviewOpen && !isDetachedPreview && (
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={handleStartResize}
                className="w-1.5 hover:w-2 bg-transparent hover:bg-[var(--accent-primary)]/50 active:bg-[var(--accent-primary)] cursor-col-resize transition-all shrink-0 z-30 flex items-center justify-center group select-none"
                title="Arraste para redimensionar o painel de inspeção"
              >
                <div className="w-0.5 h-8 bg-border-subtle group-hover:bg-white rounded-full transition-colors" />
              </div>
            )}

            {/* Painel Lateral de Inspeção & Metadados (Alt+P) */}
            <VaultPreviewPanel
              entry={selectedEntry}
              isOpen={isPreviewOpen}
              onClose={() => setIsPreviewOpen(false)}
              ticket={ticket}
              serverUrl={serverUrl}
              indexedRow={selectedEntry ? indexedMap.get(selectedEntry.relativePath) : undefined}
              availableTasks={userTasks}
              panelWidth={panelWidth}
              isDetached={isDetachedPreview}
              onToggleDetach={() => setIsDetachedPreview((prev) => !prev)}
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
                            : 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
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
                <span className="material-symbols-outlined text-accent-primary text-[22px]">bolt</span>
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
                  className="w-full rounded-lg border border-border-subtle bg-app p-2.5 text-xs text-fg placeholder-slate-600 focus:border-accent-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Espaço Adicional</label>
                  <select
                    value={boostGb}
                    onChange={(e) => setBoostGb(Number(e.target.value))}
                    className="w-full rounded-lg border border-border-subtle bg-app p-2.5 text-xs text-fg focus:border-accent-primary focus:outline-none"
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
                    className="w-full rounded-lg border border-border-subtle bg-app p-2.5 text-xs text-fg focus:border-accent-primary focus:outline-none"
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
                  className="rounded-lg bg-accent-primary px-4 py-1.5 font-bold text-on-accent-primary hover:bg-accent-primary-hover disabled:opacity-50 transition-colors"
                >
                  {isSubmittingBoost ? 'Ativando...' : 'Ativar Boost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          onShareWithClient={(targetPath, name) => {
            setShareFolder(targetPath);
            setShareTitle(name || targetPath.split('/').pop() || 'Álbum');
            setShareModalOpen(true);
          }}
          onCreateShortcut={(folderPath, folderName) => {
            void handleOpenCreateShortcutModal({
              preselectedSourcePath: folderPath,
              preselectedSourceName: folderName,
            });
          }}
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

      {/* Modal de Criação de Atalho Bidirecional com Switch Navegador / Árvore */}
      {isShortcutModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !isCreatingShortcut && setIsShortcutModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-surface border border-border-subtle rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <div className="flex items-center gap-2 text-amber-400">
                <span className="material-symbols-outlined text-[22px]">add_link</span>
                <h3 className="text-sm font-bold text-fg">
                  {shortcutAllowTargetPick
                    ? 'Enviar Atalho de Pasta'
                    : selectedOrgId
                      ? 'Atalho para Pasta Pessoal / Org'
                      : 'Criar Atalho no Cofre Pessoal'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsShortcutModalOpen(false)}
                disabled={isCreatingShortcut}
                className="p-1 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-xs text-fg-muted">
              Navegue pelas pastas para vincular um diretório sem duplicar arquivos no armazenamento.
            </p>

            {shortcutError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{shortcutError}</span>
              </div>
            )}

            {/* Seletor de Destino (Modo B: aberto via Menu de Contexto "Criar Atalho...") */}
            {shortcutAllowTargetPick ? (
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-amber-400 shrink-0">folder_zip</span>
                    <span className="font-bold text-amber-300 truncate">
                      Origem fixa: {selectedOrg ? selectedOrg.name : 'Espaço Pessoal'} / {selectedPersonalFolder}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                    Cofre de Destino do Atalho:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSwitchShortcutTargetScope('personal')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        shortcutTargetScope === 'personal'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-app border-border-subtle text-fg-muted hover:text-fg'
                      }`}
                    >
                      Meu Cofre Pessoal
                    </button>
                    {localOrgs.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => handleSwitchShortcutTargetScope(org.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          shortcutTargetScope === org.id
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : 'bg-app border-border-subtle text-fg-muted hover:text-fg'
                        }`}
                      >
                        {org.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Seletor de Espaço de Origem (Modo A: aberto via "+ Novo Atalho") */
              <div className="space-y-2.5">
                <div className="px-2.5 py-1.5 rounded-xl bg-surface border border-border-subtle text-[11px] text-fg-muted flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-amber-400">save</span>
                  <span>
                    Será salvo em:{' '}
                    <strong className="text-fg">
                      {selectedOrg ? selectedOrg.name : 'Meu Cofre Pessoal'}
                      {currentFolder ? ` / ${currentFolder}` : ' (Raiz)'}
                    </strong>
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                    Espaço de Origem:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSwitchShortcutSourceScope('personal')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        shortcutSourceScope === 'personal'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-app border-border-subtle text-fg-muted hover:text-fg'
                      }`}
                    >
                      Espaço Pessoal
                    </button>
                    {localOrgs.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => handleSwitchShortcutSourceScope(org.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          shortcutSourceScope === org.id
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : 'bg-app border-border-subtle text-fg-muted hover:text-fg'
                        }`}
                      >
                        {org.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Header da Seleção de Pasta + Switch (Opção A: Navegador vs Opção B: Árvore) */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                  {shortcutAllowTargetPick
                    ? 'Subpasta de Destino (opcional):'
                    : 'Pasta de Origem Selecionada:'}
                </label>

                <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-app border border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setShortcutViewMode('breadcrumbs')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                      shortcutViewMode === 'breadcrumbs'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">folder_open</span>
                    <span>Navegador</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShortcutViewMode('tree')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                      shortcutViewMode === 'tree'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">account_tree</span>
                    <span>Árvore</span>
                  </button>
                </div>
              </div>

              {shortcutViewMode === 'breadcrumbs' ? (
                <div className="space-y-2">
                  {/* Barra de Breadcrumbs + Subir Nível */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-app border border-border-subtle text-xs">
                    <div className="flex items-center gap-1 flex-wrap min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (shortcutAllowTargetPick) setShortcutTargetFolder('');
                          void loadShortcutBrowserLevel(activeModalBrowseScope, '');
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-hover text-amber-300 font-bold cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">home</span>
                        <span>Raiz</span>
                      </button>
                      {shortcutBrowserPath
                        .split('/')
                        .filter(Boolean)
                        .map((seg, idx, arr) => {
                          const segPath = arr.slice(0, idx + 1).join('/');
                          return (
                            <React.Fragment key={segPath}>
                              <span className="text-fg-muted">/</span>
                              <button
                                type="button"
                                onClick={() =>
                                  void loadShortcutBrowserLevel(activeModalBrowseScope, segPath)
                                }
                                className="px-1.5 py-0.5 rounded hover:bg-surface-hover text-fg font-medium truncate max-w-[120px] cursor-pointer"
                              >
                                {seg}
                              </button>
                            </React.Fragment>
                          );
                        })}
                    </div>

                    {shortcutBrowserPath && (
                      <button
                        type="button"
                        onClick={() => {
                          const parent = shortcutBrowserPath.split('/').slice(0, -1).join('/');
                          void loadShortcutBrowserLevel(activeModalBrowseScope, parent);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface hover:bg-surface-hover border border-border-subtle text-[11px] font-bold text-fg-muted hover:text-fg cursor-pointer shrink-0"
                        title="Voltar para a pasta pai"
                      >
                        <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                        <span>..</span>
                      </button>
                    )}
                  </div>

                  {/* Ação rápida: selecionar Raiz no Modo B ou pasta aberta no Modo A/B */}
                  {shortcutAllowTargetPick && !shortcutBrowserPath && (
                    <button
                      type="button"
                      onClick={() => setShortcutTargetFolder('')}
                      className={`w-full px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-between cursor-pointer transition-colors ${
                        shortcutTargetFolder === ''
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-surface hover:bg-surface-hover border-border-subtle text-fg'
                      }`}
                    >
                      <span className="truncate">Salvar na Raiz do Cofre de Destino</span>
                      <span className="material-symbols-outlined text-[15px] text-amber-400">
                        {shortcutTargetFolder === '' ? 'check_circle' : 'add_circle'}
                      </span>
                    </button>
                  )}

                  {shortcutBrowserPath && (
                    <button
                      type="button"
                      onClick={() => {
                        if (shortcutAllowTargetPick) {
                          setShortcutTargetFolder(shortcutBrowserPath);
                        } else {
                          const base = shortcutBrowserPath.split('/').pop() || shortcutBrowserPath;
                          setSelectedPersonalFolder(shortcutBrowserPath);
                          if (!shortcutDisplayName || shortcutDisplayName.startsWith('Atalho - ')) {
                            setShortcutDisplayName(`Atalho - ${base}`);
                          }
                        }
                      }}
                      className={`w-full px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-between cursor-pointer transition-colors ${
                        (shortcutAllowTargetPick ? shortcutTargetFolder : selectedPersonalFolder) ===
                        shortcutBrowserPath
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-surface hover:bg-surface-hover border-border-subtle text-fg'
                      }`}
                    >
                      <span className="truncate">Usar pasta aberta: {shortcutBrowserPath}</span>
                      <span className="material-symbols-outlined text-[15px] text-amber-400">
                        {(shortcutAllowTargetPick ? shortcutTargetFolder : selectedPersonalFolder) ===
                        shortcutBrowserPath
                          ? 'check_circle'
                          : 'add_circle'}
                      </span>
                    </button>
                  )}

                  {loadingPersonalFolders ? (
                    <div className="py-6 text-center text-xs text-fg-muted flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-[20px] text-amber-400">
                        sync
                      </span>
                      Carregando pastas...
                    </div>
                  ) : shortcutBrowserFolders.length === 0 ? (
                    <div className="p-3 rounded-xl bg-app border border-border-subtle text-xs text-fg-muted text-center">
                      Nenhuma subpasta neste diretório.
                    </div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto space-y-1 p-1 bg-app border border-border-subtle rounded-xl">
                      {shortcutBrowserFolders.map((folderItem) => {
                        const activeSelectedPath = shortcutAllowTargetPick
                          ? shortcutTargetFolder
                          : selectedPersonalFolder;
                        const isSelected = activeSelectedPath === folderItem.relativePath;
                        return (
                          <div
                            key={folderItem.relativePath}
                            className={`flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 transition-colors ${
                              isSelected
                                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                                : 'hover:bg-surface-hover text-fg border border-transparent'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (shortcutAllowTargetPick) {
                                  setShortcutTargetFolder(folderItem.relativePath);
                                } else {
                                  setSelectedPersonalFolder(folderItem.relativePath);
                                  if (
                                    !shortcutDisplayName ||
                                    shortcutDisplayName.startsWith('Atalho - ')
                                  ) {
                                    setShortcutDisplayName(`Atalho - ${folderItem.name}`);
                                  }
                                }
                              }}
                              onDoubleClick={() =>
                                void loadShortcutBrowserLevel(
                                  activeModalBrowseScope,
                                  folderItem.relativePath
                                )
                              }
                              className="flex-1 text-left text-xs flex items-center gap-2 min-w-0 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px] text-amber-400 shrink-0">
                                folder
                              </span>
                              <span className="truncate">{folderItem.name}</span>
                              {isSelected && (
                                <span className="material-symbols-outlined text-[15px] text-amber-400 shrink-0">
                                  check
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void loadShortcutBrowserLevel(
                                  activeModalBrowseScope,
                                  folderItem.relativePath
                                )
                              }
                              className="px-2 py-1 rounded-md bg-surface/80 hover:bg-surface border border-border-subtle text-[10px] font-bold text-fg-muted hover:text-fg flex items-center gap-0.5 cursor-pointer shrink-0"
                              title="Abrir subpastas"
                            >
                              <span>Abrir</span>
                              <span className="material-symbols-outlined text-[13px]">
                                chevron_right
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Modo Opção B: Árvore Hierárquica Expansível */
                <div className="max-h-56 overflow-y-auto p-1.5 bg-app border border-border-subtle rounded-xl space-y-0.5">
                  {loadingPersonalFolders && !( '' in shortcutTreeChildren) ? (
                    <div className="py-6 text-center text-xs text-fg-muted flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-[20px] text-amber-400">
                        sync
                      </span>
                      Carregando árvore de pastas...
                    </div>
                  ) : (
                    (() => {
                      const renderTreeNodes = (parentPath: string, depth: number): React.ReactNode => {
                        if (depth > 10) return null;
                        const nodes = shortcutTreeChildren[parentPath] || [];
                        if (nodes.length === 0) {
                          if (parentPath === '') {
                            return (
                              <div className="p-3 text-center text-xs text-fg-muted">
                                Nenhuma pasta encontrada neste espaço.
                              </div>
                            );
                          }
                          return (
                            <div
                              style={{ paddingLeft: `${depth * 14 + 24}px` }}
                              className="py-1 text-[10px] text-fg-muted italic"
                            >
                              (Sem subpastas)
                            </div>
                          );
                        }
                        return nodes.map((node) => {
                          const isExpanded = expandedShortcutTreePaths.includes(node.relativePath);
                          const activeSelectedPath = shortcutAllowTargetPick
                            ? shortcutTargetFolder
                            : selectedPersonalFolder;
                          const isSelected = activeSelectedPath === node.relativePath;
                          const isLoadingNode = loadingTreePath === node.relativePath;
                          return (
                            <div key={node.relativePath}>
                              <div
                                style={{ paddingLeft: `${depth * 14 + 4}px` }}
                                className={`flex items-center gap-1 py-1 pr-2 rounded-lg text-xs transition-colors ${
                                  isSelected
                                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                                    : 'hover:bg-surface-hover text-fg border border-transparent'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => void handleToggleShortcutTreeNode(node.relativePath)}
                                  className="p-0.5 rounded hover:bg-white/10 text-fg-muted hover:text-fg cursor-pointer shrink-0"
                                  title={isExpanded ? 'Recolher subpastas' : 'Expandir subpastas'}
                                >
                                  <span className="material-symbols-outlined text-[15px]">
                                    {isLoadingNode
                                      ? 'sync'
                                      : isExpanded
                                        ? 'expand_more'
                                        : 'chevron_right'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (shortcutAllowTargetPick) {
                                      setShortcutTargetFolder(node.relativePath);
                                    } else {
                                      setSelectedPersonalFolder(node.relativePath);
                                      if (
                                        !shortcutDisplayName ||
                                        shortcutDisplayName.startsWith('Atalho - ')
                                      ) {
                                        setShortcutDisplayName(`Atalho - ${node.name}`);
                                      }
                                    }
                                  }}
                                  className="flex-1 text-left flex items-center gap-1.5 min-w-0 cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[15px] text-amber-400 shrink-0">
                                    {isExpanded ? 'folder_open' : 'folder'}
                                  </span>
                                  <span className="truncate">{node.name}</span>
                                </button>
                                {isSelected && (
                                  <span className="material-symbols-outlined text-[15px] text-amber-400 shrink-0">
                                    check
                                  </span>
                                )}
                              </div>
                              {isExpanded && renderTreeNodes(node.relativePath, depth + 1)}
                            </div>
                          );
                        });
                      };
                      return (
                        <>
                          {shortcutAllowTargetPick && (
                            <button
                              type="button"
                              onClick={() => setShortcutTargetFolder('')}
                              className={`w-full mb-1 px-2 py-1 rounded-lg text-left text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                                shortcutTargetFolder === ''
                                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                                  : 'hover:bg-surface-hover text-fg-muted border border-transparent'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[14px] text-amber-400">home</span>
                              <span>Raiz do Cofre de Destino</span>
                            </button>
                          )}
                          {renderTreeNodes('', 0)}
                        </>
                      );
                    })()
                  )}
                </div>
              )}

              {(shortcutAllowTargetPick ? shortcutTargetFolder || '(Raiz)' : selectedPersonalFolder) && (
                <p className="text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1 truncate">
                  {shortcutAllowTargetPick
                    ? `Destino escolhido: ${shortcutTargetFolder || 'Raiz do cofre de destino'}`
                    : `Selecionado: ${selectedPersonalFolder}`}
                </p>
              )}
            </div>

            {/* Nome do Atalho */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                Nome do Atalho:
              </label>
              <input
                type="text"
                value={shortcutDisplayName}
                onChange={(e) => setShortcutDisplayName(e.target.value)}
                placeholder="Ex: Fotos - Show de Física"
                className="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setIsShortcutModalOpen(false)}
                disabled={isCreatingShortcut}
                className="px-3 py-1.5 rounded-xl border border-border-subtle hover:bg-surface-hover text-xs font-medium text-fg-muted hover:text-fg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateShortcut}
                disabled={isCreatingShortcut || !selectedPersonalFolder}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isCreatingShortcut && (
                  <span className="material-symbols-outlined animate-spin text-[14px]">sync</span>
                )}
                <span>Criar Atalho</span>
              </button>
            </div>
          </div>
        </div>
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

  return selectedOrg ? (
    <OrganizationBrandProvider orgSlug={selectedOrg.slug}>
      {vaultContent}
    </OrganizationBrandProvider>
  ) : (
    vaultContent
  );
}

