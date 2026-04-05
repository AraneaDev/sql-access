/**
 * Sample SQL queries for testing various scenarios
 */
export class SampleQueries {
  /**
   * Basic SELECT queries
   */
  static readonly basicQueries = {
    simple: 'SELECT * FROM users',
    withLimit: 'SELECT * FROM users LIMIT 10',
    withWhere: 'SELECT id, name FROM users WHERE id = 1',
    withOrderBy: 'SELECT * FROM users ORDER BY name ASC',
    withGroupBy: 'SELECT COUNT(*) as user_count FROM users GROUP BY created_at::date',
  };

  /**
   * JOIN queries of varying complexity
   */
  static readonly joinQueries = {
    simple: 'SELECT u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id',
    leftJoin:
      'SELECT u.name, COUNT(p.id) as post_count FROM users u LEFT JOIN posts p ON u.id = p.user_id GROUP BY u.id, u.name',
    multipleJoins: `
 SELECT u.name, p.title, c.content as comment 
 FROM users u 
 JOIN posts p ON u.id = p.user_id 
 JOIN comments c ON p.id = c.post_id
 `,
    complexJoins: `
 SELECT 
 u.name,
 p.title,
 COUNT(c.id) as comment_count,
 AVG(c.score) as avg_comment_score
 FROM users u
 INNER JOIN posts p ON u.id = p.user_id
 LEFT JOIN comments c ON p.id = c.post_id
 LEFT JOIN likes l ON p.id = l.post_id
 GROUP BY u.id, u.name, p.id, p.title
 HAVING COUNT(c.id) > 0
 ORDER BY avg_comment_score DESC
 `,
  };

  /**
   * Subquery examples
   */
  static readonly subqueryQueries = {
    simpleSubquery: 'SELECT * FROM users WHERE id IN (SELECT user_id FROM posts)',
    correlatedSubquery:
      'SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM posts p WHERE p.user_id = u.id)',
    nestedSubqueries: `
 SELECT name FROM users 
 WHERE id IN (
 SELECT user_id FROM posts 
 WHERE id IN (
 SELECT post_id FROM comments 
 WHERE score > 5
 )
 )
 `,
    subqueryInFrom: `
 SELECT avg_scores.user_id, avg_scores.average_score
 FROM (
 SELECT user_id, AVG(score) as average_score
 FROM posts
 GROUP BY user_id
 ) as avg_scores
 WHERE avg_scores.average_score > 50
 `,
  };

  /**
   * UNION queries
   */
  static readonly unionQueries = {
    simple: 'SELECT name FROM users UNION SELECT title as name FROM posts',
    unionAll: 'SELECT name FROM users UNION ALL SELECT title as name FROM posts',
    multipleUnions: `
 SELECT name, 'user' as type FROM users
 UNION
 SELECT title as name, 'post' as type FROM posts
 UNION
 SELECT content as name, 'comment' as type FROM comments
 `,
  };

  /**
   * Common Table Expressions (WITH clauses)
   */
  static readonly cteQueries = {
    simple: `
 WITH user_stats AS (
 SELECT user_id, COUNT(*) as post_count
 FROM posts
 GROUP BY user_id
 )
 SELECT u.name, us.post_count
 FROM users u
 JOIN user_stats us ON u.id = us.user_id
 `,
    recursive: `
 WITH RECURSIVE category_tree AS (
 SELECT id, name, parent_id, 1 as level
 FROM categories
 WHERE parent_id IS NULL
 
 UNION ALL
 
 SELECT c.id, c.name, c.parent_id, ct.level + 1
 FROM categories c
 JOIN category_tree ct ON c.parent_id = ct.id
 )
 SELECT * FROM category_tree ORDER BY level, name
 `,
    multipleCTEs: `
 WITH 
 active_users AS (
 SELECT * FROM users WHERE last_login > NOW() - INTERVAL '30 days'
 ),
 popular_posts AS (
 SELECT * FROM posts WHERE score > 50
 )
 SELECT au.name, pp.title
 FROM active_users au
 JOIN popular_posts pp ON au.id = pp.user_id
 `,
  };

