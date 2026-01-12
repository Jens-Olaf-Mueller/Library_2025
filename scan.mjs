/**
 * Asset Scanner Runner Script
 * ============================================================================
 * This script acts as the local build-time entry point for the AssetScanner.
 * It configures the scanner's behavior (e.g., which file types to ignore)
 * and triggers the generation of the 'assets.json' manifest.
 *
 * Usage:
 * Execute via terminal: "node scan.mjs"
 *
 * Security Note:
 * This file is intended for local development environments only. It is
 * recommended to include this file in .gitignore to prevent it from being
 * deployed to production servers.
 * ============================================================================
 */

import AssetScanner from './js/classes/AssetScanner.mjs';

const scanner = new AssetScanner({
    path: './',                 // Root des Projekts
    filename: 'assets.json',    // Dateiname der Manifest-Datei
    styles: true,               // Wir wollen Styles tracken...
    scripts: true,              // ... und Scripte...
    markup: true                // ... und HTML auch!
});

scanner.scan();