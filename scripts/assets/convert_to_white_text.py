from PIL import Image

def process_image(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    for item in data:
        r, g, b, a = item
        if a > 0:
            # Check if pixel is dark and mostly grayscale (typical for black text)
            if r < 80 and g < 80 and b < 80 and max(r,g,b) - min(r,g,b) < 30:
                # Invert the dark pixel so it becomes white, preserving anti-aliasing
                # If r is 0, it becomes 255. If r is 70, it becomes 185.
                new_data.append((255 - r, 255 - g, 255 - b, a))
            # Also check for slightly lighter anti-aliased edges
            elif r < 140 and g < 140 and b < 140 and max(r,g,b) - min(r,g,b) < 30:
                # Make them proportionally lighter
                new_data.append((255 - r, 255 - g, 255 - b, a))
            else:
                new_data.append(item)
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(output_path)
    print(f"Processed {input_path} and saved to {output_path}")

process_image("public/feature_graphic_final.png", "public/feature_graphic_final_white.png")
