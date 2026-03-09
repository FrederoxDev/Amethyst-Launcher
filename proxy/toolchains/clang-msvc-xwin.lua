-- Clang cross-compilation toolchain targeting x86_64-pc-windows-msvc
-- using xwin SDK/CRT headers and libs.
--
-- Usage:
--   xmake f --xwin=/path/to/xwin-cache/splat   (default: ~/.xwin-cache/splat)

toolchain("clang-msvc-xwin")
    set_kind("standalone")
    set_toolset("cc",  "clang")
    set_toolset("cxx", "clang++")
    set_toolset("ld",  "clang++")
    set_toolset("sh",  "clang++")
    set_toolset("ar",  "llvm-ar")

    on_check(function(toolchain)
        import("lib.detect.find_tool")
        local clang = find_tool("clang++")
        local lld   = find_tool("lld") or find_tool("ld.lld")
        return clang ~= nil and lld ~= nil
    end)

    on_load(function(toolchain)
        local xwin   = get_config("xwin") or path.join(os.getenv("HOME"), ".xwin-cache/splat")
        local triple = "--target=x86_64-pc-windows-msvc"

        toolchain:add("cxflags",  
            triple, 
            "-fms-compatibility", 
            "-fms-extensions",
            {force = true}
        )
        toolchain:add("ldflags",  triple, "-fuse-ld=lld", {force = true})
        toolchain:add("shflags",  triple, "-fuse-ld=lld", {force = true})

        toolchain:add("sysincludedirs",
            xwin .. "/sdk/include/um",
            xwin .. "/sdk/include/ucrt",
            xwin .. "/sdk/include/shared",
            xwin .. "/sdk/include/cppwinrt",
            xwin .. "/crt/include"
        )
        
        toolchain:add("linkdirs",
            xwin .. "/sdk/lib/um/x64",
            xwin .. "/sdk/lib/ucrt/x64",
            xwin .. "/crt/lib/x64"
        )
    end)
toolchain_end()
