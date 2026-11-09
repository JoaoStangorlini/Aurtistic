// Este programa é um software livre (Licença AGPLv3)
export default function Footer() {
  return (
    <footer className="w-full bg-cosmic-surface border-t border-cosmic-surface-hover px-6 py-8 mt-auto flex flex-col items-center justify-center gap-4">
      <div className="flex gap-4">
        <a 
          href="https://calendar.app.google/tELr1q8ky4G98EL58" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-cosmic-accent text-cosmic-bg font-bold py-2 px-6 rounded hover:opacity-90 transition-opacity"
        >
          Agendar Reunião
        </a>
      </div>
      <p className="text-sm text-cosmic-text/70">
        © {new Date().getFullYear()} João Stangorlini. Licenciado sob AGPLv3.
      </p>
    </footer>
  );
}