  /**
   * Window function queries
   */
  static readonly windowQueries = {
    ranking: `
 SELECT 
 name,
 score,
 ROW_NUMBER() OVER (ORDER BY score DESC) as rank,
 RANK() OVER (ORDER BY score DESC) as dense_rank
 FROM users
 `,
    partitioned: `
 SELECT 
 user_id,
 title,
 score,
 AVG(score) OVER (PARTITION BY user_id) as user_avg_score,
 score - AVG(score) OVER (PARTITION BY user_id) as score_diff
 FROM posts
 `,
    leadLag: `
 SELECT 
 created_at,
 score,
 LAG(score, 1) OVER (ORDER BY created_at) as prev_score,
 LEAD(score, 1) OVER (ORDER BY created_at) as next_score
 FROM posts
 ORDER BY created_at
 `,
  };

  /**
   * Complex analytical queries
   */
  static readonly analyticalQueries = {
    timeSeriesAnalysis: `
 WITH daily_stats AS (
 SELECT 
 DATE(created_at) as date,
 COUNT(*) as post_count,
 AVG(score) as avg_score,
 MAX(score) as max_score
 FROM posts
 WHERE created_at >= NOW() - INTERVAL '30 days'
 GROUP BY DATE(created_at)
 ),
 moving_averages AS (
 SELECT 
 date,
 post_count,
 avg_score,
 AVG(post_count) OVER (
 ORDER BY date 
 ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
 ) as seven_day_avg_posts,
 AVG(avg_score) OVER (
 ORDER BY date 
 ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
 ) as seven_day_avg_score
 FROM daily_stats
 )
 SELECT * FROM moving_averages ORDER BY date
 `,
    cohortAnalysis: `
 WITH user_cohorts AS (
 SELECT 
 user_id,
 DATE_TRUNC('month', MIN(created_at)) as cohort_month
 FROM posts
 GROUP BY user_id
 ),
 monthly_activity AS (
 SELECT 
 uc.cohort_month,
 DATE_TRUNC('month', p.created_at) as activity_month,
 COUNT(DISTINCT p.user_id) as active_users
 FROM user_cohorts uc
 JOIN posts p ON uc.user_id = p.user_id
 GROUP BY uc.cohort_month, DATE_TRUNC('month', p.created_at)
 ),
 cohort_sizes AS (
 SELECT 
 cohort_month,
 COUNT(DISTINCT user_id) as cohort_size
 FROM user_cohorts
 GROUP BY cohort_month
 )
 SELECT 
 ma.cohort_month,
 ma.activity_month,
 ma.active_users,
 cs.cohort_size,
 ROUND(100.0 * ma.active_users / cs.cohort_size, 2) as retention_rate
 FROM monthly_activity ma
 JOIN cohort_sizes cs ON ma.cohort_month = cs.cohort_month
 ORDER BY ma.cohort_month, ma.activity_month
 `,
  };

  /**
   * Modification queries (will be blocked in SELECT-only mode)
   */
  static readonly modificationQueries = {
    insert: "INSERT INTO users (name, email) VALUES ('New User', 'new@example.com')",
    insertMultiple: `
 INSERT INTO users (name, email) VALUES 
 ('User 1', 'user1@example.com'),
 ('User 2', 'user2@example.com'),
 ('User 3', 'user3@example.com')
 `,
    update: "UPDATE users SET email = 'updated@example.com' WHERE id = 1",
    updateWithJoin: `
 UPDATE posts 
 SET score = posts.score + 1 
 FROM users 
 WHERE posts.user_id = users.id 
 AND users.name = 'John Doe'
 `,
    delete: 'DELETE FROM posts WHERE score < 10',
    deleteWithSubquery:
      "DELETE FROM posts WHERE user_id IN (SELECT id FROM users WHERE name = 'Inactive User')",
  };

