import urllib.request
import urllib.parse
import re
import os
from PIL import Image

def search_and_download(query, out_path, min_w=400, min_h=400):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    }
    url = f"https://www.bing.com/images/search?q={urllib.parse.quote(query)}&form=HDRSC2&first=1"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Error searching for {query}: {e}")
        return False

    murls = re.findall(r'murl&quot;:&quot;(https?://[^&]+)&quot;', html)
    if not murls:
        murls = re.findall(r'"murl":"(https?://[^"]+)"', html)

    print(f"Found {len(murls)} results for '{query}'")

    for idx, u in enumerate(murls[:12]):
        try:
            req_img = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req_img, timeout=8) as r:
                data = r.read()
            
            temp_file = out_path + f".tmp_{idx}.jpg"
            with open(temp_file, 'wb') as f:
                f.write(data)
            
            with Image.open(temp_file) as im:
                w, h = im.size
                if w >= min_w and h >= min_h:
                    print(f"  Success on result {idx}: {w}x{h} ({u[:70]})")
                    im.convert('RGB').save(out_path, quality=95)
                    os.remove(temp_file)
                    return True
            os.remove(temp_file)
        except Exception as e:
            # try next
            pass

    return False

if __name__ == '__main__':
    res = search_and_download("Sony WH-1000XM5 black white background official product", "d:/AWS2/scratch/test_sony_xm5.jpg")
    print("Result:", res)
