import sharp from 'sharp';
export async function losslessImage(input: Buffer): Promise<{bytes:Buffer;type:string}|null> {
  try {
    const meta = await sharp(input).metadata();
    // Preserve animated, HDR/high-bit-depth and color-managed originals unchanged.
    if (!['png','jpeg','webp'].includes(meta.format || '') || (meta.pages || 1) > 1 || meta.icc || (meta.orientation && meta.orientation !== 1) || meta.depth !== 'uchar' || !meta.width || !meta.height || meta.width * meta.height > 16000000) return null;
    if (meta.format === 'png') {
      for (let offset = 8; offset + 12 <= input.length;) {
        const length = input.readUInt32BE(offset);
        if (offset + 12 + length > input.length) break;
        if (input.toString('ascii',offset + 4,offset + 8) === 'acTL') return null;
        offset += length + 12;
      }
    }
    const original = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const candidates: {bytes:Buffer;type:string}[] = [];
    candidates.push({bytes:await sharp(input).webp({lossless:true,effort:4}).toBuffer(),type:'image/webp'});
    if (meta.format === 'png') candidates.push({bytes:await sharp(input).png({compressionLevel:9,adaptiveFiltering:true,palette:false}).toBuffer(),type:'image/png'});
    for (const candidate of candidates.sort((a,b)=>a.bytes.length-b.bytes.length)) {
      if (candidate.bytes.length >= input.length) continue;
      const decoded = await sharp(candidate.bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      if (decoded.info.width === original.info.width && decoded.info.height === original.info.height && decoded.data.equals(original.data)) return candidate;
    }
  } catch { /* Unsupported input keeps its original bytes. */ }
  return null;
}
