const mysql = require('mysql2/promise');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const nodeMailer = require('nodemailer');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
const port = process.env.PORT || 3000;
const app = express();

// CORS configuration - Fixed to be more permissive for development
// CORS configuration - Enhanced to handle headers properly
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000', 
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
            'http://nexsphereglobal.com',
            'https://nexsphereglobal.com',
            'https://www.nexsphereglobal.com',
            'https://api.nexsphereglobal.com'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'x-requested-with',
        'x-razorpay-signature',
        'x-rtb-fingerprint-id'  // Add this to allow the header
    ],
    exposedHeaders: [
        'x-razorpay-signature',
        'x-rtb-fingerprint-id'  // Expose this header for frontend access
    ],
    preflightContinue: false,
    optionsSuccessStatus: 200
}));

// Handle preflight requests
app.options('*', cors());

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Rate limiter - Made more lenient for development
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Increased limit for development
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting in development
        return process.env.NODE_ENV === 'development';
    }
});
app.use('/api/', limiter);

// Body parser middleware - Increased limits
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware for debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request body:', req.body);
    }
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Database configuration with better error handling
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nexsphere_hr',
    connectTimeout: 60000,
};

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here-change-in-production';

// Razorpay instance with validation
let razorpayInstance = null;
try {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        console.log('Razorpay configured successfully');
    } else {
        console.warn('Razorpay credentials not found in environment variables');
    }
} catch (error) {
    console.error('Error initializing Razorpay:', error);
}

// Email transporter setup with validation
let emailTransporter = null;
try {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
        emailTransporter = nodeMailer.createTransport({
            service: 'Gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });
        console.log('Email transporter configured successfully');
    } else {
        console.warn('Email credentials not found in environment variables');
    }
} catch (error) {
    console.error('Error initializing email transporter:', error);
}

// Database connection helper with retry logic
async function createDatabaseConnection() {
    let retries = 3;
    while (retries > 0) {
        try {
            const connection = await mysql.createConnection(dbConfig);
            return connection;
        } catch (error) {
            retries--;
            console.error(`Database connection attempt failed (${3 - retries}/3):`, error.message);
            if (retries === 0) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Improved JWT middleware
const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: "Access token is required",
                message: "Please provide a valid authorization token"
            });
        }

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                console.error('JWT verification error:', err);
                return res.status(403).json({ 
                    success: false, 
                    error: "Invalid or expired token",
                    message: "Please login again"
                });
            }
            req.user = user;
            next();
        });
    } catch (error) {
        console.error('Token authentication error:', error);
        res.status(500).json({ 
            success: false, 
            error: "Authentication error",
            message: "Internal server error"
        });
    }
};

// Test database connection on startup
async function testConnection() {
    try {
        const connection = await createDatabaseConnection();
        console.log('✓ Connected to MySQL successfully');
        await connection.ping();
        await connection.end();
        return true;
    } catch (err) {
        console.error('✗ Error connecting to MySQL:', err);
        console.log('Please check your database configuration in .env file');
        console.log('Required variables: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
        return false;
    }
}

// Initialize connection test
testConnection().then(connected => {
    if (!connected) {
        console.warn('Starting server without database connection');
    }
});

// ✅ Token validation route
app.get('/api/hr/auth/validate', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1]; // "Bearer <token>"
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }

        res.json({ success: true, user: decoded });
    });
});


