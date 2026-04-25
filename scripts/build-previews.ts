import fs from 'fs/promises';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer';
import http from 'http';
import os from 'os';

// The same pages that are built as PDFs
const filesToProcess = [
  'популярные.html',
  'травоядные.html',
  'водные.html',
  'летающие.html'
];

// A4 Landscape dimensions (same viewport as build-pdf.ts)
const A4_WIDTH_PX = 1123;
const A4_HEIGHT_PX = 794;

// Lower scale factor for preview images (~96 DPI screen resolution)
const PREVIEW_SCALE_FACTOR = 1;

// JPEG quality for previews (lower = smaller file size)
const PREVIEW_QUALITY = 80;

// Output directory (committed to repo so GitHub can serve them in the README)
const PREVIEWS_DIR = path.join(process.cwd(), 'docs', 'previews');

async function buildPreviews(): Promise<void> {
  await fs.mkdir(PREVIEWS_DIR, { recursive: true });

  // Create a simple HTTP server to serve the source files
  const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      const urlPath = req.url ? decodeURI(req.url) : '';
      const filePath = path.join(process.cwd(), urlPath);
      const content = await fs.readFile(filePath);

      let contentType = 'text/html';
      if (filePath.endsWith('.webp')) contentType = 'image/webp';
      else if (filePath.endsWith('.jpg')) contentType = 'image/jpeg';
      else if (filePath.endsWith('.png')) contentType = 'image/png';
      else if (filePath.endsWith('.css')) contentType = 'text/css';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (err) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  let browser: Browser | undefined;
  try {
    const isWsl = os.release().toLowerCase().includes('microsoft');
    const launchOptions: any = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };

    if (isWsl) {
      console.log('Detected WSL environment. Using Windows Chrome...');
      launchOptions.executablePath = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
      launchOptions.userDataDir = 'C:\\Windows\\Temp\\puppeteer_user_data';
    } else {
      console.log('Detected Standard Environment. Using built-in Puppeteer Chromium...');
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    for (const filename of filesToProcess) {
      console.log(`\nProcessing ${filename}...`);
      const outputName = filename.replace('.html', '.jpg');
      const outputPath = path.join(PREVIEWS_DIR, outputName);

      const htmlContent = await fs.readFile(path.join(process.cwd(), 'src', filename), 'utf-8');
      const isPortrait = htmlContent.includes('portrait');

      const currentWidthPx = isPortrait ? A4_HEIGHT_PX : A4_WIDTH_PX;
      const currentHeightPx = isPortrait ? A4_WIDTH_PX : A4_HEIGHT_PX;

      await page.setViewport({
        width: currentWidthPx,
        height: currentHeightPx,
        deviceScaleFactor: PREVIEW_SCALE_FACTOR
      });

      console.log(`  Loading page...`);
      await page.goto(`http://127.0.0.1:${port}/src/${encodeURIComponent(filename)}`, { waitUntil: 'networkidle0' });

      console.log(`  Taking preview screenshot (${currentWidthPx}x${currentHeightPx}px)...`);
      const jpegBuffer = await page.screenshot({
        type: 'jpeg',
        quality: PREVIEW_QUALITY,
      });

      await fs.writeFile(outputPath, jpegBuffer);

      const stat = await fs.stat(outputPath);
      console.log(`  Preview saved: ${outputPath}`);
      console.log(`  File size: ${(stat.size / 1024).toFixed(1)} KB`);
    }

    console.log('\nAll previews generated successfully.');
  } catch (err: any) {
    console.error('Error during preview generation:', err);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
    server.close();
  }
}

buildPreviews().catch(console.error);
