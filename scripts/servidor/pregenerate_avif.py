#!/usr/bin/env python3
# Este programa é um software livre (Licença AGPLv3)
"""
Pré-gerador sequencial de miniaturas AVIF + Sincronizador Completo de Catálogo V2.
- Migra automaticamente miniaturas .avif existentes caso pastas/subpastas tenham sido
  movidas no HD (usando assinatura rápida filename + sizeBytes).
- Lê os arquivos restantes de forma estritamente sequencial (1 thread leitora, zero thrashing)
  e comprime em RAM com 4 workers CPU.
- Extrai as dimensões reais (width x height pós-EXIF transpose) para Masonry/Tiles perfeitos.
- Persiste data/catalog.json e data/thumbs/sig_index.json incrementalmente.
"""

import os
import sys
import time
import json
import shutil
import hashlib
import io
from concurrent.futures import ProcessPoolExecutor
from PIL import Image, ImageOps

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir(os.path.join(_CURRENT_DIR, '..', '..', 'servidor')):
    BASE_DIR = os.path.abspath(os.path.join(_CURRENT_DIR, '..', '..', 'servidor'))
elif os.path.isfile(os.path.join(_CURRENT_DIR, '..', 'server.js')):
    BASE_DIR = os.path.abspath(os.path.join(_CURRENT_DIR, '..'))
else:
    BASE_DIR = os.path.dirname(_CURRENT_DIR)
HD_PORTFOLIO_DIR = os.environ.get('HD_PORTFOLIO_DIR', os.path.join(BASE_DIR, 'storage', 'portfolio'))
CATALOG_PATH = os.environ.get('CATALOG_PATH', os.path.join(BASE_DIR, 'data', 'catalog.json'))
DEST_THUMBS_DIR = os.environ.get('DEST_THUMBS_DIR', os.path.join(BASE_DIR, 'data', 'thumbs'))
SIG_INDEX_PATH = os.environ.get('SIG_INDEX_PATH', os.path.join(DEST_THUMBS_DIR, 'sig_index.json'))
ALLOWED_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp'}
IGNORED_DIRS = {'thumbs', 'originals', 'LOST.DIR', '$RECYCLE.BIN', 'System Volume Information'}

def convert_buffer_to_avif(payload):
    rel_path, cache_key, file_bytes = payload
    out_640 = os.path.join(DEST_THUMBS_DIR, f'thumb_{cache_key}_640.avif')
    tmp_out = out_640 + f'.tmp.{os.getpid()}_{int(time.time()*1000)}'
    try:
        with Image.open(io.BytesIO(file_bytes)) as im:
            im = ImageOps.exif_transpose(im)
            orig_w, orig_h = im.size
            if im.mode not in ('RGB', 'RGBA'):
                im = im.convert('RGB')
            im.thumbnail((640, 640), Image.Resampling.LANCZOS)
            im.save(tmp_out, 'AVIF', quality=65)
        os.replace(tmp_out, out_640)
        return (rel_path, True, 'generated', os.path.getsize(out_640), orig_w, orig_h)
    except Exception as e:
        if os.path.exists(tmp_out):
            try:
                os.remove(tmp_out)
            except Exception:
                pass
        return (rel_path, False, str(e), 0, 1600, 1067)

def read_thumb_dimensions(thumb_path):
    try:
        with Image.open(thumb_path) as im:
            w, h = im.size
            # Escala proporcional para base 1600px mantendo orientação exata
            if w >= h:
                return (1600, max(1, int(round(1600 * (h / w)))))
            else:
                return (max(1, int(round(1600 * (w / h)))), 1600)
    except Exception:
        return (1600, 1067)

