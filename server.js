require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 3000;

// EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-session-secret',
  resave: false,
  saveUninitialized: true
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup for file uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Helper functions
async function fetchCandidates() {
  const [candidates] = await pool.query('SELECT * FROM candidates');
  return candidates;
}
async function fetchLogs() {
  const [logs] = await pool.query('SELECT * FROM logs ORDER BY log_time DESC');
  return logs;
}
async function fetchVoters() {
  const [voters] = await pool.query('SELECT * FROM voters');
  return voters;
}
async function fetchPreRegisteredStudents() {
  const [students] = await pool.query('SELECT * FROM pre_registered_students');
  return students;
}

// Landing page
app.get(['/', '/landing'], (req, res) => {
  res.render('landing');
});
app.post('/landing', (req, res) => {
  res.redirect('/landing');
});

app.get('/voters/register', (req, res) => {
  res.render('votersreg', { error: null });
});
app.post('/voters/register', (req, res) => {
  res.render('votersreg');
});

// About page
app.get('/about', (req, res) => {
  res.render('about');
});
app.post('/about', (req, res) => {
  res.render('about');
});

// Index page
app.get('/index', (req, res) => {
  res.render('index');
});
app.post('/index', (req, res) => {
  res.render('index');
});

// --- ADMIN AREA ---

const ADMIN_PASSWORD = '1234'; // Change as needed

app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) {
    res.redirect('/admin');
  } else {
    res.render('adminlogin', { error: null });
  }
});

app.post('/admin/login', (req, res) => {
  req.session.isAdmin = true;
  res.redirect('/admin');
});


app.get('/admin', (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  res.render('admin', {
    candidates: [],
    logs: [],
    voters: [],
    preRegistered: [],
    error: null
  });
});

// Approve candidate
app.post('/admin/candidate/approve', async (req, res) => {
  const { id } = req.body;
  let error = null;
  try {
    await pool.query('UPDATE candidates SET approved = TRUE WHERE id = ?', [id]);
    await pool.query('INSERT INTO logs (action, details) VALUES (?, ?)', ['Approve Candidate', `Candidate ID: ${id} approved`]);
  } catch (err) {
    console.error(err);
    error = 'Error approving candidate.';
  }
  const candidates = await fetchCandidates();
  const logs = await fetchLogs();
  const voters = await fetchVoters();
  const preRegistered = await fetchPreRegisteredStudents();
  res.render('admin', { candidates, logs, voters, preRegistered, error });
});

// Add candidate
app.post('/admin/candidate/add', upload.single('pic'), async (req, res) => {
  const {
    id,
    name,
    bio,
    position,
    department,
    level,
    experience,
    achievements,
    vision,
    manifesto,
    skills,
    motto,
    extracurricular,
    academic_achievements,
    contact,
    social_media
  } = req.body;
  let error = null;
  if (!id || !name) {
    error = 'Candidate ID and Name are required.';
  } else {
    try {
      const pic = req.file ? `/uploads/${req.file.filename}` : '';
      await pool.query(
        `INSERT INTO candidates 
          (id, name, bio, position, department, level, experience, achievements, vision, manifesto, skills, motto, extracurricular, academic_achievements, contact, social_media, pic, votes, approved) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, FALSE)`,
        [
          id,
          name,
          bio || '',
          position,
          department,
          level,
          experience,
          achievements,
          vision,
          manifesto,
          skills,
          motto,
          extracurricular,
          academic_achievements,
          contact,
          social_media,
          pic
        ]
      );
      await pool.query(
        'INSERT INTO logs (action, details) VALUES (?, ?)',
        ['Add Candidate', `Candidate Name: ${name}`]
      );
    } catch (err) {
      console.error(err);
      error = 'Database error.';
    }
  }
  // ...fetch and render as before

  const candidates = await fetchCandidates();
  const logs = await fetchLogs();
  const voters = await fetchVoters();
  const preRegistered = await fetchPreRegisteredStudents();
  res.render('admin', { candidates, logs, voters, preRegistered, error });
});