// HR login with improved error handling
app.post('/api/hr/login', async (req, res) => {
    let connection;
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email and password are required' 
            });
        }
        
        connection = await createDatabaseConnection();
        
        // Create hr_users table if it doesn't exist
        try {
            await connection.execute('SELECT 1 FROM hr_users LIMIT 1');
        } catch (tableError) {
            console.log('Creating hr_users table...');
            await connection.execute(`
                CREATE TABLE hr_users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(50) DEFAULT 'HR Manager',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Create default HR user
            const defaultPassword = await bcryptjs.hash('Nex63670', 10);
            await connection.execute(
                'INSERT INTO hr_users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
                ['HR Manager', 'hr@nexspherehr.in', defaultPassword, 'HR Manager']
            );
            console.log('✓ Created hr_users table with default user');
        }
        
        const [users] = await connection.execute(
            'SELECT * FROM hr_users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }

        const user = users[0];
        const isPasswordValid = await bcryptjs.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            },
        });
    } catch (error) {
        console.error('Error during HR login:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Dashboard Stats API with better error handling
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createDatabaseConnection();
        
        let stats = {
            employees: { total: 0, active: 0 },
            employers: { total: 0, active: 0 },
            payments: { successful: 0, totalRevenue: 0 },
            emails: { employeeEmails: 0, employerEmails: 0, totalEmails: 0 }
        };
        
        // Check each table and get stats
        const tables = [
            {
                name: 'employees',
                query: 'SELECT COUNT(*) as total, COUNT(CASE WHEN status = "active" THEN 1 END) as active FROM employees',
                key: 'employees'
            },
            {
                name: 'employers',
                query: 'SELECT COUNT(*) as total, COUNT(CASE WHEN status = "active" THEN 1 END) as active FROM employers',
                key: 'employers'
            },
            {
                name: 'payments',
                query: 'SELECT COUNT(CASE WHEN payment_status = "paid" THEN 1 END) as successful, COALESCE(SUM(CASE WHEN payment_status = "paid" THEN amount ELSE 0 END), 0) as totalRevenue FROM payments',
                key: 'payments'
            }
        ];

        for (const table of tables) {
            try {
                const [result] = await connection.execute(table.query);
                if (table.key === 'payments') {
                    stats[table.key] = {
                        successful: parseInt(result[0].successful) || 0,
                        totalRevenue: parseFloat(result[0].totalRevenue) || 0
                    };
                } else {
                    stats[table.key] = result[0];
                }
            } catch (err) {
                console.log(`Table ${table.name} may not exist yet:`, err.message);
            }
        }

        // Email stats
        try {
            const [emailTotals] = await connection.execute(`
                SELECT
                    COUNT(*) AS totalEmails,
                    SUM(CASE WHEN recipient_type = 'employee' AND status = 'sent' THEN 1 ELSE 0 END) AS employeeEmails,
                    SUM(CASE WHEN recipient_type = 'employer' AND status = 'sent' THEN 1 ELSE 0 END) AS employerEmails
                FROM email_logs
                WHERE status IN ('sent','failed')
            `);

            stats.emails = {
                employeeEmails: parseInt(emailTotals[0].employeeEmails) || 0,
                employerEmails: parseInt(emailTotals[0].employerEmails) || 0,
                totalEmails: parseInt(emailTotals[0].totalEmails) || 0
            };
        } catch (err) {
            console.log('Email logs table may not exist yet:', err.message);
        }

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            error: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Fixed Get Employees API
app.get('/api/employees', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { status } = req.query;
        let query = 'SELECT * FROM employees';
        const params = [];
        
        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY id DESC';
        
        connection = await createDatabaseConnection();
        
        try {
            const [employees] = await connection.execute(query, params);
            res.json({
                success: true,
                employees: employees,
                count: employees.length
            });
        } catch (tableError) {
            if (tableError.code === 'ER_NO_SUCH_TABLE') {
                console.log('Employees table does not exist yet');
                res.json({
                    success: true,
                    employees: [],
                    count: 0,
                    message: 'No employees table found'
                });
            } else {
                throw tableError;
            }
        }
        
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching employees',
            error: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Fixed Get Employers API
app.get('/api/employers', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { status } = req.query;
        let query = 'SELECT * FROM employers';
        const params = [];
        
        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY id DESC';
        
        connection = await createDatabaseConnection();
        
        try {
            const [employers] = await connection.execute(query, params);
            res.json({
                success: true,
                employers: employers,
                count: employers.length
            });
        } catch (tableError) {
            if (tableError.code === 'ER_NO_SUCH_TABLE') {
                console.log('Employers table does not exist yet');
                res.json({
                    success: true,
                    employers: [],
                    count: 0,
                    message: 'No employers table found'
                });
            } else {
                throw tableError;
            }
        }
        
    } catch (error) {
        console.error('Error fetching employers:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching employers',
            error: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Fixed Get Payments API
app.get('/api/payments', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { status, service_type } = req.query;
        let query = 'SELECT * FROM payments';
        const params = [];
        const conditions = [];
        
        if (status) {
            conditions.push('payment_status = ?');
            params.push(status);
        }
        
        if (service_type) {
            conditions.push('payment_type = ?');
            params.push(service_type);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY id DESC';
        
        connection = await createDatabaseConnection();
        
        try {
            const [payments] = await connection.execute(query, params);
            res.json({
                success: true,
                payments: payments,
                count: payments.length
            });
        } catch (tableError) {
            if (tableError.code === 'ER_NO_SUCH_TABLE') {
                console.log('Payments table does not exist yet');
                res.json({
                    success: true,
                    payments: [],
                    count: 0,
                    message: 'No payments table found'
                });
            } else {
                throw tableError;
            }
        }
        
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching payments',
            error: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Fixed email sending function
async function sendEmail(to, subject, html, type = 'general', recipientType = 'other', sentBy = null) {
    if (!emailTransporter) {
        console.warn('Email transporter not configured');
        return { success: false, error: 'Email service not configured' };
    }

    let connection;
    try {
        const mailOptions = { 
            from: process.env.EMAIL_USER, 
            to, 
            subject, 
            html 
        };
        
        const result = await emailTransporter.sendMail(mailOptions);

        connection = await createDatabaseConnection();
        
        // Create email_logs table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS email_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                recipient_email VARCHAR(255) NOT NULL,
                recipient_type ENUM('employee','employer','other') DEFAULT 'other',
                subject VARCHAR(500) NOT NULL,
                body TEXT,
                email_type ENUM('payment_success','registration_success','password_reset','general') DEFAULT 'general',
                status ENUM('sent','failed') DEFAULT 'sent',
                error_message TEXT NULL,
                sent_by INT NULL,
                message_id VARCHAR(255) NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await connection.execute(
            `INSERT INTO email_logs (recipient_email, recipient_type, subject, body, email_type, status, sent_by, message_id)
             VALUES (?, ?, ?, ?, ?, 'sent', ?, ?)`,
            [to, recipientType, subject, html, type, sentBy, result.messageId || null]
        );

        console.log('✓ Email sent successfully to:', to);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('✗ Error sending email:', error);
        
        try {
            if (!connection) connection = await createDatabaseConnection();
            await connection.execute(
                `INSERT INTO email_logs (recipient_email, recipient_type, subject, body, email_type, status, error_message, sent_by)
                 VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)`,
                [to, recipientType, subject, html, type, error.message || String(error), sentBy]
            );
        } catch (logError) {
            console.error('Failed to log email error:', logError);
        }
        
        return { success: false, error: error.message };
    } finally {
        if (connection) await connection.end();
    }
}

// Fixed Send Email API
app.post('/api/send-email', authenticateToken, async (req, res) => {
    try {
        const { to, subject, body, recipientType = 'other', emailType = 'general' } = req.body;
        
        if (!to || !subject || !body) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields (to, subject, body) are required' 
            });
        }
        
        if (!to.includes('@')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email address format' 
            });
        }

        const result = await sendEmail(to, subject, body, emailType, recipientType, req.user?.id || null);

        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Email sent successfully', 
                messageId: result.messageId 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to send email: ' + result.error 
            });
        }
    } catch (error) {
        console.error('Error in send email API:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            error: error.message 
        });
    }
});

// Fixed Get Email Logs API
app.get('/api/emails', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { status } = req.query;
        let query = 'SELECT * FROM email_logs';
        const params = [];
        
        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY sent_at DESC LIMIT 100';
        
        connection = await createDatabaseConnection();
        
        try {
            const [emails] = await connection.execute(query, params);
            res.json({
                success: true,
                emails: emails,
                count: emails.length
            });
        } catch (tableError) {
            if (tableError.code === 'ER_NO_SUCH_TABLE') {
                res.json({
                    success: true,
                    emails: [],
                    count: 0,
                    message: 'No email logs table found'
                });
            } else {
                throw tableError;
            }
        }
        
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching emails',
            error: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Fixed Get Today's Email Count API
app.get('/api/emails/today-count', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createDatabaseConnection();
        
        try {
            const [result] = await connection.execute(
                'SELECT COUNT(*) as count FROM email_logs WHERE DATE(sent_at) = CURDATE() AND status = "sent"'
            );
            
            res.json({
                success: true,
                count: parseInt(result[0].count) || 0
            });
        } catch (tableError) {
            if (tableError.code === 'ER_NO_SUCH_TABLE') {
                res.json({
                    success: true,
                    count: 0,
                    message: 'No email logs table found'
                });
            } else {
                throw tableError;
            }
        }
        
    } catch (error) {
        console.error('Error fetching today email count:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching email count',
            error: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Fixed Employee Registration API
app.post("/api/register-employee", async (req, res) => {
    let connection;
    try {
        const { name, contact_no, alternate_no, email, joining_company, joining_date, position } = req.body;
        
        // Input validation
        const requiredFields = { name, email, contact_no, joining_company, joining_date, position };
        const missingFields = Object.entries(requiredFields).filter(([key, value]) => !value?.toString().trim());
        
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Missing required fields: ${missingFields.map(([key]) => key).join(', ')}` 
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email format' 
            });
        }
        
        // Validate phone number
        const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
        if (!phoneRegex.test(contact_no.replace(/\s+/g, ''))) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid phone number format' 
            });
        }
        
        connection = await createDatabaseConnection();
        
        // Create employees table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS employees (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                contact_no VARCHAR(20),
                alternate_no VARCHAR(20),
                email VARCHAR(255) UNIQUE,
                joining_company VARCHAR(255),
                joining_date DATE,
                position VARCHAR(255),
                salary DECIMAL(10,2) DEFAULT NULL,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        const [result] = await connection.execute(
            `INSERT INTO employees (name, contact_no, alternate_no, email, joining_company, joining_date, position, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
            [name, contact_no, alternate_no || null, email, joining_company, joining_date, position]
        );
        
        console.log('✓ Employee registered with ID:', result.insertId);

        // Send confirmation email
        const emailResult = await sendEmail(
            email, 
            'Employee Registration Successful - Nexsphere Global', 
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #307d73;">Welcome to Nexsphere Global</h2>
                <p>Dear ${name},</p>
                <p>Your employee registration has been completed successfully!</p>
                
                <div style="background: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3>Registration Details:</h3>
                    <ul>
                        <li><strong>Name:</strong> ${name}</li>
                        <li><strong>Email:</strong> ${email}</li>
                        <li><strong>Contact:</strong> ${contact_no}</li>
                        ${alternate_no ? `<li><strong>Alternate Contact:</strong> ${alternate_no}</li>` : ''}
                        <li><strong>Joining Company:</strong> ${joining_company}</li>
                        <li><strong>Position:</strong> ${position}</li>
                        <li><strong>Joining Date:</strong> ${joining_date}</li>
                    </ul>
                </div>
                
                <p>Thank you for choosing Nexsphere Global Virtual HR services!</p>
                <p>Best regards,<br>Nexsphere Global Team</p>
            </div>`,
            'registration_success', 
            'employee'
        );

        res.json({
            success: true,
            message: 'Employee registered successfully',
            employeeId: result.insertId,
            emailSent: emailResult.success
        });

    } catch (error) {
        console.error('Error registering employee:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ 
                success: false, 
                message: 'Employee with this email already exists' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Error registering employee',
                error: error.message 
            });
        }
    } finally {
        if (connection) await connection.end();
    }
});

