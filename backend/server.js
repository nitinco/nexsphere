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

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Disable CSP for local development
}));

app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true,      
}));

// Rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (for HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nexsphere_hr',
};

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Razorpay instance - Fixed initialization
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_your_key_id',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_key_secret',
});

// Email transporter setup
const emailTransporter = nodeMailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({error: "Invalid token"});
        req.user = user;
        next();
    });
};

// Test database connection
async function testConnection() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL successfully');
        await connection.end();
    } catch (err) {
        console.error('Error connecting to MySQL:', err);
        console.log('Please check your database configuration in .env file');
    }
}

// Initialize connection test
testConnection();

// HR login 
app.post('/api/hr/login', async (req, res) => {
    try {
        const {email, password} = req.body;
        
        if (!email || !password) {
            return res.status(400).json({error: 'Email and password are required'});
        }
        
        const connection = await mysql.createConnection(dbConfig);
        
        // First check if hr_users table exists, if not create it with default user
        try {
            await connection.execute('SELECT 1 FROM hr_users LIMIT 1');
        } catch (tableError) {
            // Table doesn't exist, create it
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
            console.log('Created hr_users table with default user');
        }
        
        const [users] = await connection.execute(
            'SELECT * FROM hr_users WHERE email = ?',
            [email]
        );
        await connection.end();

        if (users.length === 0) {
            return res.status(400).json({error: 'Invalid email or password'});
        }

        const user = users[0];
        const isPasswordValid = await bcryptjs.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            return res.status(400).json({error: 'Invalid email or password'});
        }

        const token = jwt.sign({
            id: user.id,
            email: user.email,
        }, 
        JWT_SECRET,
        {expiresIn: '24h'}
        );
        
        res.json({
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
        res.status(500).json({error: 'Internal server error'});
    }
});

// Dashboard Stats API
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        // Initialize stats object
        let stats = {
            employees: { total: 0, active: 0 },
            employers: { total: 0, active: 0 },
            payments: { successful: 0, totalRevenue: 0 },
            emails: { employeeEmails: 0, employerEmails: 0, totalEmails: 0 }
        };
        
        // Check if tables exist and get stats
        try {
            // Get employee stats
            const [employeeStats] = await connection.execute(
                'SELECT COUNT(*) as total, COUNT(CASE WHEN status = "active" THEN 1 END) as active FROM employees'
            );
            stats.employees = employeeStats[0];
        } catch (err) {
            console.log('Employees table may not exist yet');
        }
        
        try {
            // Get employer stats  
            const [employerStats] = await connection.execute(
                'SELECT COUNT(*) as total, COUNT(CASE WHEN status = "active" THEN 1 END) as active FROM employers'
            );
            stats.employers = employerStats[0];
        } catch (err) {
            console.log('Employers table may not exist yet');
        }
        
        try {
            // Get payment stats
            const [paymentStats] = await connection.execute(
                'SELECT COUNT(CASE WHEN payment_status = "paid" THEN 1 END) as successful, SUM(CASE WHEN payment_status = "paid" THEN amount ELSE 0 END) as totalRevenue FROM payments'
            );
            stats.payments = {
                successful: paymentStats[0].successful || 0,
                totalRevenue: paymentStats[0].totalRevenue || 0
            };
        } catch (err) {
            console.log('Payments table may not exist yet');
        }

        // Email totals
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
                employeeEmails: emailTotals[0].employeeEmails || 0,
                employerEmails: emailTotals[0].employerEmails || 0,
                totalEmails: emailTotals[0].totalEmails || 0
            };
        } catch (err) {
            console.log('Email logs table may not exist yet');
        }

        await connection.end();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get Employees API
app.get('/api/employees', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;
        let query = 'SELECT * FROM employees';
        const params = [];
        
        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY id DESC';
        
        const connection = await mysql.createConnection(dbConfig);
        
        try {
            const [employees] = await connection.execute(query, params);
            await connection.end();
            
            res.json({
                success: true,
                employees: employees
            });
        } catch (tableError) {
            await connection.end();
            // Table doesn't exist yet
            res.json({
                success: true,
                employees: []
            });
        }
        
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ success: false, message: 'Error fetching employees' });
    }
});

