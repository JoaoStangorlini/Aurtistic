# Este programa é um software livre (Licença AGPLv3)
"""
Gera 3 protótipos de favicon de alto contraste para visibilidade em abas de navegadores:
- Protótipo 1: Halo / Contorno Óptico Claro (Gold/White Stroke)
- Protótipo 2: Emblema Squircle (Pastilha com Fundo Controlado e Borda Metálica Ouro)
- Protótipo 3: Micro-Asset Tunado em Luminância (Vivid Amethyst & Bright Gold)
- Imagem Comparativa: Demonstração lado a lado nas abas do Opera GX (fundo vinho), Chrome Dark e Chrome Light.
"""

import os
import colorsys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont

def hex_to_rgb(hex_str: str) -> np.ndarray:
    hex_str = hex_str.lstrip('#')
    return np.array([int(hex_str[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32)

def generate_prototypes():
    os.makedirs('public/prototipos', exist_ok=True)
    icon_orig = Image.open('src/app/icon.png').convert('RGBA')
    w, h = icon_orig.size # 512, 512
    arr_orig = np.array(icon_orig, dtype=np.float32)

    # ----------------------------------------------------
    # PROTÓTIPO 1: Halo / Contorno Óptico Claro (Gold/White)
    # ----------------------------------------------------
    # Criar máscara alfa expandida (dilatação morfológica)
    alpha = icon_orig.split()[3]
    # Dilação com MaxFilter
    dilated = alpha.filter(ImageFilter.MaxFilter(17)) # ~8px para cada lado
    dilated_blur = dilated.filter(ImageFilter.GaussianBlur(1.5))
    
    # Gerar cor do contorno (gradiente dourado luminoso a perolado)
    stroke_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    stroke_draw = ImageDraw.Draw(stroke_layer)
    
    # Gradiente no halo: do ouro claro (#FFE082) ao topo até ouro rico (#FFB300)
    for y in range(h):
        t = y / h
        r = int(255 * (1.0 - t * 0.1))
        g = int(224 - t * 45)
        b = int(130 - t * 130)
        stroke_draw.line([(0, y), (w, y)], fill=(r, g, b, 255))
        
    stroke_layer.putalpha(dilated_blur)
    
    # Compor o ícone original sobre o contorno luminoso
    p1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    p1.alpha_composite(stroke_layer)
    p1.alpha_composite(icon_orig)
    p1.save('public/prototipos/prototipo_1_halo.png')
    print("-> Protótipo 1 gerado: public/prototipos/prototipo_1_halo.png")

    # ----------------------------------------------------
    # PROTÓTIPO 2: Emblema Squircle com Fundo Escuro e Borda Metálica Ouro
    # ----------------------------------------------------
    p2 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw2 = ImageDraw.Draw(p2)
    
    # Criar squircle arredondado
    pad = 28
    box = [pad, pad, w - pad, h - pad]
    radius = 110
    
    # Fundo do emblema: gradiente violeta muito escuro (#1a0d28) para obsidiana (#0d0814)
    # Primeiro desenha o shape de base
    base_mask = Image.new('L', (w, h), 0)
    draw_bm = ImageDraw.Draw(base_mask)
    draw_bm.rounded_rectangle(box, radius=radius, fill=255)
    
    bg_gradient = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw_bg = ImageDraw.Draw(bg_gradient)
    for y in range(pad, h - pad):
        t = (y - pad) / (h - 2 * pad)
        r = int(26 * (1 - t) + 12 * t)
        g = int(13 * (1 - t) + 8 * t)
        b = int(40 * (1 - t) + 20 * t)
        draw_bg.line([(pad, y), (w - pad, y)], fill=(r, g, b, 255))
    bg_gradient.putalpha(base_mask)
    p2.alpha_composite(bg_gradient)
    
    # Borda metálica dourada (14px)
    border_mask = Image.new('L', (w, h), 0)
    draw_bmask = ImageDraw.Draw(border_mask)
    draw_bmask.rounded_rectangle(box, radius=radius, outline=255, width=14)
    
    border_gradient = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw_border = ImageDraw.Draw(border_gradient)
    for y in range(h):
        t = y / h
        # Do ouro brilhante no topo (#FFE57F) ao ouro rico (#C7940E)
        r = int(255 * (1 - t) + 199 * t)
        g = int(229 * (1 - t) + 148 * t)
        b = int(127 * (1 - t) + 14 * t)
        draw_border.line([(0, y), (w, y)], fill=(r, g, b, 255))
    border_gradient.putalpha(border_mask)
    p2.alpha_composite(border_gradient)
    
    # Inserir o cérebro original centralizado a 76% de escala
    inner_size = int(w * 0.76)
    icon_scaled = icon_orig.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    offset = (w - inner_size) // 2
    p2.alpha_composite(icon_scaled, (offset, offset))
    p2.save('public/prototipos/prototipo_2_squircle.png')
    print("-> Protótipo 2 gerado: public/prototipos/prototipo_2_squircle.png")

    # ----------------------------------------------------
    # PROTÓTIPO 3: Micro-Asset Tunado em Luminância (Vivid Amethyst & Bright Gold)
    # ----------------------------------------------------
    # Eleva a luminância das partes escuras sem perder as nuances do cérebro
    p3_arr = arr_orig.copy()
    mask = p3_arr[:, :, 3] > 10
    
    # Processamento pixel a pixel
    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                continue
            r, g, b, a = p3_arr[y, x]
            h_val, s_val, v_val = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
            
            # Se for do espectro violeta/azul escuro (lado esquerdo)
            if 0.50 <= h_val <= 0.88:
                # Eleva o brilho base de 0.2-0.5 para 0.75-0.95
                v_boost = min(1.0, 0.45 + v_val * 0.75)
                # Mantém saturação vibrante
                s_boost = min(1.0, max(0.65, s_val * 1.1))
                # Leve transição para ametista elétrico mais luminoso (300° ~ 0.83)
                new_h = 0.78 + (h_val - 0.50) * 0.15
                nr, ng, nb = colorsys.hsv_to_rgb(new_h, s_boost, v_boost)
                p3_arr[y, x, :3] = [nr * 255.0, ng * 255.0, nb * 255.0]
            # Se for do espectro dourado/âmbar (lado direito)
            elif h_val < 0.18 or h_val > 0.95:
                # Reforça a luminosidade do ouro
                v_boost = min(1.0, v_val * 1.08)
                nr, ng, nb = colorsys.hsv_to_rgb(h_val, s_val, v_boost)
                p3_arr[y, x, :3] = [nr * 255.0, ng * 255.0, nb * 255.0]

    p3 = Image.fromarray(np.uint8(np.clip(p3_arr, 0, 255)), mode='RGBA')
    p3.save('public/prototipos/prototipo_3_luminance.png')
    print("-> Protótipo 3 gerado: public/prototipos/prototipo_3_luminance.png")

    # ----------------------------------------------------
    # GERAR IMAGEM COMPARATIVA DAS ABAS DO NAVEGADOR
    # ----------------------------------------------------
    # Monta uma prancha visual bonita simulando abas de navegador em 3 contextos:
    # 1. Opera GX (fundo vinho #581223)
    # 2. Chrome / Edge Dark (fundo grafite #202124)
    # 3. Chrome / Edge Light (fundo cinza claro #DEE1E6)
    
    comp_w, comp_h = 1000, 720
    comp = Image.new('RGBA', (comp_w, comp_h), (18, 18, 22, 255))
    cdraw = ImageDraw.Draw(comp)
    
    # Cabeçalho
    cdraw.text((40, 25), "COMPARAÇÃO DE PROTÓTIPOS DE FAVICON NAS GUIAS DO NAVEGADOR", fill=(255, 255, 255, 255))
    cdraw.text((40, 52), "Simulação realista de renderização na escala da aba (24x24 px e 120x120 px)", fill=(160, 160, 175, 255))
    
    headers = [
        ("ATUAL (Original)", icon_orig),
        ("OPÇÃO 1 (Halo Dourado)", p1),
        ("OPÇÃO 2 (Squircle Badged)", p2),
        ("OPÇÃO 3 (Luminância Tunada)", p3),
    ]
    
    # Desenhar 4 colunas com os ícones grandes
    col_w = 215
    start_x = 45
    top_y = 95
    
    for i, (title, img) in enumerate(headers):
        x = start_x + i * (col_w + 20)
        # Cartão de fundo
        cdraw.rounded_rectangle([x, top_y, x + col_w, top_y + 190], radius=12, fill=(28, 28, 36, 255), outline=(50, 50, 65, 255), width=1)
        cdraw.text((x + 15, top_y + 12), title, fill=(240, 210, 130, 255))
        
        # Ícone em 120x120 centralizado
        scaled_120 = img.resize((120, 120), Image.Resampling.LANCZOS)
        comp.alpha_composite(scaled_120, (x + (col_w - 120)//2, top_y + 45))
        
    # Seção de Simulação das Abas Reais
    tab_tests = [
        ("1. Aba Opera GX (Vinho / Dark Red - O seu caso)", (88, 18, 35, 255), 320),
        ("2. Aba Chrome / Edge Dark (Grafite Escuro #202124)", (32, 33, 36, 255), 450),
        ("3. Aba Chrome / Edge Light (Cinza Claro #DEE1E6)", (222, 225, 230, 255), 580),
    ]
    
    for label, tab_bg, ty in tab_tests:
        # Título do teste
        cdraw.text((45, ty - 22), label, fill=(200, 200, 215, 255))
        
        # Desenha a barra da janela
        cdraw.rectangle([45, ty, comp_w - 45, ty + 70], fill=(tab_bg[0]//2, tab_bg[1]//2, tab_bg[2]//2, 255))
        
        # Desenha 4 abas para cada protótipo
        for i, (title, img) in enumerate(headers):
            tx = start_x + i * (col_w + 20)
            # Corpo da aba
            is_light_tab = tab_bg[0] > 180
            cdraw.rounded_rectangle([tx, ty + 12, tx + col_w - 10, ty + 68], radius=8, fill=tab_bg)
            
            # Ícone miniatura na aba (24x24 px)
            icon_tab = img.resize((24, 24), Image.Resampling.LANCZOS)
            comp.alpha_composite(icon_tab, (tx + 14, ty + 28))
            
            # Texto da aba "Aurtistic"
            text_color = (20, 20, 25, 255) if is_light_tab else (255, 255, 255, 255)
            cdraw.text((tx + 46, ty + 32), "Aurtistic", fill=text_color)

    comp.save('public/prototipos/comparativo_abas.png')
    print("-> Comparativo gerado: public/prototipos/comparativo_abas.png")

if __name__ == '__main__':
    generate_prototypes()

