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

// Environment validation
function validateEnvironment() {
    const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
    const optional = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'EMAIL_USER', 'EMAIL_PASSWORD'];
    
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error('Missing required environment variables:', missing);
        console.log('Please check your .env file and ensure all required variables are set.');
        process.exit(1);
    }
    
    const missingOptional = optional.filter(key => !process.env[key]);
    if (missingOptional.length > 0) {
        console.log('ℹ️  Optional environment variables not set:', missingOptional.join(', '));
        console.log('ℹ️  These features will be disabled:');
        missingOptional.forEach(key => {
            const feature = {
                'RAZORPAY_KEY_ID': 'Payment processing',
                'RAZORPAY_KEY_SECRET': 'Payment processing', 
                'EMAIL_USER': 'Email notifications',
                'EMAIL_PASSWORD': 'Email notifications'
            }[key] || 'Unknown feature';
            console.log(`   - ${key}: ${feature}`);
        });
    }
    
    console.log('Environment variables validated successfully');
}

validateEnvironment();

const port = process.env.PORT || 3000;
const app = express();

// Database configuration with connection pooling
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    // Removed deprecated options: acquireTimeout, timeout, reconnect
    // These are now handled automatically by mysql2
};

let connectionPool = null;

// Initialize database pool
async function initializeDatabase() {
    try {
        connectionPool = mysql.createPool(dbConfig);
        const connection = await connectionPool.getConnection();
        await connection.ping();
        connection.release();
        console.log('Database pool initialized successfully');
        return true;
    } catch (error) {
        console.error('Database pool initialization failed:', error.message);
        return false;
    }
}

// Get database connection from pool
async function getDatabaseConnection() {
    if (!connectionPool) {
        throw new Error('Database pool not initialized');
    }
    return await connectionPool.getConnection();
}

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET;

// Razorpay configuration
let razorpayInstance = null;
try {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        console.log('Razorpay configured successfully');
    } else {
        console.warn('Razorpay credentials not found - payment features disabled');
    }
} catch (error) {
    console.error('Error initializing Razorpay:', error);
}

// Email configuration
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
        console.warn('Email credentials not found - email features disabled');
    }
} catch (error) {
    console.error('Error initializing email transporter:', error);
}

// Middleware setup
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS configuration - Updated for production
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'https://nexsphereglobal.com',
    'https://www.nexsphereglobal.com',
    'https://api.nexsphereglobal.com',
    // Add your actual production domains here
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || 
            /\.vercel\.app$/.test(origin) || 
            process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
    preflightContinue: false,
    optionsSuccessStatus: 200
}));

// Handle preflight requests
app.options('*', cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 200 : 100,
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development'
});
app.use('/api/', limiter);

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// Static file serving with error handling
try {
    const publicPath = path.join(__dirname, 'public');
    if (fs.existsSync(publicPath)) {
        app.use(express.static(publicPath));
        console.log('Static files enabled from public directory');
    } else {
        console.log('Public directory not found - running in API-only mode');
    }
} catch (error) {
    console.log('ℹ️  Static file serving disabled:', error.message);
    console.log('ℹ️  This is normal for API-only deployments');
}

// Helper function for consistent API responses
function apiResponse(success, data = null, message = null, error = null, meta = {}) {
    return {
        success,
        timestamp: new Date().toISOString(),
        ...(data !== null && { data }),
        ...(message && { message }),
        ...(error && { error }),
        ...meta
    };
}

// JWT authentication middleware
const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json(apiResponse(false, null, null, 'Access token required'));
        }

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                console.error('JWT verification error:', err);
                return res.status(403).json(apiResponse(false, null, null, 'Invalid or expired token'));
            }
            req.user = user;
            next();
        });
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json(apiResponse(false, null, null, 'Authentication error'));
    }
};

// Email sending function
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

        connection = await getDatabaseConnection();
        
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

        console.log('Email sent successfully to:', to);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        
        try {
            if (!connection) connection = await getDatabaseConnection();
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
        if (connection) connection.release();
    }
}

// Routes

