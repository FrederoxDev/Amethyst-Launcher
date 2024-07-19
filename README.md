# Amethyst Launcher

Launcher for Minecraft Bedrock mods created with AmethystAPI

## 📚 Getting Started

### **Requirements**

**OS**: Windows 10 (Minimum)\
**Other**: Minecraft Bedrock Edition

> [!IMPORTANT]
> Amethyst Launcher won't work if you do not own Minecraft Bedrock Edition

### Installation

1. Download the latest installer version from [releases](https://github.com/FrederoxDev/Amethyst-Launcher/releases/latest)
2. Run the installer and follow the installation steps
3. Start the launcher



## 🕹️ Usage

### Launching

You can launch the game from the **Launcher Page**, which can be accesssed by clicking on the **Crafting Table Icon** in the navigation bar.

To launch the game, click the **'Launch Game'** button.

To change the selected profile, click on the **'Profiles'** dropdown next to the **'Launch Game'** button, and select the desired one.

> [!NOTE]
> When launching, the launcher will search for the version specified by the selected profile. If no installed version is found, it will automatically install the sepcified version.

### Profiles

You can view and create profiles in the **Profile Manager**, which can be accessed by clicking on the **Chest Icon** in the navigation bar.

To create a new profile, click the **'Create New Profile'** button at the bottom of the **Profile Manager**.
You will then need to input your profile's name, and select the version and runtime that it uses. If you are using a modded runtime, then you can also select which mods the profile will use.

> #### Vanilla Profile Example:
> 
> **- Profile Name**: Vanilla 1.21\
> **- Minecraft Version**: 1.21.2.2\
> **- Runtime**: Vanilla

> #### Modded Profile Example:
> 
> **- Profile Name**: Amethyst 1.21\
> **- Minecraft Version**: 1.21.0.3\
> **- Runtime**: AmethystRuntime@1.3.1

To edit an existing profile, click on the desired profile in the **Profile Manager**, change the profile's settings and then click the **'Save Profile'** button, or if you want to delete the profile, click the **'Delete Profile'** button.

### Mods & Runtimes

You can view installed mods and runtimes in the **Mod Manager**, which can be accessed by clicking on the **Shulker Icon** in the navigation bar.

To import a new mod or runtime, you can either do it automatically or manually.

**Automatically:** Select the mod or runtime's `.zip` file, or unzipped folder, and drag it into the launcher.

**Manually:** Click the **'Open Mod Folder'** button at the bottom of the **Mod Manager**. This will open the launcher's mods folder in a new file explorer window.
Then, copy the mod's `.zip` file into the mods folder, and unzip it.

> [!IMPORTANT]
> Make sure your mods folder structure looks like this
> ```
> Mods
> └── AmethystRuntime
>     ├── File
>     ├── File
>     └── File
> ```
>
> and **NOT** this
> ```
> Mods
> └── AmethystRuntime
>     └── AmethystRuntime
>         ├── File
>         ├── File
>         └── File
> ```
> [!NOTE]
> Mods only support specific versions, and may not support the latest versions of minecraft.

### Versions

You can view currently installed versions in the **Version Manager**, which can be accessed by clicking on the **Portal Icon** in the navigation bar.

In the **Version Manager**, you can delete versions, view where they are installed, or view extra info about them.

> [!NOTE]
> Deleting a version will **NOT** remove the profiles that are using that version. This will only remove the installed version from your local storage device.