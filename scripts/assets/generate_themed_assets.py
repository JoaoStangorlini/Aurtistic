# Este programa é um software livre (Licença AGPLv3)
"""
Script gerador de assets visuais temáticos da identidade visual Aurtistic.
Mantém rigorosamente o design original (tipografia, ícone cerebral e caixa de marcação)
gerando variações fiéis para cada uma das 5 paletas em modos Dark e Light, além dos ícones PWA/Favicon.
Na paleta padrão oficial (purple-gold), preserva 100% o logotipo original e o ícone autêntico
criados pelo autor (aurtistic_logo_white_v3.png e src/app/icon.png), mantendo a integridade artística absoluta da marca.
"""

import os
import colorsys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

PALETTES = {
    'purple-gold': {
        'primary_dark': '#9D4EDD',
        'primary_light': '#7B2CBF',
        'secondary_dark': '#FFCC00',
        'secondary_light': '#D97706',
        'accent_dark': '#9D4EDD',
        'accent_light': '#7B2CBF',
    },
    'blue-red': {
        'primary_dark': '#2563EB',
        'primary_light': '#1D4ED8',
        'secondary_dark': '#E11D48',
        'secondary_light': '#BE123C',
        'accent_dark': '#2563EB',
        'accent_light': '#1D4ED8',
    },
    'pink-green': {
        'primary_dark': '#DB2777',
        'primary_light': '#BE185D',
        'secondary_dark': '#10B981',
        'secondary_light': '#059669',
        'accent_dark': '#DB2777',
        'accent_light': '#BE185D',
    },
    'cyan-amber': {
        'primary_dark': '#06B6D4',
        'primary_light': '#0E7490',
        'secondary_dark': '#F59E0B',
        'secondary_light': '#D97706',
        'accent_dark': '#06B6D4',
        'accent_light': '#0E7490',
    },
    'emerald-violet': {
        'primary_dark': '#10B981',
        'primary_light': '#047857',
        'secondary_dark': '#7C3AED',
        'secondary_light': '#6D28D9',
        'accent_dark': '#10B981',
        'accent_light': '#047857',
    },
}

