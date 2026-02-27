import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to clean text
const cleanText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
};

// Helper function to decode CloudFlare protected emails
const cfDecodeEmail = (encoded: string): string => {
  try {
    let email = '';
    const r = parseInt(encoded.substr(0, 2), 16);
    for (let n = 2; n < encoded.length; n += 2) {
      const c = parseInt(encoded.substr(n, 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch (e) {
    return '';
  }
};

// Route 1: Scrape Carrier Data from SAFER
app.get('/api/scrape/carrier/:mcNumber', async (req: Request, res: Response) => {
  const { mcNumber } = req.params;
  const { useProxy } = req.query;

  try {
    const url = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=${mcNumber}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    
    // Check if carrier exists
    if (!$('center').length) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    // Helper to find value by label
    const findValueByLabel = (label: string): string => {
      let value = '';
      $('th, td').each((_, el) => {
        const text = cleanText($(el).text());
        if (text === label || text.includes(label)) {
          const nextTd = $(el).next('td');
          if (nextTd.length) {
            if (label.includes('Address')) {
              // Collect all text nodes and br-separated parts to build full address
              const parts: string[] = [];
              nextTd.contents().each((_, node) => {
                if (node.type === 'text') {
                  const t = cleanText($(node).text());
                  if (t) parts.push(t);
                } else if (node.type === 'tag' && (node as any).tagName?.toLowerCase() === 'br') {
                  // br acts as separator, already handled by collecting parts
                } else {
                  const t = cleanText($(node).text());
                  if (t) parts.push(t);
                }
              });
              // Join parts: first part is street, rest is city/state/zip
              value = parts.filter(Boolean).join(', ');
              if (!value) {
                value = cleanText(nextTd.html()?.replace(/<br\s*\/?>/gi, ', ') || '');
              }
            } else {
              value = cleanText(nextTd.text());
            }
            return false; // break
          }
        }
      });
      return value;
    };

    // Helper to find marked checkboxes
    const findMarked = (summary: string): string[] => {
      const results: string[] = [];
      $(`table[summary="${summary}"]`).find('td').each((_, el) => {
        if (cleanText($(el).text()) === 'X') {
          const next = $(el).next();
          if (next.length) {
            results.push(cleanText(next.text()));
          }
        }
      });
      return results;
    };

    const carrierData = {
      mcNumber,
      dotNumber: findValueByLabel('USDOT Number:'),
      legalName: findValueByLabel('Legal Name:'),
      dbaName: findValueByLabel('DBA Name:'),
      entityType: findValueByLabel('Entity Type:'),
      status: findValueByLabel('Operating Authority Status:'),
      phone: findValueByLabel('Phone:'),
      powerUnits: findValueByLabel('Power Units:'),
      nonCmvUnits: findValueByLabel('Non-CMV Units:'),
      drivers: findValueByLabel('Drivers:'),
      physicalAddress: findValueByLabel('Physical Address:'),
      mailingAddress: findValueByLabel('Mailing Address:'),
      dateScraped: new Date().toLocaleDateString('en-US'),
      mcs150Date: findValueByLabel('MCS-150 Form Date:'),
      mcs150Mileage: findValueByLabel('MCS-150 Mileage (Year):'),
      operationClassification: findMarked('Operation Classification'),
      carrierOperation: findMarked('Carrier Operation'),
      cargoCarried: findMarked('Cargo Carried'),
      outOfServiceDate: findValueByLabel('Out of Service Date:'),
      stateCarrierId: findValueByLabel('State Carrier ID Number:'),
      dunsNumber: findValueByLabel('DUNS Number:'),
      email: '',
    };

    // Fetch email if DOT number exists
    if (carrierData.dotNumber) {
      try {
        const emailUrl = `https://ai.fmcsa.dot.gov/SMS/Carrier/${carrierData.dotNumber}/CarrierRegistration.aspx`;
        const emailResponse = await axios.get(emailUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000,
        });

        const $email = cheerio.load(emailResponse.data);
        $email('label').each((_, el) => {
          if ($email(el).text().includes('Email:')) {
            const parent = $email(el).parent();
            const cfEmail = parent.find('[data-cfemail]');
            if (cfEmail.length) {
              carrierData.email = cfDecodeEmail(cfEmail.attr('data-cfemail') || '');
            } else {
              const text = cleanText(parent.text().replace('Email:', ''));
              if (text && text.includes('@')) {
                carrierData.email = text;
              }
            }
            return false;
          }
        });
      } catch (emailError) {
        console.error('Email fetch error:', emailError);
      }
    }

    res.json(carrierData);
  } catch (error: any) {
    console.error('Carrier scrape error:', error.message);
    res.status(500).json({ error: 'Failed to scrape carrier data', details: error.message });
  }
});

// Route 2: Scrape Safety Data from FMCSA SMS
app.get('/api/scrape/safety/:dotNumber', async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  try {
    const url = `https://ai.fmcsa.dot.gov/SMS/Carrier/${dotNumber}/CompleteProfile.aspx`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // 1. Safety Rating
    const ratingEl = $('#Rating');
    const rating = ratingEl.length ? cleanText(ratingEl.text()) : 'N/A';
    
    const ratingDateEl = $('#RatingDate');
    let ratingDate = 'N/A';
    if (ratingDateEl.length) {
      ratingDate = cleanText(ratingDateEl.text())
        .replace('Rating Date:', '')
        .replace('(', '')
        .replace(')', '')
        .trim();
    }

    // 2. BASIC Scores
    const categories = [
      'Unsafe Driving',
      'Crash Indicator',
      'HOS Compliance',
      'Vehicle Maintenance',
      'Controlled Substances',
      'Hazmat Compliance',
      'Driver Fitness'
    ];
    
    const basicScores: Array<{ category: string; measure: string }> = [];
    const sumDataRow = $('tr.sumData');
    
    if (sumDataRow.length) {
      sumDataRow.find('td').each((i, el) => {
        const valSpan = $(el).find('span.val');
        const val = valSpan.length ? cleanText(valSpan.text()) : cleanText($(el).text());
        if (categories[i]) {
          basicScores.push({
            category: categories[i],
            measure: val || '0'
          });
        }
      });
    }

    // 3. Out of Service Rates
    const oosRates: Array<{ type: string; rate: string; nationalAvg: string }> = [];
    const safetyDiv = $('#SafetyRating');
    
    if (safetyDiv.length) {
      const oosTable = safetyDiv.find('table').first();
      if (oosTable.length) {
        oosTable.find('tbody tr').each((_, row) => {
          const cols = $(row).find('th, td');
          if (cols.length >= 3) {
            oosRates.push({
              type: cleanText($(cols[0]).text()),
              rate: cleanText($(cols[1]).text()),
              nationalAvg: cleanText($(cols[2]).text())
            });
          }
        });
      }
    }

    res.json({
      rating,
      ratingDate,
      basicScores,
      oosRates
    });
  } catch (error: any) {
    console.error('Safety scrape error:', error.message);
    res.status(500).json({ error: 'Failed to scrape safety data', details: error.message });
  }
});

// Route 3: Scrape Insurance Data
app.get('/api/scrape/insurance/:dotNumber', async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  try {
    const url = `https://searchcarriers.com/company/${dotNumber}/insurances`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 15000,
    });

    const rawData = response.data?.data || (Array.isArray(response.data) ? response.data : []);
    const policies: any[] = [];

    if (Array.isArray(rawData)) {
      rawData.forEach((p: any) => {
        const carrier = p.name_company || p.insurance_company || p.insurance_company_name || p.company_name || 'NOT SPECIFIED';
        const policyNumber = p.policy_no || p.policy_number || p.pol_num || 'N/A';
        const effectiveDate = p.effective_date ? p.effective_date.split(' ')[0] : 'N/A';

        let coverage = p.max_cov_amount || p.coverage_to || p.coverage_amount || 'N/A';
        if (coverage !== 'N/A' && !isNaN(Number(coverage))) {
          const num = Number(coverage);
          if (num < 10000 && num > 0) {
            coverage = `$${num.toLocaleString()}`;
          } else if (num >= 10000) {
            coverage = `$${(num / 1000).toFixed(0)}K`;
          }
        }

        let type = (p.ins_type_code || 'N/A').toString();
        if (type === '1') type = 'BI&PD';
        else if (type === '2') type = 'CARGO';
        else if (type === '3') type = 'BOND';

        let iClass = (p.ins_class_code || 'N/A').toString().toUpperCase();
        if (iClass === 'P') iClass = 'PRIMARY';
        else if (iClass === 'E') iClass = 'EXCESS';

        policies.push({
          dot: dotNumber,
          carrier: carrier.toString().toUpperCase(),
          policyNumber: policyNumber.toString().toUpperCase(),
          effectiveDate,
          coverageAmount: coverage.toString(),
          type: type.toUpperCase(),
          class: iClass
        });
      });
    }

    res.json({ policies, raw: response.data });
  } catch (error: any) {
    console.error('Insurance scrape error:', error.message);
    res.status(500).json({ error: 'Failed to scrape insurance data', details: error.message });
  }
});