// Add voter
app.post('/admin/voter/add', async (req, res) => {
  const { fingerprint_id } = req.body;
  let error = null;
  if (!fingerprint_id) {
    error = 'Fingerprint ID is required.';
  } else {
    try {
      const [existing] = await pool.query('SELECT * FROM voters WHERE fingerprint_id = ?', [fingerprint_id]);
      if (existing.length > 0) {
        error = 'Voter already exists.';
      } else {
        await pool.query('INSERT INTO voters (fingerprint_id, approved, has_voted) VALUES (?, FALSE, FALSE)', [fingerprint_id]);
        await pool.query('INSERT INTO logs (action, details) VALUES (?, ?)', ['Add Voter', `Voter Fingerprint ID: ${fingerprint_id}`]);
      }
    } catch (err) {
      console.error(err);
      error = 'Database error.';
    }
  }
  const candidates = await fetchCandidates();
  const logs = await fetchLogs();
  const voters = await fetchVoters();
  const preRegistered = await fetchPreRegisteredStudents();
  res.render('admin', { candidates, logs, voters, preRegistered, error });
});

// Approve voter
app.post('/admin/voter/approve', async (req, res) => {
  const { fingerprint_id } = req.body;
  let error = null;
  try {
    await pool.query('UPDATE voters SET approved = TRUE WHERE fingerprint_id = ?', [fingerprint_id]);
    await pool.query('INSERT INTO logs (action, details) VALUES (?, ?)', ['Approve Voter', `Voter Fingerprint ID: ${fingerprint_id} approved`]);
  } catch (err) {
    console.error(err);
    error = 'Error approving voter.';
  }
  const candidates = await fetchCandidates();
  const logs = await fetchLogs();
  const voters = await fetchVoters();
  const preRegistered = await fetchPreRegisteredStudents();
  res.render('admin', { candidates, logs, voters, preRegistered, error });
});

// Pre-register student (add)
app.post('/admin/pre-register-student', async (req, res) => {
  const { matric_number, name, receipt_id, department, level } = req.body;
  let error = null;
  try {
    await pool.query(
      'INSERT INTO pre_registered_students (matric_number, name, receipt_id, department, level) VALUES (?, ?, ?, ?, ?)',
      [matric_number, name, receipt_id, department, level]
    );
  } catch (err) {
    console.error(err);
    error = 'Student already pre-registered or database error.';
  }
  const candidates = await fetchCandidates();
  const logs = await fetchLogs();
  const voters = await fetchVoters();
  const preRegistered = await fetchPreRegisteredStudents();
  res.render('admin', { candidates, logs, voters, preRegistered, error });
});

// Edit pre-registered student (GET)
app.get('/admin/pre-register-student/edit/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM pre_registered_students WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.redirect('/admin');
  res.render('edit_pre_registered', { student: rows, error: null });
});

// Edit pre-registered student (POST)
app.post('/admin/pre-register-student/edit/:id', async (req, res) => {
  const { matric_number, name, receipt_id, department, level } = req.body;
  let error = null;
  try {
    await pool.query(
      'UPDATE pre_registered_students SET matric_number=?, name=?, receipt_id=?, department=?, level=? WHERE id=?',
      [matric_number, name, receipt_id, department, level, req.params.id]
    );
  } catch (err) {
    console.error(err);
    error = 'Error updating student.';
  }
  const candidates = await fetchCandidates();
  const logs = await fetchLogs();
  const voters = await fetchVoters();
  const preRegistered = await fetchPreRegisteredStudents();
  res.render('admin', { candidates, logs, voters, preRegistered, error });
});

// Delete pre-registered student
app.post('/admin/pre-register-student/delete/:id', async (req, res) => {
  let error = null;
  try {
    await pool.query('DELETE FROM pre_registered_students WHERE id = ?', [req.params.id]);
  } catch (err) {
    console.error(err);
    error = 'Error deleting student.';
  }
  const candidates = await fetchCandidates();
  const logs = await fetchLogs();
  const voters = await fetchVoters();
  const preRegistered = await fetchPreRegisteredStudents();
  res.render('admin', { candidates, logs, voters, preRegistered, error });
});

// --- CANDIDATE & VOTER ROUTES ---

// Candidate Login Page (GET)
app.get('/candidate/login', (req, res) => {
  res.render('candidatelogin', { error: null });
});

app.post('/candidate/login', (req, res) => {
  const { candidate_id } = req.body;
  req.session.candidate_id = candidate_id || 'mock_id';
  res.redirect('/candidate');
});
app.get('/candidate', (req, res) => {
  if (!req.session.candidate_id) return res.redirect('/candidate/login');

  const mockCandidate = {
    id: req.session.candidate_id,
    name: 'Mock Candidate',
    position: 'President',
    department: 'Computer Science',
    level: '400',
    pic: '', // You can use a placeholder image here if needed
  };

  const mockCandidates = [mockCandidate]; // You can add more dummy candidates if needed

  res.render('candidate', {
    candidate: mockCandidate,
    candidates: mockCandidates,
    error: null
  });
});