// Get Employers API
app.get('/api/employers', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;
        let query = 'SELECT * FROM employers';
        const params = [];
        
        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY id DESC';
        
        const connection = await mysql.createConnection(dbConfig);
        
        try {
            const [employers] = await connection.execute(query, params);
            await connection.end();
            
            res.json({
                success: true,
                employers: employers
            });
        } catch (tableError) {
            await connection.end();
            // Table doesn't exist yet
            res.json({
                success: true,
                employers: []
            });
        }
        
    } catch (error) {
        console.error('Error fetching employers:', error);
        res.status(500).json({ success: false, message: 'Error fetching employers' });
    }
});

// Get Payments API
app.get('/api/payments', authenticateToken, async (req, res) => {
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
        
        const connection = await mysql.createConnection(dbConfig);
        
        try {
            const [payments] = await connection.execute(query, params);
            await connection.end();
            
            res.json({
                success: true,
                payments: payments
            });
        } catch (tableError) {
            await connection.end();
            // Table doesn't exist yet
            res.json({
                success: true,
                payments: []
            });
        }
        
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ success: false, message: 'Error fetching payments' });
    }
});

// Email sending function
async function sendEmail(
    to,
    subject,
    html,
    type = 'general',
    recipientType = 'other',
    sentBy = null
) {
    try {
        const mailOptions = { 
            from: process.env.EMAIL_USER, 
            to, 
            subject, 
            html 
        };
        
        const result = await emailTransporter.sendMail(mailOptions);

        const connection = await mysql.createConnection(dbConfig);
        
        // Create email_logs table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS email_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                recipient_email VARCHAR(255) NOT NULL,
                recipient_type ENUM('employee','employer','other') DEFAULT 'other',
                subject VARCHAR(255) NOT NULL,
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
        await connection.end();

        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        
        try {
            const connection = await mysql.createConnection(dbConfig);
            await connection.execute(
                `INSERT INTO email_logs (recipient_email, recipient_type, subject, body, email_type, status, error_message, sent_by)
                 VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)`,
                [to, recipientType, subject, html, type, error.message || String(error), sentBy]
            );
            await connection.end();
        } catch (logError) {
            console.log('Failed to log email error:', logError.message);
        }
        
        return { success: false, error: error.message };
    }
}

// Send Email API
app.post('/api/send-email', authenticateToken, async (req, res) => {
    try {
        const { to, subject, body, recipientType = 'other', emailType = 'general' } = req.body;
        
        if (!to || !subject || !body) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        
        if (!to.includes('@')) {
            return res.status(400).json({ success: false, message: 'Invalid email address' });
        }

        const result = await sendEmail(to, subject, body, emailType, recipientType, req.user?.id || null);

        if (result.success) {
            return res.json({ success: true, message: 'Email sent successfully', messageId: result.messageId });
        } else {
            return res.status(500).json({ success: false, message: 'Failed to send email: ' + result.error });
        }
    } catch (error) {
        console.error('Error in send email API:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get Email Logs API
app.get('/api/emails', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;
        let query = 'SELECT * FROM email_logs';
        const params = [];
        
        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY sent_at DESC LIMIT 100'; // Limit to last 100 emails
        
        const connection = await mysql.createConnection(dbConfig);
        
        try {
            const [emails] = await connection.execute(query, params);
            await connection.end();
            
            res.json({
                success: true,
                emails: emails
            });
        } catch (tableError) {
            await connection.end();
            // Table doesn't exist yet
            res.json({
                success: true,
                emails: []
            });
        }
        
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({ success: false, message: 'Error fetching emails' });
    }
});

// Get Today's Email Count API
app.get('/api/emails/today-count', authenticateToken, async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        try {
            const [result] = await connection.execute(
                'SELECT COUNT(*) as count FROM email_logs WHERE DATE(sent_at) = CURDATE() AND status = "sent"'
            );
            await connection.end();
            
            res.json({
                success: true,
                count: result[0].count || 0
            });
        } catch (tableError) {
            await connection.end();
            res.json({
                success: true,
                count: 0
            });
        }
        
    } catch (error) {
        console.error('Error fetching today email count:', error);
        res.status(500).json({ success: false, message: 'Error fetching email count' });
    }
});


