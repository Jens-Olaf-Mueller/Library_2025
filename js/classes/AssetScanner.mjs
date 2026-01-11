import fs from 'node:fs';
import path from 'node:path';

/**
 * @module AssetScanner
 * @description A high-performance Node.js utility class designed to recursively
 * scan a project directory. It collects metadata (file size, type,
 * and web-relative paths) to generate a 'Single Source of Truth' JSON manifest.
 *
 * This manifest is used by:
 * 1. LoadManager: For precise UI progress tracking.
 * 2. ServiceWorker: For automated offline asset caching.
 *
 * @version     1.1.0
 * @author      Jens-Olaf Müller
 * @license     MIT
 * * @example     import AssetScanner from './js/classes/AssetScanner.mjs';
 * const scanner = new AssetScanner({ path: './', ignoreText: false });
 * scanner.scan();
 */
export default class AssetScanner {

    constructor(config = {}) {
        this.rootPath = config.path || './';
        this.fileName = config.filename || 'assets.json';
        this.outputFile = path.join(this.rootPath, this.fileName);

        // Configuration Flags
        this.ignoreHTML = config.ignoreHTML ?? true;
        this.ignoreStyles = config.ignoreStyles ?? true;
        this.ignoreScripts = config.ignoreScripts ?? true;
        this.ignoreText = config.ignoreText ?? true;
    }

    /**
     * Set of files/folders that are always ignored
     */
    get #blackList() {
        return [this.fileName, 'assetscanner.js', 'scan.mjs', '.DS_Store', '.git', '.gitignore', 'node_modules'];
    }

    /**
     * Main Entry Point
     */
    scan() {
        try {
            console.log(`[AssetScanner] Starting scan in: ${path.resolve(this.rootPath)}...`);

            if (!fs.existsSync(this.rootPath)) {
                throw new Error(`Path not found: ${this.rootPath}`);
            }

            const assets = this.#scanDirectory(this.rootPath);

            // Filter according to flags
            const filteredAssets = assets.filter(asset => {
                if (this.ignoreHTML && asset.type === 'markup') return false;
                if (this.ignoreStyles && asset.type === 'style') return false;
                if (this.ignoreScripts && asset.type === 'script') return false;
                if (this.ignoreText && asset.type === 'text') return false;
                return true;
            });

            fs.writeFileSync(this.outputFile, JSON.stringify(filteredAssets, null, 4));

            console.log('--------------------------------------------------');
            console.log(`[Success] Manifest generated: ${this.outputFile}`);
            console.log(`[Stats]   Total Assets found: ${filteredAssets.length}`);
            console.log('--------------------------------------------------');
        } catch (error) {
            console.error('[Error] Scanning failed:', error.message);
        }
    }

    #scanDirectory(dir) {
        let results = [];
        const list = fs.readdirSync(dir);

        list.forEach(file => {
            if (this.#blackList.includes(file)) return;

            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                results = results.concat(this.#scanDirectory(filePath));
            } else {
                const ext = path.extname(file);
                const type = this.#getAssetType(ext);

                // Create web-friendly URL (always forward slashes, starting with /)
                let webUrl = filePath.replace(/\\/g, '/');
                if (!webUrl.startsWith('/')) webUrl = '/' + webUrl;

                results.push({
                    url: webUrl,
                    size: stat.size,
                    type: type
                });
            }
        });

        return results;
    }

    /**
     * Maps file extensions to asset types used by LoadManager.
     * @param {string} ext - The file extension (including dot).
     * @returns {string} - The category (image|audio|video|json|blob).
     */
    #getAssetType(ext) {
        const map = {
            '.jpg': 'image',
            '.jpeg': 'image',
            '.png': 'image',
            '.webp': 'image',
            '.gif': 'image',

            '.mp3': 'audio',
            '.wav': 'audio',
            '.ogg': 'audio',
            '.mp4': 'video',
            '.webm': 'video',

            '.json': 'json',
            '.txt': 'text',
            '.md': 'text',
            '.css': 'style',
            '.html': 'markup',
            '.htm': 'markup',
            '.js': 'script',
            '.mjs': 'script',

            '.woff2': 'font',
            '.woff': 'font',
            '.ttf': 'font',
            '.otf': 'font'
        };
        return map[ext.toLowerCase()] || 'blob';
    }
}