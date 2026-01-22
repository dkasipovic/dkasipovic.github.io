# DocEdit

A simple, privacy-focused document editor that runs entirely in your browser. No server, no accounts, no tracking — just you and your documents.

![DocEdit Screenshot](https://img.shields.io/badge/Status-Ready-green) ![License](https://img.shields.io/badge/License-MIT-blue) ![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-orange)

## ✨ Features

- **100% Client-Side** — Everything runs in your browser. No backend required.
- **Local Storage** — Documents are saved automatically to your browser's localStorage.
- **Encrypted Sharing** — Share documents via URL with optional AES-256-GCM encryption.
- **Password Protection** — Encrypt shared documents with a password only you and your recipient know.
- **Dark/Light Themes** — Automatic theme detection with manual override.
- **Responsive Design** — Works on desktop, tablet, and mobile devices.
- **Zero Dependencies** — Single HTML file with no external JavaScript libraries.

## 🚀 Quick Start

### Option 1: Direct Use
Simply open `index.html` in any modern browser.

### Option 2: Local Server
```bash
# Python 3
python -m http.server 8000

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8000
```

Then navigate to `http://localhost:8000`

### Option 3: Deploy
Upload `index.html` to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- Any web server

## 🔐 How Sharing Works

### Unprotected Sharing
```
Document JSON → Gzip Compress → Base64 Encode → URL Hash
```

### Password-Protected Sharing
```
Document JSON → Gzip Compress → AES-256-GCM Encrypt → Base64 Encode → URL Hash
```

### Encryption Details
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2 with 100,000 iterations and SHA-256
- **Salt**: Random 16 bytes per share
- **IV**: Random 12 bytes per share
- **Implementation**: Native Web Crypto API

### URL Format
```
https://your-domain.com/index.html#<base64-encoded-payload>
```

The payload contains:
```json
{
  "e": true,      // encrypted flag
  "d": "..."      // compressed (and optionally encrypted) document data
}
```

## 📁 Data Storage

### Documents
Stored in `localStorage` under the key `docedit_documents`:
```typescript
interface Document {
  id: string;           // UUID
  title: string;        // Document title
  content: string;      // Document content
  createdAt: number;    // Unix timestamp
  modifiedAt: number;   // Unix timestamp
  isShared: boolean;    // Imported from shared link
  isEncrypted: boolean; // Was password-protected when imported
}
```

### Preferences
- `docedit_theme`: `"auto"` | `"light"` | `"dark"`
- `docedit_sort`: `"date"` | `"title"`

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + N` | Create new document |
| `Escape` | Close modals and panels |

## 🌐 Browser Support

Requires modern browser with support for:
- Web Crypto API
- CompressionStream / DecompressionStream
- CSS Grid and Flexbox
- localStorage

**Tested on:**
- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+

## 🎨 Customization

### Theming
Edit CSS variables in the `:root` and `[data-theme="dark"]` selectors:

```css
:root {
  --accent: #6366f1;        /* Primary accent color */
  --bg-primary: #ffffff;    /* Main background */
  --text-primary: #111111;  /* Main text color */
  /* ... */
}
```

### Branding
Replace the logo in the header:
```html
<div class="logo">
  <div class="logo-icon">✎</div>
  <span>YourAppName</span>
</div>
```

## 🔒 Security Considerations

1. **Client-Side Only**: All encryption/decryption happens in your browser. Keys never leave your device.

2. **URL Length Limits**: Very large documents may exceed URL length limits (~2000 chars for some browsers). Consider the content size when sharing.

3. **localStorage Limits**: Most browsers allow 5-10MB of localStorage. Clear old documents if you hit limits.

4. **Password Strength**: The encryption is only as strong as the password. Use strong, unique passwords for sensitive documents.

5. **No Recovery**: If you forget the password for an encrypted share link, the data cannot be recovered.

## 📝 License

MIT License — feel free to use, modify, and distribute.

## 🤝 Contributing

Contributions welcome! This is a single-file project, so keep changes focused and minimal.

---

**Made with ♥ for privacy-conscious writers**