import fs from 'fs/promises';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer';
import http from 'http';
import os from 'os';
import { PDFDocument } from 'pdf-lib';

const filesToProcess = [
  'популярные.html', 
  'травоядные.html', 
  'водные.html'
];

// A4 Landscape dimensions
const A4_WIDTH_PX = 1123;
const A4_HEIGHT_PX = 794;
const A4_WIDTH_PT = 841.89;
const A4_HEIGHT_PT = 595.28;

// Scale factor: 6.25 gives roughly 600 DPI (7018 x 4962 pixels).
// 7.2 gives roughly 691 DPI (8085 x 5716 pixels), which is the maximum safe value
// before exceeding common GPU maximum texture limits (8192px).
const SCALE_FACTOR = 6.25;

async function buildPdfs(): Promise<void> {
  await fs.mkdir(path.join(process.cwd(), 'build'), { recursive: true });

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
      const outputPdfName = filename.replace('.html', '.pdf');
      const outputPdfPath = path.join(process.cwd(), 'build', outputPdfName);

      const htmlContent = await fs.readFile(path.join(process.cwd(), 'src', filename), 'utf-8');
      const isPortrait = htmlContent.includes('portrait');
      
      const currentWidthPx = isPortrait ? A4_HEIGHT_PX : A4_WIDTH_PX;
      const currentHeightPx = isPortrait ? A4_WIDTH_PX : A4_HEIGHT_PX;
      const currentWidthPt = isPortrait ? A4_HEIGHT_PT : A4_WIDTH_PT;
      const currentHeightPt = isPortrait ? A4_WIDTH_PT : A4_HEIGHT_PT;

      await page.setViewport({ 
        width: currentWidthPx, 
        height: currentHeightPx, 
        deviceScaleFactor: SCALE_FACTOR 
      });

      console.log(`  Loading page...`);
      await page.goto(`http://127.0.0.1:${port}/src/${encodeURIComponent(filename)}`, { waitUntil: 'networkidle0' });
      
      console.log(`  Taking High-Res JPEG screenshot (Scale Factor: ${SCALE_FACTOR})...`);
      // Capture the screenshot as a JPEG buffer
      // Not using fullPage: true ensures we get exactly the A4 viewport
      const jpegBuffer = await page.screenshot({ 
        type: 'jpeg', 
        quality: 95,
      });

      console.log(`  Wrapping screenshot into PDF...`);
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      const image = await pdfDoc.embedJpg(jpegBuffer);
      
      // Add a page with the correct dimensions
      const pdfPage = pdfDoc.addPage([currentWidthPt, currentHeightPt]);
      
      // Draw the image onto the entire page
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width: currentWidthPt,
        height: currentHeightPt
      });
      
      // Save the PDF
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPdfPath, pdfBytes);
      
      console.log(`  PDF successfully created at: ${outputPdfPath}`);
      console.log(`  Final File Size: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);
    }
  } catch (err: any) {
    console.error('Error during generation:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
    server.close();
  }
}

buildPdfs().catch(console.error);
