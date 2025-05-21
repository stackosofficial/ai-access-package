"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceManagement = void 0;
class ServiceManagement {
    constructor(supabase) {
        this.supabase = supabase;
    }
    /**
     * Register a service for API usage tracking
     * This is only for logging and doesn't create a separate table
     */
    async registerService(serviceDetails) {
        // No need to persist services in database, just return the details
        // This is used purely for identification in logs
        return serviceDetails;
    }
}
exports.ServiceManagement = ServiceManagement;
