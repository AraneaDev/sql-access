-- 02-create-tables.sql
-- Create production-like table structure

-- =====================
-- APPLICATION SCHEMA
-- =====================

-- Departments table
CREATE TABLE application.departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    budget DECIMAL(12,2),
    manager_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table (employees/customers)
CREATE TABLE application.users (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    department_id INTEGER REFERENCES application.departments(id),
    role VARCHAR(50),
    salary DECIMAL(10,2),
    hire_date DATE,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    login_count INTEGER DEFAULT 0,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product categories
CREATE TABLE application.product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_category_id INTEGER REFERENCES application.product_categories(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE application.products (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES application.product_categories(id),
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2),
    stock_quantity INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    weight_kg DECIMAL(8,3),
    dimensions_cm VARCHAR(50),
    tags TEXT[],
    search_vector tsvector,
    popularity_score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE application.orders (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES application.users(id),
    status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50),
    payment_status VARCHAR(20) DEFAULT 'pending',
    shipping_address JSONB,
    billing_address JSONB,
    notes TEXT,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_date TIMESTAMP,
    delivered_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items table
CREATE TABLE application.order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES application.orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES application.products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer support tickets
CREATE TABLE application.support_tickets (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES application.users(id),
    order_id INTEGER REFERENCES application.orders(id),
    subject VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open' 
        CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
    priority VARCHAR(10) DEFAULT 'medium' 
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_to INTEGER REFERENCES application.users(id),
    resolution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- =====================
-- AUDIT SCHEMA
-- =====================

-- Activity log for audit trail
CREATE TABLE audit.activity_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by VARCHAR(100) DEFAULT current_user
);

-- Query log for monitoring
CREATE TABLE audit.query_log (
    id SERIAL PRIMARY KEY,
    query_text TEXT NOT NULL,
    execution_time_ms INTEGER,
    rows_returned INTEGER,
    user_name VARCHAR(100),
    database_name VARCHAR(100),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    query_hash VARCHAR(64)
);

-- =====================
-- MONITORING SCHEMA
-- =====================

-- Performance metrics
CREATE TABLE monitoring.performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    metric_unit VARCHAR(20),
    tags JSONB,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Connection statistics
CREATE TABLE monitoring.connection_stats (
    id SERIAL PRIMARY KEY,
    active_connections INTEGER NOT NULL,
    idle_connections INTEGER NOT NULL,
    max_connections INTEGER NOT NULL,
    database_name VARCHAR(100),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Health checks
CREATE TABLE monitoring.health_checks (
    id SERIAL PRIMARY KEY,
    check_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'warning', 'critical', 'unknown')),
    message TEXT,
    response_time_ms INTEGER,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to relevant tables
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON application.departments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON application.users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON application.products 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON application.orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON application.support_tickets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add audit triggers for sensitive tables
CREATE TRIGGER audit_users_changes 
    AFTER INSERT OR UPDATE OR DELETE ON application.users 
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger();

CREATE TRIGGER audit_orders_changes 
    AFTER INSERT OR UPDATE OR DELETE ON application.orders 
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger();

-- Add table comments for documentation
COMMENT ON TABLE application.departments IS 'Organizational departments and budget information';
COMMENT ON TABLE application.users IS 'User accounts for employees and customers';
COMMENT ON TABLE application.products IS 'Product catalog with inventory and pricing';
COMMENT ON TABLE application.orders IS 'Customer orders and order management';
COMMENT ON TABLE application.order_items IS 'Individual line items within orders';
COMMENT ON TABLE application.support_tickets IS 'Customer support ticket tracking';
COMMENT ON TABLE audit.activity_log IS 'Audit trail of data changes';
COMMENT ON TABLE monitoring.performance_metrics IS 'Application and database performance metrics';
