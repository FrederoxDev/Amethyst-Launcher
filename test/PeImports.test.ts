import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

type PeImportsModule = typeof import("../src/renderer/src/scripts/platform/windows/PeImports.ts");

(globalThis as { window?: unknown }).window = { require: createRequire(import.meta.url) };

const MODULE_URL = new URL("../src/renderer/src/scripts/platform/windows/PeImports.ts", import.meta.url).href;

let Pe: PeImportsModule = undefined as unknown as PeImportsModule;
let blocked = "";
try {
    Pe = await import(MODULE_URL) as PeImportsModule;
} catch (e) {
    blocked = `PeImports.ts cannot be loaded by node --test: ${(e as Error).message}`;
}
const gate = blocked ? { skip: blocked } : {};

const DOS_SIGNATURE = 0x5a4d;
const PE_SIGNATURE = 0x00004550;
const PE32PLUS_MAGIC = 0x20b;
const PE32_MAGIC = 0x10b;

const PE_OFFSET = 0x80;
const COFF_OFFSET = PE_OFFSET + 4;
const OPT_OFFSET = COFF_OFFSET + 20;
const SIZE_OF_OPTIONAL_HEADER = 240;
const SECTION_TABLE = OPT_OFFSET + SIZE_OF_OPTIONAL_HEADER;
const SECTION_HEADER_SIZE = 40;
const DESCRIPTOR_SIZE = 20;

const OPT_SECTION_ALIGNMENT = OPT_OFFSET + 32;
const OPT_FILE_ALIGNMENT = OPT_OFFSET + 36;
const OPT_SIZE_OF_IMAGE = OPT_OFFSET + 56;
const OPT_SIZE_OF_HEADERS = OPT_OFFSET + 60;
const OPT_CHECKSUM = OPT_OFFSET + 64;
const OPT_NUMBER_OF_RVA_AND_SIZES = OPT_OFFSET + 108;
const OPT_DATA_DIRECTORY = OPT_OFFSET + 112;

const FILE_ALIGNMENT = 0x200;
const SECTION_ALIGNMENT = 0x1000;

const IMPORT_DIR_RVA = 0x2000;
const IMPORT_DIR_SIZE = 3 * DESCRIPTOR_SIZE;
const IMAGE_SIZE = 0xa00;

interface FixtureSection {
    name: string;
    virtualAddress: number;
    virtualSize: number;
    rawPointer: number;
    rawSize: number;
}

const FIXTURE_SECTIONS: FixtureSection[] = [
    { name: ".text", virtualAddress: 0x1000, virtualSize: 0x200, rawPointer: 0x400, rawSize: 0x200 },
    { name: ".rdata", virtualAddress: 0x2000, virtualSize: 0x200, rawPointer: 0x600, rawSize: 0x200 },
    { name: ".data", virtualAddress: 0x3000, virtualSize: 0x200, rawPointer: 0x800, rawSize: 0x200 },
];

interface FixtureOptions {
    magic?: number;
    sizeOfHeaders?: number;
    importDirectoryRva?: number;
    importDirectorySize?: number;
    dataDirectoryCount?: number;
    overlay?: number;
}

/**
 * A minimal but self-consistent PE32+ image: DOS header, NT headers, three sections, and an
 * import table in .rdata naming KERNEL32.dll and USER32.dll.
 */
