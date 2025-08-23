const mysql = require('mysql2');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const bycrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const razorpay = require('razorpay');
const nodeMailer = require('nodemailer');
const crypto = require('crypto');
const formidable = require('formidable');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());

// Database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST ,
    user:process.env.DB_USER ,
    password: process.env.DB_PASSWORD ,
    database: process.env.DB_NAME,
});

//Razorpay instance
const razorpay = new Razorpay ({
    key_id : process.env.RAZORPAY_KEY_ID,
    key_secret : process.env.RAZORPAY_KEY_SECRET,
});

// Email transporter setup
const transporter = nodeMailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// Connect to the database
db.connect((err)=>{
    if(err){
        console.log('Error connecting to the Mysql:', err);
        return;  
    }
     console.log('Connected to Mysql');     
})


// Employee Registration API
app.post("/register-employee",(req, res) => {
    const{name,contact_no,alternate_no,email, joining_company, joining_date, position} = req.body;
    
    const sql =`INSERT INTO employees
                 (name, contact_no, alternate_no, email, joining_company, joining_date, position) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [name, contact_no, alternate_no, email, joining_company, joining_date, position], (err, result) => {
        if(err){
            console.log('Error inserting data:', err);
            res.status(500).send('Error inserting data');
            return;
        }
        res.status(200).send('Employee registered successfully');
    });
});

// Employer Registration API
app.post("/register-employer", (req, res) => {
    const { company_name, location, business_email, business_number, position_name, company_size } = req.body;

    const sql = `INSERT INTO employers 
                 (company_name, location, business_email, business_number, position_name, company_size) 
                 VALUES (?, ?, ?, ?, ?, ?)`;

    db.query(sql, [company_name, location, business_email, business_number, position_name, company_size], (err, result) => {
        if (err) {
            console.error("❌ Error inserting employer:", err);
            return res.status(500).send("Error saving employer");
        }
        res.send("✅ Employer registered successfully");
    });
});

// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});