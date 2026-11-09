from PIL import Image

# Open the original generated image (which has the full logo but is 1024x1024)
img_path = "/home/stangorlini/.gemini/antigravity-ide/brain/8c22e501-072a-46f1-9e2b-1cdefc92afd7/aurtistic_promo_graphic_v3_1784495841215.png"
img = Image.open(img_path)

# Resize the logo to fit within the 500px height. We'll use 450px to leave some breathing room (margin).
target_height = 450
ratio = target_height / img.height
new_width = int(img.width * ratio)
img = img.resize((new_width, target_height), Image.Resampling.LANCZOS)

# Create a new black background image of exactly 1024x500
bg = Image.new('RGB', (1024, 500), (18, 18, 18)) # #121212

# Calculate position to paste the resized logo (centered horizontally and vertically)
x_offset = (1024 - new_width) // 2
y_offset = (500 - target_height) // 2

bg.paste(img, (x_offset, y_offset))

# Save the final image
output_path = "/home/stangorlini/.gemini/antigravity-ide/brain/8c22e501-072a-46f1-9e2b-1cdefc92afd7/feature_graphic_1024x500_fixed.png"
bg.save(output_path)
print(f"Saved exactly 1024x500 image to {output_path}")