  /**
   * DDL queries (will be blocked in SELECT-only mode)
   */
  static readonly ddlQueries = {
    createTable: `
 CREATE TABLE new_table (
 id SERIAL PRIMARY KEY,
 name VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT NOW()
 )
 `,
    alterTable: 'ALTER TABLE users ADD COLUMN phone VARCHAR(20)',
    dropTable: 'DROP TABLE temp_table',
    createIndex: 'CREATE INDEX idx_users_email ON users(email)',
    dropIndex: 'DROP INDEX idx_users_email',
    createView: `
 CREATE VIEW user_post_summary AS
 SELECT u.name, COUNT(p.id) as post_count, AVG(p.score) as avg_score
 FROM users u
 LEFT JOIN posts p ON u.id = p.user_id
 GROUP BY u.id, u.name
 `,
  };

  /**
   * Utility and administrative queries
   */
  static readonly utilityQueries = {
    explain: "EXPLAIN SELECT * FROM users WHERE email = 'test@example.com'",
    explainAnalyze:
      'EXPLAIN ANALYZE SELECT u.*, COUNT(p.id) FROM users u LEFT JOIN posts p ON u.id = p.user_id GROUP BY u.id',
    showTables: 'SHOW TABLES',
    describeTable: 'DESCRIBE users',
    showColumns: 'SHOW COLUMNS FROM users',
    showIndexes: 'SHOW INDEXES FROM users',
    showCreateTable: 'SHOW CREATE TABLE users',
  };

  /**
   * Potentially dangerous queries
   */
  static readonly dangerousQueries = {
    deleteAll: 'DELETE FROM users',
    updateAll: "UPDATE users SET email = 'hacked@example.com'",
    dropDatabase: 'DROP DATABASE production',
    truncateTable: 'TRUNCATE TABLE users',
    disableForeignKeys: 'SET foreign_key_checks = 0',
    changeUserPassword: "UPDATE users SET password = 'hacked' WHERE role = 'admin'",
  };

  /**
   * Complex queries that might hit security limits
   */
  static readonly complexityTestQueries = {
    manyJoins: `
 SELECT *
 FROM table1 t1
 JOIN table2 t2 ON t1.id = t2.t1_id
 JOIN table3 t3 ON t2.id = t3.t2_id
 JOIN table4 t4 ON t3.id = t4.t3_id
 JOIN table5 t5 ON t4.id = t5.t4_id
 JOIN table6 t6 ON t5.id = t6.t5_id
 JOIN table7 t7 ON t6.id = t7.t6_id
 JOIN table8 t8 ON t7.id = t8.t7_id
 JOIN table9 t9 ON t8.id = t9.t8_id
 JOIN table10 t10 ON t9.id = t10.t9_id
 JOIN table11 t11 ON t10.id = t11.t10_id
 JOIN table12 t12 ON t11.id = t12.t11_id
 `,
    manySubqueries: `
 SELECT * FROM users WHERE id IN (
 SELECT user_id FROM posts WHERE id IN (
 SELECT post_id FROM comments WHERE id IN (
 SELECT comment_id FROM likes WHERE id IN (
 SELECT like_id FROM reactions WHERE id IN (
 SELECT reaction_id FROM notifications WHERE id IN (
 SELECT notification_id FROM user_settings
 )
 )
 )
 )
 )
 )
 `,
    manyUnions: `
 SELECT name FROM users
 UNION SELECT title FROM posts
 UNION SELECT content FROM comments
 UNION SELECT message FROM notifications
 UNION SELECT description FROM categories
 UNION SELECT label FROM tags
 UNION SELECT name FROM groups
 UNION SELECT title FROM pages
 UNION SELECT content FROM articles
 UNION SELECT name FROM organizations
 `,
    manyGroupBys: `
 SELECT 
 user_id,
 category_id,
 tag_id,
 group_id,
 organization_id,
 department_id,
 location_id,
 status_id,
 COUNT(*) as total
 FROM complex_table
 GROUP BY 
 user_id,
 category_id,
 tag_id,
 group_id,
 organization_id,
 department_id,
 location_id,
 status_id
 `,
    veryLongQuery: `
 SELECT 
 users.id as user_id,
 users.name as user_name,
 users.email as user_email,
 users.created_at as user_created_at,
 users.updated_at as user_updated_at,
 posts.id as post_id,
 posts.title as post_title,
 posts.content as post_content,
 posts.score as post_score,
 posts.created_at as post_created_at,
 comments.id as comment_id,
 comments.content as comment_content,
 comments.score as comment_score,
 comments.created_at as comment_created_at,
 likes.id as like_id,
 likes.created_at as like_created_at,
 categories.name as category_name,
 tags.name as tag_name,
 organizations.name as org_name
 FROM users
 JOIN posts ON users.id = posts.user_id
 JOIN comments ON posts.id = comments.post_id
 JOIN likes ON posts.id = likes.post_id
 JOIN post_categories ON posts.id = post_categories.post_id
 JOIN categories ON post_categories.category_id = categories.id
 JOIN post_tags ON posts.id = post_tags.post_id
 JOIN tags ON post_tags.tag_id = tags.id
 JOIN user_organizations ON users.id = user_organizations.user_id
 JOIN organizations ON user_organizations.organization_id = organizations.id
 WHERE users.created_at > '2023-01-01'
 AND posts.score > 10
 AND comments.score > 5
 AND categories.active = true
 AND tags.active = true
 AND organizations.active = true
 ORDER BY posts.score DESC, comments.score DESC, likes.created_at DESC
 LIMIT 1000
 `
      .replace(/\s+/g, ' ')
      .repeat(10), // Make it very long
  };

