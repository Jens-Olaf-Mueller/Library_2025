import $ from '../utils.js';
import Library from './Library.js';

/**
 * LoadManager — Granular asset loading and progress tracking
 * ==========================================================
 * This class extends the Library to provide a professional loading system.
 * It uses the Streams API to track the download progress of binary assets.
 * * Features:
 * - Manifest Support: Integrates with AssetScanner's assets.json.
 * - Selective Loading: Toggle tracking for scripts, styles, and markup.
 * - Hybrid Loading: Supports DOM-based scanning and manual task registration.
 * - Global Cache: Stores processed assets for easy retrieval.
 * - CSS Integration: Sets images as CSS variables for container backgrounds.
 * * @version 1.2.0
 * @extends Library
 */
export class LoadManager extends Library {
    /**
     * @param {object} [config={}] - Configuration for the manager.
     * @param {boolean} [config.autoInit=true] - If true, scans the DOM immediately.
     * @param {boolean} [config.ignoreHTML=true] - Skip markup files in progress.
     * @param {boolean} [config.ignoreStyles=true] - Skip CSS files in progress.
     * @param {boolean} [config.ignoreScripts=true] - Skip JS files in progress.
     * @param {boolean} [config.ignoreText=true] - Skip text/md files in progress.
     */
    constructor(config = {}) {
        super(config.parent || null);

        // Configuration Flags
        this.ignoreHTML = config.ignoreHTML ?? true;
        this.ignoreStyles = config.ignoreStyles ?? true;
        this.ignoreScripts = config.ignoreScripts ?? true;
        this.ignoreText = config.ignoreText ?? true;

        /** @type {Map<string, object>} Task registry for progress tracking */
        this.tasks = new Map();
        /** @type {Map<string, any>} Global storage for processed assets */
        this.cache = new Map();

        this.totalExpectedBytes = 0;
        this.totalLoadedBytes = 0;
        this.defaultWeight = 512000;

        if (config.autoInit !== false) this.initFromDOM();
    }

    /**
     * Scans the entire document for [data-asset] attributes.
     */
    initFromDOM() {
        // Search the whole document as requested
        const elements = $('[data-asset]', true);

        elements.forEach(el => {
            const url = el.dataset.asset;
            let key = el.id;

            if (!key) {
                const fileName = url.split('/').pop().split('.').shift();
                const camelName = this.stringTo(fileName, 'camel');
                const prefix = el.tagName.toLowerCase().slice(0, 3);

                key = `${prefix}${camelName.charAt(0).toUpperCase() + camelName.slice(1)}`;
                el.id = key;
            }

            this.DOM[key] = el;
            this.registerTask(key, null);
        });
    }

    /**
     * Registers a resource in the manager.
     */
    registerTask(key, size = null) {
        if (this.tasks.has(key)) return;

        const isIndeterministic = (size === null || size <= 0);
        const weight = isIndeterministic ? this.defaultWeight : size;

        this.tasks.set(key, {
            loaded: 0,
            expected: weight,
            isIndeterministic,
            isDone: false,
            url: null,
            type: null
        });

        this.totalExpectedBytes += weight;
    }

    /**
     * Retrieves a loaded asset from the cache.
     */
    getAsset(key) {
        return this.cache.get(key) || null;
    }

    /**
     * Injects the processed asset into its corresponding DOM element or CSS variable.
     * @private
     */
    #applyAsset(key, processedData) {
        const element = this.DOM[key];
        if (!element) return;

        const url = (processedData instanceof HTMLImageElement || processedData instanceof HTMLAudioElement)
            ? processedData.src : processedData;

        // 1. Handle native media elements
        if (element instanceof HTMLImageElement || element instanceof HTMLMediaElement) {
            element.src = url;
        }
        // 2. Handle background containers via CSS Variables
        else {
            const varName = `--asset-${this.stringTo(key, 'kebab')}`;

            // Set the variable via Library method
            this.setCSSProperty(varName, `url("${url}")`, element);

            // Apply variable to background as a default behavior
            element.style.backgroundImage = `var(${varName})`;
            element.style.backgroundSize = 'cover';
            element.style.backgroundPosition = 'center';
        }

