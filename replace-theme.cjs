const fs = require('fs');
const path = require('path');

const replacements = {
  // Backgrounds
  'bg-[#08080f]': 'bg-[#080808]',
  'bg-[#0d0d1a]': 'bg-[#0C0C0C]',
  'bg-[#111120]': 'bg-zinc-900',
  'bg-[#1e1e3f]': 'bg-zinc-800',
  
  // Texts
  'text-[#f1f5f9]': 'text-zinc-100',
  'text-[#94a3b8]': 'text-zinc-300',
  'text-[#64748b]': 'text-zinc-500',
  'text-[#475569]': 'text-zinc-600',
  'text-[#a78bfa]': 'text-orange-500',

  // Borders
  'border-[#1a1a2e]': 'border-zinc-800',
  'border-[#2d2d4e]': 'border-zinc-700',
  'border-[#08080f]': 'border-[#080808]',
  'border-[#0d0d1a]': 'border-[#0C0C0C]',

  // Accents
  'bg-[#6366f1]': 'bg-orange-500',
  'text-[#6366f1]': 'text-orange-500',
  'border-[#6366f1]': 'border-orange-500',
  'from-[#6366f1]': 'from-orange-600',
  'to-[#8b5cf6]': 'to-amber-400',
  'hover:text-[#6366f1]': 'hover:text-orange-500',
  'hover:bg-[#4f46e5]': 'hover:bg-orange-600',

  // Status (Success)
  'bg-[#22c55e]': 'bg-emerald-500',
  'text-[#22c55e]': 'text-emerald-500',
  'border-[#166534]': 'border-emerald-900/50',
  'bg-[#0d1f12]': 'bg-emerald-950/20',
  'border-[#22c55e]/50': 'border-emerald-500/50',

  // In Call (blue -> orange)
  'bg-[#3b82f6]': 'bg-orange-500',
  'text-[#3b82f6]': 'text-orange-500',
  'border-[#3b82f6]': 'border-orange-500',
  'from-[#3b82f6]': 'from-orange-600',

  // Searching (yellow/amber)
  'bg-[#f59e0b]': 'bg-amber-500',
  'text-[#f59e0b]': 'text-amber-500',
  'border-[#f59e0b]': 'border-amber-500',
  'border-[#f59e0b]/30': 'border-amber-500/30',
  
  // Misc hovers
  'hover:bg-[#1a1a2e]': 'hover:bg-zinc-800',
  'hover:bg-[#111120]': 'hover:bg-zinc-900',
  'hover:bg-[#1e1e3f]': 'hover:bg-zinc-700',
  'hover:bg-[#2d2d4e]': 'hover:bg-zinc-700',
  'hover:text-[#94a3b8]': 'hover:text-zinc-300',
  'hover:text-[#f1f5f9]': 'hover:text-zinc-100',
  'hover:text-[#a78bfa]': 'hover:text-orange-500',
  
  // Specific drop shadows / effects
  'shadow-[0_0_20px_rgba(99,102,241,0.3)]': 'shadow-[0_0_20px_rgba(249,115,22,0.3)]',
  'shadow-[0_0_30px_rgba(99,102,241,0.5)]': 'shadow-[0_0_30px_rgba(249,115,22,0.5)]',
  'shadow-[0_0_40px_rgba(99,102,241,0.1)]': 'shadow-[0_0_40px_rgba(249,115,22,0.1)]',
  'shadow-[0_0_40px_rgba(245,158,11,0.05)]': 'shadow-[0_0_40px_rgba(245,158,11,0.05)]' // amber already
};

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (!filePath.includes('node_modules')) {
        results = results.concat(walkDir(filePath));
      }
    } else {
      if (filePath.endsWith('.tsx') || filePath.endsWith('.ts') || filePath.endsWith('.css')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

const files = walkDir(path.join(process.cwd(), 'src'));
let changedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  for (const [oldClass, newClass] of Object.entries(replacements)) {
    content = content.split(oldClass).join(newClass);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`Updated ${file}`);
  }
});

console.log(`Done! Updated ${changedFiles} files.`);
