/**
 * Name Processing Logic
 * Sanitizes channel/media names and extracts metadata like quality/resolution.
 */
class NameProcessor {
    static process(name) {
        if (!name) return { title: 'Unknown', badges: [] };

        let cleanName = name;
        const badges = [];

        // 0. Detect Country Codes (e.g. MA- , ES-, [FR])
        // We look for 2-3 letter codes at start, followed by separator
        const countryMap = {
            'MA': '🇲🇦', 'MAR': '🇲🇦',
            'ES': '🇪🇸', 'ESP': '🇪🇸',
            'FR': '🇫🇷', 'FRA': '🇫🇷',
            'UK': '🇬🇧', 'GB': '🇬🇧',
            'US': '🇺🇸', 'USA': '🇺🇸',
            'DE': '🇩🇪', 'GER': '🇩🇪',
            'IT': '🇮🇹', 'ITA': '🇮🇹',
            'TR': '🇹🇷', 'TUR': '🇹🇷',
            'PT': '🇵🇹', 'POR': '🇵🇹',
            'BE': '🇧🇪',
            'CH': '🇨🇭',
            'NL': '🇳🇱',
            'PL': '🇵🇱',
            'RU': '🇷🇺',
            'UA': '🇺🇦',
            'SA': '🇸🇦', 'KSA': '🇸🇦', 'AR': '🇦🇷', // AR is typically Argentina
            'AE': '🇦🇪',
            'QA': '🇶🇦',
            'EG': '🇪🇬',
            'DZ': '🇩🇿', 'ALG': '🇩🇿',
            'TN': '🇹🇳',
            'LY': '🇱🇾',
            'AF': '🇦🇫',
            'IN': '🇮🇳',
            'PK': '🇵🇰',
            'BR': '🇧🇷',
            'CA': '🇨🇦',
            'AU': '🇦🇺',
            'MX': '🇲🇽'
        };

        // Regex: Start of string, optional bracket, 2-6 letters (e.g. US, USA, IRAQ, GOLF), optional bracket, separator (- : | >), OPTIONAL space
        // Expanded to 6 letters and optional space after separator to catch "IRAQ-NAME"
        const countryRegex = /^([\[\(]?([A-Z]{2,6})[\]\)]?)\s*[-:|]\s*/i;
        const match = cleanName.match(countryRegex);

        let flag = '';

        if (match) {
            // We strip any detected prefix that matches the pattern (Country or Generic Prefix)
            cleanName = cleanName.replace(match[0], '');
        }

        // 1. Detect Resolution/Quality
        // Common Patterns: FHD, HD, SD, 4K, HEVC, H.265, 1080p, 720p
        const qualityMap = [
            { pattern: /\b(4K|UHD|2160p)\b/i, badge: '4K' },
            { pattern: /\b(FHD|1080p)\b/i, badge: 'FHD' },
            { pattern: /\b(HD|720p)\b/i, badge: 'HD' },
            { pattern: /\b(SD|480p|576p)\b/i, badge: 'SD' },
            { pattern: /\b(HEVC|H\.265)\b/i, badge: 'HEVC' },
            { pattern: /\b(Backup)\b/i, badge: 'BACKUP' },
            { pattern: /\b(Catchup)\b/i, badge: 'CATCHUP' }
        ];

        qualityMap.forEach(({ pattern, badge }) => {
            if (pattern.test(cleanName)) {
                badges.push(badge);
                // Remove from name
                cleanName = cleanName.replace(pattern, ' ');
            }
        });

        // Clean up leftover brackets that might have been around the badge (e.g. "[]" or "()")
        cleanName = cleanName.replace(/\(\s*\)/g, ' ').replace(/\[\s*\]/g, ' ').replace(/\{\s*\}/g, ' ');

        // 2. Remove Prefixes/Suffixes
        // Remove [COLOR] tags often found in IPTV (e.g. [RED], [blue])
        cleanName = cleanName.replace(/\[[a-zA-Z]+\]/g, ' ');

        // Remove numeric prefixes like "123. " or "1 - " or "001 "
        cleanName = cleanName.replace(/^\s*\d+[\.\-\:]\s+/, '');

        // 3. Remove Separators junk
        // Replace | with space
        cleanName = cleanName.replace(/\|/g, ' ');

        // 4. Final Trim & Cleanup
        cleanName = cleanName.replace(/\s+/g, ' ').trim();
        // Remove trailing hyphen/colon/brackets if remaining
        cleanName = cleanName.replace(/[\-\:\>]+$/, '');

        const finalTitle = flag + cleanName.trim();

        return { title: finalTitle, badges: [...new Set(badges)] }; // Unique badges
    }

    static processCategory(name) {
        if (!name) return "Uncategorized";
        let clean = name;

        // Remove numbering prefix e.g. "1. Movies"
        clean = clean.replace(/^\s*\d+[\.\-\:]\s+/, '');

        // Clean excessive whitespace
        clean = clean.replace(/\s+/g, ' ').trim();

        return clean;
    }
}