// Employee Registration API
app.post("/api/register-employee", async (req, res) => {
    try {
        const {name, contact_no, alternate_no, email, joining_company, joining_date, position} = req.body;
        
        // Input validation
        if (!name || !email || !contact_no || !joining_company || !joining_date || !position) {
            return res.status(400).json({ success: false, message: 'All required fields must be filled' });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }
        
        const connection = await mysql.createConnection(dbConfig);
        
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const [result] = await connection.execute(
            `INSERT INTO employees (name, contact_no, alternate_no, email, joining_company, joining_date, position, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
            [name, contact_no, alternate_no, email, joining_company, joining_date, position]
        );
        
        await connection.end();
        
        // Send confirmation email
        try {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
                </div>
            `;

            await sendEmail(email, 'Employee Registration Successful - Nexsphere Global', emailHtml, 'registration', 'employee');

            res.json({
                success: true,
                message: 'Employee registered successfully',
                employeeId: result.insertId
            });

        } catch (emailError) {
            console.error('Error sending email:', emailError);
            res.json({
                success: true,
                message: 'Employee registered successfully, but confirmation email sending failed',
                employeeId: result.insertId
            });
        }
    } catch (error) {
        console.error('Error registering employee:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ success: false, message: 'Employee with this email already exists' });
        } else {
            res.status(500).json({ success: false, message: 'Error registering employee: ' + error.message });
        }
    }
});

// Create Razorpay order for employer registration fee
app.post('/api/employer/create-order', async (req, res) => {
    try {
        const { name, company_name, business_email, business_number, location, designation, company_size } = req.body;
        
        // Input validation
        if (!name || !company_name || !business_email || !business_number || !location || !designation || !company_size) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        
        // Create unique receipt ID
        const receiptId = `receipt_emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const options = {
            amount: 999 * 100, // amount in paise (₹999)
            currency: "INR",
            receipt: receiptId,
            notes: {
                company_name: company_name,
                business_email: business_email,
                purpose: "Employer Registration Fee"
            }
        };
        
        const order = await razorpayInstance.orders.create(options);

        // Store order details in the database
        const connection = await mysql.createConnection(dbConfig);
        
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
        
        await connection.execute(
            `INSERT INTO payments 
             (razorpay_order_id, amount, currency,payment_status, name, company_name, business_email, business_number, location, designation, company_size, payment_type, receipt_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
            [order.id, 999, 'INR', 'created', name, company_name, business_email, business_number, location, designation, company_size, 'employer_registration', receiptId]
        );
        
        await connection.end();

        res.json({ 
            success: true, 
            orderId: order.id,
            amount: order.amount,
            currency:order.currency,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Employer order creation failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create payment order: ' + error.message
        });
    } 
});

