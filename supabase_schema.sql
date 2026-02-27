-- Supabase Database Schema for FMCSA Carrier Data
-- Run this SQL in your Supabase SQL Editor to create the carriers table

CREATE TABLE IF NOT EXISTS carriers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mc_number TEXT NOT NULL UNIQUE,
    dot_number TEXT NOT NULL,
    legal_name TEXT NOT NULL,
    dba_name TEXT,
    entity_type TEXT,
    status TEXT,
    email TEXT,
    phone TEXT,
    power_units TEXT,
    drivers TEXT,
    physical_address TEXT,
    mailing_address TEXT,
    date_scraped TEXT,
    mcs150_date TEXT,
    mcs150_mileage TEXT,
    operation_classification TEXT[],
    carrier_operation TEXT[],
    cargo_carried TEXT[],
    out_of_service_date TEXT,
    state_carrier_id TEXT,
    duns_number TEXT,
    safety_rating TEXT,
    safety_rating_date TEXT,
    basic_scores JSONB,
    oos_rates JSONB,
    insurance_policies JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on mc_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_carriers_mc_number ON carriers(mc_number);

-- Create index on dot_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_carriers_dot_number ON carriers(dot_number);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_carriers_created_at ON carriers(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Enable all access for authenticated users" ON carriers
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Create policy to allow read access for anonymous users
CREATE POLICY "Enable read access for anonymous users" ON carriers
    FOR SELECT
    USING (true);

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_carriers_updated_at BEFORE UPDATE ON carriers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE carriers IS 'FMCSA carrier data with insurance and safety information';
COMMENT ON COLUMN carriers.mc_number IS 'MC/MX Number - Unique identifier';
COMMENT ON COLUMN carriers.dot_number IS 'USDOT Number';
COMMENT ON COLUMN carriers.insurance_policies IS 'JSON array of insurance policies';
COMMENT ON COLUMN carriers.basic_scores IS 'JSON array of BASIC performance scores';
COMMENT ON COLUMN carriers.oos_rates IS 'JSON array of Out-of-Service rates';




















--carrier sql

CREATE TABLE IF NOT EXISTS carriers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mc_number TEXT NOT NULL UNIQUE,
    dot_number TEXT NOT NULL,
    legal_name TEXT NOT NULL,
    dba_name TEXT,
    entity_type TEXT,
    status TEXT,
    email TEXT,
    phone TEXT,
    power_units TEXT,
    drivers TEXT,
    physical_address TEXT,
    mailing_address TEXT,
    date_scraped TEXT,
    mcs150_date TEXT,
    mcs150_mileage TEXT,
    operation_classification TEXT[],
    carrier_operation TEXT[],
    cargo_carried TEXT[],
    out_of_service_date TEXT,
    state_carrier_id TEXT,
    duns_number TEXT,
    safety_rating TEXT,
    safety_rating_date TEXT,
    basic_scores JSONB,
    oos_rates JSONB,
    insurance_policies JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on mc_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_carriers_mc_number ON carriers(mc_number);

-- Create index on dot_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_carriers_dot_number ON carriers(dot_number);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_carriers_created_at ON carriers(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Enable all access for authenticated users" ON carriers
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Create policy to allow read access for anonymous users
CREATE POLICY "Enable read access for anonymous users" ON carriers
    FOR SELECT
    USING (true);

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_carriers_updated_at BEFORE UPDATE ON carriers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE carriers IS 'FMCSA carrier data with insurance and safety information';
COMMENT ON COLUMN carriers.mc_number IS 'MC/MX Number - Unique identifier';
COMMENT ON COLUMN carriers.dot_number IS 'USDOT Number';
COMMENT ON COLUMN carriers.insurance_policies IS 'JSON array of insurance policies';
COMMENT ON COLUMN carriers.basic_scores IS 'JSON array of BASIC performance scores';
COMMENT ON COLUMN carriers.oos_rates IS 'JSON array of Out-of-Service rates';




--Ip and user blockage


-- Supabase Database Schema for Users and Blocked IPs
-- Run this SQL in your Supabase SQL Editor to create the tables

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    plan TEXT NOT NULL DEFAULT 'Free' CHECK (plan IN ('Free', 'Starter', 'Pro', 'Enterprise')),
    daily_limit INTEGER NOT NULL DEFAULT 50,
    records_extracted_today INTEGER NOT NULL DEFAULT 0,
    last_active TEXT DEFAULT 'Never',
    ip_address TEXT,
    is_online BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Blocked IPs Table
CREATE TABLE IF NOT EXISTS blocked_ips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address TEXT NOT NULL UNIQUE,
    reason TEXT,
    blocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    blocked_by TEXT
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip_address);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Enable all access for authenticated users" ON users
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable read access for anonymous users" ON users
    FOR SELECT
    USING (true);

-- Create policies for blocked_ips table
CREATE POLICY "Enable all access for blocked_ips" ON blocked_ips
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable read access for blocked_ips" ON blocked_ips
    FOR SELECT
    USING (true);

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_users_updated_at_column();

-- Insert default admin user (only if not exists)
INSERT INTO users (user_id, name, email, role, plan, daily_limit, records_extracted_today, ip_address, is_online, is_blocked)
VALUES ('1', 'Admin User', 'wooohan3@gmail.com', 'admin', 'Enterprise', 100000, 0, '192.168.1.1', false, false)
ON CONFLICT (email) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts for FreightIntel AI application';
COMMENT ON TABLE blocked_ips IS 'Blocked IP addresses for security';
COMMENT ON COLUMN users.user_id IS 'Application-level unique user ID';
COMMENT ON COLUMN users.role IS 'User role: user or admin';
COMMENT ON COLUMN users.plan IS 'Subscription plan: Free, Starter, Pro, Enterprise';
COMMENT ON COLUMN users.daily_limit IS 'Maximum MC records allowed per day';
COMMENT ON COLUMN users.is_blocked IS 'Whether the user is blocked from accessing the system';




