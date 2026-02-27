import { supabase } from './supabaseClient';

export interface FMCSARegisterEntry {
  id?: string;
  number: string;
  title: string;
  decided: string;
  category: string;
  date_fetched: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Save FMCSA Register entries to Supabase.
 */
export const saveFMCSARegisterEntries = async (
  entries: FMCSARegisterEntry[],
  fetchDate: string
): Promise<{ success: boolean; error?: string; count?: number }> => {
  try {
    if (!entries || entries.length === 0) {
      return { success: true, count: 0 };
    }

    // Prepare records for insertion
    const records = entries.map(entry => ({
      number: entry.number,
      title: entry.title,
      decided: entry.decided,
      category: entry.category,
      date_fetched: fetchDate,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    // Upsert to avoid duplicates
    const { data, error } = await supabase
      .from('fmcsa_register')
      .upsert(records, { onConflict: 'number,date_fetched' });

    if (error) {
      console.error('Supabase save error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, count: records.length };
  } catch (err: any) {
    console.error('Exception saving FMCSA entries:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Fetch FMCSA Register entries from Supabase with filters
 */
export const fetchFMCSARegisterEntries = async (filters?: {
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  searchTerm?: string;
  limit?: number;
}): Promise<FMCSARegisterEntry[]> => {
  try {
    let query = supabase
      .from('fmcsa_register')
      .select('*');

    // Apply filters
    if (filters?.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }

    if (filters?.dateFrom) {
      query = query.gte('date_fetched', filters.dateFrom);
    }

    if (filters?.dateTo) {
      query = query.lte('date_fetched', filters.dateTo);
    }

    if (filters?.searchTerm) {
      const searchPattern = `%${filters.searchTerm}%`;
      query = query.or(`number.ilike.${searchPattern},title.ilike.${searchPattern}`);
    }

    // Order by date and number
    query = query.order('date_fetched', { ascending: false }).order('number', { ascending: true });

    // Apply limit
    if (filters?.limit) {
      query = query.limit(filters.limit);
    } else {
      query = query.limit(500); // Default limit
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase fetch error:', error);
      return [];
    }

    return (data || []) as FMCSARegisterEntry[];
  } catch (err) {
    console.error('Exception fetching from Supabase:', err);
    return [];
  }
};

/**
 * Get entries for a specific date
 */
export const getFMCSAEntriesByDate = async (date: string): Promise<FMCSARegisterEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('fmcsa_register')
      .select('*')
      .eq('date_fetched', date)
      .order('number', { ascending: true });

    if (error) {
      console.error('Supabase fetch error:', error);
      return [];
    }

    return (data || []) as FMCSARegisterEntry[];
  } catch (err) {
    console.error('Exception fetching entries by date:', err);
    return [];
  }
};

/**
 * Get unique categories
 */
export const getFMCSACategories = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('fmcsa_register')
      .select('category')
      .neq('category', null);

    if (error) {
      console.error('Supabase fetch error:', error);
      return [];
    }

    // Extract unique categories
    const categories = new Set<string>();
    (data || []).forEach(record => {
      if (record.category) {
        categories.add(record.category);
      }
    });

    return Array.from(categories).sort();
  } catch (err) {
    console.error('Exception fetching categories:', err);
    return [];
  }
};

/**
 * Get statistics for a date range
 */
export const getFMCSAStatistics = async (dateFrom?: string, dateTo?: string): Promise<{
  totalEntries: number;
  byCategory: Record<string, number>;
  dateRange: { from: string; to: string };
}> => {
  try {
    let query = supabase
      .from('fmcsa_register')
      .select('*');

    if (dateFrom) {
      query = query.gte('date_fetched', dateFrom);
    }

    if (dateTo) {
      query = query.lte('date_fetched', dateTo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase fetch error:', error);
      return {
        totalEntries: 0,
        byCategory: {},
        dateRange: { from: dateFrom || '', to: dateTo || '' }
      };
    }

    // Calculate statistics
    const byCategory: Record<string, number> = {};
    (data || []).forEach(entry => {
      const cat = entry.category || 'UNCATEGORIZED';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    return {
      totalEntries: data?.length || 0,
      byCategory,
      dateRange: { from: dateFrom || '', to: dateTo || '' }
    };
  } catch (err) {
    console.error('Exception fetching statistics:', err);
    return {
      totalEntries: 0,
      byCategory: {},
      dateRange: { from: dateFrom || '', to: dateTo || '' }
    };
  }
};

/**
 * Delete old entries (for cleanup)
 */
export const deleteFMCSAEntriesBeforeDate = async (date: string): Promise<{ success: boolean; error?: string; deleted?: number }> => {
  try {
    const { data, error } = await supabase
      .from('fmcsa_register')
      .delete()
      .lt('date_fetched', date);

    if (error) {
      console.error('Supabase delete error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, deleted: data?.length || 0 };
  } catch (err: any) {
    console.error('Exception deleting entries:', err);
    return { success: false, error: err.message };
  }
};
