import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// 更新 manifest.json
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));

// 更新 versions.json
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[targetVersion] = process.env.npm_package_min_app_version || '1.0.0';
writeFileSync('versions.json', JSON.stringify(versions, null, 2));

console.log(`Updated manifest.json and versions.json to version ${targetVersion}`);
