-- 01-create-schemas.sql
-- Create database schemas for production-like structure

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS application;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS monitoring;

-- Set search path for convenience
ALTER DATABASE production_app SET search_path TO application, public;

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit.audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit.activity_log (
            table_name, 
            operation, 
            new_data, 
            changed_at,
            changed_by
        ) VALUES (
            TG_TABLE_NAME, 
            'INSERT', 
            row_to_json(NEW), 
            NOW(),
            current_user
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit.activity_log (
            table_name, 
            operation, 
            old_data,
            new_data, 
            changed_at,
            changed_by
        ) VALUES (
            TG_TABLE_NAME, 
            'UPDATE', 
            row_to_json(OLD),
            row_to_json(NEW), 
            NOW(),
            current_user
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit.activity_log (
            table_name, 
            operation, 
            old_data, 
            changed_at,
            changed_by
        ) VALUES (
            TG_TABLE_NAME, 
            'DELETE', 
            row_to_json(OLD), 
            NOW(),
            current_user
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Comment schemas for documentation
COMMENT ON SCHEMA application IS 'Core business logic and data tables';
COMMENT ON SCHEMA analytics IS 'Pre-computed views and analytical queries';  
COMMENT ON SCHEMA audit IS 'Change tracking and compliance logging';
COMMENT ON SCHEMA monitoring IS 'Performance metrics and health monitoring';
