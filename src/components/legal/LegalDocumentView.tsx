// Este programa é um software livre (Licença AGPLv3)
import Link from 'next/link';
import {
  LEGAL_CONTROLLER,
  LEGAL_DOCS_VERSION,
  LEGAL_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  TERMS_OF_USE_SECTIONS,
  type LegalSection,
} from '@/lib/legal-documents';

export interface LegalDocumentViewProps {
  doc: 'privacy' | 'terms';
  mode?: 'page' | 'compact';
  backHref?: string;
  backLabel?: string;
}

function getAccentClasses(accent: LegalSection['accent']): string {
  if (accent === 'danger') return 'text-[#db4437]';
  if (accent === 'warning') return 'text-[#FFCC00]';
  return 'text-[var(--accent-primary)]';
}

export function LegalDocumentView({
  doc,
  mode = 'page',
  backHref = '/',
  backLabel = 'Voltar para o Aurtistic',
}: LegalDocumentViewProps) {
  const isPrivacy = doc === 'privacy';
  const title = isPrivacy ? 'Política de Privacidade' : 'Termos de Uso';
  const sections = isPrivacy ? PRIVACY_POLICY_SECTIONS : TERMS_OF_USE_SECTIONS;

  if (mode === 'compact') {
    return (
      <div className="space-y-5 text-xs leading-relaxed text-fg-secondary">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border-subtle">
          <div>
            <h3 className="text-base font-black text-fg">{title}</h3>
            <p className="text-[11px] text-fg-muted">
              Versão {LEGAL_DOCS_VERSION} • Atualizado em {LEGAL_LAST_UPDATED} • Controlador: {LEGAL_CONTROLLER.name}
            </p>
          </div>
          <Link
            href={isPrivacy ? '/privacy-policy' : '/terms'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1"
          >
            <span>Abrir página completa</span>
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          </Link>
        </div>

        {sections.map((section) => (
          <section key={section.id} className="space-y-1.5">
            <h4 className="text-xs font-bold text-fg flex items-center gap-1.5">
              <span className={`material-symbols-outlined text-[16px] ${getAccentClasses(section.accent)}`}>
                {section.icon}
              </span>
              <span>{section.title}</span>
            </h4>
            {section.paragraphs.map((p, idx) => (
              <p key={idx} className="text-fg-secondary">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col p-4 md:p-8 bg-app text-fg-secondary">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <Link
              href={backHref}
              className="text-fg-muted hover:text-[#FFCC00] text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>{backLabel}</span>
            </Link>

            <Link
              href={isPrivacy ? '/terms' : '/privacy-policy'}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-border-subtle bg-surface hover:border-[var(--accent-primary)] text-fg transition-colors"
            >
              {isPrivacy ? 'Ler Termos de Uso →' : 'Ler Política de Privacidade →'}
            </Link>
          </div>

          <h1 className="text-3xl font-black text-[#FFCC00] mb-2 font-['Bukra']">{title}</h1>
          <p className="text-fg-muted text-sm">
            Versão {LEGAL_DOCS_VERSION} • Última atualização: {LEGAL_LAST_UPDATED} • Responsável:{' '}
            {LEGAL_CONTROLLER.name} ({LEGAL_CONTROLLER.email})
          </p>
        </div>

        <div className="space-y-8 bg-surface p-6 md:p-10 rounded-2xl border border-border-subtle shadow-xl">
          {sections.map((section) => (
            <section key={section.id}>
              <h2
                className={`text-xl font-bold mb-3 flex items-center gap-2 ${
                  section.accent === 'danger' ? 'text-[#db4437]' : 'text-fg'
                }`}
              >
                <span className={`material-symbols-outlined ${getAccentClasses(section.accent)}`}>
                  {section.icon}
                </span>
                <span>{section.title}</span>
              </h2>
              <div className="space-y-3">
                {section.paragraphs.map((paragraph, idx) => (
                  <p key={idx} className="leading-relaxed text-fg-secondary">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
