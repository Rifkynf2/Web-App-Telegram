const fs = require('fs');
const path = require('path');

// Ensure the directory exists
const configDir = path.join(__dirname, 'public', 'js');
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

// Generate ES Module config from environment variables (Master DB)
const content = `export const CONFIG = {
    SUPABASE_URL: "${process.env.SUPABASE_URL || ''}",
    SUPABASE_ANON_KEY: "${process.env.SUPABASE_ANON_KEY || ''}"
};
`;

// Write to public/js/config.js
fs.writeFileSync(path.join(configDir, 'config.js'), content);
console.log('✓ config.js generated (ES Module format) from Environment Variables.');
