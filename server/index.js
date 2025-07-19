// Load environment variables first
require('dotenv').config({ path: __dirname + '/.env' });

console.log('Environment variables loaded. OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);

const express = require('express');
const cors = require('cors');
const githubRoutes = require('./routes/github');
const aiRoutes = require('./routes/ai');

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // Allow only the frontend to access
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/github', githubRoutes);
app.use('/api/ai', aiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});
