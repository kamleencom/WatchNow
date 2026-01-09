# WatchNow - WebOS M3U8 Player

A modern M3U8 playlist player designed for LG WebOS TV, featuring a clean UI and efficient content categorization.

## Features

-   **Playlist Support**: Import via URL or Local File (`.m3u`, `.m3u8`).
-   **Smart Categorization**: Automatically groups content into **Channels**, **Series**, and **Movies** based on playlist metadata.
-   **Modern UI**: Dark theme, grid layouts, and smooth focus states.
-   **TV Navigation**: Fully navigable using arrow keys (Spatial Navigation).
-   **Playback**: 
    -   Native HLS support (WebOS/Safari) for maximum performance.
    -   **hls.js** fallback for compatibility with Chrome/Firefox.
    -   Fullscreen overlay player with native controls.

## Project Structure

-   `index.html`: Main application shell.
-   `css/styles.css`: All application styles and theming.
-   `js/app.js`: Main application logic and state management.
-   `js/parser.js`: M3U8 parsing logic.
-   `js/navigation.js`: Spatial navigation handler for remote control support.

## How to use

1.  **Launch** the app on your WebOS TV or simulator.
2.  **Import**: A modal will appear. Enter a URL or select a local downloaded `.m3u` file.
3.  **Navigate**: Use the remote's arrow keys to browse tabs and content.
4.  **Watch**: Click/Press OK on a card to start playback. Press Back (or Esc/Backspace) to close the player.

## Development

-   Built with Vanilla JS for performance.
-   Uses `webOSTV.js` for system integration.
