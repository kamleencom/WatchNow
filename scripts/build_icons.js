const fs = require('fs');
const path = require('path');

// List of icons used in index.html
const USED_ICONS = [
    'search',
    'star',
    'tv',
    'film',
    'clapperboard',
    'clock',
    'folder-kanban',
    'settings',
    'plus',
    'x',
    'check-circle-2',
    'pencil',
    'square',
    'arrow-left',
    'play',
    'play-circle',
    'check'
];

const ICONS_DIR = path.join(__dirname, '../node_modules/lucide-static/icons');
const OUTPUT_FILE = path.join(__dirname, '../js/icons.js');

let iconsObj = {};

USED_ICONS.forEach(iconName => {
    try {
        const svgPath = path.join(ICONS_DIR, `${iconName}.svg`);
        if (fs.existsSync(svgPath)) {
            let svgContent = fs.readFileSync(svgPath, 'utf8');
            // Trim to avoid whitespace issues
            iconsObj[iconName] = svgContent.trim();
            console.log(`✓ Loaded ${iconName}`);
        } else {
            console.error(`✗ Icon not found: ${iconName}`);
        }
    } catch (e) {
        console.error(`Error processing ${iconName}:`, e);
    }
});

const jsContent = `/**
 * Generated Static Lucide Icons
 * Avoids using the lucide runtime library which causes syntax errors on older webOS devices.
 */
(function() {
    var ICONS = ${JSON.stringify(iconsObj)};

    function replaceIcons(options) {
       // Support lucide.createIcons({ root: ... }) signature or no args
       var root = (options && options.root) || document;
       
       if (!root.querySelectorAll) return;
       
       var elements = root.querySelectorAll('[data-lucide]');
       for (var i = 0; i < elements.length; i++) {
           var element = elements[i];
           var name = element.getAttribute('data-lucide');
           
           if (ICONS[name]) {
               var div = document.createElement('div');
               div.innerHTML = ICONS[name];
               
               // Robustly find the SVG element, handling potential whitespace or comments
               var svg = div.getElementsByTagName('svg')[0];
               
               if (!svg) {
                   console.error('Lucide static: Could not parse SVG for icon: ' + name);
                   continue;
               }
               
               // Copy all attributes from the placeholder to the SVG
               Array.prototype.slice.call(element.attributes).forEach(function(attr) {
                   if (attr.name !== 'data-lucide') {
                       // Append classes instead of overwriting
                       if (attr.name === 'class') {
                           var existingClass = svg.getAttribute('class') || '';
                           svg.setAttribute('class', existingClass + ' ' + attr.value);
                       } else {
                           svg.setAttribute(attr.name, attr.value);
                       }
                   }
               });
               
               // Add standard lucide classes
               var currentClass = svg.getAttribute('class') || '';
               if (currentClass.indexOf('lucide') === -1) {
                   svg.setAttribute('class', (currentClass + ' lucide lucide-' + name).trim());
               }
               
               element.parentNode.replaceChild(svg, element);
           }
       }
    }

    // Run on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { replaceIcons(); });
    } else {
        replaceIcons();
    }
    
    // Expose as window.lucide to match the library signature
    window.lucide = {
        createIcons: replaceIcons,
        icons: ICONS // Expose icons map if needed
    };
    
    // Also expose simple function
    window.renderIcons = replaceIcons;
})();
`;

fs.writeFileSync(OUTPUT_FILE, jsContent);
console.log(`Generated ${OUTPUT_FILE} with ${Object.keys(iconsObj).length} icons.`);
