// Simple script to generate PNG icons from SVG
// Requires: npm install sharp (or use the HTML converter instead)

const fs = require('fs');
const path = require('path');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)" rx="80"/>
  <rect x="80" y="100" width="352" height="280" fill="none" stroke="#e94560" stroke-width="16" rx="8"/>
  <rect x="100" y="120" width="312" height="240" fill="#0f3460" opacity="0.8" rx="4"/>
  <rect x="120" y="140" width="272" height="200" fill="#e94560" opacity="0.6" rx="4"/>
  <line x1="200" y1="160" x2="200" y2="300" stroke="#fff" stroke-width="8" opacity="0.5"/>
  <line x1="160" y1="200" x2="320" y2="200" stroke="#fff" stroke-width="8" opacity="0.5"/>
  <circle cx="380" cy="320" r="20" fill="#e94560"/>
  <line x1="360" y1="320" x2="400" y2="320" stroke="#fff" stroke-width="4"/>
  <line x1="380" y1="300" x2="380" y2="340" stroke="#fff" stroke-width="4"/>
</svg>`;

async function generateIcons() {
  try {
    const sharp = require('sharp');

    const sizes = [192, 512];
    for (const size of sizes) {
      await sharp(Buffer.from(svgContent))
        .resize(size, size)
        .png()
        .toFile(`icon-${size}.png`);
      console.log(`✓ Generated icon-${size}.png`);
    }
    console.log('\nAll icons generated successfully!');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('Sharp package not found. Please install it:');
      console.log('  npm install sharp');
      console.log('\nOr use the HTML converter:');
      console.log('  Open generate-icons.html in your browser');
    } else {
      console.error('Error:', error.message);
    }
  }
}

generateIcons();
