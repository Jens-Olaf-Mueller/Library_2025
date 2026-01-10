import $ from '../utils.js';
import Library from './Library.js';

/**
 * LoadManager — Granular asset loading and progress tracking
 * ==========================================================
 * This class extends the Library to provide a professional loading system.
 * It uses the Streams API to track the download progress of binary assets.
 * * * Features:
 * - Hybrid Loading: Supports DOM-based scanning and manual task registration.
 * - Global Cache: Stores processed assets for easy retrieval (ideal for games).
 * - Real-time progress calculation for deterministic and estimated file sizes.
 * - Automatic injection into DOM or CSS backgrounds.
 * * * Public Methods:
 * - {@link initFromDOM}      - Scans a container for assets.
 * - {@link registerTask}     - Manually registers a new load task.
 * - {@link addTasks}         - Registers a list of dynamic assets.
 * - {@link getAsset}         - Retrieves a loaded asset from the cache.
 * - {@link loadAsset}        - Fetches a single asset and tracks its stream.
 * - {@link loadAll}          - Executes all registered tasks in parallel.
 * * @version 1.1.0
 * @extends Library
 */
export class LoadManager extends Library {
    /**
     * @param {HTMLElement|string|null} [parent=null] - The search area for assets.
     * @param {boolean} [autoInit=true] - If true, scans the DOM immediately.
     */
    constructor(parent = null, autoInit = true) {
        super(parent);

        /** @type {Map<string, object>} Task registry for progress tracking */
        this.tasks = new Map();
        /** @type {Map<string, any>} Global storage for processed assets */
        this.cache = new Map();

        this.totalExpectedBytes = 0;
        this.totalLoadedBytes = 0;
        this.defaultWeight = 512000;

        if (autoInit) this.initFromDOM();
        console.log(this)
    }

    /**
     * Scans for [data-asset], generates keys if missing, and registers tasks.
     */
    initFromDOM(container = document) {
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
     * @param {string} key - Unique identifier for the task.
     * @param {number|null} size - Size in bytes (if known).
     */
    registerTask(key, size = null) {
        const isIndeterministic = (size === null || size <= 0);
        const weight = isIndeterministic ? this.defaultWeight : size;

        this.tasks.set(key, {
            loaded: 0,
            expected: weight,
            isIndeterministic,
            isDone: false
        });

        this.totalExpectedBytes += weight;
    }

    /**
     * Manually registers a list of assets for dynamic loading.
     * @param {Array<object>} assetList - Array of {key, url, type} objects.
     */
    addTasks(assetList) {
        assetList.forEach(asset => {
            const key = asset.key || asset.id; // Support both naming styles
            this.registerTask(key, null);
            const task = this.tasks.get(key);
            task.url = asset.url;
            task.type = asset.type || 'image';
        });
    }

    /**
     * Returns a loaded asset from the cache.
     * @param {string} key
     * @returns {any|null}
     */
    getAsset(key) {
        return this.cache.get(key) || null;
    }

    /**
     * Injects the processed asset into its corresponding DOM element.
     * @param {string} key - The asset key.
     * @param {any} processedData - The media object or URL.
     * @private
     */
    #applyAsset(key, processedData) {
        const element = this.DOM[key];
        if (!element) return;

        const url = (processedData instanceof HTMLImageElement || processedData instanceof HTMLAudioElement)
            ? processedData.src : processedData;

        if (element instanceof HTMLImageElement || element instanceof HTMLMediaElement) {
            element.src = url;
        } else {
            // Wir nutzen eine CSS-Variable für das Hintergrundbild
            // Das erlaubt dir, im CSS einfach zu schreiben: background-image: var(--bg-image);
            const varName = `--asset-${this.stringTo(key, 'kebab')}`;
            this.setCSSProperty(varName, `url("${url}")`);

            // Fallback/Direktzuweisung, falls kein CSS-Var-Setup im Stylesheet existiert
            // element.style.backgroundImage = `url("${url}")`;
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
     * @param {string} url - Asset URL.
     * @param {string} key - Unique key.
     * @returns {Promise<Blob>}
     */
    async loadAsset(url, key) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : null;

        if (!this.tasks.has(key)) {
            this.registerTask(key, total);
        } else if (total) {
            const task = this.tasks.get(key);
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
     * Executes all registered tasks in parallel.
     * @param {string|null} [manifestUrl=null] - Optional path to a manifest.json
     */
    async loadAll(manifestUrl = null) {
        // 1. Zuerst schauen wir, ob ein Manifest-Ordner geladen werden soll
        if (manifestUrl) {
            try {
                const response = await fetch(manifestUrl);
                if (!response.ok) throw new Error(`Manifest not found at ${manifestUrl}`);

                const autoAssets = await response.json();

                autoAssets.forEach(asset => {
                    // Erzeuge Key aus Dateiname (z.B. "hero.png" -> "hero")
                    const fileName = asset.url.split('/').pop().split('.').shift();
                    const key = this.stringTo(fileName, 'camel');

                    // Nur registrieren, wenn der Key noch nicht existiert (verhindert Dubletten vom DOM)
                    if (!this.tasks.has(key)) {
                        this.registerTask(key, asset.size);
                        const task = this.tasks.get(key);
                        task.url = asset.url;
                        task.type = asset.type;
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

                // URL finden: Entweder aus Task (Manifest/addTasks) oder aus dem DOM-Attribut
                const url = task.url || element?.dataset.asset;
                if (!url) return;

                // Typ bestimmen
                let type = task.type;
                if (!type) {
                    if (element) {
                        const tag = element.tagName.toLowerCase();
                        type = tag === 'img' ? 'image' : (['audio', 'video'].includes(tag) ? tag : 'blob');
                    } else {
                        // Fallback für Ordner-Assets ohne Element: Typ anhand der Endung raten
                        const ext = url.split('.').pop().toLowerCase();
                        const map = { jpg:'image', png:'image', webp:'image', mp3:'audio', mp4:'video', json:'json' };
                        type = map[ext] || 'blob';
                    }
                }

                const blob = await this.loadAsset(url, key);
                const processedData = await this.processBlob(blob, type);

                // In den Cache legen
                this.cache.set(key, processedData);

                // Ins DOM injizieren, falls ein Element dazu existiert
                if (element) {
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
     * Processes blobs into media objects.
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
                const text = await blob.text();
                return JSON.parse(text);
            default:
                return url;
        }
    }
}