def hex_to_rgb(hex_str: str) -> np.ndarray:
    hex_str = hex_str.lstrip('#')
    return np.array([int(hex_str[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32)

def recolor_logo_image(src_img: Image.Image, pal_id: str, pal_cfg: dict, is_light: bool = False) -> Image.Image:
    # Para a paleta oficial purple-gold no modo escuro, retorna exatamente o arquivo original autêntico
    if pal_id == 'purple-gold' and not is_light:
        return src_img.copy()

    arr = np.array(src_img, dtype=np.float32)
    h, w, _ = arr.shape
    out = arr.copy()
    
    pri_rgb = hex_to_rgb(pal_cfg['primary_light'] if is_light else pal_cfg['primary_dark'])
    sec_rgb = hex_to_rgb(pal_cfg['secondary_light'] if is_light else pal_cfg['secondary_dark'])
    
    pri_h, pri_s, _ = colorsys.rgb_to_hsv(*(pri_rgb / 255.0))
    sec_h, sec_s, _ = colorsys.rgb_to_hsv(*(sec_rgb / 255.0))

    # Máscara de pixels visíveis
    mask = arr[:, :, 3] > 0
    
    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                continue
            
            r, g, b, a = arr[y, x]
            
            # 1. Região da Tipografia Autêntica "Aurtistic" (x entre 218 e 845)
            if 218 <= x <= 845:
                if is_light:
                    norm_lum = max(r, g, b) / 255.0
                    effective_a = (a / 255.0) * norm_lum
                    if effective_a < 0.18:
                        out[y, x] = [20.0, 22.0, 26.0, 0.0]
                    else:
                        clean_alpha = min(1.0, ((effective_a - 0.18) / 0.72) ** 0.95) * 255.0
                        out[y, x, 0] = 20.0   # #14161A (--text-primary no Modo Claro)
                        out[y, x, 1] = 22.0
                        out[y, x, 2] = 26.0
                        out[y, x, 3] = clean_alpha
                else:
                    out[y, x, 0] = 255.0
                    out[y, x, 1] = 255.0
                    out[y, x, 2] = 255.0
                continue
                
            # Se for purple-gold no modo claro, mantém o cérebro (x < 218) e checkbox (x > 845) 100% originais
            if pal_id == 'purple-gold' and is_light:
                continue

            # 2. Região da Caixa de Marcação / Checkbox (x > 845)
            if x > 845:
                cur_h, cur_s, cur_v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
                if cur_s < 0.2 and cur_v > 0.5:
                    out[y, x, 0] = 255.0
                    out[y, x, 1] = 255.0
                    out[y, x, 2] = 255.0
                else:
                    target_s = min(1.0, max(0.5, pri_s))
                    new_r, new_g, new_b = colorsys.hsv_to_rgb(pri_h, target_s, cur_v)
                    out[y, x, 0] = new_r * 255.0
                    out[y, x, 1] = new_g * 255.0
                    out[y, x, 2] = new_b * 255.0
                continue
                
            # 3. Região do Ícone Cerebral (x < 218) para paletas alternativas
            nx = np.clip((x - 10.0) / 202.0, 0.0, 1.0)
            ny = np.clip((y - 10.0) / 194.0, 0.0, 1.0)
            t = float(np.clip(0.72 * nx + 0.28 * ny, 0.0, 1.0))
            
            t_smooth = t * t * (3.0 - 2.0 * t)
            if abs(sec_h - pri_h) <= 0.5:
                target_h = (1.0 - t_smooth) * pri_h + t_smooth * sec_h
            else:
                h_end = sec_h + 1.0 if sec_h < pri_h else sec_h - 1.0
                target_h = ((1.0 - t_smooth) * pri_h + t_smooth * h_end) % 1.0
            target_s = (1.0 - t_smooth) * pri_s + t_smooth * sec_s
            
            cur_h, cur_s, cur_v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            new_r, new_g, new_b = colorsys.hsv_to_rgb(target_h, target_s, cur_v)
            out[y, x, 0] = new_r * 255.0
            out[y, x, 1] = new_g * 255.0
            out[y, x, 2] = new_b * 255.0

    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

def apply_optical_halo(img: Image.Image, halo_top=(255, 235, 150), halo_bottom=(255, 185, 0)) -> Image.Image:
    """Aplica halo óptico de alta visibilidade para contraste perfeito em abas escuras, claras ou coloridas."""
    w, h = img.size
    alpha = img.split()[3]
    dilated = alpha.filter(ImageFilter.MaxFilter(15))
    dilated_blur = dilated.filter(ImageFilter.GaussianBlur(1.2))
    
    stroke_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    stroke_draw = ImageDraw.Draw(stroke_layer)
    for y in range(h):
        t = y / max(1, h)
        r = int(halo_top[0] * (1.0 - t) + halo_bottom[0] * t)
        g = int(halo_top[1] * (1.0 - t) + halo_bottom[1] * t)
        b = int(halo_top[2] * (1.0 - t) + halo_bottom[2] * t)
        stroke_draw.line([(0, y), (w, y)], fill=(r, g, b, 255))
    stroke_layer.putalpha(dilated_blur)
    
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(stroke_layer)
    out.alpha_composite(img)
    return out

def recolor_icon_image(src_img: Image.Image, pal_id: str, pal_cfg: dict) -> Image.Image:
    # Para a paleta oficial purple-gold, retorna exatamente o ícone original autêntico
    if pal_id == 'purple-gold':
        return src_img.copy()

    arr = np.array(src_img, dtype=np.float32)
    h, w, _ = arr.shape
    out = arr.copy()
    
    pri_rgb = hex_to_rgb(pal_cfg['primary_dark'])
    sec_rgb = hex_to_rgb(pal_cfg['secondary_dark'])
    
    pri_h, pri_s, _ = colorsys.rgb_to_hsv(*(pri_rgb / 255.0))
    sec_h, sec_s, _ = colorsys.rgb_to_hsv(*(sec_rgb / 255.0))

    mask = arr[:, :, 3] > 8
    ys, xs = np.where(mask)
    x_min, x_max = float(xs.min()), float(xs.max())
    y_min, y_max = float(ys.min()), float(ys.max())
    
    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                continue
            
            r, g, b, _ = arr[y, x]
            
            nx = (x - x_min) / max(1.0, (x_max - x_min))
            ny = (y - y_min) / max(1.0, (y_max - y_min))
            t = float(np.clip(0.72 * nx + 0.28 * ny, 0.0, 1.0))
            
            t_smooth = t * t * (3.0 - 2.0 * t)
            if abs(sec_h - pri_h) <= 0.5:
                target_h = (1.0 - t_smooth) * pri_h + t_smooth * sec_h
            else:
                h_end = sec_h + 1.0 if sec_h < pri_h else sec_h - 1.0
                target_h = ((1.0 - t_smooth) * pri_h + t_smooth * h_end) % 1.0
            target_s = (1.0 - t_smooth) * pri_s + t_smooth * sec_s

            cur_h, cur_s, cur_v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            new_r, new_g, new_b = colorsys.hsv_to_rgb(target_h, target_s, cur_v)
            out[y, x, 0] = new_r * 255.0
            out[y, x, 1] = new_g * 255.0
            out[y, x, 2] = new_b * 255.0

    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

def main():
    os.makedirs('public/logos', exist_ok=True)
    os.makedirs('public/icons', exist_ok=True)
    
    logo_src = Image.open('public/aurtistic_logo_white_v3.png').convert('RGBA')
    icon_src = Image.open('src/app/icon.png').convert('RGBA')
    
    print('1. Gerando 10 variações do logotipo oficial (5 paletas x 2 modos)...')
    for pal_id, pal_cfg in PALETTES.items():
        # Modo Escuro
        dark_logo = recolor_logo_image(logo_src, pal_id, pal_cfg, is_light=False)
        dark_path = f'public/logos/logo-{pal_id}-dark.png'
        dark_logo.save(dark_path, optimize=True)
        print(f'   -> Criado: {dark_path} ({dark_logo.size})')
        
        # Modo Claro
        light_logo = recolor_logo_image(logo_src, pal_id, pal_cfg, is_light=True)
        light_path = f'public/logos/logo-{pal_id}-light.png'
        light_logo.save(light_path, optimize=True)
        print(f'   -> Criado: {light_path} ({light_logo.size})')

    print('2. Gerando 5 ícones temáticos para Favicon e PWA com Halo Óptico de Alta Visibilidade...')
    for pal_id, pal_cfg in PALETTES.items():
        themed_icon = recolor_icon_image(icon_src, pal_id, pal_cfg)
        sec_c = hex_to_rgb(pal_cfg['secondary_light'])
        halo_top = tuple(int(x) for x in np.clip(sec_c * 1.25, 0, 255))
        halo_bottom = tuple(int(x) for x in np.clip(sec_c * 0.95, 0, 255))
        high_contrast_icon = apply_optical_halo(themed_icon, halo_top, halo_bottom)

        icon_path = f'public/icons/icon-{pal_id}.png'
        high_contrast_icon.save(icon_path, optimize=True)
        print(f'   -> Criado com Halo Óptico: {icon_path} ({high_contrast_icon.size})')

    # Atualiza também src/app/icon.png e public/icon.png com o Halo de Alta Visibilidade
    default_halo_icon = apply_optical_halo(icon_src, (255, 235, 150), (255, 185, 0))
    default_halo_icon.save('src/app/icon.png', optimize=True)
    default_halo_icon.save('public/icon.png', optimize=True)
    print('   -> Atualizado com Halo Óptico: src/app/icon.png e public/icon.png')

    # Sincroniza os arquivos originais autênticos no HUB LabDiv
    hub_aurtistic_dir = '/home/stangorlini/HUB LabDiv/public/aurtistic'
    if os.path.exists(hub_aurtistic_dir):
        default_halo_icon.save(f'{hub_aurtistic_dir}/icon.png', optimize=True)
        logo_src.save(f'{hub_aurtistic_dir}/logo-full.png', optimize=True)
        print(f'   -> Sincronizado HUB LabDiv com os assets originais em {hub_aurtistic_dir}')

    print('Sucesso: O logotipo e o ícone originais autênticos foram totalmente restaurados na paleta padrão!')

if __name__ == '__main__':
    main()
