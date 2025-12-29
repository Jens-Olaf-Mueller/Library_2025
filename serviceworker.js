import { APP } from './js/constants.js';

/**
 * For more information see here:
 * @see {@link https://teukka.tech/serviceworker.html}
 * @see {@link https://www.youtube.com/watch?v=ksXwaWHCW6k}
 */

const ASSETS = [
    '/',
    './index.html',
    './about.html',
    './images.html',
    './style/reset.css',
    './style/style.css',
    './js/constants.js',
    './js/app.js',
    './img/icons/home16.png',
    './img/photo1.jpg',
    './img/photo2.jpg',
    './img/photo3.jpg',
];


/**
 * Use the SW 'install' event to cache all important files.
 */
self.addEventListener('install', async(evt) => {
    console.log(`Service worker [${APP.name}] installed.`);
    await cacheAssets();
    self.skipWaiting();
});


/**
 * Async helper funtion to cache all assets, listed in the public ASSETS array.
 * @returns {Promise} all cached assets in the ASSETS array
 */
async function cacheAssets() {
    const cache = await caches.open(APP.cacheName);
    return cache.addAll(ASSETS);
}


/**
 * Use the SW 'activate' event to clear all old caches if there are such.
 * The clients.claim() method ensures that the new SW controls all assets from now on.
 */
self.addEventListener('activate', evt => {
    // Create an immediately invoked async function
    // to await promises within waitUntil
    evt.waitUntil((async() => {
            await clearOldCaches();
            await self.clients.claim();
        })()
    );
    console.log(`Service worker [${APP.name}] activated.`);
});


/**
 * Async helper funtion to clear all old cache versions of the SW.
 * @returns {Promise} containing all caches to delete
 */
async function clearOldCaches() {
    const keys = await caches.keys(),
          oldCaches = keys.filter(cache => cache !== APP.cacheName);
    console.log(`Service worker [${APP.title}] clearing ${oldCaches.length} old caches...`);
    return Promise.all(oldCaches.map(key => caches.delete(key)));
}


/**
 * The SW fetch event is responsible to handle all requests of the app.
 * At first it tries to find the requested information in the cache.
 * If this fails because it's not stored in the cache,
 * the request is forwarded to the network.
 */
self.addEventListener('fetch', evt => {
    const url = evt.request.url,
          ignoreURL = (url.includes('chrome-extension') || url.includes('fiveserver'));
    // if (!ignoreURL) console.log(`Service worker [${APP.name}] fetching: ${url}`);

    // these types we try to find in cache firstly:
    const cacheTypes = ['style','script','image','font'];
    let response = null;
    if (cacheTypes.includes(evt.request.destination) || evt.request.mode === 'navigate') {
        response = cacheFirst(evt.request, ignoreURL);
    } else {
        response = networkFirst(evt.request, ignoreURL);
    }
    evt.respondWith(response);
});


/**
 * Async helper function.
 * Tries to find a requested asset in the cache.
 * If it fails, the request is forwarded to the network.
 * @param {Object} request the request for the wanted information
 * @param {Boolean} ignoreURL indicates whether an url is supposed to be ignored or not.
 *          (used only for development reasons)
 * @returns a response from the local cache (if available) or from the network.
 */
async function cacheFirst(request, ignoreURL = false) {
    const responseFromCache = await caches.match(request);
    if (responseFromCache) return responseFromCache;
    // nothing in cache! => trying to fetch it from server
    try {
        const responseFromServer = await fetch(request);
        if (!ignoreURL) pushToCache(request, responseFromServer.clone());
        return responseFromServer;
    } catch (error) {
        // when even nothing is in cache and also network fails,
        // there is nothing we can do, but we must always return a Response object!
        return new Response('Network error.', {
            status: 408,
            headers: {'Content-Type': 'text/plain'}
        });
    }
}


/**
 * Async helper function.
 * Tries to fetch a requested asset from the network.
 * If it fails, an attempt to find it in the cache takes place.
 * @param {Object} request the request for the wanted information
 * @param {Boolean} ignoreURL indicates whether an url is supposed to be ignored or not.
 *          (used only for development reasons)
 * @returns a response from the network (if available) or from the cache.
 */
async function networkFirst(request, ignoreURL = false) {
    try {
        const responseFromServer = await fetch(request);
        if (!ignoreURL) pushToCache(request, responseFromServer.clone());
        return responseFromServer;
    } catch(error) { // if server request failed, so we look in cache:
        const responseFromCache = await caches.match(request);
        if (responseFromCache) return responseFromCache;
        // when even nothing is in cache we must return a Response object with an error!
        return new Response('Network error.', {
            status: 408,
            headers: {'Content-Type': 'text/plain'}
        });
    }
}

/**
 * Helper function to store network requests to the cache
 * @param {Object} request the request to the network
 * @param {Object} response the response to be put into the cache
 */
function pushToCache(request, response) {
    caches.open(APP.cacheName).then(cache => {
        cache.put(request, response);
    });
}


/**
 * TODO Support push notofications here (i.e. if a new app version is available)
 * @see {@link https://www.youtube.com/watch?v=N9zpRvFRmj8}
 */
self.addEventListener('push', evt => {
    console.log(evt);
    const title = evt.data.text();
    evt.waitUntil(
        self.registration.showNotification(title)
    )
});