def main():
    if not os.path.exists(HD_PORTFOLIO_DIR):
        print(f"[ERRO] Diretório do HD não montado: {HD_PORTFOLIO_DIR}")
        sys.exit(1)

    os.makedirs(DEST_THUMBS_DIR, exist_ok=True)

    # 1. Carrega catalog.json anterior e sig_index.json para reaproveitar miniaturas e metadados
    old_catalog = {}
    if os.path.exists(CATALOG_PATH):
        try:
            with open(CATALOG_PATH, 'r', encoding='utf-8') as f:
                old_catalog = json.load(f)
        except Exception:
            old_catalog = {}

    sig_index = {}
    if os.path.exists(SIG_INDEX_PATH):
        try:
            with open(SIG_INDEX_PATH, 'r', encoding='utf-8') as f:
                sig_index = json.load(f)
        except Exception:
            sig_index = {}

    old_by_rel = {}
    old_by_sig = {}
    for it in old_catalog.get('items', []):
        rel = it.get('relativePath', '')
        orig_file = it.get('originalFile') or os.path.basename(rel)
        sz = it.get('sizeBytes', 0)
        if rel:
            old_by_rel[rel] = it
            old_hash = hashlib.md5(rel.encode('utf-8')).hexdigest()
            if orig_file and sz:
                sig = f"{orig_file}_{sz}"
                old_by_sig[sig] = (it, old_hash)
                if os.path.exists(os.path.join(DEST_THUMBS_DIR, f'thumb_{old_hash}_640.avif')):
                    sig_index[sig] = old_hash

    print("=" * 72)
    print(" PRE-GERADOR SEQUENCIAL AVIF + INDEXADOR DE SUBPASTAS V2 (THINKPAD)")
    print(f" Origem:  {HD_PORTFOLIO_DIR}")
    print(f" Destino: {DEST_THUMBS_DIR}")
    print("=" * 72)

    # 2. Escaneia recursivamente a árvore de pastas e subpastas do HD
    discovered_entries = []
    root_albums = set()
    subalbums_map = {}

    top_dirs = sorted([
        d for d in os.listdir(HD_PORTFOLIO_DIR)
        if not d.startswith('.') and d not in IGNORED_DIRS
        and os.path.isdir(os.path.join(HD_PORTFOLIO_DIR, d))
    ])

    for top_album in top_dirs:
        root_albums.add(top_album)
        subalbums_map[top_album] = []
        album_abs = os.path.join(HD_PORTFOLIO_DIR, top_album)

        for root, dirs, files in os.walk(album_abs):
            dirs[:] = sorted([d for d in dirs if not d.startswith('.') and d not in IGNORED_DIRS])
            rel_from_album = os.path.relpath(root, album_abs)
            subalbum = None if rel_from_album == '.' else rel_from_album.replace('\\', '/')
            if subalbum and subalbum not in subalbums_map[top_album]:
                subalbums_map[top_album].append(subalbum)

            for fname in sorted(files):
                if fname.startswith('.'):
                    continue
                ext = os.path.splitext(fname.lower())[1]
                if ext not in ALLOWED_EXTS:
                    continue
                full_path = os.path.join(root, fname)
                rel_path = os.path.relpath(full_path, HD_PORTFOLIO_DIR).replace('\\', '/')
                try:
                    st = os.stat(full_path)
                    size_bytes = st.st_size
                    mtime_ms = int(st.st_mtime * 1000)
                except Exception:
                    size_bytes = 0
                    mtime_ms = int(time.time() * 1000)

                discovered_entries.append({
                    'rel_path': rel_path,
                    'full_path': full_path,
                    'fname': fname,
                    'album': top_album,
                    'subalbum': subalbum,
                    'size_bytes': size_bytes,
                    'mtime_ms': mtime_ms,
                })

    total = len(discovered_entries)
    print(f"Total de fotografias mapeadas: {total} em {len(top_dirs)} categorias raiz.")

    # 3. Verifica/migra miniaturas já existentes por assinatura (fname + size_bytes)
    to_process = []
    migrated_count = 0
    cached_count = 0
    dims_map = {}

    for entry in discovered_entries:
        rel_path = entry['rel_path']
        fname = entry['fname']
        sz = entry['size_bytes']
        sig = f"{fname}_{sz}"
        ck = hashlib.md5(rel_path.encode('utf-8')).hexdigest()
        entry['cache_key'] = ck
        entry['file_sig'] = sig

        target_avif = os.path.join(DEST_THUMBS_DIR, f'thumb_{ck}_640.avif')

        if os.path.exists(target_avif) and os.path.getsize(target_avif) > 1000:
            cached_count += 1
            sig_index[sig] = ck
            dims_map[rel_path] = read_thumb_dimensions(target_avif)
            continue

        # Verifica se existe miniatura com outro hash para a mesma assinatura (foto movida de pasta!)
        old_hash = sig_index.get(sig)
        if not old_hash and sig in old_by_sig:
            old_hash = old_by_sig[sig][1]

        if old_hash and old_hash != ck:
            old_avif = os.path.join(DEST_THUMBS_DIR, f'thumb_{old_hash}_640.avif')
            if os.path.exists(old_avif) and os.path.getsize(old_avif) > 1000:
                try:
                    shutil.copy2(old_avif, target_avif)
                    migrated_count += 1
                    sig_index[sig] = ck
                    dims_map[rel_path] = read_thumb_dimensions(target_avif)
                    continue
                except Exception:
                    pass

        to_process.append(entry)

    print(f"Miniaturas já em cache: {cached_count} | Migradas por assinatura: {migrated_count} | Para gerar: {len(to_process)}")

    def save_catalog_snapshot():
        items_list = []
        for idx, ent in enumerate(discovered_entries):
            rel = ent['rel_path']
            ck = ent['cache_key']
            sig = ent['file_sig']
            old_it = old_by_rel.get(rel) or (old_by_sig.get(sig)[0] if sig in old_by_sig else {}) or {}
            w, h = dims_map.get(rel, (old_it.get('width', 1600), old_it.get('height', 1067)))
            base_title = os.path.splitext(ent['fname'])[0]
            encoded_rel = '/'.join(
                [ part.replace(' ', '%20') for part in rel.split('/') ]
            )
            from urllib.parse import quote
            encoded_rel = '/'.join(quote(part, safe='') for part in rel.split('/'))
            thumb_file = os.path.join(DEST_THUMBS_DIR, f'thumb_{ck}_640.avif')
            thumb_bytes = os.path.getsize(thumb_file) if os.path.exists(thumb_file) else 0

            items_list.append({
                'id': f'pf_{ck[:16]}',
                'title': old_it.get('title') or base_title,
                'album': ent['album'],
                'subalbum': ent['subalbum'],
                'description': old_it.get('description', ''),
                'originalFile': ent['fname'],
                'relativePath': rel,
                'fileSig': sig,
                'originalUrl': f'/portfolio-media/content/{encoded_rel}',
                'thumbUrl': f'/portfolio-media/thumb/{encoded_rel}?v={ent["mtime_ms"]}',
                'width': w,
                'height': h,
                'sizeBytes': ent['size_bytes'],
                'thumbBytes': thumb_bytes,
                'exif': old_it.get('exif', {}),
                'createdAt': old_it.get('createdAt') or time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(ent['mtime_ms']/1000)),
                'order': old_it.get('order', idx),
                'span': old_it.get('span', '1x1'),
                'fit': old_it.get('fit', 'inherit'),
                'aspectRatioOverride': old_it.get('aspectRatioOverride', 'auto'),
                'focalPoint': old_it.get('focalPoint', {'x': 50, 'y': 50}),
            })

        prev_settings = old_catalog.get('settings', {})
        prev_order = prev_settings.get('albumOrder', [])
        ordered_albums = [a for a in prev_order if a in root_albums]
        for a in top_dirs:
            if a not in ordered_albums:
                ordered_albums.append(a)

        new_cat = {
            'version': '2.0.0',
            'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()),
            'settings': {
                'title': 'João Stangorlini',
                'subtitle': prev_settings.get('subtitle') or 'Fotografia autoral, ciência & narrativas visuais em código',
                'accentTag': prev_settings.get('accentTag') or 'FOTOGRAFIA • CIÊNCIA • CÓDIGO',
                'albumOrder': ordered_albums,
                'layout': prev_settings.get('layout') or {
                    'gridMode': 'masonry',
                    'gapPx': 18,
                    'borderRadiusPx': 12,
                    'columnsDesktop': 4,
                    'sections': {},
                },
                'mockOverrides': prev_settings.get('mockOverrides', {}),
            },
            'albums': ordered_albums,
            'subalbums': subalbums_map,
            'items': items_list,
        }

        tmp_cat = CATALOG_PATH + '.tmp'
        with open(tmp_cat, 'w', encoding='utf-8') as f:
            json.dump(new_cat, f, ensure_ascii=False, indent=2)
        os.replace(tmp_cat, CATALOG_PATH)

        tmp_sig = SIG_INDEX_PATH + '.tmp'
        with open(tmp_sig, 'w', encoding='utf-8') as f:
            json.dump(sig_index, f, ensure_ascii=False)
        os.replace(tmp_sig, SIG_INDEX_PATH)

    # Salva já um snapshot inicial com as pastas novas e miniaturas migradas!
    save_catalog_snapshot()
    print("[Snapshot] catalog.json atualizado com a nova estrutura de 17 pastas e 12 subpastas!")

    if not to_process:
        print("Todas as miniaturas já estão prontas!")
        return

    start_time = time.time()
    generated_count = 0
    error_count = 0
    cpu_workers = max(2, min(4, os.cpu_count() or 2))
    batch_size = 16

    with ProcessPoolExecutor(max_workers=cpu_workers) as executor:
        for i in range(0, len(to_process), batch_size):
            chunk = to_process[i:i + batch_size]
            payloads = []

            # Leitura estritamente sequencial com micro-respiro de 4ms para não saturar a ponte USB JMicron
            for ent in chunk:
                try:
                    with open(ent['full_path'], 'rb') as fp:
                        b = fp.read()
                    payloads.append((ent['rel_path'], ent['cache_key'], b))
                    time.sleep(0.004)
                except Exception as read_err:
                    print(f"[ERRO LEITURA HD] {ent['rel_path']}: {read_err}")
                    error_count += 1

            if payloads:
                results = list(executor.map(convert_buffer_to_avif, payloads))
                for (ent, res) in zip(chunk, results):
                    rel_path, success, status, sz, w, h = res
                    if success:
                        generated_count += 1
                        dims_map[rel_path] = (w, h)
                        sig_index[ent['file_sig']] = ent['cache_key']
                    else:
                        error_count += 1
                        print(f"[ERRO CONVERSÃO] {rel_path}: {status}")

            done = cached_count + migrated_count + generated_count + error_count
            pct = (done / total) * 100
            elapsed = time.time() - start_time
            fps = generated_count / max(0.1, elapsed)
            if (i // batch_size) % 5 == 0 or done == total:
                print(f"[{pct:5.1f}%] {done}/{total} concluídas ({fps:.1f} fotos/s, novas={generated_count}, migradas={migrated_count}, erros={error_count})", flush=True)
            if (i // batch_size) % 12 == 0:
                save_catalog_snapshot()

    save_catalog_snapshot()
    elapsed = time.time() - start_time
    print("=" * 72)
    print(f" CONCLUÍDO em {elapsed:.1f}s! Novas={generated_count}, Migradas={migrated_count}, Cache={cached_count}, Erros={error_count}")
    print("=" * 72)

if __name__ == '__main__':
    main()
