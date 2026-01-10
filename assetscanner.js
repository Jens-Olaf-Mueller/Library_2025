/**
 * AssetScanner — Recursive directory crawler for LoadManager
 * ==========================================================
 * This Node.js utility scans a target directory for binary assets
 * and generates a 'assets.json' file. This manifest allows the
 * LoadManager to perform deterministic loading with precise
 * progress tracking without server-side directory listing.
 *
 * Usage: node assetscanner.js
 * * * * Features:
 * - Recursive scanning of subdirectories.
 * - Extracts file size in bytes for accurate progress calculation.
 * - Categorizes assets (image, video, audio, json, blob).
 * - Generates web-compatible relative URLs.
 *
 * @version 1.0.0
 * @author
 */

const fs = require('fs');
const path = require('path');

/** * CONFIGURATION
 * Edit these paths according to your project structure
 */
const ASSET_FILENAME = 'assets.json'
const ASSET_PATH = './';         // Folder to scan
const OUTPUT_FILE = ASSET_PATH + '/' + ASSET_FILENAME;
const IGNORE_FILES = [ASSET_FILENAME, 'assetscanner.js', '.DS_Store', '.gitignore'];

/**
 * Maps file extensions to asset types used by LoadManager.
 * @param {string} ext - The file extension (including dot).
 * @returns {string} - The category (image|audio|video|json|blob).
 */
function getAssetType(ext) {
    const map = {
        '.jpg':  'image',
        '.jpeg': 'image',
        '.png':  'image',
        '.webp': 'image',
        '.gif':  'image',
        '.mp3':  'audio',
        '.wav':  'audio',
        '.ogg':  'audio',
        '.mp4':  'video',
        '.webm': 'video',
        '.json': 'json',
        '.txt':  'text',
        '.md':   'text',
        '.css':  'style',
        '.html': 'markup',
        '.htm':  'markup',
        '.js':   'script',
        '.mjs':  'script',
        '.woff2':'font'
    };
    return map[ext.toLowerCase()] || 'blob';
}

/**
 * Recursively scans a directory for files.
 * @param {string} dir - Current directory path.
 * @returns {Array<object>} - Array of asset descriptors.
 */
function scanDirectory(dir) {
    let results = [];
    const list = fs.readdirSync(dir);

    list.forEach(file => {
        if (IGNORE_FILES.includes(file) || file.startsWith('.git')) return;

        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat && stat.isDirectory()) {
            // Recursive call for subfolders
            results = results.concat(scanDirectory(filePath));
        } else {
            const ext = path.extname(file);

            // Normalize path to web-style (forward slashes)
            // and remove leading dots/current dir markers
            const webUrl = filePath.replace(/\\/g, '/').replace(/^\.\//, '');

            results.push({
                url: webUrl,
                size: stat.size,
                type: getAssetType(ext)
            });
        }
    });

    return results;
}

/**
 * Main execution block
 */
try {
    console.log(`[AssetScanner] Starting scan in: ${ASSET_PATH}...`);

    if (!fs.existsSync(ASSET_PATH)) {
        console.error(`[Error] Path not found: ${ASSET_PATH}`);
        process.exit(1);
    }

    const assets = scanDirectory(ASSET_PATH);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(assets, null, 4));

    console.log('--------------------------------------------------');
    console.log(`[Success] Manifest generated: ${OUTPUT_FILE}`);
    console.log(`[Stats]   Total Assets found: ${assets.length}`);
    console.log('--------------------------------------------------');
} catch (error) {
    console.error('[Error] Scanning failed:', error.message);
}