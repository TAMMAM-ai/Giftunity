/**
 * Giftunity Backend Server
 * 
 * This is the central nervous system of the Giftunity platform.
 * It handles all business logic, database operations, and serves as the
 * single source of truth for multilingual content.
 * 
 * Key Responsibilities:
 * - Database operations and user management
 * - Translation service for multilingual support
 * - API endpoints for bot and frontend services
 * - Health checks for Render deployment
 * 
 * Environment Variables:
 * - PORT: Server port (default: 10000)
 * - DATABASE_URL: PostgreSQL connection string
 * - NODE_ENV: Environment (production/development)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const db = require('./config/db');

// Database initialization function
const initializeDatabase = async () => {
  try {
    console.log('🔧 Initializing database...');
    console.log(`🔗 Database URL configured: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);
    
    // Test database connection first
    console.log('🔍 Testing database connection...');
    await db.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    
    // Check if users table exists
    console.log('🔍 Checking if users table exists...');
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    console.log(`📊 Table check result: ${tableCheck.rows[0].exists}`);
    
    if (!tableCheck.rows[0].exists) {
      console.log('📋 Creating users table...');
      
      // Create table directly with SQL (more reliable than reading from file)
      const createTableSQL = `
        CREATE TABLE users (
          id BIGINT PRIMARY KEY,
          username VARCHAR(255),
          first_name VARCHAR(255) NOT NULL,
          last_name VARCHAR(255),
          language_code VARCHAR(10) DEFAULT 'en',
          is_premium BOOLEAN DEFAULT FALSE,
          is_bot BOOLEAN DEFAULT FALSE,
          added_to_attachment_menu BOOLEAN DEFAULT FALSE,
          can_join_groups BOOLEAN DEFAULT TRUE,
          can_read_all_group_messages BOOLEAN DEFAULT FALSE,
          supports_inline_queries BOOLEAN DEFAULT FALSE,
          preferred_language VARCHAR(10) DEFAULT 'en',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      console.log('📄 Executing CREATE TABLE statement...');
      await db.query(createTableSQL);
      console.log('✅ Users table created successfully');
      
      // Verify table was created
      const verifyTable = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `);
      console.log('✅ Table creation verified:', verifyTable.rows[0].exists);
      
      if (!verifyTable.rows[0].exists) {
        throw new Error('Failed to create users table - verification failed');
      }
    } else {
      console.log('✅ Users table already exists');
    }
    
    console.log('🎉 Database initialization completed');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    // Don't exit the process, let the server start and handle errors gracefully
  }
};

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 10000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API service
  crossOriginEmbedderPolicy: false
}));

// CORS configuration for microservices communication
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

/**
 * Health Check Endpoint
 * Required by Render for service monitoring
 */
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const dbTest = await db.query('SELECT NOW() as current_time');
    
    res.status(200).json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'giftunity-backend',
      version: '1.0.0',
      database: {
        connected: true,
        current_time: dbTest.rows[0].current_time
      }
    });
  } catch (error) {
    console.error('Health check database error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'giftunity-backend',
      version: '1.0.0',
      database: {
        connected: false,
        error: error.message
      }
    });
  }
});

/**
 * Database Status Endpoint
 * 
 * GET /api/db/status
 * 
 * This endpoint provides detailed database status information.
 */
app.get('/api/db/status', async (req, res) => {
  try {
    // Test basic connection
    const connectionTest = await db.query('SELECT NOW() as current_time');
    
    // Check if users table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    // Get table structure if it exists
    let tableStructure = null;
    if (tableCheck.rows[0].exists) {
      const structureQuery = await db.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        ORDER BY ordinal_position;
      `);
      tableStructure = structureQuery.rows;
    }
    
    res.json({
      status: 'connected',
      current_time: connectionTest.rows[0].current_time,
      users_table_exists: tableCheck.rows[0].exists,
      table_structure: tableStructure,
      database_url_configured: !!process.env.DATABASE_URL
    });
  } catch (error) {
    console.error('Database status check error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      database_url_configured: !!process.env.DATABASE_URL
    });
  }
});

/**
 * Database Table Creation Endpoint
 * 
 * POST /api/db/create-table
 * 
 * This endpoint manually creates the users table if it doesn't exist.
 * Useful for troubleshooting table creation issues.
 */
app.post('/api/db/create-table', async (req, res) => {
  try {
    console.log('🔧 Manual table creation requested...');
    
    // Check if table already exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      return res.json({
        status: 'success',
        message: 'Users table already exists',
        table_exists: true
      });
    }
    
    // Create table
    const createTableSQL = `
      CREATE TABLE users (
        id BIGINT PRIMARY KEY,
        username VARCHAR(255),
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255),
        language_code VARCHAR(10) DEFAULT 'en',
        is_premium BOOLEAN DEFAULT FALSE,
        is_bot BOOLEAN DEFAULT FALSE,
        added_to_attachment_menu BOOLEAN DEFAULT FALSE,
        can_join_groups BOOLEAN DEFAULT TRUE,
        can_read_all_group_messages BOOLEAN DEFAULT FALSE,
        supports_inline_queries BOOLEAN DEFAULT FALSE,
        preferred_language VARCHAR(10) DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    console.log('📄 Creating users table...');
    await db.query(createTableSQL);
    console.log('✅ Users table created successfully');
    
    // Verify table was created
    const verifyTable = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    if (verifyTable.rows[0].exists) {
      res.json({
        status: 'success',
        message: 'Users table created successfully',
        table_exists: true
      });
    } else {
      throw new Error('Table creation verification failed');
    }
  } catch (error) {
    console.error('Manual table creation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create users table',
      error: error.message
    });
  }
});

