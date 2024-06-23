#include "AmethystProxy.hpp"
#include <amethyst/Utility.hpp>
#include <amethyst/Log.hpp>
#include <fstream>
#include <string.h>

bool AmethystProxy::LoadLauncherConfig()
{
    fs::path launcherConfigPath = GetAmethystFolder() / L"launcher_config.json";
    std::ifstream configStream(launcherConfigPath);

    // Check that the launcher_config.json file actually exists
    if (!configStream.good()) {
        Log::Error("[AmethystProxy] Failed to open '{}'", launcherConfigPath.string());
        return false;
    }

    // Read the configuration file and close file handle
    std::string configText((std::istreambuf_iterator<char>(configStream)), std::istreambuf_iterator<char>());
    configStream.close();

    // Parse the config file
    try {
        mConfig = std::make_shared<Config>(configText);
    }
    catch (const std::exception e) {
        Log::Error("[AmethystProxy] {}", e.what());
        return false;
    }

    return true;
}

bool AmethystProxy::GetRuntimePath(fs::path& outPath) const
{
    std::string versionedName = mConfig->injectedMod;

    // Split the name into raw name and version number
    size_t at = versionedName.find("@");

    if (at == std::string::npos) {
        Log::Error("[AmethystProxy] Invalid runtime name '{}', contains no versioning", versionedName);
        return false;
    }

    // Convert into the final path format
    std::string dllName = versionedName.substr(0, at) + ".dll";
    outPath = GetAmethystFolder() / L"mods" / versionedName / dllName;

    // Ensure that the path exists
    if (!fs::exists(outPath)) {
        Log::Error("[AmethystProxy] Failed to find '{}' while loading runtime '{}'", outPath.string(), versionedName);
        return false;
    }

    return true;
}
