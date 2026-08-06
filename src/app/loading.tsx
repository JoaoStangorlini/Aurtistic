import Image from 'next/image';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[9999] bg-[#121212] flex flex-col items-center justify-center p-4 overflow-hidden select-none">
      {/* Wrapper Centralizado */}
      <div className="relative flex items-center justify-center w-48 h-48 md:w-56 md:h-56">
        
        {/* Anel Externo Giratório com Efeito Neon Gradient */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FFCC00] border-r-[#9D4EDD] animate-spin [animation-duration:1.5s] shadow-[0_0_25px_rgba(255,204,0,0.3)]"></div>
        
        {/* Anel Secundário Pulsante Contrarrotativo */}
        <div className="absolute inset-2 rounded-full border border-transparent border-b-[#9D4EDD] border-l-[#FFCC00] animate-spin [animation-duration:2.5s] [animation-direction:reverse] opacity-70"></div>
        
        {/* Brilho Radial Central */}
        <div className="absolute w-32 h-32 bg-gradient-to-tr from-[#9D4EDD]/20 to-[#FFCC00]/20 rounded-full blur-2xl animate-pulse"></div>

        {/* Logo do Cérebro Aurtistic Centralizado */}
        <div className="relative z-10 w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden flex items-center justify-center bg-[#121212] drop-shadow-[0_0_15px_rgba(157,78,221,0.5)]">
          <Image
            src="/aurtistic_app_icon_v12_black.png"
            alt="Aurtistic Loading"
            width={128}
            height={128}
            className="w-full h-full object-contain mix-blend-screen"
            priority
          />
        </div>
      </div>

      {/* Texto de Carregamento */}
      <div className="mt-8 flex flex-col items-center gap-2">
        <h2 className="text-xl md:text-2xl font-black text-white tracking-wider uppercase font-['Bukra'] flex items-center gap-1">
          Aurtistic
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#FFCC00] animate-ping"></span>
          <span className="text-xs font-semibold text-[#A0A0A0] tracking-widest uppercase">Carregando espaço...</span>
        </div>
      </div>
    </div>
  );
}
