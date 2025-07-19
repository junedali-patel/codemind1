const express = require('express');
const router = express.Router();
const { Ollama } = require('ollama');

// Initialize Ollama with timeout and retry options
const ollama = new Ollama({ 
  host: 'http://127.0.0.1:11434',
  requestTimeout: 60000 // 60 seconds timeout
});

// Simple fallback responses
const FALLBACK_RESPONSES = [
  "// Here's a suggestion: Consider refactoring this code for better readability.",
  "// Try implementing error handling here for better reliability.",
  "// Consider adding input validation for this function.",
  "// You might want to add comments explaining this logic.",
  "// Consider breaking this into smaller, more focused functions."
];

// Helper function to get a random fallback response
function getFallbackResponse() {
  return FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
}

// Helper function to describe file types
function getFileTypeDescription(extension) {
  const descriptions = {
    'js': 'JavaScript source files containing application logic',
    'ts': 'TypeScript source files with type definitions',
    'jsx': 'React component files with JSX syntax',
    'tsx': 'TypeScript React components',
    'json': 'Configuration and data files in JSON format',
    'md': 'Markdown documentation files',
    'css': 'Cascading Style Sheets for styling',
    'scss': 'SASS/SCSS styles with advanced features',
    'html': 'HTML markup files',
    'py': 'Python source code files',
    'java': 'Java source code files',
    'kt': 'Kotlin source code files',
    'go': 'Go source code files',
    'rs': 'Rust source code files',
    'rb': 'Ruby source code files',
    'php': 'PHP server-side scripts',
    'sql': 'SQL database queries and schemas',
    'sh': 'Shell scripts for automation',
    'yaml': 'YAML configuration files',
    'yml': 'YAML configuration files (alternative extension)',
    'xml': 'XML configuration and data files',
    'toml': 'TOML configuration files',
    'lock': 'Dependency lock files',
    'gitignore': 'Git ignore rules',
    'dockerfile': 'Docker container configuration',
    'env': 'Environment variable files',
    'example': 'Example configuration files',
    'test': 'Test files',
    'spec': 'Test specification files',
    'snap': 'Test snapshots'
  };
  
  return descriptions[extension.toLowerCase()] || `Files with .${extension} extension`;
}

// POST /api/ai/complete
router.post('/complete', async (req, res) => {
  const { code } = req.body;
  
  console.log('Received request for code completion');
  console.log('Code length:', code?.length || 0);

  if (!code) {
    console.error('No code provided in request');
    return res.status(400).json({ error: 'No code provided' });
  }

  try {
    console.log('Sending request to Ollama...');
    
    // First try to get available models
    let models = [];
    try {
      models = (await ollama.list()).models;
      console.log('Available models:', models);
    } catch (modelErr) {
      console.warn('Could not fetch model list:', modelErr.message);
    }
    
    let suggestion;
    
    try {
      // Try with the instructed model first, then fallback to others
      const modelToUse = models.some(m => m.name === 'codellama:7b-instruct') ? 'codellama:7b-instruct' :
                        models.some(m => m.name === 'codellama:7b') ? 'codellama:7b' : 'codellama:13b';
      
      console.log(`Using model: ${modelToUse}`);
      const response = await Promise.race([
        ollama.chat({
          model: modelToUse,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful coding assistant. Respond only with the completed or improved code, no explanations.'
            },
            {
              role: 'user',
              content: `Complete or improve the following code (respond with code only):\n\n${code}`
            }
          ],
          options: {
            num_predict: 50,  // Reduced for faster response
            temperature: 0.2,
            top_p: 0.9,
            top_k: 30
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timed out after 20 seconds')), 20000)
        )
      ]);
      
      console.log('Ollama response received');
      suggestion = response.message?.content.trim() || '';
    } catch (aiError) {
      console.error('AI generation error:', aiError);
      // Return a fallback response if AI fails
      suggestion = getFallbackResponse();
    }
    
    // Clean up the response to remove any explanations
    const cleanSuggestion = suggestion.split('\n').filter(line => 
      !line.trim().startsWith('//') && 
      !line.trim().startsWith('#') && 
      !line.trim().startsWith('/*') &&
      !line.trim().startsWith('```') &&
      line.trim() !== ''
    ).join('\n').trim();
    
    res.json({ suggestion: cleanSuggestion });
  } catch (err) {
    console.error('Ollama API Error:', err);
    
    // More detailed error response
    res.status(500).json({ 
      error: "Failed to get AI completion. Make sure Ollama is running and the model is downloaded.",
      details: err.message,
      suggestion: 'Run `ollama run codellama:13b` in your terminal to download the model first.'
    });
  }
});

