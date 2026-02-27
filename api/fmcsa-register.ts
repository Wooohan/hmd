import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Helper function to format date as DD-MMM-YY.
function formatDateForFMCSA(date: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
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
    const { date } = req.body;

    // Format date as DD-MMM-YY (e.g., 20-FEB-26).
    const registerDate = date || formatDateForFMCSA(new Date());

    const registerUrl = 'https://li-public.fmcsa.dot.gov/LIVIEW/PKG_register.prc_reg_detail';

    const params = new URLSearchParams();
    params.append('pd_date', registerDate);
    params.append('pv_vpath', 'LIVIEW');

    console.log(`Fetching FMCSA Register for date: ${registerDate}`);

    const response = await axios.post(registerUrl, params.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://li-public.fmcsa.dot.gov/LIVIEW/PKG_REGISTER.prc_reg_list',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://li-public.fmcsa.dot.gov'
      },
      timeout: 30000,
    });

    // Check if we got a valid response
    if (!response.data.toUpperCase().includes('FMCSA REGISTER')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid response from FMCSA',
        entries: []
      });
    }

    // Extract data using regex pattern matching
    const soup = cheerio.load(response.data);
    const rawText = soup.text();

    // Regex pattern: (MC|FF|MX)-digits followed by info until date
    const pattern = /((?:MC|FF|MX)-\d+)\s+(.*?)\s+(\d{2}\/\d{2}\/\d{4})/g;

    const entries: Array<{ number: string; title: string; decided: string; category: string }> = [];
    let match;

    while ((match = pattern.exec(rawText)) !== null) {
      const docket = match[1];
      const info = match[2].trim().replace(/\s+/g, ' ');
      const decidedDate = match[3];

      // Determine category by looking at the text before this entry
      const beforeIndex = match.index;
      const beforeText = rawText.substring(Math.max(0, beforeIndex - 500), beforeIndex).toUpperCase();

      let category = 'MISCELLANEOUS';
      const categoryPatterns: { [key: string]: string } = {
        'NAME CHANGE': 'NAME CHANGE',
        'CERTIFICATE, PERMIT, LICENSE': 'CERTIFICATE, PERMIT, LICENSE',
        'CERTIFICATE OF REGISTRATION': 'CERTIFICATE OF REGISTRATION',
        'DISMISSAL': 'DISMISSAL',
        'WITHDRAWAL': 'WITHDRAWAL',
        'REVOCATION': 'REVOCATION',
        'TRANSFERS': 'TRANSFERS',
        'GRANT DECISION NOTICES': 'GRANT DECISION NOTICES'
      };

      for (const [pattern, cat] of Object.entries(categoryPatterns)) {
        if (beforeText.includes(pattern)) {
          category = cat;
        }
      }

      entries.push({
        number: docket,
        title: info,
        decided: decidedDate,
        category: category
      });
    }

    // Remove duplicates
    const uniqueEntries = entries.filter((entry, index, self) =>
      index === self.findIndex((e) => e.number === entry.number && e.title === entry.title)
    );

    console.log(`Successfully extracted ${uniqueEntries.length} entries`);

    return res.status(200).json({
      success: true,
      count: uniqueEntries.length,
      date: registerDate,
      lastUpdated: new Date().toISOString(),
      entries: uniqueEntries
    });

  } catch (error: any) {
    console.error('FMCSA Register scrape error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to scrape FMCSA register data',
      details: error.message,
      entries: []
    });
  }
};