        element.removeAttribute('data-asset');
    }

    /**
     * Internal progress hub. Calculates percentages and raises events.
     * @private
     */
    #updateProgress(key, loadedBytes) {
        const task = this.tasks.get(key);
        if (!task || task.isDone) return;

        const delta = loadedBytes - task.loaded;
        task.loaded = loadedBytes;
        this.totalLoadedBytes += delta;

        if (task.isIndeterministic && task.loaded > task.expected) {
            const correction = task.loaded - task.expected;
            this.totalExpectedBytes += correction;
            task.expected = task.loaded;
        }

        const percent = (this.totalLoadedBytes / this.totalExpectedBytes) * 100;

        this._raiseEvent('loadprogress', {
            key,
            percent: Math.min(percent, 99.9),
            loaded: this.totalLoadedBytes,
            total: this.totalExpectedBytes,
            task
        });
    }

    /**
     * Finalizes a task and reconciles statistics.
     * @private
     */
    #finishTask(key) {
        const task = this.tasks.get(key);
        if (!task || task.isDone) return;

        task.isDone = true;
        const difference = task.expected - task.loaded;
        this.totalExpectedBytes -= difference;

        this._raiseEvent('taskcomplete', { key, finalSize: task.loaded });

        if ([...this.tasks.values()].every(t => t.isDone)) {
            this._raiseEvent('loadcomplete', {
                totalFiles: this.tasks.size,
                totalBytes: this.totalLoadedBytes
            });
        }
    }

    /**
     * Fetches a resource and tracks progress.
     */
    async loadAsset(url, key) {
        console.log(url)
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : null;

        const task = this.tasks.get(key);
        if (task && total) {
            this.totalExpectedBytes += (total - task.expected);
            task.expected = total;
            task.isIndeterministic = false;
        }

        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            this.#updateProgress(key, loaded);
        }

        this.#finishTask(key);
        return new Blob(chunks);
    }

    /**
     * Executes all registered tasks in parallel, optionally loading a manifest.
     * Automatically resolves paths using the library's projectFolder.
     * @param {string|null} [manifestUrl=null] - Path to the assets.json
     */
    async loadAll(manifestUrl = null) {
        // Use the inherited getter from Library
        const base = this.projectFolder;

        if (manifestUrl) {
            try {
                // Ensure manifestUrl itself is correctly pointed
                const finalManifestUrl = manifestUrl.startsWith('/')
                    ? (manifestUrl.startsWith(base) ? manifestUrl : base + manifestUrl.substring(1))
                    : manifestUrl;

                const response = await fetch(finalManifestUrl);
                if (!response.ok) throw new Error(`Manifest not found at ${finalManifestUrl}`);

                const autoAssets = await response.json();

                autoAssets.forEach(asset => {
                    // 1. Filter checks
                    if (this.ignoreHTML && asset.type === 'markup') return;
                    if (this.ignoreStyles && asset.type === 'style') return;
                    if (this.ignoreScripts && asset.type === 'script') return;
                    if (this.ignoreText && asset.type === 'text') return;

                    // 2. Key generation
                    const fileName = asset.url.split('/').pop().split('.').shift();
                    const key = this.stringTo(fileName, 'camel');

                    // 3. Register or update task
                    if (!this.tasks.has(key)) {
                        this.registerTask(key, asset.size);
                    }

                    const task = this.tasks.get(key);

                    // Smart URL reconstruction:
                    // If JSON says "/assets/..." and project is "/Library_2025/"
                    // we want "/Library_2025/assets/..."
                    let finalUrl = asset.url;
                    if (finalUrl.startsWith('/') && !finalUrl.startsWith(base)) {
                        finalUrl = base + finalUrl.substring(1);
                    }

                    task.url = finalUrl;
                    task.type = asset.type;

                    if (asset.size && task.isIndeterministic) {
                        this.totalExpectedBytes += (asset.size - task.expected);
                        task.expected = asset.size;
                        task.isIndeterministic = false;
                    }
                });
            } catch (e) {
                console.error('[LoadManager] Manifest error:', e);
            }
        }

        const keys = Array.from(this.tasks.keys());
        if (keys.length === 0) {
            this._raiseEvent('loadcomplete', { totalFiles: 0, totalBytes: 0 });
            return;
        }

        try {
            const loadPromises = keys.map(async (key) => {
                const task = this.tasks.get(key);
                const element = this.DOM[key];
                const url = task.url || element?.dataset.asset;

                if (!url) {
                    this.#finishTask(key);
                    return;
                }

                let type = task.type;
                if (!type) {
                    const ext = url.split('.').pop().toLowerCase();
                    const map = { jpg:'image', png:'image', webp:'image', mp3:'audio', mp4:'video', json:'json', css:'style', js:'script' };
                    type = map[ext] || 'blob';
                }

                const blob = await this.loadAsset(url, key);
                const processedData = await this.processBlob(blob, type);

                this.cache.set(key, processedData);

                if (element && ['image', 'video', 'audio', 'style'].includes(type)) {
                    this.#applyAsset(key, processedData);
                }
            });

            await Promise.all(loadPromises);
        } catch (error) {
            console.error('[LoadManager] Batch loading failed:', error);
            this._raiseEvent('loaderror', { error: error.message });
        }
    }


    /**
     * Processes blobs into usable media objects or raw data.
     */
    async processBlob(blob, type) {
        const url = URL.createObjectURL(blob);

        switch (type) {
            case 'image':
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = url;
                });
            case 'audio':
                const audio = new Audio();
                audio.src = url;
                return audio;
            case 'json':
                const jsonText = await blob.text();
                return JSON.parse(jsonText);
            case 'style':
            case 'script':
            case 'markup':
            case 'text':
                // Return text content for potential manual injection
                return await blob.text();
            default:
                return url;
        }
    }
}