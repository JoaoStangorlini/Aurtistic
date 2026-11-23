// Este programa é um software livre (Licença AGPLv3)
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GithubReleaseResponse {
  tag_name?: string;
  name?: string;
  published_at?: string;
  html_url?: string;
  assets?: GithubReleaseAsset[];
}

export interface DesktopReleasePayload {
  available: boolean;
  version: string;
  publishedAt: string | null;
  releasePageUrl: string;
  aptInstallCommand: string;
  assets: {
    windowsExe: { url: string; filename: string; sizeBytes: number } | null;
    linuxDeb: { url: string; filename: string; sizeBytes: number } | null;
    linuxAppImage: { url: string; filename: string; sizeBytes: number } | null;
    macDmg: { url: string; filename: string; sizeBytes: number } | null;
  };
}

const DEFAULT_GITHUB_REPO = 'JoaoStangorlini/Aurtistic';

function pickAsset(
  assets: GithubReleaseAsset[],
  matcher: (name: string) => boolean
): { url: string; filename: string; sizeBytes: number } | null {
  const found = assets.find((a) => matcher(a.name.toLowerCase()));
  if (!found) return null;
  return {
    url: found.browser_download_url,
    filename: found.name,
    sizeBytes: Number(found.size) || 0,
  };
}

export async function GET() {
  const repo = String(process.env.GITHUB_RELEASES_REPO || DEFAULT_GITHUB_REPO).trim();
  // Nota: GITHUB_RELEASE_TOKEN autentica a consulta à API do GitHub caso o repo seja privado,
  // porém downloads diretos via browser_download_url e GitHub Pages APT exigem repositório público
  // (ou repositório público dedicado exclusivamente às releases/APT).
  const token = String(process.env.GITHUB_RELEASE_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  const releasePageUrl = `https://github.com/${repo}/releases/latest`;
  const owner = repo.split('/')[0] || 'JoaoStangorlini';
  const aptRepoUrl = `https://${owner.toLowerCase()}.github.io/${(repo.split('/')[1] || 'Aurtistic').toLowerCase()}/apt`;
  const aptInstallCommand = `curl -fsSL ${aptRepoUrl}/KEY.gpg | sudo gpg --dearmor -o /usr/share/keyrings/aurtistic.gpg && echo "deb [signed-by=/usr/share/keyrings/aurtistic.gpg] ${aptRepoUrl} ./" | sudo tee /etc/apt/sources.list.d/aurtistic.list && sudo apt update && sudo apt install -y aurtistic`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Aurtistic-Web-Release-Client/1.0',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const cacheHeaders = {
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
  };

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4500),
    });

    if (!resp.ok) {
      const fallback: DesktopReleasePayload = {
        available: false,
        version: 'v1.0.0',
        publishedAt: null,
        releasePageUrl,
        aptInstallCommand,
        assets: {
          windowsExe: null,
          linuxDeb: null,
          linuxAppImage: null,
          macDmg: null,
        },
      };
      return NextResponse.json(fallback, { status: 200, headers: cacheHeaders });
    }

    const release = (await resp.json()) as GithubReleaseResponse;
    const assets = Array.isArray(release.assets) ? release.assets : [];

    const payload: DesktopReleasePayload = {
      available: assets.length > 0,
      version: release.tag_name || release.name || 'v1.0.0',
      publishedAt: release.published_at || null,
      releasePageUrl: release.html_url || releasePageUrl,
      aptInstallCommand,
      assets: {
        windowsExe: pickAsset(assets, (n) => n.endsWith('.exe')),
        linuxDeb: pickAsset(assets, (n) => n.endsWith('.deb')),
        linuxAppImage: pickAsset(assets, (n) => n.endsWith('.appimage')),
        macDmg: pickAsset(assets, (n) => n.endsWith('.dmg')),
      },
    };
    return NextResponse.json(payload, { status: 200, headers: cacheHeaders });
  } catch {
    return NextResponse.json(
      {
        available: false,
        version: 'v1.0.0',
        publishedAt: null,
        releasePageUrl,
        aptInstallCommand,
        assets: {
          windowsExe: null,
          linuxDeb: null,
          linuxAppImage: null,
          macDmg: null,
        },
      } satisfies DesktopReleasePayload,
      { status: 200, headers: cacheHeaders }
    );
  }
}
