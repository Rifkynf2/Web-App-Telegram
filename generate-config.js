const fs = require('fs');
const path = require('path');

// Ensure the directory exists
const configDir = path.join(__dirname, 'public', 'js');
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

// Generate the config content from environment variables
const content = `window.config = {
  supabaseUrl: "${process.env.SUPABASE_URL || ''}",
  supabaseAnonKey: "${process.env.SUPABASE_ANON_KEY || ''}"
};`;

// Write to public/js/config.js
fs.writeFileSync(path.join(configDir, 'config.js'), content);
console.log('✓ config.js has been generated from Environment Variables.');