// POST /api/ai/analyze-repo
router.post('/analyze-repo', async (req, res) => {
  const { files, owner, repo } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    console.error('No files provided for repository analysis');
    return res.status(400).json({ error: 'No files provided for analysis' });
  }

  try {
    console.log(`Starting analysis of ${owner}/${repo} with ${files.length} files`);
    
    // Create a structured overview of the repository
    const fileStructure = files.map(file => ({
      path: file.path,
      language: file.language || 'unknown',
      size: file.size || 0
    }));

    // Find and analyze package management files
    const packageFiles = {
      'package.json': files.find(f => f.path.endsWith('package.json')),
      'requirements.txt': files.find(f => f.path.endsWith('requirements.txt')),
      'pom.xml': files.find(f => f.path.endsWith('pom.xml')),
      'build.gradle': files.find(f => f.path.endsWith('build.gradle')),
      'composer.json': files.find(f => f.path.endsWith('composer.json')),
      'Gemfile': files.find(f => f.path.endsWith('Gemfile')),
      'Cargo.toml': files.find(f => f.path.endsWith('Cargo.toml'))
    };

    // Get dependency information from package files
    const getDependencies = (file) => {
      if (!file || !file.content) return [];
      try {
        if (file.path.endsWith('package.json')) {
          const pkg = JSON.parse(file.content);
          return Object.entries({
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {})
          }).map(([name, version]) => ({ name, version }));
        }
        // Add other package managers as needed
      } catch (e) {
        console.error(`Error parsing ${file.path}:`, e);
      }
      return [];
    };

    const allDependencies = [];
    Object.values(packageFiles).forEach(file => {
      if (file) allDependencies.push(...getDependencies(file));
    });

    // Group files by type and directory
    const fileTypes = files.reduce((acc, file) => {
      const ext = file.path.split('.').pop() || 'other';
      if (!acc[ext]) acc[ext] = [];
      acc[ext].push(file);
      return acc;
    }, {});

    // Analyze directory structure
    const dirStructure = {};
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = dirStructure;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        
        if (!current[part]) {
          current[part] = isFile 
            ? { _type: 'file', path: file.path, language: file.language, size: file.size }
            : { _type: 'dir' };
        }
        
        if (!isFile) {
          current = current[part];
        }
      }
    });

    // Find entry points and important files
    const entryPoints = files.filter(file => 
      file.path.match(/(src\/index|app\/main|src\/main|src\/app)/) ||
      file.path.endsWith('main.js') ||
      file.path.endsWith('app.js') ||
      file.path.endsWith('index.js')
    ).slice(0, 5);

    // Find test files
    const testFiles = files.filter(file => 
      file.path.includes('test/') || 
      file.path.includes('__tests__/') ||
      file.path.endsWith('.test.js') ||
      file.path.endsWith('.spec.js')
    ).slice(0, 5);

    // Find configuration files
    const configFiles = files.filter(file => 
      file.path.match(/\.(json|yaml|yml|toml|env|config|conf|rc)$/) ||
      file.path.match(/(package\.json|webpack\.config|babel\.config|tsconfig\.json|jest\.config)/)
    ).slice(0, 5);

    // Find documentation files
    const docFiles = files.filter(file => 
      file.path.match(/(README|CONTRIBUTING|LICENSE|CHANGELOG|CODE_OF_CONDUCT)/i)
    ).slice(0, 5);

    // Prepare the analysis prompt
    const prompt = `# 🔍 In-Depth Repository Analysis: ${owner}/${repo}

## 📊 Repository Overview
- **Total Files**: ${files.length} files
- **Total Size**: ${(files.reduce((sum, f) => sum + (f.size || 0), 0) / 1024).toFixed(2)} KB
- **File Types**: ${Object.entries(fileTypes)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([ext, files]) => `${ext} (${files.length})`)
    .join(', ')}
- **Main Directories**: ${[...new Set(files.map(f => f.path.split('/')[0]))].join(', ')}
- **Last Modified**: ${new Date(Math.max(...files.map(f => new Date(f.updated_at || f.created_at || 0).getTime()))).toLocaleDateString()}

## 🏗️ Project Structure Deep Dive

### 📂 Directory Structure Analysis
\`\`\`json
${JSON.stringify(dirStructure, null, 2).slice(0, 1500)}...
\`\`\`

### 📦 Dependencies Analysis (${allDependencies.length} total)
${allDependencies.length > 0 
  ? allDependencies
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(dep => `- **${dep.name}** (${dep.version})`).join('\n')
  : 'No package files found or could not parse dependencies.'}

### 🧩 File Type Distribution
${Object.entries(fileTypes)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([ext, files]) => `- **.${ext}**: ${files.length} files (${(files.length / files.length * 100).toFixed(1)}%) - ${getFileTypeDescription(ext)}`)
  .join('\n')}

## 🔍 Detailed Analysis Request

### 1. Project Overview & Purpose
- [ ] **Core Functionality**: What problem does this project solve?
- [ ] **Target Audience**: Who is this project intended for?
- [ ] **Technical Stack**: List all major technologies used
- [ ] **Architecture**: Describe the architectural pattern (MVC, Microservices, etc.)
- [ ] **Development Status**: Is it actively maintained? Production-ready?

### 2. Codebase Structure
- [ ] **Main Components**: Break down major components/modules
- [ ] **Entry Points**: ${entryPoints.map(f => `\n  - ${f.path} (${(f.size / 1024).toFixed(2)} KB)`).join('') || 'None found'}
- [ ] **Test Coverage**: ${testFiles.length} test files found. Assess quality and coverage
- [ ] **Documentation**: ${docFiles.length} documentation files. Evaluate completeness

### 3. Dependencies & Security
- [ ] **Critical Dependencies**: Identify key frameworks and their purposes
- [ ] **Security Analysis**: Any known vulnerabilities in dependencies?
- [ ] **Version Analysis**: Are dependencies up-to-date? Any deprecated packages?
- [ ] **License Compliance**: Check for any license conflicts

### 4. Code Quality Assessment
- [ ] **Code Organization**: Is the code well-structured and modular?
- [ ] **Best Practices**: Follows language/framework conventions?
- [ ] **Error Handling**: Comprehensive error handling in place?
- [ ] **Performance**: Any obvious performance bottlenecks?
- [ ] **Testing**: Quality and coverage of tests

### 5. Documentation Review
- [ ] **README**: Quality and completeness
- [ ] **API Documentation**: Is it well-documented?
- [ ] **Setup Instructions**: Clear setup and installation guide?
- [ ] **Contribution Guidelines**: Are they present and clear?

### 6. Development Workflow
- [ ] **Build Process**: How is the project built?
- [ ] **Testing Strategy**: How are tests run?
- [ ] **Deployment**: How is the project deployed?
- [ ] **CI/CD**: Is there a CI/CD pipeline?

### 7. Potential Improvements
- [ ] **Technical Debt**: Identify areas needing refactoring
- [ ] **Performance Optimization**: Possible improvements
- [ ] **Security Enhancements**: Recommended security improvements
- [ ] **Documentation Gaps**: What's missing from the docs?

## 📋 Analysis Instructions

Please provide a detailed analysis covering all the above points. For each section:
1. Start with a brief summary
2. Include specific examples from the codebase
3. Note any concerns or areas for improvement
4. Provide actionable recommendations
5. Use markdown formatting for better readability

Focus on making the analysis practical and useful for both new and experienced developers who might work on this codebase.`;

        // Add system prompt for the AI
        const systemPrompt = `You are an expert software architect analyzing a code repository. Your task is to provide a comprehensive, detailed, and beginner-friendly explanation of the codebase and the detailed analysis of flow analaysing each file.`;

        // Call Ollama API for analysis
        const response = await ollama.chat({
            model: 'codellama:13b',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            stream: false
        });

        // Extract and enhance the AI's response
        let analysis = response.message?.content || 'No analysis available';
        
        // Add a friendly introduction and next steps
        const friendlyIntro = `# 🧠 Understanding ${owner}/${repo}

Here's a friendly breakdown of this repository to help you understand it better. This analysis is generated by an AI that has examined the codebase structure, dependencies, and key files.

`;
        
        const nextSteps = `

## 🚀 Next Steps

1. **Explore the code** - Start with the key files mentioned above
2. **Run it locally** - Check the setup instructions in the README
3. **Make a small change** - Try fixing a bug or adding a simple feature
4. **Ask questions** - If something's not clear, don't hesitate to ask!

💡 Tip: Use this analysis as a starting point, but always verify the information by exploring the code yourself.`;

        // Combine everything with proper formatting
        analysis = friendlyIntro + analysis + nextSteps;

        console.log('AI analysis completed successfully');
        res.status(200).json({
            success: true,
            analysis: analysis,
            metadata: {
                totalFiles: files.length,
                fileTypes: Object.keys(fileTypes).length,
                dependencies: allDependencies.length,
                analyzedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error analyzing repository:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze repository',
            details: error.message,
            suggestion: 'Please try again with a smaller repository or check the server logs for more details.'
        });
    }
});

// POST /api/ai/explain
router.post('/explain', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    console.error('No code provided in explain request');
    return res.status(400).json({ error: 'No code provided' });
  }

  try {
    console.log('Sending explain request to Ollama...');
    
    const response = await ollama.chat({
      model: 'codellama:7b-instruct',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful coding assistant. Explain the provided code in simple, clear steps.'
        },
        {
          role: 'user',
          content: `Explain what the following code does in simple steps. Be concise but thorough:\n\n${code}`
        }
      ],
      options: {
        temperature: 0.3,
        top_p: 0.9,
        num_predict: 300
      }
    });

    console.log('Received explanation from Ollama');
    const explanation = response.message?.content.trim() || 'No explanation available.';
    
    res.json({ explanation });
  } catch (error) {
    console.error('Explanation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate explanation',
      details: error.message 
    });
  }
});

module.exports = router;
