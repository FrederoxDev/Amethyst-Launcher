import { ModConfig } from '../types/ModConfig'
import { Profile } from '../types/Profile'
import { LauncherConfig } from '../types/LauncherConfig'
import { MinecraftVersion, VersionType } from '../types/MinecraftVersion'
import { SemVersion } from '../types/SemVersion'
import {
	/** getAmethystFolder, getMinecraftUWPFolder, */ ensureDirectoryExists,
	getLauncherConfig,
	getLauncherFolder,
	getModsFolder,
} from '../versionSwitcher/AmethystPaths'
import { unzipSync } from 'fflate'

const fs = window.require('fs') as typeof import('fs')
const path = window.require('path') as typeof import('path')

type ModList = {
	runtimeMods: string[]
	mods: string[]
}

export function findAllMods(): ModList {
	const mods: ModList = {
		mods: [],
		runtimeMods: [],
	}

	const modsFolder = getModsFolder()
	if (!fs.existsSync(modsFolder)) return { mods: [], runtimeMods: [] }

	const allEntries = fs.readdirSync(modsFolder, { withFileTypes: true })

	for (const modEntry of allEntries) {
		const modName = modEntry.isDirectory()
			? modEntry.name
			: path.basename(modEntry.name, path.extname(modEntry.name))

		const itemPath = path.join(modsFolder, modEntry.name)
		let configData: ModConfig = {
			meta: {
				author: '',
				name: '',
				version: '',
			},
		}

		// The mod has no versioning in its name so continue
		if (!modName.includes('@')) continue

		// Ignore any folders without a mod.json file
		const modConfigPath = path.join(itemPath, 'mod.json')
		if (modEntry.isDirectory() && !fs.existsSync(modConfigPath)) continue

		// Read data from mod.json, if fails report to console
		try {
			let jsonData = ''

			if (modEntry.isDirectory()) {
				jsonData = fs.readFileSync(modConfigPath, 'utf-8')
			} else {
				const zipBuffer = fs.readFileSync(itemPath)
				const unzippedMod = unzipSync(new Uint8Array(zipBuffer))

				for (const [filePath, fileContent] of Object.entries(
					unzippedMod
				)) {
					if (filePath == 'mod.json') {
						jsonData = new TextDecoder().decode(fileContent)
					}
				}
			}

			configData = JSON.parse(jsonData)
		} catch {
			console.error(`Failed to read/parse the config for ${modName}`)
			continue
		}

		// This is a runtime mod!
		if (configData?.meta?.is_runtime) {
			mods.runtimeMods.push(modName)
		} else {
			mods.mods.push(modName)
		}
	}

	return mods
}

export function findAllProfiles(): Profile[] {
	const profilesFile = path.join(getLauncherFolder(), 'profiles.json')
	if (!fs.existsSync(profilesFile)) return []

	const jsonData = fs.readFileSync(profilesFile, 'utf-8')
	try {
		const profiles = JSON.parse(jsonData)
		return profiles
	} catch {
		return []
	}
}

export function saveAllProfiles(profiles: Profile[]) {
	const profilesFile = path.join(getLauncherFolder(), 'profiles.json')

	ensureDirectoryExists(profilesFile)
	fs.writeFileSync(profilesFile, JSON.stringify(profiles, undefined, 4))
}

export function saveLauncherConfig(config: LauncherConfig) {
	const configPath = getLauncherConfig()

	fs.mkdirSync(path.dirname(configPath), { recursive: true })
	fs.writeFileSync(configPath, JSON.stringify(config, undefined, 4))
}

export function readLauncherConfig(): LauncherConfig {
	const configPath = getLauncherConfig()
	let data: Partial<LauncherConfig> = {}

	try {
		const jsonData = fs.readFileSync(configPath, 'utf-8')
		data = JSON.parse(jsonData)
	} catch {}

	return {
		developer_mode: false,
		keep_open: true,
		mods: [],
		runtime: 'Vanilla',
		selected_profile: 0,
		ui_theme: 'System',
		...data,
	}
}

export async function getAllMinecraftVersions() {
	const versionCacheFile = path.join(
		getLauncherFolder(),
		'cached_versions.json'
	)
	ensureDirectoryExists(versionCacheFile)
	let lastWriteTime: Date = new Date(0)

	if (fs.existsSync(versionCacheFile)) {
		const fileInfo = fs.statSync(versionCacheFile)
		lastWriteTime = fileInfo.mtime
	}

	// Only fetch the data every hour
	const currentTime = new Date()
	const discardOldDataTime = new Date(currentTime.getTime() - 60 * 60 * 1000)

	console.log(
		lastWriteTime,
		discardOldDataTime,
		lastWriteTime < discardOldDataTime
	)

	if (lastWriteTime < discardOldDataTime) {
		console.log(
			'Fetching minecraft versions from https://raw.githubusercontent.com/AmethystAPI/Launcher-Data/main/versions.json.min'
		)
		const data = await fetch(
			'https://raw.githubusercontent.com/AmethystAPI/Launcher-Data/main/versions.json.min'
		)

		if (!data.ok) {
			throw new Error(
				'Failed to fetch minecraft version data from https://raw.githubusercontent.com/AmethystAPI/Launcher-Data/main/versions.json.min'
			)
		}

		fs.writeFileSync(versionCacheFile, await data.text())
	}

	const versionData = fs.readFileSync(versionCacheFile, 'utf-8')
	const rawJson = JSON.parse(versionData)
	const versions: MinecraftVersion[] = []

	for (const version of rawJson) {
		versions.push(
			new MinecraftVersion(
				SemVersion.fromString(version[0] as string),
				version[1],
				version[2] as unknown as VersionType
			)
		)
	}

	return versions
}
