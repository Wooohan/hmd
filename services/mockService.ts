import { CarrierData, User, InsurancePolicy, BasicScore, OosRate, BlockedIP } from '../types';
import { fetchCarrierFromBackend, fetchSafetyFromBackend, fetchInsuranceFromBackend } from './backendService';

// === HELPER FUNCTIONS ===
const cleanText = (text: string | null | undefined): string => {
  if (!text) return '';
  // FIX: Replace newlines with spaces so the full address stays on one line in your CSV
  return text.replace(/\u00a0/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
};

const cfDecodeEmail = (encoded: string): string => {
  try {
    let email = "";
    const r = parseInt(encoded.substr(0, 2), 16);
    for (let n = 2; n < encoded.length; n += 2) {
      const c = parseInt(encoded.substr(n, 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch (e) {
    return "";
  }
};

const findValueByLabel = (doc: Document, label: string): string => {
  const ths = Array.from(doc.querySelectorAll('th'));
  const targetTh = ths.find(th => cleanText(th.textContent).includes(label));
  if (targetTh && targetTh.nextElementSibling) {
    const nextTd = targetTh.nextElementSibling;
    
    // FIX FOR ADDRESS & VERCEL BUILD:
    // 1. Cast to HTMLElement to allow access to .innerText (fixing the build error)
    // 2. Use .innerText instead of childNodes[0] to grab text after the <br> tag (fixing the missing city/zip)
    if (nextTd instanceof HTMLElement) {
      return cleanText(nextTd.innerText);
    }
    
    // Fallback if not an HTMLElement
    const val = nextTd.childNodes[0]?.textContent || nextTd.textContent;
    return cleanText(val);
  }
  return '';
};

// === NETWORK LAYER (FALLBACK) ===

const fetchUrl = async (targetUrl: string, useProxy: boolean): Promise<string | any | null> => {
  if (!useProxy) {
    try {
      const response = await fetch(targetUrl);
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        return contentType?.includes("application/json") ? await response.json() : await response.text();
      }
    } catch (error) { return null; }
  }

  const proxyGenerators = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  for (const generateProxyUrl of proxyGenerators) {
    try {
      const response = await fetch(generateProxyUrl(targetUrl));
      if (response.ok) {
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    } catch (error) {}
  }
  return null;
};

// === SCRAPER LOGIC (NOW USES BACKEND) ===

export const fetchSafetyData = async (dot: string): Promise<{ 
  rating: string, 
  ratingDate: string, 
  basicScores: BasicScore[], 
  oosRates: OosRate[] 
}> => {
  // Try backend first
  const backendResult = await fetchSafetyFromBackend(dot);
  if (backendResult) {
    return backendResult;
  }

  // Fallback to old proxy method
  const url = `https://ai.fmcsa.dot.gov/SMS/Carrier/${dot}/CompleteProfile.aspx`;
  const html = await fetchUrl(url, true);
  
  if (typeof html !== 'string') throw new Error("Could not fetch safety data");

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const ratingEl = doc.getElementById('Rating');
  const rating = ratingEl ? cleanText(ratingEl.textContent) : 'N/A';
  
  const ratingDateEl = doc.getElementById('RatingDate');
  const ratingDate = ratingDateEl 
    ? cleanText(ratingDateEl.textContent).replace('Rating Date:', '').replace('(', '').replace(')', '') 
    : 'N/A';

  const categories = ["Unsafe Driving", "Crash Indicator", "HOS Compliance", "Vehicle Maintenance", "Controlled Substances", "Hazmat Compliance", "Driver Fitness"];
  const basicScores: BasicScore[] = [];
  const sumDataRow = doc.querySelector('tr.sumData');
  
  if (sumDataRow) {
    const cells = Array.from(sumDataRow.querySelectorAll('td'));
    cells.forEach((cell, i) => {
      const valSpan = cell.querySelector('span.val');
      const val = valSpan ? cleanText(valSpan.textContent) : cleanText(cell.textContent);
      if (categories[i]) {
        basicScores.push({ category: categories[i], measure: val || '0.00' });
      }
    });
  }

  const oosRates: OosRate[] = [];
  const safetyDiv = doc.getElementById('SafetyRating');
  const oosTable = safetyDiv?.querySelector('table');
  if (oosTable) {
    const rows = Array.from(oosTable.querySelectorAll('tbody tr'));
    rows.forEach(row => {
      const cols = Array.from(row.querySelectorAll('th, td'));
      if (cols.length >= 3) {
        oosRates.push({
          type: cleanText(cols[0].textContent),
          rate: cleanText(cols[1].textContent),
          nationalAvg: cleanText(cols[2].textContent)
        });
      }
    });
  }

  return { rating, ratingDate, basicScores, oosRates };
};

const fetchCarrierEmailFromSMS = async (dotNumber: string, useProxy: boolean): Promise<string> => {
  if (!dotNumber || dotNumber === 'UNKNOWN' || dotNumber === '') return '';
  const smsUrl = `https://ai.fmcsa.dot.gov/SMS/Carrier/${dotNumber}/CarrierRegistration.aspx`;
  const result = await fetchUrl(smsUrl, useProxy);
  if (typeof result !== 'string') return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(result, 'text/html');
  const labels = doc.querySelectorAll('label');
  for (let i = 0; i < labels.length; i++) {
    if (labels[i].textContent?.includes('Email:')) {
      const parent = labels[i].parentElement;
      if (parent) {
        const cfEmail = parent.querySelector('[data-cfemail]');
        if (cfEmail) return cfDecodeEmail(cfEmail.getAttribute('data-cfemail') || '');
        const text = cleanText(parent.textContent?.replace('Email:', ''));
        if (text && text.includes('@')) return text;
      }
    }
  }
  return '';
};

export const scrapeRealCarrier = async (mcNumber: string, useProxy: boolean): Promise<CarrierData | null> => {
  // Try backend first
  const backendResult = await fetchCarrierFromBackend(mcNumber);
  if (backendResult) {
    return backendResult;
  }

  // Fallback to old proxy method
  const url = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=${mcNumber}`;
  const html = await fetchUrl(url, useProxy);
  if (typeof html !== 'string') return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  if (!doc.querySelector('center')) return null;

  const getVal = (label: string) => findValueByLabel(doc, label);

  const findMarked = (summary: string) => {
    const table = doc.querySelector(`table[summary="${summary}"]`);
    if (!table) return [];
    const res: string[] = [];
    table.querySelectorAll('td').forEach(cell => {
      if (cell.textContent?.trim() === 'X') {
        const next = cell.nextElementSibling;
        if (next) res.push(cleanText(next.textContent));
      }
    });
    return res;
  };

  const carrier: CarrierData = {
    mcNumber,
    dotNumber: getVal('USDOT Number:'),
    legalName: getVal('Legal Name:'),
    dbaName: getVal('DBA Name:'),
    entityType: getVal('Entity Type:'),
    status: getVal('Operating Authority Status:'),
    email: '', 
    phone: getVal('Phone:'),
    powerUnits: getVal('Power Units:'),
    drivers: getVal('Drivers:'),
    physicalAddress: getVal('Physical Address:'),
    mailingAddress: getVal('Mailing Address:'),
    dateScraped: new Date().toLocaleDateString('en-US'),
    mcs150Date: getVal('MCS-150 Form Date:'),
    mcs150Mileage: getVal('MCS-150 Mileage (Year):'),
    operationClassification: findMarked("Operation Classification"),
    carrierOperation: findMarked("Carrier Operation"),
    cargoCarried: findMarked("Cargo Carried"),
    outOfServiceDate: getVal('Out of Service Date:'),
    stateCarrierId: getVal('State Carrier ID Number:'),
    dunsNumber: getVal('DUNS Number:')
  };

  if (carrier.dotNumber) {
    carrier.email = await fetchCarrierEmailFromSMS(carrier.dotNumber, useProxy);
  }

  return carrier;
};

export const fetchInsuranceData = async (dot: string): Promise<{policies: InsurancePolicy[], raw: any}> => {
  // Try backend first
  const backendResult = await fetchInsuranceFromBackend(dot);
  if (backendResult) {
    return backendResult;
  }

  // Fallback to old proxy method
  const url = `https://searchcarriers.com/company/${dot}/insurances`;
  const result = await fetchUrl(url, true); 

  const extractedPolicies: InsurancePolicy[] = [];
  const rawData = result?.data || (Array.isArray(result) ? result : []);
  
  if (Array.isArray(rawData)) {
    rawData.forEach((p: any) => {
      const carrier = p.name_company || p.insurance_company || p.insurance_company_name || p.company_name || 'NOT SPECIFIED';
      const policyNumber = p.policy_no || p.policy_number || p.pol_num || 'N/A';
      const effectiveDate = p.effective_date ? p.effective_date.split(' ')[0] : 'N/A';

      let coverage = p.max_cov_amount || p.coverage_to || p.coverage_amount || 'N/A';
      if (coverage !== 'N/A' && !isNaN(Number(coverage))) {
        const num = Number(coverage);
        if (num < 10000 && num > 0) {
          coverage = `$${(num * 1000).toLocaleString()}`;
        } else {
          coverage = `$${num.toLocaleString()}`;
        }
      }

      let type = (p.ins_type_code || 'N/A').toString();
      if (type === '1') type = 'BI&PD';
      else if (type === '2') type = 'CARGO';
      else if (type === '3') type = 'BOND';

      let iClass = (p.ins_class_code || 'N/A').toString().toUpperCase();
      if (iClass === 'P') iClass = 'PRIMARY';
      else if (iClass === 'E') iClass = 'EXCESS';

      extractedPolicies.push({
        dot,
        carrier: carrier.toString().toUpperCase(),
        policyNumber: policyNumber.toString().toUpperCase(),
        effectiveDate,
        coverageAmount: coverage.toString(),
        type: type.toUpperCase(),
        class: iClass
      });
    });
  }

  return { policies: extractedPolicies, raw: result };
};

export const downloadCSV = (data: CarrierData[]) => {
  const headers = ['MC', 'DOT', 'Legal Name', 'Email', 'Phone', 'Status', 'Physical Address', 'MCS-150 Date'];
  const csvRows = data.map(row => [
    row.mcNumber,
    row.dotNumber,
    `"${row.legalName.replace(/"/g, '""')}"`,
    row.email,
    row.phone,
    `"${row.status.replace(/"/g, '""')}"`,
    `"${row.physicalAddress.replace(/"/g, '""')}"`,
    row.mcs150Date
  ]);
  const csvContent = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `carriers_batch_${Date.now()}.csv`;
  link.click();
};

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Admin User', email: 'wooohan3@gmail.com', role: 'admin', plan: 'Enterprise', dailyLimit: 100000, recordsExtractedToday: 450, lastActive: 'Now', ipAddress: '192.168.1.1', isOnline: true, isBlocked: false }
];

export const BLOCKED_IPS: BlockedIP[] = [];

export const generateMockCarrier = (mc: string, b: boolean): CarrierData => ({
  mcNumber: mc,
  dotNumber: (parseInt(mc)+1000000).toString(),
  legalName: `Carrier ${mc} Logistics`,
  dbaName: '',
  entityType: b ? 'BROKER' : 'CARRIER',
  status: 'AUTHORIZED',
  email: 'info@carrier.com',
  phone: '800-555-0199',
  powerUnits: '12',
  drivers: '14',
  physicalAddress: '100 Logistics Way, Houston, TX 77002',
  mailingAddress: '',
  dateScraped: '2024-01-01',
  mcs150Date: '2024-01-01',
  mcs150Mileage: '120,000 (2023)',
  operationClassification: [],
  carrierOperation: [],
  cargoCarried: [],
  outOfServiceDate: '',
  stateCarrierId: '',
  dunsNumber: ''
});
