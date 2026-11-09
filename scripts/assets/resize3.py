from PIL import Image

img_path = "/home/stangorlini/.gemini/antigravity-ide/brain/8c22e501-072a-46f1-9e2b-1cdefc92afd7/aurtistic_promo_banner_v4_1784496498933.png"
img = Image.open(img_path)

# Since the generated image is likely a horizontal layout on a square canvas (1024x1024),
# and the text is perfectly centered horizontally, we can just crop the center 500 pixels.
y_offset = (1024 - 500) // 2
img_cropped = img.crop((0, y_offset, 1024, y_offset + 500))

output_path = "/home/stangorlini/.gemini/antigravity-ide/brain/8c22e501-072a-46f1-9e2b-1cdefc92afd7/feature_graphic_final.png"
img_cropped.save(output_path)
print(f"Saved exactly 1024x500 image to {output_path}")
