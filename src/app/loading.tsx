// Este programa é um software livre (Licença AGPLv3)
import { ThemedAurtisticLogo } from '@/components/theme/ThemedAurtisticLogo';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[9999] bg-app text-fg flex flex-col items-center justify-center p-6 overflow-hidden select-none transition-colors duration-200">
      {/* Halo de luz sutil no fundo perfeitamente alinhado à paleta */}
      <div className="absolute w-80 h-80 rounded-full bg-[var(--accent-primary)]/10 blur-3xl pointer-events-none -translate-y-4" />

      {/* Logotipo Oficial Idêntico à Navbar com Efeito Respirável Suave */}
      <div className="relative z-10 flex flex-col items-center animate-pulse duration-1000">
        <ThemedAurtisticLogo size="xl" showTagline={true} />
      </div>

      {/* Barra de Progresso Elegante e Sutil */}
      <div className="relative z-10 mt-8 flex flex-col items-center gap-3">
        <div className="w-48 sm:w-56 h-1 bg-surface-hover/60 border border-border-subtle rounded-full overflow-hidden relative shadow-inner">
          <div className="h-full w-2/5 bg-gradient-brand rounded-full animate-indeterminate" />
        </div>
        <span className="text-[11px] font-medium text-fg-muted tracking-wider">
          Carregando espaço...
        </span>
      </div>
    </div>
  );
}