function buildImage(options: FixtureOptions = {}): Buffer {
    const image = Buffer.alloc(IMAGE_SIZE + (options.overlay ?? 0));

    image.writeUInt16LE(DOS_SIGNATURE, 0);
    image.writeUInt32LE(PE_OFFSET, 0x3c);
    image.writeUInt32LE(PE_SIGNATURE, PE_OFFSET);

    image.writeUInt16LE(0x8664, COFF_OFFSET);
    image.writeUInt16LE(FIXTURE_SECTIONS.length, COFF_OFFSET + 2);
    image.writeUInt16LE(SIZE_OF_OPTIONAL_HEADER, COFF_OFFSET + 16);
    image.writeUInt16LE(0x0022, COFF_OFFSET + 18);

    image.writeUInt16LE(options.magic ?? PE32PLUS_MAGIC, OPT_OFFSET);
    image.writeUInt32LE(SECTION_ALIGNMENT, OPT_SECTION_ALIGNMENT);
    image.writeUInt32LE(FILE_ALIGNMENT, OPT_FILE_ALIGNMENT);
    image.writeUInt32LE(0x4000, OPT_SIZE_OF_IMAGE);
    image.writeUInt32LE(options.sizeOfHeaders ?? 0x400, OPT_SIZE_OF_HEADERS);
    image.writeUInt32LE(0xdeadbeef, OPT_CHECKSUM);
    image.writeUInt32LE(options.dataDirectoryCount ?? 16, OPT_NUMBER_OF_RVA_AND_SIZES);

    image.writeUInt32LE(options.importDirectoryRva ?? IMPORT_DIR_RVA, OPT_DATA_DIRECTORY + 1 * 8);
    image.writeUInt32LE(options.importDirectorySize ?? IMPORT_DIR_SIZE, OPT_DATA_DIRECTORY + 1 * 8 + 4);
    image.writeUInt32LE(0x2180, OPT_DATA_DIRECTORY + 11 * 8);
    image.writeUInt32LE(8, OPT_DATA_DIRECTORY + 11 * 8 + 4);

    FIXTURE_SECTIONS.forEach((s, i) => {
        const at = SECTION_TABLE + i * SECTION_HEADER_SIZE;
        image.write(s.name, at, "ascii");
        image.writeUInt32LE(s.virtualSize, at + 8);
        image.writeUInt32LE(s.virtualAddress, at + 12);
        image.writeUInt32LE(s.rawSize, at + 16);
        image.writeUInt32LE(s.rawPointer, at + 20);
    });

    const rdata = 0x600;
    writeDescriptor(image, rdata + 0 * DESCRIPTOR_SIZE, 0x2080, 0x2100, 0x20a0);
    writeDescriptor(image, rdata + 1 * DESCRIPTOR_SIZE, 0x20c0, 0x2110, 0x20e0);
    image.write("KERNEL32.dll\0", rdata + 0x100, "ascii");
    image.write("USER32.dll\0", rdata + 0x110, "ascii");

    return image;
}

function writeDescriptor(image: Buffer, at: number, originalFirstThunk: number, nameRva: number, firstThunk: number): void {
    image.writeUInt32LE(originalFirstThunk, at);
    image.writeUInt32LE(nameRva, at + 12);
    image.writeUInt32LE(firstThunk, at + 16);
}

function writeImage(image: Buffer): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peimports-"));
    const file = path.join(dir, "Minecraft.Windows.exe");
    fs.writeFileSync(file, image);
    return file;
}

function fixture(options: FixtureOptions = {}): string {
    return writeImage(buildImage(options));
}

interface ReadLayout {
    numberOfSections: number;
    sizeOfImage: number;
    checksum: number;
    importRva: number;
    importSize: number;
    boundImportRva: number;
    boundImportSize: number;
    sections: FixtureSection[];
}

function readLayout(file: Buffer): ReadLayout {
    const numberOfSections = file.readUInt16LE(COFF_OFFSET + 2);
    const sections: FixtureSection[] = [];
    for (let i = 0; i < numberOfSections; i++) {
        const at = SECTION_TABLE + i * SECTION_HEADER_SIZE;
        const end = file.indexOf(0, at);
        sections.push({
            name: file.toString("ascii", at, Math.min(end === -1 ? at + 8 : end, at + 8)),
            virtualSize: file.readUInt32LE(at + 8),
            virtualAddress: file.readUInt32LE(at + 12),
            rawSize: file.readUInt32LE(at + 16),
            rawPointer: file.readUInt32LE(at + 20),
        });
    }
    return {
        numberOfSections,
        sizeOfImage: file.readUInt32LE(OPT_SIZE_OF_IMAGE),
        checksum: file.readUInt32LE(OPT_CHECKSUM),
        importRva: file.readUInt32LE(OPT_DATA_DIRECTORY + 1 * 8),
        importSize: file.readUInt32LE(OPT_DATA_DIRECTORY + 1 * 8 + 4),
        boundImportRva: file.readUInt32LE(OPT_DATA_DIRECTORY + 11 * 8),
        boundImportSize: file.readUInt32LE(OPT_DATA_DIRECTORY + 11 * 8 + 4),
        sections,
    };
}

