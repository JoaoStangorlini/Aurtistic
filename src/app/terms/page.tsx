// Este programa é um software livre (Licença AGPLv3)
import { LegalDocumentView } from '@/components/legal/LegalDocumentView';

export default function TermsOfUsePage() {
  return <LegalDocumentView doc="terms" backHref="/" backLabel="Voltar para o Dashboard" />;
}
