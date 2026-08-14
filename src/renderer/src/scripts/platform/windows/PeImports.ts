/**
 * Reads and edits a PE image's import table.
 *
 * The launcher needs one DLL of its own loaded before a single instruction of game code runs.
 * A proxy named after a system DLL cannot do that: Windows resolves the dependencies of a
 * System32 module from System32, so a `dxgi.dll` sitting next to the game is never consulted
 * unless the process has package identity. A name Windows has never heard of, added to the
 * game's own import table, is resolved out of the application directory on every launch
 * however the process was started - which is what makes package identity, and the entitlement
 * it demands, unnecessary.
 */

const fs = window.require("fs") as typeof import("fs");

const DOS_SIGNATURE = 0x5a4d;
const PE_SIGNATURE = 0x00004550;
const PE32PLUS_MAGIC = 0x20b;

const DIR_IMPORT = 1;
const DIR_BOUND_IMPORT = 11;

const COFF_HEADER_SIZE = 20;
const SECTION_HEADER_SIZE = 40;
const DESCRIPTOR_SIZE = 20;
const THUNK_SIZE = 8;

const SCN_CNT_INITIALIZED_DATA = 0x00000040;
const SCN_MEM_READ = 0x40000000;
const SCN_MEM_WRITE = 0x80000000;

/** Offsets into the PE32+ optional header. */
const OPT_SECTION_ALIGNMENT = 32;
const OPT_FILE_ALIGNMENT = 36;
const OPT_SIZE_OF_IMAGE = 56;
const OPT_SIZE_OF_HEADERS = 60;
const OPT_CHECKSUM = 64;
const OPT_NUMBER_OF_RVA_AND_SIZES = 108;
const OPT_DATA_DIRECTORY = 112;

interface Section {
    virtualAddress: number;
    virtualSize: number;
    rawPointer: number;
    rawSize: number;
}

interface Layout {
    peOffset: number;
    optOffset: number;
    sectionTableOffset: number;
    numberOfSections: number;
    sectionAlignment: number;
    fileAlignment: number;
    sizeOfImage: number;
    sizeOfHeaders: number;
    dataDirectoryCount: number;
    sections: Section[];
}

export class PeFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PeFormatError";
    }
}

function align(value: number, to: number): number {
    return Math.ceil(value / to) * to;
}

/**
 * Only the headers are read. The image itself runs to hundreds of megabytes, and every question
 * asked here is answered by the first few kilobytes of it.
 */
function readHeaders(fd: number): Buffer {
    const probe = Buffer.alloc(0x400);
    fs.readSync(fd, probe, 0, probe.length, 0);

    if (probe.readUInt16LE(0) !== DOS_SIGNATURE) throw new PeFormatError("not a PE image: no MZ signature");

    const peOffset = probe.readUInt32LE(0x3c);
    if (peOffset <= 0 || peOffset > 0x10000000) throw new PeFormatError(`implausible PE header offset ${peOffset}`);

    const headerProbe = Buffer.alloc(peOffset + 0x200);
    fs.readSync(fd, headerProbe, 0, headerProbe.length, 0);
    if (headerProbe.readUInt32LE(peOffset) !== PE_SIGNATURE) throw new PeFormatError("not a PE image: no PE signature");

    const optOffset = peOffset + 4 + COFF_HEADER_SIZE;
    const sizeOfHeaders = headerProbe.readUInt32LE(optOffset + OPT_SIZE_OF_HEADERS);
    if (sizeOfHeaders < optOffset || sizeOfHeaders > 0x10000000) {
        throw new PeFormatError(`implausible SizeOfHeaders ${sizeOfHeaders}`);
    }

    const headers = Buffer.alloc(sizeOfHeaders);
    fs.readSync(fd, headers, 0, sizeOfHeaders, 0);
    return headers;
}

