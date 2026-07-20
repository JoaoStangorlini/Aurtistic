// Este programa é um software livre (Licença AGPLv3)
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-full flex flex-col p-4 md:p-8 bg-[#121212] text-[#E0E0E0]">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-8">
          <Link href="/" className="text-[#8E8E8E] hover:text-[#FFCC00] text-sm font-bold flex items-center gap-2 mb-4 transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Voltar para o Dashboard
          </Link>
          <h1 className="text-3xl font-black text-[#FFCC00] mb-2 font-['Bukra']">Política de Privacidade</h1>
          <p className="text-[#8E8E8E]">Última atualização: Julho de 2026</p>
        </div>

        <div className="space-y-8 bg-[#1A1A1A] p-6 md:p-10 rounded-2xl border border-[#2D2D2D] shadow-xl">
          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#9D4EDD]">shield</span>
              Seus Dados, Seu Controle
            </h2>
            <p className="leading-relaxed mb-4 text-[#A0A0A0]">
              O Aurtistic foi construído com a premissa fundamental de que os seus dados pertencem exclusivamente a você. Nosso objetivo é fornecer uma ferramenta de organização eficiente, segura e livre de distrações, sem a coleta desnecessária de informações pessoais.
            </p>
            <p className="leading-relaxed text-[#A0A0A0]">
              As contas criadas no Aurtistic utilizam identificadores locais gerados no momento do cadastro. Não solicitamos dados de contato reais, documentos, ou informações de rastreamento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#9D4EDD]">storage</span>
              Armazenamento das Tarefas
            </h2>
            <p className="leading-relaxed text-[#A0A0A0]">
              As suas tarefas e links rápidos são armazenadas na nossa infraestrutura em nuvem (via Supabase) garantindo o sincronismo caso você utilize múltiplos dispositivos. Estes dados são privados, criptografados em repouso e protegidos por regras rígidas de segurança (Row Level Security), de forma que apenas o seu usuário autenticado tem acesso ao seu próprio conteúdo. Ninguém mais.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#9D4EDD]">download</span>
              Exportação e Portabilidade
            </h2>
            <p className="leading-relaxed text-[#A0A0A0]">
              A qualquer momento você tem a liberdade de baixar todas as suas tarefas do Aurtistic. Para isso, acesse o menu <strong>Configurações da Conta &gt; Baixar tarefas (CSV)</strong>. Com esse arquivo, você pode levar seus dados para o Excel, Google Sheets, Notion ou qualquer outro aplicativo da sua preferência.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#db4437] mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#db4437]">delete_forever</span>
              Exclusão da Conta
            </h2>
            <p className="leading-relaxed mb-4 text-[#A0A0A0]">
              Nós não mantemos os seus dados como reféns. Se você decidir deixar de usar o Aurtistic, você pode apagar a sua conta permanentemente através do botão <strong>"Excluir perfil e tarefas"</strong> no menu de configurações.
            </p>
            <p className="leading-relaxed text-[#A0A0A0]">
              <strong>Aviso Importante:</strong> Esta ação é imediata, irreversível e destrutiva. Ao confirmar a exclusão, todos os seus dados e o seu perfil são fisicamente deletados do banco de dados na mesma hora, sem backups retidos para recuperação. Recomendamos exportar as tarefas antes de tomar essa decisão.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
