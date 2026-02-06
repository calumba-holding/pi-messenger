#!/usr/bin/env node

/**
 * pi-messenger installer
 *
 * Copies the npm package contents to ~/.pi/agent/extensions/pi-messenger.
 * No git dependency — the npm package IS the source.
 *
 * Usage:
 *   npx pi-messenger                # Install or update extension
 *   npx pi-messenger --remove       # Remove the extension
 *   npx pi-messenger --crew-install   # Install crew agents and skills
 *   npx pi-messenger --crew-uninstall # Remove crew agents and skills
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_DIR = path.dirname(__filename);
const EXTENSION_DIR = path.join(os.homedir(), ".pi", "agent", "extensions", "pi-messenger");
const AGENTS_DIR = path.join(os.homedir(), ".pi", "agent", "agents");
const SKILLS_DIR = path.join(os.homedir(), ".pi", "agent", "skills");

const CREW_AGENTS = [
	"crew-planner.md",
	"crew-interview-generator.md",
	"crew-plan-sync.md",
	"crew-worker.md",
	"crew-reviewer.md",
];

const DEPRECATED_AGENTS = [
	"crew-repo-scout.md",
	"crew-practice-scout.md",
	"crew-docs-scout.md",
	"crew-web-scout.md",
	"crew-github-scout.md",
	"crew-gap-analyst.md",
];

const CREW_SKILLS = ["pi-messenger-crew"];

const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, "package.json"), "utf-8"));
const VERSION = pkg.version;

const args = process.argv.slice(2);
const isRemove = args.includes("--remove") || args.includes("-r");
const isCrewInstall = args.includes("--crew-install");
const isCrewUninstall = args.includes("--crew-uninstall");
const isHelp = args.includes("--help") || args.includes("-h");

if (isHelp) {
	console.log(`
pi-messenger v${VERSION} - Multi-agent coordination for pi

Usage:
  npx pi-messenger                Install or update extension
  npx pi-messenger --remove       Remove the extension
  npx pi-messenger --crew-install   Install crew agents and skills
  npx pi-messenger --crew-uninstall Remove crew agents and skills
  npx pi-messenger --help          Show this help

Extension directory: ${EXTENSION_DIR}
Agents directory:    ${AGENTS_DIR}
Skills directory:    ${SKILLS_DIR}
`);
	process.exit(0);
}

// ─── Crew install ────────────────────────────────────────────────────────────

if (isCrewInstall) {
	const sourceAgents = path.join(PACKAGE_DIR, "crew", "agents");
	if (!fs.existsSync(sourceAgents)) {
		console.error("Could not find crew agent files in package.");
		process.exit(1);
	}

	fs.mkdirSync(AGENTS_DIR, { recursive: true });
	fs.mkdirSync(SKILLS_DIR, { recursive: true });

	let installed = 0;
	let updated = 0;

	for (const agent of DEPRECATED_AGENTS) {
		const target = path.join(AGENTS_DIR, agent);
		if (fs.existsSync(target)) {
			fs.unlinkSync(target);
		}
	}

	for (const agent of CREW_AGENTS) {
		const src = path.join(sourceAgents, agent);
		const dst = path.join(AGENTS_DIR, agent);
		if (!fs.existsSync(src)) continue;
		const existed = fs.existsSync(dst);
		fs.copyFileSync(src, dst);
		if (existed) updated++;
		else installed++;
	}

	const sourceSkills = path.join(PACKAGE_DIR, "skills");
	for (const skill of CREW_SKILLS) {
		const srcDir = path.join(sourceSkills, skill);
		const dstDir = path.join(SKILLS_DIR, skill);
		if (!fs.existsSync(srcDir)) continue;
		const existed = fs.existsSync(dstDir);
		fs.mkdirSync(dstDir, { recursive: true });
		for (const file of fs.readdirSync(srcDir)) {
			const srcFile = path.join(srcDir, file);
			if (fs.statSync(srcFile).isFile()) {
				fs.copyFileSync(srcFile, path.join(dstDir, file));
			}
		}
		if (existed) updated++;
		else installed++;
	}

	console.log(`Crew installed (${installed} new, ${updated} updated)`);
	console.log(`  Agents: ${AGENTS_DIR}`);
	console.log(`  Skills: ${SKILLS_DIR}`);
	process.exit(0);
}

// ─── Crew uninstall ──────────────────────────────────────────────────────────

if (isCrewUninstall) {
	let removed = 0;

	for (const agent of [...CREW_AGENTS, ...DEPRECATED_AGENTS]) {
		const target = path.join(AGENTS_DIR, agent);
		if (fs.existsSync(target)) {
			fs.unlinkSync(target);
			removed++;
		}
	}

	for (const skill of CREW_SKILLS) {
		const target = path.join(SKILLS_DIR, skill);
		if (fs.existsSync(target)) {
			fs.rmSync(target, { recursive: true });
			removed++;
		}
	}

	console.log(removed > 0
		? `Removed ${removed} crew file(s) from ${AGENTS_DIR} and ${SKILLS_DIR}`
		: "Nothing to remove");
	process.exit(0);
}

// ─── Extension remove ────────────────────────────────────────────────────────

if (isRemove) {
	if (fs.existsSync(EXTENSION_DIR)) {
		fs.rmSync(EXTENSION_DIR, { recursive: true });
		console.log("Removed pi-messenger from " + EXTENSION_DIR);
	} else {
		console.log("pi-messenger is not installed");
	}
	process.exit(0);
}

// Already running from the extension dir (e.g. local dev)
if (path.resolve(PACKAGE_DIR) === path.resolve(EXTENSION_DIR)) {
	console.log(`Already installed at ${EXTENSION_DIR} (v${VERSION})`);
	process.exit(0);
}

const isUpdate = fs.existsSync(EXTENSION_DIR);

// Warn if existing install is a git clone from the old installer
if (isUpdate && fs.existsSync(path.join(EXTENSION_DIR, ".git"))) {
	console.log("Existing install is a git clone. Remove it first:\n");
	console.log("  npx pi-messenger --remove && npx pi-messenger");
	process.exit(1);
}

// Clean slate for updates so removed files don't linger between versions
if (isUpdate) {
	fs.rmSync(EXTENSION_DIR, { recursive: true });
}

const SKIP = new Set([".git", "node_modules", ".DS_Store"]);

function copyDir(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		if (SKIP.has(entry.name)) continue;
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDir(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

copyDir(PACKAGE_DIR, EXTENSION_DIR);

const action = isUpdate ? "Updated" : "Installed";
console.log(`${action} pi-messenger v${VERSION} → ${EXTENSION_DIR}

Tools:    pi_messenger
Commands: /messenger, /messenger config
Docs:     ${EXTENSION_DIR}/README.md`);