function parse(headers: Buffer): Layout {
    const peOffset = headers.readUInt32LE(0x3c);
    const coffOffset = peOffset + 4;
    const optOffset = coffOffset + COFF_HEADER_SIZE;

    if (headers.readUInt16LE(optOffset) !== PE32PLUS_MAGIC) {
        throw new PeFormatError("only 64-bit (PE32+) images are supported");
    }

    const numberOfSections = headers.readUInt16LE(coffOffset + 2);
    const sizeOfOptionalHeader = headers.readUInt16LE(coffOffset + 16);
    const sectionTableOffset = optOffset + sizeOfOptionalHeader;

    const sections: Section[] = [];
    for (let i = 0; i < numberOfSections; i++) {
        const at = sectionTableOffset + i * SECTION_HEADER_SIZE;
        sections.push({
            virtualSize: headers.readUInt32LE(at + 8),
            virtualAddress: headers.readUInt32LE(at + 12),
            rawSize: headers.readUInt32LE(at + 16),
            rawPointer: headers.readUInt32LE(at + 20),
        });
    }

    return {
        peOffset,
        optOffset,
        sectionTableOffset,
        numberOfSections,
        sectionAlignment: headers.readUInt32LE(optOffset + OPT_SECTION_ALIGNMENT),
        fileAlignment: headers.readUInt32LE(optOffset + OPT_FILE_ALIGNMENT),
        sizeOfImage: headers.readUInt32LE(optOffset + OPT_SIZE_OF_IMAGE),
        sizeOfHeaders: headers.readUInt32LE(optOffset + OPT_SIZE_OF_HEADERS),
        dataDirectoryCount: headers.readUInt32LE(optOffset + OPT_NUMBER_OF_RVA_AND_SIZES),
        sections,
    };
}

function directory(headers: Buffer, layout: Layout, index: number): { rva: number; size: number } {
    if (index >= layout.dataDirectoryCount) return { rva: 0, size: 0 };
    const at = layout.optOffset + OPT_DATA_DIRECTORY + index * 8;
    return { rva: headers.readUInt32LE(at), size: headers.readUInt32LE(at + 4) };
}

function setDirectory(headers: Buffer, layout: Layout, index: number, rva: number, size: number): void {
    const at = layout.optOffset + OPT_DATA_DIRECTORY + index * 8;
    headers.writeUInt32LE(rva, at);
    headers.writeUInt32LE(size, at + 4);
}

function toFileOffset(layout: Layout, rva: number): number {
    for (const s of layout.sections) {
        if (rva >= s.virtualAddress && rva < s.virtualAddress + Math.max(s.virtualSize, s.rawSize)) {
            return s.rawPointer + (rva - s.virtualAddress);
        }
    }
    throw new PeFormatError(`RVA 0x${rva.toString(16)} is not inside any section`);
}

function readCString(fd: number, offset: number): string {
    const chunk = Buffer.alloc(256);
    const read = fs.readSync(fd, chunk, 0, chunk.length, offset);
    const end = chunk.indexOf(0);
    return chunk.toString("ascii", 0, end === -1 ? read : end);
}

/** Names only. The thunks are never needed to answer "is our DLL already in here". */
export function readImportedDlls(exePath: string): string[] {
    const fd = fs.openSync(exePath, "r");
    try {
        const headers = readHeaders(fd);
        const layout = parse(headers);
        const dir = directory(headers, layout, DIR_IMPORT);
        if (dir.rva === 0) return [];

        const names: string[] = [];
        const base = toFileOffset(layout, dir.rva);
        const descriptor = Buffer.alloc(DESCRIPTOR_SIZE);

        for (let i = 0; i < 4096; i++) {
            fs.readSync(fd, descriptor, 0, DESCRIPTOR_SIZE, base + i * DESCRIPTOR_SIZE);
            const originalFirstThunk = descriptor.readUInt32LE(0);
            const nameRva = descriptor.readUInt32LE(12);
            const firstThunk = descriptor.readUInt32LE(16);
            if (originalFirstThunk === 0 && nameRva === 0 && firstThunk === 0) break;
            if (nameRva !== 0) names.push(readCString(fd, toFileOffset(layout, nameRva)));
        }
        return names;
    } finally {
        fs.closeSync(fd);
    }
}

