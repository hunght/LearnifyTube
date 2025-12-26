#!/usr/bin/env node
/**
 * SonarJS Code Quality Report Generator
 * Analyzes codebase for:
 * - Cognitive complexity (complex functions)
 * - Long files (file length)
 *
 * Generates an HTML report with detailed findings
 * Usage: npm run analyze:complexity
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

interface ComplexityIssue {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  severity: "error" | "warn";
  complexity?: number;
}

interface FileStats {
  path: string;
  lineCount: number;
  complexityIssues: ComplexityIssue[];
}

// Run ESLint with SonarJS rules focused on complexity
// We use a lower threshold (15) for the report to catch more issues
function runESLint(): any[] {
  try {
    // Use the temporary config file with lower complexity threshold
    const configPath = path.join(projectRoot, "eslint.complexity-report.config.js");
    const command = `./node_modules/.bin/eslint "src/**/*.{ts,tsx}" --format json --config eslint.complexity-report.config.js`;
    const output = execSync(command, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const results = JSON.parse(output);
    return results;
  } catch (error: any) {
    // ESLint returns non-zero exit code when issues are found
    // Try to parse the output anyway
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        console.error("Failed to parse ESLint output:", error.message);
        return [];
      }
    }
    if (error.stderr && !error.stdout) {
      // Only log stderr if we don't have stdout to parse
      const stderr = error.stderr?.toString() || error.stderr || "";
      if (!stderr.includes("No files matching") && !stderr.includes("cognitive-complexity")) {
        console.error("ESLint error:", stderr);
      }
    }
    return [];
  }
}

