if is_host("linux") then
    includes("toolchains/clang-msvc-xwin.lua")
end

set_languages("c++23")
set_arch("x64")
set_project("Amethyst-Preload")
set_plat("windows")

target("Amethyst-Preload")
    set_kind("shared")
    set_basename("Amethyst-Preload")
    add_files("src/*.cpp")
    add_includedirs("src")
    add_links("user32")
    if is_host("linux") then
        set_toolchains("clang-msvc-xwin")
    else
        set_toolchains("clang-cl")
    end
