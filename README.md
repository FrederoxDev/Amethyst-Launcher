# Step-by-step Guide on how to install Amethyst with mods

**Requirements:**
* Windows OS
* Minecraft Bedrock Edition

\- If you already have Minecraft installed and have run the game at least once, make sure Minecraft is closed.  
\- If you do not have Minecraft installed, install it, run the game at least once, and close it.  

**Amethyst Launcher:**
* Download the latest **Amethyst.Launcher.Setup.biggest.version.number.exe** file from here: https://github.com/FrederoxDev/Amethyst-Launcher/releases/
* Run the .exe and go through the installation steps
* If the launcher is not already opened, open it
* Click the **furnace icon** on the left sidebar, then click **Create New Profile**
* The values in the input boxes should be set as follows:  
**\- Profile Name:** The name of the profile (Just pick whatever you want)  
**\- Minecraft Version:** The latest Minecraft version that Amethyst supports (Currently 1.21.0.3. **This may change**)  
**\- Runtime:** "Vanilla"  
* Click **Save Profile**, then click the **crafting table icon** on the left sidebar
* Verify that under **Profile** (in the bottom left corner), the profile you just made is selected
* Click **Launch Game**. Amethyst is going to do it's thing. Don't touch anything. I wouldn't even recommend you move your mouse (Unless it's to stop the computer from falling asleep). Amethyst can be very finicky at this stage.  
NOTE: When Minecraft launches, a black console will also open named **AmethystAPI**. Do not close this. It will also close Minecraft if you do.
* After a few minutes, Minecraft should launch. If long enough has passed and Amethyst has not done anything, and there are no loading bars or errors on the screen, press **Launch Game** again. Minecraft should now be open. Verify that the version number matches the version number chosen in your profile.
* Now close Minecraft again. It's time to load in some mods.

**Mods:**
* Download the latest **`AmethystRuntime@biggest.version.number.zip`** file from here: https://github.com/FrederoxDev/Amethyst/releases/
* Open Amethyst, Click on the **wrench icon** on the left sidebar, then click **Open Mods Folder**
* Move the **AmethystRuntime.zip** file you just downloaded to that folder
* Select it, and click **Extract All** on the top menu bar of file explorer
* In the same mods folder, deleted the old **AmethystRuntime.zip**. You won't need it anymore.  
NOTE: **Do not change** the names of any of the folders in the mods folder. This will make the Amethyst Launcher unable to detect the mods
* Make sure that when you open the folder for the mod you just extracted, you immediately see three files, and there are no other layers to the folder. For example:
  
**\>Mods  
    &emsp;\> AmethystRuntime  
         &emsp;&emsp;\> AmethystRuntime  
              &emsp;&emsp;&emsp;\> File  
              &emsp;&emsp;&emsp;\> File  
              &emsp;&emsp;&emsp;\> File**  
              
Is BAD, but 

**\>Mods  
    &emsp;\> AmethystRuntime  
         &emsp;&emsp;\> File  
         &emsp;&emsp;\> File  
         &emsp;&emsp;\> File**  
         
Is GOOD

* If there is an extra layer that shouldn't be there, remove it
* Repeat the **Mods** section of this guide for any other mods you want, but instead of **AmethystRuntime**,  use any of the mods on this page: https://github.com/FrederoxDev/Amethyst. Just make sure that you use the **Releases** button on the right side of the mod's github page to download the latest working .zip file.  
NOTE: Not all mods will be updated to work with the latest runtime and/or Minecraft version

**Loading the Mods:**  
* Now that you have all the mods you want installed into the **mods folder**, reboot the Amethyst Launcher (Close and open it again).
* Click the **furnace icon** on the left sidebar, then click **the profile you made earlier**
* Now click the **runtime dropdown** and select **`AmethystRuntime@version.number`**
* A new UI should appear with **Active Mods** and **Inactive Mods** boxes.
* In the **Inactive Mods** box, click on **all the mods you want to use**. They should now appear in the **Active Mods** box.
* Now click **Save Profile**, then click the **crafting table icon**
* Verify one more time that the **correct profile is selected in the bottom left corner**, and click **Launch Game**
* Minecraft should now launch... **with mods!**
* Anytime you want to change what mods are active, what runtime is being used, or what version of Minecraft is active, you will need to use the Amethyst Launcher. Otherwise, you can launch Minecraft like you normally do, and the last used profile will be used automatically.

# Amethyst Launcher (Windows)

This is the launcher for using Amethyst on Windows