// Root route
app.get('/', (req, res) => {
    res.json(apiResponse(true, {
        message: 'Nexsphere Global HR API Server',
        version: '1.0.0',
        endpoints: {
            auth: [
                'POST /api/hr/login - HR login',
                'GET /api/hr/auth/validate - Validate token'
            ],
            dashboard: [
                'GET /api/dashboard/stats - Dashboard statistics'
            ],
            employees: [
                'GET /api/employees - Get all employees',
                'POST /api/register-employee - Register new employee'
            ],
            employers: [
                'GET /api/employers - Get all employers',
                'POST /api/employer/create-order - Create payment order',
                'POST /api/employer/register - Complete registration'
            ],
            payments: [
                'GET /api/payments - Get payment records',
                'POST /api/razorpay/webhook - Payment webhook'
            ],
            emails: [
                'GET /api/emails - Get email logs',
                'POST /api/send-email - Send email',
                'GET /api/emails/today-count - Today\'s email count'
            ],
            system: [
                'GET /api/test - Server test',
                'GET /api/health - Health check'
            ]
        }
    }));
});

// Token validation route
app.get('/api/hr/auth/validate', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json(apiResponse(false, null, null, 'No token provided'));
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json(apiResponse(false, null, null, 'Invalid or expired token'));
        }
        res.json(apiResponse(true, { user: decoded }, 'Token is valid'));
    });
});

// HR login
app.post('/api/hr/login', async (req, res) => {
    let connection;
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json(apiResponse(false, null, null, 'Email and password are required'));
        }
        
        connection = await getDatabaseConnection();
        
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
            
            const defaultPassword = await bcryptjs.hash('Nex63670', 10);
            await connection.execute(
                'INSERT INTO hr_users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
                ['HR Manager', 'hr@nexspherehr.in', defaultPassword, 'HR Manager']
            );
            console.log('Created hr_users table with default user');
        }
        
        const [users] = await connection.execute(
            'SELECT * FROM hr_users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(400).json(apiResponse(false, null, null, 'Invalid email or password'));
        }

        const user = users[0];
        const isPasswordValid = await bcryptjs.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            return res.status(400).json(apiResponse(false, null, null, 'Invalid email or password'));
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json(apiResponse(true, {
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        }, 'Login successful'));
    } catch (error) {
        console.error('Error during HR login:', error);
        res.status(500).json(apiResponse(false, null, null, 'Internal server error'));
    } finally {
        if (connection) connection.release();
    }
});

// Dashboard stats
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await getDatabaseConnection();
        
        let stats = {
            employees: { total: 0, active: 0 },
            employers: { total: 0, active: 0 },
            payments: { successful: 0, totalRevenue: 0 },
            emails: { employeeEmails: 0, employerEmails: 0, totalEmails: 0 }
        };
        
        // Get employee stats
        try {
            const [employeeResult] = await connection.execute(
                'SELECT COUNT(*) as total, COUNT(CASE WHEN status = "active" THEN 1 END) as active FROM employees'
            );
            stats.employees = employeeResult[0];
        } catch (err) {
            console.log('Employees table may not exist yet:', err.message);
        }
        
        // Get employer stats
        try {
            const [employerResult] = await connection.execute(
                'SELECT COUNT(*) as total, COUNT(CASE WHEN status = "active" THEN 1 END) as active FROM employers'
            );
            stats.employers = employerResult[0];
        } catch (err) {
            console.log('Employers table may not exist yet:', err.message);
        }
        
        // Get payment stats
        try {
            const [paymentResult] = await connection.execute(
                'SELECT COUNT(CASE WHEN payment_status = "paid" THEN 1 END) as successful, COALESCE(SUM(CASE WHEN payment_status = "paid" THEN amount ELSE 0 END), 0) as totalRevenue FROM payments'
            );
            stats.payments = {
                successful: parseInt(paymentResult[0].successful) || 0,
                totalRevenue: parseFloat(paymentResult[0].totalRevenue) || 0
            };
        } catch (err) {
            console.log('Payments table may not exist yet:', err.message);
        }

        // Get email stats
        try {
            const [emailResult] = await connection.execute(`
                SELECT
                    COUNT(*) AS totalEmails,
                    SUM(CASE WHEN recipient_type = 'employee' AND status = 'sent' THEN 1 ELSE 0 END) AS employeeEmails,
                    SUM(CASE WHEN recipient_type = 'employer' AND status = 'sent' THEN 1 ELSE 0 END) AS employerEmails
                FROM email_logs
            `);
            stats.emails = {
                employeeEmails: parseInt(emailResult[0].employeeEmails) || 0,
                employerEmails: parseInt(emailResult[0].employerEmails) || 0,
                totalEmails: parseInt(emailResult[0].totalEmails) || 0
            };
        } catch (err) {
            console.log('Email logs table may not exist yet:', err.message);
        }

        res.json(apiResponse(true, stats, 'Dashboard stats retrieved successfully'));
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json(apiResponse(false, null, null, 'Error fetching dashboard stats'));
    } finally {
        if (connection) connection.release();
    }
});