// Fixed Create Razorpay order for employer registration
app.post('/api/employer/create-order', async (req, res) => {
    let connection;
    try {
        const { name, company_name, business_email, business_number, location, designation, company_size } = req.body;
        
        // Input validation
        const requiredFields = { name, company_name, business_email, business_number, location, designation, company_size };
        const missingFields = Object.entries(requiredFields).filter(([key, value]) => !value?.toString().trim());
        
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Missing required fields: ${missingFields.map(([key]) => key).join(', ')}` 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(business_email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email format' 
            });
        }

        // Check Razorpay configuration
        if (!razorpayInstance) {
            return res.status(500).json({ 
                success: false, 
                message: 'Payment gateway not configured' 
            });
        }
        
        // Create unique receipt ID
        const receiptId = `receipt_emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const options = {
            amount: 999 * 100, // Amount in paise
            currency: "INR",
            receipt: receiptId,
            notes: {
                company_name: company_name,
                business_email: business_email,
                purpose: "Employer Registration Fee"
            }
        };
        
        connection = await createDatabaseConnection();
        
        // Create payments table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                razorpay_order_id VARCHAR(255),
                razorpay_payment_id VARCHAR(255),
                razorpay_signature VARCHAR(255),
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'INR',
                payment_status VARCHAR(50) DEFAULT 'created',
                payment_method VARCHAR(50) NULL,
                payment_date TIMESTAMP NULL,
                name VARCHAR(255),
                company_name VARCHAR(255),
                business_email VARCHAR(255),
                business_number VARCHAR(20),
                location VARCHAR(255),
                designation VARCHAR(255),
                company_size INT,
                email VARCHAR(255),
                payment_type VARCHAR(50),
                employer_id INT,
                employee_id INT,
                receipt_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        const order = await razorpayInstance.orders.create(options);
        console.log('✓ Razorpay order created:', order.id);
        
        await connection.execute(
            `INSERT INTO payments 
             (razorpay_order_id, amount, currency, payment_status, name, company_name, business_email, business_number, location, designation, company_size, payment_type, receipt_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [order.id, 999, 'INR', 'created', name, company_name, business_email, business_number, location, designation, parseInt(company_size), 'employer_registration', receiptId]
        );

        res.json({ 
            success: true, 
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Order creation failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create payment order',
            error: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Fixed Employer Registration after payment verification
app.post('/api/employer/register', async (req, res) => {
    let connection;
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            company_name,
            business_email,
            business_number,
            location,
            designation,
            company_size,
            name
        } = req.body;

        // Input validation
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ 
                success: false, 
                message: 'Payment verification data is missing' 
            });
        }

        // Verify payment signature
        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(500).json({ 
                success: false, 
                message: 'Payment verification not configured' 
            });
        }

        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid payment signature' 
            });
        }

        connection = await createDatabaseConnection();

        // Create employers table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS employers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                company_name VARCHAR(255) NOT NULL,
                business_email VARCHAR(255) UNIQUE,
                business_number VARCHAR(20),
                location VARCHAR(255),
                designation VARCHAR(255),
                company_size INT,
                payment_id INT,
                status VARCHAR(50) DEFAULT 'active',
                registered_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Check if payment record exists and update it
        const [existingPayment] = await connection.execute(
            'SELECT id FROM payments WHERE razorpay_order_id = ?',
            [razorpay_order_id]
        );

        if (existingPayment.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Payment record not found' 
            });
        }

        const paymentId = existingPayment[0].id;

        // Update payment status
        await connection.execute(
            `UPDATE payments SET 
             razorpay_payment_id = ?, 
             razorpay_signature = ?, 
             payment_status = 'paid', 
             payment_date = NOW(),
             updated_at = NOW()
             WHERE razorpay_order_id = ?`,
            [razorpay_payment_id, razorpay_signature, razorpay_order_id]
        );

        // Insert employer details
        const [result] = await connection.execute(
            `INSERT INTO employers 
             (name, company_name, business_email, business_number, location, designation, company_size, payment_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [name, company_name, business_email, business_number, location, designation, parseInt(company_size), paymentId]
        );

        // Update payment record with employer_id
        await connection.execute(
            'UPDATE payments SET employer_id = ? WHERE id = ?',
            [result.insertId, paymentId]
        );

        console.log('✓ Employer registered with ID:', result.insertId);

        // Send confirmation email
        const emailResult = await sendEmail(
            business_email, 
            'Employer Registration Successful - Nexsphere Global', 
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #307d73;">Welcome to Nexsphere Global</h2>
                <p>Dear ${name},</p>
                <p>Congratulations! Your employer registration has been completed successfully!</p>
                
                <div style="background: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3>Registration Details:</h3>
                    <ul>
                        <li><strong>Company Name:</strong> ${company_name}</li>
                        <li><strong>Contact Person:</strong> ${name}</li>
                        <li><strong>Business Email:</strong> ${business_email}</li>
                        <li><strong>Business Number:</strong> ${business_number}</li>
                        <li><strong>Location:</strong> ${location}</li>
                        <li><strong>Designation:</strong> ${designation}</li>
                        <li><strong>Company Size:</strong> ${company_size} employees</li>
                    </ul>
                </div>
                
                <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h3>Payment Confirmation:</h3>
                    <p><strong>Amount Paid:</strong> ₹999</p>
                    <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
                    <p><strong>Transaction Date:</strong> ${new Date().toLocaleString()}</p>
                </div>
                
                <p>Your account is now active and you can start posting job requirements.</p>
                <p>Thank you for choosing Nexsphere Global Virtual HR services!</p>
                <p>Best regards,<br>Nexsphere Global Team</p>
            </div>`,
            'registration_success', 
            'employer'
        );

        res.json({
            success: true,
            message: 'Employer registered successfully',
            employerId: result.insertId,
            paymentId: razorpay_payment_id,
            emailSent: emailResult.success
        });
        
    } catch (error) {
        console.error('Error registering employer:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ 
                success: false, 
                message: 'Employer with this email already exists' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Error registering employer',
                error: error.message 
            });
        }
    } finally {
        if (connection) await connection.end();
    }
});

// Fixed Webhook handler
app.post('/api/razorpay/webhook', async (req, res) => {
    let connection;
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        
        if (!secret) {
            console.warn('Razorpay webhook secret not configured');
            return res.status(400).json({ error: 'Webhook not configured' });
        }

        const shasum = crypto.createHmac('sha256', secret);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.digest('hex');

        if (digest === req.headers['x-razorpay-signature']) {
            const event = req.body.event;
            const payment = req.body.payload.payment.entity;

            if (event === 'payment.captured') {
                connection = await createDatabaseConnection();
                await connection.execute(
                    `UPDATE payments SET 
                     payment_status = 'paid', 
                     payment_method = ?, 
                     payment_date = NOW(),
                     updated_at = NOW()
                     WHERE razorpay_payment_id = ?`,
                    [payment.method, payment.id]
                );
                
                console.log('✓ Payment captured webhook processed:', payment.id);
            }
        } else {
            console.warn('Invalid webhook signature');
            return res.status(400).json({ error: 'Invalid signature' });
        }
        
        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    } finally {
        if (connection) await connection.end();
    }
});

// Manual payment verification endpoint
app.post('/api/employer/manual-payment', async (req, res) => {
    let connection;
    try {
        const paymentData = req.body;
        
        // Validate required fields
        const requiredFields = ['name', 'company_name', 'business_email', 'business_number', 'location', 'designation', 'company_size'];
        const missingFields = requiredFields.filter(field => !paymentData[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        connection = await createDatabaseConnection();
        
        // Generate a manual payment ID
        const manualPaymentId = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create payment record for manual verification
        const [paymentResult] = await connection.execute(
            `INSERT INTO payments 
             (amount, currency, payment_status, name, company_name, business_email, business_number, location, designation, company_size, payment_type, razorpay_payment_id, payment_method)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [999, 'INR', 'pending_verification', paymentData.name, paymentData.company_name, paymentData.business_email, paymentData.business_number, paymentData.location, paymentData.designation, parseInt(paymentData.company_size), 'employer_registration', manualPaymentId, paymentData.payment_method || 'manual']
        );
        
        res.json({
            success: true,
            message: 'Payment submitted for verification',
            paymentId: manualPaymentId,
            note: 'Your registration will be activated within 24 hours after payment verification'
        });
        
    } catch (error) {
        console.error('Manual payment processing error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing manual payment',
            error: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Test endpoint with enhanced diagnostics
app.get('/api/test', async (req, res) => {
    const diagnostics = {
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        server: 'Node.js Express',
        version: process.version,
        environment: process.env.NODE_ENV || 'development',
        services: {
            database: false,
            razorpay: false,
            email: false
        }
    };

    // Test database connection
    try {
        const connection = await createDatabaseConnection();
        await connection.ping();
        await connection.end();
        diagnostics.services.database = true;
    } catch (error) {
        console.log('Database test failed:', error.message);
    }

    // Test Razorpay configuration
    diagnostics.services.razorpay = !!(razorpayInstance && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

    // Test email configuration
    diagnostics.services.email = !!(emailTransporter && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);

    res.json(diagnostics);
});

// Health check endpoint with detailed status
app.get('/api/health', async (req, res) => {
    const health = {
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {}
    };

    try {
        // Test database connection
        const connection = await createDatabaseConnection();
        await connection.execute('SELECT 1 as test');
        await connection.end();
        health.services.database = 'connected';
    } catch (error) {
        health.services.database = 'disconnected';
        health.status = 'degraded';
        health.database_error = error.message;
    }

    // Check other services
    health.services.razorpay = razorpayInstance ? 'configured' : 'not configured';
    health.services.email = emailTransporter ? 'configured' : 'not configured';

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
});

// Root route
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    const registerPath = path.join(__dirname, 'public', 'register.html');
    
    // Check which file exists and serve it
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else if (fs.existsSync(registerPath)) {
        res.sendFile(registerPath);
    } else {
        res.json({
            message: 'Nexsphere Global HR API Server',
            status: 'running',
            endpoints: [
                'GET /api/test - Server test',
                'GET /api/health - Health check',
                'POST /api/hr/login - HR login',
                'POST /api/register-employee - Employee registration',
                'POST /api/employer/create-order - Create payment order',
                'POST /api/employer/register - Complete employer registration'
            ]
        });
    }
});

// API 404 handler
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: `API endpoint not found: ${req.method} ${req.path}`,
        available_endpoints: [
            'GET /api/test',
            'GET /api/health', 
            'POST /api/hr/login',
            'GET /api/dashboard/stats',
            'GET /api/employees',
            'GET /api/employers',
            'GET /api/payments',
            'POST /api/send-email',
            'GET /api/emails',
            'GET /api/emails/today-count',
            'POST /api/register-employee',
            'POST /api/employer/create-order',
            'POST /api/employer/register',
            'POST /api/employer/manual-payment',
            'POST /api/razorpay/webhook'
        ]
    });
});

// Global error handler with better error responses
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    
    // Handle specific error types
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON in request body',
            error: 'Malformed JSON'
        });
    }
    
    if (error.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            success: false,
            message: 'Invalid CSRF token'
        });
    }

    res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Only start server locally, not on Vercel
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(port, '0.0.0.0', () => {
        console.log(`✓ Server is running on port ${port}`);
        console.log(`✓ Access the application at: http://localhost:${port}`);
        console.log(`✓ API base URL: http://localhost:${port}/api/`);
        console.log('\n📋 Required .env variables:');
        console.log('   - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
        console.log('   - RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET');
        console.log('   - EMAIL_USER, EMAIL_PASSWORD');
        console.log('   - JWT_SECRET');
        console.log('\n🔧 Test your server: curl http://localhost:' + port + '/api/test');
    });
}

// Export for Vercel
module.exports = app;