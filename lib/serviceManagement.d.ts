import { SupabaseClient } from '@supabase/supabase-js';
export interface ServiceDetails {
    id: string;
    name: string;
    url: string;
}
export declare class ServiceManagement {
    private supabase;
    constructor(supabase: SupabaseClient);
    /**
     * Register a service for API usage tracking
     * This is only for logging and doesn't create a separate table
     */
    registerService(serviceDetails: ServiceDetails): Promise<ServiceDetails>;
}