function fileOffsetOf(layout: ReadLayout, rva: number): number {
    const section = layout.sections.find(
        s => rva >= s.virtualAddress && rva < s.virtualAddress + Math.max(s.virtualSize, s.rawSize)
    );
    assert.ok(section, `RVA 0x${rva.toString(16)} is not inside any section`);
    return section.rawPointer + (rva - section.virtualAddress);
}

/**
 * The PE checksum, accumulated into one wide total and folded at the end, so a fault in the
 * implementation's running fold cannot be mirrored here.
 */
function referenceChecksum(file: Buffer): number {
    const copy = Buffer.from(file);
    copy.writeUInt32LE(0, OPT_CHECKSUM);

    let total = 0;
    for (let i = 0; i + 1 < copy.length; i += 2) total += copy.readUInt16LE(i);
    if (copy.length % 2 === 1) total += copy[copy.length - 1];
    while (total > 0xffff) total = (total & 0xffff) + Math.floor(total / 0x10000);

    return (total + copy.length) >>> 0;
}

const DLL = "amethyst_preload.dll";
const FUNCTION = "AmethystEntry";

describe("reading a PE import table", gate, () => {
    it("names every DLL the image imports", () => {
        const exe = fixture();
        assert.equal(Pe.importsDll(exe, "KERNEL32.dll"), true);
        assert.equal(Pe.importsDll(exe, "USER32.dll"), true);
        assert.equal(Pe.importsDll(exe, DLL), false);
    });

    it("matches DLL names without regard to case", () => {
        const exe = fixture();
        assert.equal(Pe.importsDll(exe, "kernel32.DLL"), true);
    });

    it("reports an image with no import directory as importing nothing", () => {
        const exe = fixture({ importDirectoryRva: 0, importDirectorySize: 0 });
        assert.equal(Pe.importsDll(exe, "KERNEL32.dll"), false);
    });

    it("treats a data directory the image is too short to hold as absent", () => {
        const exe = fixture({ dataDirectoryCount: 1 });
        assert.equal(Pe.importsDll(exe, "KERNEL32.dll"), false);
    });

    it("refuses a file with no MZ signature", () => {
        const image = buildImage();
        image.writeUInt16LE(0x4141, 0);
        assert.throws(() => Pe.importsDll(writeImage(image), "KERNEL32.dll"), /no MZ signature/);
    });

    it("refuses a file with no PE signature", () => {
        const image = buildImage();
        image.writeUInt32LE(0, PE_OFFSET);
        assert.throws(() => Pe.importsDll(writeImage(image), "KERNEL32.dll"), /no PE signature/);
    });

    it("refuses a PE header offset outside the file", () => {
        const image = buildImage();
        image.writeUInt32LE(0, 0x3c);
        assert.throws(() => Pe.importsDll(writeImage(image), "KERNEL32.dll"), /implausible PE header offset/);
    });

    it("refuses a 32-bit image", () => {
        const exe = fixture({ magic: PE32_MAGIC });
        assert.throws(() => Pe.importsDll(exe, "KERNEL32.dll"), /only 64-bit/);
    });

    it("refuses a SizeOfHeaders that does not reach the optional header", () => {
        const exe = fixture({ sizeOfHeaders: 8 });
        assert.throws(() => Pe.importsDll(exe, "KERNEL32.dll"), /implausible SizeOfHeaders/);
    });

    it("refuses an import directory RVA that lies in no section", () => {
        const exe = fixture({ importDirectoryRva: 0x900000 });
        assert.throws(() => Pe.importsDll(exe, "KERNEL32.dll"), /is not inside any section/);
    });
});