export function importsDll(exePath: string, dllName: string): boolean {
    const wanted = dllName.toLowerCase();
    return readImportedDlls(exePath).some(name => name.toLowerCase() === wanted);
}

/**
 * Ones-complement sum over the whole image with the checksum field itself read as zero, plus the
 * file length. Streamed: the image is far too large to hold in the renderer's heap, and this is
 * the only step that has to look at all of it.
 */
function computeChecksum(fd: number, fileSize: number, checksumOffset: number): number {
    const CHUNK = 1 << 20;
    const buffer = Buffer.alloc(CHUNK);
    let sum = 0;
    let position = 0;
    let carry = -1;

    while (position < fileSize) {
        const read = fs.readSync(fd, buffer, 0, Math.min(CHUNK, fileSize - position), position);
        if (read <= 0) break;

        // The stored checksum does not take part in its own calculation.
        for (let i = 0; i < 4; i++) {
            const at = checksumOffset + i - position;
            if (at >= 0 && at < read) buffer[at] = 0;
        }

        let i = 0;
        if (carry !== -1) {
            sum += carry | (buffer[0] << 8);
            sum = (sum & 0xffff) + (sum >>> 16);
            carry = -1;
            i = 1;
        }
        for (; i + 1 < read; i += 2) {
            sum += buffer.readUInt16LE(i);
            sum = (sum & 0xffff) + (sum >>> 16);
        }
        if (i < read) carry = buffer[i];

        position += read;
    }

    if (carry !== -1) {
        sum += carry;
        sum = (sum & 0xffff) + (sum >>> 16);
    }

    return (sum + fileSize) >>> 0;
}

export interface PatchResult {
    dllName: string;
    functionName: string;
    sectionRva: number;
    bytesAppended: number;
}

/**
 * Appends an import of `dllName!functionName` and repoints the import directory at the copy.
 *
 * The descriptor array is copied rather than extended in place: it is packed against its
 * neighbours in every real image, so there is nowhere to grow it. Everything the loader needs -
 * the descriptors, the thunks, the names - goes into one new section at the end of the file, so
 * the hundreds of megabytes of code and data in between are never rewritten.
 */