// Get employees
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
        
        connection = await getDatabaseConnection();
        
        const [employees] = await connection.execute(query, params);
        
        res.json(apiResponse(true, employees, 'Employees retrieved successfully', null, { count: employees.length }));
        
    } catch (error) {
        console.error('Error fetching employees:', error);
        
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json(apiResponse(true, [], 'No employees found - table will be created on first registration', null, { count: 0 }));
        } else {
            res.status(500).json(apiResponse(false, null, null, 'Error fetching employees'));
        }
    } finally {
        if (connection) connection.release();
    }
});

// Get employers
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
        
        connection = await getDatabaseConnection();
        
        const [employers] = await connection.execute(query, params);
        
        res.json(apiResponse(true, employers, 'Employers retrieved successfully', null, { count: employers.length }));
        
    } catch (error) {
        console.error('Error fetching employers:', error);
        
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json(apiResponse(true, [], 'No employers found - table will be created on first registration', null, { count: 0 }));
        } else {
            res.status(500).json(apiResponse(false, null, null, 'Error fetching employers'));
        }
    } finally {
        if (connection) connection.release();
    }
});

// Get payments
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
        
        connection = await getDatabaseConnection();
        
        const [payments] = await connection.execute(query, params);
        
        res.json(apiResponse(true, payments, 'Payments retrieved successfully', null, { count: payments.length }));
        
    } catch (error) {
        console.error('Error fetching payments:', error);
        
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json(apiResponse(true, [], 'No payments found - table will be created on first payment', null, { count: 0 }));
        } else {
            res.status(500).json(apiResponse(false, null, null, 'Error fetching payments'));
        }
    } finally {
        if (connection) connection.release();
    }
});

// Send email
app.post('/api/send-email', authenticateToken, async (req, res) => {
    try {
        const { to, subject, body, recipientType = 'other', emailType = 'general' } = req.body;
        
        if (!to || !subject || !body) {
            return res.status(400).json(apiResponse(false, null, null, 'All fields (to, subject, body) are required'));
        }
        
        if (!to.includes('@')) {
            return res.status(400).json(apiResponse(false, null, null, 'Invalid email address format'));
        }

        const result = await sendEmail(to, subject, body, emailType, recipientType, req.user?.id || null);

        if (result.success) {
            res.json(apiResponse(true, { messageId: result.messageId }, 'Email sent successfully'));
        } else {
            res.status(500).json(apiResponse(false, null, null, `Failed to send email: ${result.error}`));
        }
    } catch (error) {
        console.error('Error in send email API:', error);
        res.status(500).json(apiResponse(false, null, null, 'Internal server error'));
    }
});

// Get email logs
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
        
        connection = await getDatabaseConnection();
        
        const [emails] = await connection.execute(query, params);
        
        res.json(apiResponse(true, emails, 'Email logs retrieved successfully', null, { count: emails.length }));
        
    } catch (error) {
        console.error('Error fetching emails:', error);
        
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json(apiResponse(true, [], 'No email logs found - table will be created on first email', null, { count: 0 }));
        } else {
            res.status(500).json(apiResponse(false, null, null, 'Error fetching email logs'));
        }
    } finally {
        if (connection) connection.release();
    }
});

