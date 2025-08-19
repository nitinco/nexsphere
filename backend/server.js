const mysql = require('mysql2');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
    host: 'localhost',
    user:'root',
    password: 'Password',
    database: 'nexsphere',
});

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