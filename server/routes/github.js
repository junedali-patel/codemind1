const express = require('express');
const axios = require('axios');
const router = express.Router();

// Middleware to verify GitHub access token
const verifyGitHubToken = (req, res, next) => {
  const { accessToken } = req.body;
  
  if (!accessToken) {
    return res.status(400).json({ error: 'GitHub access token is required' });
  }
  
  req.githubAccessToken = accessToken;
  next();
};

// Fetch user's GitHub repositories
router.post('/repos', verifyGitHubToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        'Authorization': `token ${req.githubAccessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeMind.AI'
      },
      params: {
        sort: 'updated',
        per_page: 100,
        page: req.query.page || 1
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('GitHub API Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch repositories',
      details: error.response?.data || error.message
    });
  }
});

// Get repository content
router.post('/repo-content', verifyGitHubToken, async (req, res) => {
  try {
    const { owner, repo, path = '' } = req.body;
    
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Owner and repo are required' });
    }

    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          'Authorization': `token ${req.githubAccessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'CodeMind.AI'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('GitHub API Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch repository content',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;