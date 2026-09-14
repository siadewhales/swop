const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'client', 'src', 'locales', 'translations.json');
const outputDir = path.join(projectRoot, 'client', 'src', 'locales', 'generated');

const translations = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

fs.mkdirSync(outputDir, { recursive: true });

const currentFiles = new Set(fs.readdirSync(outputDir).filter((file) => file.endsWith('.json')));
for (const [language, translation] of Object.entries(translations)) {
  const fileName = `${language}.json`;
  fs.writeFileSync(path.join(outputDir, fileName), `${JSON.stringify(translation, null, 2)}\n`, 'utf8');
  currentFiles.delete(fileName);
}

for (const staleFile of currentFiles) {
  fs.unlinkSync(path.join(outputDir, staleFile));
}

console.log(`Prepared ${Object.keys(translations).length} language files.`);
