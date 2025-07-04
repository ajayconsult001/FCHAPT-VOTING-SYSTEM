require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Function to test the database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connection established successfully!');
    connection.release();
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error.message);
  }
}

// Immediately test the connection when this module is loaded
testConnection();

module.exports = pool;