// Employer Registration after payment verification
app.post('/api/employer/register', async (req, res) => {
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
            return res.status(400).json({ success: false, message: 'Payment verification data is missing' });
        }

        // Verify payment signature
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        const connection = await mysql.createConnection(dbConfig);

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
            await connection.end();
            return res.status(400).json({ success: false, message: 'Payment record not found' });
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

        // Insert employer details into the employers table
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

        await connection.end();

        // Send confirmation email to employer
        try {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
                </div>
            `;

            await sendEmail(business_email, 'Employer Registration Successful - Nexsphere Global', emailHtml, 'registration', 'employer');
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
        }

        res.json({
            success: true,
            message: 'Employer registered successfully',
            employerId: result.insertId,
            paymentId: razorpay_payment_id
        });
        
    } catch (error) {
        console.error('Error registering employer:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ success: false, message: 'Employer with this email already exists' });
        } else {
            res.status(500).json({ success: false, message: 'Error registering employer: ' + error.message });
        }
    }
});

// Webhook to handle Razorpay payment events
app.post('/api/razorpay/webhook', async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const shasum = crypto.createHmac('sha256', secret);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.digest('hex');

        if (digest === req.headers['x-razorpay-signature']) {
            const event = req.body.event;
            const payment = req.body.payload.payment.entity;

            if (event === 'payment.captured') {
                // Update payment status in database
                const connection = await mysql.createConnection(dbConfig);
                await connection.execute(
                    `UPDATE payments SET 
                     payment_status = 'paid', 
                     payment_method = ?, 
                     payment_date = NOW(),
                     updated_at = NOW()
                     WHERE razorpay_payment_id = ?`,
                    [payment.method, payment.id]
                );
                await connection.end();
                
                console.log('Payment captured webhook processed:', payment.id);
            }
        }
        
        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Manual payment verification endpoint (for UPI/QR payments)
app.post('/api/employer/manual-payment', async (req, res) => {
    try {
        const paymentData = req.body;
        const connection = await mysql.createConnection(dbConfig);
        
        // Generate a manual payment ID
        const manualPaymentId = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create payment record for manual verification
        const [paymentResult] = await connection.execute(
            `INSERT INTO payments 
             (amount, currency, payment_status, name, company_name, business_email, business_number, location, designation, company_size, payment_type, razorpay_payment_id, payment_method)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [999, 'INR', 'pending_verification', paymentData.name, paymentData.company_name, paymentData.business_email, paymentData.business_number, paymentData.location, paymentData.designation, paymentData.company_size, 'employer_registration', manualPaymentId, paymentData.payment_method]
        );
        
        await connection.end();
        
        res.json({
            success: true,
            message: 'Payment submitted for verification',
            paymentId: manualPaymentId,
            note: 'Your registration will be activated within 24 hours after payment verification'
        });
        
    } catch (error) {
        console.error('Manual payment processing error:', error);
        res.status(500).json({ success: false, message: 'Error processing manual payment' });
    }
});

// Test endpoint to check if server is running
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running', 
        timestamp: new Date().toISOString(),
        razorpay_configured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
    });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Test database connection
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('SELECT 1');
        await connection.end();
        
        res.json({
            success: true,
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Serve static files - should come after API routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Start the server
// app.listen(port, () => {
//     console.log(`Server is running on port ${port}`);
//     console.log(`Access the application at: http://localhost:${port}`);
//     console.log('Make sure your .env file contains the required database and other configurations');
//     console.log('Required .env variables:');
//     console.log('- DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
//     console.log('- RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET');
//     console.log('- EMAIL_USER, EMAIL_PASSWORD');
//     console.log('- JWT_SECRET');
// });

// server.js
// <CHANGE> Express app exported for Vercel serverless (no app.listen)

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise"); // or remove if not using


// Middlewares
app.use(cors());
app.use(express.json());

// Optional: simple root so "/" never 404s at the app level
app.get("/", (_req, res) => {
  res.status(200).send("Nexsphere API is live");
});

// Example health check that verifies DB connectivity (adjust envs)
app.get("/health", async (_req, res) => {
  try {
    if (!process.env.DB_HOST) {
      return res.json({ ok: true, note: "DB not configured" });
    }

    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await conn.ping();
    await conn.end();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* 
// ... existing code ...
// <CHANGE> Move ALL your existing routes/middleware here.
// DO NOT call app.listen() anywhere.
*/

// Optional: app-level 404 (so unmatched routes return JSON instead of Vercel 404 card)
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.path });
});

// <CHANGE> Export the app for Vercel's Node builder
module.exports = app;
