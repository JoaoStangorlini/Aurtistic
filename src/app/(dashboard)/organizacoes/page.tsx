// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/(dashboard)/organizacoes/page.tsx
import { redirect } from 'next/navigation';

export default async function OrganizacoesPage({
  searchParams,
}: {
  searchParams?: Promise<{ org?: string }>;
}) {
  const params = await searchParams;
  const query = params?.org ? `?org=${encodeURIComponent(params.org)}` : '';
  redirect(`/labdiv${query}`);
}

