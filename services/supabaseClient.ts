import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface CarrierRecord {
  id?: string;
  mc_number: string;
  dot_number: string;
  legal_name: string;
  dba_name?: string;
  entity_type: string;
  status: string;
  email?: string;
  phone?: string;
  power_units?: string;
  drivers?: string;
  non_cmv_units?: string;
  physical_address?: string;
  mailing_address?: string;
  date_scraped: string;
  mcs150_date?: string;
  mcs150_mileage?: string;
  operation_classification?: string[];
  carrier_operation?: string[];
  cargo_carried?: string[];
  out_of_service_date?: string;
  state_carrier_id?: string;
  duns_number?: string;
  safety_rating?: string;
  safety_rating_date?: string;
  basic_scores?: any;
  oos_rates?: any;
  insurance_policies?: any;
  created_at?: string;
  updated_at?: string;
}

export const saveCarrierToSupabase = async (carrier: any): Promise<{ success: boolean; error?: string }> => {
  try {
    const record: CarrierRecord = {
      mc_number: carrier.mcNumber,
      dot_number: carrier.dotNumber,
      legal_name: carrier.legalName,
      dba_name: carrier.dbaName || null,
      entity_type: carrier.entityType,
      status: carrier.status,
      email: carrier.email || null,
      phone: carrier.phone || null,
      power_units: carrier.powerUnits || null,
      drivers: carrier.drivers || null,
      non_cmv_units: carrier.nonCmvUnits || null,
      physical_address: carrier.physicalAddress || null,
      mailing_address: carrier.mailingAddress || null,
      date_scraped: carrier.dateScraped,
      mcs150_date: carrier.mcs150Date || null,
      mcs150_mileage: carrier.mcs150Mileage || null,
      operation_classification: carrier.operationClassification || [],
      carrier_operation: carrier.carrierOperation || [],
      cargo_carried: carrier.cargoCarried || [],
      out_of_service_date: carrier.outOfServiceDate || null,
      state_carrier_id: carrier.stateCarrierId || null,
      duns_number: carrier.dunsNumber || null,
      safety_rating: carrier.safetyRating || null,
      safety_rating_date: carrier.safetyRatingDate || null,
      basic_scores: carrier.basicScores || null,
      oos_rates: carrier.oosRates || null,
      insurance_policies: carrier.insurancePolicies || null,
    };

    const { error } = await supabase
      .from('carriers')
      .upsert(record, { onConflict: 'mc_number' });

    if (error) {
      console.error('Supabase save error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Exception saving to Supabase:', err);
    return { success: false, error: err.message };
  }
};

export interface CarrierFilters {
  // Motor Carrier
  mcNumber?: string;
  dotNumber?: string;
  legalName?: string;
  active?: string;           // 'true' | 'false' | ''
  state?: string;
  hasEmail?: string;         // 'true' | 'false' | ''
  hasBoc3?: string;          // 'true' | 'false' | ''
  hasCompanyRep?: string;    // 'true' | 'false' | ''
  yearsInBusinessMin?: number;
  yearsInBusinessMax?: number;
  // Carrier Operation
  classification?: string[];
  carrierOperation?: string[];
  hazmat?: string;           // 'true' | 'false' | ''
  powerUnitsMin?: number;
  powerUnitsMax?: number;
  driversMin?: number;
  driversMax?: number;
  cargo?: string[];
  // Insurance Policy
  insuranceRequired?: string[];
  bipdMin?: number;
  bipdMax?: number;
  bipdOnFile?: string;       // '1' | '0' | ''
  cargoOnFile?: string;      // '1' | '0' | ''
  bondOnFile?: string;       // '1' | '0' | ''
  // Safety
  oosMin?: number;
  oosMax?: number;
  crashesMin?: number;
  crashesMax?: number;
  injuriesMin?: number;
  injuriesMax?: number;
  fatalitiesMin?: number;
  fatalitiesMax?: number;
  towawayMin?: number;
  towawayMax?: number;
  inspectionsMin?: number;
  inspectionsMax?: number;
  // Pagination
  limit?: number;
}

export const fetchCarriersFromSupabase = async (filters: CarrierFilters = {}): Promise<any[]> => {
  try {
    let query = supabase
      .from('carriers')
      .select('*');

    const isFiltered = Object.keys(filters).some(k => {
      const key = k as keyof CarrierFilters;
      const val = filters[key];
      if (key === 'limit') return false;
      if (Array.isArray(val)) return val.length > 0;
      return val !== undefined && val !== '';
    });

    // ── Motor Carrier filters ──────────────────────────────────────────────
    if (filters.mcNumber) {
      query = query.ilike('mc_number', `%${filters.mcNumber}%`);
    }
    if (filters.dotNumber) {
      query = query.ilike('dot_number', `%${filters.dotNumber}%`);
    }
    if (filters.legalName) {
      query = query.ilike('legal_name', `%${filters.legalName}%`);
    }
    if (filters.active === 'true') {
      query = query.ilike('status', '%AUTHORIZED%').not('status', 'ilike', '%NOT%');
    } else if (filters.active === 'false') {
      query = query.or('status.ilike.%NOT AUTHORIZED%,status.not.ilike.%AUTHORIZED%');
    }
    if (filters.state) {
      // Correct syntax for OR with ILIKE in PostgREST when using special characters like commas:
      // We must wrap the pattern in double quotes.
      const states = filters.state.split('|');
      const stateOrConditions = states.map(s => `physical_address.ilike."%, ${s}%"`).join(',');
      query = query.or(stateOrConditions);
    }
    if (filters.hasEmail === 'true') {
      query = query.not('email', 'is', null).neq('email', '');
    } else if (filters.hasEmail === 'false') {
      query = query.or('email.is.null,email.eq.');
    }
    if (filters.hasBoc3 === 'true') {
      query = query.contains('carrier_operation', ['BOC-3']);
    } else if (filters.hasBoc3 === 'false') {
      query = query.not('carrier_operation', 'cs', '{"BOC-3"}');
    }

    // ── Carrier Operation filters ──────────────────────────────────────────
    if (filters.classification && filters.classification.length > 0) {
      query = query.overlaps('operation_classification', filters.classification);
    }
    if (filters.carrierOperation && filters.carrierOperation.length > 0) {
      query = query.overlaps('carrier_operation', filters.carrierOperation);
    }
    if (filters.cargo && filters.cargo.length > 0) {
      query = query.overlaps('cargo_carried', filters.cargo);
    }
    if (filters.hazmat === 'true') {
      query = query.contains('cargo_carried', ['Hazardous Materials']);
    } else if (filters.hazmat === 'false') {
      query = query.not('cargo_carried', 'cs', '{"Hazardous Materials"}');
    }
    if (filters.powerUnitsMin !== undefined) {
      query = query.gte('power_units', filters.powerUnitsMin.toString());
    }
    if (filters.powerUnitsMax !== undefined) {
      query = query.lte('power_units', filters.powerUnitsMax.toString());
    }
    if (filters.driversMin !== undefined) {
      query = query.gte('drivers', filters.driversMin.toString());
    }
    if (filters.driversMax !== undefined) {
      query = query.lte('drivers', filters.driversMax.toString());
    }

    // ── Insurance filters ──────────────────────────────────────────────────
    if (filters.insuranceRequired && filters.insuranceRequired.length > 0) {
      // Filter by insurance type in the insurance_policies JSONB array
      const insuranceOrConditions = filters.insuranceRequired.map(type => `insurance_policies.cs.[{"type": "${type}"}]`).join(',');
      query = query.or(insuranceOrConditions);
    }
    if (filters.bipdOnFile === '1') {
      query = query.not('insurance_policies', 'is', null);
    }
    if (filters.cargoOnFile === '1') {
      query = query.not('insurance_policies', 'is', null);
    }
    if (filters.bondOnFile === '1') {
      query = query.not('insurance_policies', 'is', null);
    }

    // ── Ordering & limit ──────────────────────────────────────────────────
    query = query.order('created_at', { ascending: false });

    if (!isFiltered) {
      query = query.limit(200);
    } else if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase fetch error:', error);
      return [];
    }

    let results = (data || []).map((record: any) => ({
      mcNumber: record.mc_number,
      dotNumber: record.dot_number,
      legalName: record.legal_name,
      dbaName: record.dba_name,
      entityType: record.entity_type,
      status: record.status,
      email: record.email,
      phone: record.phone,
      powerUnits: record.power_units,
      drivers: record.drivers,
      non_cmv_units: record.non_cmv_units,
      physicalAddress: record.physical_address,
      mailingAddress: record.mailing_address,
      dateScraped: record.date_scraped,
      mcs150Date: record.mcs150_date,
      mcs150Mileage: record.mcs150_mileage,
      operationClassification: record.operation_classification || [],
      carrierOperation: record.carrier_operation || [],
      cargoCarried: record.cargo_carried || [],
      outOfServiceDate: record.out_of_service_date,
      stateCarrierId: record.state_carrier_id,
      dunsNumber: record.duns_number,
      safetyRating: record.safety_rating,
      safetyRatingDate: record.safety_rating_date,
      basicScores: record.basic_scores,
      oosRates: record.oos_rates,
      insurancePolicies: record.insurance_policies,
    }));

    // Post-fetch filtering for Years in Business (since mcs150_date is a string in various formats)
    if (filters.yearsInBusinessMin !== undefined || filters.yearsInBusinessMax !== undefined) {
      results = results.filter(carrier => {
        if (!carrier.mcs150Date || carrier.mcs150Date === 'N/A') return false;
        try {
          const date = new Date(carrier.mcs150Date);
          if (isNaN(date.getTime())) return false;
          const diffMs = Date.now() - date.getTime();
          const ageDate = new Date(diffMs);
          const years = Math.abs(ageDate.getUTCFullYear() - 1970);
          
          if (filters.yearsInBusinessMin !== undefined && years < filters.yearsInBusinessMin) return false;
          if (filters.yearsInBusinessMax !== undefined && years > filters.yearsInBusinessMax) return false;
          return true;
        } catch (e) {
          return false;
        }
      });
    }

    return results;
  } catch (err) {
    console.error('Exception fetching from Supabase:', err);
    return [];
  }
};

export const updateCarrierInsurance = async (dotNumber: string, insuranceData: any): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('carriers')
      .update({
        insurance_policies: insuranceData.policies,
        updated_at: new Date().toISOString(),
      })
      .eq('dot_number', dotNumber);

    if (error) {
      console.error('Supabase update error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Exception updating Supabase:', err);
    return { success: false, error: err.message };
  }
};

export const updateCarrierSafety = async (dotNumber: string, safetyData: any): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('carriers')
      .update({
        safety_rating: safetyData.rating,
        safety_rating_date: safetyData.ratingDate,
        basic_scores: safetyData.basicScores,
        oos_rates: safetyData.oosRates,
        updated_at: new Date().toISOString(),
      })
      .eq('dot_number', dotNumber);

    if (error) {
      console.error('Supabase safety update error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Exception updating safety data:', err);
    return { success: false, error: err.message };
  }
};