// Get today's email count
app.get('/api/emails/today-count', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await getDatabaseConnection();
        
        const [result] = await connection.execute(
            'SELECT COUNT(*) as count FROM email_logs WHERE DATE(sent_at) = CURDATE() AND status = "sent"'
        );
        
        res.json(apiResponse(true, { count: parseInt(result[0].count) || 0 }, 'Today\'s email count retrieved'));
        
    } catch (error) {
        console.error('Error fetching today email count:', error);
        
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json(apiResponse(true, { count: 0 }, 'No email logs found'));
        } else {
            res.status(500).json(apiResponse(false, null, null, 'Error fetching email count'));
        }
    } finally {
        if (connection) connection.release();
    }
});

// Employee registration
app.post("/api/register-employee", async (req, res) => {
    let connection;
    try {
        const { name, contact_no, alternate_no, email, joining_company, joining_date, position } = req.body;
        
        // Input validation
        const requiredFields = { name, email, contact_no, joining_company, joining_date, position };
        const missingFields = Object.entries(requiredFields).filter(([key, value]) => !value?.toString().trim());
        
        if (missingFields.length > 0) {
            return res.status(400).json(apiResponse(false, null, null, `Missing required fields: ${missingFields.map(([key]) => key).join(', ')}`));
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json(apiResponse(false, null, null, 'Invalid email format'));
        }
        
        // Validate phone number
        const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
        if (!phoneRegex.test(contact_no.replace(/\s+/g, ''))) {
            return res.status(400).json(apiResponse(false, null, null, 'Invalid phone number format'));
        }
        
        connection = await getDatabaseConnection();
        
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
        
        console.log('Employee registered with ID:', result.insertId);

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

        res.json(apiResponse(true, {
            employeeId: result.insertId,
            emailSent: emailResult.success
        }, 'Employee registered successfully'));

    } catch (error) {
        console.error('Order creation failed:', error);
        res.status(500).json(apiResponse(false, null, null, 'Failed to create payment order'));
    } finally {
        if (connection) connection.release();
    }
});

// Create payment order for employer registration
app.post('/api/employer/create-order', async (req, res) => {
    let connection;
    try {
        const { name, company_name, business_email, business_number, location, designation, company_size } = req.body;
        
        // Input validation
        const requiredFields = { name, company_name, business_email, business_number, location, designation, company_size };
        const missingFields = Object.entries(requiredFields).filter(([key, value]) => !value?.toString().trim());
        
        if (missingFields.length > 0) {
            return res.status(400).json(apiResponse(false, null, null, `Missing required fields: ${missingFields.map(([key]) => key).join(', ')}`));
        }

        // Check if Razorpay is configured
        if (!razorpayInstance) {
            return res.status(500).json(apiResponse(false, null, null, 'Payment gateway not configured'));
        }

        connection = await getDatabaseConnection();
        
        // Create payments table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                razorpay_order_id VARCHAR(255) UNIQUE NOT NULL,
                razorpay_payment_id VARCHAR(255),
                razorpay_signature VARCHAR(255),
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'INR',
                payment_status ENUM('pending','paid','failed') DEFAULT 'pending',
                payment_type VARCHAR(50) DEFAULT 'employer_registration',
                payment_method VARCHAR(50),
                employer_id INT DEFAULT NULL,
                payment_date TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Create Razorpay order
        const orderOptions = {
            amount: 99900, // Amount in paise (₹999)
            currency: 'INR',
            receipt: `emp_reg_${Date.now()}`,
            payment_capture: 1
        };

        const razorpayOrder = await razorpayInstance.orders.create(orderOptions);
        
        // Save order to database
        await connection.execute(
            `INSERT INTO payments (razorpay_order_id, amount, currency, payment_type, payment_status) 
             VALUES (?, ?, ?, 'employer_registration', 'pending')`,
            [razorpayOrder.id, 999.00, 'INR']
        );

        console.log('Payment order created:', razorpayOrder.id);

        res.json(apiResponse(true, {
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID
        }, 'Payment order created successfully'));

    } catch (error) {
        console.error('Order creation failed:', error);
        res.status(500).json(apiResponse(false, null, null, 'Failed to create payment order'));
    } finally {
        if (connection) connection.release();
    }
});

