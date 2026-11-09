import os

colors = {
    "usp": "#4da8ff",
    "hub": "#9D4EDD",
    "urgente": "#F14343",
    "livros": "#FFCC00",
    "filmes": "#FFE066",
    "tatuagens": "#D39BFE",
    "cin": "#E0E0E0",
    "compras": "#69F0AE",
    "stangorlini": "#3b82f6",
    "fotografia": "#ec4899",
    "hobbys": "#0f9d58",
    "default": "#FFCC00"
}

template = """<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#22{hex}" />
    <corners android:radius="24dp" />
    <stroke android:width="1dp" android:color="#40{hex}" />
</shape>
"""

paths = [
    "/home/stangorlini/stangorlini.web/Aurtistic/android/app/src/main/res/drawable",
    "/home/stangorlini/stangorlini.web/android/app/src/main/res/drawable"
]

for path in paths:
    for name, hexcode in colors.items():
        hex_val = hexcode.replace("#", "").upper()
        content = template.format(hex=hex_val)
        file_path = os.path.join(path, f"widget_item_bg_{name}.xml")
        with open(file_path, "w") as f:
            f.write(content)

print("Generated drawables.")