  /**
   * Queries for testing different database features
   */
  static readonly featureTestQueries = {
    jsonQuery: "SELECT data->'name' as name FROM json_table WHERE data->>'active' = 'true'",
    arrayQuery: "SELECT * FROM table WHERE tags && ARRAY['sql', 'database']",
    regexQuery:
      "SELECT * FROM users WHERE email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'",
    fullTextSearch:
      "SELECT * FROM articles WHERE to_tsvector(content) @@ to_tsquery('database & sql')",
    geometryQuery:
      'SELECT * FROM locations WHERE ST_DWithin(geom, ST_Point(-122.4194, 37.7749), 1000)',
    dateQuery: "SELECT * FROM events WHERE event_date BETWEEN '2023-01-01' AND '2023-12-31'",
    caseQuery: `
 SELECT 
 name,
 CASE 
 WHEN score >= 90 THEN 'Excellent'
 WHEN score >= 80 THEN 'Good'
 WHEN score >= 70 THEN 'Fair'
 ELSE 'Poor'
 END as grade
 FROM users
 `,
  };

  /**
   * Get all query categories
   */
  static getAllQueryCategories(): Record<string, Record<string, string>> {
    return {
      basic: this.basicQueries,
      joins: this.joinQueries,
      subqueries: this.subqueryQueries,
      unions: this.unionQueries,
      cte: this.cteQueries,
      windows: this.windowQueries,
      analytical: this.analyticalQueries,
      modifications: this.modificationQueries,
      ddl: this.ddlQueries,
      utility: this.utilityQueries,
      dangerous: this.dangerousQueries,
      complexity: this.complexityTestQueries,
      features: this.featureTestQueries,
    };
  }

  /**
   * Get queries by type for testing
   */
  static getSafeQueries(): string[] {
    return [
      ...Object.values(this.basicQueries),
      ...Object.values(this.joinQueries),
      ...Object.values(this.subqueryQueries),
      ...Object.values(this.unionQueries),
      ...Object.values(this.cteQueries),
      ...Object.values(this.windowQueries),
      ...Object.values(this.analyticalQueries),
      ...Object.values(this.utilityQueries),
      ...Object.values(this.featureTestQueries),
    ];
  }

  static getUnsafeQueries(): string[] {
    return [
      ...Object.values(this.modificationQueries),
      ...Object.values(this.ddlQueries),
      ...Object.values(this.dangerousQueries),
    ];
  }

  static getComplexityTestQueries(): string[] {
    return Object.values(this.complexityTestQueries);
  }
}