describe("adding an import to a PE image", gate, () => {
    it("leaves the image importing the new DLL and every DLL it already imported", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION);

        assert.equal(Pe.importsDll(exe, DLL), true);
        assert.equal(Pe.importsDll(exe, "KERNEL32.dll"), true);
        assert.equal(Pe.importsDll(exe, "USER32.dll"), true);
    });

    it("adds exactly one section header", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION);

        const layout = readLayout(fs.readFileSync(exe));
        assert.equal(layout.numberOfSections, FIXTURE_SECTIONS.length + 1);
        assert.deepEqual(
            layout.sections.slice(0, FIXTURE_SECTIONS.length),
            FIXTURE_SECTIONS
        );
    });

    it("places the new section past the last one in both address spaces", () => {
        const exe = fixture();
        const result = Pe.addImport(exe, DLL, FUNCTION);

        const layout = readLayout(fs.readFileSync(exe));
        const added = layout.sections[FIXTURE_SECTIONS.length];

        assert.equal(added.name, ".amimp");
        assert.equal(added.virtualAddress, 0x4000);
        assert.equal(added.rawPointer, IMAGE_SIZE);
        assert.equal(added.rawSize % FILE_ALIGNMENT, 0);
        assert.equal(added.virtualAddress % SECTION_ALIGNMENT, 0);
        assert.equal(result.sectionRva, added.virtualAddress);
        assert.equal(result.bytesAppended, added.rawSize);
        assert.equal(result.dllName, DLL);
        assert.equal(result.functionName, FUNCTION);
    });

    it("honours a caller-chosen section name", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION, ".mine");

        assert.equal(readLayout(fs.readFileSync(exe)).sections[3].name, ".mine");
    });

    it("grows SizeOfImage to cover the new section", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION);

        const layout = readLayout(fs.readFileSync(exe));
        const added = layout.sections[FIXTURE_SECTIONS.length];
        const needed = added.virtualAddress + added.virtualSize;

        assert.equal(layout.sizeOfImage % SECTION_ALIGNMENT, 0);
        assert.ok(layout.sizeOfImage >= needed, `SizeOfImage ${layout.sizeOfImage} does not cover ${needed}`);
        assert.ok(layout.sizeOfImage - needed < SECTION_ALIGNMENT);
    });

    it("repoints the import directory at the copied descriptor array", () => {
        const exe = fixture();
        const result = Pe.addImport(exe, DLL, FUNCTION);
        const file = fs.readFileSync(exe);
        const layout = readLayout(file);

        assert.equal(layout.importRva, result.sectionRva);
        assert.equal(layout.importSize, 4 * DESCRIPTOR_SIZE);

        const base = fileOffsetOf(layout, layout.importRva);
        const original = buildImage();
        assert.deepEqual(
            file.subarray(base, base + 2 * DESCRIPTOR_SIZE),
            original.subarray(0x600, 0x600 + 2 * DESCRIPTOR_SIZE)
        );
    });

    it("terminates the descriptor array with a zeroed descriptor", () => {
        const exe = fixture();
        const file = fs.readFileSync(exe);
        Pe.addImport(exe, DLL, FUNCTION);

        const patched = fs.readFileSync(exe);
        const layout = readLayout(patched);
        const base = fileOffsetOf(layout, layout.importRva);
        const terminator = patched.subarray(base + 3 * DESCRIPTOR_SIZE, base + 4 * DESCRIPTOR_SIZE);

        assert.deepEqual(terminator, Buffer.alloc(DESCRIPTOR_SIZE));
        assert.notEqual(file.length, patched.length);
    });

    it("points the new descriptor's thunks at a hint/name entry for the function", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION);
        const file = fs.readFileSync(exe);
        const layout = readLayout(file);

        const ours = fileOffsetOf(layout, layout.importRva) + 2 * DESCRIPTOR_SIZE;
        const intRva = file.readUInt32LE(ours);
        const nameRva = file.readUInt32LE(ours + 12);
        const iatRva = file.readUInt32LE(ours + 16);

        assert.equal(file.readUInt32LE(ours + 4), 0);
        assert.equal(file.readUInt32LE(ours + 8), 0);

        const dllNameAt = fileOffsetOf(layout, nameRva);
        assert.equal(file.toString("ascii", dllNameAt, dllNameAt + DLL.length), DLL);
        assert.equal(file[dllNameAt + DLL.length], 0);

        const hintNameRva = file.readUInt32LE(fileOffsetOf(layout, intRva));
        assert.equal(file.readUInt32LE(fileOffsetOf(layout, iatRva)), hintNameRva);
        assert.equal(file.readUInt32LE(fileOffsetOf(layout, intRva) + 4), 0);

        const hintAt = fileOffsetOf(layout, hintNameRva);
        assert.equal(file.readUInt16LE(hintAt), 0);
        assert.equal(file.toString("ascii", hintAt + 2, hintAt + 2 + FUNCTION.length), FUNCTION);
        assert.equal(file[hintAt + 2 + FUNCTION.length], 0);
    });

    it("clears the bound import directory the old table's addresses belonged to", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION);

        const layout = readLayout(fs.readFileSync(exe));
        assert.equal(layout.boundImportRva, 0);
        assert.equal(layout.boundImportSize, 0);
    });

    it("leaves a checksum that validates over the whole patched file", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION);

        const file = fs.readFileSync(exe);
        assert.equal(file.length % 2, 0);
        assert.equal(readLayout(file).checksum, referenceChecksum(file));
    });

    it("carries the trailing byte of an odd-length image into the checksum", () => {
        const exe = fixture({ overlay: 0x501 });
        fs.writeFileSync(exe, Buffer.concat([fs.readFileSync(exe).subarray(0, IMAGE_SIZE), Buffer.alloc(0x501, 0xab)]));
        Pe.addImport(exe, DLL, FUNCTION);

        const file = fs.readFileSync(exe);
        assert.equal(file.length % 2, 1);
        assert.equal(readLayout(file).checksum, referenceChecksum(file));
    });

    it("refuses to add a DLL the image already imports", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION);
        const afterFirst = fs.readFileSync(exe);

        assert.throws(() => Pe.addImport(exe, DLL, FUNCTION), Pe.AlreadyImportedError);
        assert.deepEqual(fs.readFileSync(exe), afterFirst);
    });

    it("refuses to add a DLL the image already imports under different casing", () => {
        const exe = fixture();
        assert.throws(() => Pe.addImport(exe, "kernel32.DLL", FUNCTION), Pe.AlreadyImportedError);
    });

    it("names the DLL on the error that says it is already imported", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION);

        assert.throws(() => Pe.addImport(exe, DLL, FUNCTION), (e: unknown) => {
            assert.ok(e instanceof Pe.AlreadyImportedError);
            assert.equal(e.dllName, DLL);
            return true;
        });
    });

    it("refuses a section name longer than the eight bytes the header holds", () => {
        const exe = fixture();
        const before = fs.readFileSync(exe);

        assert.throws(() => Pe.addImport(exe, DLL, FUNCTION, ".toolonganame"), /exceeds 8 bytes/);
        assert.deepEqual(fs.readFileSync(exe), before);
    });

    it("refuses an image with no import directory to extend", () => {
        const exe = fixture({ importDirectoryRva: 0, importDirectorySize: 0 });
        const before = fs.readFileSync(exe);

        assert.throws(() => Pe.addImport(exe, DLL, FUNCTION), /no import directory to extend/);
        assert.deepEqual(fs.readFileSync(exe), before);
    });

    it("refuses an image whose headers have no room for another section header", () => {
        const exe = fixture({ sizeOfHeaders: 0x200 });
        const before = fs.readFileSync(exe);

        assert.throws(() => Pe.addImport(exe, DLL, FUNCTION), /no room for another section header/);
        assert.deepEqual(fs.readFileSync(exe), before);
    });

    it("survives being patched with a second, different DLL", () => {
        const exe = fixture();
        Pe.addImport(exe, DLL, FUNCTION);
        Pe.addImport(exe, "other_preload.dll", "OtherEntry", ".amimp2");

        const file = fs.readFileSync(exe);
        assert.equal(readLayout(file).numberOfSections, FIXTURE_SECTIONS.length + 2);
        assert.equal(readLayout(file).checksum, referenceChecksum(file));

        for (const name of ["KERNEL32.dll", "USER32.dll", DLL, "other_preload.dll"]) {
            assert.equal(Pe.importsDll(exe, name), true, `${name} is no longer imported`);
        }
    });
});