// Delete candidate
app.post('/admin/candidate/delete', async (req, res) => {
  const { id } = req.body;
  let error = null;
  try {
    // Optionally, delete candidate's image file from uploads
    const [rows] = await pool.query('SELECT pic FROM candidates WHERE id = ?', [id]);
    if (rows.length && rows[0].pic) {
      const picPath = path.join(__dirname, rows[0].pic);
      if (fs.existsSync(picPath)) {
        fs.unlinkSync(picPath);
      }
    }
    await pool.query('DELETE FROM candidates WHERE id = ?', [id]);
    await pool.query('INSERT INTO logs (action, details) VALUES (?, ?)', ['Delete Candidate', `Candidate ID: ${id} deleted`]);
  } catch (err) {
    console.error(err);
    error = 'Error deleting candidate.';
  }
  const candidates = await fetchCandidates();
  const logs = await fetchLogs();
  const voters = await fetchVoters();
  const preRegistered = await fetchPreRegisteredStudents();
  res.render('admin', { candidates, logs, voters, preRegistered, error });
});
// Show edit form for candidate
app.get('/admin/candidate/edit/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM candidates WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.redirect('/admin');
  res.render('edit_candidate', { candidate: rows[0], error: null });
});

// Handle edit form submission
app.post('/admin/candidate/edit/:id', upload.single('pic'), async (req, res) => {
  const { name, bio } = req.body;
  let error = null;
  try {
    let pic = null;
    if (req.file) {
      pic = `/uploads/${req.file.filename}`;
      // Optionally, delete old pic
      const [rows] = await pool.query('SELECT pic FROM candidates WHERE id = ?', [req.params.id]);
      if (rows.length && rows[0].pic) {
        const oldPicPath = path.join(__dirname, rows[0].pic);
        if (fs.existsSync(oldPicPath)) {
          fs.unlinkSync(oldPicPath);
        }
      }
    }
    if (pic) {
      await pool.query('UPDATE candidates SET name=?, bio=?, pic=? WHERE id=?', [name, bio, pic, req.params.id]);
    } else {
      await pool.query('UPDATE candidates SET name=?, bio=? WHERE id=?', [name, bio, req.params.id]);
    }
    await pool.query('INSERT INTO logs (action, details) VALUES (?, ?)', ['Edit Candidate', `Candidate ID: ${req.params.id} edited`]);
  } catch (err) {
    console.error(err);
    error = 'Error updating candidate.';
  }
  const candidates = await fetchCandidates();
  const logs = await fetchLogs();
  const voters = await fetchVoters();
  const preRegistered = await fetchPreRegisteredStudents();
  res.render('admin', { candidates, logs, voters, preRegistered, error });
});
app.post('/admin/candidate/delete', async (req, res) => {
  const { id } = req.body;
  let error = null;
  try {
    // Optionally delete candidate's image file
    const [rows] = await pool.query('SELECT pic FROM candidates WHERE id = ?', [id]);
    if (rows.length && rows[0].pic) {
      const picPath = path.join(__dirname, rows[0].pic);
      try {
        if (fs.existsSync(picPath)) fs.unlinkSync(picPath);
      } catch (fileErr) {
        console.error('Image delete error:', fileErr);
      }
    }
    const [result] = await pool.query('DELETE FROM candidates WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      error = 'Candidate not found.';
    }
  } catch (err) {
    console.error('Delete error:', err);
    error = 'Error deleting candidate.';
  }
  // reload data and render page
  // ...
});

// Candidate Logout
app.get('/candidate/logout', (req, res) => {
  req.session.candidate_id = null;
  res.redirect('/candidate/login');
});

// Voter Registration Page (GET)
app.get('/voters/register', (req, res) => {
  res.render('votersreg', { error: null });
});

app.post('/voters/register', async (req, res) => {
  const { matric_number, name, receipt_id, department, level } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM pre_registered_students WHERE matric_number = ? AND name = ? AND receipt_id = ?',
      [matric_number, name, receipt_id]
    );
    if (rows.length === 0) {
      return res.render('votersreg', { error: 'You are not a pre-registered student. Contact admin.' });
    }
    await pool.query(
      'INSERT INTO voters (matric_number, name, receipt_id, department, level, approved, has_voted) VALUES (?, ?, ?, ?, ?, TRUE, FALSE)',
      [matric_number, name, receipt_id, department, level]
    );
    res.redirect('/voters/login');
  } catch (err) {
    console.error(err);
    res.render('votersreg', { error: 'Already registered or database error.' });
  }
});
// --- Voter Login Page (GET) ---
app.get('/voters/login', (req, res) => {
  res.render('voterslogin', { error: null });
});

