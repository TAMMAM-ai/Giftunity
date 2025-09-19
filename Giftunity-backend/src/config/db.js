/**
 * Database Configuration Module
 * Giftunity Backend Service
 * 
 * This module provides a pooled PostgreSQL connection for the Giftunity backend service.
 * It handles connection errors gracefully and provides a clean interface for database operations.
 * 
 * Environment Variables Required:
 * - DATABASE_URL: PostgreSQL connection string (provided by Render)
 */

const { Pool } = require('pg');

// Create connection pool with optimized settings for production
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render PostgreSQL connections
  },
  // Connection pool settings optimized for microservices
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
});

// Handle pool errors gracefully
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Handle pool connect events for monitoring
pool.on('connect', () => {
  console.log('New client connected to PostgreSQL database');
});

// Graceful shutdown handler
process.on('SIGINT', async () => {
  console.log('Shutting down database pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down database pool...');
  await pool.end();
  process.exit(0);
});

/**
 * Database query wrapper with error handling
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result object
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
const getClient = async () => {
  return await pool.connect();
};

module.exports = {
  query,
  getClient,
  pool
};
