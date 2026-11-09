from PIL import Image, ImageDraw, ImageFont
import os

def create_preview(path, title_text, bg_color="#1A1A1A"):
    # 3x4 aspect ratio approximately, e.g., 600x800
    width = 600
    height = 800
    
    img = Image.new("RGBA", (width, height), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    
    # Draw rounded rectangle background
    draw.rounded_rectangle([0, 0, width, height], radius=40, fill=bg_color)
    
    # Try to load a font, otherwise use default
    try:
        font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40)
        font_task = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
        font_date = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    except:
        font_title = ImageFont.load_default()
        font_task = ImageFont.load_default()
        font_date = ImageFont.load_default()

    # Draw header text
    draw.text((40, 40), title_text, fill="#FFFFFF", font=font_title)
    
    # Draw + button
    draw.ellipse([500, 30, 560, 90], fill="#444444")
    draw.line([530, 45, 530, 75], fill="#FFFFFF", width=6)
    draw.line([515, 60, 545, 60], fill="#FFFFFF", width=6)
    
    # Tasks
    tasks = [
        {"name": "Nova Tarefa (Rascunho)", "color": "#408E8E8E", "fill": "#228E8E8E", "tag": "Rascunho"},
        {"name": "Tomar medicamentos", "color": "#40E0E0E0", "fill": "#22E0E0E0", "tag": "Não iniciada"},
        {"name": "Ler capítulo 1 do livro", "color": "#404285F4", "fill": "#224285F4", "tag": "Em progresso"},
        {"name": "Comprar mantimentos", "color": "#40F4B400", "fill": "#22F4B400", "tag": "Falta testar"}
    ]
    
    y = 120
    for task in tasks:
        # draw task bg
        draw.rounded_rectangle([40, y, 560, y+100], radius=20, fill=task["fill"], outline=task["color"], width=2)
        # draw text
        draw.text((60, y+35), task["name"], fill="#FFFFFF", font=font_task)
        # draw tag
        draw.rounded_rectangle([390, y+30, 540, y+70], radius=10, fill=task["color"])
        draw.text((405, y+45), task["tag"], fill="#FFFFFF", font=font_date)
        y += 130
        
    img.save(path)

# Generate for both projects
aurtistic_path = "/home/stangorlini/stangorlini.web/Aurtistic/android/app/src/main/res/drawable/widget_preview_image.png"
stangorlini_path = "/home/stangorlini/stangorlini.web/android/app/src/main/res/drawable/widget_preview_image.png"

create_preview(aurtistic_path, "Todas ▼")
create_preview(stangorlini_path, "Trabalho ▼")
print("PNG Previews created.")
