import fs from 'node:fs';
import path from 'node:path';

/**
 * @module      AssetScanner
 * @version     1.1.0
 * @author      Jens-Olaf Müller
 * @description A high-performance Node.js utility class designed to recursively
 * scan a project directory. It collects metadata (file size, type,
 * and web-relative paths) to generate a 'Single Source of Truth' JSON manifest.
 *
 * This manifest is used by:
 * 1. LoadManager: For precise UI progress tracking.
 * 2. ServiceWorker: For automated offline asset caching.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * {@link scan}                - scans all files from the rootPath property and generates the output .json file
 *
 * @example     import AssetScanner from './js/classes/AssetScanner.mjs';
 * const scanner = new AssetScanner({ path: './', markup: true, scripts: true });
 * scanner.scan();
 */
export default class AssetScanner {
    /**
     * @param {object} [options={}]                     - Configuration for the scanner.
     * @param {string} [options.path='./']              - startpath for the scanner
     * @param {string} [options.filename='assets.json'] - the output filename
     * @param {boolean} [options.markup=false]          - Skip markup files in progress.
     * @param {boolean} [options.styles=false]          - Skip CSS files in progress.
     * @param {boolean} [options.scripts=false]         - Skip JS files in progress.
     * @param {boolean} [options.text=false]            - Skip text/md files in progress.
     */
    constructor(options = {}) {
        this.rootPath = options.path || './';
        this.fileName = options.filename || 'assets.json';
        this.outputFile = path.join(this.rootPath, this.fileName);

        // Configuration Flags
        this.includeStyles = options.styles ?? false;
        this.includeScripts = options.scripts ?? false;
        this.includeMarkup = options.markup ?? false;
        this.includeText = options.text ?? false;
    }

    /**
     * Set of files/folders that are always ignored
     * '.DS_Store' is a MacOS system file!
     */
    get #blackList() {
        return [this.fileName, 'AssetScanner.mjs', 'scan.mjs', '.DS_Store', '.git', '.gitignore', 'node_modules'];
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
                if (!this.includeStyles && asset.type === 'style') return false;
                if (!this.includeScripts && asset.type === 'script') return false;
                if (!this.includeMarkup && asset.type === 'markup') return false;
                if (!this.includeText && asset.type === 'text') return false;
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