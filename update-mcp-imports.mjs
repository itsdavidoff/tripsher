import fs from 'fs';
import path from 'path';

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.ts')) {
      let content = fs.readFileSync(p, 'utf8');
      if (content.includes('@modelcontextprotocol/sdk/server/')) {
        const updated = content.replace(/@modelcontextprotocol\/sdk\/server\/([a-zA-Z0-9_\/]+?)(?<!\.js)(?=['"])/g, '@modelcontextprotocol/sdk/server/$1.js');
        if (updated !== content) {
          fs.writeFileSync(p, updated);
          console.log('Updated:', p);
        }
      }
    }
  }
}

walk('server/src');
console.log('Done updating MCP imports!');
