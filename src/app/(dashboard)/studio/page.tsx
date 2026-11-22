// Este programa é um software livre (Licença AGPLv3)
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** O Studio é único: o modo pessoal vive na aba Gestão, selecionável no menu de ambientes. */
export default function PersonalStudioPage() {
  redirect('/labdiv?view=studio&scope=personal');
}
