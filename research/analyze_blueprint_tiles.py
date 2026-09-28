from pathlib import Path
from PIL import Image
import numpy as np

folder = Path('C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots')
samples = [
    ('raid_defibrillator', '20260927195813_1.jpg', (390, 315, 495, 421)),
    ('raid_other_1', '20260927195813_1.jpg', (169, 315, 274, 421)),
    ('raid_other_2', '20260927195813_1.jpg', (280, 315, 385, 421)),
    ('raid_aphelion', '20260927202155_1.jpg', (278, 315, 385, 421)),
    ('collection_blue', '20260928083711_1.jpg', (574, 338, 676, 440)),
    ('collection_empty', '20260928083711_1.jpg', (462, 338, 564, 440)),
]
for label, filename, box in samples:
    image = Image.open(folder / filename).convert('RGB').resize((2048, 1152))
    tile = np.asarray(image.crop(box)).astype(np.int16)
    r, g, b = tile[:,:,0], tile[:,:,1], tile[:,:,2]
    blue = (b > 45) & (b > r * 1.35) & (b > g * 1.12) & (g > 20)
    upper = blue[5:35,5:-5]
    lower = blue[45:85,5:-5]
    print(label, 'mean', tuple(np.mean(tile,axis=(0,1)).astype(int)), 'blue', round(float(np.mean(blue)),3), 'upper',round(float(np.mean(upper)),3),'lower',round(float(np.mean(lower)),3))
