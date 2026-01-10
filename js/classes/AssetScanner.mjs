// const fs = require('fs');
const fs = import ('fs');
// const path = require('path');
const path = import ('path');

// import Library from './Library.js';


/** * CONFIGURATION
 * Edit these paths according to your project structure
 */
// const ASSET_FILENAME = 'assets.json'
// const ASSET_PATH = './assets';         // Folder to scan
// const OUTPUT_FILE = ASSET_PATH + '/' + ASSET_FILENAME;
// const IGNORE_FILES = [ASSET_FILENAME, 'assetscanner.js', '.DS_Store'];

// export default class AssetScanner extends Library {
export default class AssetScanner {
// class AssetScanner {

    ignoreHTML = true;
    ignoreStyles = true;
    ignoreScripts = true;
    ignoreText = true;

    get ignoreFiles() { return [this.fileName, 'assetscanner.js', '.DS_Store'] };

    constructor(path = '/', filename = 'assets.json', autoScan = true) {
        // super(parent);

        this.path = path;
        this.fileName = filename;
        this.outputFile = '/' + filename;

        if (autoScan) this.scan();
        console.log(this)
    }

    scan(directory = this.path) {
        /**
         * Main execution block
         */
        try {
            console.log(`[AssetScanner] Starting scan in: ${directory}...`);

            if (!fs.existsSync(directory)) {
                console.error(`[Error] Path not found: ${directory}`);
                process.exit(1);
            }

            const assets = this.scan(directory);

            fs.writeFileSync(this.outputFile, JSON.stringify(assets, null, 4));

            console.log('--------------------------------------------------');
            console.log(`[Success] Manifest generated: ${this.outputFile}`);
            console.log(`[Stats]   Total Assets found: ${assets.length}`);
            console.log('--------------------------------------------------');
        } catch (error) {
            console.error('[Error] Scanning failed:', error.message);
        }
    }


    /**
     * Recursively scans a directory for files.
     * @param {string} dir - Current directory path.
     * @returns {Array<object>} - Array of asset descriptors.
     */
    #scanDirectory(dir) {
        let results = [];
        const list = fs.readdirSync(dir);

        list.forEach(file => {
            if (this.ignoreFiles.includes(file)) return;

            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat && stat.isDirectory()) {
                // Recursive call for subfolders
                results = results.concat(this.#scanDirectory(filePath));
            } else {
                const ext = path.extname(file);

                // Normalize path to web-style (forward slashes)
                // and remove leading dots/current directory markers
                const webUrl = filePath.replace(/\\/g, '/').replace(/^\.\//, '');

                results.push({
                    url: webUrl,
                    size: stat.size,
                    type: this.getAssetType(ext)
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
    getAssetType(ext) {
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
}