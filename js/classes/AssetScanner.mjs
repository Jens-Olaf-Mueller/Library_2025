import fs from 'node:fs';
import path from 'node:path';

/**
 * @author Jens-Olaf Müller
 * @file AssetScanner.mjs
 * @module AssetScanner
 * @version 1.1.0
 *
 * AssetScanner — High-performance Node.js manifest generator.
 * ===============================================================
 *
 * Recursively scans a project directory to collect metadata and generate a JSON manifest.
 * - Key Features:
 *   - Manifest Generation: Creates a 'Single Source of Truth' for LoadManager and ServiceWorker.
 *   - Recursive Scanning: Automatically traverses nested directory structures to find all assets.
 *   - Metadata Collection: Captures file size, asset type, and generates web-friendly relative paths.
 *   - Smart Filtering: Features a blacklist for system files (.DS_Store) and environment folders (node_modules, .git).
 *   - Type Mapping: Categorizes files into image, audio, video, style, or script based on extensions.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link scan} - Initiates the scanning process and writes the result to a JSON file.
 *
 * ---------------------------------------------------------------
 * II. Private Methods
 * ---------------------------------------------------------------
 * - #scanDirectory() - Core recursive engine that reads the file system and collects file stats.
 * - #getAssetType()  - Internal mapping logic for file extensions to LoadManager-compatible types.
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * This Node.js utility does not raise browser-based custom events.
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * This component does not provide any CSS variables.
 *
 * ---------------------------------------------------------------
 * V. Example
 * ---------------------------------------------------------------
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