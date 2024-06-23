#pragma once
#include <amethyst/Config.hpp>
#include <filesystem>
namespace fs = std::filesystem;

class AmethystProxy {
public:
	bool LoadLauncherConfig();
	bool GetRuntimePath(fs::path& outPath) const;

public:
	std::shared_ptr<Config> mConfig;
};