// Get file line count
function getFileLineCount(filePath: string): number {
  try {
    const fullPath = path.resolve(projectRoot, filePath);
    if (!fs.existsSync(fullPath)) return 0;
    const content = fs.readFileSync(fullPath, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

// Extract complexity from message
function extractComplexity(message: string): number | null {
  // Match patterns like "from 25 to 15" or "has a complexity of 30"
  const match = message.match(/(?:from|has a complexity of|complexity of)\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// Collect all issues
function collectIssues(results: any[]): {
  complexityIssues: ComplexityIssue[];
  fileStats: FileStats[];
} {
  const complexityIssues: ComplexityIssue[] = [];
  const fileMap = new Map<string, FileStats>();

  results.forEach((file: any) => {
    if (!file.filePath || !file.messages) return;

    const relativePath = path.relative(projectRoot, file.filePath);
    const lineCount = getFileLineCount(relativePath);

    // Initialize file stats
    if (!fileMap.has(relativePath)) {
      fileMap.set(relativePath, {
        path: relativePath,
        lineCount,
        complexityIssues: [],
      });
    }

    const fileStats = fileMap.get(relativePath)!;

    file.messages.forEach((msg: any) => {
      // Focus on cognitive complexity rule
      if (msg.ruleId === "sonarjs/cognitive-complexity") {
        const complexity = extractComplexity(msg.message) || 0;
        const issue: ComplexityIssue = {
          file: relativePath,
          line: msg.line,
          column: msg.column,
          rule: msg.ruleId,
          message: msg.message,
          severity: msg.severity === 2 ? "error" : "warn",
          complexity,
        };
        complexityIssues.push(issue);
        fileStats.complexityIssues.push(issue);
      }
    });
  });

  const fileStats = Array.from(fileMap.values())
    .filter((f) => f.lineCount > 0) // Only include files that exist
    .sort((a, b) => {
      // Sort by: 1) Has complexity issues, 2) Line count
      if (a.complexityIssues.length > 0 && b.complexityIssues.length === 0) return -1;
      if (a.complexityIssues.length === 0 && b.complexityIssues.length > 0) return 1;
      return b.lineCount - a.lineCount;
    });

  return { complexityIssues, fileStats };
}

// Generate HTML report
function generateHTMLReport(complexityIssues: ComplexityIssue[], fileStats: FileStats[]): string {
  // Calculate statistics
  const filesWithComplexity = fileStats.filter((f) => f.complexityIssues.length > 0);
  const longFiles = fileStats.filter((f) => f.lineCount > 500); // Files with > 500 lines
  const veryLongFiles = fileStats.filter((f) => f.lineCount > 1000); // Files with > 1000 lines

  const complexityScores = complexityIssues.map((i) => i.complexity || 0).filter((s) => s > 0);

  const avgComplexity =
    complexityScores.length > 0
      ? complexityScores.reduce((a, b) => a + b, 0) / complexityScores.length
      : 0;
  const maxComplexity = complexityScores.length > 0 ? Math.max(...complexityScores) : 0;

  // Categorize by severity
  const critical = complexityScores.filter((s) => s > 50).length;
  const high = complexityScores.filter((s) => s > 30 && s <= 50).length;
  const medium = complexityScores.filter((s) => s > 20 && s <= 30).length;
  const low = complexityScores.filter((s) => s > 15 && s <= 20).length;

  // Group complexity issues by file
  const issuesByFile = new Map<string, ComplexityIssue[]>();
  complexityIssues.forEach((issue) => {
    if (!issuesByFile.has(issue.file)) {
      issuesByFile.set(issue.file, []);
    }
    issuesByFile.get(issue.file)!.push(issue);
  });

  // Sort files by max complexity
  const sortedFiles = Array.from(issuesByFile.entries())
    .map(([file, issues]) => {
      const maxComplexityInFile = Math.max(...issues.map((i) => i.complexity || 0));
      return { file, issues, maxComplexity: maxComplexityInFile };
    })
    .sort((a, b) => b.maxComplexity - a.maxComplexity);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SonarJS Code Quality Report - ${new Date().toLocaleDateString()}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        h1 { font-size: 2.5em; margin-bottom: 10px; }
        .subtitle { opacity: 0.9; font-size: 1.1em; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
            border-bottom: 3px solid #e9ecef;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .priority-badges {
            display: flex;
            justify-content: center;
            gap: 15px;
            padding: 20px;
            background: #fff;
            border-bottom: 2px solid #e9ecef;
            flex-wrap: wrap;
        }
        .badge {
            padding: 10px 20px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.9em;
        }
        .badge-critical { background: #ff6b6b; color: white; }
        .badge-high { background: #ff922b; color: white; }
        .badge-medium { background: #ffd43b; color: #333; }
        .badge-low { background: #69db7c; color: white; }
        .content { padding: 30px; }
        .section {
            margin-bottom: 40px;
        }
        .section-title {
            font-size: 1.8em;
            margin-bottom: 20px;
            color: #333;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        .file-section {
            margin-bottom: 30px;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            overflow: hidden;
        }
        .file-header {
            background: linear-gradient(90deg, #667eea, #764ba2);
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
        }
        .file-path {
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 1em;
            font-weight: 600;
        }
        .file-meta {
            display: flex;
            gap: 15px;
            align-items: center;
        }
        .complexity-badge, .lines-badge {
            padding: 5px 15px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 0.9em;
            background: rgba(255, 255, 255, 0.2);
        }
        .complexity-critical { background: #ff6b6b; }
        .complexity-high { background: #ff922b; }
        .complexity-medium { background: #ffd43b; color: #333; }
        .complexity-low { background: #69db7c; }
        .lines-warning { background: #ff922b; }
        .lines-critical { background: #ff6b6b; }
        .issue {
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
            transition: background 0.2s;
        }
        .issue:hover {
            background: #f8f9fa;
        }
        .issue:last-child {
            border-bottom: none;
        }
        .issue-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }
        .issue-icon {
            font-size: 1.2em;
        }
        .issue-location {
            font-family: 'Monaco', 'Courier New', monospace;
            color: #667eea;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            padding: 5px 10px;
            background: #f0f2ff;
            border-radius: 5px;
            transition: all 0.2s;
        }
        .issue-location:hover {
            background: #667eea;
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        .issue-message {
            color: #495057;
            margin-left: 32px;
        }
        .complexity-bar {
            margin: 10px 0 10px 32px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .bar-container {
            flex: 1;
            max-width: 500px;
            height: 20px;
            background: #e9ecef;
            border-radius: 10px;
            overflow: hidden;
        }
        .bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #51cf66, #ffd43b, #ff922b, #ff6b6b);
            transition: width 0.3s;
        }
        .bar-score {
            font-weight: bold;
            font-family: 'Monaco', 'Courier New', monospace;
        }
        .long-file-item {
            padding: 15px 20px;
            border-bottom: 1px solid #e9ecef;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .long-file-item:last-child {
            border-bottom: none;
        }
        .long-file-item:hover {
            background: #f8f9fa;
        }
        footer {
            padding: 30px;
            background: #f8f9fa;
            border-top: 3px solid #e9ecef;
            text-align: center;
            color: #666;
        }
        .footer-links {
            margin-top: 15px;
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
        }
        .footer-link {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
        }
        .footer-link:hover {
            text-decoration: underline;
        }
        .tabs {
            display: flex;
            gap: 10px;
            padding: 20px 30px 0;
            background: #f8f9fa;
            border-bottom: 2px solid #e9ecef;
        }
        .tab {
            padding: 12px 24px;
            background: white;
            border: 2px solid #e9ecef;
            border-bottom: none;
            border-radius: 8px 8px 0 0;
            cursor: pointer;
            font-weight: 600;
            color: #666;
            transition: all 0.2s;
            position: relative;
            top: 2px;
        }
        .tab:hover {
            background: #f0f2ff;
            color: #667eea;
        }
        .tab.active {
            background: white;
            color: #667eea;
            border-color: #667eea;
            border-bottom-color: white;
            z-index: 1;
        }
        .tab-content {
            display: none;
            padding: 30px;
        }
        .tab-content.active {
            display: block;
        }
        .tab-badge {
            display: inline-block;
            margin-left: 8px;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 600;
            background: #e9ecef;
            color: #495057;
        }
        .tab.active .tab-badge {
            background: #667eea;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 SonarJS Code Quality Report</h1>
            <div class="subtitle">Cognitive Complexity & File Length Analysis · Generated ${new Date().toLocaleString()}</div>
        </header>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${complexityIssues.length}</div>
                <div class="stat-label">Complex Functions</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${avgComplexity.toFixed(1)}</div>
                <div class="stat-label">Avg Complexity</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${maxComplexity}</div>
                <div class="stat-label">Max Complexity</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${longFiles.length}</div>
                <div class="stat-label">Long Files (>500 lines)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${veryLongFiles.length}</div>
                <div class="stat-label">Very Long Files (>1000 lines)</div>
            </div>
        </div>

        <div class="priority-badges">
            ${critical > 0 ? `<div class="badge badge-critical">🔴 Critical: ${critical}</div>` : ""}
            ${high > 0 ? `<div class="badge badge-high">🟠 High: ${high}</div>` : ""}
            ${medium > 0 ? `<div class="badge badge-medium">🟡 Medium: ${medium}</div>` : ""}
            ${low > 0 ? `<div class="badge badge-low">🟢 Low: ${low}</div>` : ""}
        </div>

        <div class="tabs">
            <button class="tab active" data-tab="complexity">
                🔴 Complex Functions
                ${complexityIssues.length > 0 ? `<span class="tab-badge">${complexityIssues.length}</span>` : ""}
            </button>
            <button class="tab" data-tab="long-files">
                📏 Long Files
                ${longFiles.length > 0 ? `<span class="tab-badge">${longFiles.length}</span>` : ""}
            </button>
        </div>

        <div class="content">
            <div id="tab-complexity" class="tab-content active">
                ${
                  complexityIssues.length > 0
                    ? `
                <div class="section">
                    <h2 class="section-title">🔴 Complex Functions (Cognitive Complexity)</h2>
                    ${sortedFiles
                      .map(({ file, issues, maxComplexity: fileMaxComplexity }) => {
                        const priorityClass =
                          fileMaxComplexity > 50
                            ? "critical"
                            : fileMaxComplexity > 30
                              ? "high"
                              : fileMaxComplexity > 20
                                ? "medium"
                                : "low";
                        const priorityEmoji =
                          fileMaxComplexity > 50
                            ? "🔴"
                            : fileMaxComplexity > 30
                              ? "🟠"
                              : fileMaxComplexity > 20
                                ? "🟡"
                                : "🟢";

                        return `
                        <div class="file-section">
                            <div class="file-header">
                                <span class="file-path">📁 ${file}</span>
                                <div class="file-meta">
                                    <span class="complexity-badge complexity-${priorityClass}">${priorityEmoji} Max: ${fileMaxComplexity}</span>
                                </div>
                            </div>
                            ${issues
                              .map((issue) => {
                                const complexity = issue.complexity || 0;
                                const barWidth = Math.min((complexity / 50) * 100, 100);
                                const cursorLink = `cursor://file${path.resolve(projectRoot, issue.file)}:${issue.line}:${issue.column}`;

                                return `
                                <div class="issue">
                                    <div class="issue-header">
                                        <span class="issue-icon">${issue.severity === "error" ? "❌" : "⚠️"}</span>
                                        <a href="${cursorLink}" class="issue-location" title="Open in Cursor IDE">
                                            Line ${issue.line}:${issue.column}
                                        </a>
                                    </div>
                                    <div class="issue-message">${issue.message}</div>
                                    <div class="complexity-bar">
                                        <div class="bar-container">
                                            <div class="bar-fill" style="width: ${barWidth}%"></div>
                                        </div>
                                        <span class="bar-score">Complexity: ${complexity}</span>
                                    </div>
                                </div>
                              `;
                              })
                              .join("")}
                        </div>
                      `;
                      })
                      .join("")}
                </div>
                `
                    : `
                <div class="section" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 4em; margin-bottom: 20px;">✅</div>
                    <h2 style="color: #51cf66; margin-bottom: 10px;">No Complex Functions Found!</h2>
                    <p style="color: #868e96; font-size: 1.1em;">All functions have cognitive complexity ≤ 15</p>
                </div>
                `
                }
            </div>

            <div id="tab-long-files" class="tab-content">
                <div class="section">
                    <h2 class="section-title">📏 Long Files (File Length Analysis)</h2>
                    <div class="file-section">
                        <div class="file-header">
                            <span>Files sorted by line count</span>
                            <span>Total: ${fileStats.length} files analyzed</span>
                        </div>
                        ${
                          fileStats.filter((f) => f.lineCount > 300).length > 0 // Show files with > 300 lines
                            ? fileStats
                                .filter((f) => f.lineCount > 300)
                                .map((file) => {
                                  const isVeryLong = file.lineCount > 1000;
                                  const isLong = file.lineCount > 500;
                                  const badgeClass = isVeryLong
                                    ? "lines-critical"
                                    : isLong
                                      ? "lines-warning"
                                      : "";
                                  const badgeText = isVeryLong
                                    ? "🔴 Very Long"
                                    : isLong
                                      ? "🟠 Long"
                                      : "";
                                  const cursorLink = `cursor://file${path.resolve(projectRoot, file.path)}:1:1`;

                                  return `
                                <div class="long-file-item">
                                    <div>
                                        <a href="${cursorLink}" class="issue-location" style="display: inline-block; margin-right: 10px;">
                                            📄 ${file.path}
                                        </a>
                                        ${
                                          file.complexityIssues.length > 0
                                            ? `<span style="color: #ff6b6b; font-weight: 600;">(${file.complexityIssues.length} complex function${file.complexityIssues.length > 1 ? "s" : ""})</span>`
                                            : ""
                                        }
                                    </div>
                                    <div style="display: flex; gap: 15px; align-items: center;">
                                        ${badgeText ? `<span class="lines-badge ${badgeClass}">${badgeText}</span>` : ""}
                                        <span style="font-family: 'Monaco', 'Courier New', monospace; font-weight: 600; color: #495057;">
                                            ${file.lineCount} lines
                                        </span>
                                    </div>
                                </div>
                            `;
                                })
                                .join("")
                            : `
                          <div style="text-align: center; padding: 60px 20px;">
                              <div style="font-size: 4em; margin-bottom: 20px;">✅</div>
                              <h2 style="color: #51cf66; margin-bottom: 10px;">No Long Files Found!</h2>
                              <p style="color: #868e96; font-size: 1.1em;">All files have ≤ 300 lines</p>
                          </div>
                          `
                        }
                    </div>
                </div>
            </div>
        </div>

        <footer>
            <div style="font-size: 1.2em; margin-bottom: 10px;">
                💡 <strong>Code Quality Metrics</strong>
            </div>
            <div style="margin-bottom: 15px; color: #868e96;">
                <strong>Cognitive Complexity:</strong> Measures how difficult code is to understand<br>
                <strong>File Length:</strong> Files with >500 lines may need refactoring, >1000 lines are considered very long
            </div>
            <div class="footer-links">
                <a href="https://github.com/SonarSource/eslint-plugin-sonarjs" class="footer-link" target="_blank">📚 SonarJS Docs</a>
                <a href="https://www.sonarsource.com/docs/CognitiveComplexity.pdf" class="footer-link" target="_blank">📄 Cognitive Complexity Whitepaper</a>
            </div>
        </footer>
    </div>

    <script>
        function showTab(tabName) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });

            // Show selected tab content
            const selectedContent = document.getElementById('tab-' + tabName);
            if (selectedContent) {
                selectedContent.classList.add('active');
            }

            // Add active class to clicked tab
            const clickedTab = document.querySelector('[data-tab="' + tabName + '"]');
            if (clickedTab) {
                clickedTab.classList.add('active');
            }
        }

        // Initialize tabs on page load
        document.addEventListener('DOMContentLoaded', function() {
            // Set up click handlers for all tabs
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const tabName = this.getAttribute('data-tab');
                    if (tabName) {
                        showTab(tabName);
                    }
                });
            });
        });
    </script>
</body>
</html>`;
}

// Main execution
function main() {
  console.log("🔍 Running SonarJS analysis...\n");

  try {
    const results = runESLint();

    if (!Array.isArray(results) || results.length === 0) {
      console.log("⚠️  No files analyzed. Make sure ESLint can find your source files.");
      return;
    }

    const { complexityIssues, fileStats } = collectIssues(results);

    console.log(`✅ Found ${complexityIssues.length} complex functions`);
    console.log(`✅ Analyzed ${fileStats.length} files\n`);

    if (complexityIssues.length === 0 && fileStats.filter((f) => f.lineCount > 500).length === 0) {
      console.log("🎉 Great! No complexity issues or very long files found.\n");
    }

    const html = generateHTMLReport(complexityIssues, fileStats);
    const outputPath = path.join(projectRoot, "sonarjs-quality-report.html");
    fs.writeFileSync(outputPath, html);

    console.log(`📊 HTML report generated: ${outputPath}`);
    console.log("🌐 Opening in browser...\n");

    // Open in default browser
    const command =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

    try {
      execSync(`${command} "${outputPath}"`, { stdio: "ignore" });
    } catch (error) {
      console.log("Could not open browser automatically. Please open manually:", outputPath);
    }
  } catch (error: any) {
    console.error("❌ Error generating report:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
