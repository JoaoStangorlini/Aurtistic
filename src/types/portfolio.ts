// Este programa é um software livre (Licença AGPLv3)

import type { ExifMetadata, ItemVisibility, UserFileIndexRow } from './storage';

export interface PortfolioMediaArtwork {
  id: string;
  userId: string;
  relativePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  title: string;
  description: string;
  album: string;
  category: string;
  tags: string[];
  exifData: ExifMetadata;
  isFavorite: boolean;
  visibility: ItemVisibility;
  displayOrder: number;
  hidden?: boolean;
  signedThumbUrl: string;
  signedStreamUrl: string;
  itemTicket?: string;
}

export interface CurriculumVerifiedDocument {
  id: string;
  relativePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  curriculumLabel: string;
  title: string | null;
  description: string | null;
  visibility: ItemVisibility;
  signedThumbUrl: string;
  signedStreamUrl: string;
}

export interface PressClippingItem {
  id: string;
  title: string;                  // Ex: "Destaque no Jornal da USP — Show da Física"
  newspaperName: string;          // Ex: "Jornal da USP" / "Folha de S.Paulo"
  publicationDate: string;        // YYYY-MM-DD
  editionOrSection?: string;      // Ex: "Caderno Ciência & Educação, pág. A12"
  contextDescription: string;     // Contexto da fotografia e da reportagem
  physicalPagePhotoUrl: string;   // relative_path no servidor Edge ou URL externa da foto do jornal físico
  originalPhotoUrl?: string;      // relative_path no servidor Edge ou URL externa da foto original autoral
  signedPhysicalPageUrl?: string; // Preenchido no SSR por signPressClippingsMediaUrls
  signedOriginalPhotoUrl?: string;// Preenchido no SSR por signPressClippingsMediaUrls
  originalFileId?: string | null; // Vínculo opcional com user_files_index.id
  externalArticleUrl?: string;    // Link opcional da matéria online
  featured?: boolean;
  hidden?: boolean;
  displayOrder: number;
}

export interface InstagramMentionEmbed {
  id: string;
  postUrl: string;                // Ex: "https://www.instagram.com/p/Cxyz12345/"
  postType: 'p' | 'reel' | 'tv';  // Extraído de forma sanitizada
  shortcode: string;              // Extraído via regex estrita: "Cxyz12345"
  accountHandle: string;          // Ex: "@showdafisica.ifusp"
  accountName?: string;           // Ex: "Show da Física IFUSP"
  photoCreditNote: string;        // Ex: "Fotografia autoral por João Paulo Stangorlini"
  eventOrContext?: string;        // Ex: "Sessão Especial — Instituto de Física da USP"
  originalFileId?: string | null; // Vínculo opcional com a foto original no acervo
  publishedAt?: string;           // YYYY-MM-DD
  includeCaption?: boolean;       // default: true (/embed/captioned/)
  hidden?: boolean;
  displayOrder: number;
}

export type PortfolioSectionId = 'photos' | 'press' | 'instagram' | 'projects';

export interface PortfolioSectionConfig {
  id: PortfolioSectionId;
  title: string;
  subtitle?: string;
  enabled: boolean;
  order: number;
}

export interface PublicCreatorResolvedProfile {
  userId: string;
  publicSlug: string;
  userProfile: Record<string, unknown> | null;
  portfolioArtworks?: Array<UserFileIndexRow & { signedThumbUrl: string; signedStreamUrl: string }>;
  verifiedDocuments?: Array<UserFileIndexRow & { signedThumbUrl: string; signedStreamUrl: string }>;
}

