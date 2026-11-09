from PIL import Image

# Open the original generated image (assuming it is 1024x1024)
img_path = "/home/stangorlini/.gemini/antigravity-ide/brain/8c22e501-072a-46f1-9e2b-1cdefc92afd7/aurtistic_promo_graphic_v3_1784495841215.png"
img = Image.open(img_path)

# If it's not 1024 width, resize it to 1024 width first while maintaining aspect ratio
if img.width != 1024:
    ratio = 1024 / img.width
    new_height = int(img.height * ratio)
    img = img.resize((1024, new_height), Image.Resampling.LANCZOS)

# Create a new black background image of exactly 1024x500
bg = Image.new('RGB', (1024, 500), (18, 18, 18)) # #121212

# Calculate position to paste the original image (centered vertically)
# If original height > 500, this will crop top and bottom.
# Wait, pasting an image larger than the canvas will crop it automatically in PIL? No, we should crop it first, or paste it with negative offset.
# Yes, pasting with negative y offset crops it automatically.
y_offset = (500 - img.height) // 2

bg.paste(img, (0, y_offset))

# Save the final image
output_path = "/home/stangorlini/.gemini/antigravity-ide/brain/8c22e501-072a-46f1-9e2b-1cdefc92afd7/feature_graphic_1024x500.png"
bg.save(output_path)
print(f"Saved exactly 1024x500 image to {output_path}")
