/**
 * Global State Management
 * Central state object and configuration constants.
 */

// State
const state = {
    resources: [], // Array of { id, name, url, active, color }
    aggregatedData: {
        channels: {},
        movies: {},
        series: {},
        catchup: {}
    },
    favorites: {
        channels: [],
        movies: [],
        series: [],
        buckets: []
    },
    currentView: 'home',
    searchQuery: '',
    focusedItem: null,
    categorySearchQuery: {
        live: '',
        movies: '',
        series: '',
        catchup: ''
    }
};

// Constants

const APP_VERSION = '0.0.37';
const MAX_SEARCH_RESULTS = 150;
const DISPLAY_LIMIT = 50;

// App Settings
const appSettings = {

    playerType: 'videojs'
};


let toastTimeout = null;
