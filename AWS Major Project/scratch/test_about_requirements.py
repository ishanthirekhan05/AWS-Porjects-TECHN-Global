import os, re, sys, html
from html.parser import HTMLParser

class NavMenuParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_nav_menu = False
        self.current_a = None
        self.desktop_about_href = None
        self.desktop_about_classes = []
        self.mobile_about_href = None

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        classes = attr_dict.get('class', '').split()
        if 'nav-menu' in classes:
            self.in_nav_menu = True

        if tag == 'a':
            self.current_a = {
                'href': attr_dict.get('href', ''),
                'class': classes,
                'text': '',
                'in_nav': self.in_nav_menu,
                'is_mobile': 'mobile-nav-link' in classes
            }

    def handle_data(self, data):
        if self.current_a:
            self.current_a['text'] += data

    def handle_endtag(self, tag):
        if tag == 'a' and self.current_a:
            txt = self.current_a['text'].strip().lower()
            if 'about' in txt:
                if self.current_a['in_nav']:
                    self.desktop_about_href = self.current_a['href']
                    self.desktop_about_classes = self.current_a['class']
                if self.current_a['is_mobile']:
                    self.mobile_about_href = self.current_a['href']
            self.current_a = None
        if tag == 'ul' and self.in_nav_menu:
            self.in_nav_menu = False

def test_about_navigation():
    frontend_dir = 'd:/AWS2/frontend'
    pages = {
        'index.html': os.path.join(frontend_dir, 'index.html'),
        'products.html': os.path.join(frontend_dir, 'products.html'),
        'events.html': os.path.join(frontend_dir, 'events.html'),
        'cart.html': os.path.join(frontend_dir, 'cart.html'),
        'product.html': os.path.join(frontend_dir, 'product.html'),
        'about.html': os.path.join(frontend_dir, 'about.html')
    }

    print("=== 1. Checking Existence of All Pages ===")
    for name, path in pages.items():
        assert os.path.exists(path), f"Missing page: {name}"
        print(f"  [OK] {name} exists ({os.path.getsize(path)} bytes)")

    print("\n=== 2. Checking Desktop Nav 'About' Link in All Pages ===")
    for name, path in pages.items():
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        parser = NavMenuParser()
        parser.feed(content)
        
        href = parser.desktop_about_href
        print(f"  {name}: desktop nav 'About' href = '{href}'")
        assert href == 'about.html', f"Expected 'about.html' in desktop nav of {name}, but got '{href}'"
        
        # Check active state
        if name == 'about.html':
            assert 'active' in parser.desktop_about_classes, f"About link should be active on about.html"
            print("    [OK] 'About' link has 'active' class on about.html")
        else:
            assert 'active' not in parser.desktop_about_classes, f"About link should NOT be active on {name}"

    print("\n=== 3. Checking that index.html does NOT have id='about' ===")
    with open(pages['index.html'], 'r', encoding='utf-8') as f:
        content = f.read()
    assert 'id="about"' not in content, "index.html should NOT contain id='about'"
    assert "id='about'" not in content, "index.html should NOT contain id='about'"
    print("  [OK] index.html does NOT contain id='about'")

    print("\n=== 4. Checking Content Requirements on about.html ===")
    with open(pages['about.html'], 'r', encoding='utf-8') as f:
        raw_about_html = f.read()
    about_text = html.unescape(raw_about_html)
    
    requirements = [
        ("ShopEase introduction", ["Empowering Smarter Shopping", "At ShopEase", "curate genuine"]),
        ("Our Mission & Vision", ["Our Core Mission", "Authenticity Without Compromise", "Our Vision"]),
        ("Why ShopEase / Key Benefits", ["WHY SHOPEASE", "100% Genuine Certified", "Guaranteed Express Delivery", "Bank-Grade 256-Bit Security", "30-Day Hassle-Free Returns", "Transparent, Fair Pricing", "24/7 Dedicated Human Care"]),
        ("Quality Assurance Process", ["Our 4-Step Quality Assurance Process", "Direct Procurement", "Multi-Point Ingestion Check", "Tamper-Evident Packaging"]),
        ("Secure shopping/payment info", ["Financial & Transaction Security", "PCI-DSS Level 1", "256-Bit TLS 1.3 Encryption", "Zero Data Selling Policy"]),
        ("Customer support info", ["24/7 Live Chat Desk", "Email Concierge", "Toll-Free Helpline", "Frequently Asked Questions", "Track Orders"]),
        ("Professional footer", ["site-footer", "ShopEase Technologies Inc", "Terms of Service", "Privacy Policy", "Security & Compliance"])
    ]

    for req_name, tokens in requirements:
        for t in tokens:
            assert t in about_text, f"Missing token '{t}' for requirement '{req_name}' in about.html"
        print(f"  [OK] Requirement verified: {req_name}")

    print("\n=== 5. Checking Mobile Nav Links ===")
    for name in ['index.html', 'products.html', 'events.html', 'about.html', 'product.html']:
        with open(pages[name], 'r', encoding='utf-8') as f:
            content = f.read()
        parser = NavMenuParser()
        parser.feed(content)
        href = parser.mobile_about_href
        assert href == 'about.html', f"Expected 'about.html' in mobile drawer of {name}, got {href}"
        print(f"  {name}: mobile 'About' link points to '{href}'")

    print("\n=== 6. Simulating Bidirectional & Browser History Navigation ===")
    routes = [
        ('index.html', 'about.html'),
        ('products.html', 'about.html'),
        ('events.html', 'about.html'),
        ('about.html', 'index.html'),
        ('about.html', 'products.html'),
        ('about.html', 'events.html'),
    ]
    for src, target in routes:
        with open(pages[src], 'r', encoding='utf-8') as f:
            content = f.read()
        assert f'href="{target}"' in content, f"{src} does not contain link to {target}"
        print(f"  [OK] Route verified: {src} -> {target}")

    print("\nALL ABOUT NAVIGATION & CONTENT TESTS PASSED!")

if __name__ == '__main__':
    test_about_navigation()