/**
 * Root endpoint for service discovery
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Giftunity Backend API',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      health: '/health',
      user: '/api/user/findOrCreate',
      translations: '/api/translations/:lang'
    }
  });
});

/**
 * User Management API
 * 
 * POST /api/user/findOrCreate
 * 
 * This endpoint handles user creation and updates from the Telegram bot.
 * It receives the full Telegram User object and either creates a new user
 * or updates an existing user's information.
 */
app.post('/api/user/findOrCreate', async (req, res) => {
  try {
    const {
      id,
      is_bot,
      first_name,
      last_name,
      username,
      language_code,
      is_premium,
      added_to_attachment_menu,
      can_join_groups,
      can_read_all_group_messages,
      supports_inline_queries
    } = req.body;

    // Validate required fields
    if (!id || !first_name) {
      return res.status(400).json({
        error: 'Missing required fields: id and first_name are required'
      });
    }

    // Check if user exists
    const existingUser = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (existingUser.rows.length > 0) {
      // Update existing user
      const updateQuery = `
        UPDATE users SET 
          is_bot = $2,
          first_name = $3,
          last_name = $4,
          username = $5,
          language_code = $6,
          is_premium = $7,
          added_to_attachment_menu = $8,
          can_join_groups = $9,
          can_read_all_group_messages = $10,
          supports_inline_queries = $11,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      
      const updatedUser = await db.query(updateQuery, [
        id, is_bot, first_name, last_name, username,
        language_code, is_premium, added_to_attachment_menu,
        can_join_groups, can_read_all_group_messages, supports_inline_queries
      ]);

      console.log(`Updated user ${id} (${first_name})`);
      return res.status(200).json(updatedUser.rows[0]);
    } else {
      // Create new user
      const insertQuery = `
        INSERT INTO users (
          id, is_bot, first_name, last_name, username,
          language_code, is_premium, added_to_attachment_menu,
          can_join_groups, can_read_all_group_messages, supports_inline_queries
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;
      
      const newUser = await db.query(insertQuery, [
        id, is_bot, first_name, last_name, username,
        language_code, is_premium, added_to_attachment_menu,
        can_join_groups, can_read_all_group_messages, supports_inline_queries
      ]);

      console.log(`Created new user ${id} (${first_name})`);
      return res.status(201).json(newUser.rows[0]);
    }
  } catch (error) {
    console.error('Error in /api/user/findOrCreate:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      constraint: error.constraint,
      table: error.table,
      column: error.column,
      detail: error.detail,
      hint: error.hint
    });
    
    // Check if it's a database connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'Database connection failed',
        message: 'Unable to connect to the database',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    // Check if it's a table doesn't exist error
    if (error.code === '42P01') {
      return res.status(503).json({
        error: 'Database table not found',
        message: 'The users table does not exist. Please check database initialization.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process user data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Translation Service API
 * 
 * GET /api/translations/:lang
 * 
 * This endpoint serves translation files for the specified language.
 * It acts as the single source of truth for all multilingual content
 * across the platform.
 */
app.get('/api/translations/:lang', (req, res) => {
  try {
    const lang = req.params.lang;
    
    // Validate language code format
    if (!lang || !/^[a-z]{2}$/.test(lang)) {
      return res.status(400).json({
        error: 'Invalid language code',
        message: 'Language code must be a 2-letter ISO code'
      });
    }

    // Define supported languages
    const supportedLanguages = ['en', 'ar', 'fa', 'ru', 'de', 'zh'];
    
    if (!supportedLanguages.includes(lang)) {
      return res.status(404).json({
        error: 'Language not supported',
        supportedLanguages: supportedLanguages
      });
    }

    // Read translation file
    const filePath = path.join(__dirname, '..', '..', '..', 'locales', `${lang}.json`);
    console.log(`🔍 Looking for translation file at: ${filePath}`);
    
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        console.error(`Error reading translation file for ${lang}:`, err);
        return res.status(500).json({
          error: 'Translation service error',
          message: 'Failed to load translation file'
        });
      }
      
      try {
        const translations = JSON.parse(data);
        res.status(200).json(translations);
      } catch (parseError) {
        console.error(`Error parsing translation file for ${lang}:`, parseError);
        res.status(500).json({
          error: 'Translation service error',
          message: 'Invalid translation file format'
        });
      }
    });
  } catch (error) {
    console.error('Error in /api/translations/:lang:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process translation request'
    });
  }
});

/**
 * Get supported languages endpoint
 */
app.get('/api/translations', (req, res) => {
  res.json({
    supportedLanguages: ['en', 'ar', 'fa', 'ru', 'de', 'zh'],
    defaultLanguage: 'en'
  });
});

/**
 * 404 Handler
 */
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: {
      health: 'GET /health',
      user: 'POST /api/user/findOrCreate',
      translations: 'GET /api/translations/:lang',
      supportedLanguages: 'GET /api/translations'
    }
  });
});

/**
 * Global Error Handler
 */
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  });
});

/**
 * Graceful Shutdown Handlers
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

/**
 * Start Server
 */
const startServer = async () => {
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Giftunity Backend API Server is running on port ${PORT}`);
      console.log(`📊 Health check available at: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;