// Employer registration after payment verification
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
            return res.status(400).json(apiResponse(false, null, null, 'Payment verification data is missing'));
        }

        // Verify payment signature
        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(500).json(apiResponse(false, null, null, 'Payment verification not configured'));
        }

        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json(apiResponse(false, null, null, 'Invalid payment signature'));
        }

        connection = await getDatabaseConnection();

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
            return res.status(400).json(apiResponse(false, null, null, 'Payment record not found'));
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

        console.log('Employer registered with ID:', result.insertId);

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

        res.json(apiResponse(true, {
            employerId: result.insertId,
            paymentId: razorpay_payment_id,
            emailSent: emailResult.success
        }, 'Employer registered successfully'));
        
    } catch (error) {
        console.error('Error registering employer:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json(apiResponse(false, null, null, 'Employer with this email already exists'));
        } else {
            res.status(500).json(apiResponse(false, null, null, 'Error registering employer'));
        }
    } finally {
        if (connection) connection.release();
    }
});

// Razorpay webhook handler
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
                connection = await getDatabaseConnection();
                await connection.execute(
                    `UPDATE payments SET 
                     payment_status = 'paid', 
                     payment_method = ?, 
                     payment_date = NOW(),
                     updated_at = NOW()
                     WHERE razorpay_payment_id = ?`,
                    [payment.method, payment.id]
                );
                
                console.log('Payment captured webhook processed:', payment.id);
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
        if (connection) connection.release();
    }
});

// Test endpoint
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
        const connection = await getDatabaseConnection();
        await connection.ping();
        connection.release();
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

// Health check endpoint
app.get('/api/health', async (req, res) => {
    const health = {
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {}
    };

    try {
        // Test database connection
        const connection = await getDatabaseConnection();
        await connection.execute('SELECT 1 as test');
        connection.release();
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

// API 404 handler
app.use('/api/*', (req, res) => {
    res.status(404).json(apiResponse(false, null, null, `API endpoint not found: ${req.method} ${req.path}`));
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json(apiResponse(false, null, null, 'Invalid JSON in request body'));
    }
    
    if (error.code === 'EBADCSRFTOKEN') {
        return res.status(403).json(apiResponse(false, null, null, 'Invalid CSRF token'));
    }

    res.status(500).json(apiResponse(false, null, null, 
        process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    ));
});

// Server startup function
async function startServer() {
    try {
        // Initialize database first
        const dbInitialized = await initializeDatabase();
        if (!dbInitialized) {
            console.log('⚠️  Starting server without database connection');
            console.log('⚠️  Database features will be limited until connection is established');
        }
        
        // Only start server locally, not on Vercel
        if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
            const server = app.listen(port, '0.0.0.0', () => {
                console.log(`Server is running on port ${port}`);
                console.log(`Access the application at: http://localhost:${port}`);
                console.log(`API base URL: http://localhost:${port}/api/`);
                console.log('\nRequired .env variables:');
                console.log('   - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
                console.log('   - RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET');
                console.log('   - EMAIL_USER, EMAIL_PASSWORD');
                console.log('   - JWT_SECRET');
                console.log(`\nTest your server: curl http://localhost:${port}/api/test`);
            });
            
            // Graceful shutdown
            process.on('SIGTERM', async () => {
                console.log('SIGTERM received, shutting down gracefully');
                server.close(() => {
                    if (connectionPool) {
                        connectionPool.end();
                    }
                    process.exit(0);
                });
            });

            process.on('SIGINT', async () => {
                console.log('SIGINT received, shutting down gracefully');
                server.close(() => {
                    if (connectionPool) {
                        connectionPool.end();
                    }
                    process.exit(0);
                });
            });
        }
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

// Export for Vercel
module.exports = app;