const puppeteer = require('puppeteer');
const path = require('path');

async function generatePDF() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox']
    });

    const page = await browser.newPage();

    // Load the local HTML file
    const htmlPath = path.join(__dirname, 'paper.html');
    console.log(`Loading ${htmlPath}...`);

    await page.goto(`file://${htmlPath}`, {
        waitUntil: 'networkidle0',
        timeout: 60000
    });

    // Wait for MathJax to render
    console.log('Waiting for MathJax...');
    await page.waitForFunction(() => {
        return typeof MathJax !== 'undefined' &&
               MathJax.startup &&
               MathJax.startup.promise;
    }, { timeout: 30000 }).catch(() => {
        console.log('MathJax check skipped');
    });

    // Additional wait for rendering
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('Generating PDF...');

    const pdfPath = path.join(__dirname, 'assets', 'docs', 'R-JEPA_Cybernetics_Paper.pdf');

    await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: {
            top: '20mm',
            bottom: '20mm',
            left: '20mm',
            right: '20mm'
        },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
            <div style="width: 100%; font-size: 9px; text-align: center; color: #666;">
                <span class="pageNumber"></span> / <span class="totalPages"></span>
            </div>
        `,
        preferCSSPageSize: false
    });

    console.log(`PDF saved to: ${pdfPath}`);

    await browser.close();
    console.log('Done!');
}

generatePDF().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