export function addImport(exePath: string, dllName: string, functionName: string, sectionName = ".amimp"): PatchResult {
    if (Buffer.byteLength(sectionName, "ascii") > 8)
        throw new PeFormatError(`section name "${sectionName}" exceeds 8 bytes`);

    const fd = fs.openSync(exePath, "r+");
    try {
        const headers = readHeaders(fd);
        const layout = parse(headers);

        const spaceNeeded = layout.sectionTableOffset + (layout.numberOfSections + 1) * SECTION_HEADER_SIZE;
        if (spaceNeeded > layout.sizeOfHeaders) {
            throw new PeFormatError(
                `no room for another section header: needs ${spaceNeeded} bytes but SizeOfHeaders is ${layout.sizeOfHeaders}`
            );
        }

        const existing = directory(headers, layout, DIR_IMPORT);
        if (existing.rva === 0) throw new PeFormatError("image has no import directory to extend");

        const descriptorBase = toFileOffset(layout, existing.rva);
        const originalDescriptors: Buffer[] = [];
        const scratch = Buffer.alloc(DESCRIPTOR_SIZE);
        for (let i = 0; i < 4096; i++) {
            fs.readSync(fd, scratch, 0, DESCRIPTOR_SIZE, descriptorBase + i * DESCRIPTOR_SIZE);
            if (scratch.readUInt32LE(0) === 0 && scratch.readUInt32LE(12) === 0 && scratch.readUInt32LE(16) === 0)
                break;
            originalDescriptors.push(Buffer.from(scratch));
        }

        // Everything below is laid out relative to the new section, so its RVAs are known before
        // a byte is written.
        const descriptorCount = originalDescriptors.length + 2;
        const descriptorBytes = descriptorCount * DESCRIPTOR_SIZE;
        const intOffset = descriptorBytes;
        const iatOffset = intOffset + THUNK_SIZE * 2;
        const hintNameOffset = iatOffset + THUNK_SIZE * 2;
        const hintNameBytes = align(2 + Buffer.byteLength(functionName, "ascii") + 1, 2);
        const dllNameOffset = hintNameOffset + hintNameBytes;
        const dllNameBytes = Buffer.byteLength(dllName, "ascii") + 1;
        const payloadSize = dllNameOffset + dllNameBytes;

        const sectionRva = align(
            layout.sections.reduce((max, s) => Math.max(max, s.virtualAddress + s.virtualSize), 0),
            layout.sectionAlignment
        );
        const rawPointer = align(
            layout.sections.reduce((max, s) => Math.max(max, s.rawPointer + s.rawSize), layout.sizeOfHeaders),
            layout.fileAlignment
        );
        const rawSize = align(payloadSize, layout.fileAlignment);

        const payload = Buffer.alloc(rawSize);
        originalDescriptors.forEach((d, i) => d.copy(payload, i * DESCRIPTOR_SIZE));

        const ours = originalDescriptors.length * DESCRIPTOR_SIZE;
        payload.writeUInt32LE(sectionRva + intOffset, ours + 0);
        payload.writeUInt32LE(0, ours + 4);
        payload.writeUInt32LE(0, ours + 8);
        payload.writeUInt32LE(sectionRva + dllNameOffset, ours + 12);
        payload.writeUInt32LE(sectionRva + iatOffset, ours + 16);
        // The terminating descriptor is already zeroed by Buffer.alloc.

        payload.writeUInt32LE(sectionRva + hintNameOffset, intOffset);
        payload.writeUInt32LE(sectionRva + hintNameOffset, iatOffset);
        payload.write(functionName, hintNameOffset + 2, "ascii");
        payload.write(dllName, dllNameOffset, "ascii");

        // Built before anything is written, so a rejected field cannot leave the image with an
        // appended payload no section header describes.
        const header = Buffer.alloc(SECTION_HEADER_SIZE);
        header.write(sectionName, 0, "ascii");
        header.writeUInt32LE(payloadSize, 8);
        header.writeUInt32LE(sectionRva, 12);
        header.writeUInt32LE(rawSize, 16);
        header.writeUInt32LE(rawPointer, 20);
        // Coerced unsigned: the write bit makes the OR a negative int32 in JavaScript.
        header.writeUInt32LE((SCN_CNT_INITIALIZED_DATA | SCN_MEM_READ | SCN_MEM_WRITE) >>> 0, 36);

        fs.writeSync(fd, payload, 0, rawSize, rawPointer);
        header.copy(headers, layout.sectionTableOffset + layout.numberOfSections * SECTION_HEADER_SIZE);

        headers.writeUInt16LE(layout.numberOfSections + 1, layout.peOffset + 4 + 2);
        headers.writeUInt32LE(
            align(sectionRva + payloadSize, layout.sectionAlignment),
            layout.optOffset + OPT_SIZE_OF_IMAGE
        );
        setDirectory(headers, layout, DIR_IMPORT, sectionRva, descriptorBytes);

        // Bound imports record addresses that were true of the old table, and the loader trusts
        // them over the descriptors it would otherwise walk.
        setDirectory(headers, layout, DIR_BOUND_IMPORT, 0, 0);

        headers.writeUInt32LE(0, layout.optOffset + OPT_CHECKSUM);
        fs.writeSync(fd, headers, 0, headers.length, 0);

        const checksumOffset = layout.optOffset + OPT_CHECKSUM;
        const checksum = computeChecksum(fd, fs.fstatSync(fd).size, checksumOffset);
        const field = Buffer.alloc(4);
        field.writeUInt32LE(checksum, 0);
        fs.writeSync(fd, field, 0, 4, checksumOffset);

        fs.fsyncSync(fd);

        return { dllName, functionName, sectionRva, bytesAppended: rawSize };
    } finally {
        fs.closeSync(fd);
    }
}
