import $ from '../utils.js';
import Library from './Library.js';

/**
 * @file LoadManager.js
 * @module LoadManager
 * @extends Library
 * @version 1.2.0
 * @author Jens-Olaf-Mueller
 *
 * LoadManager — Granular asset loading and progress tracking system.
 * ==================================================================
 *
 * Provides a professional loading system utilizing the Streams API to track download progress of binary assets.
 * - Key Features:
 *   - Hybrid Scanning: Automatically detects DOM elements with `data-asset` or integrates via `assets.json` manifest.
 *   - Progress Tracking: Calculates real-time percentages and byte-counts for deterministic and indeterministic loads.
 *   - Selective Loading: Allows toggling of asset types (scripts, styles, markup, text) to be included in progress tracking.
 *   - CSS Integration: Automatically generates `--asset-` CSS variables and applies background styles to containers.
 *   - Visual Stability: Uses a configurable delay to prevent UI flickering on fast loads or cache hits.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link initFromDOM}    - Scans the document for `data-asset` attributes and registers tasks.
 * - {@link registerTask}   - Manually registers a resource for progress tracking with optional size weighting.
 * - {@link getAsset}       - Retrieves a previously processed asset from the internal global cache.
 * - {@link loadAsset}      - Fetches a single resource via the Streams API to track granular download progress.
 * - {@link loadAll}        - Executes all registered tasks in parallel, optionally loading from a manifest file.
 * - {@link processBlob}    - Converts raw blobs into usable media objects (Images, Audio) or parsed JSON.
 *
 * ---------------------------------------------------------------
 * II. Private Methods
 * ---------------------------------------------------------------
 * - #applyAsset()          - Injects processed data into DOM elements or assigns them to CSS variables.
 * - #updateProgress()      - The central progress hub that calculates percentages and raises tracking events.
 * - #finishTask()          - Finalizes individual tasks and reconciles overall loading statistics.
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * @event loadstart {Object}        - Fires when the batch loading process begins after the visual delay.
 * @event loadprogress {@link LoadManagerEvent} - Fires during the download of a resource with current percentages.
 * @event taskcomplete {Object}     - Fires when an individual file has finished loading and processing.
 * @event loadcomplete {Object}     - Fires when all registered tasks have been successfully finalized.
 * @event loaderror {Object}        - Fires if a batch loading process or manifest fetch fails.
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * Variables are generated dynamically based on asset keys and prefixed with '--asset-'.
 * - --asset-[key] - Holds the `url()` of the processed asset for use in background-image styles.
 */
export class LoadManager extends Library {
    #delay = 200;
    get delay() { return this.#delay; }
    set delay(newVal) {
        if (typeof newVal == 'number' && newVal >= 0 && newVal < 301) this.#delay = newVal;
    }

    totalExpectedBytes = 0;
    totalLoadedBytes = 0;
    defaultWeight = 512000;

    /** @type {Map<string, object>} Task registry for progress tracking */
    tasks = new Map();

    /** @type {Map<string, any>} Global storage for processed assets */
    cache = new Map();

    /**
     * @param {object}  [options={}] - Configuration for the manager.
     * @param {boolean} [options.autoInit=true] - If true, scans the DOM immediately.
     * @param {boolean} [options.markup=false]  - Skip markup files in progress.
     * @param {boolean} [options.styles=false]  - Skip CSS files in progress.
     * @param {boolean} [options.scripts=false] - Skip JS files in progress.
     * @param {boolean} [options.text=false]    - Skip text/md files in progress.
     * @param {number}  [options.delay=200]     - delay time to skip the display of the progress element
     */
    constructor({autoInit = true, styles = false, scripts = false, markup = false, text = false, delay = 200} = {},
                 element = null, parent = null) {
        super(parent);
        this.element = element;

        this.includeStyles = styles;
        this.includeScripts = scripts;
        this.includeMarkup = markup;
        this.includeText = text;
        this.delay = delay;
        if (autoInit) this.initFromDOM();
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
            // Set the variable via Library method
            const varName = `--asset-${this.stringTo(key, 'kebab')}`;
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
            url: task.url,
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
     * Includes a visual delay to prevent flickering on fast loads/cache hits.
     * Automatically resolves paths using the library's projectFolder.
     * @param {string|null} [manifestUrl=null] - Path to the assets.json
     * @param {number} [delay=200] - Delay in ms before showing the loader
     */
    async loadAll(manifestUrl = null) {
        // Use the inherited getter from Library
        const base = this.projectFolder;

        // Timer for the visual delay
        const visualTimer = setTimeout(() => {
            this._raiseEvent('loadstart', {
                totalTasks: this.tasks.size,
                visible: true
            });
        }, this.delay);

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
                    const type = asset.type;
                    if (type === 'style' && !this.includeStyles) return;
                    if (type === 'script' && !this.includeScripts) return;
                    if (type === 'markup' && !this.includeMarkup) return;
                    if (type === 'text' && !this.includeText) return;

                    // 2. Key generation
                    const fileName = asset.url.split('/').pop().split('.').shift();
                    const key = this.stringTo(fileName, 'camel');

                    // 3. Register or update task
                    if (!this.tasks.has(key)) this.registerTask(key, asset.size);

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
            clearTimeout(visualTimer); // Cancel timer if nothing to do
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
        } finally {
            // IMPORTANT: Always clear the timer at the end
            clearTimeout(visualTimer);
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

/**
 * @typedef {Object} LoadManagerEvent
 * @property {string} key - The unique identifier of the asset.
 * @property {number} percent - The current overall progress percentage (0-100).
 * @property {number} loaded - Total bytes loaded across all tasks.
 * @property {number} total - Total expected bytes across all tasks.
 * @property {string|null} url - The URL of the currently updating resource.
 * @property {Object} task - The internal task state object.
 */