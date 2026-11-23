// Este programa é um software livre (Licença AGPLv3)
import { LegalDocumentView } from '@/components/legal/LegalDocumentView';

export default function PrivacyPolicyPage() {
  return <LegalDocumentView doc="privacy" backHref="/" backLabel="Voltar para o Dashboard" />;
}
