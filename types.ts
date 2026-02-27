export interface InsurancePolicy {
  dot: string;
  carrier: string;
  policyNumber: string;
  effectiveDate: string;
  coverageAmount: string;
  type: string;
  class: string;
}

export interface BasicScore {
  category: string;
  measure: string;
}

export interface OosRate {
  type: string;
  rate: string;
  nationalAvg: string;
}

export interface CarrierData {
  mcNumber: string;
  dotNumber: string;
  legalName: string;
  dbaName: string;
  entityType: string;
  status: string;
  email: string;
  phone: string;
  powerUnits: string;
  nonCmvUnits?: string;
  drivers: string;
  physicalAddress: string;
  mailingAddress: string;
  dateScraped: string;
  // Extended fields
  mcs150Date: string;
  mcs150Mileage: string;
  operationClassification: string[];
  carrierOperation: string[];
  cargoCarried: string[];
  outOfServiceDate: string;
  stateCarrierId: string;
  dunsNumber: string;
  // Safety & Insurance
  insurancePolicies?: InsurancePolicy[];
  safetyRating?: string;
  safetyRatingDate?: string;
  basicScores?: BasicScore[];
  oosRates?: OosRate[];
}

export interface ScraperConfig {
  startPoint: string;
  recordCount: number;
  includeCarriers: boolean;
  includeBrokers: boolean;
  onlyAuthorized: boolean;
  useMockData: boolean;
  useProxy: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: string;
  features: string[];
  recommended?: boolean;
}

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  plan: 'Free' | 'Starter' | 'Pro' | 'Enterprise';
  dailyLimit: number;
  recordsExtractedToday: number;
  lastActive: string;
  ipAddress: string;
  isOnline: boolean;
  isBlocked?: boolean;
}

export interface BlockedIP {
  ip: string;
  blockedAt: string;
  reason: string;
}

export type ViewState = 'dashboard' | 'scraper' | 'carrier-search' | 'insurance-scraper' | 'subscription' | 'settings' | 'admin' | 'fmcsa-register';

export interface FMCSARegisterEntry {
  number: string;
  title: string;
  decided: string;
  category: string;
}
