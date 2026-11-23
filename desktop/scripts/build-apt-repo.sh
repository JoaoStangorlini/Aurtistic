#!/usr/bin/env bash
# Gera um repositório APT plano (compatível com signed-by=/usr/share/keyrings/aurtistic.gpg)
set -euo pipefail

DEB_INPUT="${1:-}"
OUT_DIR="${2:-apt-repo}"

if [ -z "$DEB_INPUT" ]; then
  echo "Uso: $0 <caminho-do-deb-ou-pasta> [diretorio-saida]" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

if [ -d "$DEB_INPUT" ]; then
  find "$DEB_INPUT" -maxdepth 2 -type f -name '*.deb' -exec cp -f {} "$OUT_DIR/" \;
else
  cp -f "$DEB_INPUT" "$OUT_DIR/"
fi

DEB_COUNT="$(find "$OUT_DIR" -maxdepth 1 -type f -name '*.deb' | wc -l)"
if [ "$DEB_COUNT" -eq 0 ]; then
  echo "Nenhum arquivo .deb encontrado em $DEB_INPUT" >&2
  exit 1
fi

(
  cd "$OUT_DIR"

  if command -v dpkg-scanpackages >/dev/null 2>&1; then
    dpkg-scanpackages --multiversion . /dev/null > Packages
  else
    python3 - <<'PYEOF'
import hashlib, os, subprocess, glob

entries = []
for deb in sorted(glob.glob("*.deb")):
    ctrl = subprocess.check_output(["dpkg-deb", "-f", deb], text=True).strip()
    data = open(deb, "rb").read()
    lines = [
        ctrl,
        f"Filename: ./{deb}",
        f"Size: {len(data)}",
        f"MD5sum: {hashlib.md5(data).hexdigest()}",
        f"SHA1: {hashlib.sha1(data).hexdigest()}",
        f"SHA256: {hashlib.sha256(data).hexdigest()}",
    ]
    entries.append("\n".join(lines))

with open("Packages", "w", encoding="utf-8") as f:
    f.write("\n\n".join(entries) + "\n")
PYEOF
  fi

  gzip -9c -n Packages > Packages.gz

  python3 - <<'PYEOF'
import datetime, hashlib, os

def file_hashes(path):
    data = open(path, "rb").read()
    return (
        len(data),
        hashlib.md5(data).hexdigest(),
        hashlib.sha1(data).hexdigest(),
        hashlib.sha256(data).hexdigest(),
    )

targets = ["Packages", "Packages.gz"]
stats = {name: file_hashes(name) for name in targets}
now = datetime.datetime.now(datetime.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S UTC")

out = [
    "Origin: Aurtistic",
    "Label: Aurtistic",
    "Suite: stable",
    "Codename: stable",
    f"Date: {now}",
    "Architectures: amd64",
    "Components: main",
    "Description: Aurtistic Desktop APT Repository",
    "MD5Sum:",
]
for name in targets:
    size, md5, _, _ = stats[name]
    out.append(f" {md5} {size:16d} {name}")
out.append("SHA1:")
for name in targets:
    size, _, sha1, _ = stats[name]
    out.append(f" {sha1} {size:16d} {name}")
out.append("SHA256:")
for name in targets:
    size, _, _, sha256 = stats[name]
    out.append(f" {sha256} {size:16d} {name}")

with open("Release", "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
PYEOF

  if [ -n "${APT_GPG_PRIVATE_KEY:-}" ]; then
    GNUPG_TMP="$(mktemp -d)"
    chmod 700 "$GNUPG_TMP"
    trap 'rm -rf "$GNUPG_TMP"' EXIT

    export GNUPGHOME="$GNUPG_TMP"
    PASSPHRASE_ARGS=()
    if [ -n "${APT_GPG_PASSPHRASE:-}" ]; then
      PASSPHRASE_ARGS=(--pinentry-mode loopback --passphrase "$APT_GPG_PASSPHRASE")
    else
      PASSPHRASE_ARGS=(--pinentry-mode loopback --passphrase "")
    fi

    printf '%s\n' "$APT_GPG_PRIVATE_KEY" | gpg --batch "${PASSPHRASE_ARGS[@]}" --import

    KEY_ID="$(gpg --list-secret-keys --with-colons | awk -F: '/^sec/{print $5; exit}')"
    if [ -z "$KEY_ID" ]; then
      echo "Falha ao localizar chave secreta GPG importada." >&2
      exit 1
    fi

    gpg --batch --yes --export "$KEY_ID" > KEY.gpg
    gpg --batch --yes "${PASSPHRASE_ARGS[@]}" -u "$KEY_ID" --armor --detach-sign -o Release.gpg Release
    gpg --batch --yes "${PASSPHRASE_ARGS[@]}" -u "$KEY_ID" --clearsign -o InRelease Release
    echo "Repositório APT assinado com GPG ($KEY_ID)."
  else
    echo "APT_GPG_PRIVATE_KEY não definida: repositório gerado sem assinatura GPG (Release.gpg/InRelease omitidos)."
  fi

  APT_PUBLIC_URL="${APT_PUBLIC_URL:-https://joaostangorlini.github.io/Aurtistic/apt}"
  cat > install.sh <<EOF_INSTALL
#!/usr/bin/env bash
set -euo pipefail

if [ "\$(id -u)" -ne 0 ]; then
  echo "Execute com sudo: curl -fsSL ${APT_PUBLIC_URL}/install.sh | sudo bash" >&2
  exit 1
fi

install -d -m 0755 /usr/share/keyrings
curl -fsSL "${APT_PUBLIC_URL}/KEY.gpg" | gpg --yes --dearmor -o /usr/share/keyrings/aurtistic.gpg
chmod 0644 /usr/share/keyrings/aurtistic.gpg
echo "deb [signed-by=/usr/share/keyrings/aurtistic.gpg] ${APT_PUBLIC_URL} ./" > /etc/apt/sources.list.d/aurtistic.list
apt-get update
apt-get install -y aurtistic
EOF_INSTALL
  chmod 0644 install.sh
)
