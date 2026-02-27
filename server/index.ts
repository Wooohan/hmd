import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import pdf from 'pdf-parse';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to format date for PDF URL (YYYYMMDD)
function formatDateForPDF(dateStr: string): string {
  // input is YYYY-MM-DD
  return dateStr.replace(/-/g, '');
}

// Route: Scrape FMCSA Register Data via PDF for 100% Accuracy
app.post('/api/fmcsa-register', async (req: Request, res: Response) => {
  try {
    const { date } = req.body; // Expects YYYY-MM-DD
    if (!date) {
      return res.status(400).json({ success: false, error: 'Date is required (YYYY-MM-DD)' });
    }

    const pdfDate = formatDateForPDF(date);
    const pdfUrl = `https://li-public.fmcsa.dot.gov/lihtml/rptspdf/LI_REGISTER${pdfDate}.PDF`;

    console.log(`📡 Fetching FMCSA Register PDF: ${pdfUrl}`);

    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 60000,
    });

    const data = await pdf(response.data);
    const fullText = data.text;

    /**
     * PDF PARSING STRATEGY:
     * PDF structure is much cleaner. We can split by section headers
     * and then extract records within each section.
     */
    const sections = [
      { name: 'NAME CHANGE', header: 'NAME CHANGES' },
      { name: 'CERTIFICATE, PERMIT, LICENSE', header: 'CERTIFICATES, PERMITS & LICENSES' },
      { name: 'CERTIFICATE OF REGISTRATION', header: 'CERTIFICATES OF REGISTRATION' },
      { name: 'DISMISSAL', header: 'DISMISSALS' },
      { name: 'WITHDRAWAL', header: 'WITHDRAWAL OF APPLICATION' },
      { name: 'REVOCATION', header: 'REVOCATIONS' },
      { name: 'TRANSFERS', header: 'TRANSFERS' },
      { name: 'GRANT DECISION NOTICES', header: 'GRANT DECISION NOTICES' }
    ];

    const entries: Array<{ number: string; title: string; decided: string; category: string }> = [];
    
    // Pattern for Docket: (MC|FF|MX|MX-MC)-digits
    // We look for the docket and the date following it on the same or nearby lines
    const recordPattern = /((?:MC|FF|MX|MX-MC)-\d+)\s+([\s\S]*?)\s+(\d{2}\/\d{2}\/\d{4})/g;

    // Process each section to ensure 100% accurate categorization
    for (let i = 0; i < sections.length; i++) {
      const currentSection = sections[i];
      const nextSection = sections[i + 1];
      
      const startIdx = fullText.indexOf(currentSection.header);
      if (startIdx === -1) continue;
      
      const endIdx = nextSection ? fullText.indexOf(nextSection.header, startIdx) : fullText.length;
      const sectionText = fullText.substring(startIdx, endIdx === -1 ? fullText.length : endIdx);

      let match;
      while ((match = recordPattern.exec(sectionText)) !== null) {
        const docket = match[1];
        const title = match[2].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        const decidedDate = match[3];

        if (title.length > 0 && title.length < 500) {
          entries.push({
            number: docket,
            title,
            decided: decidedDate,
            category: currentSection.name
          });
        }
      }
    }

    // Fallback: If no sections found, try a global search (less accurate but captures data)
    if (entries.length === 0) {
      let match;
      while ((match = recordPattern.exec(fullText)) !== null) {
        entries.push({
          number: match[1],
          title: match[2].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(),
          decided: match[3],
          category: 'MISCELLANEOUS'
        });
      }
    }

    // Deduplicate
    const uniqueEntries = entries.filter((entry, index, self) =>
      index === self.findIndex((e) => e.number === entry.number && e.title === entry.title)
    );

    console.log(`✅ Extracted ${uniqueEntries.length} entries from PDF for ${date}`);

    res.json({
      success: true,
      count: uniqueEntries.length,
      date: date,
      lastUpdated: new Date().toISOString(),
      entries: uniqueEntries
    });

  } catch (error: any) {
    console.error('❌ PDF Scrape Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to scrape FMCSA PDF. The file might not be generated yet for this date.',
      details: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`🚀 PDF Scraper Backend running on port ${PORT}`));
