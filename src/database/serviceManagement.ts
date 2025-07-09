import { SupabaseClient } from '@supabase/supabase-js';

export interface ServiceDetails {
  id: string;
  name: string;
  url: string;
}

export class ServiceManagement {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Register a service for API usage tracking
   * This is only for logging and doesn't create a separate table
   */
  async registerService(serviceDetails: ServiceDetails): Promise<ServiceDetails> {
    // No need to persist services in database, just return the details
    // This is used purely for identification in logs
    return serviceDetails;
  }
} 