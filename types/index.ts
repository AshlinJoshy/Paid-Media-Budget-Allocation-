export type Platform = 'meta' | 'google' | 'linkedin' | 'tiktok' | 'snapchat' | 'unknown';

export const PLATFORM_COLORS: Record<string, { row: string; badge: string; accent: string }> = {
  meta:     { row: 'bg-blue-50',   badge: 'bg-blue-600 text-white',    accent: 'border-l-[3px] border-blue-500' },
  google:   { row: 'bg-green-50',  badge: 'bg-green-600 text-white',   accent: 'border-l-[3px] border-green-500' },
  linkedin: { row: 'bg-sky-50',    badge: 'bg-sky-400 text-white',     accent: 'border-l-[3px] border-sky-400' },
  tiktok:   { row: 'bg-gray-50',   badge: 'bg-gray-400 text-white',    accent: 'border-l-[3px] border-gray-400' },
  snapchat: { row: 'bg-yellow-50', badge: 'bg-yellow-400 text-black',  accent: 'border-l-[3px] border-yellow-400' },
  unknown:  { row: 'bg-white',     badge: 'bg-slate-400 text-white',   accent: 'border-l-[3px] border-slate-400' },
};

export const DS_TO_PLATFORM: Record<string, Platform> = {
  FA: 'meta',
  AW: 'google',
  LI: 'linkedin',
  TT: 'tiktok',
  SC: 'snapchat',
};

// Both FA and AW confirmed working. Wrong field IDs were causing the AW license error.
export const DS_NAMES: Record<string, string> = {
  FA: 'Meta Ads',
  AW: 'Google Ads',
};

export function getPlatformFromSource(source: string): Platform {
  const s = source.toLowerCase();
  if (s.includes('meta') || s.includes('facebook') || s.includes('instagram')) return 'meta';
  if (s.includes('google')) return 'google';
  if (s.includes('linkedin')) return 'linkedin';
  if (s.includes('tiktok')) return 'tiktok';
  if (s.includes('snapchat')) return 'snapchat';
  return 'unknown';
}

export interface MarketingCampaign {
  id: string;
  entity: string;
  name: string;
  created_at: string;
  updated_at: string;
  assignments?: PaidAssignment[];
}

export interface PaidAssignment {
  id: string;
  marketing_campaign_id: string;
  supermetrics_campaign_id: string | null;
  paid_campaign_name: string | null;
  type: string;
  source: string;
  platform: string;
  start_month: string;
  start_date: string;
  status: string;
  campaign_status: string;
  budget_allocation: number;
  budget_spent: number;
  remaining: number;
  leads: number;
  cpl: number;
  last_synced: string | null;
  created_at: string;
  updated_at: string;
}

export interface DropdownOptions {
  entity: string[];
  status: string[];
  source: string[];
  start_month: string[];
}

export interface SupermetricsAccount {
  id: string;
  ds_id: string;
  ds_name: string;
  account_id: string;
  account_name: string;
  is_selected: boolean;
}

export interface CachedCampaign {
  id: string;
  ds_id: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  platform: string;
  spend: number;
  leads: number;
  conversions: number;
  last_updated: string;
}
