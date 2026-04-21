import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import puppeteer, { Browser } from 'puppeteer';
import http from 'http';

// 2126px width provides ~1200 DPI for an image printed at 45mm physical width.
const TARGET_WIDTH = 2126;

const filesToProcess = ['популярные.html', 'травоядные.html'];

async function buildPdfs(): Promise<void> {
  const tmpImagesDir = path.join(process.cwd(), 'src', '.tmp-images');
  
  // Ensure directories exist
  await fs.mkdir(tmpImagesDir, { recursive: true });
  await fs.mkdir(path.join(process.cwd(), 'build'), { recursive: true });

  // Create a simple HTTP server to serve the files for Windows Chrome
  const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      const urlPath = req.url ? decodeURI(req.url) : '';
      const filePath = path.join(process.cwd(), urlPath);
      const content = await fs.readFile(filePath);
      let contentType = 'text/html';

      if (filePath.endsWith('.webp')) {
        contentType = 'image/webp';
      } else if (filePath.endsWith('.jpg')) { 
        contentType = 'image/jpeg';
      } else if (filePath.endsWith('.png')) {
        contentType = 'image/png';
      }

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
    browser = await puppeteer.launch({ 
      headless: true,
      executablePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      userDataDir: 'C:\\Windows\\Temp\\puppeteer_user_data'
    });
    const page = await browser.newPage();

    for (const filename of filesToProcess) {
      console.log(`\nProcessing ${filename}...`);
      const sourceHtmlPath = path.join(process.cwd(), 'src', filename);
      const outputPdfName = filename.replace('.html', '.pdf');
      const outputPdfPath = path.join(process.cwd(), 'build', outputPdfName);

      const html = await fs.readFile(sourceHtmlPath, 'utf-8');
      const $ = cheerio.load(html);

      const images = $('img').toArray();

      for (const img of images) {
        const origSrc = $(img).attr('src');

        if (!origSrc) {
          continue;
        }

        const origImgPath = path.join(process.cwd(), 'src', origSrc);
        
        if (origImgPath.endsWith('.png') || origImgPath.endsWith('.jpg') || origImgPath.endsWith('.webp')) {
          const parsedPath = path.parse(origImgPath);
          const newImgName = `${parsedPath.name}.png`;
          const newImgPath = path.join(tmpImagesDir, newImgName);
          
          try {
            await fs.access(newImgPath);
          } catch {
            console.log(`  - Optimizing: ${parsedPath.base} -> ${newImgName}`);
            try {
              await sharp(origImgPath)
                .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
                .png({ effort: 10, compressionLevel: 9 })
                .toFile(newImgPath);
            } catch (err: any) {
              console.error(`    Error processing ${origImgPath}:`, err.message);
            }
          }
          $(img).attr('src', `.tmp-images/${newImgName}`);
        }
      }

      const tmpHtmlName = `.tmp-${filename}`;
      const tmpHtmlPath = path.join(process.cwd(), 'src', tmpHtmlName);
      await fs.writeFile(tmpHtmlPath, $.html());
      
      console.log(`  Generating PDF...`);
      await page.goto(`http://127.0.0.1:${port}/src/${encodeURIComponent(tmpHtmlName)}`, { waitUntil: 'networkidle0' });
      
      await page.pdf({
        path: outputPdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
      });
      
      console.log(`  PDF successfully created at: ${outputPdfPath}`);
      
      // Cleanup the temporary HTML file immediately after we're done with it
      await fs.unlink(tmpHtmlPath);
    }
  } catch (err: any) {
    console.error('Error during generation:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
    server.close();
    
    console.log('\nCleaning up temporary image files...');
    try {
      await fs.rm(tmpImagesDir, { recursive: true, force: true });
    } catch (cleanupErr: any) {
      console.error('Error cleaning up images:', cleanupErr);
    }
  }
}

buildPdfs().catch(console.error);
