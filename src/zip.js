const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return value;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

// PNGs are already compressed. Store these small archives without recompressing them.
export async function createZip(files) {
  const encoder = new globalThis.TextEncoder();
  const localParts = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  for (const { name, blob } of files) {
    const filename = encoder.encode(name);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const checksum = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x800, true); // UTF-8 filename
    local.setUint16(12, 33, true); // 1980-01-01, the earliest ZIP date
    local.setUint32(14, checksum, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, filename.length, true);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    new Uint8Array(central.buffer, 6, 26).set(new Uint8Array(local.buffer, 4, 26));
    central.setUint32(42, offset, true);
    localParts.push(local.buffer, filename, bytes);
    directory.push(central.buffer, filename);
    offset += local.byteLength + filename.length + bytes.length;
    directorySize += central.byteLength + filename.length;
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...localParts, ...directory, end.buffer], { type: 'application/zip' });
}
