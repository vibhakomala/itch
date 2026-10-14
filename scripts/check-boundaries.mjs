import { readFile, readdir } from 'node:fs/promises';

const allowed = {
  protocol: [],
  core: ['protocol'],
  vision: ['core', 'protocol'],
  scratch: ['core', 'protocol'],
  packs: ['core', 'protocol'],
  devtools: ['core', 'protocol'],
  'test-utils': ['core', 'protocol', 'packs'],
};

let failures = 0;
async function inspect(dir, name) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await inspect(file, name);
      continue;
    }
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\(|import\s*)['"]([^'"]+)['"]/g)) {
      const imported = match[1];
      if (imported.startsWith('@itch/') && !allowed[name].includes(imported.slice(6))) {
        console.error(`${file}: forbidden package dependency ${imported}`);
        failures += 1;
      }
      if (
        /\.\.\/.*(?:core|vision|scratch|protocol|packs|devtools|test-utils)\/src/.test(imported)
      ) {
        console.error(`${file}: use package exports instead of cross-package source paths`);
        failures += 1;
      }
    }
  }
}

for (const [name, dependencies] of Object.entries(allowed)) {
  const manifest = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8'));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (dependency.startsWith('@itch/') && !dependencies.includes(dependency.slice(6))) {
      console.error(`${name}: forbidden manifest dependency ${dependency}`);
      failures += 1;
    }
  }
  await inspect(`packages/${name}/src`, name);
}
if (failures) process.exitCode = 1;
else console.log('Package boundaries passed.');
