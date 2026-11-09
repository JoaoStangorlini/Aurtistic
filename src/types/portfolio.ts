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

export interface PublicCreatorResolvedProfile {
  userId: string;
  publicSlug: string;
  userProfile: Record<string, unknown> | null;
  portfolioArtworks?: Array<UserFileIndexRow & { signedThumbUrl: string; signedStreamUrl: string }>;
  verifiedDocuments?: Array<UserFileIndexRow & { signedThumbUrl: string; signedStreamUrl: string }>;
}

