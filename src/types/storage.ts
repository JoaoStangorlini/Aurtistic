// Este programa é um software livre (Licença AGPLv3)

export type StorageRole = 'member' | 'admin';
export type StorageApprovalStatus = 'pending' | 'approved' | 'suspended';
export type TicketPurpose = 'vault' | 'public_media' | 'share';
export type ShareMode = 'view' | 'proofing' | 'upload_only';
export type ItemVisibility = 'public' | 'private' | 'unlisted';

export interface StorageGlobalSettings {
  id: number;
  default_quota_bytes: number;
  require_admin_approval: boolean;
  updated_by?: string | null;
  updated_at?: string;
}

export interface UserStoragePreferences {
  defaultView: 'grid' | 'list';
  reducedMotion: boolean;
}

export interface UserStorageProfile {
  user_id: string;
  root_folder_slug: string;
  public_slug: string | null;
  storage_role: StorageRole;
  approval_status: StorageApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  quota_limit_bytes: number;
  temp_quota_bytes: number | null;
  temp_quota_expires_at: string | null;
  temp_quota_reason: string | null;
  used_bytes: number;
  pinned_folders: string[];
  preferences: UserStoragePreferences;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EdgeTenantTicketPayload {
  userId: string;
  role: StorageRole;
  purpose: TicketPurpose;
  quotaLimitBytes: number;
  usedBytes: number;
  scopeType?: 'user' | 'org';
  organizationId?: string;
  orgSlug?: string;
  allowedPrefix?: string;
  allowedPaths?: string[];
  readOnly?: boolean;
  allowDownload?: boolean;
  unlockedPins?: string[];
  iat: number;
  exp: number;
}

export interface SignedEdgeTicket {
  ticket: string;
  expiresAt: number;
  serverUrl: string;
  userId: string;
  role: StorageRole;
  purpose: TicketPurpose;
  quotaLimitBytes: number;
  usedBytes: number;
}

export interface ExifMetadata {
  make?: string;
  model?: string;
  camera?: string;
  lens?: string;
  focal?: string;
  focalLength?: string;
  aperture?: string;
  fNumber?: string;
  shutter?: string;
  shutterSpeed?: string;
  exposureTime?: string;
  iso?: string;
  width?: number;
  height?: number;
  orientation?: number;
  dateTaken?: string;
  dateTimeOriginal?: string;
  [key: string]: unknown;
}

export interface EdgeVaultEntry {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  sizeBytes: number;
  mimeType: string;
  kind: 'folder' | 'image' | 'video' | 'audio' | 'note' | 'pdf' | 'archive' | 'other';
  modifiedAt: string;
  hasPin?: boolean;
  isUnlocked?: boolean;
  exifData?: ExifMetadata;
  streamUrl?: string;
  downloadUrl?: string;
  thumbUrl?: string | null;
}

export interface EdgeMutationResponse {
  success: boolean;
  action: 'upsert' | 'delete' | 'rename' | 'move';
  item: EdgeVaultEntry;
  old_relative_path?: string;
  total_used_bytes?: number;
}

export interface EdgeTrashItem {
  trashId: string;
  name: string;
  originalRelativePath: string;
  isDirectory: boolean;
  sizeBytes: number;
  mimeType: string;
  deletedAt: string;
}

export interface EdgeTelemetrySnapshot {
  status: string;
  uptime: number;
  device: string;
  version: string;
  hdConnected: boolean;
  cpuLoadPercent?: number;
  ramUsedMb?: number;
  ramTotalMb?: number;
  tempCelsius?: number | null;
  diskTotalBytes?: number;
  diskUsedBytes?: number;
  diskFreeBytes?: number;
  storageDir?: string;
}

export interface UserFileIndexRow {
  id: string;
  user_id: string;
  relative_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  is_directory: boolean;
  has_pin: boolean;
  linked_task_id: string | null;
  linked_task_ids: string[];
  show_in_portfolio: boolean;
  show_in_curriculum: boolean;
  curriculum_label: string | null;
  title: string | null;
  description: string | null;
  album: string;
  category: string;
  tags: string[];
  exif_data: ExifMetadata;
  is_favorite: boolean;
  visibility: ItemVisibility;
  display_order: number;
  created_at: string;
  updated_at: string;
  signedThumbUrl?: string;
  signedStreamUrl?: string;
  itemTicket?: string;
}

export interface ShareLinkRow {
  id: string;
  user_id: string;
  token: string;
  folder_path: string;
  album_title: string;
  mode: ShareMode;
  pin_hash: string | null;
  allow_download: boolean;
  expires_at: string | null;
  client_name: string | null;
  client_feedback: string | null;
  selected_file_paths: string[];
  auto_create_task: boolean;
  created_task_id: string | null;
  is_submitted: boolean;
  submitted_at: string | null;
  created_at: string;
}

export interface AdminStorageUserSummary {
  user_id: string;
  email: string;
  username: string | null;
  storage_role: StorageRole;
  approval_status: StorageApprovalStatus;
  approved_at: string | null;
  quota_limit_bytes: number;
  temp_quota_bytes: number | null;
  temp_quota_expires_at: string | null;
  temp_quota_reason: string | null;
  used_bytes: number;
  last_sync_at: string | null;
  created_at: string;
}

