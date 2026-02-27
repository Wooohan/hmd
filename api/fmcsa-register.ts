import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import pdf from 'pdf-parse';

// Helper function to format date for PDF URL (YYYYMMDD)
function formatDateForPDF(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

export default async (req: VercelRequest, res: VercelResponse) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    const recordPattern = /((?:MC|FF|MX|MX-MC)-\d+)\s+([\s\S]*?)\s+(\d{2}\/\d{2}\/\d{4})/g;

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

    const uniqueEntries = entries.filter((entry, index, self) =>
      index === self.findIndex((e) => e.number === entry.number && e.title === entry.title)
    );

    return res.status(200).json({
      success: true,
      count: uniqueEntries.length,
      date: date,
      lastUpdated: new Date().toISOString(),
      entries: uniqueEntries
    });

  } catch (error: any) {
    console.error('❌ PDF Scrape Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to scrape FMCSA PDF. The file might not be generated yet for this date.',
      details: error.message 
    });
  }
};
