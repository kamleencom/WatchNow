# MediaCard Component - Unified Card System

## Overview
Created a unified, reusable card component (`MediaCard`) that handles all card types in the OKPlayer app. This component consolidates previously scattered card creation logic into a single, maintainable component.

## Component Location
- **File**: `/Users/almejdoubi/watchnow/OKPlayer/js/components/media-card.js`
- **Loaded in**: `index.html` (before app.js)

## Features

### Card Types Supported
1. **Simple Cards** - Standard movie, series, and channel cards
2. **Continue Watching Cards** - Cards with progress bars and metadata (S/E tags, percentage)
3. **Bucket Cards** - Folder-style cards for favorite buckets

### Variations

#### 1. Simple Cards (Default)
```javascript
const card = MediaCard.create(item, 'movies');
// or
const card = MediaCard.create(item, 'series');
const card = MediaCard.create(item, 'live');
```

**Features**:
- Movie/Series/Channel card with poster image
- Favorite button (star icon)
- Status badge (if stream checking is enabled)
- Badges (HD, 4K, etc.)
- Title overlay
- Auto-generated placeholder if no image

#### 2. Continue Watching Cards
```javascript
const card = MediaCard.create(item, type, {
    showProgress: true,
    progressPercent: 75,
    progressTime: 3600,
    progressDuration: 4800,
    continueWatchingMeta: {
        season: 2,
        episode: 5
    },
    onClick: (item, type, card, meta) => {
        // Custom click handler
    }
});
```

**Features**:
- All simple card features
- Progress bar at bottom showing watch percentage
- Metadata row below card with:
  - Icon (film/clapperboard/tv)
  - Season/Episode info (S2 E5)
  - Watch percentage (75%)

#### 3. Bucket Cards
```javascript
const card = MediaCard.create(bucket, bucket.type, {
    isBucketCard: true,
    onClick: (item, type, card) => {
        // Handle bucket click
    }
});
```

**Features**:
- Folder-style design with gradient background
- Type-specific icon (folder/tv/film/clapperboard)
- Bucket name and type label

## Options

### All Options Available
```typescript
{
    // Continue watching options
    showProgress: boolean,             // Show progress bar
    progressPercent: number,           // Progress percentage 0-100
    progressTime: number,              // Current time in seconds
    progressDuration: number,          // Total duration in seconds
    continueWatchingMeta: {
        season: number,
        episode: number
    },
    
    // Click handlers
    onClick: Function,                 // Custom click handler
    onFavoriteToggle: Function,        // Custom favorite toggle handler
    
    // Display options
    showFavoriteButton: boolean,       // Show/hide favorite button (default: true)
    showStatusBadge: boolean,          // Show/hide status badge (default: based on settings)
    
    // Sizing
    width: string,                     // Custom width (e.g., '240px')
    height: string,                    // Custom height (e.g., '330px')
    
    // Special cards
    isBucketCard: boolean             // Render as bucket folder card
}
```

## Implementation Details

### Backward Compatibility
The old `createCard()` function has been converted to a wrapper that calls `MediaCard.create()`:
```javascript
function createCard(item, type) {
    return MediaCard.create(item, type);
}
```

This ensures all existing code continues to work without modification.

### Where It's Used

1. **Live TV View** - Channel cards
2. **Movies View** - Movie cards in categories
3. **Series View** - Series cards in categories
4. **Home View**:
   - Continue Watching section (with progress bars)
   - Favorite Channels section
   - Favorite Buckets section (folder cards)
   - Favorite Movies section
   - Favorite Series section
5. **Search Results** - All search result cards
6. **Favorite Buckets** - Grid view cards

### Code Improvements

**Before (Continue Watching - 150+ lines)**:
```javascript
// Manual DOM creation for wrapper
const wrapper = document.createElement('div');
// ... 30 lines of styling...

// Create card and clone it
const originalCard = createCard(item, type);
const card = originalCard.cloneNode(true);
// ... re-attach all event listeners...

// Create progress bar manually
const barContainer = document.createElement('div');
// ... 20 lines of progress bar creation...

// Create metadata row manually
const metaRow = document.createElement('div');
// ... 40 lines of metadata creation...
```

**After (3 lines)**:
```javascript
const wrapper = MediaCard.create(item, type, {
    showProgress: true,
    progressPercent: percent,
    continueWatchingMeta: { season, episode },
    onClick: handleClick
});
```

## Benefits

1. **DRY (Don't Repeat Yourself)** - Single source of truth for all cards
2. **Maintainability** - Changes to card styling/behavior only need to happen in one place
3. **Consistency** - All cards have the same structure and behavior
4. **Flexibility** - Easy to add new card variations via options
5. **Code Reduction** - Reduced app.js by ~200 lines
6. **Type Safety** - Clear interface via JSDoc comments
7. **Testing** - Easier to test a single component than scattered code

## Usage Examples

### Standard Movie Card
```javascript
const movieCard = MediaCard.create(movie, 'movies');
container.appendChild(movieCard);
```

### Channel Card with Custom Click
```javascript
const channelCard = MediaCard.create(channel, 'live', {
    onClick: (item) => {
        openChannelPlayer(item);
    }
});
```

### Continue Watching with Full Options
```javascript
const continueCard = MediaCard.create(item, 'series', {
    showProgress: true,
    progressPercent: 67,
    progressTime: 2400,
    progressDuration: 3600,
    continueWatchingMeta: {
        season: 3,
        episode: 12
    },
    onClick: (item, type, card, meta) => {
        resumePlayback(item, meta);
    }
});
```

### Bucket Card
```javascript
const bucketCard = MediaCard.create(bucket, 'movies', {
    isBucketCard: true,
    onClick: (bucket) => {
        openBucketView(bucket);
    }
});
```

## Future Enhancements

Possible future additions to the component:
1. Loading states
2. Error states
3. Skeleton loading placeholders
4. Animation options
5. Context menu support
6. Multi-select mode
7. Card sizes presets (small, medium, large)
8. Custom badge support

## Migration Guide

To migrate existing code to use the new component:

1. **Simple replacement**: No changes needed - backward compatible
2. **Continue watching**: Replace manual wrapper creation with `MediaCard.create(..., { showProgress: true })`
3. **Bucket cards**: Replace manual DOM creation with `MediaCard.create(..., { isBucketCard: true })`
4. **Custom styling**: Use the `width` and `height` options instead of manual styling

## Notes

- The component handles all Lucide icon initialization
- Placeholder generation is automatic if no image is provided
- Stream status checking respects global settings
- Favorite button state is automatically managed
- Focus tracking for navigation is built-in
