# How to Publish an App/Theme to Bruce App Store

This guide will walk you through the process of publishing your app or theme to the Bruce App Store repository.

## 📋 Prerequisites

Before you can publish an app or theme, you'll need:

1. **A GitHub repository** containing your app's source code
2. **Your app/theme files** ready and tested
3. **A logo** for your app/theme (PNG format - square - between 64px and 512px)
4. **Basic knowledge** of Git and GitHub
5. **App/Theme file layout**
   - **Apps** (and files) will be created on the device in the `/BruceJS/<category>/` directory - use `__dirpath` to reference the folder the script is being ran from if your app needs access to other files
   - **Themes** these will be created on the device in the `/BruceThemes/<theme name>` folder

## 🏗️ Repository Structure

Apps/themes in the Bruce App Store are organized as follows:

```txt
repositories/
└── [your-github-username]/
    └── [your-repository-name]/
        └── [Your App/Theme Name]/
            ├── metadata.json
            └── logo.png
```

## 📁 Setting Up Your App/Theme Directory

### 1. Fork and Clone the App Store Repository

1. Fork the [App-Store-Data repository](https://github.com/BruceDevices/App-Store-Data)
2. Clone your forked repository to your local machine
3. Create a new branch for your app submission

### 2. Create Your App/Theme Directory

Navigate to the `repositories` folder and create the following structure:

```bash
repositories/[your-github-username]/[your-repository-name]/[Your App/Theme Name]/
```

For example:

```bash
repositories/johndoe/my-awesome-apps/WiFi Scanner/
```

## 📄 Creating metadata.json

The `metadata.json` file contains all the essential information about your app/theme. Create this file in your app/theme directory with the following structure:

```json
{
  "name": "Your App/Theme Name",
  "description": "A brief description of what your app/theme does",
  "category": "Tools",
  "version": "1.0.0",
  "commit": "40-character-sha-hash-from-your-repository",
  "owner": "your-github-username",
  "repo": "your-repository-name",
  "path": "/path/to/files/in/your/repo/",
  "files": [
    "file1.js",
    {
      "source": "file2.js",
      "destination": "file-two.js"
    }
  ]
}
```

### Required Fields

| Field | Type | Description | Example |
| ----- | ---- | ----------- | ------- |
| `name` | String | Display name of your app/theme | "WiFi Scanner" |
| `description` | String | Brief description of functionality | "Scans for available WiFi networks" |
| `category` | String | App/theme category (see valid categories below) | "WiFi" |
| `version` | String | Semantic version (X.Y.Z format) | "1.0.0" |
| `commit` | String | Exact 40-character SHA hash from your repo | "a1b2c3d4e5f6..." |
| `owner` | String | Your GitHub username | "johndoe" |
| `repo` | String | Your repository name | "my-awesome-apps" |
| `path` | String | Path to files in your repository | "/" or "/apps/" |
| `files` | Array | List of files to include | See Files Array section below for details |

### Optional Fields

| Field | Type | Description | Example |
| ----- | ---- | ----------- | ------- |
| `supported-devices` | String or Array | Device compatibility (apps only, not themes) | See Supported Devices section below |

### Required Fields for Themes

| Field | Type | Description | Example |
| ----- | ---- | ----------- | ------- |
| `supported-screen-size` | String | Screen dimensions in widthxheight format | "320x170" |


### Valid Categories

Your app must use one of these categories, if submitting a theme please use the `Theme` category:

- `Audio`
- `Bluetooth`
- `Games`
- `GPIO`
- `Infrared`
- `Media`
- `RFID`
- `RF`
- `Themes` - Only for themes
- `Tools`
- `USB`
- `Utilities`
- `WiFi`

### Files Array

The `files` array can contain:

1. **Simple file paths** (strings):

   ```json
   "files": [
     "my-app.js",
     "config.txt"
   ]
   ```

2. **File mapping objects** (for renaming during installation):

   ```json
   "files": [
     {
       "source": "my_long_filename.js",
       "destination": "app.js"
     }
   ]
   ```

3. **Mixed array** of both types:

   ```json
   "files": [
     "readme.txt",
     {
       "source": "main_application.js",
       "destination": "app.js"
     }
   ]
   ```

### Supported Devices (Apps Only)

The `supported-devices` field is optional for apps/scripts and allows you to specify which devices your app is compatible with. This field is **not allowed for themes**. If not specified for an app, it will be available for all devices.

This field supports three formats:

1. **Single device name** (string):
   ```json
   "supported-devices": "M5Stack Cardputer"
   ```

2. **Array of device names**:
   ```json
   "supported-devices": [
     "M5Stack Cardputer",
     "Lilygo T-Embed",
     "M5Stack Core 2"
   ]
   ```

3. **Regular expression pattern** (string) that matches device names:
   ```json
   "supported-devices": "M5Stack.*"
   ```

**Common regex patterns:**
- `"M5Stack.*"` - All M5Stack devices
- `"CYD-.*"` - All CYD (Cheap Yellow Display) devices  
- `"Lilygo.*"` - All Lilygo devices
- `".*Cardputer.*"` - Any device with "Cardputer" in the name

**Valid device names** can be found in [supported-devices.json](supported-devices.json).

### Supported Screen Size (Themes Only)

The `supported-screen-size` field is **required for themes** and specifies the screen dimensions that the theme is designed for.

**Format:** `"widthxheight"` where width and height are positive integers.

**Examples:**
- `"320x170"` - For devices with 320x170 pixel screens
- `"240x135"` - For devices with 240x135 pixel screens  
- `"480x320"` - For devices with 480x320 pixel screens

```json
"supported-screen-size": "320x170"
```

## 🖼️ Creating logo.png

Your app/theme needs a logo file named exactly `logo.png`:

- **Format**: PNG only
- **Dimensions**: Between 64x64 and 512x512 pixels (must be square)
- **Transparency**: Supported
- **Filename**: Must be exactly `logo.png` (lowercase)

## 🔍 Validation Requirements

Before your app/theme is approved, it will be automatically validated for:

### File Requirements

- ✅ `metadata.json` exists and is valid JSON
- ✅ `logo.png` exists and is a valid PNG file (64x64 to 512x512, square)
- ✅ All required metadata fields are present and non-empty

### Version Requirements

- ✅ Version follows semantic versioning (X.Y.Z)
- ✅ Version is higher than any existing version (for updates)
- ✅ Commit hash is updated when version changes

### Repository Verification

- ✅ Folder structure matches `repositories/owner/repo/` format
- ✅ Commit hash exists in the specified repository
- ✅ All files in the `files` array exist at the specified commit
- ✅ Category is from the valid categories list

## 🚀 Publishing Process

### 1. Prepare Your Files

1. Ensure your app/theme is pushed to your GitHub repository
2. Note the exact commit hash of the version you want to publish
3. Create your app/theme directory in the App Store repository
4. Add your `metadata.json` and `logo.png` files

### 2. Submit a Pull Request

1. Commit your changes to your branch
2. Push the branch to your forked repository
3. Create a Pull Request against the main App Store repository
4. Fill out the PR description with details about your app/theme

### 3. Automated Validation

Once you submit your PR:

1. **Automated checks** will run to validate your submission
2. **Validation results** will be posted as a comment on your PR
3. **Labels** will be applied based on validation status:
   - 🟢 `review required` - Ready for manual review
   - 🔴 `missing metadata.json` - metadata.json file missing
   - 🔴 `invalid metadata.json` - metadata.json has errors
   - 🔴 `missing logo.png` - logo.png file missing
   - 🔵 `external contribution` - Submitted by external contributor

### 4. Manual Review

If validation passes:

1. A maintainer will review your app/theme for quality and security
2. They may request changes or ask questions
3. Once approved, your app/theme will be merged and available in the store

## 🔄 Updating Your App/Theme

To update an existing app/theme:

1. **Update your source code** in your GitHub repository
2. **Get the new commit hash** from the relevant commit
3. **Increment the version number** in metadata.json (must be higher)
4. **Update the commit hash** in metadata.json
5. **Submit a new Pull Request** with the changes

⚠️ **Important**: You must update both version AND commit hash for updates.

## 📝 Example Complete Submission

Here's a complete example for a WiFi scanner app:

**Folder structure:**

```txt
repositories/johndoe/bruce-tools/WiFi Scanner/
├── metadata.json
└── logo.png
```

**metadata.json:**

```json
{
  "name": "WiFi Scanner",
  "description": "Comprehensive WiFi network scanner with signal strength display",
  "category": "WiFi",
  "version": "1.2.0",
  "commit": "a1b2c3d4e5f6789012345678901234567890abcd",
  "owner": "johndoe",
  "repo": "bruce-tools",
  "path": "/wifi-apps/",
  "supported-devices": [
    "M5Stack Cardputer",
    "Lilygo T-Embed"
  ],
  "files": [
    {
      "source": "wifi_scanner_main.js",
      "destination": "scanner.js"
    },
    "config.json"
  ]
}
```

## Example Theme Submission

Here's an example for a dark theme:

**Folder structure:**

```txt
repositories/johndoe/bruce-themes/Dark Theme/
├── metadata.json
└── logo.png
```

**metadata.json:**

```json
{
  "name": "Dark Theme",
  "description": "A sleek dark theme for Bruce devices",
  "category": "Themes",
  "version": "1.0.0",
  "commit": "b2c3d4e5f6789012345678901234567890abcdef",
  "owner": "johndoe",
  "repo": "bruce-themes",
  "path": "/themes/",
  "supported-screen-size": "320x170",
  "files": [
    "wifi.gif",
    ...
    "config.gif",
    "theme.json"
  ]
}
```

## ❌ Common Validation Errors

| Error | Cause | Solution |
| ----- | ----- | -------- |
| "Missing required field" | Required field is empty or missing | Add all required fields to metadata.json |
| "Version must be in format X.Y.Z" | Invalid version format | Use semantic versioning (e.g., "1.0.0") |
| "Commit must be a valid 40-character SHA hash" | Wrong commit format | Use full 40-character commit hash |
| "Category is not in valid list" | Invalid category | Use one of the valid categories listed above |
| "Folder structure invalid" | Wrong directory structure | Place app/theme in `repositories/owner/repo/AppName/` |
| "File not found at commit" | File doesn't exist in repository | Ensure all files in `files` array exist at the commit |
| "Version must be incremented" | Version not updated for existing app/theme | Increase version number for updates |
| "supported-screen-size is required for themes" | Missing screen size for theme | Add supported-screen-size field with format "widthxheight" |
| "supported-screen-size must be in format 'widthxheight'" | Invalid screen size format | Use format like "320x170" |
| "supported-screen-size is only allowed for themes" | Used screen size on non-theme | Remove supported-screen-size field or change category to Themes |
| "supported-devices is not allowed for themes" | Used supported-devices on theme | Remove supported-devices field from themes |
| "Device not in supported devices list" | Invalid device name in supported-devices | Use device names from supported-devices.json |
| "Regex pattern doesn't match any devices" | Regex doesn't match any valid devices | Verify regex pattern matches at least one device |

## 💡 Tips for Success

1. **Test thoroughly** - Make sure your app/theme works before submitting
2. **Clear descriptions** - Write helpful descriptions for users
3. **Follow naming conventions** - Use clear, descriptive names
4. **Update documentation** - Include any necessary setup instructions in your repository
5. **Respond promptly** - Address review feedback quickly
6. **Version consistently** - Always increment version numbers for changes

## 🆘 Getting Help

If you encounter issues:

1. **Check validation output** - The automated validation provides detailed error messages
2. **Review this guide** - Ensure you've followed all requirements
3. **Check existing apps** - Look at successful submissions for examples
4. **Open an issue** - For questions about the process or technical issues

## 📚 Additional Resources

- [Semantic Versioning Guide](https://semver.org/)
- [Git Commit Hash Documentation](https://git-scm.com/docs/git-rev-parse)
- [Bruce Device Documentation](https://wiki.bruce.computer/)

---

**Ready to publish?** Follow the steps above and submit your Pull Request! 🚀
