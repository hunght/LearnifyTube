// Configuration file for application download links and version information

// Function to build download URLs based on a version
export const buildAppLinks = (
  version: string
): {
  windows: string;
  macos: string;
  linux: string;
  windowsZip: string;
  macosZip: string;
  macosIntelZip: string;
  linuxZip: string;
  releases: string;
  macosIntel: string;
  linuxRpm: string;
} => ({
  // Main platform download links (for manual downloads)
  windows: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-${version}.Setup.exe`,
  macos: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-${version}-arm64.dmg`,
  linux: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube_${version}_amd64.deb`,

  // Auto-update ZIP file links (for automatic updates)
  // Note: These patterns match Electron Forge's actual ZIP naming convention
  // Pattern: LearnifyTube-{platform}-{arch}-{version}.zip
  windowsZip: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-win32-x64-${version}.zip`,
  macosZip: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-darwin-arm64-${version}.zip`,
  macosIntelZip: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-darwin-x64-${version}.zip`,
  linuxZip: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-linux-x64-${version}.zip`,

  // Additional links
  releases: `https://github.com/hunght/LearnifyTube/releases`,

  // You can add other platform-specific links if needed
  macosIntel: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-${version}-x64.dmg`,
  linuxRpm: `https://github.com/hunght/LearnifyTube/releases/download/v${version}/LearnifyTube-${version}-1.x86_64.rpm`,
});
