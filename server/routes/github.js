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
        per_page: 100
      }
    });

    // Format the response to only include necessary data
    const repos = response.data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
      description: repo.description,
      language: repo.language,
      updated_at: repo.updated_at,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url,
        html_url: repo.owner.html_url
      }
    }));

    res.json(repos);
  } catch (error) {
    console.error('GitHub API Error:', error.message);
    
    if (error.response) {
      // Forward the GitHub API error
      return res.status(error.response.status).json({
        error: 'Failed to fetch repositories',
        details: error.response.data
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch repositories',
      details: error.message
    });
  }
});

// Get repository contents
router.post('/repo/contents', verifyGitHubToken, async (req, res) => {
  const { owner, repo, path = '' } = req.body;
  
  if (!owner || !repo) {
    return res.status(400).json({ error: 'Owner and repo name are required' });
  }

  try {
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
    console.error('GitHub API Error:', error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'Failed to fetch repository contents',
        details: error.response.data
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch repository contents',
      details: error.message
    });
  }
});

module.exports = router;
