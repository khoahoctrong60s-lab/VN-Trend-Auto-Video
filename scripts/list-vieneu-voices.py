# list-vieneu-voices.py — liệt kê giọng mẫu có sẵn của VieNeu-TTS
from vieneu import Vieneu

v = Vieneu()
voices = v.list_preset_voices()
print(f"{len(voices)} giọng mẫu:")
for label, voice_id in voices:
    print(f" - {label} ({voice_id})")