// --- Voter Login (POST) ---
app.post('/voters/login', (req, res) => {
  const { matric_number } = req.body;
  req.session.matric_number = matric_number || 'mock_matric';
  req.session.voter_name = 'Mock Voter';
  res.redirect('/voter/dashboard');
});

app.get('/voter/dashboard', (req, res) => {
  const voter = {
    name: 'John Doe',
    matric_number: 'FCAHPT/1234',
    department: 'Computer Science',
    level: 'ND2'
  };

  const candidates = [
    {
      id: 1,
      name: 'Jane Candidate',
      position: 'President',
      votes: 10,
      department: 'Computer Science'
    },
    {
      id: 2,
      name: 'Mark Leader',
      position: 'Vice President',
      votes: 8,
      department: 'Animal Health'
    }
  ];

  const votingOpen = true;
  const lastUpdated = new Date().toLocaleString();

  res.render('voter', {
    voter,
    candidates,
    message: null,
    messageType: null,
    error: null,
    votingOpen,
    lastUpdated
  });
});


app.post('/voter/vote', async (req, res) => {
  if (!req.session.matric_number) return res.redirect('/voters/login');
  try {
    // 1. Check if voter has already voted
    const [voterStatusRows] = await pool.query(
      'SELECT * FROM voters WHERE matric_number = ?',
      [req.session.matric_number]
    );
    if (!voterStatusRows.length) {
      // Voter not found in voters table
      return res.render('voter', {
        voter: null,
        candidates: [],
        message: 'Voter not found.',
        messageType: 'error',
        error: 'Voter not found.',
        votingOpen: false,
        lastUpdated: new Date().toLocaleString()
      });
    }
    const voterStatus = voterStatusRows[0];
    if (voterStatus.has_voted) {
      // Already voted, show only results
      const [candidates] = await pool.query('SELECT * FROM candidates');
      return res.render('voter', {
        voter: voterStatus,
        candidates,
        message: 'You have already voted. You can only view results.',
        messageType: 'info',
        error: null,
        votingOpen: true,
        lastUpdated: new Date().toLocaleString()
      });
    }

    // 2. Parse votes from form
    const votes = {};
    Object.keys(req.body).forEach(key => {
      if (key.startsWith('vote_')) {
        votes[key.replace('vote_', '')] = req.body[key];
      }
    });

    // 3. Increment candidate votes
    for (const position in votes) {
      const candidateId = votes[position];
      await pool.query('UPDATE candidates SET votes = votes + 1 WHERE id = ?', [candidateId]);
    }

    // 4. Mark the voter as having voted
    await pool.query('UPDATE voters SET has_voted = 1 WHERE matric_number = ?', [req.session.matric_number]);

    // 5. Reload data for dashboard
    const [voterRows] = await pool.query(
      'SELECT * FROM voters WHERE matric_number = ?',
      [req.session.matric_number]
    );
    const voter = voterRows[0];
    const [candidates] = await pool.query('SELECT * FROM candidates');
    const votingOpen = true;
    const lastUpdated = new Date().toLocaleString();

    res.render('voter', {
      voter,
      candidates,
      message: 'Your vote has been recorded!',
      messageType: 'success',
      error: null,
      votingOpen,
      lastUpdated
    });
  } catch (err) {
    console.error(err);
    res.render('voter', {
      voter: null,
      candidates: [],
      message: 'Failed to record your vote.',
      messageType: 'error',
      error: 'Failed to record your vote.',
      votingOpen: false,
      lastUpdated: new Date().toLocaleString()
    });
  }
});

// --- Voter Logout (Optional) ---
app.get('/voters/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/voters/login');
  });
});

app.get('/contact', (req, res) => {
  res.render('contact', { message: null, error: null });
});
app.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;
  
  res.render('contact', { message: 'Your message has been sent. We will reply soon.', error: null });
});
app.get('/help', (req, res) => {
  res.render('faq'); 
});



// --- START SERVER ---
app.listen(PORT, () => {
  const localUrl = `http://localhost:${PORT}`;
  console.log(`Server running on port ${PORT}`);
  console.log(`Open your browser and visit: ${localUrl}`);
});
