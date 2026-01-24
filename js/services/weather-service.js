/**
 * Weather Service
 * Handles weather data fetching, caching, time display, and UI updates.
 * Consolidates all weather and time-related functionality.
 */

class WeatherService {
    constructor() {
        this.WEATHER_API_KEY = '7a5114ab46b944259e7150018262301';
        this.timeInterval = null;
        this.weatherInterval = null;
    }

    /**
     * Initialize the welcome section with time and weather
     * Call this once during app initialization
     */
    init() {
        // Start time updates
        this.updateTime();
        this.timeInterval = setInterval(() => this.updateTime(), 1000);

        // Initial weather load
        this.manageWeather();

        // Check weather cache status every 30 minutes
        this.weatherInterval = setInterval(() => this.manageWeather(), 30 * 60 * 1000);
    }

    /**
     * Clean up intervals when needed
     */
    dispose() {
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }
        if (this.weatherInterval) {
            clearInterval(this.weatherInterval);
            this.weatherInterval = null;
        }
    }

    /**
     * Update the time display in the welcome section
     */
    updateTime() {
        const now = new Date();
        const timeEl = document.getElementById('current-time');
        const dateEl = document.getElementById('current-date');

        if (timeEl) {
            // Format: HH:MM
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            timeEl.textContent = `${hours}:${minutes}`;
        }

        if (dateEl) {
            // Format: DAY, MONTH DD
            const options = { weekday: 'long', month: 'long', day: 'numeric' };
            dateEl.textContent = now.toLocaleDateString('en-US', options);
        }
    }

    /**
     * Fetch weather data from the API
     * @returns {Promise<Object>} Weather data from API
     * @throws {Error} If API call fails
     */
    async fetchWeatherData() {
        if (!this.WEATHER_API_KEY || this.WEATHER_API_KEY === 'YOUR_API_KEY_HERE') {
            throw new Error("Weather API key not configured");
        }

        const url = `https://api.weatherapi.com/v1/forecast.json?key=${this.WEATHER_API_KEY}&q=auto:ip&days=1`;

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Weather API Error: ${res.status}`);
        }

        return await res.json();
    }

    /**
     * Manage weather data - check cache first, fetch if needed
     */
    async manageWeather() {
        const tempEl = document.getElementById('weather-temp');
        const descEl = document.getElementById('weather-desc');

        const todayStr = new Date().toISOString().split('T')[0];
        const cached = window.storageService ? window.storageService.loadWeatherCache() : null;
        let weatherData = null;

        // Check if cache is valid for today
        if (cached && cached.date === todayStr && cached.data) {
            console.log("[WeatherService] Using cached weather data");
            weatherData = cached.data;
        }

        // Fetch new data if cache is not valid
        if (!weatherData) {
            try {
                console.log("[WeatherService] Fetching new weather data");
                weatherData = await this.fetchWeatherData();

                // Save to cache
                if (window.storageService) {
                    window.storageService.saveWeatherCache({
                        date: todayStr,
                        data: weatherData
                    });
                }
            } catch (e) {
                console.error("[WeatherService] Weather fetch failed", e);
                if (descEl && (!tempEl || !tempEl.textContent.includes('°'))) {
                    descEl.textContent = "Weather Unavailable";
                }
                return;
            }
        }

        // Update UI
        if (weatherData) {
            this.updateWeatherUI(weatherData);
        }
    }

    /**
     * Update the weather display in the welcome section
     * @param {Object} data - Weather API response data
     */
    updateWeatherUI(data) {
        const tempEl = document.getElementById('weather-temp');
        const descEl = document.getElementById('weather-desc');
        const locEl = document.getElementById('weather-location');
        const iconEl = document.getElementById('weather-icon');

        // Get current hour's data from forecast if available
        const currentHour = new Date().getHours();
        let currentData = data.current;

        if (data.forecast && data.forecast.forecastday && data.forecast.forecastday[0]) {
            const hourly = data.forecast.forecastday[0].hour;
            if (hourly && hourly[currentHour]) {
                currentData = hourly[currentHour];
            }
        }

        if (tempEl) {
            tempEl.textContent = `${Math.round(currentData.temp_c)}°C`;
        }

        if (descEl) {
            descEl.textContent = currentData.condition.text;
        }

        if (locEl) {
            locEl.textContent = `${data.location.name}, ${data.location.country}`;
        }

        if (iconEl) {
            iconEl.src = 'https:' + currentData.condition.icon.replace('64x64', '128x128');
            iconEl.style.display = 'block';
        }
    }

    /**
     * Set a custom API key for weather
     * @param {string} apiKey - The weather API key
     */
    setApiKey(apiKey) {
        this.WEATHER_API_KEY = apiKey;
    }

    /**
     * Force refresh weather data (bypass cache)
     */
    async refreshWeather() {
        try {
            const weatherData = await this.fetchWeatherData();
            const todayStr = new Date().toISOString().split('T')[0];

            if (window.storageService) {
                window.storageService.saveWeatherCache({
                    date: todayStr,
                    data: weatherData
                });
            }

            this.updateWeatherUI(weatherData);
        } catch (e) {
            console.error("[WeatherService] Force refresh failed", e);
        }
    }
}

// Export singleton
window.weatherService = new WeatherService();
