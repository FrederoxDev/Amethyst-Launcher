if is_host("linux") then
    includes("toolchains/clang-msvc-xwin.lua")
end

set_languages("c++23")
set_arch("x64")
set_project("dxgi")
set_plat("windows")

target("dxgi")
    set_kind("shared")
    add_files("src/*.cpp")
    add_includedirs("src")
    add_links("user32", "windowsapp")
    if is_host("linux") then
        set_toolchains("clang-msvc-xwin")
    end