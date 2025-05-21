# Changelog

## v0.0.74 (2024-05-13)

### Fixed
- Fixed an issue with the api_usage_logs table creation in Supabase
- Added support for both `execute_sql` and `exec_sql` RPC functions
- Improved error handling in the logApiUsage method
- Added automatic table creation retry when logging fails due to missing table

### Changes
- The SDK will now try to use either `execute_sql` or `exec_sql` functions in Supabase
- Better error messages when neither function exists
- Added detailed logging to help troubleshoot database setup issues

### How to Update
If you were experiencing issues with the API usage logs not working, update to this version:

```bash
npm install @decloudlabs/sky-ai-accesspoint@0.0.74
```

If you still encounter issues, you can manually create the required tables by running the SQL in your Supabase SQL Editor:

```sql
-- Create the execute_sql function that the SDK needs
CREATE OR REPLACE FUNCTION execute_sql(sql_query TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  EXECUTE sql_query;
  result := '{"success": true}'::JSON;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  result := json_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the api_usage_logs table
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  service_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS api_usage_logs_api_key_idx ON api_usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS api_usage_logs_created_at_idx ON api_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS api_usage_logs_service_id_idx ON api_usage_logs(service_id);

-- Apply Row Level Security but allow service role full access
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_usage_logs_policy" ON api_usage_logs;
CREATE POLICY "service_role_usage_logs_policy" ON api_usage_logs
  USING (true)
  WITH CHECK (true);

-- Create function to update last_used_at timestamp on API key
CREATE OR REPLACE FUNCTION update_api_key_last_used()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE api_keys
  SET last_used_at = NOW()
  WHERE id = NEW.api_key_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that updates last_used_at automatically
DROP TRIGGER IF EXISTS update_api_key_last_used_trigger ON api_usage_logs;
CREATE TRIGGER update_api_key_last_used_trigger
AFTER INSERT ON api_usage_logs
FOR EACH ROW
EXECUTE FUNCTION update_api_key_last_used();
```

## v0.0.73 (2024-05-08)

Initial release with API key management and service tracking features. 