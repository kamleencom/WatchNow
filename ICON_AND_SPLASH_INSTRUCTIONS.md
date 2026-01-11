# How to update Icons and Splash Screen for OK Player

We have updated your app name to "OK Player" in the configuration files. Now you need to provide the image files for the icons and splash screen.

## 1. Icons

You need to replace the existing icon files in the root directory of your project (`/Users/almejdoubi/watchnow/WatchNow/`).

**Required Files:**
*   **`icon.png`**: This is the small icon shown in the launcher.
    *   **Dimensions**: 80x80 pixels.
    *   **Format**: PNG.
*   **`largeIcon.png`**: This is the large icon shown in the launcher or store.
    *   **Dimensions**: 130x130 pixels (recommended for webOS).
    *   **Format**: PNG.

**Action:**
Overwrite the existing `icon.png` and `largeIcon.png` files in the `WatchNow` folder with your new designs.

## 2. Splash Screen

We have configured the app to look for a splash screen image named `splash.png`.

**Required File:**
*   **`splash.png`**: This image is displayed while the app is loading.
    *   **Dimensions**: 1920x1080 pixels (Full HD).
    *   **Format**: PNG.
    *   **Location**: It must be placed in the root directory (`/Users/almejdoubi/watchnow/WatchNow/`).

**Action:**
Create or get your splash screen image, name it `splash.png`, and place it in the `WatchNow` folder.

## Summary of Files to Add/Replace

| File Name | Dimensions | Description |
| :--- | :--- | :--- |
| `icon.png` | 80x80 px | Small App Icon |
| `largeIcon.png` | 130x130 px | Large App Icon |
| `splash.png` | 1920x1080 px | Splash Screen Background |

Once you have placed these files, when you re-package and install the app, the new icons and splash screen will be visible on your TV.
