from PIL import Image

def process_image(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    for item in data:
        r, g, b, a = item
        if a > 0:
            # Check if pixel is dark and mostly grayscale (typical for black text)
            if r < 120 and g < 120 and b < 120 and max(r,g,b) - min(r,g,b) < 30:
                # Invert the dark pixel so it becomes white, preserving anti-aliasing
                # Actually, a simple inversion for text is to push it towards white 
                # but keep the same alpha.
                new_data.append((255, 255, 255, a))
            else:
                new_data.append(item)
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(output_path)
    print(f"Processed {input_path} and saved to {output_path}")

process_image("public/feature_graphic_final_white.png", "public/aurtistic_logo_white_v3.png")
