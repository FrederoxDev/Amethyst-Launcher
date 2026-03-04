set_languages("c++23")
set_arch("x64")
set_project("dxgi")

target("dxgi")
    set_kind("shared")
    add_files("src/*.cpp")
    add_includedirs("src")
    add_links("user32", "windowsapp")