// Route 4: Scrape FMCSA Register Data (Fixed with working regex pattern)
app.post('/api/fmcsa-register', async (req: Request, res: Response) => {
  try {
    const { date } = req.body;
    
    // Format date as DD-MMM-YY (e.g., 20-FEB-26)
    const registerDate = date || formatDateForFMCSA(new Date());
    
    const registerUrl = 'https://li-public.fmcsa.dot.gov/LIVIEW/PKG_register.prc_reg_detail';
    
    const params = new URLSearchParams();
    params.append('pd_date', registerDate);
    params.append('pv_vpath', 'LIVIEW');

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

    // Extract data using regex pattern matching (from working Python code)
    const soup = cheerio.load(response.data);
    const rawText = soup.text();
    
    // Regex pattern: (MC|FF|MX)-digits followed by info until date
    const pattern = /((?:MC|FF|MX)-\d+)\s+(.*?)\s+(\d{2}\/\d{2}\/\d{4})/g;
    
    const entries: Array<{ number: string; title: string; decided: string; category: string }> = [];
    let match;
    
    while ((match = pattern.exec(rawText)) !== null) {
      const docket = match[1];
      const info = match[2].trim().replace(/\s+/g, ' ');
      const date = match[3];
      
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
        decided: date,
        category: category
      });
    }

    // Remove duplicates
    const uniqueEntries = entries.filter((entry, index, self) =>
      index === self.findIndex((e) => e.number === entry.number && e.title === entry.title)
    );

    res.json({
      success: true,
      count: uniqueEntries.length,
      date: registerDate,
      lastUpdated: new Date().toISOString(),
      entries: uniqueEntries
    });

  } catch (error: any) {
    console.error('FMCSA Register scrape error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to scrape FMCSA register data', 
      details: error.message,
      entries: []
    });
  }
});

// Helper function to format date as DD-MMM-YY
function formatDateForFMCSA(date: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'FMCSA Scraper Backend is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend proxy server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints:`);
  console.log(`   - GET /api/scrape/carrier/:mcNumber`);
  console.log(`   - GET /api/scrape/safety/:dotNumber`);
  console.log(`   - GET /api/scrape/insurance/:dotNumber`);
  console.log(`   - POST /api/fmcsa-register (with date in body)`);
});
