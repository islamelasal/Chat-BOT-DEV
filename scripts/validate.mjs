import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const required = [
  'manifest.json',
  'background.js',
  'content.js',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.js',
  'src/lib/provider-engine.js',
  'src/lib/openai-compatible-client.js',
  'src/lib/free-models.js',
  'src/agents/autopilot-coordinator.js',
  'docs/DELIVERY_TARGETS.md'
];

const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) throw new Error(`Missing required files: ${missing.join(', ')}`);

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 is required.');
if (!manifest.host_permissions.includes('https://openrouter.ai/*')) throw new Error('OpenRouter host permission is missing.');
if (!manifest.host_permissions.includes('https://api.groq.com/*')) throw new Error('Groq host permission is missing.');
if (!manifest.host_permissions.includes('https://generativelanguage.googleapis.com/*')) throw new Error('Gemini host permission is missing.');

const sidepanel = readFileSync(join(root, 'sidepanel.html'), 'utf8');
for (const id of ['provider-mode', 'arena-dropzone', 'arena-export-format', 'delivery-target']) {
  if (!sidepanel.includes(`id="${id}"`)) throw new Error(`Side panel control is missing: ${id}`);
}

const content = readFileSync(join(root, 'content.js'), 'utf8');
for (const marker of ['arena.ai', 'AI_CHAT_ATTACH_FILE_START', 'AI_CHAT_GET_ARTIFACTS']) {
  if (!content.includes(marker)) throw new Error(`Arena adapter marker is missing: ${marker}`);
}

console.log(`Project Agent ${manifest.version} validation passed.`);
