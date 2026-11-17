// Este programa é um software livre (Licença AGPLv3)
import type { StudioTemplate } from './types';
import type { OrgBrandTokens } from '../../../lib/org-brand-tokens';

export function getOrgStudioTemplates(orgSlug: string, tokens: OrgBrandTokens): StudioTemplate[] {
  const defaultFilters = { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0 };

  return [
    {
      id: `${orgSlug}-tpl-news`,
      title: 'Comunicado Oficial com Selo',
      category: 'modelo',
      orgSlug,
      aspectRatio: '1:1',
      previewUrl: '',
      badgeTag: tokens.badgeTag,
      slides: [
        {
          id: 'slide-tpl-1',
          title: 'Comunicado',
          aspectRatio: '1:1',
          backgroundColor: tokens.bgApp || '#07090e',
          globalFilters: defaultFilters,
          showBrandBadge: true,
          brandBadgeText: tokens.badgeTag,
          layers: [
            {
              id: 'text-tpl-title',
              type: 'text',
              name: 'Título',
              text: `[r:${tokens.badgeTag}] [b:OFICIAL]`,
              fontFamily: tokens.fontDisplay,
              fontSize: 56,
              color: tokens.textPrimary || '#ffffff',
              align: 'center',
              bold: true,
              italic: false,
              lineHeight: 1.2,
              letterSpacing: 0,
              visible: true,
              locked: false,
              opacity: 1,
              x: 0.1,
              y: 0.15,
              width: 0.8,
              height: 0.2,
              rotation: 0,
            },
          ],
        },
      ],
    },
    {
      id: `${orgSlug}-tpl-event`,
      title: 'Divulgação de Evento / Agenda',
      category: 'modelo',
      orgSlug,
      aspectRatio: '4:5',
      previewUrl: '',
      badgeTag: tokens.badgeTag,
      slides: [
        {
          id: 'slide-tpl-2',
          title: 'Agenda',
          aspectRatio: '4:5',
          backgroundColor: tokens.bgApp || '#07090e',
          globalFilters: defaultFilters,
          showBrandBadge: true,
          brandBadgeText: tokens.badgeTag,
          layers: [
            {
              id: 'text-tpl-agenda',
              type: 'text',
              name: 'Título Agenda',
              text: '*PRÓXIMA APRESENTAÇÃO*\n{DATA} às {HORA}\n{LOCAL}',
              fontFamily: tokens.fontDisplay,
              fontSize: 48,
              color: tokens.textPrimary || '#ffffff',
              align: 'center',
              bold: true,
              italic: false,
              lineHeight: 1.3,
              letterSpacing: 0,
              visible: true,
              locked: false,
              opacity: 1,
              x: 0.1,
              y: 0.2,
              width: 0.8,
              height: 0.3,
              rotation: 0,
            },
          ],
        },
      ],
    },
  ];
}
