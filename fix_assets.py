import os
from rembg import remove

# Explicitly check these
files = [
    "assets/car.png",
    "assets/trailer.png",
    "assets/tumbleweed.png",
    "assets/rock.png",
    "assets/turtle.png",
    "assets/tree.png",
    "assets/ufo.png"
]

print("Starting cleanup...")

for path in files:
    if os.path.exists(path):
        print(f"Processing {path}...")
        try:
            with open(path, "rb") as f:
                input_data = f.read()
            
            output_data = remove(input_data)
            
            with open(path, "wb") as f:
                f.write(output_data)
            print(f"Fixed {path}")
        except Exception as e:
            print(f"Error on {path}: {e}")
    else:
        print(f"File not found: {path}")

print("Cleanup finished.")
